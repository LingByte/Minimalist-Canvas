import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { createModelChannel, useConfigStore } from "@canvas/stores/use-config-store";
import { usePromptSourceStore } from "@canvas/stores/use-prompt-source-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const handledConfigParams = useRef(false);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const loadSources = usePromptSourceStore((state) => state.loadSources);

    useEffect(() => {
        void loadSources().catch(() => undefined);
    }, [loadSources]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);

        const config = useConfigStore.getState().config;
        const firstChannel = config.channels[0];
        const channels = firstChannel
            ? config.channels.map((channel, index) =>
                  index === 0
                      ? {
                            ...channel,
                            ...(baseUrl ? { baseUrl } : {}),
                            ...(apiKey ? { apiKey } : {}),
                        }
                      : channel,
              )
            : [
                  createModelChannel({
                      id: "default",
                      name: t("config.channels.defaultName"),
                      baseUrl: baseUrl || undefined,
                      apiKey: apiKey || "",
                  }),
              ];
        useConfigStore.setState({
            config: {
                ...config,
                channels,
                ...(baseUrl ? { baseUrl } : {}),
                ...(apiKey ? { apiKey } : {}),
            },
        });
        openConfigDialog(false);
        message.success(t("config.importedDirectConfig"));
    }, [message, openConfigDialog, t]);

    return <>{children}</>;
}
