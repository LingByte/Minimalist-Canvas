import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Cpu, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@canvas/i18n";
import { cn } from "@canvas/lib/utils";
import { modelDescriptionOf, modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@canvas/stores/use-config-store";
import { SmartImage } from "@/components/smart-image";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
};

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder, onMissingConfig }: ModelPickerProps) {
    const { t } = useTranslation();
    const pickerId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
    const options = useMemo(() => Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))), [capability, config, value]);
    const current = value || "";
    const pickerPlaceholder = placeholder || t("settingsPanels.model.select");
    const filtered = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return options;
        return options.filter((model) => {
            const label = modelOptionLabel(config, model).toLowerCase();
            const name = modelOptionName(model).toLowerCase();
            const description = modelDescriptionOf(config, model).toLowerCase();
            return label.includes(keyword) || name.includes(keyword) || model.toLowerCase().includes(keyword) || description.includes(keyword);
        });
    }, [config, options, query]);

    const openPicker = () => {
        if (!options.length && config.channelMode === "local") onMissingConfig?.();
        window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
        const rect = rootRef.current?.getBoundingClientRect();
        if (rect) {
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            setPlacement(spaceAbove > spaceBelow && spaceBelow < 320 ? "top" : "bottom");
        }
        setOpen(true);
    };

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    useEffect(() => {
        if (!open) {
            setQuery("");
            return;
        }
        const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
        const close = (event: PointerEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target && rootRef.current?.contains(target)) return;
            setOpen(false);
        };
        window.addEventListener("pointerdown", close, true);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener("pointerdown", close, true);
        };
    }, [open]);

    const selectModel = (model: string) => {
        onChange(model);
        setOpen(false);
        setQuery("");
    };

    return (
        <div ref={rootRef} className={cn("relative", fullWidth ? "w-full" : "w-fit max-w-full")} data-canvas-no-zoom>
            <button
                type="button"
                className={cn(
                    "canvas-composer-model-picker inline-flex h-8 w-fit max-w-full items-center gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors outline-none",
                    fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                    open && "border-ring ring-2 ring-ring/20",
                    className,
                )}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                    if (open) setOpen(false);
                    else openPicker();
                }}
                title={current ? modelOptionLabel(config, current) : pickerPlaceholder}
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <ModelIcon model={current} />
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current ? modelOptionLabel(config, current) : pickerPlaceholder}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </button>

            {open ? (
                <div
                    className={cn(
                        "absolute left-0 z-[1200] overflow-x-hidden overflow-y-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-xl",
                        fullWidth ? "w-full min-w-[22rem] max-w-[calc(100vw-24px)]" : "w-[min(28rem,calc(100vw-24px))]",
                        placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
                    )}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    role="listbox"
                >
                    <div className="sticky top-0 z-10 mb-1 rounded-lg bg-popover px-1.5 pb-1 pt-1">
                        <label className="flex h-8 items-center gap-2 rounded-md border border-input bg-transparent px-2.5">
                            <Search className="size-3.5 shrink-0 text-muted-foreground" />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t("settingsPanels.model.search")}
                                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                        setOpen(false);
                                        return;
                                    }
                                    if (event.key === "Enter" && filtered[0]) {
                                        event.preventDefault();
                                        selectModel(filtered[0]);
                                    }
                                }}
                            />
                        </label>
                    </div>
                    <div className="thin-scrollbar max-h-64 overflow-x-hidden overflow-y-auto p-0.5">
                        {filtered.length ? (
                            filtered.map((model) => {
                                const selected = model === current;
                                return (
                                    <button
                                        key={model}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        className={cn(
                                            "relative flex w-full cursor-default items-start gap-2 rounded-md py-2 pr-8 pl-2 text-left text-sm outline-none transition-colors",
                                            selected ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
                                        )}
                                        onClick={() => selectModel(model)}
                                    >
                                        <ModelLabel config={config} model={model} />
                                        {selected ? <Check className="pointer-events-none absolute top-2.5 right-2 size-4" /> : null}
                                    </button>
                                );
                            })
                        ) : (
                            <div className="px-2 py-3 text-sm text-muted-foreground">
                                {options.length ? t("settingsPanels.model.noSearchResult") : emptyModelLabel(config, capability)}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability ? i18n.t(`settingsPanels.model.capabilities.${capability}`) : "";
    if (capability && config.models.length) return i18n.t("settingsPanels.model.assign", { capability: label });
    return config.models.length ? i18n.t("settingsPanels.model.noMatch", { capability: label }) : i18n.t("settingsPanels.model.addFirst");
}

function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
    const description = modelDescriptionOf(config, model);
    return (
        <span className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden">
            <ModelIcon model={model} />
            <span className="min-w-0 flex-1">
                <span className="block break-words leading-snug">{modelOptionLabel(config, model)}</span>
                {description ? <span className="mt-0.5 block break-words text-xs font-normal leading-snug text-stone-400 dark:text-stone-500">{description}</span> : null}
            </span>
        </span>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <SmartImage src={icon} alt="" className="size-4 shrink-0 dark:invert" fallbackIconClassName="size-3" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm")) return "/icons/glm.svg";
    return "";
}
