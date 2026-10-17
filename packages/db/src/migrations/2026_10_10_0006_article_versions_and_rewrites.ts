import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

/** Editör (Bölüm 7.6): sürüm geçmişi ve seçilen bölümü yapay zekâya yeniden yazdırma istekleri. */
export const migration: Migration = {
  name: '2026_10_10_0006_article_versions_and_rewrites',
  async up({ context: qi }) {
    await qi.createTable(
      'article_versions',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        article_id: fk('articles', 'CASCADE'),
        version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        // ai: üretim/yeniden üretim, user: editörde kaydetme, restore: eski sürüme dönüş
        source: { type: DataTypes.ENUM('ai', 'user', 'restore'), allowNull: false },
        user_id: fk('users', 'SET NULL', true),
        title: { type: DataTypes.STRING(255), allowNull: false },
        slug: { type: DataTypes.STRING(200), allowNull: false },
        meta_title: { type: DataTypes.STRING(255), allowNull: false },
        meta_description: { type: DataTypes.STRING(400), allowNull: false },
        html: { type: DataTypes.TEXT('medium'), allowNull: false },
        faq: { type: DataTypes.JSON, allowNull: false },
        seo_score: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
        word_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('article_versions', ['article_id', 'version'], { unique: true });
    await qi.addIndex('article_versions', ['organization_id']);

    await qi.createTable(
      'article_rewrites',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        article_id: fk('articles', 'CASCADE'),
        user_id: fk('users', 'SET NULL', true),
        status: { type: DataTypes.ENUM('pending', 'done', 'failed'), allowNull: false, defaultValue: 'pending' },
        instruction: { type: DataTypes.STRING(40), allowNull: false },
        custom_instruction: { type: DataTypes.STRING(500), allowNull: true },
        input_html: { type: DataTypes.TEXT('medium'), allowNull: false },
        output_html: { type: DataTypes.TEXT('medium'), allowNull: true },
        error: { type: DataTypes.STRING(40), allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('article_rewrites', ['organization_id', 'created_at']);

    // Mevcut makalelerin şimdiki hali ilk sürüm kaydı olur.
    await qi.sequelize.query(`
      INSERT INTO article_versions
        (id, organization_id, article_id, version, source, user_id, title, slug, meta_title, meta_description, html, faq, seo_score, word_count, created_at, updated_at)
      SELECT UUID(), organization_id, id, version, 'ai', NULL, title, slug, meta_title, meta_description, html, faq, seo_score, word_count, updated_at, updated_at
      FROM articles
    `);
  },
  async down({ context: qi }) {
    await qi.dropTable('article_rewrites');
    await qi.dropTable('article_versions');
  },
};
