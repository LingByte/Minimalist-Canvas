import { Outlet, createBrowserRouter, type RouteObject } from "react-router-dom";

import { AnalyticsTracker } from "@canvas/components/layout/analytics-tracker";
import UserLayout from "@canvas/layouts/user-layout";
import AssetsPage from "@canvas/pages/assets";
import CanvasPage from "@canvas/pages/canvas";
import CanvasProjectPage from "@canvas/pages/canvas/project";
import ConfigPage from "@canvas/pages/config";
import HomePage from "@canvas/pages/home";
import ImagePage from "@canvas/pages/image";
import NotFound from "@canvas/pages/not-found";
import PromptsPage from "@canvas/pages/prompts";
import VideoPage from "@canvas/pages/video";

import { CANVAS_BASENAME } from "./integration/constants";

const canvasRoutes: RouteObject[] = [
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { index: true, element: <HomePage /> },
            { path: "image", element: <ImagePage /> },
            { path: "video", element: <VideoPage /> },
            { path: "assets", element: <AssetsPage /> },
            { path: "prompts", element: <PromptsPage /> },
            { path: "canvas", element: <CanvasPage /> },
            { path: "canvas/:id", element: <CanvasProjectPage /> },
            { path: "config", element: <ConfigPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
];

/** @deprecated Standalone entry; embedded host should call createCanvasRouter(). */
export const router = createBrowserRouter(canvasRoutes, {
    basename: CANVAS_BASENAME,
});

export function createCanvasRouter(basename = CANVAS_BASENAME) {
    return createBrowserRouter(canvasRoutes, { basename });
}
