import { getEnv } from "../../shared/utils/env";
import { isSocialIntegrationConfigured } from "../social-provider";

// ────────────────────────────────────────────────────────────── Types

export type ConnectorKind = "website" | "x" | "instagram";

export type AuthMethodId =
  | "oauth"
  | "api_token"
  | "application_password"
  | "signing_secret"
  | "managed_provider";

export type CapabilityId =
  | "discovery"
  | "draft_create"
  | "draft_update"
  | "publish"
  | "unpublish"
  | "media_upload"
  | "taxonomy"
  | "canonical_url"
  | "status_check"
  | "post_text"
  | "post_media"
  | "post_stories"
  | "post_carousel"
  | "post_threads";

export type AuthMethodDescriptor = {
  id: AuthMethodId;
  label: string;
  description: string;
  // Server-side availability: oauth requires provider credentials configured.
  available: boolean;
  requiredFields: Array<{
    key: string;
    label: string;
    kind: "url" | "text" | "secret" | "select" | "boolean";
    required: boolean;
    placeholder?: string;
    help?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
};

export type ConfigSchemaField = AuthMethodDescriptor["requiredFields"][number];

export type ConnectorDescriptor = {
  id: string;
  kind: ConnectorKind;
  name: string;
  description: string;
  authMethods: AuthMethodDescriptor[];
  capabilities: CapabilityId[];
  // Versioned JSON schema the wizard renders from; never hard-coded in the UI.
  configSchemaVersion: number;
  configSchema: {
    type: "object";
    version: number;
    fields: ConfigSchemaField[];
  };
  verification: {
    probes: Array<"auth" | "draft_roundtrip" | "media" | "publish" | "unpublish" | "status">;
    reversible: boolean;
    notes: string;
  };
  // True when the connector needs a remote destination URL (websites only).
  requiresDestinationUrl: boolean;
};

// ────────────────────────────────────────────────────────────── Descriptors

function socialOAuthAvailable(platform: "x" | "instagram"): boolean {
  const configured = getEnv("SOCIAL_PROVIDER", "").trim().toLowerCase();
  if (configured === "ayrshare" || configured === "direct") {
    return isSocialIntegrationConfigured(configured);
  }
  const anyProvider = isSocialIntegrationConfigured("ayrshare") || isSocialIntegrationConfigured("direct");
  if (!anyProvider) {
    return false;
  }
  if (platform === "instagram") {
    return getEnv("AYRSHARE_API_KEY", "") !== "" || Boolean(getEnv("META_APP_ID", "") && getEnv("META_APP_SECRET", ""));
  }
  return getEnv("AYRSHARE_API_KEY", "") !== "" || Boolean(getEnv("X_CLIENT_ID", "") && getEnv("X_CLIENT_SECRET", ""));
}

const SOCIAL_OAUTH_FIELDS: ConfigSchemaField[] = [];

function socialDescriptor(platform: "x" | "instagram"): ConnectorDescriptor {
  const label = platform === "x" ? "X (Twitter)" : "Instagram";
  return {
    id: `${platform}_oauth`,
    kind: platform,
    name: label,
    description: `Authorize an ${label} account through OAuth with PKCE. One-click when the server-side provider is configured.`,
    authMethods: [
      {
        id: "oauth",
        label: "OAuth authorization",
        description: "Authorize Auctorio to publish to your account. Tokens are encrypted at rest and never shown again.",
        available: socialOAuthAvailable(platform),
        requiredFields: SOCIAL_OAUTH_FIELDS,
      },
    ],
    capabilities:
      platform === "x"
        ? ["discovery", "post_text", "post_media", "post_threads", "status_check"]
        : ["discovery", "post_text", "post_media", "post_stories", "post_carousel", "status_check"],
    configSchemaVersion: 1,
    configSchema: {
      type: "object",
      version: 1,
      fields: SOCIAL_OAUTH_FIELDS,
    },
    verification: {
      probes: ["auth", "status"],
      reversible: true,
      notes: "Verification checks the provider account status; it never publishes content.",
    },
    requiresDestinationUrl: false,
  };
}

const GENERIC_REST_FIELDS: ConfigSchemaField[] = [
  { key: "baseUrl", label: "Site URL", kind: "url", required: true, placeholder: "https://example.com", help: "Canonical origin of the website." },
  { key: "apiToken", label: "API token or application password", kind: "secret", required: true, placeholder: "Stored encrypted; never displayed again", help: "WordPress application passwords work with the REST adapter." },
  { key: "authScheme", label: "Authorization scheme", kind: "select", required: false, options: [{ value: "bearer", label: "Bearer token" }, { value: "basic_user_pass", label: "Basic (application password)" }] },
  { key: "restBasePath", label: "REST base path", kind: "text", required: false, placeholder: "/wp-json/wp/v2", help: "Leave empty to use the discovered WordPress path." },
  { key: "contentPath", label: "Content path", kind: "text", required: false, placeholder: "/posts" },
  { key: "mediaPath", label: "Media upload path", kind: "text", required: false, placeholder: "/media" },
  { key: "authorId", label: "Default author ID", kind: "text", required: false },
  { key: "categoryIds", label: "Default category IDs (comma separated)", kind: "text", required: false },
  { key: "locale", label: "Locale", kind: "text", required: false, placeholder: "es-ES" },
];

const GENERIC_REST_DESCRIPTOR: ConnectorDescriptor = {
  id: "generic_rest",
  kind: "website",
  name: "Generic REST / WordPress",
  description: "Publish through a documented REST API using an API token or application password. Works with WordPress, Ghost and similar platforms.",
  authMethods: [
    {
      id: "api_token",
      label: "API token",
      description: "A bearer token or application password the destination accepts on its REST endpoints.",
      available: true,
      requiredFields: [],
    },
  ],
  capabilities: [
    "discovery",
    "draft_create",
    "draft_update",
    "publish",
    "unpublish",
    "media_upload",
    "taxonomy",
    "canonical_url",
    "status_check",
  ],
  configSchemaVersion: 1,
  configSchema: {
    type: "object",
    version: 1,
    fields: GENERIC_REST_FIELDS,
  },
  verification: {
    probes: ["auth", "draft_roundtrip", "media", "status"],
    reversible: true,
    notes: "Verification creates and deletes a sandbox draft only; it never publishes public content.",
  },
  requiresDestinationUrl: true,
};

const GENERIC_WEBHOOK_DESCRIPTOR: ConnectorDescriptor = {
  id: "generic_webhook",
  kind: "website",
  name: "Signed webhook",
  description: "Push signed JSON payloads to an endpoint the destination exposes. The destination verifies an HMAC signature of every payload.",
  authMethods: [
    {
      id: "signing_secret",
      label: "Signing secret",
      description: "Shared HMAC secret used to sign each payload with x-content-signature.",
      available: true,
      requiredFields: [],
    },
  ],
  capabilities: ["discovery", "draft_create", "draft_update", "publish", "unpublish", "canonical_url"],
  configSchemaVersion: 1,
  configSchema: {
    type: "object",
    version: 1,
    fields: [
      { key: "baseUrl", label: "Webhook URL", kind: "url", required: true, placeholder: "https://example.com/auctorio", help: "Endpoint that accepts signed JSON payloads." },
      { key: "signingSecret", label: "Signing secret", kind: "secret", required: true, placeholder: "Stored encrypted; never displayed again" },
    ],
  },
  verification: {
    probes: ["auth", "draft_roundtrip"],
    reversible: true,
    notes: "Verification sends a signed, non-publishing probe action and requires the endpoint to acknowledge it.",
  },
  requiresDestinationUrl: true,
};

// ────────────────────────────────────────────────────────────── Registry

const registry = new Map<string, ConnectorDescriptor>();

function register(descriptor: ConnectorDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

register(GENERIC_REST_DESCRIPTOR);
register(GENERIC_WEBHOOK_DESCRIPTOR);
register(socialDescriptor("x"));
register(socialDescriptor("instagram"));

export function listConnectorDescriptors(): ConnectorDescriptor[] {
  return Array.from(registry.values());
}

export function listConnectorDescriptorsByKind(kind: ConnectorKind): ConnectorDescriptor[] {
  return Array.from(registry.values()).filter((descriptor) => descriptor.kind === kind);
}

export function getConnectorDescriptor(id: string): ConnectorDescriptor | null {
  return registry.get(id) ?? null;
}

export type ConnectorCapabilityView = {
  kind: ConnectorKind;
  label: string;
  mark: string;
  connectors: Array<{
    id: string;
    name: string;
    description: string;
    capabilities: CapabilityId[];
    authMethods: Array<{ id: string; label: string; description: string; available: boolean }>;
    ready: boolean;
    actionHint: string | null;
    configSchemaVersion: number;
  }>;
};

export function connectorCapabilityView(): ConnectorCapabilityView[] {
  const kinds: Array<{ kind: ConnectorKind; label: string; mark: string }> = [
    { kind: "website", label: "Website", mark: "WEB" },
    { kind: "instagram", label: "Instagram", mark: "IG" },
    { kind: "x", label: "X", mark: "X" },
  ];
  return kinds.map(({ kind, label, mark }) => ({
    kind,
    label,
    mark,
    connectors: listConnectorDescriptorsByKind(kind).map((descriptor) => {
      const oauthAvailable = descriptor.authMethods.every((method) => method.available);
      const ready = descriptor.kind === "website" ? true : oauthAvailable;
      const actionHint =
        descriptor.kind !== "website" && !oauthAvailable
          ? "A server-side provider (managed Ayrshare or your own developer apps) must be configured before this connector can be authorized."
          : null;
      return {
        id: descriptor.id,
        name: descriptor.name,
        description: descriptor.description,
        capabilities: descriptor.capabilities,
        authMethods: descriptor.authMethods.map((method) => ({
          id: method.id,
          label: method.label,
          description: method.description,
          available: method.available,
        })),
        ready,
        actionHint,
        configSchemaVersion: descriptor.configSchemaVersion,
      };
    }),
  }));
}

export function registerConnectorDescriptor(descriptor: ConnectorDescriptor): void {
  register(descriptor);
}
