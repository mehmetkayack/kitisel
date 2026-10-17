import { Router } from 'express';
import { createFreeAnalysisSchema, freeAnalysisEmailSchema } from '@upvine/shared';
import type { CreateFreeAnalysisInput, FreeAnalysisEmailInput } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { RATE_LIMITS } from '../../middleware/rate-limit';
import { validateBody } from '../../middleware/validate';
import { createFreeAnalysisService } from './free-analysis.service';

/** `/api/v1/free-analyses` — kayıt gerektirmeyen ücretsiz analiz (Bölüm 7.2). Erişim paylaşım token'ıyla. */
export function freeAnalysisRoutes(deps: AppDeps): Router {
  const service = createFreeAnalysisService({ env: deps.env, jobs: deps.jobs, mailer: deps.mailer, logger: deps.logger, fetch: deps.fetch });
  const r = Router();

  r.post('/', deps.rateLimiter(RATE_LIMITS.freeAnalysis), validateBody(createFreeAnalysisSchema), async (req, res) => {
    const out = await service.create(req.body as CreateFreeAnalysisInput, { ip: req.ip });
    res.status(out.cached ? 200 : 201).json(out);
  });
  r.get('/:token', async (req, res) => {
    res.json(await service.get(String(req.params.token)));
  });
  r.post('/:token/email', deps.rateLimiter(RATE_LIMITS.emailResend), validateBody(freeAnalysisEmailSchema), async (req, res) => {
    res.json(await service.email(String(req.params.token), req.body as FreeAnalysisEmailInput, req.locale ?? 'en'));
  });
  return r;
}
