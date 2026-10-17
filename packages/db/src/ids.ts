import { v7 as uuidv7 } from 'uuid';
import { DataTypes } from 'sequelize';

/** Sıralanabilir UUID v7. Dış dünyaya otomatik artan id gösterilmez. */
export function newId(): string {
  return uuidv7();
}

/** Model tanımlarında birincil anahtar kolonu. */
export const idColumn = {
  type: DataTypes.CHAR(36),
  primaryKey: true,
  allowNull: false,
  defaultValue: newId,
} as const;
