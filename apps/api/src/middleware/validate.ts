import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/errors';

/**
 * İstek gövdesini Zod ile doğrular ve `req.body`'yi doğrulanmış değerle değiştirir.
 * Hata detayları alan bazında döner; mesajlar i18n anahtarıdır (`validation.*`).
 */
export function validateBody<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const fields = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      throw new AppError('validation_failed', { fields });
    }
    req.body = result.data;
    next();
  };
}
