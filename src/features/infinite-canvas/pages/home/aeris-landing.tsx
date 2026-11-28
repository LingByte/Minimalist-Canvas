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
    startTransition,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { DEFAULT_SYSTEM_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const EXIT_NAV_MS = 380;

const PRODUCT_SHOTS = [
    "/images/home/product-stack-1.jpg",
    "/images/home/product-stack-2.jpg",
    "/images/home/product-stack-3.jpg",
    "/images/home/product-stack-4.jpg",
    "/images/home/product-stack-5.jpg",
] as const;

const SCATTER_SLOTS = [
    { x: 6, y: 12, s: 34, r: -14, o: 0.14 },
    { x: 14, y: 28, s: 28, r: 8, o: 0.11 },
    { x: 9, y: 52, s: 40, r: -6, o: 0.13 },
    { x: 18, y: 74, s: 30, r: 16, o: 0.1 },
    { x: 27, y: 18, s: 26, r: -20, o: 0.12 },
    { x: 31, y: 44, s: 36, r: 4, o: 0.09 },
    { x: 24, y: 66, s: 32, r: -10, o: 0.12 },
    { x: 38, y: 82, s: 28, r: 12, o: 0.1 },
    { x: 46, y: 14, s: 30, r: -8, o: 0.11 },
    { x: 52, y: 36, s: 24, r: 18, o: 0.09 },
    { x: 48, y: 58, s: 34, r: -16, o: 0.12 },
    { x: 56, y: 78, s: 28, r: 6, o: 0.1 },
    { x: 64, y: 20, s: 32, r: 10, o: 0.13 },
    { x: 70, y: 42, s: 26, r: -12, o: 0.1 },
    { x: 66, y: 64, s: 38, r: 8, o: 0.12 },
    { x: 74, y: 84, s: 30, r: -18, o: 0.09 },
    { x: 82, y: 16, s: 28, r: 14, o: 0.11 },
    { x: 88, y: 34, s: 36, r: -4, o: 0.13 },
    { x: 84, y: 56, s: 30, r: 20, o: 0.1 },
    { x: 92, y: 72, s: 34, r: -8, o: 0.12 },
    { x: 4, y: 86, s: 26, r: 10, o: 0.09 },
    { x: 96, y: 48, s: 28, r: -14, o: 0.1 },
    { x: 42, y: 48, s: 22, r: 22, o: 0.08 },
    { x: 78, y: 48, s: 24, r: -22, o: 0.08 },
    { x: 12, y: 40, s: 22, r: 0, o: 0.08 },
] as const;

const SCATTER_ICONS = [LayoutDashboard, ImageIcon, Clapperboard, Mic2, Wand2, Blocks, Sparkles] as const;

type EqItem = { id: string; label: string; icon: (typeof SCATTER_ICONS)[number] };

interface AerisLandingProps {
    className?: string;
}

function ToolScatter() {
    return (
        <div className="aeris-scatter" aria-hidden="true">
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
                        <Icon strokeWidth={1.6} className="size-full" />
                    </span>
                );
            })}
        </div>
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
            <span className="aeris-eq-brand">{DEFAULT_SYSTEM_NAME}</span>
            <span className="aeris-eq-op">=</span>
            <RotateSlot items={slotA} period={2800} />
            <span className="aeris-eq-op">+</span>
            <RotateSlot items={slotB} period={1700} />
            <span className="aeris-eq-op">+</span>
            <RotateSlot items={slotC} period={2400} />
        </p>
    );
}

function ProductStack() {
    return (
        <div className="aeris-product-stack" aria-hidden="true">
            <div className="aeris-product-stage">
                {PRODUCT_SHOTS.map((src, index) => (
                    <div key={src} className={cn("aeris-product-shot", `aeris-product-shot-${index}`)}>
                        <div className="aeris-product-frame">
                            <img src={src} alt="" decoding="async" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function AerisLanding(props: AerisLandingProps) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [leaving, setLeaving] = useState(false);

    const titleParts = useMemo(() => {
        const full = t("home.aerisTagline");
        if (full.includes("，")) {
            const [a, b] = full.split("，");
            return { a: a.trim(), b: (b || "").replace(/。$/, "").trim() };
        }
        if (full.includes(". ")) {
            const [a, b] = full.split(". ");
            return { a: `${a.trim()}.`, b: (b || "").trim() };
        }
        return { a: full, b: "" };
    }, [t]);
    const support = t("home.aerisSupport");

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
        <main className={cn("aeris-landing", leaving && "is-leaving", props.className)}>
            <div className="aeris-glow" aria-hidden="true" />
            <ToolScatter />

            <div className="aeris-intro">
                <div className="aeris-intro-hero">
                    <div className="aeris-intro-copy">
                        <h1 aria-label={[titleParts.a, titleParts.b].filter(Boolean).join(" ")}>
                            <span>{titleParts.a}</span>
                            {titleParts.b ? <span>{titleParts.b}</span> : null}
                        </h1>
                        <p>{support}</p>
                        <EquationLine locale={i18n.language || "zh"} />
                    </div>
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
                    </div>
                </div>
                <ProductStack />
            </div>
        </main>
    );
}
