import { LayoutDashboard, Menu } from "lucide-react";
import { Tooltip } from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { startTransition, useCallback, useState, type MouseEvent } from "react";

import { navigationTools, navigationToolActive, type NavigationToolSlug } from "@canvas/constant/navigation-tools";
import { AppConfigModal } from "@canvas/components/layout/app-config-modal";
import { MobileNavDrawer } from "@canvas/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@canvas/components/layout/user-status-actions";
import { SidebarNavItem } from "@/components/layout/components/sidebar-nav-item";
import { sidebarNavItemClassName } from "@/components/layout/utils/sidebar-nav-styles";
import { SmartImage } from "@/components/smart-image";
import { useCanvasHost } from "@canvas/integration/canvas-host-context";
import { DEFAULT_LOGO, DEFAULT_SYSTEM_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

function activeToolFromPath(pathname: string): NavigationToolSlug | undefined {
    const slug = pathname.split("/").filter(Boolean)[0];
    if (!slug) return undefined;
    const matched = navigationTools.find((tool) => navigationToolActive(tool.slug, slug));
    return matched?.slug;
}

function isModifiedClick(event: MouseEvent) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

/** Canvas workbench chrome: vertical tool rail (replaces the old top header nav). */
export function CanvasToolsSidebar(props: { className?: string }) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { embedded, homeHref, logo, brandName } = useCanvasHost();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    const activeToolSlug = activeToolFromPath(pathname);
    const brand = brandName || DEFAULT_SYSTEM_NAME;
    const logoUrl = logo || DEFAULT_LOGO;

    const go = useCallback(
        (href: string, event: MouseEvent) => {
            if (isModifiedClick(event)) return;
            event.preventDefault();
            startTransition(() => {
                navigate(href);
            });
        },
        [navigate]
    );

    const logoImage = (
        <SmartImage
            src={logoUrl}
            alt={t("Logo")}
            className="h-8 w-auto max-w-[2.5rem] object-contain"
            fallbackIconClassName="text-sidebar-foreground size-5"
        />
    );

    const homeLink = embedded ? (
        <a
            href={homeHref}
            className="flex items-center justify-center transition-opacity hover:opacity-90"
            aria-label={brand}
        >
            {logoImage}
        </a>
    ) : (
        <Link
            to="/"
            className="flex items-center justify-center transition-opacity hover:opacity-90"
            aria-label={brand}
        >
            {logoImage}
        </Link>
    );

    return (
        <>
            <aside
                className={cn(
                    "bg-sidebar text-sidebar-foreground border-sidebar-border hidden h-dvh w-[4.75rem] shrink-0 flex-col items-center border-r md:flex",
                    props.className
                )}
                aria-label={t("topNav.navigation")}
            >
                <div className="flex h-14 w-full items-center justify-center px-2">{homeLink}</div>

                <div className="w-full px-1.5 pb-1">
                    <Tooltip title={t("Back to Dashboard")} placement="right">
                        <Link
                            to="/dashboard"
                            onClick={(event) => go("/dashboard", event)}
                            className={sidebarNavItemClassName(false)}
                        >
                            <LayoutDashboard className="size-[1.3rem] stroke-[1.75]" aria-hidden />
                            <span className="max-w-full truncate text-center text-[10px] leading-tight font-medium tracking-wide">
                                {t("Console")}
                            </span>
                        </Link>
                    </Tooltip>
                </div>

                <div className="bg-sidebar-border mx-3 mb-1 h-px w-10 shrink-0" />

                <nav className="flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-1.5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {navigationTools.map((tool) => {
                        const href = `/${tool.slug}`;
                        return (
                            <SidebarNavItem
                                key={tool.slug}
                                href={href}
                                active={tool.slug === activeToolSlug}
                                title={t(`navigation.${tool.slug}`)}
                                icon={tool.icon}
                                layoutId="canvas-tools-sidebar-nav-pill"
                                onClick={(event) => go(href, event)}
                            />
                        );
                    })}
                </nav>

                <div className="border-sidebar-border flex w-full flex-col items-center gap-2 border-t px-1.5 py-3">
                    <UserStatusActions showConfig={true} orientation="vertical" />
                </div>
            </aside>

            <div className="border-border bg-background flex h-12 w-full shrink-0 items-center justify-between gap-2 border-b px-2 md:hidden">
                <div className="flex min-w-0 items-center gap-1.5">
                    <button
                        type="button"
                        className="inline-flex size-8 items-center justify-center rounded-full text-foreground transition hover:bg-sky-500/10 hover:text-sky-700"
                        onClick={() => setMobileNavOpen(true)}
                        aria-label={t("topNav.openMenu")}
                        aria-expanded={mobileNavOpen}
                    >
                        <Menu className="size-5" />
                    </button>
                    {homeLink}
                    <Link
                        to="/dashboard"
                        className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-sky-700 transition hover:bg-sky-500/10 dark:text-sky-300"
                    >
                        <LayoutDashboard className="size-3.5" />
                        {t("Console")}
                    </Link>
                </div>
                <div className="flex items-center gap-0.5">
                    <UserStatusActions showConfig={true} compactOnMobile />
                </div>
            </div>

            <MobileNavDrawer
                open={mobileNavOpen}
                activeToolSlug={activeToolSlug}
                onClose={() => setMobileNavOpen(false)}
            />
            <AppConfigModal />
        </>
    );
}
