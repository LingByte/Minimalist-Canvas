import { Outlet, createBrowserRouter, useSearchParams, type RouteObject } from "react-router-dom";

import { AnalyticsTracker } from "@canvas/components/layout/analytics-tracker";
import UserLayout from "@canvas/layouts/user-layout";
import AssetsPage from "@canvas/pages/assets";
import CanvasPage from "@canvas/pages/canvas";
import CanvasProjectPage from "@canvas/pages/canvas/project";
import ConfigPage from "@canvas/pages/config";
import HomePage from "@canvas/pages/home";
import ImagePage from "@canvas/pages/image";
import NotFound from "@canvas/pages/not-found";
import ProfilePage from "@canvas/pages/profile";
import PromptsPage from "@canvas/pages/prompts";
import VideoPage from "@canvas/pages/video";

import { SignIn } from "@/features/auth/sign-in";
import { ApiKeys } from "@/features/keys";
import { SignUp } from "@/features/auth/sign-up";
import { ForgotPassword } from "@/features/auth/forgot-password";
import { Otp } from "@/features/auth/otp";
import { ResetPasswordConfirm } from "@/features/auth/reset-password-confirm";
import { RequireAuth } from "@/features/auth/require-auth";

import { CANVAS_BASENAME } from "./integration/constants";

function ResetPasswordConfirmPage() {
    const [params] = useSearchParams();
    return <ResetPasswordConfirm email={params.get("email") || undefined} token={params.get("token") || undefined} />;
}

const canvasRoutes: RouteObject[] = [
    {
        element: (
            <RequireAuth>
                <UserLayout>
                    <AnalyticsTracker />
                    <Outlet />
                </UserLayout>
            </RequireAuth>
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
            { path: "profile", element: <ProfilePage /> },
            { path: "keys", element: <ApiKeys /> },
        ],
    },
    { path: "sign-in", element: <SignIn /> },
    { path: "sign-up", element: <SignUp /> },
    { path: "forgot-password", element: <ForgotPassword /> },
    { path: "otp", element: <Otp /> },
    { path: "reset-password", element: <ResetPasswordConfirmPage /> },
    { path: "*", element: <NotFound /> },
];

/** @deprecated Standalone entry; embedded host should call createCanvasRouter(). */
export const router = createBrowserRouter(canvasRoutes, {
    basename: CANVAS_BASENAME,
});

export function createCanvasRouter(basename = CANVAS_BASENAME) {
    return createBrowserRouter(canvasRoutes, { basename });
}
