import { NextResponse } from "next/server";

import {
  activateTrialOwner,
  getTrialOwnerActivationContext,
  TrialOwnerActivationError
} from "@/server/trials/trial-owner-activation";

function errorResponse(error: unknown) {
  return NextResponse.json(
    {
      message:
        error instanceof Error ? error.message : "Flash ERP could not activate this trial account."
    },
    {
      status: error instanceof TrialOwnerActivationError ? error.status : 400,
      headers: { "cache-control": "no-store" }
    }
  );
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    return NextResponse.json(await getTrialOwnerActivationContext(token), {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: unknown; password?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    return NextResponse.json(await activateTrialOwner(token, password), {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
