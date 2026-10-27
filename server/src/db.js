import mongoose from 'mongoose';
import { config } from './config.js';
import { log } from './logger.js';

export async function connectDb() {
  await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  // Build indexes before serving traffic. The unique index on events.eid is what makes appends idempotent.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  log.info('MongoDB connected');
}
