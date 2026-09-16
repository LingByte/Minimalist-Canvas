import { useState, type CSSProperties } from "react";
import { FileText } from "lucide-react";

import { cn } from "@canvas/lib/utils";

type SmartImageProps = {
    src?: string;
    alt: string;
    className?: string;
    style?: CSSProperties;
    loading?: "lazy" | "eager";
    fallbackClassName?: string;
    fallbackIconClassName?: string;
};

/**
 * Image with graceful fallback for Tauri/desktop environments where
 * external images may fail to load (CORS, network, mixed content, etc.).
 * Shows a placeholder icon instead of a broken image.
 */
export function SmartImage({
    src,
    alt,
    className,
    style,
    loading = "lazy",
    fallbackClassName,
    fallbackIconClassName,
}: SmartImageProps) {
    const [error, setError] = useState(false);

    if (!src || error) {
        return (
            <span
                className={cn(
                    "grid place-items-center bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600",
                    fallbackClassName,
                )}
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
            loading={loading}
            onError={() => setError(true)}
        />
    );
}
