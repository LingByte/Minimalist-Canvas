import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { ProConfigProvider } from "@ant-design/pro-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import enUS from "antd/es/locale/en_US";
import zhCN from "antd/es/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { I18nextProvider, useTranslation } from "react-i18next";
import { Toaster } from "sonner";

import { ClientRootInit } from "@canvas/components/layout/client-root-init";
import { LoginRequiredDialog } from "@/features/auth/components/login-required-dialog";
import { hostToCanvasLocale, type AppLocale } from "@canvas/i18n";
import { toIntlLocale } from "@/i18n/languages";
import { getAntThemeConfig } from "@canvas/lib/app-theme";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { useSystemConfig } from "@/hooks/use-system-config";
import hostI18n from "@/i18n/config";

import "@canvas/styles/ant-message-overrides.css";

const CANVAS_MESSAGE_HOST_ID = "canvas-antd-message-host";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});

type AppProvidersProps = {
    children: ReactNode;
    /** When true, avoid mutating host document title/meta and scope dark mode locally. */
    embedded?: boolean;
    rootId?: string;
};

function AppProvidersInner({ children, embedded = false, rootId }: AppProvidersProps) {
    const { i18n, t } = useTranslation();
    const theme = useThemeStore((state) => state.theme);
    const dark = theme === "dark";
    const locale = hostToCanvasLocale(i18n.resolvedLanguage || i18n.language) as AppLocale;
    // Load system config (system name, logo) once at app root so auth pages show them.
    useSystemConfig({ autoLoad: !embedded });

    const antMessageConfig = useMemo(
        () => ({
            top: 0,
            maxCount: 4,
            getContainer: () => document.getElementById(CANVAS_MESSAGE_HOST_ID) || document.body,
            classNames: {
                list: "canvas-ant-message-tr",
            },
        }),
        [],
    );

    // Runtime inject as last head style so Ant Design css-in-js cannot win on cascade alone.
    useLayoutEffect(() => {
        const styleId = "canvas-antd-message-runtime-overrides";
        let style = document.getElementById(styleId) as HTMLStyleElement | null;
        if (!style) {
            style = document.createElement("style");
            style.id = styleId;
            document.head.appendChild(style);
        }
        style.textContent = `
#${CANVAS_MESSAGE_HOST_ID} .ant-message,
#${CANVAS_MESSAGE_HOST_ID} .ant-message-top,
#${CANVAS_MESSAGE_HOST_ID} .canvas-ant-message-tr {
  position: relative !important;
  inset: auto !important;
  width: auto !important;
  height: auto !important;
  transform: none !important;
  align-items: flex-end !important;
  padding: 0 !important;
}
#${CANVAS_MESSAGE_HOST_ID} .ant-message-notice,
#${CANVAS_MESSAGE_HOST_ID} .ant-message-notice-wrapper {
  position: relative !important;
  left: auto !important;
  right: auto !important;
  transform: none !important;
  opacity: 0.82 !important;
  pointer-events: auto !important;
}
#${CANVAS_MESSAGE_HOST_ID} .ant-message-notice:hover {
  opacity: 1 !important;
}
`;
        return () => {
            style?.remove();
        };
    }, []);

    useEffect(() => {
        if (embedded) {
            // Scope dark mode to the canvas root only — never touch <html>, or leaving
            // /canvas leaves the host app stuck in the canvas theme.
            if (!rootId) return;
            const themeRoot = document.getElementById(rootId);
            if (!themeRoot) return;
            themeRoot.classList.toggle("dark", dark);
            themeRoot.style.colorScheme = theme;
            return;
        }
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.colorScheme = theme;
    }, [dark, embedded, theme, rootId]);

    useEffect(() => {
        if (embedded) return;
        document.documentElement.lang = toIntlLocale(i18n.resolvedLanguage || i18n.language) ?? locale;
        document.title = t("meta.title");
        document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
        dayjs.locale(locale === "zh-CN" ? "zh-cn" : "en");
    }, [embedded, locale, t]);

    useEffect(() => {
        if (!embedded) return;
        dayjs.locale(locale === "zh-CN" ? "zh-cn" : "en");
    }, [embedded, locale]);

    return (
        <ConfigProvider locale={locale === "zh-CN" ? zhCN : enUS} theme={getAntThemeConfig(dark)}>
            <ProConfigProvider dark={dark}>
                <App message={antMessageConfig}>
                    <div id={CANVAS_MESSAGE_HOST_ID} aria-live="polite" />
                    <QueryClientProvider client={queryClient}>
                        <ClientRootInit>{children}</ClientRootInit>
                        <LoginRequiredDialog />
                        <Toaster
                            theme={theme}
                            richColors
                            position="top-right"
                            offset={16}
                            toastOptions={{
                                style: { opacity: 0.9 },
                            }}
                        />
                    </QueryClientProvider>
                </App>
            </ProConfigProvider>
        </ConfigProvider>
    );
}

export function AppProviders(props: AppProvidersProps) {
    return (
        <I18nextProvider i18n={hostI18n}>
            <AppProvidersInner {...props} />
        </I18nextProvider>
    );
}
