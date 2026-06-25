import { renderErpGlInquiryPage } from "../_gl-inquiry-page";

export const dynamic = "force-dynamic";

type AccountActivityPageProps = {
  searchParams?: Promise<{
    company?: string;
    year?: string;
    period?: string;
    account?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function AccountActivityPage({ searchParams }: AccountActivityPageProps) {
  return renderErpGlInquiryPage("account-activity", searchParams);
}
