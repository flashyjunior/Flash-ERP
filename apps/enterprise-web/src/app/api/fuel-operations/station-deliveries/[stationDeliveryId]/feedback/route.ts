import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { assertEnterpriseOrOnlineStorePermission } from "@/server/auth/enterprise-session";
import { recordFuelTransferFeedback } from "@/server/repositories/erp-fuel-operations.repository";

type RouteContext = {
  params: Promise<{
    stationDeliveryId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await assertEnterpriseOrOnlineStorePermission(
      ["fuel.hq.manage"],
      ["inventory.transfer.receive"]
    );
    const { stationDeliveryId } = await context.params;
    const transferId = decodeURIComponent(stationDeliveryId);

    if (session.isOnlineStoreUser) {
      const transfer = await prisma.interStoreTransfer.findFirst({
        where: {
          id: transferId,
          retailOrgId: session.retailOrgId
        },
        select: {
          sourceStore: {
            select: {
              code: true
            }
          },
          destinationStore: {
            select: {
              code: true
            }
          }
        }
      });

      if (!transfer || transfer.destinationStore.code !== session.homeStoreCode) {
        return NextResponse.json(
          {
            message: "Flash ERP transfer feedback can only be captured by the receiving shop."
          },
          { status: 403 }
        );
      }
    }

    const payload = await request.json();
    const response = await recordFuelTransferFeedback(transferId, payload);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not save the fuel transfer feedback."
      },
      { status: 400 }
    );
  }
}
