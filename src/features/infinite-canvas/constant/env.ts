export const APP_VERSION = __APP_VERSION__ || "dev";

export const DOCS_URL = import.meta.env.VITE_DOC_URL || "https://docs.canvas.best";

/** Self-hosted official plugin registry (`public/plugins/official-plugins.json`). */
export const LOCAL_PLUGIN_REGISTRY_URL = "/plugins/official-plugins.json";

/** Upstream official registry on jsDelivr; used when local manifest is empty. */
export const REMOTE_PLUGIN_REGISTRY_URL =
    import.meta.env.VITE_PLUGIN_REGISTRY_FALLBACK_URL ||
    "https://cdn.jsdelivr.net/gh/basketikun/infinite-canvas@plugins-dist/official-plugins.json";

export const PLUGIN_REGISTRY_URL = import.meta.env.VITE_PLUGIN_REGISTRY_URL || LOCAL_PLUGIN_REGISTRY_URL;
