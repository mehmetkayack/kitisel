import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

/**
 * Satış masası (admin): müşteri adayları, aday geçmişi ve Instagram gönderi planı. Kiracıya bağlı değil
 * (Kitisel'in kendi satışı). Mesajlar sistemden gönderilmez; admin kopyalayıp elle gönderir.
 * Adaylar kalıcı silinir (geçmiş cascade): aynı alan adı yeniden eklenebilsin.
 */
export const migration: Migration = {
  name: '2026_10_27_0017_sales_desk',
  async up({ context: qi }) {
    await qi.createTable(
      'sales_leads',
      {
        id: id(),
        /** `www.` ve protokol olmadan, küçük harf */
        domain: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        name: { type: DataTypes.STRING(255), allowNull: false },
        sector: { type: DataTypes.ENUM('dental', 'beauty', 'lawyer', 'ecommerce', 'other'), allowNull: false, defaultValue: 'other' },
        city: { type: DataTypes.STRING(120), allowNull: true },
        website: { type: DataTypes.STRING(500), allowNull: true },
        email: { type: DataTypes.STRING(255), allowNull: true },
        phone: { type: DataTypes.STRING(60), allowNull: true },
        instagram: { type: DataTypes.STRING(255), allowNull: true },
        channel: { type: DataTypes.ENUM('email', 'instagram_dm', 'in_person', 'phone', 'linkedin'), allowNull: false, defaultValue: 'email' },
        status: {
          type: DataTypes.ENUM('new', 'contacted', 'replied', 'meeting', 'trial', 'customer', 'not_interested'),
          allowNull: false,
          defaultValue: 'new',
        },
        finding: { type: DataTypes.TEXT, allowNull: true },
        message: { type: DataTypes.TEXT, allowNull: true },
        follow_up_message: { type: DataTypes.TEXT, allowNull: true },
        note: { type: DataTypes.TEXT, allowNull: true },
        source: { type: DataTypes.ENUM('manual', 'import', 'agent'), allowNull: false, defaultValue: 'manual' },
        do_not_contact: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        contacted_at: { type: DataTypes.DATE, allowNull: true },
        last_status_at: { type: DataTypes.DATE, allowNull: true },
        next_follow_up_at: { type: DataTypes.DATE, allowNull: true },
        /** Gönderilen takip mesajı sayısı (ikinci takipten sonra hatırlatma durur) */
        follow_ups_sent: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        linked_user_id: fk('users', 'SET NULL', true),
        added_at: { type: DataTypes.DATE, allowNull: false },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('sales_leads', ['status']);
    await qi.addIndex('sales_leads', ['sector']);
    await qi.addIndex('sales_leads', ['next_follow_up_at']);
    await qi.addIndex('sales_leads', ['added_at']);

    await qi.createTable(
      'sales_lead_events',
      {
        id: id(),
        lead_id: fk('sales_leads', 'CASCADE'),
        type: {
          type: DataTypes.ENUM('status_change', 'note', 'message_copied', 'follow_up_sent', 'created', 'imported', 'linked'),
          allowNull: false,
        },
        from_status: { type: DataTypes.STRING(20), allowNull: true },
        to_status: { type: DataTypes.STRING(20), allowNull: true },
        text: { type: DataTypes.TEXT, allowNull: true },
        admin_user_id: fk('users', 'SET NULL', true),
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('sales_lead_events', ['lead_id', 'created_at']);

    await qi.createTable(
      'sales_social_posts',
      {
        id: id(),
        slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
        date: { type: DataTypes.DATEONLY, allowNull: false },
        time: { type: DataTypes.STRING(5), allowNull: true },
        format: { type: DataTypes.STRING(60), allowNull: true },
        pillar: { type: DataTypes.ENUM('intro', 'education', 'kit_found', 'sector', 'analysis_cta'), allowNull: false, defaultValue: 'intro' },
        title: { type: DataTypes.STRING(255), allowNull: false },
        visual: { type: DataTypes.TEXT, allowNull: true },
        caption: { type: DataTypes.TEXT, allowNull: true },
        hashtags: { type: DataTypes.STRING(500), allowNull: true },
        status: { type: DataTypes.ENUM('draft', 'approved', 'scheduled', 'published'), allowNull: false, defaultValue: 'draft' },
        source: { type: DataTypes.ENUM('manual', 'import', 'agent'), allowNull: false, defaultValue: 'manual' },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('sales_social_posts', ['date']);
  },
  async down({ context: qi }) {
    await qi.dropTable('sales_social_posts');
    await qi.dropTable('sales_lead_events');
    await qi.dropTable('sales_leads');
  },
};
