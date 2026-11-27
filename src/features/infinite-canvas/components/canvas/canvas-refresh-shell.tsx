import { useTranslation } from "react-i18next";

import "./canvas-refresh-shell.css";

type CanvasRefreshShellProps = {
    title?: string;
    description?: string;
};

/** Full-viewport load shell while canvas projects hydrate. */
export function CanvasRefreshShell({ title, description }: CanvasRefreshShellProps = {}) {
    const { t } = useTranslation();
    const heading = title ?? t("canvas.projectLoading");
    const hint = description ?? t("canvas.projectLoadingHint");

    return (
        <main className="canvas-load">
            <div className="canvas-load-aura" aria-hidden="true" />
            <div className="canvas-load-grid" aria-hidden="true" />

            <div className="canvas-load-stage canvas-load-stage--board" aria-hidden="true">
                <div className="canvas-load-board">
                    <svg className="canvas-load-wires" viewBox="0 0 760 220" preserveAspectRatio="none">
                        <path className="canvas-load-wire" d="M150 100 C230 100 250 64 320 64" />
                        <path className="canvas-load-wire canvas-load-wire--lag" d="M440 64 C510 64 530 124 610 124" />
                        <circle className="canvas-load-packet" r="3.5" />
                        <circle className="canvas-load-packet canvas-load-packet--lag" r="3.5" />
                    </svg>
                    {(["node-0", "node-1", "node-2"] as const).map((name) => (
                        <div key={name} className={`canvas-load-node ${name}`}>
                            <div className="canvas-load-node-sheen" />
                            <div className="canvas-load-node-bar">
                                <i />
                                <span />
                            </div>
                            <div className="canvas-load-node-body">
                                <span className="canvas-load-line mid" />
                                <span className="canvas-load-line short" />
                            </div>
                        </div>
                    ))}
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
