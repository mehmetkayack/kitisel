import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { adminEntitlementsSchema, adminUpdateUserSchema, auditQuerySchema, pageQuerySchema } from '@upvine/shared';
import type { AdminEntitlementsInput, AdminUpdateUserInput } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { AppError } from '../../lib/errors';
import { requireAuth, requireSuperadmin } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { createAdminService } from './admin.service';
import type { AdminActor } from './admin.service';

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

/** /api/v1/admin — sadece superadmin (Bölüm 7.16). Controller'lar sadece HTTP ile ilgilenir. */
export function adminRoutes(deps: AppDeps): Router {
  const s = createAdminService(deps);
  const r = Router();
  r.use(requireAuth(deps.env), requireSuperadmin);

  const h = {
    stats: (async (_req, res) => {
      res.json(await s.stats());
    }) satisfies RequestHandler,
    users: (async (req, res) => {
      res.json(await s.listUsers(parse(pageQuerySchema, req.query)));
    }) satisfies RequestHandler,
    user: (async (req, res) => {
      res.json(await s.getUser(parse(idParam, req.params.id)));
    }) satisfies RequestHandler,
    updateUser: (async (req, res) => {
      res.json(await s.updateUser(parse(idParam, req.params.id), req.body as AdminUpdateUserInput, actor(req)));
    }) satisfies RequestHandler,
    revokeSessions: (async (req, res) => {
      await s.revokeSessions(parse(idParam, req.params.id), actor(req));
      res.status(204).end();
    }) satisfies RequestHandler,
    impersonate: (async (req, res) => {
      res.json(await s.impersonate(parse(idParam, req.params.id), actor(req)));
    }) satisfies RequestHandler,
    orgs: (async (req, res) => {
      res.json(await s.listOrganizations(parse(pageQuerySchema, req.query)));
    }) satisfies RequestHandler,
    org: (async (req, res) => {
      res.json(await s.getOrganization(parse(idParam, req.params.id)));
    }) satisfies RequestHandler,
    audit: (async (req, res) => {
      res.json(await s.listAudit(parse(auditQuerySchema, req.query)));
    }) satisfies RequestHandler,
  };

  r.get('/stats', h.stats);
  r.get('/users', h.users);
  r.get('/users/:id', h.user);
  r.patch('/users/:id', validateBody(adminUpdateUserSchema), h.updateUser);
  r.post('/users/:id/revoke-sessions', h.revokeSessions);
  r.post('/users/:id/impersonate', h.impersonate);
  r.get('/organizations', h.orgs);
  r.get('/organizations/:id', h.org);
  r.put('/organizations/:id/entitlements', validateBody(adminEntitlementsSchema), async (req, res) => {
    res.json(await s.updateEntitlements(parse(idParam, req.params.id), req.body as AdminEntitlementsInput, actor(req)));
  });
  r.get('/audit-logs', h.audit);
  return r;
}
