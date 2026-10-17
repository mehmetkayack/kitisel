import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';

export type ThemePreference = 'system' | 'light' | 'dark';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare passwordHash: string | null;
  declare name: string;
  declare locale: CreationOptional<string>;
  declare theme: CreationOptional<ThemePreference>;
  declare emailVerifiedAt: Date | null;
  declare googleId: string | null;
  declare isSuperadmin: CreationOptional<boolean>;
  declare lastLoginAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;

  static initModel(sequelize: Sequelize): void {
    User.init(
      {
        id: idColumn,
        email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        passwordHash: { type: DataTypes.STRING(255), allowNull: true },
        name: { type: DataTypes.STRING(120), allowNull: false },
        locale: { type: DataTypes.STRING(5), allowNull: false, defaultValue: 'en' },
        theme: {
          type: DataTypes.ENUM('system', 'light', 'dark'),
          allowNull: false,
          defaultValue: 'system',
        },
        emailVerifiedAt: { type: DataTypes.DATE, allowNull: true },
        googleId: { type: DataTypes.STRING(64), allowNull: true, unique: true },
        isSuperadmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        lastLoginAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
        deletedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'users', underscored: true, paranoid: true },
    );
  }
}
