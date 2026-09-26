import { useState, type CSSProperties, type MouseEventHandler, type DragEventHandler } from "react";
import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";

type SmartImageProps = {
    src?: string;
    alt: string;
    className?: string;
    style?: CSSProperties;
    title?: string;
    loading?: "lazy" | "eager";
    draggable?: boolean;
    referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
    fallbackClassName?: string;
    fallbackIconClassName?: string;
    onClick?: MouseEventHandler<HTMLElement>;
    onDragStart?: DragEventHandler<HTMLElement>;
};

/**
 * Image with graceful fallback for Tauri/desktop environments where
 * external images may fail to load (CORS, SSL, network, mixed content).
 * The fallback keeps the same className/style so layout does not collapse.
 */
export function SmartImage({
    src,
    alt,
    className,
    style,
    title,
    loading = "lazy",
    draggable,
    // Desktop webview sends a tauri.localhost Referer — our CDN hotlink rules
    // reject it, so media must request anonymously.
    referrerPolicy = "no-referrer",
    fallbackClassName,
    fallbackIconClassName,
    onClick,
    onDragStart,
}: SmartImageProps) {
    const [error, setError] = useState(false);

    if (!src || error) {
        return (
            <span
                className={cn(
                    "grid place-items-center bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600",
                    className,
                    fallbackClassName,
                )}
                style={style}
                title={title}
                role="img"
                aria-label={alt}
                onClick={onClick}
                onDragStart={onDragStart}
            >
                <FileText className={cn("size-8", fallbackIconClassName)} />
            </span>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            className={className}
            style={style}
            title={title}
            loading={loading}
            draggable={draggable}
            referrerPolicy={referrerPolicy}
            onClick={onClick}
            onDragStart={onDragStart}
            onError={() => setError(true)}
        />
    );
}
