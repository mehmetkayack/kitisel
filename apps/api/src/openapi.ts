import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  authResponseSchema,
  ERROR_CODES,
  forgotPasswordSchema,
  loginSchema,
  meSchema,
  resetPasswordSchema,
  signupSchema,
  updateMeSchema,
  verifyEmailSchema,
} from '@upvine/shared';

/** OpenAPI dokümanı paylaşılan Zod şemalarından üretilir (tek doğruluk kaynağı). */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const error = z
    .object({
      error: z.object({
        code: z.enum(ERROR_CODES),
        message: z.string(),
        details: z.unknown().optional(),
        requestId: z.string().optional(),
      }),
    })
    .meta({ id: 'Error' });
  const auth = authResponseSchema.meta({ id: 'AuthResponse' });
  const me = meSchema.meta({ id: 'Me' });
  const bearer = registry.registerComponent('securitySchemes', 'bearer', {
    type: 'http',
    scheme: 'bearer',
  });

  const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
  const errors = { default: { description: 'Error', ...json(error) } };
  const post = (path: string, summary: string, body: z.ZodType | null, ok: Record<string, unknown>) =>
    registry.registerPath({
      method: 'post',
      path,
      summary,
      tags: ['auth'],
      ...(body ? { request: { body: json(body) } } : {}),
      responses: { ...ok, ...errors },
    });

  post('/api/v1/auth/signup', 'Create account', signupSchema, { 201: { description: 'Signed up', ...json(auth) } });
  post('/api/v1/auth/login', 'Sign in', loginSchema, { 200: { description: 'Signed in', ...json(auth) } });
  post('/api/v1/auth/refresh', 'Rotate refresh token (cookie + x-csrf-token)', null, {
    200: { description: 'New access token', ...json(auth) },
  });
  post('/api/v1/auth/logout', 'Sign out (cookie + x-csrf-token)', null, { 204: { description: 'Signed out' } });
  post('/api/v1/auth/verify-email', 'Verify email', verifyEmailSchema, { 204: { description: 'Verified' } });
  post('/api/v1/auth/resend-verification', 'Resend verification email', null, { 204: { description: 'Sent' } });
  post('/api/v1/auth/forgot-password', 'Request password reset', forgotPasswordSchema, {
    204: { description: 'Always 204' },
  });
  post('/api/v1/auth/reset-password', 'Reset password', resetPasswordSchema, { 204: { description: 'Reset' } });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me',
    tags: ['me'],
    security: [{ [bearer.name]: [] }],
    responses: { 200: { description: 'Current user', ...json(me) }, ...errors },
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me',
    tags: ['me'],
    security: [{ [bearer.name]: [] }],
    request: { body: json(updateMeSchema) },
    responses: { 200: { description: 'Updated user', ...json(me) }, ...errors },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Upvine API', version: '1.0.0' },
  });
}
