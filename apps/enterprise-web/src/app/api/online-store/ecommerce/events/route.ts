import { getEcommerceOrderStreamSnapshot } from "@/server/ecommerce/ecommerce.repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

function eventPayload(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request) {
  try {
    await getEcommerceOrderStreamSnapshot();
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Ecommerce live updates are unavailable." },
      { status: 403 }
    );
  }

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastSignature = "";
      const close = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearTimeout(pollTimer);
        try {
          controller.close();
        } catch {
          // The browser or development server may already have closed the stream.
        }
      };
      const enqueue = (payload: Uint8Array) => {
        if (closed || request.signal.aborted) return false;
        try {
          controller.enqueue(payload);
          return true;
        } catch {
          close();
          return false;
        }
      };
      const poll = async () => {
        if (closed || request.signal.aborted) {
          close();
          return;
        }

        try {
          const snapshot = await getEcommerceOrderStreamSnapshot();
          if (!enqueue(
            snapshot.signature !== lastSignature
              ? eventPayload("orders", snapshot)
              : eventPayload("heartbeat", { at: new Date().toISOString() })
          )) return;
          lastSignature = snapshot.signature;
        } catch (error) {
          enqueue(eventPayload("error", {
            message: error instanceof Error ? error.message : "Live updates were interrupted."
          }));
          close();
          return;
        }

        pollTimer = setTimeout(() => void poll(), 4000);
      };

      request.signal.addEventListener("abort", close, { once: true });
      enqueue(encoder.encode("retry: 5000\n\n"));
      void poll();
    },
    cancel() {
      closed = true;
      if (pollTimer) clearTimeout(pollTimer);
    }
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no"
    }
  });
}
