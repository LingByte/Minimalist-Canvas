import { useEffect } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";

import i18n from "@canvas/i18n";
import { isSiteTool, runSiteTool, type SiteToolName } from "@canvas/lib/agent/agent-site-tools";
import type { CanvasAgentOp } from "@canvas/lib/canvas/canvas-agent-ops";
import { isTauri } from "@canvas/services/fs-store";
import { useAgentStore } from "@canvas/stores/use-agent-store";

type McpToolCallPayload = { requestId: number; name: string; arguments?: Record<string, unknown> };

/**
 * Executes MCP tool calls forwarded by the embedded local MCP server (src-tauri/src/mcp.rs).
 * Canvas ops run through the snapshot/applyOps contract published by useAgentBridge;
 * site tools reuse the same implementations as the local Agent panel.
 */
async function runMcpTool(name: string, args: Record<string, unknown>, navigate: NavigateFunction): Promise<unknown> {
    const canvasContext = useAgentStore.getState().canvasContext;
    switch (name) {
        case "canvas_get_state": {
            const snapshot = canvasContext?.snapshot;
            if (!snapshot) throw new Error(i18n.t("agent.mcp.noCanvas"));
            return snapshot;
        }
        case "canvas_apply_ops": {
            const applyOps = canvasContext?.applyOps;
            if (!applyOps) throw new Error(i18n.t("agent.mcp.noCanvas"));
            const ops = Array.isArray(args.ops) ? (args.ops as CanvasAgentOp[]) : [];
            if (!ops.length) throw new Error(i18n.t("agent.mcp.opsRequired"));
            return applyOps(ops);
        }
        case "canvas_undo_ops": {
            const undoOps = canvasContext?.undoOps;
            if (!undoOps || !canvasContext?.canUndo) throw new Error(i18n.t("agent.mcp.nothingToUndo"));
            return undoOps();
        }
        default:
            if (isSiteTool(name)) return runSiteTool(name as SiteToolName, args, navigate, { canvasSnapshot: canvasContext?.snapshot ?? null });
            throw new Error(`unknown tool: ${name}`);
    }
}

export function useMcpBridge() {
    const navigate = useNavigate();

    useEffect(() => {
        if (!isTauri()) return;
        let disposed = false;
        let unlisten: (() => void) | undefined;
        void (async () => {
            const [{ listen }, { invoke }] = await Promise.all([import("@tauri-apps/api/event"), import("@tauri-apps/api/core")]);
            if (disposed) return;
            unlisten = await listen<McpToolCallPayload>("mcp:tool-call", async (event) => {
                const { requestId, name, arguments: args } = event.payload;
                try {
                    const result = await runMcpTool(name, args ?? {}, navigate);
                    await invoke("mcp_tool_result", { requestId, ok: true, payload: result ?? null });
                } catch (error) {
                    const text = error instanceof Error ? error.message : String(error);
                    await invoke("mcp_tool_result", { requestId, ok: false, payload: text }).catch(() => undefined);
                }
            });
        })();
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, [navigate]);
}
