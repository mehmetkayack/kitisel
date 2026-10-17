import { loadEnv } from '@upvine/config/env';
import { setupTestDatabase } from '@upvine/db/testing';

export default async function globalSetup(): Promise<void> {
  const env = loadEnv({ NODE_ENV: 'test' });
  const sequelize = await setupTestDatabase(env);
  await sequelize.close();
}
