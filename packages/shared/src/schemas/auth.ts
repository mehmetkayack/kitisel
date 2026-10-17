import { z } from 'zod';
import { LOCALES } from '@upvine/config';

/**
 * Kimlik doğrulama şemaları. Hem API (istek doğrulama) hem web (form doğrulama) kullanır.
 * Hata mesajları i18n anahtarıdır (`validation.*`), arayüz bunları kullanıcının diline çevirir.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(255, 'validation.tooLong')
  .pipe(z.email('validation.email'));

export const passwordSchema = z
  .string()
  .min(10, 'validation.passwordMin')
  .max(128, 'validation.passwordMax');

export const localeSchema = z.enum(LOCALES);
export const themeSchema = z.enum(['system', 'light', 'dark']);

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(120, 'validation.tooLong'),
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'validation.required').max(128, 'validation.tooLong'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(16).max(128) });

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1, 'validation.required').max(120, 'validation.tooLong'),
    locale: localeSchema,
    theme: themeSchema,
  })
  .partial();

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const roleSchema = z.enum(['owner', 'admin', 'editor', 'viewer']);

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  locale: localeSchema,
  theme: themeSchema,
  emailVerified: z.boolean(),
  isSuperadmin: z.boolean(),
  organizations: z.array(
    z.object({ id: z.string(), name: z.string(), slug: z.string(), role: roleSchema }),
  ),
});
export type Me = z.infer<typeof meSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: meSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
