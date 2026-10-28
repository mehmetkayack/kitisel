import { index, layout, prefix, route } from '@react-router/dev/routes';
import type { RouteConfig } from '@react-router/dev/routes';

const isDev = process.env.NODE_ENV !== 'production';

export default [
  // "/" -> tarayıcı diline göre "/{locale}"
  index('routes/root-redirect.tsx'),

  // Halka açık sayfalar (SSR): /{locale}/...
  route(':locale', 'routes/public/layout.tsx', [
    index('routes/public/home.tsx'),
    route('free-analysis', 'routes/public/free-analysis.tsx'),
    route('free-analysis/r/:token', 'routes/public/free-analysis-report.tsx'),
    route('pricing', 'routes/public/pricing.tsx'),
    route('about', 'routes/public/about.tsx'),
    route('contact', 'routes/public/contact.tsx'),
    route('blog', 'routes/public/blog.tsx'),
    route('blog/:slug', 'routes/public/blog-post.tsx'),
    route('legal/:slug', 'routes/public/legal.tsx'),
    layout('routes/public/auth-layout.tsx', [
      route('login', 'routes/public/login.tsx'),
      route('signup', 'routes/public/signup.tsx'),
      route('forgot-password', 'routes/public/forgot-password.tsx'),
      route('reset-password', 'routes/public/reset-password.tsx'),
      route('verify-email', 'routes/public/verify-email.tsx'),
    ]),
  ]),

  // Müşteri paneli (sadece istemci)
  route('app', 'routes/app/layout.tsx', [
    index('routes/app/home.tsx'),
    route('content', 'routes/app/content.tsx'),
    route('content/:id', 'routes/app/content-detail.tsx'),
    route('calendar', 'routes/app/calendar.tsx'),
    route('results', 'routes/app/results.tsx'),
    route('settings', 'routes/app/settings.tsx'),
    route('billing', 'routes/app/billing.tsx'),
    route('onboarding', 'routes/app/onboarding.tsx'),
  ]),

  // Admin paneli (sadece istemci, superadmin) — Bölüm 7.16
  route('admin', 'routes/admin/layout.tsx', [
    index('routes/admin/overview.tsx'),
    route('users', 'routes/admin/users.tsx'),
    route('users/:id', 'routes/admin/user.tsx'),
    route('organizations', 'routes/admin/organizations.tsx'),
    route('organizations/:id', 'routes/admin/organization.tsx'),
    route('audit', 'routes/admin/audit.tsx'),
    route('messages', 'routes/admin/messages.tsx'),
    route('messages/:id', 'routes/admin/message.tsx'),
    route('blog', 'routes/admin/blog.tsx'),
    route('blog/:id', 'routes/admin/blog-edit.tsx'),
    route('testimonials', 'routes/admin/testimonials.tsx'),
    route('testimonials/:id', 'routes/admin/testimonial-edit.tsx'),
    route('sales', 'routes/admin/sales.tsx'),
    route('sales/leads/:id', 'routes/admin/sales-lead.tsx'),
    route('sales/posts', 'routes/admin/sales-posts.tsx'),
    route('sales/posts/:id', 'routes/admin/sales-post.tsx'),
    route('billing', 'routes/admin/billing.tsx'),
    route('billing/:id', 'routes/admin/billing-order.tsx'),
    route(':section', 'routes/admin/coming-soon.tsx'),
  ]),

  // Bileşen vitrini: sadece geliştirme ortamı
  ...(isDev ? prefix('dev', [route('ui', 'routes/dev/ui.tsx')]) : []),

  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
