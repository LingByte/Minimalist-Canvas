import { useParams } from "react-router-dom";

import { Dashboard } from "@/features/dashboard";
import { DocsPage } from "@/features/docs";
import { DOCS_DEFAULT_SECTION, isDocsSectionId } from "@/features/docs/lib/sections";
import { FaqDetailPage, FaqPage } from "@/features/faq";
import { Pricing } from "@/features/pricing";
import { ModelDetails } from "@/features/pricing/components/model-details";

export function SiteDocsPage() {
    const { section } = useParams();
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
