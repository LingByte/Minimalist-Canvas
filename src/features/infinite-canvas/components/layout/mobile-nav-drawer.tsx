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
            size={280}
            open={open}
            onClose={onClose}
            className="md:hidden"
        >
            <div className="space-y-1">
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
