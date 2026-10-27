import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { log } from '../logger.js';

let transport = null;
function mailer() {
  if (transport) return transport;
  transport = config.SMTP_HOST
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transport;
}

export async function sendEmail({ to, subject, text }) {
  const live = !!config.SMTP_HOST;
  await mailer().sendMail({ from: config.MAIL_FROM, to, subject, text });
  if (!live) log.info(`[email dev transport] to=${to} subject="${subject}"`);
  return live ? 'smtp' : 'console';
}

let twilioClient = null;
export async function sendSms({ to, body }) {
  const live = config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM;
  if (!live) {
    log.info(`[sms dev transport] to=${to} body="${body}"`);
    return 'console';
  }
  if (!twilioClient) {
    const twilio = (await import('twilio')).default;
    twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  }
  await twilioClient.messages.create({ to, from: config.TWILIO_FROM, body });
  return 'twilio';
}
