import { DataTypes } from 'sequelize';
import type { Migration } from './types';

/**
 * Sitenin mevcut yazıları (CMS'ten çekilen) ve kapakta sitenin kendi görselleri:
 * - `existing_pages`: kaynak (tarama / CMS), CMS kimliği, görsel, tarihler, SEO sorunları
 * - `article_images.source`: `site` (sitedeki bir sayfanın görselinden)
 * - `sites`: yazı eşitleme durumu
 */
export const migration: Migration = {
  name: '2026_10_10_0009_cms_posts_and_site_covers',
  async up({ context: qi }) {
    await qi.addColumn('existing_pages', 'source', { type: DataTypes.ENUM('crawl', 'cms'), allowNull: false, defaultValue: 'crawl' });
    await qi.addColumn('existing_pages', 'remote_id', { type: DataTypes.STRING(64), allowNull: true });
    await qi.addColumn('existing_pages', 'image_url', { type: DataTypes.STRING(2048), allowNull: true });
    await qi.addColumn('existing_pages', 'published_at', { type: DataTypes.DATE, allowNull: true });
    await qi.addColumn('existing_pages', 'modified_at', { type: DataTypes.DATE, allowNull: true });
    await qi.addColumn('existing_pages', 'seo_score', { type: DataTypes.TINYINT.UNSIGNED, allowNull: true });
    await qi.addColumn('existing_pages', 'issues', { type: DataTypes.JSON, allowNull: true });
    await qi.addColumn('existing_pages', 'metrics', { type: DataTypes.JSON, allowNull: true });
    await qi.addIndex('existing_pages', ['site_id', 'source']);

    await qi.changeColumn('article_images', 'source', { type: DataTypes.ENUM('ai', 'generated', 'site'), allowNull: false });

    await qi.addColumn('sites', 'posts_sync_status', { type: DataTypes.ENUM('idle', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'idle' });
    await qi.addColumn('sites', 'posts_sync_error', { type: DataTypes.STRING(40), allowNull: true });
    await qi.addColumn('sites', 'posts_sync_started_at', { type: DataTypes.DATE, allowNull: true });
    await qi.addColumn('sites', 'posts_synced_at', { type: DataTypes.DATE, allowNull: true });
  },
  async down({ context: qi }) {
    for (const col of ['posts_synced_at', 'posts_sync_started_at', 'posts_sync_error', 'posts_sync_status']) await qi.removeColumn('sites', col);
    // Görsel silinmez; eski şemada "site" yok, en yakın anlam "üretilmiş kapak".
    await qi.sequelize.query("UPDATE article_images SET source = 'generated' WHERE source = 'site'");
    await qi.changeColumn('article_images', 'source', { type: DataTypes.ENUM('ai', 'generated'), allowNull: false });
    await qi.removeIndex('existing_pages', ['site_id', 'source']);
    for (const col of ['metrics', 'issues', 'seo_score', 'modified_at', 'published_at', 'image_url', 'remote_id', 'source']) await qi.removeColumn('existing_pages', col);
  },
};
