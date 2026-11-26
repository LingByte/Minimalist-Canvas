import { LoaderCircle } from "lucide-react";
import { App, Button, Input, Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { optimizeCanvasPrompt, type PromptOptimizePreset } from "@canvas/services/prompt-optimizer";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@canvas/stores/use-config-store";

type PromptOptimizeDialogProps = {
    open: boolean;
    draft: string;
    preset?: PromptOptimizePreset;
    onClose: () => void;
    onApply: (prompt: string) => void;
};

export function PromptOptimizeDialog({ open, draft, preset = "character-asset-sheet", onClose, onApply }: PromptOptimizeDialogProps) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const config = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [feedback, setFeedback] = useState("");
    const [result, setResult] = useState("");
    const [done, setDone] = useState(false);
    const [running, setRunning] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!open) return;
        setFeedback("");
        setResult("");
        setDone(false);
        setRunning(false);
        abortRef.current?.abort();
        abortRef.current = null;
    }, [open, draft]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const runOptimize = async (mode: "start" | "refine") => {
        const source = draft.trim();
        if (!source) {
            message.warning(t("canvas.promptPanel.optimizeNeedsPrompt"));
            return;
        }
        if (!resolveModelForCapability(config, undefined, "text")) {
            openConfigDialog(true, "channels");
            message.warning(t("workbench.configFirst"));
            return;
        }
        if (mode === "refine" && !result.trim()) {
            message.warning(t("canvas.promptPanel.optimizeResultEmpty"));
            return;
        }
        if (running) return;

        const controller = new AbortController();
        abortRef.current?.abort();
        abortRef.current = controller;
        setRunning(true);
        setDone(false);
        if (mode === "start") setResult("");

        try {
            const optimized = await optimizeCanvasPrompt(
                config,
                {
                    mode: "image",
                    draft: source,
                    previousResult: mode === "refine" ? result : undefined,
                    feedback: feedback.trim() || undefined,
                    preset,
                },
                (text) => setResult(text),
                { signal: controller.signal },
            );
            if (!optimized) throw new Error(t("canvas.promptPanel.optimizeFailed"));
            setResult(optimized);
            setDone(true);
            if (mode === "refine") setFeedback("");
        } catch (error) {
            if (!controller.signal.aborted) {
                message.error(error instanceof Error ? error.message : t("canvas.promptPanel.optimizeFailed"));
            }
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setRunning(false);
        }
    };

    const handleClose = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setRunning(false);
        onClose();
    };

    return (
        <Modal
            title={t("canvas.promptPanel.optimizeTitle")}
            open={open}
            centered
            width={920}
            onCancel={handleClose}
            destroyOnHidden
            footer={[
                <Button key="cancel" onClick={handleClose}>
                    {t("common.cancel")}
                </Button>,
                <Button key="start" loading={running && !result} disabled={running || !draft.trim()} onClick={() => void runOptimize("start")}>
                    {t("canvas.promptPanel.optimizeStart")}
                </Button>,
                <Button key="refine" disabled={running || !done || !result.trim()} onClick={() => void runOptimize("refine")}>
                    {t("canvas.promptPanel.optimizeRefine")}
                </Button>,
                <Button
                    key="apply"
                    type="primary"
                    disabled={!done || !result.trim() || running}
                    onClick={() => {
                        const text = result.trim();
                        if (!text) return;
                        onApply(text);
                        handleClose();
                    }}
                >
                    {t("canvas.promptPanel.optimizeApply")}
                </Button>,
            ]}
        >
            <div className="space-y-3 pt-1">
                <p className="m-0 text-xs text-stone-500">{t("canvas.promptPanel.optimizeCostHint")}</p>
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="min-w-0">
                        <div className="pb-1 text-xs font-medium uppercase tracking-wide text-stone-500">{t("canvas.promptPanel.optimizeOriginal")}</div>
                        <div className="thin-scrollbar max-h-[36dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-stone-200 p-3 text-sm leading-6 text-stone-600 dark:border-stone-700 dark:text-stone-300">
                            {draft || "—"}
                        </div>
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 pb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
                            {t("canvas.promptPanel.optimizeResult")}
                            {running ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                        </div>
                        <div className="thin-scrollbar max-h-[36dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-stone-200 p-3 text-sm leading-6 dark:border-stone-700">
                            {result || t("canvas.promptPanel.optimizeResultEmpty")}
                        </div>
                    </div>
                </div>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                        {done ? t("canvas.promptPanel.optimizeFeedbackRefineLabel") : t("canvas.promptPanel.optimizeFeedbackLabel")}
                    </span>
                    <Input.TextArea
                        rows={3}
                        value={feedback}
                        disabled={running}
                        onChange={(event) => setFeedback(event.target.value)}
                        placeholder={
                            done
                                ? t("canvas.promptPanel.optimizeFeedbackRefinePlaceholder")
                                : t("canvas.promptPanel.optimizeFeedbackPlaceholder")
                        }
                    />
                </label>
            </div>
        </Modal>
    );
}
