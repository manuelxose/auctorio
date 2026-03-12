import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    tenantId: string;
    studioUserId?: string;
    studioSessionId?: string;
    studioPermissions?: string[];
    studioAuthMode?: "api_key" | "oidc";
  }
}
