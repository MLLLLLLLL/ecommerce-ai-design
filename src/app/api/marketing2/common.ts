import { NextResponse } from 'next/server';
import { Marketing2Error } from '@/lib/marketing2/schemas';

/** 统一错误响应：Marketing2Error 带错误码返回，其余按 500。 */
export function handleMarketing2Error(error: unknown, context: string) {
  if (error instanceof Marketing2Error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        },
        requestId: crypto.randomUUID(),
      },
      { status: error.httpStatus }
    );
  }
  console.error(`[API] ${context} error:`, error);
  return NextResponse.json(
    {
      success: false,
      error: { code: 'UPSTREAM_FAILED', message: '服务内部错误' },
      requestId: crypto.randomUUID(),
    },
    { status: 500 }
  );
}

/** 读取幂等键请求头（V2 8.2）。 */
export function readIdempotencyKey(request: Request): string {
  return request.headers.get('idempotency-key') ?? '';
}
