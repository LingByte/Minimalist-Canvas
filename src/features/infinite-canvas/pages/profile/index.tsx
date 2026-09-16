import { useEffect, useMemo, useState } from "react";
import { App, Avatar, Button, Card, Divider, Skeleton, Tag } from "antd";
import { useTranslation } from "react-i18next";
import {
    CalendarDays,
    Copy,
    ExternalLink,
    KeyRound,
    LogOut,
    Mail,
    RefreshCw,
    ShieldCheck,
    Wallet,
} from "lucide-react";

import { SignOutDialog } from "@/components/sign-out-dialog";
import useDialogState from "@/hooks/use-dialog";
import { useUserDisplay } from "@/hooks/use-user-display";
import { api, getSelf } from "@/lib/api";
import { getUserAvatarFallback, getUserAvatarStyle } from "@/lib/avatar";
import { formatCompactNumber, formatQuota } from "@/lib/format";
import { openSitePage } from "@/lib/open-external";
import { getRoleLabel } from "@/lib/roles";
import { useAuthStore, type AuthUser } from "@/stores/auth-store";

type SelfProfile = AuthUser & {
    created_time?: number;
    access_token?: string;
};

export default function ProfilePage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const authUser = useAuthStore((state) => state.auth.user);
    const [profile, setProfile] = useState<SelfProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [signOutOpen, setSignOutOpen] = useDialogState();
    const { displayName, roleLabel } = useUserDisplay(profile || authUser || null);

    const avatarName = profile?.username || displayName;
    const avatarFallback = getUserAvatarFallback(avatarName);
    const avatarStyle = useMemo(() => getUserAvatarStyle(avatarName), [avatarName]);

    const loadProfile = async () => {
        setLoading(true);
        try {
            const res = await getSelf();
            if (res?.success && res.data) {
                setProfile(res.data as SelfProfile);
            }
        } catch {
            // fall back to auth-store user
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadProfile();
    }, []);

    const copyToken = async () => {
        const token = profile?.access_token;
        if (!token) return;
        try {
            await navigator.clipboard.writeText(token);
            message.success(t("Copied"));
        } catch {
            message.error(t("Copy failed"));
        }
    };

    const regenerateToken = async () => {
        try {
            const res = await api.get("/api/user/token", { params: { refresh: true } });
            if (res.data?.success && res.data.data) {
                setProfile((prev) => (prev ? { ...prev, access_token: String(res.data.data) } : prev));
                message.success(t("Token regenerated"));
            } else {
                message.error(res.data?.message || t("Failed to regenerate token"));
            }
        } catch {
            message.error(t("Failed to regenerate token"));
        }
    };

    const stats = [
        { label: t("Balance"), value: formatQuota(profile?.quota ?? authUser?.quota ?? 0) },
        { label: t("Used"), value: formatQuota(profile?.used_quota ?? authUser?.used_quota ?? 0) },
        { label: t("Requests"), value: formatCompactNumber(profile?.request_count ?? authUser?.request_count ?? 0) },
    ];

    return (
        <main className="h-full overflow-y-auto bg-background">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8">
                {/* Header */}
                <Card>
                    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                        <Avatar size={72} style={avatarStyle} className="shrink-0 text-2xl font-semibold text-white">
                            {avatarFallback}
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            {loading && !profile ? (
                                <Skeleton active paragraph={{ rows: 2 }} title={false} />
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xl font-semibold">{displayName}</span>
                                        <Tag color="blue">{roleLabel || getRoleLabel(profile?.role)}</Tag>
                                        {profile?.group ? <Tag>{String(profile.group)}</Tag> : null}
                                    </div>
                                    <div className="mt-2 flex flex-col gap-1 text-sm text-stone-500 dark:text-stone-400">
                                        <span className="inline-flex items-center gap-1.5">
                                            <ShieldCheck className="size-3.5" />@{profile?.username || authUser?.username}
                                        </span>
                                        {(profile?.email || authUser?.email) ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Mail className="size-3.5" />{profile?.email || authUser?.email}
                                            </span>
                                        ) : null}
                                        {profile?.created_time ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <CalendarDays className="size-3.5" />
                                                {t("Joined")} {new Date(profile.created_time * 1000).toLocaleDateString()}
                                            </span>
                                        ) : null}
                                    </div>
                                </>
                            )}
                        </div>
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
                                <div className="text-lg font-semibold">{item.value}</div>
                                <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{item.label}</div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Access token */}
                <Card
                    title={
                        <span className="inline-flex items-center gap-2">
                            <KeyRound className="size-4" />
                            {t("API Token")}
                        </span>
                    }
                    extra={
                        <Button size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => void regenerateToken()}>
                            {t("Regenerate")}
                        </Button>
                    }
                >
                    <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-md bg-stone-50 px-3 py-2 font-mono text-xs dark:bg-stone-900">
                            {profile?.access_token || "—"}
                        </code>
                        <Button size="small" icon={<Copy className="size-3.5" />} disabled={!profile?.access_token} onClick={() => void copyToken()}>
                            {t("Copy")}
                        </Button>
                    </div>
                </Card>

                {/* Actions */}
                <Card>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button icon={<ExternalLink className="size-4" />} onClick={() => void openSitePage("/profile")}>
                            {t("Open profile on site")}
                        </Button>
                        <Divider type="vertical" />
                        <Button danger icon={<LogOut className="size-4" />} onClick={() => setSignOutOpen(true)}>
                            {t("Sign out")}
                        </Button>
                    </div>
                </Card>
            </div>
            <SignOutDialog open={!!signOutOpen} onOpenChange={setSignOutOpen} />
        </main>
    );
}
