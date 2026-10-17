import type { QueryInterface } from 'sequelize';
import { DataTypes } from 'sequelize';

export interface MigrationParams {
  context: QueryInterface;
}

export interface Migration {
  name: string;
  up(params: MigrationParams): Promise<void>;
  down(params: MigrationParams): Promise<void>;
}

/** Her tablo için zorunlu ayarlar (5 dil ve emoji için utf8mb4). */
export const tableOptions = {
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  engine: 'InnoDB',
} as const;

export const id = () => ({ type: DataTypes.CHAR(36), primaryKey: true, allowNull: false });

export const fk = (table: string, onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT', allowNull = false) => ({
  type: DataTypes.CHAR(36),
  allowNull,
  references: { model: table, key: 'id' },
  onDelete,
  onUpdate: 'CASCADE',
});

/** created_at / updated_at (+ isteğe bağlı deleted_at) */
export const timestamps = (paranoid = false) => ({
  created_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false },
  ...(paranoid ? { deleted_at: { type: DataTypes.DATE, allowNull: true } } : {}),
});
