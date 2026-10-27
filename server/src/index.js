import http from 'node:http';
import mongoose from 'mongoose';
import { config } from './config.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { initSocket } from './socket.js';
import { startYjs, stopYjs } from './services/yjsService.js';
import { startEscalation, stopEscalation, resumeEscalations } from './services/escalation.js';
import { startNotify, stopNotify } from './services/notify.js';
import { seedIfEmpty } from './services/seed.js';
import { redis } from './redis.js';
import { log } from './logger.js';

async function main() {
  await connectDb();
  await redis().ping();
  log.info('Redis connected');

  await seedIfEmpty();

  const server = http.createServer(createApp());
  const io = initSocket(server);
  startYjs();
  startEscalation();
  startNotify();
  await resumeEscalations();

  server.listen(config.PORT, () => log.info(`Tidewater API listening on http://localhost:${config.PORT}`));

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    log.info(`${signal} received, shutting down`);
    setTimeout(() => process.exit(1), 10000).unref();
    io.close();
    await new Promise((r) => server.close(r));
    await stopEscalation();
    await stopNotify();
    await stopYjs();
    await mongoose.disconnect();
    redis().disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (err) => log.error('unhandled rejection:', err));

main().catch((err) => {
  log.error('Failed to start:', err.message);
  if (/ECONNREFUSED/.test(String(err.message))) log.error('Is Mongo/Redis running? Try: docker compose up -d mongo redis');
  process.exit(1);
});
