"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
  ShoppingBag
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./payment-return.module.css";

type VerificationResult = {
  status: string;
  orderNo: string;
  paymentStatus: string;
  paidAmount?: number;
  balanceAmount?: number;
  message: string;
};

async function readJson(response: Response) {
  const body = (await response.json().catch(() => ({}))) as VerificationResult & {
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? "Payment could not be verified.");
  }
  return body;
}

export function PaymentReturn({
  provider,
  providerStatus,
  providerTransactionId,
  reference,
  storeCode
}: {
  provider: string;
  providerStatus: string;
  providerTransactionId: string;
  reference: string;
  storeCode: string;
}) {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!reference) {
        setError("The payment provider did not return a payment reference.");
        return;
      }

      try {
        const verified = await readJson(
          await fetch(
            `/api/ecommerce/${encodeURIComponent(storeCode)}/payments/${encodeURIComponent(reference)}/verify`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ providerTransactionId: providerTransactionId || null })
            }
          )
        );
        if (!cancelled) {
          setResult(verified);
        }
      } catch (verificationError) {
        if (!cancelled) {
          setError(
            verificationError instanceof Error
              ? verificationError.message
              : "Payment could not be verified."
          );
        }
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [providerTransactionId, reference, storeCode]);

  const storefrontHref = `/shop/${encodeURIComponent(storeCode)}`;
  const isLoading = !result && !error;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href={storefrontHref}>
          <ShoppingBag size={22} />
          <span>Online shop</span>
        </Link>
        <span><LockKeyhole size={15} />Secure payment return</span>
      </header>

      <section className={styles.resultPanel} aria-live="polite">
        {isLoading ? (
          <>
            <span className={styles.loadingIcon}><LoaderCircle size={44} /></span>
            <p className={styles.eyebrow}>Checking with {provider || "payment provider"}</p>
            <h1>Confirming your payment</h1>
            <p>Please keep this page open while we verify the transaction.</p>
          </>
        ) : result ? (
          <>
            <span className={styles.successIcon}><CheckCircle2 size={48} /></span>
            <p className={styles.eyebrow}>{result.paymentStatus.replace(/_/g, " ")}</p>
            <h1>Payment confirmed</h1>
            <p>Your order is safely recorded and the shop can begin processing it.</p>
            <div className={styles.receipt}>
              <ReceiptText size={21} />
              <span><small>Order number</small><strong>{result.orderNo}</strong></span>
            </div>
          </>
        ) : (
          <>
            <span className={styles.errorIcon}><CircleAlert size={48} /></span>
            <p className={styles.eyebrow}>{providerStatus || "Verification incomplete"}</p>
            <h1>We could not confirm payment</h1>
            <p>{error}</p>
            {reference ? <small className={styles.reference}>Reference: {reference}</small> : null}
          </>
        )}

        <div className={styles.actions}>
          <Link className={styles.primaryAction} href={storefrontHref}>
            Return to shop <ArrowRight size={18} />
          </Link>
          <p>Open your account in the shop to track orders and refund requests.</p>
        </div>
      </section>
    </main>
  );
}
