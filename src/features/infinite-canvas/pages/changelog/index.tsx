import { Button, Progress } from "antd";
import { ArrowLeft, Minus, Plus, RefreshCw, Sparkles, Wrench } from "lucide-react";
import {
    motion,
    useMotionValueEvent,
    useReducedMotion,
    useScroll,
    useSpring,
    useTransform,
    type MotionValue,
} from "motion/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { APP_VERSION } from "@canvas/constant/env";
import { useVersionCheck } from "@canvas/hooks/use-version-check";
import { releaseTypeLabel, releaseTypeTone } from "@canvas/lib/release-labels";
import type { ReleaseInfo } from "@canvas/lib/release";
import { isTauri } from "@canvas/services/fs-store";
import { cn } from "@canvas/lib/utils";
import { DEFAULT_SYSTEM_NAME } from "@/lib/constants";

import { CartoonRootSpine } from "./cartoon-root-spine";
import "./release-story.css";

function TypeGlyph({ tone }: { tone: ReturnType<typeof releaseTypeTone> }) {
    if (tone === "added") return <Plus className="size-3.5" strokeWidth={2.4} />;
    if (tone === "fixed") return <Wrench className="size-3.5" strokeWidth={2.2} />;
    if (tone === "changed") return <RefreshCw className="size-3.5" strokeWidth={2.2} />;
    if (tone === "optimized") return <Sparkles className="size-3.5" strokeWidth={2.2} />;
    return <Minus className="size-3.5" strokeWidth={2.2} />;
}

function ReleaseItem({
    type,
    content,
    index,
    active,
    reduceMotion,
}: {
    type: string;
    content: string;
    index: number;
    active: boolean;
    reduceMotion: boolean | null;
}) {
    const { t } = useTranslation();
    const tone = releaseTypeTone(type);
    return (
        <motion.li
            className={cn("release-item", `tone-${tone}`)}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={active || reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.42, delay: reduceMotion ? 0 : 0.06 + index * 0.045, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="release-item-mark" aria-hidden="true">
                <TypeGlyph tone={tone} />
            </div>
            <div className="release-item-copy">
                <span className="release-item-type">{releaseTypeLabel(type, t)}</span>
                <p className="release-item-text">{content}</p>
            </div>
        </motion.li>
    );
}

function ReleaseChapter({
    release,
    index,
    total,
    latestVersion,
    grow,
}: {
    release: ReleaseInfo;
    index: number;
    total: number;
    latestVersion: string;
    grow: MotionValue<number>;
}) {
    const { t } = useTranslation();
    const reduceMotion = useReducedMotion();
    const flip = index % 2 === 1;
    const title = release.version === "Unreleased" ? t("version.unreleased") : release.version;

    const revealAt = total <= 1 ? 0.08 : (index + 0.12) / total;
    const [revealed, setRevealed] = useState(() => Boolean(reduceMotion) || grow.get() >= revealAt);

    useMotionValueEvent(grow, "change", (value) => {
        if (reduceMotion || value >= revealAt) setRevealed(true);
    });

    return (
        <section
            className={cn("release-chapter", flip ? "is-right" : "is-left", revealed && "is-active")}
            aria-labelledby={`release-${index}`}
            aria-hidden={!revealed}
        >
            <motion.div
                className="release-chapter-node"
                aria-hidden="true"
                initial={false}
                animate={revealed || reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.div
                className="release-chapter-body"
                initial={reduceMotion ? false : { opacity: 0, x: flip ? 32 : -32, y: 28, filter: "blur(8px)" }}
                animate={
                    revealed || reduceMotion
                        ? { opacity: 1, x: 0, y: 0, filter: "blur(0px)" }
                        : { opacity: 0, x: flip ? 24 : -24, y: 20, filter: "blur(8px)" }
                }
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                style={{ pointerEvents: revealed || reduceMotion ? "auto" : "none" }}
            >
                <div className="release-chapter-meta">
                    <p className="release-chapter-index">{String(index + 1).padStart(2, "0")}</p>
                    <h2 id={`release-${index}`}>{title}</h2>
                    <div className="release-chapter-tags">
                        {release.date ? <span>{release.date}</span> : null}
                        {release.version === latestVersion ? (
                            <span className="is-latest">{t("version.latest")}</span>
                        ) : null}
                        {release.version === APP_VERSION ? (
                            <span className="is-current">{t("version.current")}</span>
                        ) : null}
                    </div>
                </div>
                <ol className="release-chapter-items">
                    {release.items.map((item, itemIndex) => (
                        <ReleaseItem
                            key={`${release.version}-${itemIndex}`}
                            type={item.type}
                            content={item.content}
                            index={itemIndex}
                            active={revealed}
                            reduceMotion={reduceMotion}
                        />
                    ))}
                </ol>
            </motion.div>
        </section>
    );
}

function VersionDock({
    latestVersion,
    checking,
    installing,
    onCheck,
}: {
    latestVersion: string;
    checking: boolean;
    installing: boolean;
    onCheck: () => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="release-version-dock">
            <div className="release-version-rows">
                <div>
                    <span>{t("version.currentVersion")}</span>
                    <strong>{APP_VERSION}</strong>
                </div>
                <div>
                    <span>{t("version.latestVersion")}</span>
                    <strong>{latestVersion}</strong>
                </div>
            </div>
            <button type="button" disabled={checking || installing} onClick={onCheck}>
                {t(checking ? "version.checking" : "version.checkUpdates")}
            </button>
        </div>
    );
}

export default function ChangelogPage() {
    const { t } = useTranslation();
    const reduceMotion = useReducedMotion();
    const scrollerRef = useRef<HTMLElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const {
        latestVersion,
        releases,
        checking,
        installing,
        hasNewVersion,
        updateNotes,
        progress,
        checkLatestRelease,
        installUpdate,
    } = useVersionCheck();

    const { scrollYProgress } = useScroll({
        container: scrollerRef,
        target: timelineRef,
        offset: ["start 0.7", "end 0.92"],
    });
    const smooth = useSpring(scrollYProgress, { stiffness: 56, damping: 28, mass: 0.42 });
    const grow = useTransform(smooth, (value) => (reduceMotion ? 1 : Math.min(1, Math.max(0.06, value))));
    const progressWidth = useTransform(smooth, (value) => `${Math.round(value * 100)}%`);

    const progressPercent =
        progress && progress.total && progress.total > 0
            ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
            : installing
              ? undefined
              : 0;

    return (
        <main ref={scrollerRef} className="release-story">
            <motion.div className="release-progress" style={{ width: progressWidth }} aria-hidden="true" />

            <header className="release-top">
                <Link to="/" className="release-back">
                    <ArrowLeft className="size-4" />
                    {t("version.backHome")}
                </Link>
            </header>

            <section className="release-hero">
                <div className="release-hero-copy">
                    <p className="release-hero-brand">{DEFAULT_SYSTEM_NAME}</p>
                    <p className="release-hero-kicker">{t("version.storyKicker")}</p>
                    <h1>{t("version.storyTitle")}</h1>
                </div>
                <VersionDock
                    latestVersion={latestVersion}
                    checking={checking}
                    installing={installing}
                    onCheck={() => void checkLatestRelease(true)}
                />
            </section>

            {isTauri() && hasNewVersion ? (
                <div className="release-update-banner">
                    <div>
                        <p>{t("version.updateAvailable", { version: latestVersion })}</p>
                        {updateNotes ? <p className="release-update-notes">{updateNotes}</p> : null}
                    </div>
                    {installing ? (
                        <div className="release-update-progress">
                            <Progress
                                percent={progressPercent}
                                status={progressPercent == null ? "active" : undefined}
                                size="small"
                            />
                            <span>{t("version.downloading")}</span>
                        </div>
                    ) : (
                        <Button type="primary" onClick={() => void installUpdate()}>
                            {t("version.downloadAndInstall")}
                        </Button>
                    )}
                </div>
            ) : null}

            <div ref={timelineRef} className="release-timeline">
                {releases.length ? <CartoonRootSpine grow={grow} /> : null}
                {releases.length ? (
                    releases.map((release, index) => (
                        <ReleaseChapter
                            key={`${release.version}-${release.date}-${index}`}
                            release={release}
                            index={index}
                            total={releases.length}
                            latestVersion={latestVersion}
                            grow={grow}
                        />
                    ))
                ) : (
                    <p className="release-empty">{t("version.changelogFailed")}</p>
                )}
            </div>

            <footer className="release-footer">
                <p>{DEFAULT_SYSTEM_NAME}</p>
                <Link to="/canvas">{t("home.enterCanvas")}</Link>
            </footer>
        </main>
    );
}
