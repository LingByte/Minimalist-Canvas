import type { ReactNode } from "react";
import { useEffect } from "react";
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
import canvasI18n, { type AppLocale } from "@canvas/i18n";
import { getAntThemeConfig } from "@canvas/lib/app-theme";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { useSystemConfig } from "@/hooks/use-system-config";

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
    const locale = i18n.resolvedLanguage as AppLocale;
    // Load system config (system name, logo) once at app root so auth pages show them.
    useSystemConfig({ autoLoad: !embedded });

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
        document.documentElement.lang = locale;
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
                <App>
                    <QueryClientProvider client={queryClient}>
                        <ClientRootInit>{children}</ClientRootInit>
                        <Toaster theme={theme} richColors position="top-center" />
                    </QueryClientProvider>
                </App>
            </ProConfigProvider>
        </ConfigProvider>
    );
}

export function AppProviders(props: AppProvidersProps) {
    return (
        <I18nextProvider i18n={canvasI18n}>
            <AppProvidersInner {...props} />
        </I18nextProvider>
    );
}
