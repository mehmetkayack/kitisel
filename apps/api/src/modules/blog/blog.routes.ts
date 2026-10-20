import { Router } from 'express';
import { z } from 'zod';
import { isLocale } from '@upvine/config';
import { blogSlugSchema, publicBlogQuerySchema } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { AppError } from '../../lib/errors';
import { createBlogService } from './blog.service';

const idParam = z.string().length(36);

/** `/api/v1/blog` — halka açık blog (oturumsuz): web sunucusu SSR'da okur. Sadece yayımlanmış yazılar. */
export function blogRoutes(_deps: AppDeps): Router {
  const service = createBlogService();
  const r = Router();

  r.get('/', async (req, res) => {
    const query = publicBlogQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError('validation_failed');
    res.setHeader('cache-control', 'public, max-age=60');
    res.json(await service.list(query.data));
  });

  r.get('/posts/:id/cover', async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found');
    const data = await service.cover(id.data);
    res.setHeader('content-type', 'image/webp');
    // Adres güncellenme zamanıyla sürümlü (`?v=`): içerik değişmez
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.send(data);
  });

  r.get('/:locale/:slug', async (req, res) => {
    const slug = blogSlugSchema.safeParse(req.params.slug);
    if (!isLocale(req.params.locale) || !slug.success) throw new AppError('not_found');
    res.setHeader('cache-control', 'public, max-age=60');
    res.json(await service.get(req.params.locale, slug.data));
  });
  return r;
}
