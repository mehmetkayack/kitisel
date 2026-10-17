import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

/**
 * Sonuçlar sayfası (Bölüm 7.11, 7.12):
 * - `gsc_connections`: site başına Search Console bağlantısı (şifreli refresh token, seçilen mülk)
 * - `gsc_daily_metrics`: günlük sayfa + sorgu metrikleri; `page = ''` ve `query = ''` satırı günün toplamıdır
 *   (anonim sorgular sayfa/sorgu kırılımında görünmediği için toplam ayrıca saklanır)
 * - `ai_visibility_prompts` / `ai_visibility_checks`: müşteri soruları ve yapay zekâ cevabında markanın anılması
 */
export const migration: Migration = {
  name: '2026_10_12_0011_search_console_and_ai_visibility',
  async up({ context: qi }) {
    await qi.createTable('gsc_connections', {
      id: id(),
      organization_id: fk('organizations', 'CASCADE'),
      site_id: fk('sites', 'CASCADE'),
      google_email: { type: DataTypes.STRING(320), allowNull: true },
      property: { type: DataTypes.STRING(512), allowNull: true },
      /** Bağlantıda erişilebilen mülkler (kullanıcı seçsin diye) */
      properties: { type: DataTypes.JSON, allowNull: false },
      ciphertext: { type: DataTypes.BLOB, allowNull: false },
      iv: { type: DataTypes.BLOB('tiny'), allowNull: false },
      auth_tag: { type: DataTypes.BLOB('tiny'), allowNull: false },
      key_version: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
      sync_status: { type: DataTypes.ENUM('idle', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'idle' },
      sync_error: { type: DataTypes.STRING(40), allowNull: true },
      sync_started_at: { type: DataTypes.DATE, allowNull: true },
      last_synced_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(),
    }, tableOptions);
    await qi.addIndex('gsc_connections', ['site_id'], { unique: true });
    await qi.addIndex('gsc_connections', ['organization_id']);

    await qi.createTable('gsc_daily_metrics', {
      id: id(),
      organization_id: fk('organizations', 'CASCADE'),
      site_id: fk('sites', 'CASCADE'),
      date: { type: DataTypes.DATEONLY, allowNull: false },
      page: { type: DataTypes.STRING(2048), allowNull: false },
      page_hash: { type: DataTypes.CHAR(16), allowNull: false },
      query: { type: DataTypes.STRING(500), allowNull: false },
      query_hash: { type: DataTypes.CHAR(16), allowNull: false },
      clicks: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      impressions: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      ctr: { type: DataTypes.DECIMAL(6, 4), allowNull: false },
      position: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
      ...timestamps(),
    }, tableOptions);
    await qi.addIndex('gsc_daily_metrics', ['site_id', 'date', 'page_hash', 'query_hash'], { unique: true, name: 'gsc_daily_metrics_unique' });
    await qi.addIndex('gsc_daily_metrics', ['site_id', 'query_hash', 'date']);
    await qi.addIndex('gsc_daily_metrics', ['organization_id']);

    await qi.createTable('ai_visibility_prompts', {
      id: id(),
      organization_id: fk('organizations', 'CASCADE'),
      site_id: fk('sites', 'CASCADE'),
      question: { type: DataTypes.STRING(300), allowNull: false },
      language: { type: DataTypes.STRING(10), allowNull: false },
      source: { type: DataTypes.ENUM('ai', 'user'), allowNull: false },
      ...timestamps(),
    }, tableOptions);
    await qi.addIndex('ai_visibility_prompts', ['site_id']);
    await qi.addIndex('ai_visibility_prompts', ['organization_id']);

    await qi.createTable('ai_visibility_checks', {
      id: id(),
      organization_id: fk('organizations', 'CASCADE'),
      site_id: fk('sites', 'CASCADE'),
      prompt_id: fk('ai_visibility_prompts', 'CASCADE'),
      /** Aynı turdaki kontroller (trend grafiği için) */
      run_id: { type: DataTypes.CHAR(36), allowNull: false },
      provider: { type: DataTypes.STRING(40), allowNull: false },
      model: { type: DataTypes.STRING(100), allowNull: false },
      /** Cevap Google Search ile mi üretildi (yoksa modelin kendi bilgisi) */
      grounded: { type: DataTypes.BOOLEAN, allowNull: false },
      mentioned: { type: DataTypes.BOOLEAN, allowNull: false },
      /** Alan adı kaynaklarda geçti mi */
      cited: { type: DataTypes.BOOLEAN, allowNull: false },
      cited_urls: { type: DataTypes.JSON, allowNull: false },
      answer_excerpt: { type: DataTypes.TEXT, allowNull: false },
      checked_at: { type: DataTypes.DATE, allowNull: false },
      ...timestamps(),
    }, tableOptions);
    await qi.addIndex('ai_visibility_checks', ['site_id', 'checked_at']);
    await qi.addIndex('ai_visibility_checks', ['prompt_id', 'checked_at']);
    await qi.addIndex('ai_visibility_checks', ['organization_id']);

    await qi.addColumn('sites', 'visibility_status', { type: DataTypes.ENUM('idle', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'idle' });
    await qi.addColumn('sites', 'visibility_error', { type: DataTypes.STRING(40), allowNull: true });
    await qi.addColumn('sites', 'visibility_started_at', { type: DataTypes.DATE, allowNull: true });
    await qi.addColumn('sites', 'visibility_checked_at', { type: DataTypes.DATE, allowNull: true });
  },
  async down({ context: qi }) {
    for (const col of ['visibility_checked_at', 'visibility_started_at', 'visibility_error', 'visibility_status']) await qi.removeColumn('sites', col);
    await qi.dropTable('ai_visibility_checks');
    await qi.dropTable('ai_visibility_prompts');
    await qi.dropTable('gsc_daily_metrics');
    await qi.dropTable('gsc_connections');
  },
};
