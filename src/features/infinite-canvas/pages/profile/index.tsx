import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Skeleton } from "antd";
import { useTranslation } from "react-i18next";
import {
    CalendarDays,
    ChevronRight,
    ExternalLink,
    KeyRound,
    ListTodo,
    ScrollText,
    LogOut,
    Mail,
    ShieldCheck,
    Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { SignOutDialog } from "@/components/sign-out-dialog";
import useDialogState from "@/hooks/use-dialog";
import { useUserDisplay } from "@/hooks/use-user-display";
import { getSelf } from "@/lib/api";
import { getUserAvatarFallback, getUserAvatarStyle } from "@/lib/avatar";
import { formatCompactNumber, formatQuota } from "@/lib/format";
import { openSitePage } from "@/lib/open-external";
import { getRoleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useAuthStore, type AuthUser } from "@/stores/auth-store";

type SelfProfile = AuthUser & {
    created_time?: number;
    access_token?: string;
};

export default function ProfilePage() {
    const { t } = useTranslation();
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

    const balance = formatQuota(profile?.quota ?? authUser?.quota ?? 0);
    const used = formatQuota(profile?.used_quota ?? authUser?.used_quota ?? 0);
    const requests = formatCompactNumber(profile?.request_count ?? authUser?.request_count ?? 0);
    const email = profile?.email || authUser?.email;
    const userId = profile?.id ?? authUser?.id;
    const username = profile?.username || authUser?.username;
    const group = profile?.group ? String(profile.group) : "";

    const quickLinks = [
        {
            key: "keys",
            icon: KeyRound,
            label: t("API Keys"),
            description: t("Manage API tokens for upstream calls"),
            onClick: () => navigate("/keys"),
        },
        {
            key: "common-logs",
            icon: ScrollText,
            label: t("Common Logs"),
            description: t("Detailed request logs for investigations."),
            onClick: () => navigate("/usage-logs/common"),
        },
        {
            key: "task-logs",
            icon: ListTodo,
            label: t("Task Logs"),
            description: t("View async image and video generation tasks"),
            onClick: () => navigate("/usage-logs/task"),
        },
        {
            key: "site-profile",
            icon: ExternalLink,
            label: t("Open profile on site"),
            description: t("Security settings, sessions, and more on the web"),
            onClick: () => void openSitePage("/profile"),
        },
        {
            key: "sign-out",
            icon: LogOut,
            label: t("Sign out"),
            description: t("Sign out of this device"),
            danger: true,
            onClick: () => setSignOutOpen(true),
        },
    ];

    return (
        <main className="h-full overflow-y-auto bg-background">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
                <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                    <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
                        {loading && !profile && !authUser ? (
                            <>
                                <Skeleton.Avatar active size={72} />
                                <div className="min-w-0 flex-1 space-y-3">
                                    <Skeleton.Input active className="!h-7 !w-40" />
                                    <Skeleton.Input active size="small" className="!w-56" />
                                </div>
                            </>
                        ) : (
                            <>
                                <Avatar
                                    size={72}
                                    style={avatarStyle}
                                    className="shrink-0 text-2xl font-semibold text-white"
                                >
                                    {avatarFallback}
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="truncate text-xl font-semibold tracking-tight">
                                            {displayName}
                                        </h1>
                                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                            {roleLabel || getRoleLabel(profile?.role)}
                                        </span>
                                        {group ? (
                                            <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
                                                {group}
                                            </span>
                                        ) : null}
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">@{username}</p>
                                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                                        {email ? (
                                            <span className="inline-flex min-w-0 items-center gap-1.5">
                                                <Mail className="size-3.5 shrink-0" />
                                                <span className="truncate">{email}</span>
                                            </span>
                                        ) : null}
                                        <span className="inline-flex items-center gap-1.5">
                                            <ShieldCheck className="size-3.5 shrink-0" />
                                            {t("ID")}: {userId}
                                        </span>
                                        {profile?.created_time ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <CalendarDays className="size-3.5 shrink-0" />
                                                {t("Joined")}{" "}
                                                {new Date(profile.created_time * 1000).toLocaleDateString()}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div
                        id="wallet"
                        className="grid grid-cols-1 divide-y border-t sm:grid-cols-3 sm:divide-x sm:divide-y-0"
                    >
                        {[
                            { label: t("Balance"), value: balance, hint: t("Wallet") },
                            { label: t("Used"), value: used, hint: t("Used") },
                            { label: t("Requests"), value: requests, hint: t("Requests") },
                        ].map((item) => (
                            <div key={item.label} className="px-5 py-4 sm:px-6">
                                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    {item.label}
                                </div>
                                <div className="mt-1 truncate text-2xl font-semibold tracking-tight" title={item.value}>
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t px-5 py-3 sm:px-6">
                        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <Wallet className="size-4" />
                            {t("Wallet")}
                        </span>
                        <Button
                            size="small"
                            type="primary"
                            icon={<ExternalLink className="size-3.5" />}
                            onClick={() => void openSitePage("/wallet")}
                        >
                            {t("Top up")}
                        </Button>
                    </div>
                </section>

                <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                    <div className="border-b px-5 py-3.5 sm:px-6">
                        <h2 className="text-sm font-semibold tracking-tight">{t("Profile")}</h2>
                    </div>
                    <div className="divide-y">
                        {quickLinks.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={item.onClick}
                                    className={cn(
                                        "flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors sm:px-6",
                                        item.danger
                                            ? "hover:bg-destructive/5"
                                            : "hover:bg-muted/50"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "flex size-9 shrink-0 items-center justify-center rounded-xl",
                                            item.danger
                                                ? "bg-destructive/10 text-destructive"
                                                : "bg-muted text-muted-foreground"
                                        )}
                                    >
                                        <Icon className="size-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span
                                            className={cn(
                                                "block text-sm font-medium",
                                                item.danger && "text-destructive"
                                            )}
                                        >
                                            {item.label}
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                            {item.description}
                                        </span>
                                    </span>
                                    <ChevronRight
                                        className={cn(
                                            "size-4 shrink-0",
                                            item.danger ? "text-destructive/50" : "text-muted-foreground/60"
                                        )}
                                    />
                                </button>
                            );
                        })}
                    </div>
                </section>
            </div>
            <SignOutDialog open={!!signOutOpen} onOpenChange={setSignOutOpen} />
        </main>
    );
}
