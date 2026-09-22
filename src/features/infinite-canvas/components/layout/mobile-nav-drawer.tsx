import { LayoutDashboard } from "lucide-react";
import { Drawer } from "antd";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, navigationToolActive, type NavigationToolSlug } from "@canvas/constant/navigation-tools";
import { cn } from "@canvas/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const pathSlug = pathname.split("/").filter(Boolean)[0];

    return (
        <Drawer
            title={t("topNav.navigation")}
            placement="left"
            styles={{ section: { width: 280 } }}
            open={open}
            onClose={onClose}
            className="md:hidden"
        >
            <div className="space-y-1">
                <Link
                    to="/dashboard"
                    onClick={onClose}
                    className="mb-2 flex items-center gap-3 rounded-xl bg-sky-500/8 px-4 py-3 text-sm font-medium tracking-tight text-sky-700 transition-colors hover:bg-sky-500/12 dark:text-sky-300"
                >
                    <LayoutDashboard className="size-4" />
                    <span>{t("Back to Dashboard")}</span>
                </Link>
                {navigationTools.map((tool) => {
                    const Icon = tool.icon;
                    const active = activeToolSlug
                        ? tool.slug === activeToolSlug
                        : navigationToolActive(tool.slug, pathSlug);
                    return (
                        <Link
                            key={tool.slug}
                            to={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium tracking-tight transition-colors duration-200",
                                active
                                    ? "bg-sky-500/10 text-sky-600 dark:bg-sky-400/12 dark:text-sky-300"
                                    : "text-muted-foreground hover:bg-sky-500/8 hover:text-sky-700 dark:hover:text-sky-200",
                            )}
                        >
                            {active ? (
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute inset-x-4 -bottom-0.5 h-[3px] rounded-full bg-sky-500 dark:bg-sky-400"
                                />
                            ) : null}
                            <Icon className="size-4" />
                            <span>{t(`navigation.${tool.slug}`)}</span>
                        </Link>
                    );
                })}
            </div>
        </Drawer>
    );
}
