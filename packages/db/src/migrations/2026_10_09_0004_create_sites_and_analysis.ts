import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

/** Faz 1-2: siteler, marka profili, analiz, mevcut sayfalar, anahtar kelimeler, içerik planı, yapay zekâ kullanımı. */
export const migration: Migration = {
  name: '2026_10_09_0004_create_sites_and_analysis',
  async up({ context: qi }) {
    await qi.createTable(
      'sites',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        url: { type: DataTypes.STRING(2048), allowNull: false },
        domain: { type: DataTypes.STRING(255), allowNull: false },
        name: { type: DataTypes.STRING(200), allowNull: false },
        country: { type: DataTypes.CHAR(2), allowNull: true },
        content_language: { type: DataTypes.STRING(10), allowNull: true },
        extra_languages: { type: DataTypes.JSON, allowNull: true },
        cms_type: {
          type: DataTypes.ENUM('none', 'wordpress', 'shopify', 'webflow', 'ghost', 'wix', 'webhook', 'download'),
          allowNull: false,
          defaultValue: 'none',
        },
        connection_status: {
          type: DataTypes.ENUM('not_connected', 'connected', 'error'),
          allowNull: false,
          defaultValue: 'not_connected',
        },
        publish_mode: { type: DataTypes.ENUM('approval', 'auto'), allowNull: false, defaultValue: 'approval' },
        posts_per_week: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 2 },
        publish_days: { type: DataTypes.JSON, allowNull: true },
        publish_time: { type: DataTypes.CHAR(5), allowNull: false, defaultValue: '10:00' },
        timezone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'UTC' },
        onboarding_step: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'brand' },
        onboarding_completed_at: { type: DataTypes.DATE, allowNull: true },
        analysis_status: {
          type: DataTypes.ENUM('pending', 'running', 'done', 'failed'),
          allowNull: false,
          defaultValue: 'pending',
        },
        analysis_phase: { type: DataTypes.STRING(20), allowNull: true },
        analysis_error: { type: DataTypes.STRING(40), allowNull: true },
        analyzed_at: { type: DataTypes.DATE, allowNull: true },
        topics_status: {
          type: DataTypes.ENUM('idle', 'running', 'done', 'failed'),
          allowNull: false,
          defaultValue: 'idle',
        },
        topics_error: { type: DataTypes.STRING(40), allowNull: true },
        ...timestamps(true),
      },
      tableOptions,
    );
    await qi.addIndex('sites', ['organization_id', 'domain']);

    await qi.createTable(
      'brand_profiles',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        site_id: fk('sites', 'CASCADE'),
        brand_name: { type: DataTypes.STRING(120), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: false },
        industry: { type: DataTypes.STRING(120), allowNull: true },
        products_services: { type: DataTypes.JSON, allowNull: false },
        target_audience: { type: DataTypes.TEXT, allowNull: true },
        tone: {
          type: DataTypes.ENUM('professional', 'friendly', 'expert', 'playful'),
          allowNull: false,
          defaultValue: 'professional',
        },
        tone_guideline: { type: DataTypes.TEXT, allowNull: true },
        banned_words: { type: DataTypes.JSON, allowNull: false },
        sample_texts: { type: DataTypes.JSON, allowNull: false },
        competitors: { type: DataTypes.JSON, allowNull: false },
        cta_text: { type: DataTypes.STRING(200), allowNull: true },
        cta_url: { type: DataTypes.STRING(2048), allowNull: true },
        brand_colors: { type: DataTypes.JSON, allowNull: true },
        source: { type: DataTypes.ENUM('ai', 'heuristic', 'user'), allowNull: false },
        approved_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('brand_profiles', ['site_id'], { unique: true });
    await qi.addIndex('brand_profiles', ['organization_id']);

    await qi.createTable(
      'site_audits',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        site_id: fk('sites', 'CASCADE'),
        score: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
        checks: { type: DataTypes.JSON, allowNull: false },
        pages_crawled: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('site_audits', ['site_id', 'created_at']);
    await qi.addIndex('site_audits', ['organization_id']);

    await qi.createTable(
      'existing_pages',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        site_id: fk('sites', 'CASCADE'),
        url: { type: DataTypes.STRING(2048), allowNull: false },
        url_hash: { type: DataTypes.CHAR(64), allowNull: false },
        title: { type: DataTypes.STRING(500), allowNull: true },
        h1: { type: DataTypes.STRING(500), allowNull: true },
        description: { type: DataTypes.STRING(1000), allowNull: true },
        status_code: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
        word_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        embedding: { type: DataTypes.BLOB, allowNull: true },
        last_crawled_at: { type: DataTypes.DATE, allowNull: false },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('existing_pages', ['site_id', 'url_hash'], { unique: true });
    await qi.addIndex('existing_pages', ['organization_id']);

    await qi.createTable(
      'keywords',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        site_id: fk('sites', 'CASCADE'),
        term: { type: DataTypes.STRING(200), allowNull: false },
        language: { type: DataTypes.STRING(10), allowNull: false },
        country: { type: DataTypes.CHAR(2), allowNull: true },
        search_volume: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        difficulty: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
        cpc: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
        currency: { type: DataTypes.CHAR(3), allowNull: true },
        intent: {
          type: DataTypes.ENUM('informational', 'commercial', 'transactional', 'navigational'),
          allowNull: true,
        },
        source: { type: DataTypes.ENUM('dataforseo', 'estimated', 'user'), allowNull: false },
        cluster_id: { type: DataTypes.CHAR(36), allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('keywords', ['site_id', 'language', 'term'], { unique: true });
    await qi.addIndex('keywords', ['organization_id']);

    await qi.createTable(
      'content_items',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        site_id: fk('sites', 'CASCADE'),
        keyword_id: fk('keywords', 'SET NULL', true),
        title: { type: DataTypes.STRING(255), allowNull: false },
        planned_at: { type: DataTypes.DATE, allowNull: true },
        status: {
          type: DataTypes.ENUM('planned', 'generating', 'review', 'approved', 'scheduled', 'published', 'failed', 'rejected'),
          allowNull: false,
          defaultValue: 'planned',
        },
        type: { type: DataTypes.ENUM('new', 'refresh'), allowNull: false, defaultValue: 'new' },
        error_message: { type: DataTypes.STRING(500), allowNull: true },
        progress_step: { type: DataTypes.STRING(40), allowNull: true },
        position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('content_items', ['organization_id', 'status']);
    await qi.addIndex('content_items', ['site_id', 'planned_at']);

    await qi.createTable(
      'ai_usage_logs',
      {
        id: id(),
        organization_id: fk('organizations', 'SET NULL', true),
        operation: { type: DataTypes.STRING(80), allowNull: false },
        model: { type: DataTypes.STRING(80), allowNull: false },
        input_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        output_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        cost_usd: { type: DataTypes.DECIMAL(12, 6), allowNull: false },
        latency_ms: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        success: { type: DataTypes.BOOLEAN, allowNull: false },
        error_code: { type: DataTypes.STRING(40), allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('ai_usage_logs', ['organization_id', 'created_at']);
    await qi.addIndex('ai_usage_logs', ['created_at']);
  },
  async down({ context: qi }) {
    for (const table of ['ai_usage_logs', 'content_items', 'keywords', 'existing_pages', 'site_audits', 'brand_profiles', 'sites']) {
      await qi.dropTable(table);
    }
  },
};
