import { renderErpGlInquiryPage } from "../_gl-inquiry-page";

export const dynamic = "force-dynamic";

type JournalInquiryPageProps = {
  searchParams?: Promise<{
    company?: string;
    year?: string;
    period?: string;
    account?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function JournalInquiryPage({ searchParams }: JournalInquiryPageProps) {
  return renderErpGlInquiryPage("journal-inquiry", searchParams);
}
