import { useEffect, useMemo, useState } from "react";
import { App, Avatar, Button, Card, Skeleton, Tag } from "antd";
import { useTranslation } from "react-i18next";
import {
    CalendarDays,
    ExternalLink,
    KeyRound,
    LogOut,
    Mail,
    ShieldCheck,
    Wallet,
} from "lucide-react";

import { SignOutDialog } from "@/components/sign-out-dialog";
import useDialogState from "@/hooks/use-dialog";
import { useUserDisplay } from "@/hooks/use-user-display";
import { getSelf } from "@/lib/api";
import { getUserAvatarFallback, getUserAvatarStyle } from "@/lib/avatar";
import { formatCompactNumber, formatQuota } from "@/lib/format";
import { openSitePage } from "@/lib/open-external";
import { getRoleLabel } from "@/lib/roles";
import { useAuthStore, type AuthUser } from "@/stores/auth-store";
import { useNavigate } from "react-router-dom";

type SelfProfile = AuthUser & {
    created_time?: number;
    access_token?: string;
};

export default function ProfilePage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const authUser = useAuthStore((state) => state.auth.user);
    const [profile, setProfile] = useState<SelfProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [signOutOpen, setSignOutOpen] = useDialogState();
    const { displayName, roleLabel } = useUserDisplay(profile || authUser || null);

    const avatarName = profile?.username || displayName;
    const avatarFallback = getUserAvatarFallback(avatarName);
    const avatarStyle = useMemo(() => getUserAvatarStyle(avatarName), [avatarName]);

    useEffect(() => {
        setLoading(true);
        getSelf()
            .then((res) => {
                if (res?.success && res.data) setProfile(res.data as SelfProfile);
            })
            .catch(() => {
                // fall back to auth-store user
            })
            .finally(() => setLoading(false));
    }, []);

    const stats = [
        { label: t("Balance"), value: formatQuota(profile?.quota ?? authUser?.quota ?? 0) },
        { label: t("Used"), value: formatQuota(profile?.used_quota ?? authUser?.used_quota ?? 0) },
        { label: t("Requests"), value: formatCompactNumber(profile?.request_count ?? authUser?.request_count ?? 0) },
    ];

    const quickLinks = [
        {
            key: "keys",
            icon: <KeyRound className="size-4" />,
            label: t("API Keys"),
            description: t("Manage API tokens for upstream calls"),
            onClick: () => navigate("/keys"),
        },
        {
            key: "site-profile",
            icon: <ExternalLink className="size-4" />,
            label: t("Open profile on site"),
            description: t("Security settings, sessions, and more on the web"),
            onClick: () => void openSitePage("/profile"),
        },
        {
            key: "sign-out",
            icon: <LogOut className="size-4" />,
            label: t("Sign out"),
            description: t("Sign out of this device"),
            danger: true,
            onClick: () => setSignOutOpen(true),
        },
    ];

    return (
        <main className="h-full overflow-y-auto bg-background">
            <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-6 sm:gap-5 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)] lg:items-start">
                {/* User info */}
                <Card className="lg:row-span-2">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <Avatar size={88} style={avatarStyle} className="shrink-0 text-3xl font-semibold text-white">
                            {avatarFallback}
                        </Avatar>
                        {loading && !profile ? (
                            <Skeleton active paragraph={{ rows: 3 }} title={false} className="w-full" />
                        ) : (
                            <>
                                <div>
                                    <div className="text-xl font-semibold">{displayName}</div>
                                    <div className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                                        @{profile?.username || authUser?.username}
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    <Tag color="blue">{roleLabel || getRoleLabel(profile?.role)}</Tag>
                                    {profile?.group ? <Tag>{String(profile.group)}</Tag> : null}
                                </div>
                                <div className="flex w-full flex-col gap-2 rounded-lg bg-stone-50 p-4 text-left text-sm dark:bg-stone-900">
                                    {(profile?.email || authUser?.email) ? (
                                        <span className="inline-flex items-center gap-2 text-stone-600 dark:text-stone-300">
                                            <Mail className="size-4 shrink-0 text-stone-400" />
                                            <span className="truncate">{profile?.email || authUser?.email}</span>
                                        </span>
                                    ) : null}
                                    <span className="inline-flex items-center gap-2 text-stone-600 dark:text-stone-300">
                                        <ShieldCheck className="size-4 shrink-0 text-stone-400" />
                                        {t("ID")}: {profile?.id ?? authUser?.id}
                                    </span>
                                    {profile?.created_time ? (
                                        <span className="inline-flex items-center gap-2 text-stone-600 dark:text-stone-300">
                                            <CalendarDays className="size-4 shrink-0 text-stone-400" />
                                            {t("Joined")} {new Date(profile.created_time * 1000).toLocaleDateString()}
                                        </span>
                                    ) : null}
                                </div>
                            </>
                        )}
                    </div>
                </Card>

                {/* Wallet */}
                <Card
                    id="wallet"
                    title={
                        <span className="inline-flex items-center gap-2">
                            <Wallet className="size-4" />
                            {t("Wallet")}
                        </span>
                    }
                    extra={
                        <Button size="small" icon={<ExternalLink className="size-3.5" />} onClick={() => void openSitePage("/wallet")}>
                            {t("Top up")}
                        </Button>
                    }
                >
                    <div className="grid grid-cols-3 gap-3">
                        {stats.map((item) => (
                            <div key={item.label} className="rounded-lg bg-stone-50 p-3 text-center dark:bg-stone-900">
                                <div className="truncate text-lg font-semibold" title={item.value}>{item.value}</div>
                                <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{item.label}</div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Quick links */}
                <Card>
                    <div className="flex flex-col divide-y divide-stone-100 dark:divide-stone-800">
                        {quickLinks.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={item.onClick}
                                className="flex items-center gap-3 px-1 py-3 text-left transition hover:bg-stone-50 dark:hover:bg-stone-900/60"
                            >
                                <span className={item.danger ? "text-red-500" : "text-stone-500 dark:text-stone-400"}>{item.icon}</span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block text-sm font-medium ${item.danger ? "text-red-500" : ""}`}>{item.label}</span>
                                    <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{item.description}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>
            <SignOutDialog open={!!signOutOpen} onOpenChange={setSignOutOpen} />
        </main>
    );
}
