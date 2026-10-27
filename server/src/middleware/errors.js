import { ZodError } from 'zod';
import { log } from '../logger.js';

export const notFound = (req, res) => res.status(404).json({ error: 'Not found.' });

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Invalid request.', details: err.flatten() });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The body is not valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The body is too large.' });
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status === 500) log.error(`${req.method} ${req.originalUrl}:`, err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong on our side.' : err.message, details: err.details });
}

export function errMessage(err) {
  if (err instanceof ZodError) return err.issues[0]?.message || 'Invalid input.';
  if (err.status && err.status < 500) return err.message;
  log.error('socket handler error:', err);
  return 'Something went wrong on our side.';
}
