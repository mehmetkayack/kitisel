import { DataTypes } from 'sequelize';
import type { Migration } from './types';

/**
 * Takılı iş tespiti için işin kendi başlangıç zamanı. Önceden sitenin genel `updated_at`'i kullanılıyordu:
 * sitedeki başka bir güncelleme (ör. yeniden analiz) yarıda kalmış konu işini yeniden "taze" gösteriyordu.
 */
export const migration: Migration = {
  name: '2026_10_10_0008_job_started_at',
  async up({ context: qi }) {
    await qi.addColumn('sites', 'analysis_started_at', { type: DataTypes.DATE, allowNull: true });
    await qi.addColumn('sites', 'topics_started_at', { type: DataTypes.DATE, allowNull: true });
  },
  async down({ context: qi }) {
    await qi.removeColumn('sites', 'topics_started_at');
    await qi.removeColumn('sites', 'analysis_started_at');
  },
};
