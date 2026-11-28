import type { TFunction } from "i18next";

const TYPE_KEYS: Record<string, string> = {
    新增: "added",
    修复: "fixed",
    调整: "changed",
    优化: "optimized",
    文档: "docs",
    说明: "note",
    Added: "added",
    Fixed: "fixed",
    Changed: "changed",
    Optimized: "optimized",
    Docs: "docs",
    Note: "note",
};

export function releaseTypeLabel(type: string, t: TFunction) {
    const key = TYPE_KEYS[type];
    return key ? t(`version.types.${key}`) : type;
}

export function releaseTypeTone(type: string): "added" | "fixed" | "changed" | "optimized" | "docs" | "note" | "default" {
    const key = TYPE_KEYS[type];
    if (key === "added" || key === "fixed" || key === "changed" || key === "optimized" || key === "docs" || key === "note") {
        return key;
    }
    return "default";
}
