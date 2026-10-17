import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';

export class RefreshToken extends Model<
  InferAttributes<RefreshToken>,
  InferCreationAttributes<RefreshToken>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare tokenHash: string;
  declare familyId: string;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare replacedById: string | null;
  declare userAgent: string | null;
  declare ip: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    RefreshToken.init(
      {
        id: idColumn,
        userId: { type: DataTypes.CHAR(36), allowNull: false },
        tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
        familyId: { type: DataTypes.CHAR(36), allowNull: false },
        expiresAt: { type: DataTypes.DATE, allowNull: false },
        revokedAt: { type: DataTypes.DATE, allowNull: true },
        replacedById: { type: DataTypes.CHAR(36), allowNull: true },
        userAgent: { type: DataTypes.STRING(512), allowNull: true },
        ip: { type: DataTypes.STRING(45), allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'refresh_tokens', underscored: true },
    );
  }
}

/** E-posta doğrulama ve şifre sıfırlama token'ları için ortak yapı. */
abstract class OneTimeToken<T extends OneTimeToken<T>> extends Model<
  InferAttributes<T>,
  InferCreationAttributes<T>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

const oneTimeTokenAttributes = {
  id: idColumn,
  userId: { type: DataTypes.CHAR(36), allowNull: false },
  tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  usedAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
};

export class EmailVerification extends OneTimeToken<EmailVerification> {
  static initModel(sequelize: Sequelize): void {
    EmailVerification.init(oneTimeTokenAttributes, {
      sequelize,
      tableName: 'email_verifications',
      underscored: true,
    });
  }
}

export class PasswordReset extends OneTimeToken<PasswordReset> {
  static initModel(sequelize: Sequelize): void {
    PasswordReset.init(oneTimeTokenAttributes, {
      sequelize,
      tableName: 'password_resets',
      underscored: true,
    });
  }
}
