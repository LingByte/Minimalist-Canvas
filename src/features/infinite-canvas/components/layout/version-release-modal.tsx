import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useVersionCheck } from "@canvas/hooks/use-version-check";
import { APP_VERSION } from "@canvas/constant/env";

type VersionReleaseModalProps = {
    className?: string;
    style?: CSSProperties;
};

/** Sidebar version control — opens the scroll-story changelog page. */
export function VersionReleaseModal({ className, style }: VersionReleaseModalProps) {
    const { t } = useTranslation();
    const { hasNewVersion } = useVersionCheck();

    return (
        <Link
            to="/changelog"
            className={
                className ||
                "shrink-0 cursor-pointer text-xs font-medium text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white"
            }
            style={style}
            title={t("version.viewUpdates")}
        >
            <span className="relative inline-flex">
                {APP_VERSION}
                {hasNewVersion ? <span className="absolute -right-1.5 -top-1 size-1.5 rounded-full bg-green-500" /> : null}
            </span>
        </Link>
    );
}
