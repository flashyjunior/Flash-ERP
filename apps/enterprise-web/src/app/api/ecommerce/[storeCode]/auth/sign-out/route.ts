import { NextResponse } from "next/server";

import { signOutEcommerceCustomer } from "@/server/ecommerce/ecommerce-customer-auth";

export async function POST() {
  return NextResponse.json(await signOutEcommerceCustomer());
}
