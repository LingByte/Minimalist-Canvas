import { Blocks, FileText, HardDrive, Images, LayoutDashboard, Megaphone, Sparkles } from "lucide-react";

/**
 * Canvas tool rail. Image + video share one "generate" entry (/image);
 * in-page tabs switch between image and video modes.
 * Config stays on the bottom gear (UserStatusActions), not duplicated here.
 */
export const navigationTools = [
    {
        slug: "canvas",
        icon: LayoutDashboard,
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
        slug: "skills",
        icon: Blocks,
    },
    {
        slug: "ops",
        icon: Megaphone,
    },
    {
        slug: "storage",
        icon: HardDrive,
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
