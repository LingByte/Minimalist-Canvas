import {
  useEffect,
  useState,
  type CSSProperties,
  type DragEventHandler,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

type SmartImageProps = {
  src?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "auto" | "sync";
  draggable?: boolean;
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
  /** Extra classes on the fallback surface (merged with className). */
  fallbackClassName?: string;
  fallbackIconClassName?: string;
  /** Custom unavailable UI; defaults to a muted ImageOff placeholder. */
  fallback?: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;
  onDragStart?: DragEventHandler<HTMLElement>;
  onError?: () => void;
};

/**
 * Image with graceful fallback when the URL is missing or fails to load
 * (CORS, SSL, hotlink rules, expired CDN, network). Layout stays stable.
 */
export function SmartImage({
  src,
  alt,
  className,
  style,
  title,
  loading = "lazy",
  decoding = "async",
  draggable,
  // Desktop webview sends a tauri.localhost Referer — CDN hotlink rules
  // often reject it, so media must request anonymously.
  referrerPolicy = "no-referrer",
  fallbackClassName,
  fallbackIconClassName,
  fallback,
  onClick,
  onDragStart,
  onError,
}: SmartImageProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  if (!src || error) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <span
        className={cn(
          "grid place-items-center bg-muted text-muted-foreground",
          className,
          fallbackClassName
        )}
        style={style}
        title={title || alt || undefined}
        role="img"
        aria-label={alt || "Image unavailable"}
        onClick={onClick}
        onDragStart={onDragStart}
      >
        <ImageOff className={cn("size-8 opacity-60", fallbackIconClassName)} />
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
      decoding={decoding}
      draggable={draggable}
      referrerPolicy={referrerPolicy}
      onClick={onClick}
      onDragStart={onDragStart}
      onError={() => {
        setError(true);
        onError?.();
      }}
    />
  );
}
