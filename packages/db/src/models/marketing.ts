import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';

export type ContactMessageStatus = 'new' | 'read' | 'archived';
export type BlogPostStatus = 'draft' | 'published';

/** İletişim formu mesajı (halka açık site; kiracıya bağlı değil). */
export class ContactMessage extends Model<InferAttributes<ContactMessage>, InferCreationAttributes<ContactMessage>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare email: string;
  declare phone: string | null;
  declare company: string | null;
  declare message: string;
  declare locale: string;
  declare status: CreationOptional<ContactMessageStatus>;
  declare recaptchaScore: number | null;
  declare ipHash: string | null;
  declare userAgent: string | null;
  declare readAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    ContactMessage.init(
      {
        id: idColumn,
        name: { type: DataTypes.STRING(120), allowNull: false },
        email: { type: DataTypes.STRING(255), allowNull: false },
        phone: { type: DataTypes.STRING(30), allowNull: true },
        company: { type: DataTypes.STRING(160), allowNull: true },
        message: { type: DataTypes.TEXT, allowNull: false },
        locale: { type: DataTypes.STRING(5), allowNull: false },
        status: { type: DataTypes.ENUM('new', 'read', 'archived'), allowNull: false, defaultValue: 'new' },
        recaptchaScore: {
          type: DataTypes.DECIMAL(3, 2),
          allowNull: true,
          // MySQL DECIMAL metin döner
          get(this: ContactMessage) {
            const v = this.getDataValue('recaptchaScore') as unknown;
            return v === null || v === undefined ? null : Number(v);
          },
        },
        ipHash: { type: DataTypes.CHAR(64), allowNull: true },
        userAgent: { type: DataTypes.STRING(512), allowNull: true },
        readAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'contact_messages', underscored: true },
    );
  }
}

/** Kitisel blog yazısı (admin panelinden yazılır). */
export class BlogPost extends Model<InferAttributes<BlogPost>, InferCreationAttributes<BlogPost>> {
  declare id: CreationOptional<string>;
  declare locale: string;
  declare slug: string;
  declare title: string;
  declare excerpt: string;
  declare bodyHtml: string;
  declare metaTitle: string | null;
  declare metaDescription: string | null;
  declare status: BlogPostStatus;
  declare publishedAt: Date | null;
  declare readingMinutes: number;
  declare coverData: CreationOptional<Buffer | null>;
  declare coverAlt: CreationOptional<string | null>;
  declare coverWidth: CreationOptional<number | null>;
  declare coverHeight: CreationOptional<number | null>;
  declare authorId: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;

  static initModel(sequelize: Sequelize): void {
    BlogPost.init(
      {
        id: idColumn,
        locale: { type: DataTypes.STRING(5), allowNull: false },
        slug: { type: DataTypes.STRING(120), allowNull: false },
        title: { type: DataTypes.STRING(200), allowNull: false },
        excerpt: { type: DataTypes.STRING(320), allowNull: false },
        bodyHtml: { type: DataTypes.TEXT('medium'), allowNull: false },
        metaTitle: { type: DataTypes.STRING(80), allowNull: true },
        metaDescription: { type: DataTypes.STRING(200), allowNull: true },
        status: { type: DataTypes.ENUM('draft', 'published'), allowNull: false, defaultValue: 'draft' },
        publishedAt: { type: DataTypes.DATE, allowNull: true },
        readingMinutes: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 1 },
        coverData: { type: DataTypes.BLOB('medium'), allowNull: true },
        coverAlt: { type: DataTypes.STRING(250), allowNull: true },
        coverWidth: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
        coverHeight: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
        authorId: { type: DataTypes.CHAR(36), allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
        deletedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'blog_posts', underscored: true, paranoid: true },
    );
  }
}

export type TestimonialStatus = 'draft' | 'published';
export type TestimonialTranslationStatus = 'pending' | 'running' | 'done' | 'failed';

/** Bir dildeki çeviri; `user` = admin elle düzeltti (yeniden çeviride ezilmez) */
export interface TestimonialTranslation {
  quote: string;
  authorTitle: string | null;
  source: 'ai' | 'user';
}

/** Müşteri yorumu (ana sayfa). Kaynak dildeki metin + diğer dillere çeviriler. */
export class Testimonial extends Model<InferAttributes<Testimonial>, InferCreationAttributes<Testimonial>> {
  declare id: CreationOptional<string>;
  declare authorName: string;
  declare authorTitle: string | null;
  declare website: string | null;
  declare rating: number | null;
  declare locale: string;
  declare quote: string;
  declare status: TestimonialStatus;
  declare translations: CreationOptional<Record<string, TestimonialTranslation> | null>;
  declare translationStatus: CreationOptional<TestimonialTranslationStatus>;
  declare translationError: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    Testimonial.init(
      {
        id: idColumn,
        authorName: { type: DataTypes.STRING(120), allowNull: false },
        authorTitle: { type: DataTypes.STRING(160), allowNull: true },
        website: { type: DataTypes.STRING(255), allowNull: true },
        rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
        locale: { type: DataTypes.STRING(5), allowNull: false },
        quote: { type: DataTypes.TEXT, allowNull: false },
        status: { type: DataTypes.ENUM('draft', 'published'), allowNull: false, defaultValue: 'draft' },
        translations: { type: DataTypes.JSON, allowNull: true },
        translationStatus: { type: DataTypes.ENUM('pending', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'pending' },
        translationError: { type: DataTypes.STRING(40), allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'testimonials', underscored: true },
    );
  }
}
