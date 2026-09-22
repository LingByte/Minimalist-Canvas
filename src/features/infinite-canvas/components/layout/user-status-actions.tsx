import type { CSSProperties, ReactNode } from "react";
import { Dropdown } from "antd";
import { Keyboard, MoreHorizontal, Puzzle, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ProfileDropdown } from "@/components/profile-dropdown";
import { ThemeSwitch } from "@/components/theme-switch";

import { AnimatedThemeToggler } from "@canvas/components/ui/animated-theme-toggler";
import { useCanvasHost } from "@canvas/integration/canvas-host-context";
import { cn } from "@canvas/lib/utils";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { useConfigStore } from "@canvas/stores/use-config-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    /** Collapse secondary actions into a "more" menu below the md breakpoint. */
    compactOnMobile?: boolean;
    /** Vertical stack for narrow sidebars; default is a horizontal row. */
    orientation?: "horizontal" | "vertical";
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

type MoreMenuItem = {
    key: string;
    icon?: ReactNode;
    label: string;
    onClick: () => void;
};

export function UserStatusActions({
    showConfig = true,
    variant = "default",
    compactOnMobile = false,
    orientation = "horizontal",
    onOpenShortcuts,
    onOpenPlugins,
}: UserStatusActionsProps) {
    const { t } = useTranslation();
    const { embedded } = useCanvasHost();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass =
        "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-black/5 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    // Use md (768px) so phone/tablet portrait keep the compact strip.
    const desktopOnlyClass = compactOnMobile ? "hidden md:inline-flex" : "inline-flex";

    const moreMenuItems: MoreMenuItem[] = [
        ...(onOpenPlugins
            ? [
                  {
                      key: "plugins",
                      icon: <Puzzle className="size-4" />,
                      label: t("topNav.plugins"),
                      onClick: onOpenPlugins,
                  } satisfies MoreMenuItem,
              ]
            : []),
        ...(showConfig
            ? [
                  {
                      key: "config",
                      icon: <Settings2 className="size-4" />,
                      label: t("navigation.config"),
                      onClick: () => openConfigDialog(false),
                  } satisfies MoreMenuItem,
              ]
            : []),
        ...(onOpenShortcuts
            ? [
                  {
                      key: "shortcuts",
                      icon: <Keyboard className="size-4" />,
                      label: t("topNav.shortcuts"),
                      onClick: onOpenShortcuts,
                  } satisfies MoreMenuItem,
              ]
            : []),
    ];

    const stack = orientation === "vertical";

    return (
        <div
            className={cn(
                "shrink-0",
                stack
                    ? "flex w-full flex-col items-center gap-1.5"
                    : "inline-flex items-center gap-0.5 md:gap-1",
            )}
        >
            {onOpenPlugins ? (
                <button
                    type="button"
                    className={cn(naturalIconClass, desktopOnlyClass)}
                    style={iconStyle}
                    onClick={onOpenPlugins}
                    aria-label={t("topNav.plugins")}
                    title={t("topNav.plugins")}
                >
                    <Puzzle className="size-4" />
                </button>
            ) : null}

            {showConfig ? (
                <button
                    type="button"
                    data-tour="config-settings-button"
                    className={cn(naturalIconClass, desktopOnlyClass)}
                    style={iconStyle}
                    onClick={() => openConfigDialog(false)}
                    aria-label={t("navigation.config")}
                    title={t("navigation.config")}
                >
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            {embedded ? (
                <span className={cn(desktopOnlyClass, stack ? "flex flex-col items-center gap-1.5" : "items-center gap-1")}>
                    <ThemeSwitch />
                </span>
            ) : (
                <AnimatedThemeToggler
                    theme={theme}
                    onThemeChange={setTheme}
                    className={cn(naturalIconClass, desktopOnlyClass)}
                    style={iconStyle}
                    aria-label={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
                    title={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
                />
            )}
            {onOpenShortcuts ? (
                <button
                    type="button"
                    className={cn(naturalIconClass, desktopOnlyClass)}
                    style={iconStyle}
                    onClick={onOpenShortcuts}
                    aria-label={t("topNav.shortcuts")}
                    title={t("topNav.shortcuts")}
                >
                    <Keyboard className="size-4" />
                </button>
            ) : null}

            {compactOnMobile && moreMenuItems.length > 0 ? (
                <Dropdown menu={{ items: moreMenuItems }} trigger={["click"]} placement="bottomRight">
                    <button
                        type="button"
                        className={cn(naturalIconClass, "md:hidden")}
                        style={iconStyle}
                        aria-label={t("topNav.moreActions")}
                        title={t("topNav.moreActions")}
                    >
                        <MoreHorizontal className="size-4" />
                    </button>
                </Dropdown>
            ) : null}
            <ProfileDropdown />
        </div>
    );
}
