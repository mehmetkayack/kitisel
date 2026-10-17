import { Router } from 'express';
import type { RequestHandler } from 'express';
import { updateMeSchema } from '@upvine/shared';
import type { UpdateMeInput } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { buildMe, updateMe } from './me.service';

const getMe: RequestHandler = async (req, res) => {
  res.json(await buildMe(req.auth!.userId));
};

const patchMe: RequestHandler = async (req, res) => {
  res.json(await updateMe(req.auth!.userId, req.body as UpdateMeInput));
};

export function meRoutes(deps: AppDeps): Router {
  const r = Router();
  r.use(requireAuth(deps.env));
  r.get('/', getMe);
  r.patch('/', validateBody(updateMeSchema), patchMe);
  return r;
}
