import { DataTypes } from 'sequelize';
import type { Migration } from './types';

const CMS = ['none', 'wordpress', 'shopify', 'webflow', 'ghost', 'wix', 'webhook', 'download'] as const;

/**
 * Kitisel'in kendi blogu yazım hattına bağlanır: yeni bağlantı türü `kitisel` (sadece Kitisel'in sitesi,
 * superadmin kurar). Hattın yazdığı yazı ve çevirileri aynı gruptadır (`translation_group_id` = kaynak yazı).
 */
export const migration: Migration = {
  name: '2026_11_02_0019_internal_blog',
  async up({ context: qi }) {
    await qi.changeColumn('sites', 'cms_type', { type: DataTypes.ENUM(...CMS, 'kitisel'), allowNull: false, defaultValue: 'none' });
    await qi.addColumn('blog_posts', 'translation_group_id', { type: DataTypes.CHAR(36), allowNull: true });
    await qi.addColumn('blog_posts', 'origin', { type: DataTypes.ENUM('admin', 'pipeline'), allowNull: false, defaultValue: 'admin' });
    await qi.addIndex('blog_posts', ['translation_group_id', 'locale'], { name: 'blog_posts_group_locale' });
  },
  async down({ context: qi }) {
    await qi.removeIndex('blog_posts', 'blog_posts_group_locale');
    await qi.removeColumn('blog_posts', 'origin');
    await qi.removeColumn('blog_posts', 'translation_group_id');
    await qi.sequelize.query("UPDATE sites SET cms_type = 'none' WHERE cms_type = 'kitisel'");
    await qi.changeColumn('sites', 'cms_type', { type: DataTypes.ENUM(...CMS), allowNull: false, defaultValue: 'none' });
  },
};
