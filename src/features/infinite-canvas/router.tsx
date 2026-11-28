import { Navigate, Outlet, createBrowserRouter, type RouteObject } from "react-router-dom";

import { AnalyticsTracker } from "@canvas/components/layout/analytics-tracker";
import { CanvasErrorBoundary, CanvasRouteError } from "@canvas/components/layout/canvas-error-boundary";
import UserLayout from "@canvas/layouts/user-layout";
import AssetsPage from "@canvas/pages/assets";
import CanvasPage from "@canvas/pages/canvas";
import CanvasProjectPage from "@canvas/pages/canvas/project";
import ConfigPage from "@canvas/pages/config";
import GenerationLogsPage from "@canvas/pages/generation-logs";
import HomePage from "@canvas/pages/home";
import ImagePage from "@canvas/pages/image";
import IntegratePage from "@canvas/pages/integrate";
import NotFound from "@canvas/pages/not-found";
import PromptsPage from "@canvas/pages/prompts";
import SkillsPage from "@canvas/pages/skills";
import NovelsPage from "@canvas/pages/novels";
import StoragePage from "@canvas/pages/storage";
import UsagePage from "@canvas/pages/usage";
import VideoPage from "@canvas/pages/video";

import { CANVAS_BASENAME } from "./integration/constants";

const appPages: RouteObject[] = [
    { index: true, element: <HomePage /> },
    { path: "home", element: <HomePage /> },
    { path: "image", element: <ImagePage /> },
    { path: "video", element: <VideoPage /> },
    { path: "assets", element: <AssetsPage /> },
    { path: "prompts", element: <PromptsPage /> },
    { path: "skills", element: <SkillsPage /> },
    { path: "integrate", element: <IntegratePage /> },
    { path: "novels", element: <NovelsPage /> },
    { path: "ops", element: <Navigate to="/canvas" replace /> },
    { path: "storage", element: <StoragePage /> },
    { path: "usage", element: <UsagePage /> },
    { path: "canvas", element: <CanvasPage /> },
    { path: "canvas/:id", element: <CanvasProjectPage /> },
    // Alias so navigate(`/${id}`) from the project chrome also opens a canvas.
    { path: ":id", element: <CanvasProjectPage /> },
    { path: "generation-logs", element: <GenerationLogsPage /> },
    { path: "config", element: <ConfigPage /> },
];

const canvasRoutes: RouteObject[] = [
    {
        errorElement: <CanvasRouteError />,
        children: [
            {
                element: (
                    <UserLayout>
                        <AnalyticsTracker />
                        <CanvasErrorBoundary>
                            <Outlet />
                        </CanvasErrorBoundary>
                    </UserLayout>
                ),
                errorElement: <CanvasRouteError />,
                children: [
                    {
                        errorElement: <CanvasRouteError />,
                        children: appPages,
                    },
                ],
            },
            { path: "*", element: <NotFound /> },
        ],
    },
];

/** @deprecated Standalone entry; embedded host should call createCanvasRouter(). */
export const router = createBrowserRouter(canvasRoutes, {
    basename: CANVAS_BASENAME,
});

export function createCanvasRouter(basename = CANVAS_BASENAME) {
    return createBrowserRouter(canvasRoutes, { basename });
}
