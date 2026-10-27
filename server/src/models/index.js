import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const opts = { timestamps: true };

// ---------- Users and sessions ----------
const userSchema = new Schema(
  {
    uid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    title: { type: String, default: '' },
    role: { type: String, enum: ['admin', 'responder', 'viewer'], default: 'responder' },
    hue: { type: Number, default: 210 },
    oncall: { type: Number, default: null },
    skills: { type: [String], default: [] },
    phone: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    disabled: { type: Boolean, default: false },
  },
  opts
);
userSchema.methods.toPublic = function toPublic(withPrivate = false) {
  const o = { id: this.uid, email: this.email, name: this.name, title: this.title, role: this.role, hue: this.hue, skills: this.skills, disabled: this.disabled };
  if (this.oncall) o.oncall = this.oncall;
  if (withPrivate) o.phone = this.phone;
  return o;
};
export const User = model('User', userSchema);
export const publicUser = (u, withPrivate = false) => User.hydrate(u).toPublic(withPrivate);

const refreshSchema = new Schema({
  userUid: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  family: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  revokedAt: { type: Date, default: null },
  replacedByHash: { type: String, default: null },
  userAgent: { type: String, default: '' },
}, opts);
export const RefreshToken = model('RefreshToken', refreshSchema);

// ---------- Event log (append only) and incident read model ----------
const eventSchema = new Schema({
  eid: { type: String, required: true, unique: true },
  incidentId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  actor: { type: String, required: true },
  ts: { type: Number, required: true },
  payload: { type: Schema.Types.Mixed, default: {} },
});
eventSchema.index({ incidentId: 1, ts: 1 });
export const Event = model('Event', eventSchema);

// Read model rebuilt from events by services/projector.js. strict:false because the
// folded shape is owned by domain/fold.js, not by this schema.
const incidentSchema = new Schema(
  {
    _id: String,
    // Only fields we filter or sort on need declaring; strict:false stores the rest as-is.
    code: String,
    service: String,
    severity: String,
    status: String,
    isOpen: Boolean,
    createdAt: Number,
    resolvedAt: Number,
    ackedAt: Number,
    level: Number,
    eventCount: Number,
  },
  { strict: false, id: false, versionKey: false }
);
incidentSchema.index({ isOpen: 1, service: 1 });
incidentSchema.index({ createdAt: -1 });
export const Incident = model('Incident', incidentSchema);

// ---------- Collaboration ----------
export const RunbookDoc = model('RunbookDoc', new Schema({ _id: String, state: Buffer, updatedAt: Date }, { id: false, versionKey: false }));

export const Postmortem = model('Postmortem', new Schema({
  incidentId: { type: String, required: true, unique: true },
  text: { type: String, default: '' },
  updatedBy: { type: String, default: '' },
}, opts));

// ---------- Integrations and delivery ----------
export const Integration = model('Integration', new Schema({
  name: { type: String, required: true, trim: true },
  source: { type: String, enum: ['prometheus', 'datadog', 'custom'], required: true },
  token: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },
  createdBy: { type: String, default: 'system' },
  lastUsedAt: { type: Date, default: null },
}, opts));

export const WebhookDelivery = model('WebhookDelivery', new Schema({
  integrationId: String,
  integrationName: String,
  source: String,
  status: { type: String, enum: ['ok', 'error'] },
  results: { type: Schema.Types.Mixed, default: [] },
  error: { type: String, default: '' },
  bytes: Number,
  ts: { type: Date, default: Date.now, index: { expireAfterSeconds: 7 * 86400 } },
}));

export const Subscriber = model('Subscriber', new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  token: { type: String, required: true, unique: true },
}, opts));

export const Notification = model('Notification', new Schema({
  incidentId: { type: String, index: true },
  kind: String,
  channel: { type: String, enum: ['email', 'sms'] },
  to: String,
  subject: String,
  body: String,
  status: { type: String, enum: ['sent', 'failed', 'skipped'] },
  provider: String,
  error: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: { expireAfterSeconds: 30 * 86400 } },
}));
