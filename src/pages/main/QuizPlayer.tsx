import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { judgeAnswerWithLlm, preloadLocalLlm } from '../../lib/localLlm';

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

    const currentQuiz = quizzes[currentIndex];
    const answers = normalizeAnswers(currentQuiz?.answers ?? []);

    useEffect(() => {
        preloadLocalLlm().catch((e) => console.error('Failed to preload local LLM:', e));
    }, []);

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
        <div style={{ display: "flex", flexDirection: "column", flex: "1", gap: "10px" }}>
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
                    style={{ height: "15vh", width: "100%", resize: "none" }}
                    value={currentQuiz.question}
                />
            </div>

            {currentQuiz.questionType === 'Question + Image' && currentQuiz.questionImage && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                    <div style={{ width: "80vw", height: "30vh", overflow: "hidden" }}>
                        <img
                            src={resolveImageSrc(currentQuiz.questionImage, externalBasePath)}
                            alt="Question"
                            style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                    </div>
                </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 15px" }}>
                {currentQuiz.answerType === 'Input' && (
                    <input
                        style={{ width: "100%" }}
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
                                    onClick={() => setSelectedAnswerIndex(index)}
                                    style={{
                                        width: "40vw",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: "5px",
                                        cursor: "pointer",
                                        border: selectedAnswerIndex === index || isCorrectReveal ? "2px solid #3498db" : "2px solid transparent",
                                        padding: "5px",
                                    }}
                                >
                                    <div style={{ width: "100%", height: "22vh", overflow: "hidden" }}>
                                        {answer.image ? (
                                            <img
                                                src={resolveImageSrc(answer.image, externalBasePath)}
                                                alt={answer.text}
                                                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                            />
                                        ) : (
                                            <div className="placeholder-img">No Image</div>
                                        )}
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