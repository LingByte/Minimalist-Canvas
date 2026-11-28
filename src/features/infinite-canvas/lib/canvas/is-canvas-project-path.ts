import { navigationTools } from "@canvas/constant/navigation-tools";

const reservedToolSlugs = new Set([
    ...navigationTools.map((tool) => tool.slug).filter((slug) => slug !== "canvas"),
    "changelog",
    "home",
    "generation-logs",
    "config",
    "video",
]);

/** True for `/:projectId` editor routes (not library `/` or tool pages). */
export function isCanvasProjectPath(pathname: string) {
    const firstSegment = pathname.split("/").filter(Boolean)[0];
    return Boolean(
            firstSegment &&
            firstSegment !== "canvas" &&
            !reservedToolSlugs.has(firstSegment),
    );
}
