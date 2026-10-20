import express, { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import {
  adminEntitlementsSchema,
  adminUpdateUserSchema,
  auditQuerySchema,
  BLOG_COVER_UPLOAD,
  blogPostSchema,
  blogQuerySchema,
  contactQuerySchema,
  coverAltSchema,
  pageQuerySchema,
  updateContactMessageSchema,
} from '@upvine/shared';
import type { AdminEntitlementsInput, AdminUpdateUserInput, BlogPostInput, UpdateContactMessageInput } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { AppError } from '../../lib/errors';
import { requireAuth, requireSuperadmin } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { createAdminService } from './admin.service';
import type { AdminActor } from './admin.service';
import { createAdminMessagesService } from './admin-messages.service';
import { createAdminBlogService } from '../blog/blog.service';

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

  // İletişim formu mesajları
  const messages = createAdminMessagesService();
  r.get('/contact-messages', async (req, res) => {
    res.json(await messages.list(parse(contactQuerySchema, req.query)));
  });
  r.get('/contact-messages/unread-count', async (_req, res) => {
    res.json({ count: await messages.countNew() });
  });
  r.get('/contact-messages/:id', async (req, res) => {
    res.json(await messages.get(parse(idParam, req.params.id)));
  });
  r.patch('/contact-messages/:id', validateBody(updateContactMessageSchema), async (req, res) => {
    res.json(await messages.update(parse(idParam, req.params.id), req.body as UpdateContactMessageInput, actor(req)));
  });

  // Blog yazıları
  const blog = createAdminBlogService();
  r.get('/blog-posts', async (req, res) => {
    res.json(await blog.list(parse(blogQuerySchema, req.query)));
  });
  r.post('/blog-posts', validateBody(blogPostSchema), async (req, res) => {
    res.status(201).json(await blog.create(req.body as BlogPostInput, actor(req)));
  });
  r.get('/blog-posts/:id', async (req, res) => {
    res.json(await blog.get(parse(idParam, req.params.id)));
  });
  r.put('/blog-posts/:id', validateBody(blogPostSchema), async (req, res) => {
    res.json(await blog.update(parse(idParam, req.params.id), req.body as BlogPostInput, actor(req)));
  });
  r.delete('/blog-posts/:id', async (req, res) => {
    await blog.remove(parse(idParam, req.params.id), actor(req));
    res.status(204).end();
  });
  // Kapak: ham görsel gövdesi + `?alt=` (makale kapağıyla aynı yöntem)
  r.put('/blog-posts/:id/cover', express.raw({ type: [...BLOG_COVER_UPLOAD.mimeTypes], limit: BLOG_COVER_UPLOAD.maxBytes }), async (req, res) => {
    const alt = coverAltSchema.safeParse(req.query.alt ?? '');
    if (!alt.success) throw new AppError('validation_failed', { fields: [{ path: 'alt', message: alt.error.issues[0]?.message ?? 'validation.required' }] });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new AppError('invalid_image');
    res.json(await blog.uploadCover(parse(idParam, req.params.id), req.body, alt.data, actor(req)));
  });
  r.delete('/blog-posts/:id/cover', async (req, res) => {
    res.json(await blog.removeCover(parse(idParam, req.params.id), actor(req)));
  });
  return r;
}
