import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, message } from "antd";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { useTranslation } from "react-i18next";

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

export function CanvasCrashScreen({ error, onReset, onHome }: { error: unknown; onReset?: () => void; onHome?: () => void }) {
    const { t } = useTranslation();
    const report = formatCrashReport(error);

    const copyReport = async () => {
        try {
            await navigator.clipboard.writeText(report);
            message.success(t("canvas.error.copied"));
        } catch {
            message.error(t("canvas.error.copyFailed"));
        }
    };

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <h1 className="text-2xl font-semibold">{t("canvas.error.title")}</h1>
            <p className="max-w-md text-sm opacity-70">{t("canvas.error.description")}</p>
            <details className="w-full max-w-md text-left">
                <summary className="cursor-pointer text-xs opacity-60">{t("canvas.error.details")}</summary>
                <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-black/5 p-3 text-left font-mono text-[11px] leading-relaxed whitespace-pre-wrap dark:bg-white/8">
                    {report}
                </pre>
            </details>
            <div className="flex flex-wrap justify-center gap-2">
                <Button type="primary" size="large" onClick={() => window.location.reload()}>
                    {t("canvas.error.refresh")}
                </Button>
                {onHome ? (
                    <Button size="large" onClick={onHome}>
                        {t("canvas.error.home")}
                    </Button>
                ) : null}
                <Button size="large" onClick={copyReport}>
                    {t("canvas.error.copy")}
                </Button>
                {onReset ? (
                    <Button size="large" onClick={onReset}>
                        {t("canvas.error.retry")}
                    </Button>
                ) : null}
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
