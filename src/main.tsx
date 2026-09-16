import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@canvas/components/layout/app-providers";
import "@/i18n/config";
import { initAnalytics } from "@canvas/lib/analytics";
import { createCanvasRouter } from "@canvas/router";

// Desktop app runs at root, not under /canvas
const router = createCanvasRouter("/");

initAnalytics();

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProviders>
            <RouterProvider router={router} />
        </AppProviders>
    </React.StrictMode>,
);
