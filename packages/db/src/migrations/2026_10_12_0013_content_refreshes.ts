import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

/**
 * İçerik yenileme (Bölüm 7.9): mevcut yazı için yapay zekâ güncelleme önerisi, onayla CMS'te uygulama ve
 * geri alma (orijinal ham içerik saklanır). `content_items.duplicate_of_url`: konu sitedeki bir yazıyla
 * aynı çıktığı için yazılmadı (yerine o yazının güncellenmesi önerilir).
 */
export const migration: Migration = {
  name: '2026_10_12_0013_content_refreshes',
  async up({ context: qi }) {
    await qi.addColumn('content_items', 'duplicate_of_url', { type: DataTypes.STRING(2048), allowNull: true });
    await qi.createTable(
      'content_refreshes',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        site_id: fk('sites', 'CASCADE'),
        existing_page_id: fk('existing_pages', 'CASCADE'),
        remote_id: { type: DataTypes.STRING(64), allowNull: false },
        status: { type: DataTypes.ENUM('generating', 'ready', 'applied', 'reverted', 'dismissed', 'failed'), allowNull: false, defaultValue: 'generating' },
        error: { type: DataTypes.STRING(40), allowNull: true },
        /** Yazının öneri anındaki hâli: başlık, gösterilen HTML, CMS'teki ham içerik (geri alma), meta açıklama */
        original: { type: DataTypes.JSON, allowNull: true },
        /** Öneri: özet, değişiklik listesi, yeni başlık/meta, yeni HTML, SSS */
        suggestion: { type: DataTypes.JSON, allowNull: true },
        score_before: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
        score_after: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
        requested_by: fk('users', 'SET NULL', true),
        started_at: { type: DataTypes.DATE, allowNull: true },
        applied_at: { type: DataTypes.DATE, allowNull: true },
        reverted_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('content_refreshes', ['site_id', 'existing_page_id']);
    await qi.addIndex('content_refreshes', ['organization_id', 'applied_at']);
  },
  async down({ context: qi }) {
    await qi.dropTable('content_refreshes');
    await qi.removeColumn('content_items', 'duplicate_of_url');
  },
};
