import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';

export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<string>;
  declare userId: string | null;
  declare organizationId: string | null;
  declare action: string;
  declare targetType: string | null;
  declare targetId: string | null;
  declare metadata: Record<string, unknown> | null;
  declare ip: string | null;
  declare userAgent: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    AuditLog.init(
      {
        id: idColumn,
        userId: { type: DataTypes.CHAR(36), allowNull: true },
        organizationId: { type: DataTypes.CHAR(36), allowNull: true },
        action: { type: DataTypes.STRING(100), allowNull: false },
        targetType: { type: DataTypes.STRING(60), allowNull: true },
        targetId: { type: DataTypes.CHAR(36), allowNull: true },
        metadata: { type: DataTypes.JSON, allowNull: true },
        ip: { type: DataTypes.STRING(45), allowNull: true },
        userAgent: { type: DataTypes.STRING(512), allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'audit_logs', underscored: true },
    );
  }
}
