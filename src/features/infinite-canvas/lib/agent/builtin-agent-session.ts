import { kvStore } from "@canvas/services/fs-store";
import { randomId } from "@canvas/lib/utils";
import type { AgentApiMessage } from "@canvas/services/api/image";
import type { AgentChatItem } from "@canvas/stores/use-agent-store";

export type BuiltinThreadSummary = { id: string; title: string; preview: string; updatedAt: number };
export type BuiltinThread = BuiltinThreadSummary & { transcript: AgentApiMessage[]; messages: AgentChatItem[] };

const THREADS_STORE = "builtin-agent-threads";
const MAX_THREADS = 50;

/** Current in-memory session — module scope so it survives panel remounts. */
export const builtinSession = {
    threadId: randomId(),
    transcript: [] as AgentApiMessage[],
    hydrated: false,
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function resetBuiltinSession() {
    builtinSession.threadId = randomId();
    builtinSession.transcript = [];
}

export function applyBuiltinThread(thread: BuiltinThread) {
    builtinSession.threadId = thread.id;
    builtinSession.transcript = Array.isArray(thread.transcript) ? thread.transcript : [];
    builtinSession.hydrated = true;
    return thread.messages || [];
}

export async function listBuiltinThreads(): Promise<BuiltinThreadSummary[]> {
    const store = kvStore(THREADS_STORE);
    const items: BuiltinThreadSummary[] = [];
    await store.iterate<BuiltinThread, void>((value) => {
        if (value?.id) items.push({ id: value.id, title: value.title || "", preview: value.preview || "", updatedAt: value.updatedAt || 0 });
    });
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadBuiltinThread(id: string): Promise<BuiltinThread | null> {
    const value = await kvStore(THREADS_STORE).getItem<BuiltinThread>(id);
    return value && value.id ? value : null;
}

export async function deleteBuiltinThread(id: string) {
    await kvStore(THREADS_STORE).removeItem(id);
}

/** Debounced persist of the current transcript + UI messages. */
export function persistBuiltinSession(getMessages: () => AgentChatItem[]) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        void saveNow(getMessages());
    }, 400);
}

/** Flush any pending persist — call before switching or resetting the session. */
export function flushBuiltinSession(getMessages: () => AgentChatItem[]) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    void saveNow(getMessages());
}

async function saveNow(messages: AgentChatItem[]) {
    if (!builtinSession.transcript.length && !messages.length) return;
    const store = kvStore(THREADS_STORE);
    const firstUser = messages.find((item) => item.role === "user" && item.text.trim());
    const lastAssistant = [...messages].reverse().find((item) => item.role === "assistant" && item.text.trim());
    const title = (firstUser?.text || "").replace(/\s+/g, " ").trim().slice(0, 48);
    const preview = (lastAssistant?.text || firstUser?.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const thread: BuiltinThread = {
        id: builtinSession.threadId,
        title,
        preview,
        updatedAt: Date.now(),
        transcript: builtinSession.transcript,
        messages: messages.slice(-200),
    };
    try {
        await store.setItem(thread.id, thread);
        const keys = await store.keys();
        if (keys.length > MAX_THREADS) {
            const summaries = await listBuiltinThreads();
            for (const stale of summaries.slice(MAX_THREADS)) {
                await store.removeItem(stale.id).catch(() => undefined);
            }
        }
    } catch {
        // persistence is best-effort
    }
}

/** Restore the most recent thread on startup. Returns messages to seed the store. */
export async function restoreLatestBuiltinSession(): Promise<AgentChatItem[]> {
    try {
        const threads = await listBuiltinThreads();
        const latest = threads[0] ? await loadBuiltinThread(threads[0].id) : null;
        builtinSession.hydrated = true;
        if (!latest) return [];
        return applyBuiltinThread(latest);
    } catch {
        builtinSession.hydrated = true;
        return [];
    }
}
