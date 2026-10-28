import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { publicTestimonialQuerySchema, testimonialSchema, testimonialTranslationSchema } from '@upvine/shared';
import type { TestimonialInput, TestimonialTranslationInput } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { AppError } from '../../lib/errors';
import { validateBody } from '../../middleware/validate';
import type { AdminActor } from '../admin/admin.service';
import { createAdminTestimonialsService, createTestimonialsService } from './testimonials.service';

const idParam = z.string().length(36);

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('validation_failed');
  return result.data;
}

const actor = (req: Request): AdminActor => ({
  adminId: req.auth!.userId,
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

/** `/api/v1/testimonials` — halka açık (oturumsuz): ana sayfa SSR'da okur. */
export function testimonialsRoutes(_deps: AppDeps): Router {
  const service = createTestimonialsService();
  const r = Router();
  r.get('/', async (req, res) => {
    const { locale } = parse(publicTestimonialQuerySchema, req.query);
    res.setHeader('cache-control', 'public, max-age=60');
    res.json({ items: await service.list(locale) });
  });
  return r;
}

/** `/api/v1/admin/testimonials` — admin yönlendiricisinin altında (`requireAuth` + `requireSuperadmin`). */
export function adminTestimonialsRoutes(deps: AppDeps): Router {
  const s = createAdminTestimonialsService(deps.jobs);
  const r = Router();
  r.get('/', async (_req, res) => {
    res.json({ items: await s.list() });
  });
  r.post('/', validateBody(testimonialSchema), async (req, res) => {
    res.status(201).json(await s.create(req.body as TestimonialInput, actor(req)));
  });
  r.get('/:id', async (req, res) => {
    res.json(await s.get(parse(idParam, req.params.id)));
  });
  r.put('/:id', validateBody(testimonialSchema), async (req, res) => {
    res.json(await s.update(parse(idParam, req.params.id), req.body as TestimonialInput, actor(req)));
  });
  r.delete('/:id', async (req, res) => {
    await s.remove(parse(idParam, req.params.id), actor(req));
    res.status(204).end();
  });
  r.post('/:id/translate', async (req, res) => {
    res.json(await s.translate(parse(idParam, req.params.id), actor(req)));
  });
  r.put('/:id/translations/:locale', validateBody(testimonialTranslationSchema), async (req, res) => {
    res.json(await s.setTranslation(parse(idParam, req.params.id), String(req.params.locale), req.body as TestimonialTranslationInput, actor(req)));
  });
  r.delete('/:id/translations/:locale', async (req, res) => {
    res.json(await s.resetTranslation(parse(idParam, req.params.id), String(req.params.locale), actor(req)));
  });
  return r;
}
