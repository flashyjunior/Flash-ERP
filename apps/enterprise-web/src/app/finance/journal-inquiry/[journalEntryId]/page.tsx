import { renderErpGlInquiryPage } from "../../_gl-inquiry-page";

export const dynamic = "force-dynamic";

type JournalDetailPageProps = {
  params: Promise<{
    journalEntryId: string;
  }>;
  searchParams?: Promise<{
    company?: string;
    year?: string;
    period?: string;
    account?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function JournalDetailPage({
  params,
  searchParams
}: JournalDetailPageProps) {
  const { journalEntryId } = await params;

  return renderErpGlInquiryPage("journal-detail", searchParams, journalEntryId);
}
