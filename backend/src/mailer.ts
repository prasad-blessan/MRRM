import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { logger } from './logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

// Development only (MAIL_TRANSPORT=console, refused in production by config).
const DEV_MAIL_DIR = join(process.cwd(), '.dev-mail');

const transport =
  config.MAIL_TRANSPORT === 'smtp'
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
      })
    : null;

// NOT-02: callers must keep mail content free of PHI/PII.
// NOT-08: a delivery failure is logged and never rolls back the business action.
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!transport) {
    const body = `To: ${mail.to}\nSent: ${new Date().toLocaleString()}\nSubject: ${mail.subject}\n\n${mail.text}\n`;
    logger.info(`\n----- DEV EMAIL -----\n${body}---------------------`);
    // Latest email per recipient, overwritten each time, so an old code is never picked by mistake.
    await mkdir(DEV_MAIL_DIR, { recursive: true });
    await writeFile(join(DEV_MAIL_DIR, `${mail.to.replace(/[^a-z0-9@._-]/gi, '_')}.txt`), body);
    return true;
  }
  try {
    await transport.sendMail({ from: config.MAIL_FROM, ...mail });
    return true;
  } catch (err) {
    logger.error({ err, subject: mail.subject }, 'email delivery failed');
    return false;
  }
}
