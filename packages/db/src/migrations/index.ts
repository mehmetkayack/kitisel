import type { Migration } from './types';
import { migration as m0001 } from './2026_10_08_0001_create_users_and_auth';
import { migration as m0002 } from './2026_10_08_0002_create_organizations';
import { migration as m0003 } from './2026_10_08_0003_create_audit_logs';
import { migration as m0004 } from './2026_10_09_0004_create_sites_and_analysis';
import { migration as m0005 } from './2026_10_10_0005_create_content_and_publishing';
import { migration as m0006 } from './2026_10_10_0006_article_versions_and_rewrites';
import { migration as m0007 } from './2026_10_10_0007_embeddings_and_integrations';
import { migration as m0008 } from './2026_10_10_0008_job_started_at';
import { migration as m0009 } from './2026_10_10_0009_cms_posts_and_site_covers';
import { migration as m0010 } from './2026_10_10_0010_user_covers';
import { migration as m0011 } from './2026_10_12_0011_search_console_and_ai_visibility';
import { migration as m0012 } from './2026_10_12_0012_org_entitlements';
import { migration as m0013 } from './2026_10_12_0013_content_refreshes';
import { migration as m0014 } from './2026_10_13_0014_regeneration_count';
import { migration as m0015 } from './2026_10_19_0015_contact_and_blog';
import { migration as m0016 } from './2026_10_21_0016_billing_orders';
import { migration as m0017 } from './2026_10_27_0017_sales_desk';
import { migration as m0018 } from './2026_10_27_0018_testimonials';

/**
 * Tüm migration'lar sırasıyla. Yeni migration eklerken dosyayı oluşturup buraya ekleyin.
 * Glob yerine açık liste: paketlenmiş (esbuild) çıktıda da çalışır ve sıra belirgindir.
 */
export const migrations: Migration[] = [m0001, m0002, m0003, m0004, m0005, m0006, m0007, m0008, m0009, m0010, m0011, m0012, m0013, m0014, m0015, m0016, m0017, m0018];
