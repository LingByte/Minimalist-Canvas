import { AppConfigModal } from "@canvas/components/layout/app-config-modal";

/**
 * Keeps AppConfigModal mounted for routes that do not render CanvasToolsSidebar.
 * Canvas workbench chrome lives in CanvasToolsSidebar.
 */
export function AppTopNav() {
    return <AppConfigModal />;
}
