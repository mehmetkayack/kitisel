import { Router } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { requireAuth } from '../../middleware/auth';
import { requireCsrf } from '../../middleware/csrf';
import { RATE_LIMITS } from '../../middleware/rate-limit';
import { validateBody } from '../../middleware/validate';
import { createAuthController } from './auth.controller';
import { createAuthService } from './auth.service';

export function authRoutes(deps: AppDeps): Router {
  const c = createAuthController(deps, createAuthService(deps));
  const limit = deps.rateLimiter;
  const r = Router();

  r.post('/signup', limit(RATE_LIMITS.signup), validateBody(signupSchema), c.signup);
  r.post('/login', limit(RATE_LIMITS.login), validateBody(loginSchema), c.login);
  r.post('/refresh', requireCsrf, c.refresh);
  r.post('/logout', requireCsrf, c.logout);
  r.post('/verify-email', validateBody(verifyEmailSchema), c.verifyEmail);
  r.post('/resend-verification', limit(RATE_LIMITS.emailResend), requireAuth(deps.env), c.resendVerification);
  r.post('/forgot-password', limit(RATE_LIMITS.passwordReset), validateBody(forgotPasswordSchema), c.forgotPassword);
  r.post('/reset-password', limit(RATE_LIMITS.passwordReset), validateBody(resetPasswordSchema), c.resetPassword);
  r.get('/google', c.googleStart);
  r.get('/google/callback', c.googleCallback);
  return r;
}
