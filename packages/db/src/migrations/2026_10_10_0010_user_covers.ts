import { DataTypes } from 'sequelize';
import type { Migration } from './types';

/** Kullanıcının yüklediği kapak (`article_images.source = user`). */
export const migration: Migration = {
  name: '2026_10_10_0010_user_covers',
  async up({ context: qi }) {
    await qi.changeColumn('article_images', 'source', { type: DataTypes.ENUM('ai', 'generated', 'site', 'user'), allowNull: false });
  },
  async down({ context: qi }) {
    // Görsel silinmez; eski şemada "user" yok, en yakın anlam "sitenin görseli".
    await qi.sequelize.query("UPDATE article_images SET source = 'site' WHERE source = 'user'");
    await qi.changeColumn('article_images', 'source', { type: DataTypes.ENUM('ai', 'generated', 'site'), allowNull: false });
  },
};
