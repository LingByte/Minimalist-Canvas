import {
    Blocks,
    Clapperboard,
    Image as ImageIcon,
    LayoutDashboard,
    Mic2,
    Sparkles,
    Wand2,
} from "lucide-react";
import {
    motion,
    useReducedMotion,
    useScroll,
    useSpring,
    useTransform,
} from "motion/react";
import {
    startTransition,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { APP_VERSION, DOCS_URL } from "@canvas/constant/env";
import { DEFAULT_LOGO } from "@/lib/constants";
import { cn } from "@/lib/utils";

const GITHUB_RELEASES_URL = "https://github.com/LingByte/Minimalist-Canvas/releases";

const EXIT_NAV_MS = 380;
const HOME_INTRO_SEEN_KEY = "minimalist-canvas:home-intro-seen-v1";

function hasSeenHomeIntro() {
    if (typeof window === "undefined") return true;
    try {
        return window.localStorage.getItem(HOME_INTRO_SEEN_KEY) === "1";
    } catch {
        return true;
    }
}

function markHomeIntroSeen() {
    try {
        window.localStorage.setItem(HOME_INTRO_SEEN_KEY, "1");
    } catch {
        // ignore quota / private mode
    }
}

const PRODUCT_SHOTS = [
    "/images/home/product-stack-1.jpg",
    "/images/home/product-stack-2.jpg",
    "/images/home/product-stack-3.jpg",
    "/images/home/product-stack-4.jpg",
    "/images/home/product-stack-5.jpg",
] as const;

const SCATTER_SLOTS = [
    { x: 8, y: 14, s: 28, r: -12, o: 0.1 },
    { x: 18, y: 32, s: 22, r: 8, o: 0.08 },
    { x: 12, y: 58, s: 30, r: -6, o: 0.09 },
    { x: 28, y: 22, s: 24, r: 14, o: 0.08 },
    { x: 36, y: 48, s: 26, r: -10, o: 0.07 },
    { x: 72, y: 18, s: 26, r: 10, o: 0.09 },
    { x: 84, y: 36, s: 30, r: -8, o: 0.1 },
    { x: 78, y: 62, s: 24, r: 12, o: 0.08 },
    { x: 90, y: 78, s: 28, r: -14, o: 0.09 },
    { x: 64, y: 72, s: 22, r: 6, o: 0.07 },
] as const;

const SCATTER_ICONS = [LayoutDashboard, ImageIcon, Clapperboard, Mic2, Wand2, Blocks, Sparkles] as const;

type EqItem = { id: string; label: string; icon: (typeof SCATTER_ICONS)[number] };

interface AerisLandingProps {
    className?: string;
}

function ToolScatter({ y }: { y: ReturnType<typeof useTransform<number, number>> }) {
    return (
        <motion.div className="aeris-scatter" aria-hidden="true" style={{ y }}>
            {SCATTER_SLOTS.map((slot, index) => {
                const Icon = SCATTER_ICONS[index % SCATTER_ICONS.length];
                return (
                    <span
                        key={`${slot.x}-${slot.y}-${index}`}
                        className="aeris-scatter-mark"
                        style={{
                            left: `${slot.x}%`,
                            top: `${slot.y}%`,
                            width: slot.s,
                            height: slot.s,
                            opacity: slot.o,
                            transform: `translate(-50%, -50%) rotate(${slot.r}deg)`,
                        }}
                    >
                        <Icon strokeWidth={1.5} className="size-full" />
                    </span>
                );
            })}
        </motion.div>
    );
}

function RotateSlot({ items, period }: { items: EqItem[]; period: number }) {
    const [index, setIndex] = useState(0);
    const measureRef = useRef<HTMLSpanElement>(null);
    const [width, setWidth] = useState<number>();
    const item = items[index % items.length];
    const Icon = item.icon;

    useLayoutEffect(() => {
        const node = measureRef.current;
        if (!node) return;
        setWidth(Math.ceil(node.getBoundingClientRect().width));
    }, [item.id, item.label]);

    useEffect(() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce) return;
        const id = window.setInterval(() => {
            setIndex((value) => (value + 1) % items.length);
        }, period);
        return () => window.clearInterval(id);
    }, [items.length, period]);

    return (
        <span className="aeris-eq-slot" style={width ? { width } : undefined}>
            <span ref={measureRef} className="aeris-eq-slot-measure" aria-hidden="true">
                <Icon className="aeris-eq-glyph" strokeWidth={1.8} />
                {item.label}
            </span>
            <span key={item.id} className="aeris-eq-slot-in">
                <Icon className="aeris-eq-glyph" strokeWidth={1.8} />
                {item.label}
            </span>
        </span>
    );
}

function EquationLine({ locale }: { locale: string }) {
    const zh = locale.toLowerCase().startsWith("zh");
    const slotA = useMemo<EqItem[]>(
        () => [
            { id: "canvas", label: zh ? "无限画布" : "Infinite canvas", icon: LayoutDashboard },
            { id: "studio", label: zh ? "创作台" : "Studio", icon: Sparkles },
            { id: "board", label: zh ? "分镜板" : "Storyboard", icon: Clapperboard },
        ],
        [zh],
    );
    const slotB = useMemo<EqItem[]>(
        () => [
            { id: "image", label: zh ? "生图" : "Image", icon: ImageIcon },
            { id: "video", label: zh ? "视频" : "Video", icon: Clapperboard },
            { id: "voice", label: zh ? "语音" : "Voice", icon: Mic2 },
            { id: "agent", label: "Agent", icon: Wand2 },
        ],
        [zh],
    );
    const slotC = useMemo<EqItem[]>(
        () => [
            { id: "skills", label: "Skills", icon: Blocks },
            { id: "meme", label: zh ? "梗包拉片" : "Meme pack", icon: Sparkles },
            { id: "local", label: zh ? "本地优先" : "Local-first", icon: Wand2 },
        ],
        [zh],
    );

    return (
        <p className="aeris-eq-line">
            <RotateSlot items={slotA} period={2800} />
            <span className="aeris-eq-op">+</span>
            <RotateSlot items={slotB} period={1700} />
            <span className="aeris-eq-op">+</span>
            <RotateSlot items={slotC} period={2400} />
        </p>
    );
}

function ProductStack({ fan }: { fan: ReturnType<typeof useTransform<number, number>> }) {
    const t0 = useTransform(fan, (v) => `translate(${-8 - v * 40}%, ${8 + v * 8}%) rotate(${-7 - v * 15}deg)`);
    const t1 = useTransform(fan, (v) => `translate(${-4 - v * 22}%, ${4 + v * 4}%) rotate(${-3.5 - v * 7.5}deg)`);
    const t2 = useTransform(fan, (v) => `translate(0, ${-v * 6}%) rotate(0deg) scale(${1 + v * 0.03})`);
    const t3 = useTransform(fan, (v) => `translate(${4 + v * 22}%, ${4 + v * 4}%) rotate(${3.5 + v * 7.5}deg)`);
    const t4 = useTransform(fan, (v) => `translate(${8 + v * 40}%, ${8 + v * 8}%) rotate(${7 + v * 15}deg)`);
    const offsets = [t0, t1, t2, t3, t4];

    return (
        <div className="aeris-product-stack" aria-hidden="true">
            <div className="aeris-product-stage">
                {PRODUCT_SHOTS.map((src, index) => (
                    <motion.div
                        key={src}
                        className={cn("aeris-product-shot", `aeris-product-shot-${index}`)}
                        style={{ transform: offsets[index] }}
                    >
                        <div className="aeris-product-frame">
                            <img src={src} alt="" decoding="async" />
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

export function AerisLanding(props: AerisLandingProps) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const reduceMotion = useReducedMotion();
    const [leaving, setLeaving] = useState(false);
    const [introDone, setIntroDone] = useState(() => Boolean(reduceMotion) || hasSeenHomeIntro());
    const scrollerRef = useRef<HTMLElement>(null);

    const { scrollYProgress } = useScroll({ container: scrollerRef });
    const smooth = useSpring(scrollYProgress, { stiffness: 85, damping: 28, mass: 0.4 });
    const heroFade = useTransform(smooth, [0, 0.32], [1, 0.4]);
    const heroLift = useTransform(smooth, [0, 0.35], reduceMotion ? [0, 0] : [0, 36]);
    const scatterY = useTransform(smooth, [0, 0.4], reduceMotion ? [0, 0] : [0, 70]);
    const fan = useTransform(smooth, [0, 0.26], reduceMotion ? [0, 0] : [0, 1]);
    const chapterY = useTransform(smooth, [0.25, 0.7], reduceMotion ? [0, 0] : [60, -40]);
    const studioY = useTransform(smooth, [0.45, 0.95], reduceMotion ? [0, 0] : [50, -36]);

    useEffect(() => {
        if (reduceMotion || hasSeenHomeIntro()) {
            setIntroDone(true);
            markHomeIntroSeen();
            return;
        }
        const id = window.setTimeout(() => {
            markHomeIntroSeen();
            setIntroDone(true);
        }, 3100);
        return () => window.clearTimeout(id);
    }, [reduceMotion]);

    const enterCanvas = useCallback(() => {
        if (leaving) return;
        setLeaving(true);
        window.setTimeout(() => {
            startTransition(() => {
                navigate("/canvas");
            });
        }, EXIT_NAV_MS);
    }, [leaving, navigate]);

    return (
        <main
            ref={scrollerRef}
            className={cn(
                "aeris-landing aeris-landing-scroll",
                introDone && "is-ready",
                leaving && "is-leaving",
                props.className,
            )}
        >
            <div className="aeris-intro-veil" aria-hidden="true">
                <div className="aeris-intro-letterbox aeris-intro-letterbox-top" />
                <div className="aeris-intro-letterbox aeris-intro-letterbox-bottom" />
                <div className="aeris-intro-stage">
                    <img className="aeris-intro-plate" src="/images/home/intro-plate.png" alt="" decoding="async" />
                    <img className="aeris-intro-focus" src="/images/home/intro-focus.png" alt="" decoding="async" />
                    <img className="aeris-intro-canvas" src="/images/home/intro-canvas.png" alt="" decoding="async" />
                    <div className="aeris-intro-shade" />
                </div>
                <div className="aeris-intro-brand">
                    <p className="aeris-intro-brand-name">{t("home.productName")}</p>
                </div>
            </div>

            <section className="aeris-hero">
                <div className="aeris-hero-bleed" aria-hidden="true">
                    <img src="/images/home/hero-bleed.png" alt="" decoding="async" />
                </div>
                <motion.div className="aeris-hero-mist" aria-hidden="true" style={{ y: heroLift }} />
                <ToolScatter y={scatterY} />

                <motion.div
                    className="aeris-hero-stage"
                    initial={reduceMotion || introDone ? false : { opacity: 0, y: 18 }}
                    animate={introDone || reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 10 }}
                    transition={{ duration: introDone ? 0 : 1.05, delay: reduceMotion || introDone ? 0 : 0.05, ease: [0.22, 1, 0.36, 1] }}
                >
                    <motion.div className="aeris-hero-stage-inner" style={{ opacity: heroFade }}>
                        <div className="aeris-hero-copy">
                            <h1>{t("home.aerisTagline")}</h1>
                            <p className="aeris-hero-support">{t("home.aerisSupport")}</p>
                            <EquationLine locale={i18n.language || "zh"} />
                            <div className="aeris-actions">
                                <button
                                    className="aeris-enter"
                                    type="button"
                                    disabled={leaving}
                                    onClick={() => {
                                        void enterCanvas();
                                    }}
                                >
                                    {t("home.enterCanvas")}
                                </button>
                                <Link className="aeris-secondary" to="/changelog">
                                    {t("home.viewChangelog")}
                                </Link>
                            </div>
                        </div>
                        <ProductStack fan={fan} />
                    </motion.div>
                </motion.div>
            </section>

            <section className="aeris-chapter">
                <motion.div className="aeris-chapter-media" style={{ y: chapterY }} aria-hidden="true">
                    <img src="/images/home/chapter-desk.png" alt="" decoding="async" />
                </motion.div>
                <div className="aeris-chapter-copy">
                    <h2>{t("home.chapterTitle")}</h2>
                    <p>{t("home.chapterBody")}</p>
                </div>
            </section>

            <section className="aeris-chapter aeris-chapter-flip">
                <motion.div className="aeris-chapter-media" style={{ y: studioY }} aria-hidden="true">
                    <img src="/images/home/studio-desk.png" alt="" decoding="async" />
                </motion.div>
                <div className="aeris-chapter-copy">
                    <h2>{t("home.studioTitle")}</h2>
                    <p>{t("home.studioBody")}</p>
                </div>
            </section>

            <footer className="aeris-footer">
                <div className="aeris-footer-shell">
                    <div className="aeris-footer-top">
                        <div className="aeris-footer-brand">
                            <div className="aeris-footer-identity">
                                <img
                                    className="aeris-footer-mark"
                                    src={DEFAULT_LOGO}
                                    alt=""
                                    width={36}
                                    height={36}
                                    decoding="async"
                                />
                                <div>
                                    <p className="aeris-footer-name">{t("home.productName")}</p>
                                    <p className="aeris-footer-tag">{t("home.footerTag")}</p>
                                </div>
                            </div>
                            <p className="aeris-footer-blurb">{t("home.footerBlurb")}</p>
                        </div>

                        <div className="aeris-footer-columns" aria-label={t("home.footerNav")}>
                            <nav className="aeris-footer-col">
                                <h3>{t("home.footerColCreate")}</h3>
                                <Link to="/canvas">{t("home.enterCanvas")}</Link>
                                <Link to="/image">{t("navigation.image")}</Link>
                                <Link to="/video">{t("navigation.video")}</Link>
                                <Link to="/changelog">{t("home.viewChangelog")}</Link>
                            </nav>
                            <nav className="aeris-footer-col">
                                <h3>{t("home.footerColLibrary")}</h3>
                                <Link to="/prompts">{t("navigation.prompts")}</Link>
                                <Link to="/assets">{t("navigation.assets")}</Link>
                                <Link to="/skills">{t("navigation.skills")}</Link>
                                <Link to="/integrate">{t("navigation.integrate")}</Link>
                            </nav>
                            <nav className="aeris-footer-col">
                                <h3>{t("home.footerColSystem")}</h3>
                                <Link to="/config">{t("navigation.config")}</Link>
                                <Link to="/usage">{t("navigation.usage")}</Link>
                                <Link to="/novels">{t("navigation.novels")}</Link>
                                <a href={DOCS_URL} target="_blank" rel="noreferrer">
                                    {t("home.footerDocs")}
                                </a>
                            </nav>
                        </div>
                    </div>

                    <div className="aeris-footer-bar">
                        <div className="aeris-footer-status">
                            <span className="aeris-footer-chip aeris-footer-chip-version">
                                {t("home.footerVersion", { version: APP_VERSION })}
                            </span>
                            <span className="aeris-footer-chip aeris-footer-chip-local">
                                {t("home.footerLocal")}
                            </span>
                        </div>
                        <div className="aeris-footer-legal">
                            <a href={GITHUB_RELEASES_URL} target="_blank" rel="noreferrer">
                                {t("home.footerReleases")}
                            </a>
                            <span className="aeris-footer-dot" aria-hidden="true" />
                            <span>© {new Date().getFullYear()} {t("home.productName")}</span>
                        </div>
                    </div>
                </div>
            </footer>
        </main>
    );
}
