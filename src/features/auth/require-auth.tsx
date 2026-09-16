import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spin } from "antd";

import { bootstrapAuthentication } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

export function RequireAuth({ children }: { children: ReactNode }) {
    const location = useLocation();
    const user = useAuthStore((s) => s.auth.user);
    const bootstrapState = useAuthStore((s) => s.auth.bootstrapState);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        let cancelled = false;
        bootstrapAuthentication().then(() => {
            if (!cancelled) setChecked(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!checked || bootstrapState === "checking") {
        return (
            <div className="flex h-dvh items-center justify-center">
                <Spin size="large" />
            </div>
        );
    }

    if (!user) {
        const redirect = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`/sign-in?redirect=${redirect}`} replace />;
    }

    return <>{children}</>;
}
