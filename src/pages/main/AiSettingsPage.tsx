import { useEffect, useState } from 'react';
import {
    getLlmStatus,
    getLlmConfig,
    setLlmConfig,
    resetLlmConfig,
    downloadModel,
    deleteModelFromDevice,
    getDownloadProgress,
    getLastCompletionStats,
    judgeAnswerWithLlm,
    preloadLocalLlm,
    unloadLocalLlm,
} from '../../lib/localLlm';
import type { LlmStatus, LlmConfig, DownloadProgress, CompletionStats } from '../../lib/localLlm';

function formatBytes(bytes: number | null): string {
    if (!bytes) return '—';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
}

export default function AiSettingsPage() {
    const [status, setStatus] = useState<LlmStatus>({
        isModelOnDevice: false,
        isLoaded: false,
        isLoading: false,
        modelDesc: null,
        modelSizeBytes: null,
        gpuEnabled: null,
        reasonNoGPU: null,
    });
    const [progress, setProgress] = useState<DownloadProgress>({
        isDownloading: false,
        downloadedBytes: 0,
        totalBytes: null,
    });
    const [config, setConfigState] = useState<LlmConfig>(getLlmConfig());
    const [isBusy, setIsBusy] = useState(false);

    const [testQuestion, setTestQuestion] = useState('What color is the sky?');
    const [testExpected, setTestExpected] = useState('Blue');
    const [testAnswer, setTestAnswer] = useState('blue');
    const [testResult, setTestResult] = useState<string | null>(null);
    const [testStats, setTestStats] = useState<CompletionStats | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    async function refresh() {
        setStatus(await getLlmStatus());
        setProgress(getDownloadProgress());
    }

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 500);
        return () => clearInterval(interval);
    }, []);

    async function handleDownload() {
        setIsBusy(true);
        try {
            await downloadModel();
        } catch (e) {
            console.error('Failed to download model:', e);
            alert('Failed to download the model. Check the console for details.');
        } finally {
            setIsBusy(false);
            refresh();
        }
    }

    async function handleDeleteFromDevice() {
        if (!window.confirm('Delete the downloaded model file from this device?')) return;
        setIsBusy(true);
        try {
            await deleteModelFromDevice();
        } catch (e) {
            console.error('Failed to delete model:', e);
        } finally {
            setIsBusy(false);
            refresh();
        }
    }

    async function handleLoad() {
        setIsBusy(true);
        try {
            await preloadLocalLlm();
        } catch (e) {
            console.error('Failed to load local AI model:', e);
            alert('Failed to load the AI model. Check the console for details.');
        } finally {
            setIsBusy(false);
            refresh();
        }
    }

    async function handleUnload() {
        setIsBusy(true);
        try {
            await unloadLocalLlm();
        } catch (e) {
            console.error('Failed to unload local AI model:', e);
        } finally {
            setIsBusy(false);
            refresh();
        }
    }

    async function handleSaveConfig() {
        setIsBusy(true);
        try {
            await setLlmConfig(config);
        } finally {
            setIsBusy(false);
            refresh();
        }
    }

    async function handleResetConfig() {
        resetLlmConfig();
        setConfigState(getLlmConfig());
        refresh();
    }

    async function handleTest() {
        setIsTesting(true);
        setTestResult(null);
        setTestStats(null);
        try {
            const isCorrect = await judgeAnswerWithLlm(testQuestion, testExpected, testAnswer);
            setTestResult(isCorrect ? 'correct' : 'wrong');
            setTestStats(getLastCompletionStats());
        } catch (e) {
            console.error('Test grading failed:', e);
            setTestResult('error');
        } finally {
            setIsTesting(false);
        }
    }

    const downloadPercent =
        progress.totalBytes && progress.totalBytes > 0
            ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
            : null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "15px", padding: "15px", color: "white", overflowY: "auto" }}>
            <h2 style={{ margin: 0 }}>AI Grader</h2>
            <p style={{ fontSize: "13px", opacity: 0.7, margin: 0 }}>
                A small language model runs fully on this device to grade free-text quiz answers,
                allowing for typos and rewording instead of requiring an exact match. The model file
                is not bundled with the app — download it below the first time you use this device.
            </p>

            <div style={{ border: "1px solid #444", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "14px" }}>Model file</h3>
                <div style={{ fontSize: "13px" }}>
                    On device:{' '}
                    <span style={{ color: status.isModelOnDevice ? "#2ecc71" : "#e74c3c" }}>
                        {status.isModelOnDevice ? 'Yes' : 'No'}
                    </span>
                </div>
                {progress.isDownloading && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ height: "8px", borderRadius: "4px", background: "#444", overflow: "hidden" }}>
                            <div
                                style={{
                                    height: "100%",
                                    width: downloadPercent !== null ? `${downloadPercent}%` : "100%",
                                    background: "#3498db",
                                    transition: "width 0.2s",
                                }}
                            />
                        </div>
                        <div style={{ fontSize: "12px", opacity: 0.8 }}>
                            {formatBytes(progress.downloadedBytes)}
                            {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)} (${downloadPercent}%)` : ''}
                        </div>
                    </div>
                )}
                <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={handleDownload} disabled={isBusy || progress.isDownloading || status.isModelOnDevice}>
                        {progress.isDownloading ? 'Downloading…' : status.isModelOnDevice ? 'Downloaded' : 'Download model'}
                    </button>
                    <button onClick={handleDeleteFromDevice} disabled={isBusy || !status.isModelOnDevice}>
                        Delete from device
                    </button>
                </div>
            </div>

            <div style={{ border: "1px solid #444", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "14px" }}>Status</h3>
                <div style={{ fontSize: "13px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div>
                        State:{' '}
                        <span style={{ color: status.isLoaded ? "#2ecc71" : status.isLoading ? "#f39c12" : "#e74c3c" }}>
                            {status.isLoading ? 'Loading…' : status.isLoaded ? 'Loaded' : 'Not loaded'}
                        </span>
                    </div>
                    {status.isLoaded && (
                        <>
                            <div>Model: {status.modelDesc ?? '—'}</div>
                            <div>Size: {formatBytes(status.modelSizeBytes)}</div>
                            <div>
                                GPU acceleration: {status.gpuEnabled ? 'Enabled' : 'Disabled'}
                                {!status.gpuEnabled && status.reasonNoGPU ? ` (${status.reasonNoGPU})` : ''}
                            </div>
                        </>
                    )}
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                    <button onClick={handleLoad} disabled={isBusy || status.isLoaded || status.isLoading || !status.isModelOnDevice}>
                        {status.isLoading ? 'Loading…' : 'Load model'}
                    </button>
                    <button onClick={handleUnload} disabled={isBusy || !status.isLoaded}>
                        Unload model
                    </button>
                </div>
                {!status.isModelOnDevice && (
                    <div style={{ fontSize: "12px", opacity: 0.6 }}>Download the model above before loading it.</div>
                )}
            </div>

            <div style={{ border: "1px solid #444", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "14px" }}>Configuration</h3>

                <label style={{ fontSize: "12px", opacity: 0.7 }}>Model URL</label>
                <input
                    value={config.modelUrl}
                    onChange={(e) => setConfigState((prev) => ({ ...prev, modelUrl: e.target.value }))}
                />

                <div style={{ display: "flex", gap: "10px" }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "12px", opacity: 0.7 }}>Context size (n_ctx)</label>
                        <input
                            type="number"
                            value={config.n_ctx}
                            onChange={(e) => setConfigState((prev) => ({ ...prev, n_ctx: Number(e.target.value) }))}
                            style={{ width: "100%" }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "12px", opacity: 0.7 }}>Threads</label>
                        <input
                            type="number"
                            value={config.n_threads}
                            onChange={(e) => setConfigState((prev) => ({ ...prev, n_threads: Number(e.target.value) }))}
                            style={{ width: "100%" }}
                        />
                    </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "12px", opacity: 0.7 }}>GPU layers</label>
                        <input
                            type="number"
                            value={config.n_gpu_layers}
                            onChange={(e) => setConfigState((prev) => ({ ...prev, n_gpu_layers: Number(e.target.value) }))}
                            style={{ width: "100%" }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "12px", opacity: 0.7 }}>Temperature</label>
                        <input
                            type="number"
                            step="0.1"
                            value={config.temperature}
                            onChange={(e) => setConfigState((prev) => ({ ...prev, temperature: Number(e.target.value) }))}
                            style={{ width: "100%" }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "12px", opacity: 0.7 }}>Max tokens (n_predict)</label>
                        <input
                            type="number"
                            value={config.n_predict}
                            onChange={(e) => setConfigState((prev) => ({ ...prev, n_predict: Number(e.target.value) }))}
                            style={{ width: "100%" }}
                        />
                    </div>
                </div>

                <div style={{ fontSize: "11px", opacity: 0.6 }}>
                    Changing the model URL, context size, thread count, or GPU layers unloads the
                    current model — you'll need to press "Load model" again afterwards.
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                    <button onClick={handleSaveConfig} disabled={isBusy}>Save settings</button>
                    <button onClick={handleResetConfig} disabled={isBusy}>Reset to defaults</button>
                </div>
            </div>

            <div style={{ border: "1px solid #444", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "14px" }}>Test the grader</h3>
                <label style={{ fontSize: "12px", opacity: 0.7 }}>Question</label>
                <input value={testQuestion} onChange={(e) => setTestQuestion(e.target.value)} />
                <label style={{ fontSize: "12px", opacity: 0.7 }}>Expected answer</label>
                <input value={testExpected} onChange={(e) => setTestExpected(e.target.value)} />
                <label style={{ fontSize: "12px", opacity: 0.7 }}>Test answer</label>
                <input value={testAnswer} onChange={(e) => setTestAnswer(e.target.value)} />
                <button onClick={handleTest} disabled={isTesting || !status.isLoaded} style={{ marginTop: "5px" }}>
                    {isTesting ? 'Grading…' : 'Run test'}
                </button>
                {!status.isLoaded && (
                    <div style={{ fontSize: "12px", opacity: 0.6 }}>Load the model above before testing.</div>
                )}
                {testResult && (
                    <div
                        style={{
                            fontWeight: "bold",
                            color: testResult === 'correct' ? "#2ecc71" : testResult === 'wrong' ? "#e74c3c" : "#f39c12",
                        }}
                    >
                        {testResult === 'correct' && 'Graded: Correct'}
                        {testResult === 'wrong' && 'Graded: Wrong'}
                        {testResult === 'error' && 'Grading failed — check console'}
                    </div>
                )}
                {testStats && (
                    <div style={{ fontSize: "12px", opacity: 0.8 }}>
                        {testStats.tokensPredicted} tokens in {testStats.elapsedMs.toFixed(0)} ms
                        {' '}({testStats.tokensPerSecond.toFixed(1)} tok/s)
                    </div>
                )}
            </div>
        </div>
    );
}