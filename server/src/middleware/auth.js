import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { config } from '../config.js';
import { asyncHandler, httpError } from '../utils.js';

export function verifyAccess(token) {
  return jwt.verify(token, config.JWT_ACCESS_SECRET);
}

export const signAccess = (u) => jwt.sign({ sub: u.uid, role: u.role }, config.JWT_ACCESS_SECRET, { expiresIn: config.ACCESS_TTL_MIN * 60 });

// Loads the user on every request so a disabled account or changed role takes effect immediately.
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw httpError(401, 'Sign in required.');
  let payload;
  try {
    payload = verifyAccess(token);
  } catch {
    throw httpError(401, 'Your session expired.');
  }
  const doc = await User.findOne({ uid: payload.sub });
  if (!doc || doc.disabled) throw httpError(401, 'This account is unavailable.');
  req.user = { id: doc.uid, role: doc.role, doc };
  next();
});

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(httpError(403, 'Only admins can do that.'));
