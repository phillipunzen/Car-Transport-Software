import nodemailer from "nodemailer";

export const mailEnabled = () => Boolean(process.env.SMTP_HOST);

export type MailOptions = {
  to: string;
  subject: string;
  text: string;
  cc?: string;
  replyTo?: string;
  fromName?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

function transport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
}

/** Absender: SMTP_FROM; optional mit Firmenname als Anzeigename (Adresse bleibt die des Servers). */
function sender(fromName?: string) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  if (!fromName) return from;
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  return { name: fromName, address };
}

export async function sendMail(to: string, subject: string, text: string) {
  return sendMailWith({ to, subject, text });
}

export async function sendMailWith(opts: MailOptions) {
  if (!mailEnabled()) return false;
  await transport().sendMail({
    from: sender(opts.fromName),
    to: opts.to,
    cc: opts.cc || undefined,
    replyTo: opts.replyTo || undefined,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  });
  return true;
}

export const appUrl = () => (process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
