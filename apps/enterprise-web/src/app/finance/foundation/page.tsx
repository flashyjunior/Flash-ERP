import { renderErpFinanceFoundationPage } from "../_foundation-page";

export const dynamic = "force-dynamic";

export default async function FinanceFoundationPage() {
  return renderErpFinanceFoundationPage("overview");
}
