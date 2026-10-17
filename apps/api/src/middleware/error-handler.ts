import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody, ErrorCode } from '@upvine/shared';
import { AppError } from '../lib/errors';
import { tFor } from '../lib/i18n';

export const notFoundHandler: RequestHandler = () => {
  throw new AppError('not_found');
};

/**
 * Merkezî hata yakalayıcı. Express 5 async hataları otomatik iletir.
 * Kullanıcıya asla stack trace veya ham teknik mesaj gösterilmez.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let code: ErrorCode = 'internal';
  let status = 500;
  let details: unknown;

  if (err instanceof AppError) {
    code = err.code;
    status = err.status;
    details = err.details;
  } else if (isBodyParserError(err)) {
    code = 'validation_failed';
    status = 400;
  } else {
    req.log.error({ err }, 'unhandled error');
  }

  const body: ApiErrorBody = {
    error: {
      code,
      // Ayrıntılar (ör. { limit }) mesajdaki {{değişken}}leri doldurur
      message: tFor(req.locale ?? 'en')(code, details !== null && typeof details === 'object' ? (details as Record<string, unknown>) : undefined),
      ...(details === undefined ? {} : { details }),
      requestId: String(req.id),
    },
  };
  res.status(status).json(body);
};

function isBodyParserError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string' &&
    ['entity.parse.failed', 'entity.too.large'].includes((err as { type: string }).type)
  );
}
