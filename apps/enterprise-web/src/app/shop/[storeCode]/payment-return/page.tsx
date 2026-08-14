import { PaymentReturn } from "@/components/ecommerce/payment-return";

export const dynamic = "force-dynamic";

export default async function EcommercePaymentReturnPage({
  params,
  searchParams
}: {
  params: Promise<{ storeCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ storeCode }, query] = await Promise.all([params, searchParams]);
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] ?? "" : value ?? "";

  return (
    <PaymentReturn
      provider={first(query.provider)}
      providerStatus={first(query.status)}
      providerTransactionId={first(query.transaction_id)}
      reference={first(query.reference) || first(query.tx_ref)}
      storeCode={storeCode}
    />
  );
}
