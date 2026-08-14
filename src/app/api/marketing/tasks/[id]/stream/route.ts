import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { listTaskEvents } from '@/lib/marketing/async/worker';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/marketing/tasks/:id/stream - SSE 事件流（V3 Phase 6）
 * 每 1.5s 推送增量事件；任务到达终态后发送 done 并结束。
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor: string | undefined;
      let finished = false;
      let tick = 0;

      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const heartbeat = setInterval(() => {
        if (!finished) {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        }
      }, 15000);

      const loop = async () => {
        try {
          const { events, nextCursor } = await listTaskEvents(user.id, id, cursor);
          for (const event of events) {
            send({
              id: event.id,
              type: event.type,
              itemId: event.itemId,
              payload: event.payload,
              createdAt: event.createdAt.toISOString(),
            });
            if (event.type === 'task_completed' || event.type === 'task_failed' || event.type === 'task_cancelled') {
              finished = true;
            }
          }
          cursor = nextCursor ?? cursor;
          if (finished) {
            send({ type: 'done' });
            clearInterval(heartbeat);
            controller.close();
            return;
          }
          tick += 1;
          if (tick > 600) {
            // 5 分钟超时保护
            send({ type: 'timeout' });
            clearInterval(heartbeat);
            controller.close();
            return;
          }
          setTimeout(() => void loop(), 1500);
        } catch {
          clearInterval(heartbeat);
          controller.close();
        }
      };

      void loop();

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
