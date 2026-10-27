import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const httpError = (status, message, details) => new HttpError(status, message, details);

// 12 url-safe characters, matches the id format clients are allowed to send.
export const newId = () => crypto.randomBytes(9).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const validate = (schema, where = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[where]);
  if (!r.success) return next(httpError(400, 'Invalid request', r.error.flatten()));
  req[where] = r.data;
  next();
};

export function withTimeout(promise, ms, label = 'operation') {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}
