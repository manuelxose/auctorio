import type { FastifyInstance } from "fastify";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { requireInternalSecret } from "./http-utils";

export type WaitlistSignupInput = {
  email: string;
  name: string;
  company: string | null;
  message: string | null;
  locale: "en" | "es";
  sourcePath: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { email: 254, name: 120, company: 160, message: 2000, sourcePath: 300 };

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Validates a public waitlist submission. Pure, so it can be unit tested without a database. */
export function parseWaitlistSignup(
  body: unknown,
): { ok: true; value: WaitlistSignupInput } | { ok: false; error: string } {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const email = text(input.email, LIMITS.email)?.toLowerCase() ?? null;
  const name = text(input.name, LIMITS.name);

  if (!email || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "invalid_email" };
  }
  if (!name) {
    return { ok: false, error: "name_required" };
  }

  const sourcePath = text(input.sourcePath, LIMITS.sourcePath);
  return {
    ok: true,
    value: {
      email,
      name,
      company: text(input.company, LIMITS.company),
      message: text(input.message, LIMITS.message),
      locale: input.locale === "es" ? "es" : "en",
      // Only keep same-site paths; never store arbitrary URLs from the client.
      sourcePath: sourcePath && sourcePath.startsWith("/") && !sourcePath.startsWith("//") ? sourcePath : null,
    },
  };
}

export function registerWaitlistRoutes(fastify: FastifyInstance): void {
  // Called only by the studio-web SSR server, which owns the public endpoint and its rate limiting.
  fastify.post("/internal/waitlist", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const parsed = parseWaitlistSignup(request.body);
    if (!parsed.ok) {
      return reply.code(400).send({ error: parsed.error });
    }

    const { email, ...fields } = parsed.value;
    // Re-submitting refreshes the details instead of failing, so the form never leaks whether an email is already listed.
    await getPrismaClient().waitlistSignup.upsert({
      where: { email },
      create: { email, ...fields },
      update: fields,
    });

    return reply.code(201).send({ ok: true });
  });
}
