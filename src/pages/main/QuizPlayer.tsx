import { useRef, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { judgeAnswerWithLlm, preloadLocalLlm } from '../../lib/localLlm';
import { searchImages } from '../../lib/imageSearch';
import type { ImageSearchResult } from '../../lib/imageSearch';

interface QuizAnswer {
    text: string;
    image: string;
    correct: boolean;
}

interface Quiz {
    quizName: string;
    questionType: string;
    question: string;
    questionImage: string;
    webSearch: string;
    answerType: string;
    inputAnswerType: string;
    inputAnswer: string;
    category: string;
    answers: any[];
}

interface QuizPlayerProps {
    quizzes: Quiz[];
    externalBasePath: string;
    onExit: () => void;
}

function normalizeAnswers(raw: any[]): QuizAnswer[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((a) => {
        if (typeof a === 'string') return { text: a, image: '', correct: false };
        return { text: a?.text ?? '', image: a?.image ?? '', correct: !!a?.correct };
    });
}

function resolveImageSrc(path: string, externalBasePath: string) {
    if (path.startsWith('file://') || path.startsWith('http')) {
        return Capacitor.convertFileSrc(path);
    }
    return Capacitor.convertFileSrc(`${externalBasePath}/${path.replace(/^\//, '')}`);
}

// Per-image swipe-browse state, purely for viewing extra reference pictures.
// index -1 means "showing the quiz's actual image"; index 0..N-1 means
// "showing candidates[index]" (a DuckDuckGo result, shown as a clue, never saved).
interface ImageBrowseState {
    candidates: ImageSearchResult[];
    index: number;
    loading: boolean;
    error: string | null;
}

const EMPTY_BROWSE_STATE: ImageBrowseState = { candidates: [], index: -1, loading: false, error: null };
const SWIPE_THRESHOLD_PX = 40;

// Target of an image slot: the question image, or one answer's image by index.
type ImageTarget = 'question' | number;

function targetKey(target: ImageTarget): string {
    return target === 'question' ? 'question' : `answer-${target}`;
}

export default function QuizPlayer({ quizzes, externalBasePath, onExit }: QuizPlayerProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [correctCount, setCorrectCount] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const [isJudging, setIsJudging] = useState(false);
    const [showResult, setShowResult] = useState(false);
    const [lastAnswerCorrect, setLastAnswerCorrect] = useState(false);
    const [showingAnswer, setShowingAnswer] = useState(false);
    const [revealedCorrectIndex, setRevealedCorrectIndex] = useState<number | null>(null);

    const [imageBrowse, setImageBrowse] = useState<Record<string, ImageBrowseState>>({});
    const dragStartXRef = useRef<number | null>(null);

    const currentQuiz = quizzes[currentIndex];
    const answers = normalizeAnswers(currentQuiz?.answers ?? []);
    const searchQuery = currentQuiz?.webSearch?.trim() ?? '';

    useEffect(() => {
        preloadLocalLlm().catch((e) => console.error('Failed to preload local LLM:', e));
    }, []);

    // Reset swipe-browse state whenever the current question changes.
    useEffect(() => {
        setImageBrowse({});
    }, [currentIndex]);

    function resetForNextQuestion() {
        setSelectedAnswerIndex(null);
        setInputValue('');
        setShowingAnswer(false);
        setRevealedCorrectIndex(null);
    }

    function isConfirmEnabled() {
        if (!currentQuiz) return false;
        if (currentQuiz.answerType === 'Input') {
            return inputValue.trim() !== '';
        }
        return selectedAnswerIndex !== null;
    }

    async function handleConfirm() {
        if (!currentQuiz || !isConfirmEnabled() || isJudging) return;

        let isCorrect = false;
        if (currentQuiz.answerType === 'Input') {
            setIsJudging(true);
            try {
                isCorrect = await judgeAnswerWithLlm(
                    currentQuiz.question,
                    currentQuiz.inputAnswer ?? '',
                    inputValue.trim()
                );
            } catch (e) {
                console.error('Local LLM judging failed, falling back to exact match:', e);
                const expected = (currentQuiz.inputAnswer ?? '').trim().toLowerCase();
                const actual = inputValue.trim().toLowerCase();
                isCorrect = expected !== '' && expected === actual;
            } finally {
                setIsJudging(false);
            }
        } else if (selectedAnswerIndex !== null) {
            isCorrect = !!answers[selectedAnswerIndex]?.correct;
        }

        if (isCorrect) {
            setCorrectCount((prev) => prev + 1);
        }
        setLastAnswerCorrect(isCorrect);
        setShowingAnswer(false);
        setShowResult(true);
    }

    function handleShowAnswer() {
        if (!currentQuiz || isJudging) return;
        const correctIndex = answers.findIndex((answer) => answer.correct);
        if (correctIndex !== -1 && currentQuiz.answerType !== 'Input') {
            setRevealedCorrectIndex(correctIndex);
        }
        setLastAnswerCorrect(false);
        setShowingAnswer(true);
        setShowResult(true);
    }

    function handleNext() {
        setShowResult(false);
        if (currentIndex + 1 >= quizzes.length) {
            setIsFinished(true);
        } else {
            setCurrentIndex((prev) => prev + 1);
            resetForNextQuestion();
        }
    }

    function getBrowseState(key: string): ImageBrowseState {
        return imageBrowse[key] ?? EMPTY_BROWSE_STATE;
    }

    function updateBrowseState(key: string, updater: (prev: ImageBrowseState) => ImageBrowseState) {
        setImageBrowse((prevMap) => ({
            ...prevMap,
            [key]: updater(prevMap[key] ?? EMPTY_BROWSE_STATE),
        }));
    }

    async function handleSwipe(key: string, direction: 'next' | 'prev') {
        if (!searchQuery) return;
        const current = getBrowseState(key);
        if (current.loading) return;

        if (current.candidates.length === 0) {
            updateBrowseState(key, (prev) => ({ ...prev, loading: true, error: null }));
            try {
                const results = await searchImages(searchQuery);
                updateBrowseState(key, (prev) => ({
                    ...prev,
                    candidates: results,
                    index: results.length > 0 ? 0 : -1,
                    loading: false,
                    error: results.length === 0 ? 'No extra pictures found.' : null,
                }));
            } catch (e) {
                console.error('Image search failed:', e);
                updateBrowseState(key, (prev) => ({ ...prev, loading: false, error: 'Search failed. Check your connection.' }));
            }
            return;
        }

        updateBrowseState(key, (prev) => {
            let newIndex = prev.index + (direction === 'next' ? 1 : -1);
            if (newIndex < -1) newIndex = prev.candidates.length - 1;
            if (newIndex > prev.candidates.length - 1) newIndex = -1;
            return { ...prev, index: newIndex };
        });
    }

    function getEventX(e: React.TouchEvent | React.MouseEvent): number {
        if ('changedTouches' in e && e.changedTouches.length > 0) {
            return e.changedTouches[0].clientX;
        }
        return (e as React.MouseEvent).clientX;
    }

    function handleDragStart(e: React.TouchEvent | React.MouseEvent) {
        if (!searchQuery) return;
        dragStartXRef.current = getEventX(e);
    }

    function handleDragEnd(e: React.TouchEvent | React.MouseEvent, key: string) {
        if (!searchQuery || dragStartXRef.current === null) return;
        const delta = getEventX(e) - dragStartXRef.current;
        dragStartXRef.current = null;
        if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
        void handleSwipe(key, delta < 0 ? 'next' : 'prev');
    }

    function renderImageOverlay(target: ImageTarget) {
        const key = targetKey(target);
        const state = getBrowseState(key);
        const browsingCandidate = state.index !== -1 && state.candidates[state.index];

        return (
            <>
                {state.loading && <div style={overlayCenterStyle}>Searching…</div>}
                {!state.loading && state.error && <div style={overlayCenterStyle}>{state.error}</div>}
                {browsingCandidate && !state.loading && (
                    <div style={{ position: "absolute", bottom: "4px", left: 0, right: 0, textAlign: "center" }}>
                        <span style={{ fontSize: "11px", color: "white", background: "rgba(0,0,0,0.6)", padding: "2px 6px", borderRadius: "4px" }}>
                            Extra picture {state.index + 1} / {state.candidates.length}
                        </span>
                    </div>
                )}
                {searchQuery && !state.loading && !browsingCandidate && !state.error && (
                    <div style={{ position: "absolute", bottom: "4px", left: 0, right: 0, textAlign: "center", fontSize: "11px", color: "rgba(255,255,255,0.7)" }}>
                        ↔ Swipe to see more pictures
                    </div>
                )}
            </>
        );
    }

    // Shows full-resolution candidate images (rather than thumbnails), since the
    // point here is spotting details/angles, not a fast picker — worth the extra load time.
    function getDisplayedSrc(target: ImageTarget, originalPath: string): string {
        const key = targetKey(target);
        const state = getBrowseState(key);
        if (state.index !== -1 && state.candidates[state.index]) {
            return state.candidates[state.index].image;
        }
        return originalPath ? resolveImageSrc(originalPath, externalBasePath) : '';
    }

    if (quizzes.length === 0) {
        return (
            <div style={{ display: "flex", flexDirection: "column", flex: "1", gap: "10px", padding: "10px" }}>
                <div style={{ color: "white" }}>No quizzes to play.</div>
                <button onClick={onExit}>Exit</button>
            </div>
        );
    }

    if (isFinished) {
        return (
            <div style={{ display: "flex", flexDirection: "column", flex: "1", gap: "15px", padding: "10px", alignItems: "center", justifyContent: "center" }}>
                <h2 style={{ color: "white" }}>Quiz complete</h2>
                <div style={{ color: "white" }}>
                    {correctCount} / {quizzes.length} correct
                </div>
                <button onClick={onExit}>Exit</button>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", flex: "1", minHeight: 0, gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 15px" }}>
                <div style={{ color: "white" }}>
                    {currentIndex + 1} / {quizzes.length}
                </div>
                <button style={{ backgroundColor: "#e74c3c", color: "white" }} onClick={onExit}>
                    Exit
                </button>
            </div>

            <div style={{ padding: "0 15px" }}>
                <textarea
                    readOnly
                    style={{ height: "15vh", width: "100%", resize: "none", boxSizing: "border-box" }}
                    value={currentQuiz.question}
                />
            </div>

            {currentQuiz.questionType === 'Question + Image' && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                    <div
                        onTouchStart={handleDragStart}
                        onTouchEnd={(e) => handleDragEnd(e, targetKey('question'))}
                        onMouseDown={handleDragStart}
                        onMouseUp={(e) => handleDragEnd(e, targetKey('question'))}
                        style={{ position: "relative", width: "80vw", maxWidth: "400px", height: "30vh", touchAction: "pan-y" }}
                    >
                        <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
                            {getDisplayedSrc('question', currentQuiz.questionImage) ? (
                                <img
                                    src={getDisplayedSrc('question', currentQuiz.questionImage)}
                                    alt="Question"
                                    draggable={false}
                                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                />
                            ) : (
                                <div className="placeholder-img">No Image</div>
                            )}
                        </div>
                        {renderImageOverlay('question')}
                    </div>
                </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 15px" }}>
                {currentQuiz.answerType === 'Input' && (
                    <input
                        style={{ width: "100%", boxSizing: "border-box" }}
                        type={currentQuiz.inputAnswerType === 'Number' ? 'number' : 'text'}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Your answer"
                    />
                )}

                {currentQuiz.answerType === 'Text select' && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {answers.map((answer, index) => {
                            const isCorrectReveal = revealedCorrectIndex === index;
                            return (
                                <button
                                    key={index}
                                    onClick={() => setSelectedAnswerIndex(index)}
                                    style={{
                                        padding: "10px",
                                        backgroundColor: selectedAnswerIndex === index || isCorrectReveal ? "#3498db" : undefined,
                                        color: selectedAnswerIndex === index || isCorrectReveal ? "white" : undefined,
                                    }}
                                >
                                    {answer.text}
                                </button>
                            );
                        })}
                    </div>
                )}

                {currentQuiz.answerType === 'Image select' && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
                        {answers.map((answer, index) => {
                            const isCorrectReveal = revealedCorrectIndex === index;
                            return (
                                <div
                                    key={index}
                                    style={{
                                        width: "40vw",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: "5px",
                                        border: selectedAnswerIndex === index || isCorrectReveal ? "2px solid #3498db" : "2px solid transparent",
                                        padding: "5px",
                                    }}
                                >
                                    <div
                                        onClick={() => setSelectedAnswerIndex(index)}
                                        onTouchStart={handleDragStart}
                                        onTouchEnd={(e) => handleDragEnd(e, targetKey(index))}
                                        onMouseDown={handleDragStart}
                                        onMouseUp={(e) => handleDragEnd(e, targetKey(index))}
                                        style={{ position: "relative", width: "100%", height: "22vh", overflow: "hidden", cursor: "pointer", touchAction: "pan-y" }}
                                    >
                                        {getDisplayedSrc(index, answer.image) ? (
                                            <img
                                                src={getDisplayedSrc(index, answer.image)}
                                                alt={answer.text}
                                                draggable={false}
                                                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                            />
                                        ) : (
                                            <div className="placeholder-img">No Image</div>
                                        )}
                                        {renderImageOverlay(index)}
                                    </div>
                                    {answer.text && <div style={{ color: "white", fontSize: "12px" }}>{answer.text}</div>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "10px" }}>
                {showResult && (
                    <div style={{ color: lastAnswerCorrect ? "#2ecc71" : "#e74c3c", fontWeight: "bold" }}>
                        {showingAnswer ? 'Answer revealed' : lastAnswerCorrect ? 'Correct!' : 'Wrong'}
                        {currentQuiz.answerType === 'Input' && currentQuiz.inputAnswer && (
                            <div style={{ fontWeight: "normal", fontSize: "12px", color: "white", opacity: 0.8 }}>
                                Correct answer: {currentQuiz.inputAnswer}
                            </div>
                        )}
                        {showingAnswer && currentQuiz.answerType !== 'Input' && answers.find((answer) => answer.correct)?.text && (
                            <div style={{ fontWeight: "normal", fontSize: "12px", color: "white", opacity: 0.8 }}>
                                Correct answer: {answers.find((answer) => answer.correct)?.text}
                            </div>
                        )}
                    </div>
                )}
                {showResult ? (
                    <button style={{ backgroundColor: "green", height: "6vh", width: "40vw" }} onClick={handleNext}>
                        Next
                    </button>
                ) : (
                    <div style={{ display: "flex", gap: "10px", width: "100%", justifyContent: "center" }}>
                        <button
                            style={{ backgroundColor: "green", height: "6vh", width: "40vw" }}
                            disabled={!isConfirmEnabled() || isJudging}
                            onClick={handleConfirm}
                        >
                            {isJudging ? 'Thinking…' : 'Confirm answer'}
                        </button>
                        <button
                            style={{ backgroundColor: "#7f8c8d", color: "white", height: "6vh", width: "40vw" }}
                            onClick={handleShowAnswer}
                            disabled={isJudging || (currentQuiz.answerType === 'Input' && !(currentQuiz.inputAnswer?.trim())) || (!answers.some((answer) => answer.correct) && currentQuiz.answerType !== 'Input')}
                        >
                            Show answer
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

const overlayCenterStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.5)",
    color: "white",
    fontSize: "12px",
    textAlign: "center",
    padding: "10px",
};