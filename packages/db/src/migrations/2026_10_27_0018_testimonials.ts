import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { id, tableOptions, timestamps } from './types';

/**
 * Müşteri yorumları (ana sayfada "Müşterilerimiz ne diyor?"). Admin bir dilde yazar; diğer arayüz dillerine
 * worker yapay zekâyla çevirir. Çeviriler satırda (`translations`, dil → metin + kaynak `ai`/`user`).
 */
export const migration: Migration = {
  name: '2026_10_27_0018_testimonials',
  async up({ context: qi }) {
    await qi.createTable(
      'testimonials',
      {
        id: id(),
        author_name: { type: DataTypes.STRING(120), allowNull: false },
        author_title: { type: DataTypes.STRING(160), allowNull: true },
        website: { type: DataTypes.STRING(255), allowNull: true },
        rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
        /** Yorumun yazıldığı dil (kaynak metin) */
        locale: { type: DataTypes.STRING(5), allowNull: false },
        quote: { type: DataTypes.TEXT, allowNull: false },
        status: { type: DataTypes.ENUM('draft', 'published'), allowNull: false, defaultValue: 'draft' },
        translations: { type: DataTypes.JSON, allowNull: true },
        translation_status: { type: DataTypes.ENUM('pending', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'pending' },
        translation_error: { type: DataTypes.STRING(40), allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('testimonials', ['status', 'id']);
  },
  async down({ context: qi }) {
    await qi.dropTable('testimonials');
  },
};
