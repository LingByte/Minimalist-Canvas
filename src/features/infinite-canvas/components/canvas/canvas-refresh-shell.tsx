import { useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import "./canvas-refresh-shell.css";

type CanvasRefreshShellProps = {
    title?: string;
    description?: string;
};

const LOAD_NODES = [
    { id: "a", src: "/images/canvas/load/node-a.jpg", className: "node-a" },
    { id: "b", src: "/images/canvas/load/node-b.jpg", className: "node-b" },
    { id: "c", src: "/images/canvas/load/node-c.jpg", className: "node-c" },
] as const;

const STRIP_FRAMES = [
    "/images/canvas/load/node-a.jpg",
    "/images/canvas/load/node-b.jpg",
    "/images/canvas/load/node-c.jpg",
    "/images/canvas/load/node-a.jpg",
    "/images/canvas/load/node-b.jpg",
    "/images/canvas/load/node-c.jpg",
] as const;

/** Full-viewport load shell while canvas projects hydrate. */
export function CanvasRefreshShell({ title, description }: CanvasRefreshShellProps = {}) {
    const { t } = useTranslation();
    const reduceMotion = useReducedMotion();
    const heading = title ?? t("canvas.projectLoading");
    const hint = description ?? t("canvas.projectLoadingHint");

    return (
        <main className={cn("canvas-load", reduceMotion && "is-static")}>
            <div className="canvas-load-aura" aria-hidden="true" />
            <div className="canvas-load-haze" aria-hidden="true" />

            <div className="canvas-load-stage canvas-load-stage--board" aria-hidden="true">
                <div className="canvas-load-board">
                    <svg className="canvas-load-wires" viewBox="0 0 820 280" preserveAspectRatio="xMidYMid meet">
                        <path className="canvas-load-wire" d="M168 148 C250 148 278 92 360 92" />
                        <path className="canvas-load-wire canvas-load-wire--lag" d="M460 92 C542 92 568 168 652 168" />
                        <circle className="canvas-load-packet" r="3.5" />
                        <circle className="canvas-load-packet canvas-load-packet--lag" r="3.5" />
                    </svg>

                    {LOAD_NODES.map((node, index) => (
                        <article key={node.id} className={cn("canvas-load-node", node.className)} style={{ "--i": index } as CSSProperties}>
                            <div className="canvas-load-node-media">
                                <img src={node.src} alt="" decoding="async" />
                                <span className="canvas-load-node-sheen" />
                            </div>
                            <div className="canvas-load-node-meta">
                                <i />
                                <span />
                            </div>
                        </article>
                    ))}

                    <div className="canvas-load-strip">
                        <div className="canvas-load-strip-track">
                            {STRIP_FRAMES.map((src, index) => (
                                <span key={`${src}-${index}`} className="canvas-load-strip-frame">
                                    <img src={src} alt="" decoding="async" />
                                </span>
                            ))}
                        </div>
                        <span className="canvas-load-playhead" />
                        <div className="canvas-load-wave">
                            <b />
                            <b />
                            <b />
                        </div>
                    </div>
                </div>
            </div>

            <div className="canvas-load-stage canvas-load-stage--card">
                <div className="canvas-load-card" role="status" aria-live="polite" aria-busy="true">
                    <p className="canvas-load-kicker">
                        <span className="canvas-load-dot" />
                        {t("canvas.projectLoadingKicker")}
                    </p>
                    <h1>{heading}</h1>
                    <p>{hint}</p>
                    <div className="canvas-load-track" aria-hidden="true">
                        <span />
                    </div>
                </div>
            </div>
        </main>
    );
}
