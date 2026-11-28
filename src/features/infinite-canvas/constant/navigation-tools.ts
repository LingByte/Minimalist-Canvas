import {
    BarChart3,
    Blocks,
    BookOpen,
    FileText,
    HardDrive,
    Images,
    LayoutDashboard,
    PackageOpen,
    Sparkles,
    type LucideIcon,
} from "lucide-react";

export const navigationGroups = ["create", "library", "system"] as const;

export type NavigationGroupId = (typeof navigationGroups)[number];

export type NavigationTool = {
    slug: string;
    icon: LucideIcon;
    group: NavigationGroupId;
    /** Paths that highlight this nav item (defaults to [slug]). */
    matchSlugs?: readonly string[];
    /** Hide until object/cloud storage is configured. */
    requiresStorage?: boolean;
    /** Desktop / Tauri only. */
    requiresDesktop?: boolean;
};

/**
 * Canvas tool rail. Image + video share one "generate" entry (/image);
 * in-page tabs switch between image and video modes.
 * Config stays on the bottom gear, not duplicated here.
 *
 * Add new modules by appending to this list with a group — the sidebar
 * and mobile drawer render grouped sections automatically.
 */
export const navigationTools = [
    {
        slug: "canvas",
        icon: LayoutDashboard,
        group: "create",
    },
    {
        slug: "image",
        icon: Sparkles,
        group: "create",
        matchSlugs: ["image", "video"],
    },
    {
        slug: "prompts",
        icon: FileText,
        group: "library",
    },
    {
        slug: "assets",
        icon: Images,
        group: "library",
    },
    {
        slug: "skills",
        icon: Blocks,
        group: "library",
    },
    {
        slug: "integrate",
        icon: PackageOpen,
        group: "library",
    },
    {
        slug: "usage",
        icon: BarChart3,
        group: "system",
    },
    {
        slug: "novels",
        icon: BookOpen,
        group: "system",
        requiresDesktop: true,
    },
    {
        slug: "storage",
        icon: HardDrive,
        group: "system",
        requiresStorage: true,
    },
] as const satisfies readonly NavigationTool[];

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];

export type NavigationVisibility = {
    storageReady?: boolean;
    desktop?: boolean;
};

export function isNavigationToolVisible(
    tool: (typeof navigationTools)[number] | NavigationTool,
    visibility: NavigationVisibility = {},
) {
    if (tool.requiresStorage && !visibility.storageReady) return false;
    if (tool.requiresDesktop && !visibility.desktop) return false;
    return true;
}

export function visibleNavigationTools(visibility: NavigationVisibility = {}) {
    return navigationTools.filter((tool) => isNavigationToolVisible(tool, visibility));
}

export function groupedNavigationTools(visibility: NavigationVisibility = {}) {
    const visible = visibleNavigationTools(visibility);
    return navigationGroups
        .map((group) => ({
            id: group,
            tools: visible.filter((tool) => tool.group === group),
        }))
        .filter((section) => section.tools.length > 0);
}

export function navigationToolHref(slug: NavigationToolSlug | string) {
    return `/${slug}`;
}

export function navigationToolActive(slug: NavigationToolSlug | string, pathSlug: string | undefined) {
    if (!pathSlug) return false;
    const tool = navigationTools.find((item) => item.slug === slug);
    if (!tool) return false;
    if (tool.matchSlugs) return tool.matchSlugs.includes(pathSlug);
    return tool.slug === pathSlug;
}
