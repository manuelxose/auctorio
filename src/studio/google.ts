import { OAuth2Client } from "google-auth-library";
import { getEnv } from "../shared/utils/env";

let client: OAuth2Client | null = null;

export type StudioGoogleIdentity = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  emailVerified: boolean;
};

export function getStudioGoogleClientId(): string | null {
  const clientId = getEnv("GOOGLE_CLIENT_ID", "").trim();
  return clientId || null;
}

function getClient(): OAuth2Client {
  if (!client) {
    const clientId = getStudioGoogleClientId();
    if (!clientId) {
      throw new Error("google_login_not_configured");
    }
    client = new OAuth2Client(clientId);
  }
  return client;
}

export async function verifyStudioGoogleCredential(
  credential: string,
): Promise<StudioGoogleIdentity> {
  const clientId = getStudioGoogleClientId();
  if (!clientId) {
    throw new Error("google_login_not_configured");
  }

  const ticket = await getClient().verifyIdToken({
    idToken: credential,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("google_identity_invalid");
  }

  return {
    sub: payload.sub,
    email: String(payload.email).trim().toLowerCase(),
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null,
    picture:
      typeof payload.picture === "string" && payload.picture.trim() ? payload.picture.trim() : null,
    emailVerified: payload.email_verified !== false,
  };
}
