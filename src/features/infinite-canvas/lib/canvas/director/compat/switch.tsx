import { Switch as AntdSwitch } from "antd";

export function Switch({
    checked,
    onChange,
    size,
    ...rest
}: {
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    size?: "sm" | "small" | "default";
    "aria-label"?: string;
    disabled?: boolean;
}) {
    return (
        <AntdSwitch
            checked={checked}
            onChange={onChange}
            size={size === "sm" ? "small" : size === "small" ? "small" : "default"}
            {...rest}
        />
    );
}
