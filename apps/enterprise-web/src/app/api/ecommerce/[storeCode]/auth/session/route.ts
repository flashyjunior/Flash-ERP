import { NextResponse } from "next/server";

import {
  EcommerceAuthError,
  getEcommerceCustomerSession
} from "@/server/ecommerce/ecommerce-customer-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    const session = await getEcommerceCustomerSession({ storeCode });

    return NextResponse.json({
      authenticated: Boolean(session),
      customer: session
        ? {
            customerNo: session.customerAccount.customer.customerNo,
            fullName: session.customerAccount.customer.fullName,
            email: session.customerAccount.customer.email,
            phone: session.customerAccount.customer.phone,
            identities: session.customerAccount.identities
          }
        : null
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Customer session could not be read." },
      { status: error instanceof EcommerceAuthError ? error.status : 400 }
    );
  }
}
