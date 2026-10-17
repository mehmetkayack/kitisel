import { DataTypes } from 'sequelize';
import type { Migration } from './types';

/**
 * Yeniden yazım sınırı: bir yazının baştan kaç kez yeniden üretildiği (ilk üretim sayılmaz). Yeniden yazım
 * aylık hak tüketmiyor; sınırsız olunca tek bir yazı için yapay zekâ maliyeti katlanıyordu.
 */
export const migration: Migration = {
  name: '2026_10_13_0014_regeneration_count',
  async up({ context: qi }) {
    await qi.addColumn('content_items', 'regeneration_count', { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 });
  },
  async down({ context: qi }) {
    await qi.removeColumn('content_items', 'regeneration_count');
  },
};
