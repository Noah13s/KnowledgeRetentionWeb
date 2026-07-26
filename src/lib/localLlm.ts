import { initLlama, releaseAllLlama } from 'llama-cpp-capacitor';
import { Filesystem, Directory } from '@capacitor/filesystem';

// ---- Configuration ----

export interface LlmConfig {
    modelUrl: string;
    n_ctx: number;
    n_threads: number;
    n_gpu_layers: number;
    temperature: number;
    n_predict: number;
}

const CONFIG_STORAGE_KEY = 'localLlm.config';

const DEFAULT_CONFIG: LlmConfig = {
    // Double-check this resolves to the exact quant file you want — HF repo
    // layouts and filenames vary and this isn't verified against the live repo.
    modelUrl: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/cc27747d7419139e44ba97777c2f2fd5dca92ee1/Qwen3-1.7B-Q4_K_M.gguf',
    n_ctx: 2048,
    n_threads: 4,
    n_gpu_layers: 0,
    temperature: 0,
    n_predict: 32,
};

function loadConfig(): LlmConfig {
    try {
        const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_CONFIG };
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (e) {
        return { ...DEFAULT_CONFIG };
    }
}

function saveConfig(config: LlmConfig) {
    try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
        console.error('Failed to persist local LLM config:', e);
    }
}

let currentConfig: LlmConfig = loadConfig();

export function getLlmConfig(): LlmConfig {
    return { ...currentConfig };
}

// n_ctx/n_threads/n_gpu_layers/modelUrl only take effect on (re)load; temperature/n_predict
// are read fresh on every completion call, so they apply immediately without a reload.
export async function setLlmConfig(partial: Partial<LlmConfig>): Promise<void> {
    const reloadAffectingKeys: (keyof LlmConfig)[] = ['modelUrl', 'n_ctx', 'n_threads', 'n_gpu_layers'];
    const needsReload = reloadAffectingKeys.some(
        (key) => partial[key] !== undefined && partial[key] !== currentConfig[key]
    );

    currentConfig = { ...currentConfig, ...partial };
    saveConfig(currentConfig);

    if (needsReload && (contextPromise || lastContext)) {
        await unloadLocalLlm();
    }
}

export function resetLlmConfig(): void {
    currentConfig = { ...DEFAULT_CONFIG };
    saveConfig(currentConfig);
}

// ---- Model file management (download-on-demand, never bundled) ----

function getModelFileName(url: string): string {
    try {
        const parts = new URL(url).pathname.split('/');
        return decodeURIComponent(parts[parts.length - 1]) || 'model.gguf';
    } catch (e) {
        return 'model.gguf';
    }
}

function getModelDevicePath(): string {
    return `models/${getModelFileName(currentConfig.modelUrl)}`;
}

function arrayBufferToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

export interface DownloadProgress {
    isDownloading: boolean;
    downloadedBytes: number;
    totalBytes: number | null;
}

let downloadProgress: DownloadProgress = {
    isDownloading: false,
    downloadedBytes: 0,
    totalBytes: null,
};

export function getDownloadProgress(): DownloadProgress {
    return { ...downloadProgress };
}

export async function isModelOnDevice(): Promise<boolean> {
    try {
        const stat = await Filesystem.stat({ path: getModelDevicePath(), directory: Directory.Data });
        return stat.size > 0;
    } catch (e) {
        return false;
    }
}

let downloadPromise: Promise<void> | null = null;

// Explicit, user-triggered download — never called automatically from getContext(),
// since this is a large remote file the user should choose when to fetch.
export async function downloadModel(): Promise<void> {
    if (downloadPromise) return downloadPromise;

    downloadPromise = (async () => {
        const devicePath = getModelDevicePath();
        downloadProgress = { isDownloading: true, downloadedBytes: 0, totalBytes: null };

        try {
            try {
                await Filesystem.mkdir({ path: 'models', directory: Directory.Data, recursive: true });
            } catch (e) {
                // Directory already exists — fine.
            }
            try {
                await Filesystem.deleteFile({ path: devicePath, directory: Directory.Data });
            } catch (e) {
                // Nothing to delete — fine.
            }

            const response = await fetch(currentConfig.modelUrl);
            if (!response.ok || !response.body) {
                throw new Error(`Failed to download model: HTTP ${response.status}`);
            }

            const contentLength = response.headers.get('content-length');
            downloadProgress.totalBytes = contentLength ? parseInt(contentLength, 10) : null;

            const reader = response.body.getReader();
            const FLUSH_THRESHOLD = 4 * 1024 * 1024;
            let buffered: Uint8Array[] = [];
            let bufferedBytes = 0;

            async function flush() {
                if (bufferedBytes === 0) return;
                const merged = new Uint8Array(bufferedBytes);
                let offset = 0;
                for (const chunk of buffered) {
                    merged.set(chunk, offset);
                    offset += chunk.length;
                }
                await Filesystem.appendFile({
                    path: devicePath,
                    directory: Directory.Data,
                    data: arrayBufferToBase64(merged),
                });
                buffered = [];
                bufferedBytes = 0;
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                    buffered.push(value);
                    bufferedBytes += value.length;
                    downloadProgress.downloadedBytes += value.length;
                    if (bufferedBytes >= FLUSH_THRESHOLD) {
                        await flush();
                    }
                }
            }
            await flush();
        } finally {
            downloadProgress.isDownloading = false;
            downloadPromise = null;
        }
    })();

    return downloadPromise;
}

export async function deleteModelFromDevice(): Promise<void> {
    if (lastContext || contextPromise) {
        await unloadLocalLlm();
    }
    try {
        await Filesystem.deleteFile({ path: getModelDevicePath(), directory: Directory.Data });
    } catch (e) {
        // Nothing to delete — fine.
    }
}

// ---- Context lifecycle ----

let contextPromise: Promise<any> | null = null;
let lastContext: any = null;

function getContext() {
    if (!contextPromise) {
        contextPromise = (async () => {
            const onDevice = await isModelOnDevice();
            if (!onDevice) {
                contextPromise = null;
                throw new Error('Model is not downloaded yet. Download it from the AI settings page first.');
            }

            const uri = await Filesystem.getUri({ path: getModelDevicePath(), directory: Directory.Data });
            const modelPath = uri.uri.replace(/^file:\/\//, '');

            const context = await initLlama({
                model: modelPath,
                n_ctx: currentConfig.n_ctx,
                n_threads: currentConfig.n_threads,
                n_gpu_layers: currentConfig.n_gpu_layers,
                use_mlock: false,
                use_mmap: true,
                embedding: false,
            });
            lastContext = context;
            return context;
        })();
    }
    return contextPromise;
}

export async function preloadLocalLlm() {
    await getContext();
}

export async function warmupLocalLlmIfDownloaded(): Promise<boolean> {
    const onDevice = await isModelOnDevice();
    if (!onDevice) return false;

    try {
        const context = await getContext();
        if (context && typeof context.completion === 'function') {
            try {
                await context.completion({
                    prompt: 'Warmup',
                    n_predict: 1,
                    temperature: 0,
                    stop: ['\n'],
                });
            } catch (warmupError) {
                console.warn('Local LLM warmup completion failed:', warmupError);
            }
        }

        return true;
    } catch (e) {
        return false;
    }
}

export async function unloadLocalLlm() {
    if (contextPromise) {
        try {
            const context = await contextPromise;
            await context.release();
        } catch (e) {
            console.error('Failed to release Llama context:', e);
        }
        contextPromise = null;
        lastContext = null;
    }
    await releaseAllLlama();
}

// ---- Grading ----

export interface CompletionStats {
    tokensPredicted: number;
    tokensEvaluated: number;
    elapsedMs: number;
    tokensPerSecond: number;
}

let lastCompletionStats: CompletionStats | null = null;

export function getLastCompletionStats(): CompletionStats | null {
    return lastCompletionStats;
}

export async function judgeAnswerWithLlm(
    question: string,
    correctAnswer: string,
    userAnswer: string
): Promise<boolean> {
    const context = await getContext();

    const prompt =
        `<|im_start|>system\n` +
        `You are a strict quiz grader. Given a question, the expected answer, ` +
        `and a student answer, decide if the student answer means the same thing ` +
        `as the expected answer, allowing for typos, rewording, or different phrasing. ` +
        `Reply with only the single word "yes" or "no".<|im_end|>\n` +
        `<|im_start|>user\n` +
        `Question: ${question}\n` +
        `Expected answer: ${correctAnswer}\n` +
        `Student answer: ${userAnswer}\n` +
        `/no_think<|im_end|>\n` +
        `<|im_start|>assistant\n`;

    const startedAt = performance.now();
    const result = await context.completion({
        prompt,
        n_predict: currentConfig.n_predict,
        temperature: currentConfig.temperature,
        stop: ['<|im_end|>', '<|im_start|>'],
    });
    const elapsedMs = performance.now() - startedAt;

    const tokensPredicted: number = result?.tokens_predicted ?? 0;
    const tokensEvaluated: number = result?.tokens_evaluated ?? 0;
    lastCompletionStats = {
        tokensPredicted,
        tokensEvaluated,
        elapsedMs,
        tokensPerSecond: elapsedMs > 0 ? (tokensPredicted / elapsedMs) * 1000 : 0,
    };

    const raw: string = (result?.text ?? result?.content ?? '');
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/i, '').trim().toLowerCase();

    return cleaned.startsWith('y');
}

// ---- Status (for the AI settings page) ----

export interface LlmStatus {
    isModelOnDevice: boolean;
    isLoaded: boolean;
    isLoading: boolean;
    modelDesc: string | null;
    modelSizeBytes: number | null;
    gpuEnabled: boolean | null;
    reasonNoGPU: string | null;
}

export async function getLlmStatus(): Promise<LlmStatus> {
    const onDevice = await isModelOnDevice();

    if (contextPromise && !lastContext) {
        return { isModelOnDevice: onDevice, isLoaded: false, isLoading: true, modelDesc: null, modelSizeBytes: null, gpuEnabled: null, reasonNoGPU: null };
    }
    if (!lastContext) {
        return { isModelOnDevice: onDevice, isLoaded: false, isLoading: false, modelDesc: null, modelSizeBytes: null, gpuEnabled: null, reasonNoGPU: null };
    }
    return {
        isModelOnDevice: onDevice,
        isLoaded: true,
        isLoading: false,
        modelDesc: lastContext.model?.desc ?? null,
        modelSizeBytes: lastContext.model?.size ?? null,
        gpuEnabled: lastContext.gpu ?? null,
        reasonNoGPU: lastContext.reasonNoGPU ?? null,
    };
}