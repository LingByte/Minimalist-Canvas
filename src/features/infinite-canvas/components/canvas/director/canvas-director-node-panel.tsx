import { useEffect, useState } from "react";
import { Clapperboard } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import { resolveDirectorActiveShot, resolveDirectorPreviewSource, type DirectorNodeContentReader } from "@canvas/lib/canvas/director/director-preview";
import { resolveImageUrl } from "@canvas/services/image-storage";
import { useActiveTheme } from "@canvas/lib/canvas/director/compat/use-canvas-theme-store";
import type { CanvasNodeData } from "@canvas/types/canvas";
import type { DirectorScene } from "@canvas/types/director";

export function CanvasDirectorNodePanel({ node, scene, readNodeContent, readNodeStorageKey, onOpen, professional = true }: { node: CanvasNodeData; scene: DirectorScene | null; readNodeContent: DirectorNodeContentReader; readNodeStorageKey?: DirectorNodeContentReader; onOpen: () => void; professional?: boolean }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useActiveTheme()];
    const shot = resolveDirectorActiveShot(scene, node.metadata?.directorShotId);
    // Record the failed URL, not a boolean, so a new candidate retries automatically.
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const coverStorageKey = node.metadata?.directorCoverStorageKey || (!node.metadata?.directorCoverUrl ? readNodeStorageKey?.(node.metadata?.directorPreviewNodeId) || readNodeStorageKey?.(shot?.previewNodeId) : undefined);
    const [resolvedCover, setResolvedCover] = useState<{ key: string; url: string } | null>(null);
    useEffect(() => {
        if (!coverStorageKey) return;
        let live = true;
        void resolveImageUrl(coverStorageKey, node.metadata?.directorCoverUrl || "", { cacheMiss: true })
            .then((url) => { if (live && url) setResolvedCover({ key: coverStorageKey, url }); })
            .catch(() => { /* Keep the empty state if the old preview is gone. */ });
        return () => { live = false; };
    }, [coverStorageKey, node.metadata?.directorCoverUrl]);
    const coverUrl = resolvedCover && resolvedCover.key === coverStorageKey ? resolvedCover.url : node.metadata?.directorCoverUrl;
    const preview = resolveDirectorPreviewSource({ scene, shot, coverUrl, failedUrl, previewNodeId: node.metadata?.directorPreviewNodeId, readNodeContent });
    const openLabel = professional ? t("canvas.director.open") : t("canvas.director.professionalOnly");
    const openAria = professional ? t("canvas.director.openAria") : t("canvas.director.professionalAria");
    const hint = preview.kind === "loading" ? t("canvas.director.preparing") : t("canvas.director.emptyHint");

    return (
        <div className="relative flex h-full w-full min-h-0 flex-col" style={{ color: theme.node.text }} data-director-open={preview.kind === "image" ? "preview" : "empty"}>
            {preview.kind === "image" ? (
                <>
                    <img
                        src={preview.url}
                        alt={t("canvas.director.coverAlt", { title: node.title })}
                        className="absolute inset-0 h-full w-full object-contain"
                        draggable={false}
                        onError={() => setFailedUrl(preview.url)}
                    />
                    <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-5 pb-5 pt-16"
                        style={{ background: `linear-gradient(to top, ${theme.node.fill}f2, ${theme.node.fill}00)` }}
                    >
                        <div className="pointer-events-auto">
                            <DirectorOpenButton label={openLabel} ariaLabel={openAria} disabled={!professional} background={theme.accent.primary} color={theme.accent.onPrimary} border={theme.toolbar.border} onOpen={onOpen} />
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
                    <DirectorOpenButton label={openLabel} ariaLabel={openAria} disabled={!professional} background={theme.accent.primary} color={theme.accent.onPrimary} border={theme.toolbar.border} onOpen={onOpen} />
                    <p className="max-w-[13.5rem] text-[11px] leading-5" style={{ color: theme.node.muted }}>{hint}</p>
                </div>
            )}
        </div>
    );
}

function DirectorOpenButton({ label, ariaLabel, disabled, background, color, border, onOpen }: { label: string; ariaLabel: string; disabled: boolean; background: string; color: string; border: string; onOpen: () => void }) {
    return (
        <button
            type="button"
            data-canvas-no-zoom
            className="flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-semibold shadow-lg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-60"
            style={{ background, color, border: `1px solid ${border}` }}
            aria-label={ariaLabel}
            disabled={disabled}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onOpen(); }}
        >
            <Clapperboard className="size-5 shrink-0" aria-hidden />
            {label}
        </button>
    );
}
