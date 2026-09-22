import { FileText, Images, Maximize2, Settings2, Sparkles } from "lucide-react";

/**
 * Canvas tool rail. Image + video share one "generate" entry (/image);
 * in-page tabs switch between image and video modes.
 */
export const navigationTools = [
    {
        slug: "canvas",
        icon: Maximize2,
    },
    {
        slug: "image",
        icon: Sparkles,
        /** Paths that highlight this nav item. */
        matchSlugs: ["image", "video"] as const,
    },
    {
        slug: "prompts",
        icon: FileText,
    },
    {
        slug: "assets",
        icon: Images,
    },
    {
        slug: "config",
        icon: Settings2,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];

export function navigationToolActive(slug: NavigationToolSlug, pathSlug: string | undefined) {
    if (!pathSlug) return false;
    const tool = navigationTools.find((item) => item.slug === slug);
    if (!tool) return false;
    if ("matchSlugs" in tool && tool.matchSlugs) {
        return (tool.matchSlugs as readonly string[]).includes(pathSlug);
    }
    return tool.slug === pathSlug;
}
