import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { TrialSignupPage } from "@/app/signup/signup-client";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Start a 14-Day Flash ERP Trial",
  description:
    "Experience Flash ERP across HQ, Online Store, ecommerce and offline-first Store Desktop operations."
};

export const dynamic = "force-dynamic";

export default function SignupPage() {
  const whatsappNumber = (process.env.FLASH_ERP_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const whatsappMessage =
    process.env.FLASH_ERP_TRIAL_WHATSAPP_MESSAGE?.trim() ||
    "Hello Flash Code Solutions, I would like help with a Flash ERP trial.";

  return (
    <div className={inter.className}>
      <TrialSignupPage
        turnstileSiteKey={process.env.NEXT_PUBLIC_FLASH_ERP_TRIAL_TURNSTILE_SITE_KEY ?? ""}
        whatsappNumber={/^\d{8,15}$/.test(whatsappNumber) ? whatsappNumber : ""}
        whatsappMessage={whatsappMessage}
      />
    </div>
  );
}
