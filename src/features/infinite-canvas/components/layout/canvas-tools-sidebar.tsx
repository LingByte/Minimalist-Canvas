import { Menu, Settings2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { startTransition, useCallback, useState, type MouseEvent } from "react";

import { navigationTools, navigationToolActive, type NavigationToolSlug } from "@canvas/constant/navigation-tools";
import { AppConfigModal } from "@canvas/components/layout/app-config-modal";
import { MobileNavDrawer } from "@canvas/components/layout/mobile-nav-drawer";
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
import { DEFAULT_LOGO, DEFAULT_SYSTEM_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { isObjectStorageConfigured, useConfigStore } from "@canvas/stores/use-config-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";

function activeToolFromPath(pathname: string): NavigationToolSlug | undefined {
    const slug = pathname.split("/").filter(Boolean)[0];
    if (!slug) return undefined;
    const matched = navigationTools.find((tool) => navigationToolActive(tool.slug, slug));
    return matched?.slug;
}

function isModifiedClick(event: MouseEvent) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

/** Canvas workbench chrome: vertical tool rail. */
export function CanvasToolsSidebar(props: { className?: string }) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { embedded, homeHref, logo, brandName } = useCanvasHost();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const objectStorage = useConfigStore((state) => state.objectStorage);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const storageConfigured = isObjectStorageConfigured(objectStorage);
    const visibleTools = navigationTools.filter((tool) => tool.slug !== "storage" || storageConfigured);

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
        [navigate],
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
        <a href={homeHref} className="flex items-center justify-center transition-opacity hover:opacity-90" aria-label={brand}>
            {logoImage}
        </a>
    ) : (
        <Link to="/" className="flex items-center justify-center transition-opacity hover:opacity-90" aria-label={brand}>
            {logoImage}
        </Link>
    );

    return (
        <>
            <aside
                className={cn(
                    "bg-sidebar text-sidebar-foreground border-sidebar-border hidden h-dvh w-[4.75rem] shrink-0 flex-col items-center border-r md:flex",
                    props.className,
                )}
                aria-label={t("topNav.navigation")}
            >
                <div className="flex h-14 w-full items-center justify-center px-2">{homeLink}</div>

                <nav className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {visibleTools.map((tool) => {
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
                    <TooltipProvider delay={280}>
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        data-tour="config-settings-button"
                                        className="text-sidebar-foreground/55 hover:text-sidebar-foreground size-9 rounded-[0.7rem] border border-transparent hover:border-stone-200/80 hover:bg-stone-100/80 dark:hover:border-stone-700/80 dark:hover:bg-stone-800/70"
                                        onClick={() => openConfigDialog(false)}
                                        aria-label={t("navigation.config")}
                                    />
                                }
                            >
                                <Settings2 className="size-[1.15rem] stroke-[2]" />
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={10}>
                                {t("navigation.config")}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <AnimatedThemeToggler
                        theme={theme}
                        onThemeChange={setTheme}
                        className="text-sidebar-foreground/55 hover:text-sidebar-foreground inline-flex size-9 items-center justify-center rounded-[0.7rem] border border-transparent transition-colors hover:border-stone-200/80 hover:bg-stone-100/80 dark:hover:border-stone-700/80 dark:hover:bg-stone-800/70"
                        aria-label={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
                        title={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
                    />
                </div>
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
