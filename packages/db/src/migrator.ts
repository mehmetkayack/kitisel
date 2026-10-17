import type { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { migrations } from './migrations';

export function createMigrator(sequelize: Sequelize, log: (msg: string) => void = () => {}) {
  return new Umzug<QueryInterface>({
    migrations: migrations.map((m) => ({
      name: m.name,
      up: ({ context }) => m.up({ context }),
      down: ({ context }) => m.down({ context }),
    })),
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize, tableName: 'schema_migrations' }),
    logger: {
      info: (e) => log(JSON.stringify(e)),
      warn: (e) => log(JSON.stringify(e)),
      error: (e) => log(JSON.stringify(e)),
      debug: () => {},
    },
  });
}
