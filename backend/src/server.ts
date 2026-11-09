import { createApp } from './app.js';
import { config, isProduction } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { ensureStorage } from './requests/storage.js';
import { startStorageSync } from './requests/storage-sync.js';
import { startSimulator } from './requests/workflow.js';

await ensureStorage();
if (config.SIMULATE_WORKFLOW) startSimulator();
if (config.SYNC_STORAGE_DELETES ?? !isProduction) startStorageSync();

const server = createApp().listen(config.PORT, () => {
  logger.info(`MRRM API listening on http://localhost:${config.PORT}`);
});

function shutdown() {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
