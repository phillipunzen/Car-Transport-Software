import nodemailer from "nodemailer";

export const mailEnabled = () => Boolean(process.env.SMTP_HOST);

export async function sendMail(to: string, subject: string, text: string) {
  if (!mailEnabled()) return false;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
  return true;
}

export const appUrl = () => (process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
