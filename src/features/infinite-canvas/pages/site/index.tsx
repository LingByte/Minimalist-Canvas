import { Navigate, useParams } from "react-router-dom";

import { CampaignPage } from "@/features/campaigns/campaign-page";
import { CreativeCirclePage } from "@/features/creative-circle";
import { CreativeCirclePostPage } from "@/features/creative-circle/post-page";
import { Dashboard } from "@/features/dashboard";
import { DocsPage } from "@/features/docs";
import { DOCS_DEFAULT_SECTION, isDocsSectionId } from "@/features/docs/lib/sections";
import { FaqDetailPage, FaqPage } from "@/features/faq";
import { Pricing } from "@/features/pricing";
import { ModelDetails } from "@/features/pricing/components/model-details";
import { PromptLibrary } from "@/features/prompt-library";
import { UsageLogs } from "@/features/usage-logs";
import {
  isUsageLogsSectionId,
  USAGE_LOGS_DEFAULT_SECTION,
} from "@/features/usage-logs/section-registry";

export function SiteDocsPage() {
    const { section } = useParams();
    if (section && !isDocsSectionId(section)) {
        return <Navigate to={`/docs/${DOCS_DEFAULT_SECTION}`} replace />;
    }
    const resolved = section && isDocsSectionId(section) ? section : DOCS_DEFAULT_SECTION;
    return <DocsPage section={resolved} />;
}

export function SiteFaqPage() {
    return <FaqPage />;
}

export function SiteFaqDetailPage() {
    const { faqId } = useParams();
    return <FaqDetailPage faqId={faqId ?? ""} />;
}

export function SitePricingPage() {
    return <Pricing />;
}

export function SitePricingModelPage() {
    return <ModelDetails />;
}

export function SiteDashboardPage() {
    return <Dashboard />;
}

export function SiteUsageLogsPage() {
    const { section } = useParams();
    if (section && !isUsageLogsSectionId(section)) {
        return <Navigate to={`/usage-logs/${USAGE_LOGS_DEFAULT_SECTION}`} replace />;
    }
    return <UsageLogs />;
}

export function SiteUsageLogsIndexPage() {
    return <Navigate to="/usage-logs/task" replace />;
}

export function SiteCreativeCirclePage() {
    return <CreativeCirclePage />;
}

export function SiteCreativeCirclePostPage() {
    const { postId } = useParams();
    const id = Number(postId);
    if (!Number.isInteger(id) || id <= 0) {
        return <Navigate to="/creative-circle" replace />;
    }
    return <CreativeCirclePostPage postId={id} />;
}

export function SitePromptLibraryPage() {
    return <PromptLibrary />;
}

export function SiteCampaignPage() {
    const { slug } = useParams();
    if (!slug) {
        return <Navigate to="/home" replace />;
    }
    return <CampaignPage slug={slug} />;
}
