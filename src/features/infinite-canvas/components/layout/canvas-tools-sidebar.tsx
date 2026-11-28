import { Menu, PanelLeftClose, PanelLeftOpen, Settings2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    startTransition,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";

import {
    groupedNavigationTools,
    navigationToolActive,
    navigationToolHref,
    navigationTools,
    type NavigationToolSlug,
} from "@canvas/constant/navigation-tools";
import { AppConfigModal } from "@canvas/components/layout/app-config-modal";
import { MobileNavDrawer } from "@canvas/components/layout/mobile-nav-drawer";
import { VersionReleaseModal } from "@canvas/components/layout/version-release-modal";
import { AnimatedThemeToggler } from "@canvas/components/ui/animated-theme-toggler";
import { SidebarNavItem } from "@/components/layout/components/sidebar-nav-item";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { SmartImage } from "@/components/smart-image";
import { useCanvasHost } from "@canvas/integration/canvas-host-context";
import { isObjectStorageConfigured } from "@canvas/lib/object-storage/types";
import { isTauri } from "@canvas/services/fs-store";
import {
    TOOLS_SIDEBAR_COLLAPSED_WIDTH,
    TOOLS_SIDEBAR_WIDTH_MAX,
    TOOLS_SIDEBAR_WIDTH_MIN,
    useToolsSidebarStore,
} from "@canvas/stores/use-tools-sidebar-store";
import { DEFAULT_LOGO, DEFAULT_SYSTEM_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@canvas/stores/use-config-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";

function activeToolFromPath(pathname: string): NavigationToolSlug | undefined {
    const slug = pathname.split("/").filter(Boolean)[0];
    const matched = navigationTools.find((tool) => navigationToolActive(tool.slug, slug));
    return matched?.slug;
}

function isModifiedClick(event: ReactMouseEvent) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

/** Canvas workbench chrome: collapsible / resizable grouped tool rail. */
export function CanvasToolsSidebar(props: { className?: string }) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { embedded, homeHref, logo, brandName } = useCanvasHost();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [resizing, setResizing] = useState(false);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const objectStorage = useConfigStore((state) => state.objectStorage);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const collapsed = useToolsSidebarStore((state) => state.collapsed);
    const width = useToolsSidebarStore((state) => state.width);
    const toggleCollapsed = useToolsSidebarStore((state) => state.toggleCollapsed);
    const setWidth = useToolsSidebarStore((state) => state.setWidth);
    const dragStartX = useRef(0);
    const dragStartWidth = useRef(width);
    const storageReady = isObjectStorageConfigured(objectStorage);
    const desktop = isTauri();
    const sections = useMemo(
        () => groupedNavigationTools({ storageReady, desktop }),
        [storageReady, desktop],
    );

    const activeToolSlug = activeToolFromPath(pathname);
    const brand = embedded ? brandName || DEFAULT_SYSTEM_NAME : t("home.productName");
    const logoUrl = logo || DEFAULT_LOGO;
    const expanded = !collapsed;
    const railWidth = collapsed ? TOOLS_SIDEBAR_COLLAPSED_WIDTH : width;

    const go = useCallback(
        (href: string, event: ReactMouseEvent) => {
            if (isModifiedClick(event)) return;
            event.preventDefault();
            startTransition(() => {
                navigate(href);
            });
        },
        [navigate],
    );

    const onResizePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (collapsed) return;
            event.preventDefault();
            dragStartX.current = event.clientX;
            dragStartWidth.current = width;
            setResizing(true);
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        [collapsed, width],
    );

    useEffect(() => {
        if (!resizing) return;

        const onMove = (event: PointerEvent) => {
            const next = dragStartWidth.current + (event.clientX - dragStartX.current);
            setWidth(Math.min(TOOLS_SIDEBAR_WIDTH_MAX, Math.max(TOOLS_SIDEBAR_WIDTH_MIN, next)));
        };
        const onUp = () => setResizing(false);

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [resizing, setWidth]);

    const logoImage = (
        <SmartImage
            src={logoUrl}
            alt={t("Logo")}
            className={cn(
                "w-auto object-contain",
                expanded ? "h-8 max-w-[2.5rem]" : "h-7 max-w-[1.75rem]",
            )}
            fallbackIconClassName="text-sidebar-foreground size-5"
        />
    );

    const homeLink = embedded ? (
        <a
            href={homeHref}
            className={cn(
                "flex min-w-0 items-center transition-opacity hover:opacity-90",
                expanded ? "gap-2.5" : "justify-center",
            )}
            aria-label={brand}
        >
            {logoImage}
            {expanded ? <span className="truncate text-[13px] font-semibold tracking-tight">{brand}</span> : null}
        </a>
    ) : (
        <Link
            to="/"
            className={cn(
                "flex min-w-0 items-center transition-opacity hover:opacity-90",
                expanded ? "gap-2.5" : "justify-center",
            )}
            aria-label={brand}
        >
            {logoImage}
            {expanded ? <span className="truncate text-[13px] font-semibold tracking-tight">{brand}</span> : null}
        </Link>
    );

    return (
        <>
            <aside
                className={cn(
                    "bg-sidebar text-sidebar-foreground border-sidebar-border relative hidden h-dvh shrink-0 flex-col border-r md:flex",
                    resizing ? "transition-none" : "transition-[width] duration-200 ease-out",
                    props.className,
                )}
                style={{ width: railWidth }}
                aria-label={t("topNav.navigation")}
                data-collapsed={collapsed ? "true" : undefined}
            >
                <div
                    className={cn(
                        "flex w-full items-center gap-1",
                        expanded ? "h-14 justify-between px-3" : "flex-col justify-center gap-1.5 px-1 pb-1.5 pt-2.5",
                    )}
                >
                    <div className={cn("min-w-0", expanded ? "flex-1" : "flex justify-center")}>{homeLink}</div>
                    <TooltipProvider delay={280}>
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "text-sidebar-foreground/55 hover:text-sidebar-foreground shrink-0 rounded-lg border border-transparent hover:bg-stone-100/80 dark:hover:bg-white/[0.06]",
                                            expanded ? "size-8" : "size-7",
                                        )}
                                        onClick={() => toggleCollapsed()}
                                        aria-label={collapsed ? t("topNav.expandSidebar") : t("topNav.collapseSidebar")}
                                        aria-pressed={collapsed}
                                    />
                                }
                            >
                                {collapsed ? (
                                    <PanelLeftOpen className="size-3.5 stroke-[1.75]" />
                                ) : (
                                    <PanelLeftClose className="size-4 stroke-[1.75]" />
                                )}
                            </TooltipTrigger>
                            <TooltipContent side={expanded ? "bottom" : "right"} sideOffset={8}>
                                {collapsed ? t("topNav.expandSidebar") : t("topNav.collapseSidebar")}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                <nav
                    className={cn(
                        "flex w-full flex-1 flex-col overflow-y-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                        expanded ? "gap-1 px-2" : "items-center gap-0.5 px-1",
                    )}
                >
                    {sections.map((section, sectionIndex) => (
                        <div
                            key={section.id}
                            className={cn(
                                "flex w-full flex-col",
                                expanded ? "gap-px" : "items-center gap-0.5",
                                sectionIndex > 0 && (expanded
                                    ? "border-sidebar-border/80 border-t pt-1.5"
                                    : "mt-1 border-t border-white/[0.06] pt-1.5 dark:border-white/[0.06]"),
                            )}
                            aria-label={t(`navigation.groups.${section.id}`)}
                        >
                            {expanded ? (
                                <div className="px-2 pb-0.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400/90">
                                    {t(`navigation.groups.${section.id}`)}
                                </div>
                            ) : null}
                            {section.tools.map((tool) => {
                                const href = navigationToolHref(tool.slug);
                                return (
                                    <SidebarNavItem
                                        key={tool.slug}
                                        href={href}
                                        active={tool.slug === activeToolSlug}
                                        title={t(`navigation.${tool.slug}`)}
                                        icon={tool.icon}
                                        showLabel={expanded}
                                        orientation={expanded ? "horizontal" : "vertical"}
                                        showTooltip={!expanded}
                                        layoutId="canvas-tools-sidebar-nav-pill"
                                        onClick={(event) => go(href, event)}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </nav>

                <div
                    className={cn(
                        "border-sidebar-border flex w-full border-t",
                        expanded ? "items-center justify-between gap-1 px-2 py-2.5" : "flex-col items-center gap-1 px-1 py-2",
                    )}
                >
                    <span data-tour="config-settings-button" className="inline-flex">
                        <TooltipProvider delay={280}>
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className={cn(
                                                "text-sidebar-foreground/55 hover:text-sidebar-foreground rounded-lg border border-transparent hover:bg-stone-100/80 dark:hover:bg-white/[0.06]",
                                                expanded ? "size-8" : "size-7",
                                            )}
                                            onClick={() => openConfigDialog(false)}
                                            aria-label={t("navigation.config")}
                                        />
                                    }
                                >
                                    <Settings2 className={cn(expanded ? "size-4" : "size-3.5", "stroke-[1.75]")} />
                                </TooltipTrigger>
                                <TooltipContent side={expanded ? "top" : "right"} sideOffset={8}>
                                    {t("navigation.config")}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </span>
                    <AnimatedThemeToggler
                        theme={theme}
                        onThemeChange={setTheme}
                        className={cn(
                            "text-sidebar-foreground/55 hover:text-sidebar-foreground inline-flex items-center justify-center rounded-lg border border-transparent transition-colors hover:bg-stone-100/80 dark:hover:bg-white/[0.06]",
                            expanded ? "size-8" : "size-7",
                        )}
                        aria-label={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
                        title={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
                    />
                    {expanded ? (
                        <VersionReleaseModal className="text-sidebar-foreground/45 hover:text-sidebar-foreground min-w-0 flex-1 truncate px-1 text-right text-[11px] font-medium tracking-tight" />
                    ) : null}
                </div>

                {!collapsed ? (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={t("topNav.resizeSidebar")}
                        aria-valuemin={TOOLS_SIDEBAR_WIDTH_MIN}
                        aria-valuemax={TOOLS_SIDEBAR_WIDTH_MAX}
                        aria-valuenow={width}
                        tabIndex={0}
                        onPointerDown={onResizePointerDown}
                        onDoubleClick={() => setWidth(TOOLS_SIDEBAR_WIDTH_MIN + (TOOLS_SIDEBAR_WIDTH_MAX - TOOLS_SIDEBAR_WIDTH_MIN) / 2)}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowLeft") {
                                event.preventDefault();
                                setWidth(width - 12);
                            } else if (event.key === "ArrowRight") {
                                event.preventDefault();
                                setWidth(width + 12);
                            }
                        }}
                        className={cn(
                            "absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none",
                            "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors",
                            "hover:after:bg-emerald-400/70 focus-visible:outline-none focus-visible:after:bg-emerald-400",
                            resizing && "after:bg-emerald-400",
                        )}
                    />
                ) : null}
            </aside>

            <div className="border-border bg-background flex h-12 w-full shrink-0 items-center justify-between gap-2 border-b px-2 md:hidden">
                <div className="flex min-w-0 items-center gap-1.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setMobileNavOpen(true)}
                        aria-label={t("topNav.openMenu")}
                        aria-expanded={mobileNavOpen}
                    >
                        <Menu className="size-5" />
                    </Button>
                    {homeLink}
                </div>
                <div className="flex items-center gap-0.5">
                    <VersionReleaseModal className="px-1.5 text-[11px] font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white" />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openConfigDialog(false)}
                        aria-label={t("navigation.config")}
                    >
                        <Settings2 className="size-4" />
                    </Button>
                    <AnimatedThemeToggler
                        theme={theme}
                        onThemeChange={setTheme}
                        className="inline-flex size-8 items-center justify-center rounded-md"
                        aria-label={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
                    />
                </div>
            </div>

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
