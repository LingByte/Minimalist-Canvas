import type { AgentChatItem } from "@canvas/stores/use-agent-store";

export type BuiltinAgentThread = {
    id: string;
    title: string;
    updatedAt: number;
    messages: AgentChatItem[];
};

const STORAGE_PREFIX = "canvas-builtin-agent-threads:";
const MAX_THREADS = 40;

function storageKey(projectId: string) {
    return `${STORAGE_PREFIX}${projectId || "default"}`;
}

function sanitizeMessages(messages: AgentChatItem[]): AgentChatItem[] {
    return messages
        .filter((item) => item.role === "user" || item.role === "assistant" || item.role === "error" || item.role === "system" || item.role === "tool")
        .map(({ streamId: _streamId, ...item }) => {
            // Keep tool cards, but drop bulky result payloads from localStorage.
            if (item.role !== "tool" || !item.detail || typeof item.detail !== "object") return item;
            const detail = item.detail as { kind?: string; status?: string; name?: string; result?: unknown };
            return {
                ...item,
                detail: {
                    kind: detail.kind,
                    status: detail.status,
                    name: detail.name,
                },
            };
        });
}

export function loadBuiltinAgentThreads(projectId: string): BuiltinAgentThread[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(storageKey(projectId));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as BuiltinAgentThread[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages))
            .map((item) => ({
                id: item.id,
                title: typeof item.title === "string" && item.title.trim() ? item.title : "Untitled",
                updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
                messages: sanitizeMessages(item.messages),
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_THREADS);
    } catch {
        return [];
    }
}

export function saveBuiltinAgentThreads(projectId: string, threads: BuiltinAgentThread[]) {
    if (typeof window === "undefined") return;
    try {
        const next = threads
            .map((thread) => ({
                ...thread,
                messages: sanitizeMessages(thread.messages),
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_THREADS);
        localStorage.setItem(storageKey(projectId), JSON.stringify(next));
    } catch {
        // Ignore quota / private mode failures.
    }
}

export function upsertBuiltinAgentThread(
    projectId: string,
    thread: BuiltinAgentThread,
    threads = loadBuiltinAgentThreads(projectId),
) {
    const next = [thread, ...threads.filter((item) => item.id !== thread.id)];
    saveBuiltinAgentThreads(projectId, next);
    return next;
}

export function deleteBuiltinAgentThread(projectId: string, threadId: string) {
    const next = loadBuiltinAgentThreads(projectId).filter((item) => item.id !== threadId);
    saveBuiltinAgentThreads(projectId, next);
    return next;
}

export function titleFromMessages(messages: AgentChatItem[], fallback: string) {
    const firstUser = messages.find((item) => item.role === "user" && item.text.trim());
    if (!firstUser) return fallback;
    const text = firstUser.text.replace(/\s+/g, " ").trim();
    return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}
