import nodemailer from "nodemailer";
import { getEnv, getPublicBaseUrl } from "../shared/utils/env";

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) {
    return transporter;
  }

  const host = getEnv("SMTP_HOST", "").trim();
  const port = Number.parseInt(getEnv("SMTP_PORT", "587"), 10);
  const user = getEnv("SMTP_USER", "").trim();
  const pass = getEnv("SMTP_PASS", "").trim();
  if (!host || !port || !user || !pass) {
    throw new Error("smtp_not_configured");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export function isStudioEmailConfigured(): boolean {
  return Boolean(
    getEnv("SMTP_HOST", "").trim() &&
      getEnv("SMTP_PORT", "").trim() &&
      getEnv("SMTP_USER", "").trim() &&
      getEnv("SMTP_PASS", "").trim() &&
      getEnv("SMTP_FROM", "").trim(),
  );
}

export async function sendStudioEmail(payload: EmailPayload): Promise<void> {
  const from = getEnv("SMTP_FROM", "").trim();
  if (!from) {
    throw new Error("smtp_not_configured");
  }

  await getTransporter().sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}

export function buildStudioLoginUrl(params?: Record<string, string | null | undefined>): string {
  const base = `${getPublicBaseUrl()}/login`;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized) {
      query.set(key, normalized);
    }
  }

  const queryString = query.toString();
  return queryString ? `${base}?${queryString}` : base;
}
