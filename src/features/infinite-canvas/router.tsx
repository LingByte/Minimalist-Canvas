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
import ProfilePage from "@canvas/pages/profile";
import PromptsPage from "@canvas/pages/prompts";
import VideoPage from "@canvas/pages/video";

import { ForgotPassword } from "@/features/auth/forgot-password";
import { OAuthCallbackPage } from "@/features/auth/oauth-callback-page";
import { Otp } from "@/features/auth/otp";
import { RequireAuth } from "@/features/auth/require-auth";
import { ResetPasswordPage } from "@/features/auth/reset-password-page";
import { SignIn } from "@/features/auth/sign-in";
import { SignUp } from "@/features/auth/sign-up";
import { ApiKeys } from "@/features/keys";

import { CANVAS_BASENAME } from "./integration/constants";
import {
    SiteDashboardPage,
    SiteDocsPage,
    SiteFaqDetailPage,
    SiteFaqPage,
    SitePricingModelPage,
    SitePricingPage,
    SiteUsageLogsIndexPage,
    SiteUsageLogsPage,
} from "./pages/site";

const canvasRoutes: RouteObject[] = [
    { path: "sign-in", element: <SignIn /> },
    { path: "sign-up", element: <SignUp /> },
    { path: "register", element: <SignUp /> },
    { path: "forgot-password", element: <ForgotPassword /> },
    { path: "otp", element: <Otp /> },
    { path: "reset", element: <ResetPasswordPage /> },
    { path: "oauth/:provider", element: <OAuthCallbackPage /> },
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
            { path: "home", element: <HomePage /> },
            { path: "image", element: <ImagePage /> },
            { path: "video", element: <VideoPage /> },
            { path: "assets", element: <AssetsPage /> },
            { path: "prompts", element: <PromptsPage /> },
            { path: "canvas", element: <CanvasPage /> },
            { path: "canvas/:id", element: <CanvasProjectPage /> },
            { path: "config", element: <ConfigPage /> },
            { path: "profile", element: <ProfilePage /> },
            { path: "keys", element: <ApiKeys /> },
            { path: "usage-logs", element: <SiteUsageLogsIndexPage /> },
            { path: "usage-logs/:section", element: <SiteUsageLogsPage /> },
            { path: "dashboard", element: <SiteDashboardPage /> },
            { path: "dashboard/:section", element: <SiteDashboardPage /> },
            { path: "docs", element: <SiteDocsPage /> },
            { path: "docs/:section", element: <SiteDocsPage /> },
            { path: "faq", element: <SiteFaqPage /> },
            { path: "faq/:faqId", element: <SiteFaqDetailPage /> },
            { path: "pricing", element: <SitePricingPage /> },
            { path: "pricing/:modelId", element: <SitePricingModelPage /> },
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
