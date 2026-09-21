import { NextResponse } from "next/server";

import { unlockOnlineStoreScreen } from "@/server/repositories/online-store.repository";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const response = await unlockOnlineStoreScreen({
      loginId: body?.loginId ?? "",
      password: body?.password ?? ""
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not unlock the Online POS."
      },
      { status: 400 }
    );
  }
}
