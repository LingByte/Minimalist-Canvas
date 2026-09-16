import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@canvas/components/layout/app-providers";
import { api } from "@/lib/api";
import { useConfigStore } from "@canvas/stores/use-config-store";
import "@/i18n/config";
import { initAnalytics } from "@canvas/lib/analytics";
import { createCanvasRouter } from "@canvas/router";

// Desktop app runs at root, not under /canvas
const router = createCanvasRouter("/");

// Apply configured server URL to axios baseURL for /api/* calls
// Falls back to the default channel's baseUrl when serverUrl is empty
function resolveServerUrl(): string {
    const { config } = useConfigStore.getState();
    const explicit = (config.serverUrl || "").trim().replace(/\/+$/, "");
    if (explicit) return explicit;
    const channel = config.channels.find((c) => c.id === "default") || config.channels[0];
    return (channel?.baseUrl || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}
function applyServerUrl() {
    api.defaults.baseURL = resolveServerUrl();
}
let prevServerUrl = useConfigStore.getState().config.serverUrl;
let prevChannelBaseUrl = useConfigStore.getState().config.channels[0]?.baseUrl || "";
applyServerUrl();
useConfigStore.subscribe((state) => {
    const channelBaseUrl = state.config.channels.find((c) => c.id === "default")?.baseUrl || state.config.channels[0]?.baseUrl || "";
    if (state.config.serverUrl !== prevServerUrl || channelBaseUrl !== prevChannelBaseUrl) {
        prevServerUrl = state.config.serverUrl;
        prevChannelBaseUrl = channelBaseUrl;
        applyServerUrl();
    }
});

initAnalytics();

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProviders>
            <RouterProvider router={router} />
        </AppProviders>
    </React.StrictMode>,
);
