import { redirect } from "next/navigation";

import { EcommerceAuthError } from "@/server/ecommerce/ecommerce-customer-auth";
import { requireOnlineStoreStaff } from "@/server/ecommerce/ecommerce.repository";

export const dynamic = "force-dynamic";

export default async function OnlineStoreEcommercePage() {
  try {
    await requireOnlineStoreStaff();
  } catch (error) {
    if (error instanceof EcommerceAuthError && [401, 403].includes(error.status)) {
      redirect("/unauthorized");
    }
    throw error;
  }

  redirect("/online-store?workspace=ecommerce");
}
