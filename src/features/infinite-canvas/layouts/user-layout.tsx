import type { ReactNode } from "react";
import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";

import { AppTopNav } from "@canvas/components/layout/app-top-nav";
import { CanvasToolsSidebar } from "@canvas/components/layout/canvas-tools-sidebar";
import { navigationTools, navigationToolActive } from "@canvas/constant/navigation-tools";
import { useMcpBridge } from "@canvas/hooks/use-mcp-bridge";
import { useGatewayBridge } from "@canvas/integration/use-gateway-bridge";
import { useGatewayModelsBridge } from "@canvas/integration/use-gateway-models-bridge";
import { scheduleAutoUpdateCheck } from "@canvas/services/app-updater";
import { useAgentStore } from "@canvas/stores/use-agent-store";
import { AppShellFloatingActions } from "@/components/layout/components/app-shell-floating-actions";
import { DesktopSiteSidebar } from "@/components/layout/components/desktop-site-sidebar";
import { PublicHeader } from "@/components/layout/components/public-header";
import { DEFAULT_SYSTEM_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const AgentPanel = lazy(() =>
    import("@canvas/components/agent/agent-panel").then((m) => ({ default: m.AgentPanel }))
);
const ConfigOnboardingTour = lazy(() =>
    import("@canvas/components/layout/config-onboarding-tour").then((m) => ({
        default: m.ConfigOnboardingTour,
    }))
);

/** Marketing / landing — top header with logo, no sidebar. */
function isLandingPath(pathname: string) {
    return pathname === "/" || pathname === "/home";
}

/** Console & site pages — site sidebar (logo in sidebar). */
const APP_SHELL_PREFIXES = [
    "/dashboard",
    "/pricing",
    "/docs",
    "/faq",
    "/profile",
    "/keys",
    "/usage-logs",
    "/generation-logs",
] as const;

function isAppShellPath(pathname: string) {
    return APP_SHELL_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

/** Fullscreen canvas project editor. */
function isCanvasProjectPath(pathname: string) {
    return /^\/canvas\/[^/]+/.test(pathname);
}

/** Image / video / prompts / assets / config / canvas list — canvas tools sidebar. */
function isCanvasToolsPath(pathname: string) {
    if (isCanvasProjectPath(pathname)) return false;
    const slug = pathname.split("/").filter(Boolean)[0];
    if (!slug) return false;
    if (slug === "video") return true;
    return navigationTools.some((tool) => navigationToolActive(tool.slug, slug));
}

const LANDING_HEADER_CLASS =
    "aeris-site-header fixed inset-x-0 top-0 border-0 bg-transparent shadow-none backdrop-blur-none supports-[backdrop-filter]:bg-transparent before:opacity-0";

export default function UserLayout({ children }: { children: ReactNode }) {
    useMcpBridge();
    useGatewayBridge();
    useGatewayModelsBridge();
    useEffect(() => {
        scheduleAutoUpdateCheck();
    }, []);
    const { pathname } = useLocation();

    const isLanding = isLandingPath(pathname);
    const isAppShell = isAppShellPath(pathname);
    const isCanvasTools = isCanvasToolsPath(pathname);
    const isProject = isCanvasProjectPath(pathname);

    const showSiteSidebar = isAppShell;
    const showCanvasToolsSidebar = isCanvasTools;
    const showLandingHeader = isLanding;
    const showFloatingActions = isAppShell;
    const showCanvasChrome = isCanvasTools && !isProject;
    const agentPanelMounted = useAgentStore((state) => state.panelMounted);

    return (
        <div
            className={cn(
                "flex h-dvh overflow-hidden bg-background text-foreground",
                isLanding && "dark bg-transparent",
                isCanvasTools && "flex-col md:flex-row"
            )}
        >
            {showSiteSidebar ? <DesktopSiteSidebar /> : null}
            {showCanvasToolsSidebar ? <CanvasToolsSidebar /> : null}
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                {showLandingHeader ? (
                    <PublicHeader
                        className={LANDING_HEADER_CLASS}
                        showThemeSwitch={false}
                        siteName={DEFAULT_SYSTEM_NAME}
                    />
                ) : null}
                {showFloatingActions ? <AppShellFloatingActions /> : null}
                {!showCanvasToolsSidebar ? <AppTopNav /> : null}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </div>
            {(isProject || showCanvasChrome) && agentPanelMounted ? (
                <Suspense fallback={null}>
                    <AgentPanel />
                </Suspense>
            ) : null}
            {showCanvasChrome ? (
                <Suspense fallback={null}>
                    <ConfigOnboardingTour />
                </Suspense>
            ) : null}
        </div>
    );
}
