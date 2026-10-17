import { DataTypes } from 'sequelize';
import type { Migration } from './types';

/**
 * Embedding tabanlı konu tekrarı (Bölüm 5: Float32 BLOB, benzerlik uygulama katmanında) ve yeni CMS
 * bağlantıları (Ghost, Shopify, Webflow, Wix) için `site_credentials.kind` genişletilir.
 */
export const migration: Migration = {
  name: '2026_10_10_0007_embeddings_and_integrations',
  async up({ context: qi }) {
    // Sayfa başlığı değişince yeniden hesaplamak için vektörün hangi metinden üretildiği (kısa hash)
    await qi.addColumn('existing_pages', 'embedding_hash', { type: DataTypes.CHAR(16), allowNull: true });
    await qi.addColumn('content_items', 'embedding', { type: DataTypes.BLOB, allowNull: true });
    await qi.changeColumn('site_credentials', 'kind', { type: DataTypes.STRING(20), allowNull: false });
  },
  async down({ context: qi }) {
    await qi.changeColumn('site_credentials', 'kind', { type: DataTypes.ENUM('wordpress', 'webhook'), allowNull: false });
    await qi.removeColumn('content_items', 'embedding');
    await qi.removeColumn('existing_pages', 'embedding_hash');
  },
};
