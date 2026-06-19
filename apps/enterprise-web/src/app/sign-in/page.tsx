import { SignInClientPage } from "@/app/sign-in/sign-in-client";
import {
  getEnterprisePublicBranding,
  type EnterprisePublicBranding
} from "@/server/repositories/enterprise-settings.repository";

export const dynamic = "force-dynamic";

const FALLBACK_BRANDING: EnterprisePublicBranding = {
  legalName: "Flash ERP",
  tradingName: "Flash ERP",
  shopName: null,
  companyLogoUrl: null,
  loginBackgroundImageUrl: null
};

export default async function SignInPage() {
  const branding = await getEnterprisePublicBranding().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? `Unable to load Flash ERP sign-in branding: ${error.message}`
        : "Unable to load Flash ERP sign-in branding."
    );

    return FALLBACK_BRANDING;
  });

  return (
    <SignInClientPage
      brandName={branding.shopName ?? branding.tradingName}
      companyLogoUrl={branding.companyLogoUrl}
      loginBackgroundImageUrl={branding.loginBackgroundImageUrl}
    />
  );
}
