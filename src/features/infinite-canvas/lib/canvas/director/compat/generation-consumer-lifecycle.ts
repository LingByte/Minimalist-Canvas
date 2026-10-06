export function beginGenerationConsumer(signal?: AbortSignal) {
    return { signal: signal ?? new AbortController().signal, dispose() {} };
}
