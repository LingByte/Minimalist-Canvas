import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getSelf } from "@/lib/api";
import { formatQuota } from "@/lib/format";
import { openSitePage } from "@/lib/open-external";

type SelfResponse = {
    success?: boolean;
    data?: { quota?: number };
};

export function CanvasWalletChip({ color }: { color?: string }) {
    const { t } = useTranslation();
    const [quota, setQuota] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = () => {
            void getSelf()
                .then((body: SelfResponse) => {
                    if (cancelled) return;
                    const value = body?.data?.quota;
                    if (typeof value === "number") setQuota(value);
                })
                .catch(() => {});
        };
        load();
        const timer = window.setInterval(load, 20000);
        window.addEventListener("focus", load);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            window.removeEventListener("focus", load);
        };
    }, []);

    const label = quota == null ? t("topNav.wallet") : formatQuota(quota);

    return (
        <button
            type="button"
            className="inline-flex h-8 max-w-[9.5rem] shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color, borderColor: "color-mix(in srgb, currentColor 18%, transparent)" }}
            title={t("topNav.recharge")}
            aria-label={t("topNav.recharge")}
            onClick={() => {
                void openSitePage("/wallet#wallet-add-funds");
            }}
        >
            <Wallet className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
        </button>
    );
}
