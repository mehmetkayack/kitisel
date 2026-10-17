import type { Locale } from '@upvine/config';

declare global {
  namespace Express {
    // `req.id` (istek id'si) pino-http tarafından tanımlanır.
    interface Request {
      /** Kullanıcının dili: profil > çerez > Accept-Language */
      locale: Locale;
      /** requireAuth sonrası doludur */
      auth?: { userId: string; actorId: string | null };
    }
  }
}

export {};
