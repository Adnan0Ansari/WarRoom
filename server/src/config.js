import 'dotenv/config';
import { z } from 'zod';

// On Render the public URL is injected for us, so URLs default to it.
const ext = process.env.RENDER_EXTERNAL_URL;

const bool = (d) => z.string().default(d).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().default('mongodb://127.0.0.1:27017/warroom'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-only-change-me-please-123456'),
  ACCESS_TTL_MIN: z.coerce.number().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().default(14),
  COOKIE_SECURE: bool('false'),
  CLIENT_ORIGIN: z.string().default(ext || 'http://localhost:5173'),
  APP_URL: z.string().default(ext || 'http://localhost:5173'),
  API_PUBLIC_URL: z.string().default(ext || 'http://localhost:4000'),
  ESC_SECONDS: z.string().default('20,40,60,90'),
  SEED_DEMO: bool('true'),
  DEMO_PASSWORD: z.string().default('tidewater'),
  ADMIN_EMAIL: z.string().default(''),
  ADMIN_PASSWORD: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('Tidewater <alerts@tidewater.dev>'),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_FROM: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

if (config.NODE_ENV === 'production') {
  if (config.JWT_ACCESS_SECRET.startsWith('dev-only')) {
    console.error('Refusing to start: set a real JWT_ACCESS_SECRET in production.');
    process.exit(1);
  }
  if (config.SEED_DEMO) console.warn('Warning: SEED_DEMO is on in production. Demo accounts share a known password.');
}

const secs = config.ESC_SECONDS.split(',').map((n) => Number(n.trim()));
export const escalationSeconds = {
  sev1: secs[0] || 20,
  sev2: secs[1] || 40,
  sev3: secs[2] || 60,
  sev4: secs[3] || 90,
};
