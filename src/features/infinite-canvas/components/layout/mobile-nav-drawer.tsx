import { Drawer } from "antd";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

import {
    groupedNavigationTools,
    navigationToolActive,
    navigationToolHref,
    type NavigationToolSlug,
} from "@canvas/constant/navigation-tools";
import { isObjectStorageConfigured } from "@canvas/lib/object-storage/types";
import { isTauri } from "@canvas/services/fs-store";
import { cn } from "@canvas/lib/utils";
import { useConfigStore } from "@canvas/stores/use-config-store";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const pathSlug = pathname.split("/").filter(Boolean)[0];
    const objectStorage = useConfigStore((state) => state.objectStorage);
    const storageReady = isObjectStorageConfigured(objectStorage);
    const desktop = isTauri();
    const sections = useMemo(
        () => groupedNavigationTools({ storageReady, desktop }),
        [storageReady, desktop],
    );

    return (
        <Drawer
            title={t("topNav.navigation")}
            placement="left"
            size={280}
            open={open}
            onClose={onClose}
            className="md:hidden"
        >
            <div className="space-y-5">
                {sections.map((section) => (
                    <section key={section.id} className="space-y-1.5">
                        <h3 className="px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                            {t(`navigation.groups.${section.id}`)}
                        </h3>
                        <div className="space-y-1">
                            {section.tools.map((tool) => {
                                const Icon = tool.icon;
                                const active = activeToolSlug
                                    ? tool.slug === activeToolSlug
                                    : navigationToolActive(tool.slug, pathSlug);
                                return (
                                    <Link
                                        key={tool.slug}
                                        to={navigationToolHref(tool.slug)}
                                        onClick={onClose}
                                        className={cn(
                                            "relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium tracking-tight transition-colors duration-200",
                                            active
                                                ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300"
                                                : "text-muted-foreground hover:bg-stone-500/8 hover:text-stone-800 dark:hover:text-stone-100",
                                        )}
                                    >
                                        {active ? (
                                            <span
                                                aria-hidden
                                                className="pointer-events-none absolute inset-y-2 left-1.5 w-[3px] rounded-full bg-emerald-500 dark:bg-emerald-400"
                                            />
                                        ) : null}
                                        <Icon className="size-4" />
                                        <span>{t(`navigation.${tool.slug}`)}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </Drawer>
    );
}
