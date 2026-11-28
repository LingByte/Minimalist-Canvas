import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, message } from "antd";
import { Home, RefreshCw, Copy, RotateCcw } from "lucide-react";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

const CRASH_HERO = "/images/system/crash-hero.jpg";
const CRASH_MARK = "/images/system/crash-mark.jpg";

export function formatCrashReport(error: unknown): string {
    const lines = [`URL: ${typeof window !== "undefined" ? window.location.href : ""}`, `Time: ${new Date().toISOString()}`];
    if (isRouteErrorResponse(error)) {
        lines.push(`Route error: ${error.status} ${error.statusText}`);
        if (typeof error.data === "string") lines.push(error.data);
        else if (error.data) lines.push(JSON.stringify(error.data, null, 2));
        return lines.join("\n");
    }
    if (error instanceof Error) {
        lines.push(`${error.name}: ${error.message}`);
        if (error.stack) lines.push("", error.stack);
        return lines.join("\n");
    }
    lines.push(typeof error === "string" ? error : JSON.stringify(error, null, 2));
    return lines.join("\n");
}

export function CanvasCrashScreen({
    error,
    onReset,
    onHome,
    className,
}: {
    error: unknown;
    onReset?: () => void;
    onHome?: () => void;
    className?: string;
}) {
    const { t } = useTranslation();
    const report = formatCrashReport(error);
    const shortMessage =
        error instanceof Error
            ? error.message
            : isRouteErrorResponse(error)
              ? `${error.status} ${error.statusText}`
              : t("canvas.error.unknown");

    const copyReport = async () => {
        try {
            await navigator.clipboard.writeText(report);
            message.success(t("canvas.error.copied"));
        } catch {
            message.error(t("canvas.error.copyFailed"));
        }
    };

    return (
        <div
            className={cn(
                "relative flex min-h-[70vh] w-full flex-col items-center justify-center overflow-hidden px-5 py-12",
                className,
            )}
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(231,229,228,0.55),_transparent_55%),linear-gradient(180deg,#fafaf9_0%,#f5f5f4_100%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(41,37,36,0.55),_transparent_55%),linear-gradient(180deg,#0c0a09_0%,#1c1917_100%)]"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[46%] overflow-hidden opacity-90"
            >
                <img
                    src={CRASH_HERO}
                    alt=""
                    className="h-full w-full object-cover object-[center_35%]"
                    style={{
                        WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 100%)",
                        maskImage: "linear-gradient(to bottom, black 40%, transparent 100%)",
                    }}
                />
            </div>

            <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
                <div className="mb-5 overflow-hidden rounded-2xl border border-stone-200/80 bg-white/70 shadow-[0_18px_50px_-28px_rgba(28,25,23,0.45)] backdrop-blur-sm dark:border-stone-700/70 dark:bg-stone-950/55">
                    <img
                        src={CRASH_MARK}
                        alt=""
                        className="h-28 w-28 object-cover sm:h-32 sm:w-32"
                    />
                </div>

                <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-stone-400 uppercase">
                    {t("canvas.error.kicker")}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50 sm:text-[1.75rem]">
                    {t("canvas.error.title")}
                </h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                    {t("canvas.error.description")}
                </p>
                <p className="mt-2 max-w-md truncate font-mono text-[11px] text-stone-400 dark:text-stone-500" title={shortMessage}>
                    {shortMessage}
                </p>

                <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
                    <Button
                        type="primary"
                        size="large"
                        icon={<RefreshCw className="size-3.5" />}
                        onClick={() => window.location.reload()}
                    >
                        {t("canvas.error.refresh")}
                    </Button>
                    {onHome ? (
                        <Button size="large" icon={<Home className="size-3.5" />} onClick={onHome}>
                            {t("canvas.error.home")}
                        </Button>
                    ) : null}
                    {onReset ? (
                        <Button size="large" icon={<RotateCcw className="size-3.5" />} onClick={onReset}>
                            {t("canvas.error.retry")}
                        </Button>
                    ) : null}
                    <Button size="large" icon={<Copy className="size-3.5" />} onClick={copyReport}>
                        {t("canvas.error.copy")}
                    </Button>
                </div>

                <details className="mt-6 w-full max-w-md text-left">
                    <summary className="cursor-pointer select-none text-xs text-stone-400 transition hover:text-stone-600 dark:hover:text-stone-300">
                        {t("canvas.error.details")}
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-xl border border-stone-200/80 bg-white/80 p-3 text-left font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-stone-600 dark:border-stone-700 dark:bg-stone-950/70 dark:text-stone-300">
                        {report}
                    </pre>
                </details>
            </div>
        </div>
    );
}

type CanvasErrorBoundaryProps = {
    children: ReactNode;
};

type CanvasErrorBoundaryState = {
    error: Error | null;
};

export class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
    state: CanvasErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <CanvasCrashScreen
                    error={this.state.error}
                    onReset={() => this.setState({ error: null })}
                />
            );
        }
        return this.props.children;
    }
}

export function CanvasRouteError() {
    const error = useRouteError();
    const navigate = useNavigate();
    return <CanvasCrashScreen error={error} onHome={() => navigate("/")} />;
}
