import { StorageOpsPanel } from "@canvas/pages/storage/storage-ops-panel";
import { useTranslation } from "react-i18next";

export default function OpsPage() {
    const { t } = useTranslation();
    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1400px]">
                    <h1 className="text-2xl font-semibold tracking-tight">{t("navigation.ops")}</h1>
                    <StorageOpsPanel />
                </div>
            </main>
        </div>
    );
}
