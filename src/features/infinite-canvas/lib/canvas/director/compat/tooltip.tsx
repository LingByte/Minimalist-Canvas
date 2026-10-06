import { Tooltip as AntdTooltip } from "antd";
import type { ReactNode } from "react";

export function Tooltip({
    title,
    placement,
    children,
}: {
    title?: ReactNode;
    placement?: "top" | "bottom" | "left" | "right";
    children: ReactNode;
}) {
    return (
        <AntdTooltip title={title} placement={placement}>
            {children}
        </AntdTooltip>
    );
}
