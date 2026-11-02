import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';

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
