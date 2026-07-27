import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import ImagePage from './ImageLibrary';

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

interface QuizEditorProps {
    initialQuiz?: Quiz | null;
    defaultCategory: string;
    externalBasePath: string;
    onSave: (quiz: Quiz, originalQuiz: Quiz | null) => void;
    onDelete?: (quiz: Quiz) => void;
    onCancel: () => void;
}

const QUESTION_TYPES = ['Question', 'Question + Image'];
const ANSWER_TYPES = ['Text select', 'Input', 'Image select'];
const INPUT_ANSWER_TYPES = ['Text', 'Number'];

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

// Target of an in-progress image pick: the question image, or one answer's image by index.
type PickTarget = 'question' | number;

export default function QuizPage({ initialQuiz = null, defaultCategory, externalBasePath, onSave, onDelete, onCancel }: QuizEditorProps) {
    const [quizName, setQuizName] = useState(initialQuiz?.quizName ?? '');
    const [questionType, setQuestionType] = useState(initialQuiz?.questionType ?? QUESTION_TYPES[0]);
    const [question, setQuestion] = useState(initialQuiz?.question ?? '');
    const [questionImage, setQuestionImage] = useState(initialQuiz?.questionImage ?? '');
    const [webSearch, setWebSearch] = useState(initialQuiz?.webSearch ?? '');
    const [answerType, setAnswerType] = useState(initialQuiz?.answerType ?? ANSWER_TYPES[0]);
    const [inputAnswerType, setInputAnswerType] = useState(initialQuiz?.inputAnswerType ?? INPUT_ANSWER_TYPES[0]);
    const [inputAnswer, setInputAnswer] = useState(initialQuiz?.inputAnswer ?? '');
    const [answers, setAnswers] = useState<QuizAnswer[]>(normalizeAnswers(initialQuiz?.answers ?? []));
    const [pickTarget, setPickTarget] = useState<PickTarget | null>(null);

    const category = initialQuiz?.category ?? defaultCategory;

    function handleClearAnswers() {
        setAnswers([]);
    }

    function handleAddAnswer() {
        setAnswers((prev) => [...prev, { text: '', image: '', correct: false }]);
    }

    function handleAnswerTextChange(index: number, value: string) {
        setAnswers((prev) => prev.map((a, i) => (i === index ? { ...a, text: value } : a)));
    }

    function handleAnswerCorrectChange(index: number) {
        setAnswers((prev) => prev.map((a, i) => ({ ...a, correct: i === index })));
    }

    function handleRemoveAnswer(index: number) {
        setAnswers((prev) => prev.filter((_, i) => i !== index));
    }

    function handlePickImageResult(path: string) {
        if (pickTarget === 'question') {
            setQuestionImage(path);
        } else if (typeof pickTarget === 'number') {
            const index = pickTarget;
            setAnswers((prev) => prev.map((a, i) => (i === index ? { ...a, image: path } : a)));
        }
        setPickTarget(null);
    }

    function handleSubmit() {
        if (!quizName.trim()) {
            alert('Please enter a quiz name.');
            return;
        }
        const quiz: Quiz = {
            quizName: quizName.trim(),
            questionType,
            question,
            questionImage,
            webSearch,
            answerType,
            inputAnswerType,
            inputAnswer,
            category,
            answers: answerType === 'Input' ? [] : answers,
        };
        onSave(quiz, initialQuiz);
    }

    function handleDelete() {
        if (initialQuiz && onDelete) {
            onDelete(initialQuiz);
        }
    }

    if (pickTarget !== null) {
        return (
            <ImagePage
                mode="picker"
                onPick={handlePickImageResult}
                onCancel={() => setPickTarget(null)}
            />
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", flex: "1", minHeight: 0, height: "100%" }}>
            <div style={{ flex: "1", minHeight: 0, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                    <h3 style={{ margin: "0 0 4px" }}>Quiz name</h3>
                    <input style={{ width: "100%", boxSizing: "border-box" }} value={quizName} onChange={(e) => setQuizName(e.target.value)} />
                </div>

                <div>
                    <h3 style={{ margin: "0 0 4px" }}>Question type</h3>
                    <select style={{ width: "100%" }} value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
                        {QUESTION_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <textarea
                        style={{ height: "15vh", width: "100%", boxSizing: "border-box", resize: "vertical" }}
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                    />
                </div>

                {questionType === 'Question + Image' && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div
                            onClick={() => setPickTarget('question')}
                            style={{
                                width: "100%",
                                maxWidth: "300px",
                                height: "20vh",
                                border: "1px solid #ccc",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                overflow: "hidden",
                                margin: "0 auto",
                            }}
                        >
                            {questionImage ? (
                                <img
                                    src={resolveImageSrc(questionImage, externalBasePath)}
                                    alt="Question"
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                            ) : (
                                <span style={{ color: "white", opacity: 0.7 }}>Tap to set image</span>
                            )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <label style={{ fontSize: "0.9rem", marginBottom: "4px" }}>Web search query (optional)</label>
                            <input
                                style={{ width: "100%", boxSizing: "border-box" }}
                                value={webSearch}
                                onChange={(e) => setWebSearch(e.target.value)}
                                placeholder="Enter terms to search for alternative images"
                            />
                            <small style={{ color: "#666" }}>If specified, this query will be used to search the web for alternative pictures for the quiz.</small>
                        </div>
                    </div>
                )}

                <div>
                    <h3 style={{ margin: "0 0 4px" }}>Answer type</h3>
                    <select style={{ width: "100%" }} value={answerType} onChange={(e) => setAnswerType(e.target.value)}>
                        {ANSWER_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>

                {answerType === 'Input' && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        <select value={inputAnswerType} onChange={(e) => setInputAnswerType(e.target.value)}>
                            {INPUT_ANSWER_TYPES.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                        <input
                            style={{ width: "100%", boxSizing: "border-box" }}
                            type={inputAnswerType === 'Number' ? 'number' : 'text'}
                            value={inputAnswer}
                            onChange={(e) => setInputAnswer(e.target.value)}
                            placeholder="Correct answer"
                        />
                    </div>
                )}

                {answerType === 'Text select' && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        {answers.map((answer, index) => (
                            <div key={index} style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                                <input
                                    type="radio"
                                    name="correctAnswer"
                                    checked={answer.correct}
                                    onChange={() => handleAnswerCorrectChange(index)}
                                />
                                <input
                                    style={{ flex: 1, minWidth: 0 }}
                                    value={answer.text}
                                    onChange={(e) => handleAnswerTextChange(index, e.target.value)}
                                    placeholder="Answer text"
                                />
                                <button onClick={() => handleRemoveAnswer(index)}>Remove</button>
                            </div>
                        ))}
                    </div>
                )}

                {answerType === 'Image select' && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        {answers.map((answer, index) => (
                            <div key={index} style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                                <input
                                    type="radio"
                                    name="correctAnswer"
                                    checked={answer.correct}
                                    onChange={() => handleAnswerCorrectChange(index)}
                                />
                                <div
                                    onClick={() => setPickTarget(index)}
                                    style={{
                                        width: "60px",
                                        height: "60px",
                                        flexShrink: 0,
                                        border: "1px solid #ccc",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                        overflow: "hidden",
                                    }}
                                >
                                    {answer.image ? (
                                        <img
                                            src={resolveImageSrc(answer.image, externalBasePath)}
                                            alt="Answer"
                                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                        />
                                    ) : (
                                        <span style={{ color: "white", opacity: 0.7, fontSize: "10px", textAlign: "center" }}>Tap for image</span>
                                    )}
                                </div>
                                <input
                                    style={{ flex: 1, minWidth: 0 }}
                                    value={answer.text}
                                    onChange={(e) => handleAnswerTextChange(index, e.target.value)}
                                    placeholder="Answer label"
                                />
                                <button onClick={() => handleRemoveAnswer(index)}>Remove</button>
                            </div>
                        ))}
                    </div>
                )}

                {answerType !== 'Input' && (
                    <div style={{ gap: "30px", display: "flex", justifyContent: "center" }}>
                        <button onClick={handleClearAnswers}>Clear answers</button>
                        <button onClick={handleAddAnswer}>Add answer</button>
                    </div>
                )}

                <div>
                    <select disabled value={category} style={{ width: "100%" }}>
                        <option value={category}>{category || 'General knowledge'}</option>
                    </select>
                </div>
            </div>

            <div style={{ flex: "0 0 auto", display: "flex", justifyContent: "space-between", gap: "10px", padding: "10px" }}>
                <button style={{ backgroundColor: "#888", height: "6vh", flex: 1 }} onClick={onCancel}>
                    Cancel
                </button>
                {initialQuiz && onDelete && (
                    <button style={{ backgroundColor: "red", height: "6vh", flex: 1 }} onClick={handleDelete}>
                        Delete
                    </button>
                )}
                <button style={{ backgroundColor: "green", height: "6vh", flex: 1 }} onClick={handleSubmit}>
                    {initialQuiz ? 'Save' : 'Create'}
                </button>
            </div>
        </div>
    );
}