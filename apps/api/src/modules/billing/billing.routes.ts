import express, { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { checkoutSchema } from '@upvine/shared';
import type { CheckoutInput } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { RATE_LIMITS } from '../../middleware/rate-limit';
import { validateBody } from '../../middleware/validate';
import { resolveContext } from '../sites/sites.service';
import type { SiteContext } from '../sites/sites.service';
import type { BillingService } from './billing.service';

const idParam = z.string().length(36);

async function context(req: Request): Promise<SiteContext> {
  const ctx = await resolveContext(req.auth!.userId, req.get('x-org-id') || undefined);
  return { ...ctx, ip: req.ip, userAgent: req.get('user-agent') };
}

function id(req: Request): string {
  const parsed = idParam.safeParse(req.params.id);
  if (!parsed.success) throw new AppError('not_found');
  return parsed.data;
}

/** `/api/v1/billing` — ödeme sayfası, sipariş ve PayTR bildirimi (Bölüm 7.15). */
export function billingRoutes(deps: AppDeps, service: BillingService): Router {
  const r = Router();

  // PayTR Bildirim URL'i: oturumsuz, form gövdesi; yanıt sadece düz metin "OK" (PayTR kuralı)
  r.post('/paytr/callback', express.urlencoded({ extended: false, limit: '20kb' }), async (req, res) => {
    const ok = await service.handlePaytrNotification((req.body ?? {}) as Record<string, unknown>);
    res.status(ok ? 200 : 400).type('text/plain').send(ok ? 'OK' : 'PAYTR notification failed: bad hash');
  });

  r.use(requireAuth(deps.env));
  r.get('/', async (req, res) => {
    res.json(await service.overview(await context(req)));
  });
  r.post('/checkout', deps.rateLimiter(RATE_LIMITS.checkout), validateBody(checkoutSchema), async (req, res) => {
    res.status(201).json(await service.checkout(await context(req), req.body as CheckoutInput, { locale: req.locale }));
  });
  r.get('/orders/:id', async (req, res) => {
    res.json(await service.getOrder(await context(req), id(req)));
  });
  r.post('/orders/:id/cancel', async (req, res) => {
    res.json(await service.cancelTransfer(await context(req), id(req)));
  });
  return r;
}
