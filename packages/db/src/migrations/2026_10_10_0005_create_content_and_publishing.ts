import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

/** Ücretsiz analiz, makaleler, görseller, site bağlantıları (şifreli) ve yayın kayıtları. */
export const migration: Migration = {
  name: '2026_10_10_0005_create_content_and_publishing',
  async up({ context: qi }) {
    await qi.createTable(
      'free_analyses',
      {
        id: id(),
        share_token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        url: { type: DataTypes.STRING(2048), allowNull: false },
        domain: { type: DataTypes.STRING(255), allowNull: false },
        locale: { type: DataTypes.STRING(5), allowNull: false },
        status: { type: DataTypes.ENUM('pending', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'pending' },
        phase: { type: DataTypes.STRING(20), allowNull: true },
        error: { type: DataTypes.STRING(40), allowNull: true },
        result: { type: DataTypes.JSON, allowNull: true },
        email: { type: DataTypes.STRING(255), allowNull: true },
        marketing_consent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        email_sent_at: { type: DataTypes.DATE, allowNull: true },
        ip_hash: { type: DataTypes.CHAR(64), allowNull: false },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('free_analyses', ['domain', 'created_at']);
    await qi.addIndex('free_analyses', ['ip_hash', 'created_at']);

    await qi.createTable(
      'articles',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        site_id: fk('sites', 'CASCADE'),
        content_item_id: fk('content_items', 'CASCADE'),
        language: { type: DataTypes.STRING(10), allowNull: false },
        title: { type: DataTypes.STRING(255), allowNull: false },
        slug: { type: DataTypes.STRING(200), allowNull: false },
        meta_title: { type: DataTypes.STRING(255), allowNull: false },
        meta_description: { type: DataTypes.STRING(400), allowNull: false },
        html: { type: DataTypes.TEXT('medium'), allowNull: false },
        outline: { type: DataTypes.JSON, allowNull: true },
        faq: { type: DataTypes.JSON, allowNull: false },
        schema_json: { type: DataTypes.JSON, allowNull: false },
        seo_score: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
        seo_checks: { type: DataTypes.JSON, allowNull: false },
        verification: { type: DataTypes.JSON, allowNull: false },
        sources: { type: DataTypes.JSON, allowNull: false },
        word_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('articles', ['content_item_id'], { unique: true });
    await qi.addIndex('articles', ['organization_id', 'created_at']);

    await qi.createTable(
      'article_images',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        article_id: fk('articles', 'CASCADE'),
        kind: { type: DataTypes.ENUM('cover', 'infographic'), allowNull: false },
        source: { type: DataTypes.ENUM('ai', 'generated'), allowNull: false },
        prompt: { type: DataTypes.TEXT, allowNull: true },
        mime_type: { type: DataTypes.STRING(40), allowNull: false },
        data: { type: DataTypes.BLOB('medium'), allowNull: false },
        width: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        height: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        file_name: { type: DataTypes.STRING(200), allowNull: false },
        alt_text: { type: DataTypes.STRING(300), allowNull: false },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('article_images', ['article_id', 'kind']);

    await qi.createTable(
      'site_credentials',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        site_id: fk('sites', 'CASCADE'),
        kind: { type: DataTypes.ENUM('wordpress', 'webhook'), allowNull: false },
        // AES-256-GCM: şifreli JSON + IV + doğrulama etiketi + anahtar sürümü (rotasyon için)
        ciphertext: { type: DataTypes.BLOB, allowNull: false },
        iv: { type: DataTypes.BLOB('tiny'), allowNull: false },
        auth_tag: { type: DataTypes.BLOB('tiny'), allowNull: false },
        key_version: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
        // Tarayıcıya gösterilebilecek şifresiz özet (ör. site adresi, kullanıcı adı)
        display: { type: DataTypes.JSON, allowNull: false },
        last_verified_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('site_credentials', ['site_id'], { unique: true });
    await qi.addIndex('site_credentials', ['organization_id']);

    await qi.createTable(
      'publications',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        site_id: fk('sites', 'CASCADE'),
        article_id: fk('articles', 'CASCADE'),
        provider: { type: DataTypes.STRING(20), allowNull: false },
        status: { type: DataTypes.ENUM('pending', 'published', 'failed'), allowNull: false, defaultValue: 'pending' },
        remote_id: { type: DataTypes.STRING(100), allowNull: true },
        remote_url: { type: DataTypes.STRING(2048), allowNull: true },
        error: { type: DataTypes.STRING(60), allowNull: true },
        attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        published_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('publications', ['article_id']);
    await qi.addIndex('publications', ['organization_id', 'status']);

    // Reddetme sebebi sonraki yazılarda dikkate alınır (Bölüm 7.13)
    await qi.addColumn('content_items', 'reject_reason', { type: DataTypes.STRING(40), allowNull: true });
  },
  async down({ context: qi }) {
    await qi.removeColumn('content_items', 'reject_reason');
    for (const table of ['publications', 'site_credentials', 'article_images', 'articles', 'free_analyses']) {
      await qi.dropTable(table);
    }
  },
};
