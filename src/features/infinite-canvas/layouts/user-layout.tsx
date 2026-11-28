import type { ReactNode } from "react";
import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";

import { AppTopNav } from "@canvas/components/layout/app-top-nav";
import { CanvasToolsSidebar } from "@canvas/components/layout/canvas-tools-sidebar";
import { navigationTools, navigationToolActive } from "@canvas/constant/navigation-tools";
import { useMcpBridge } from "@canvas/hooks/use-mcp-bridge";
import { useMediaApiBridge } from "@canvas/hooks/use-media-api-bridge";
import { scheduleAutoUpdateCheck } from "@canvas/services/app-updater";
import { cn } from "@/lib/utils";

const ConfigOnboardingTour = lazy(() =>
    import("@canvas/components/layout/config-onboarding-tour").then((m) => ({
        default: m.ConfigOnboardingTour,
    })),
);

/** Marketing / story pages — no chrome; brand lives in the page itself. */
function isLandingPath(pathname: string) {
    return pathname === "/" || pathname === "/changelog";
}

/** Fullscreen canvas project editor. */
function isCanvasProjectPath(pathname: string) {
    return /^\/canvas\/[^/]+/.test(pathname);
}

/** Image / video / prompts / assets / config / canvas list / logs — canvas tools sidebar. */
function isCanvasToolsPath(pathname: string) {
    if (isCanvasProjectPath(pathname)) return false;
    const slug = pathname.split("/").filter(Boolean)[0];
    if (!slug) return false;
    if (slug === "video" || slug === "generation-logs" || slug === "config") return true;
    return navigationTools.some((tool) => navigationToolActive(tool.slug, slug));
}

export default function UserLayout({ children }: { children: ReactNode }) {
    useMcpBridge();
    useMediaApiBridge();
    useEffect(() => {
        scheduleAutoUpdateCheck();
    }, []);
    const { pathname } = useLocation();

    const isLanding = isLandingPath(pathname);
    const isCanvasTools = isCanvasToolsPath(pathname);

    const showCanvasToolsSidebar = isCanvasTools;

    return (
        <div
            className={cn(
                "flex h-dvh overflow-hidden bg-background text-foreground",
                isLanding && "bg-transparent",
                isCanvasTools && "flex-col md:flex-row",
            )}
        >
            {showCanvasToolsSidebar ? <CanvasToolsSidebar /> : null}
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                {!showCanvasToolsSidebar && !isLanding ? <AppTopNav /> : null}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </div>
            {!isLanding ? (
                <Suspense fallback={null}>
                    <ConfigOnboardingTour />
                </Suspense>
            ) : null}
        </div>
    );
}
