import { Bot, Menu, Tags } from "lucide-react";
import { Button, Tooltip } from "antd";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@canvas/constant/navigation-tools";
import { AppConfigModal } from "@canvas/components/layout/app-config-modal";
import { MobileNavDrawer } from "@canvas/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@canvas/components/layout/user-status-actions";
import { SmartImage } from "@/components/smart-image";
import { useCanvasHost } from "@canvas/integration/canvas-host-context";
import { cn } from "@canvas/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@canvas/stores/use-agent-store";
import {
    siteHeaderChromeClassName,
    siteHeaderInnerClassName,
} from "@/components/layout/utils/top-nav-link-styles";

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const { embedded, homeHref, logo, brandName, brandTagline } = useCanvasHost();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const autoConnectRef = useRef(false);
    const agentToken = useAgentStore((state) => state.token);
    const agentEnabled = useAgentStore((state) => state.enabled);
    const agentConnected = useAgentStore((state) => state.connected);
    const connectAgent = useAgentStore((state) => state.connectAgent);
    const togglePanel = useAgentStore((state) => state.togglePanel);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const hideHeader = pathname === "/" || pathname === "/home" || /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

    useEffect(() => {
        if (autoConnectRef.current || agentEnabled || agentConnected || !agentToken.trim()) return;
        autoConnectRef.current = true;
        connectAgent({ silent: true });
    }, [agentConnected, agentEnabled, agentToken, connectAgent]);

    return (
        <>
            {!hideHeader ? (
                <header className={siteHeaderChromeClassName}>
                    <div className={siteHeaderInnerClassName}>
                        <div className="flex min-w-0 items-center">
                            {embedded ? (
                                <a href={homeHref} className="flex h-full shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-stone-600 dark:text-stone-100 dark:hover:text-stone-300">
                                    <SmartImage src={logo} alt={brandName} className="h-7 w-auto max-w-[2.75rem] object-contain" fallbackIconClassName="size-4" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-base font-medium">{brandName}</span>
                                        {brandTagline ? <span className="mt-0.5 block truncate text-[10px] font-medium tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400">{brandTagline}</span> : null}
                                    </span>
                                </a>
                            ) : (
                                <Link to="/" className="flex h-full shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-stone-600 dark:text-stone-100 dark:hover:text-stone-300">
                                    <SmartImage src={logo} alt={brandName} className="h-7 w-auto max-w-[2.75rem] object-contain" fallbackIconClassName="size-4" />
                                    <span className="text-base font-medium">{t("meta.title")}</span>
                                </Link>
                            )}

                            <button
                                type="button"
                                className="ml-3 inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 md:hidden dark:text-stone-300 dark:hover:text-white"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label={t("topNav.openMenu")}
                                title={t("topNav.menu")}
                            >
                                <Menu className="size-5" />
                            </button>

                            <nav className="hide-scrollbar ml-6 hidden h-14 min-w-0 items-center gap-6 overflow-x-auto md:flex lg:ml-8 lg:gap-7">
                                {navigationTools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            to={`/${tool.slug}`}
                                            className={cn(
                                                "relative flex h-14 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                                                active
                                                    ? "font-medium text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100"
                                                    : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100",
                                            )}
                                        >
                                            <Icon className="size-4" />
                                            <span className="truncate">{t(`navigation.${tool.slug}`)}</span>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                            {embedded ? (
                                <a
                                    href="/pricing"
                                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-stone-600 transition hover:bg-black/5 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white"
                                    aria-label={t("topNav.pricing")}
                                    title={t("topNav.pricing")}
                                >
                                    <Tags className="size-4" />
                                </a>
                            ) : null}
                            <Tooltip title={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")}>
                                <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" icon={<Bot className="size-4" />} onClick={togglePanel} aria-label={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")} />
                            </Tooltip>
                            <UserStatusActions />
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
