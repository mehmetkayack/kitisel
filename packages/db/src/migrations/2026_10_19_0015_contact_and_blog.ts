import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

/**
 * Halka açık site: iletişim formu mesajları ve blog yazıları (ikisi de admin panelinden yönetilir).
 * Kiracıya bağlı değildir (Kitisel'in kendi sitesi). Kapak görseli yazının satırında; listeler bu
 * sütunu okumaz.
 */
export const migration: Migration = {
  name: '2026_10_19_0015_contact_and_blog',
  async up({ context: qi }) {
    await qi.createTable(
      'contact_messages',
      {
        id: id(),
        name: { type: DataTypes.STRING(120), allowNull: false },
        email: { type: DataTypes.STRING(255), allowNull: false },
        phone: { type: DataTypes.STRING(30), allowNull: true },
        company: { type: DataTypes.STRING(160), allowNull: true },
        message: { type: DataTypes.TEXT, allowNull: false },
        locale: { type: DataTypes.STRING(5), allowNull: false },
        status: { type: DataTypes.ENUM('new', 'read', 'archived'), allowNull: false, defaultValue: 'new' },
        /** reCAPTCHA v3 puanı; doğrulama kapalıysa boş */
        recaptcha_score: { type: DataTypes.DECIMAL(3, 2), allowNull: true },
        /** IP ham saklanmaz: anahtarlı hash (kötüye kullanım incelemesi için) */
        ip_hash: { type: DataTypes.CHAR(64), allowNull: true },
        user_agent: { type: DataTypes.STRING(512), allowNull: true },
        read_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('contact_messages', ['status', 'id']);

    await qi.createTable(
      'blog_posts',
      {
        id: id(),
        locale: { type: DataTypes.STRING(5), allowNull: false },
        slug: { type: DataTypes.STRING(120), allowNull: false },
        title: { type: DataTypes.STRING(200), allowNull: false },
        excerpt: { type: DataTypes.STRING(320), allowNull: false },
        body_html: { type: DataTypes.TEXT('medium'), allowNull: false },
        meta_title: { type: DataTypes.STRING(80), allowNull: true },
        meta_description: { type: DataTypes.STRING(200), allowNull: true },
        status: { type: DataTypes.ENUM('draft', 'published'), allowNull: false, defaultValue: 'draft' },
        published_at: { type: DataTypes.DATE, allowNull: true },
        reading_minutes: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 1 },
        cover_data: { type: DataTypes.BLOB('medium'), allowNull: true },
        cover_alt: { type: DataTypes.STRING(250), allowNull: true },
        cover_width: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
        cover_height: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
        author_id: fk('users', 'SET NULL', true),
        ...timestamps(true),
      },
      tableOptions,
    );
    // Silinen yazının adresi yeniden kullanılabilsin diye benzersizlik uygulamada (silinmemişler arasında)
    await qi.addIndex('blog_posts', ['locale', 'slug']);
    await qi.addIndex('blog_posts', ['locale', 'status', 'published_at']);
  },
  async down({ context: qi }) {
    await qi.dropTable('blog_posts');
    await qi.dropTable('contact_messages');
  },
};
