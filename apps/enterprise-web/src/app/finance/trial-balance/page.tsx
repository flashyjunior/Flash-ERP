import { renderErpGlInquiryPage } from "../_gl-inquiry-page";

export const dynamic = "force-dynamic";

type TrialBalancePageProps = {
  searchParams?: Promise<{
    company?: string;
    year?: string;
    period?: string;
    account?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function TrialBalancePage({ searchParams }: TrialBalancePageProps) {
  return renderErpGlInquiryPage("trial-balance", searchParams);
}
