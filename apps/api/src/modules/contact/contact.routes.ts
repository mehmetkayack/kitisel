import { Router } from 'express';
import { contactMessageSchema } from '@upvine/shared';
import type { ContactMessageInput } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { RATE_LIMITS } from '../../middleware/rate-limit';
import { validateBody } from '../../middleware/validate';
import { createContactService } from './contact.service';

/** `/api/v1/contact` — halka açık iletişim formu (oturumsuz, reCAPTCHA v3). Mesajlar admin panelinde. */
export function contactRoutes(deps: AppDeps): Router {
  const service = createContactService({ env: deps.env, logger: deps.logger, fetch: deps.fetch, mailer: deps.mailer });
  const r = Router();
  r.post('/', deps.rateLimiter(RATE_LIMITS.contact), validateBody(contactMessageSchema), async (req, res) => {
    await service.submit(req.body as ContactMessageInput, { ip: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ ok: true });
  });
  return r;
}
