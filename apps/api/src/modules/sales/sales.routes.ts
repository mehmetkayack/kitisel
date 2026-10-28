import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import {
  salesImportQuerySchema,
  salesImportSchema,
  salesLeadCreateSchema,
  salesLeadEventSchema,
  salesLeadQuerySchema,
  salesLeadUpdateSchema,
  salesPostQuerySchema,
  salesPostSchema,
  salesPostUpdateSchema,
} from '@upvine/shared';
import type { SalesImportData, SalesLeadCreateInput, SalesLeadEventInput, SalesLeadUpdateInput, SalesPostInput, SalesPostUpdateInput } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { AppError } from '../../lib/errors';
import { validateBody } from '../../middleware/validate';
import type { AdminActor } from '../admin/admin.service';
import { createSalesService } from './sales.service';

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

/**
 * `/api/v1/admin/sales` — satış masası. Admin yönlendiricisinin altında bağlanır: `requireAuth` + `requireSuperadmin`
 * zaten uygulanmış olur. Hiçbir uç nokta mesaj göndermez.
 */
export function salesRoutes(deps: AppDeps): Router {
  const s = createSalesService({ sequelize: deps.sequelize });
  const r = Router();

  r.get('/leads', async (req, res) => {
    res.json(await s.list(parse(salesLeadQuerySchema, req.query)));
  });
  r.get('/leads/summary', async (_req, res) => {
    res.json(await s.summary());
  });
  r.post('/leads', validateBody(salesLeadCreateSchema), async (req, res) => {
    res.status(201).json(await s.create(req.body as SalesLeadCreateInput, actor(req)));
  });
  r.post('/leads/match-users', async (req, res) => {
    res.json(await s.matchUsers(actor(req)));
  });
  r.post('/leads/cleanup', async (req, res) => {
    res.json(await s.cleanup(actor(req)));
  });
  r.get('/leads/:id', async (req, res) => {
    res.json(await s.get(parse(idParam, req.params.id)));
  });
  r.patch('/leads/:id', validateBody(salesLeadUpdateSchema), async (req, res) => {
    res.json(await s.update(parse(idParam, req.params.id), req.body as SalesLeadUpdateInput, actor(req)));
  });
  r.post('/leads/:id/events', validateBody(salesLeadEventSchema), async (req, res) => {
    res.status(201).json(await s.addEvent(parse(idParam, req.params.id), req.body as SalesLeadEventInput, actor(req)));
  });
  r.delete('/leads/:id', async (req, res) => {
    await s.remove(parse(idParam, req.params.id), actor(req));
    res.status(204).end();
  });

  r.post('/import', validateBody(salesImportSchema), async (req, res) => {
    const q = parse(salesImportQuerySchema, req.query);
    res.json(await s.importData(req.body as SalesImportData, { dryRun: q.dryRun === '1', mode: q.mode }, actor(req)));
  });

  r.get('/export.csv', async (req, res) => {
    const csv = await s.exportCsv(parse(salesLeadQuerySchema, req.query));
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="kitisel-adaylar-${date}.csv"`);
    res.send(csv);
  });

  r.get('/posts', async (req, res) => {
    const q = parse(salesPostQuerySchema, req.query);
    res.json({ items: await s.listPosts(q.from, q.to) });
  });
  r.post('/posts', validateBody(salesPostSchema), async (req, res) => {
    res.status(201).json(await s.createPost(req.body as SalesPostInput, actor(req)));
  });
  r.get('/posts/:id', async (req, res) => {
    res.json(await s.getPost(parse(idParam, req.params.id)));
  });
  r.patch('/posts/:id', validateBody(salesPostUpdateSchema), async (req, res) => {
    res.json(await s.updatePost(parse(idParam, req.params.id), req.body as SalesPostUpdateInput, actor(req)));
  });
  r.delete('/posts/:id', async (req, res) => {
    await s.removePost(parse(idParam, req.params.id), actor(req));
    res.status(204).end();
  });
  return r;
}
