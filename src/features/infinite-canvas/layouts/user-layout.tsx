import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AgentPanel } from "@canvas/components/agent/agent-panel";
import { AppTopNav } from "@canvas/components/layout/app-top-nav";
import { ConfigOnboardingTour } from "@canvas/components/layout/config-onboarding-tour";
import { useMcpBridge } from "@canvas/hooks/use-mcp-bridge";
import { useGatewayBridge } from "@canvas/integration/use-gateway-bridge";
import { useGatewayModelsBridge } from "@canvas/integration/use-gateway-models-bridge";

export default function UserLayout({ children }: { children: ReactNode }) {
    useMcpBridge();
    useGatewayBridge();
    useGatewayModelsBridge();
    const { pathname } = useLocation();
    const isLanding = pathname === "/" || pathname === "/home";

    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            {isLanding ? null : <AgentPanel />}
            {isLanding ? null : <ConfigOnboardingTour />}
        </div>
    );
}
