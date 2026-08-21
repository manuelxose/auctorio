"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApiKeyStudioSession = buildApiKeyStudioSession;
exports.resolveTenantBySlug = resolveTenantBySlug;
exports.getStudioIdentityProviderConfig = getStudioIdentityProviderConfig;
exports.getInternalStudioIdentityProviderBySlug = getInternalStudioIdentityProviderBySlug;
exports.getInternalStudioWorkspaceAccessBySlug = getInternalStudioWorkspaceAccessBySlug;
exports.upsertStudioIdentityProvider = upsertStudioIdentityProvider;
exports.listStudioUsers = listStudioUsers;
exports.listStudioRoles = listStudioRoles;
exports.inviteStudioUser = inviteStudioUser;
exports.updateStudioUser = updateStudioUser;
exports.assignStudioRoleToUser = assignStudioRoleToUser;
exports.removeStudioRoleFromUser = removeStudioRoleFromUser;
exports.createStudioRole = createStudioRole;
exports.updateStudioRole = updateStudioRole;
exports.getStudioLoginOptions = getStudioLoginOptions;
exports.loginStudioAccountWithPassword = loginStudioAccountWithPassword;
exports.loginStudioAccountWithGoogle = loginStudioAccountWithGoogle;
exports.loginStudioAccountWithPasswordGlobal = loginStudioAccountWithPasswordGlobal;
exports.loginStudioAccountWithGoogleGlobal = loginStudioAccountWithGoogleGlobal;
exports.sendStudioPasswordReset = sendStudioPasswordReset;
exports.acceptStudioInvitation = acceptStudioInvitation;
exports.resetStudioPassword = resetStudioPassword;
exports.completeStudioSsoLogin = completeStudioSsoLogin;
exports.createStudioLaunchTicket = createStudioLaunchTicket;
exports.redeemStudioLaunchTicket = redeemStudioLaunchTicket;
exports.getStudioSessionByToken = getStudioSessionByToken;
exports.getStudioSessionBySessionId = getStudioSessionBySessionId;
exports.revokeStudioSessionByToken = revokeStudioSessionByToken;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/db/prisma");
const env_1 = require("../shared/utils/env");
const security_1 = require("./security");
const prompts_1 = require("./prompts");
const email_1 = require("./email");
const google_1 = require("./google");
const passwords_1 = require("./passwords");
const prisma = (0, prisma_1.getPrismaClient)();
const DEFAULT_STUDIO_RETURN_TO = "/studio/dashboard";
const STUDIO_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const STUDIO_ACCOUNT_TOKEN_TTL_MS = 1000 * 60 * 60;
function resolveStudioReturnTo(value) {
    const normalized = String(value || "").trim();
    return normalized.startsWith("/studio/") ? normalized : DEFAULT_STUDIO_RETURN_TO;
}
function normalizeStudioEmail(value) {
    return String(value || "").trim().toLowerCase();
}
function getStudioRequestAccessUrl() {
    return (0, env_1.getEnv)("STUDIO_REQUEST_ACCESS_URL", "https://tecnoriasl.com/contacto").trim();
}
function hasEnabledProvider(provider) {
    return Boolean(provider?.enabled);
}
function isLocalMembership(membership) {
    return !hasEnabledProvider(membership.tenant.studioIdentityProvider);
}
function isSelectableMembershipStatus(status) {
    return status === "active" || status === "invited";
}
function toWorkspaceSummary(account, membership) {
    return {
        workspace: {
            id: membership.tenant.id,
            name: membership.tenant.name,
            slug: membership.tenant.slug,
            status: membership.tenant.status,
        },
        membershipStatus: membership.status,
        requiresSso: hasEnabledProvider(membership.tenant.studioIdentityProvider),
        preferred: membership.tenant.id === account.lastWorkspaceId,
    };
}
function resolveRecommendedWorkspaceId(account, memberships) {
    if (account.lastWorkspaceId &&
        memberships.some((item) => item.tenantId === account.lastWorkspaceId)) {
        return account.lastWorkspaceId;
    }
    if (memberships.length === 1) {
        return memberships[0]?.tenantId || null;
    }
    return null;
}
function getFirstPartyLaunchWorkspaceSet() {
    return new Set((0, env_1.getEnv)("STUDIO_FIRST_PARTY_LAUNCH_WORKSPACES", "tecnoria")
        .split(",")
        .map((item) => (0, security_1.slugifyTenantName)(item))
        .filter(Boolean));
}
function readClaimMappingObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
}
function readClaimValue(claims, configured, fallbacks) {
    if (typeof configured === "string" && configured.trim()) {
        return claims[configured.trim()];
    }
    for (const key of fallbacks) {
        if (claims[key] !== undefined) {
            return claims[key];
        }
    }
    return undefined;
}
function toStringArray(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
        return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [];
}
function readJsonObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function toPrismaJsonObject(value) {
    if (!value) {
        return client_1.Prisma.JsonNull;
    }
    return value;
}
function buildPermissionList(user) {
    return Array.from(new Set(user.roles.flatMap((membership) => membership.role.permissions.map((permission) => permission.permission)))).sort();
}
function buildRoleKeyList(user) {
    return Array.from(new Set(user.roles.map((membership) => membership.role.key))).sort();
}
function mapUserSummary(user) {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        authProvider: user.oidcIssuer ? "oidc" : "invitation",
        roles: user.roles
            .map((membership) => membership.role)
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((role) => ({
            id: role.id,
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
        })),
    };
}
function mapRoleSummary(role) {
    return {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
        permissions: role.permissions.map((permission) => permission.permission),
        memberCount: role._count.users,
    };
}
async function ensureStudioAccountByEmail(params) {
    const email = normalizeStudioEmail(params.email);
    if (!email) {
        throw new Error("email_required");
    }
    const existing = await prisma.studioAccount.findUnique({
        where: { email },
        select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            status: true,
            emailVerifiedAt: true,
        },
    });
    if (existing) {
        const nextStatus = existing.status === "suspended"
            ? "suspended"
            : existing.status === "active"
                ? "active"
                : (params.status ?? existing.status);
        await prisma.studioAccount.update({
            where: { id: existing.id },
            data: {
                displayName: params.displayName?.trim() || existing.displayName || undefined,
                avatarUrl: params.avatarUrl?.trim() || existing.avatarUrl || undefined,
                status: nextStatus,
                emailVerifiedAt: params.emailVerifiedAt === undefined ? existing.emailVerifiedAt : params.emailVerifiedAt,
            },
        });
        return {
            id: existing.id,
            email: existing.email,
        };
    }
    const account = await prisma.studioAccount.create({
        data: {
            email,
            displayName: params.displayName?.trim() || email,
            avatarUrl: params.avatarUrl?.trim() || null,
            status: params.status ?? "invited",
            emailVerifiedAt: params.emailVerifiedAt ?? null,
        },
        select: {
            id: true,
            email: true,
        },
    });
    return account;
}
async function getStudioAccountByEmail(email) {
    const normalized = normalizeStudioEmail(email);
    if (!normalized) {
        return null;
    }
    return prisma.studioAccount.findUnique({
        where: { email: normalized },
        include: {
            users: {
                where: {
                    status: {
                        in: ["active", "invited", "suspended"],
                    },
                },
                include: {
                    tenant: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            status: true,
                            studioIdentityProvider: {
                                select: {
                                    enabled: true,
                                    issuer: true,
                                    provisioningMode: true,
                                },
                            },
                        },
                    },
                },
                orderBy: [{ lastLoginAt: "desc" }, { updatedAt: "desc" }],
            },
        },
    });
}
async function getStudioAccountByGoogleSubject(subject) {
    const normalized = String(subject || "").trim();
    if (!normalized) {
        return null;
    }
    return prisma.studioAccount.findFirst({
        where: { googleSubject: normalized },
        include: {
            users: {
                where: {
                    status: {
                        in: ["active", "invited", "suspended"],
                    },
                },
                include: {
                    tenant: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            status: true,
                            studioIdentityProvider: {
                                select: {
                                    enabled: true,
                                    issuer: true,
                                    provisioningMode: true,
                                },
                            },
                        },
                    },
                },
                orderBy: [{ lastLoginAt: "desc" }, { updatedAt: "desc" }],
            },
        },
    });
}
function splitMembershipsByAccess(account) {
    const selectable = account.users.filter((membership) => isSelectableMembershipStatus(membership.status));
    return {
        local: selectable.filter((membership) => isLocalMembership(membership)),
        sso: selectable.filter((membership) => !isLocalMembership(membership)),
    };
}
function resolveTargetMembership(account, memberships, workspaceId) {
    if (memberships.length === 0) {
        throw new Error("user_not_authorized");
    }
    const requestedWorkspaceId = String(workspaceId || "").trim();
    if (requestedWorkspaceId) {
        const match = memberships.find((membership) => membership.tenantId === requestedWorkspaceId);
        if (!match) {
            throw new Error("workspace_not_authorized");
        }
        return match;
    }
    const preferredId = resolveRecommendedWorkspaceId(account, memberships);
    if (preferredId) {
        const preferred = memberships.find((membership) => membership.tenantId === preferredId);
        if (preferred) {
            return preferred;
        }
    }
    if (memberships.length === 1) {
        return memberships[0];
    }
    throw new Error("workspace_selection_required");
}
async function issueStudioAccountToken(params) {
    const token = (0, security_1.generateStudioToken)();
    await prisma.studioAccountToken.updateMany({
        where: {
            accountId: params.accountId,
            kind: params.kind,
            consumedAt: null,
        },
        data: {
            consumedAt: new Date(),
        },
    });
    await prisma.studioAccountToken.create({
        data: {
            accountId: params.accountId,
            kind: params.kind,
            tokenHash: (0, security_1.hashStudioToken)(token),
            expiresAt: new Date(Date.now() + (params.ttlMs ?? STUDIO_ACCOUNT_TOKEN_TTL_MS)),
        },
    });
    return token;
}
async function activateStudioAccountMemberships(accountId) {
    const account = await prisma.studioAccount.findUnique({
        where: { id: accountId },
        include: {
            users: true,
        },
    });
    if (!account) {
        throw new Error("account_not_found");
    }
    await prisma.$transaction(async (tx) => {
        await tx.studioAccount.update({
            where: { id: account.id },
            data: {
                status: "active",
                emailVerifiedAt: account.emailVerifiedAt ?? new Date(),
            },
        });
        await tx.studioUser.updateMany({
            where: {
                accountId: account.id,
                status: "invited",
            },
            data: {
                status: "active",
                lastLoginAt: new Date(),
            },
        });
        await tx.studioInvitation.updateMany({
            where: {
                email: account.email,
                status: "pending",
            },
            data: {
                status: "accepted",
                acceptedAt: new Date(),
            },
        });
    });
}
async function sendStudioAccountActionEmail(params) {
    if (!(0, email_1.isStudioEmailConfigured)()) {
        throw new Error("smtp_not_configured");
    }
    const loginUrl = (0, email_1.buildStudioLoginUrl)({
        [params.kind === "activation" ? "invite" : "reset"]: params.token,
        email: params.email,
        entry: "public",
    });
    const subject = params.kind === "activation"
        ? "Activa tu acceso a Auctorio Studio"
        : "Restablece tu acceso a Auctorio Studio";
    const intro = params.kind === "activation"
        ? "Tu acceso a Auctorio ya esta listo para activarse."
        : "Hemos recibido una solicitud para restablecer tu acceso a Auctorio.";
    const actionLabel = params.kind === "activation" ? "Activar acceso" : "Restablecer password";
    await (0, email_1.sendStudioEmail)({
        to: params.email,
        subject,
        text: `${intro}\n\n${actionLabel}: ${loginUrl}\n\nSi no esperabas este correo, ignóralo.`,
        html: `
      <div style="font-family:Inter,system-ui,sans-serif;color:#0f172a;line-height:1.6">
        <p>Hola${params.displayName ? ` ${params.displayName}` : ""},</p>
        <p>${intro}</p>
        <p>
          <a href="${loginUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600">
            ${actionLabel}
          </a>
        </p>
        <p style="font-size:14px;color:#475569">Si el boton no funciona, copia este enlace:</p>
        <p style="font-size:14px;word-break:break-all"><a href="${loginUrl}">${loginUrl}</a></p>
      </div>
    `,
    });
}
async function ensureUniqueTenantSlug(tenantId, name) {
    const base = (0, security_1.slugifyTenantName)(name);
    let candidate = base;
    let suffix = 1;
    for (;;) {
        const existing = await prisma.tenant.findFirst({
            where: {
                slug: candidate,
                NOT: { id: tenantId },
            },
            select: { id: true },
        });
        if (!existing) {
            break;
        }
        suffix += 1;
        candidate = `${base}-${suffix}`;
    }
    await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            slug: candidate,
        },
    });
    return candidate;
}
async function ensureTenantBootstrap(tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            name: true,
            slug: true,
            status: true,
        },
    });
    if (!tenant) {
        throw new Error("tenant_not_found");
    }
    const slug = tenant.slug?.trim() || (await ensureUniqueTenantSlug(tenant.id, tenant.name));
    await ensureStudioRoles(tenant.id);
    await (0, prompts_1.ensureTenantPromptLibrarySeeded)(prisma, tenant.id);
    return {
        id: tenant.id,
        name: tenant.name,
        slug,
        status: tenant.status,
    };
}
function resolveTenantSlugForSession(tenant) {
    return tenant.slug?.trim() || (0, security_1.slugifyTenantName)(tenant.name);
}
async function readTenantSessionContext(tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            _count: {
                select: {
                    sites: true,
                    contentProjects: true,
                },
            },
            studioIdentityProvider: {
                select: {
                    enabled: true,
                    issuer: true,
                    provisioningMode: true,
                },
            },
        },
    });
    if (!tenant) {
        throw new Error("tenant_not_found");
    }
    return {
        id: tenant.id,
        name: tenant.name,
        slug: resolveTenantSlugForSession(tenant),
        status: tenant.status,
        siteCount: tenant._count.sites,
        projectCount: tenant._count.contentProjects,
        identityProvider: tenant.studioIdentityProvider
            ? {
                enabled: tenant.studioIdentityProvider.enabled,
                issuer: tenant.studioIdentityProvider.issuer,
                provisioningMode: tenant.studioIdentityProvider.provisioningMode,
            }
            : null,
    };
}
async function ensureStudioRoles(tenantId) {
    for (const [key, definition] of Object.entries(security_1.STUDIO_SYSTEM_ROLES)) {
        const role = await prisma.studioRole.upsert({
            where: {
                tenantId_key: {
                    tenantId,
                    key,
                },
            },
            update: {
                name: definition.name,
                description: definition.description,
                isSystem: true,
            },
            create: {
                tenantId,
                key,
                name: definition.name,
                description: definition.description,
                isSystem: true,
            },
        });
        const desiredPermissions = new Set(definition.permissions);
        const currentPermissions = await prisma.studioRolePermission.findMany({
            where: { roleId: role.id },
        });
        const currentSet = new Set(currentPermissions.map((permission) => permission.permission));
        const toCreate = definition.permissions.filter((permission) => !currentSet.has(permission));
        const toDelete = currentPermissions
            .filter((permission) => !desiredPermissions.has(permission.permission))
            .map((permission) => permission.id);
        if (toCreate.length > 0) {
            await prisma.studioRolePermission.createMany({
                data: toCreate.map((permission) => ({
                    roleId: role.id,
                    permission,
                })),
                skipDuplicates: true,
            });
        }
        if (toDelete.length > 0) {
            await prisma.studioRolePermission.deleteMany({
                where: {
                    id: {
                        in: toDelete,
                    },
                },
            });
        }
    }
}
async function buildHumanSession(user, authMode) {
    const tenant = await readTenantSessionContext(user.tenantId);
    return {
        tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
        },
        authMode,
        user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            status: user.status,
            lastLoginAt: user.lastLoginAt,
        },
        roles: buildRoleKeyList(user),
        permissions: buildPermissionList(user),
        identityProvider: tenant.identityProvider,
        siteCount: tenant.siteCount,
        projectCount: tenant.projectCount,
    };
}
async function createStudioUserSession(tenantId, studioUserId, authMode) {
    const sessionToken = (0, security_1.generateStudioToken)();
    await prisma.studioUserSession.create({
        data: {
            tenantId,
            studioUserId,
            authMode,
            tokenHash: (0, security_1.hashStudioToken)(sessionToken),
            expiresAt: new Date(Date.now() + STUDIO_SESSION_TTL_MS),
            lastSeenAt: new Date(),
        },
    });
    return sessionToken;
}
async function buildApiKeyStudioSession(tenantId) {
    let tenant;
    try {
        tenant = await readTenantSessionContext(tenantId);
    }
    catch {
        return null;
    }
    return {
        tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
        },
        authMode: "api_key",
        user: {
            id: "api-key-session",
            email: "api-key@system.local",
            displayName: "API Key Session",
            avatarUrl: null,
            status: "active",
            lastLoginAt: null,
        },
        roles: ["owner", "admin"],
        permissions: [...security_1.STUDIO_PERMISSIONS],
        identityProvider: tenant.identityProvider,
        siteCount: tenant.siteCount,
        projectCount: tenant.projectCount,
    };
}
async function resolveTenantBySlug(slug) {
    const normalized = (0, security_1.slugifyTenantName)(slug);
    const tenant = await prisma.tenant.findFirst({
        where: {
            OR: [{ slug: normalized }],
        },
        select: {
            id: true,
            name: true,
            slug: true,
        },
    });
    if (tenant?.slug) {
        return {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
        };
    }
    const fallbackTenant = await prisma.tenant.findMany({
        where: {
            slug: null,
        },
        select: {
            id: true,
            name: true,
        },
    });
    const match = fallbackTenant.find((item) => (0, security_1.slugifyTenantName)(item.name) === normalized);
    if (!match) {
        return null;
    }
    const ensuredSlug = await ensureUniqueTenantSlug(match.id, match.name);
    return {
        id: match.id,
        name: match.name,
        slug: ensuredSlug,
    };
}
async function getStudioIdentityProviderConfig(tenantId) {
    await ensureTenantBootstrap(tenantId);
    const provider = await prisma.studioIdentityProvider.findUnique({
        where: { tenantId },
    });
    if (!provider) {
        return null;
    }
    return {
        enabled: provider.enabled,
        issuer: provider.issuer,
        clientId: provider.clientId,
        scopes: provider.scopes,
        provisioningMode: provider.provisioningMode,
        claimMappings: readJsonObject(provider.claimMappings),
        hasClientSecret: Boolean((0, security_1.decryptStudioSecret)(provider.clientSecretCiphertext)),
    };
}
async function getInternalStudioIdentityProviderBySlug(slug) {
    const tenant = await resolveTenantBySlug(slug);
    if (!tenant) {
        return null;
    }
    await ensureTenantBootstrap(tenant.id);
    const provider = await prisma.studioIdentityProvider.findUnique({
        where: { tenantId: tenant.id },
    });
    if (!provider) {
        return null;
    }
    return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        enabled: provider.enabled,
        issuer: provider.issuer,
        clientId: provider.clientId,
        clientSecret: (0, security_1.decryptStudioSecret)(provider.clientSecretCiphertext),
        scopes: provider.scopes,
        claimMappings: readJsonObject(provider.claimMappings),
        provisioningMode: provider.provisioningMode,
    };
}
async function getInternalStudioWorkspaceAccessBySlug(slug) {
    const tenant = await resolveTenantBySlug(slug);
    if (!tenant) {
        return null;
    }
    const bootstrapped = await ensureTenantBootstrap(tenant.id);
    const provider = await prisma.studioIdentityProvider.findUnique({
        where: { tenantId: tenant.id },
        select: {
            enabled: true,
            issuer: true,
            provisioningMode: true,
        },
    });
    return {
        tenantId: bootstrapped.id,
        tenantName: bootstrapped.name,
        tenantSlug: bootstrapped.slug,
        tenantStatus: bootstrapped.status,
        authMode: provider?.enabled ? "oidc" : "api_key",
        apiKeyFallback: true,
        identityProvider: {
            configured: Boolean(provider),
            enabled: provider?.enabled ?? false,
            issuer: provider?.issuer ?? null,
            provisioningMode: provider?.provisioningMode ?? null,
        },
    };
}
async function upsertStudioIdentityProvider(tenantId, input) {
    await ensureTenantBootstrap(tenantId);
    const current = await prisma.studioIdentityProvider.findUnique({
        where: { tenantId },
    });
    const provider = current
        ? await prisma.studioIdentityProvider.update({
            where: { tenantId },
            data: {
                enabled: input.enabled ?? current.enabled,
                issuer: input.issuer?.trim() || current.issuer,
                clientId: input.clientId?.trim() || current.clientId,
                clientSecretCiphertext: input.clientSecret === undefined
                    ? current.clientSecretCiphertext
                    : input.clientSecret?.trim()
                        ? (0, security_1.encryptStudioSecret)(input.clientSecret.trim())
                        : null,
                scopes: input.scopes?.trim() || current.scopes,
                claimMappings: input.claimMappings === undefined
                    ? toPrismaJsonObject(readJsonObject(current.claimMappings))
                    : toPrismaJsonObject(input.claimMappings),
                provisioningMode: input.provisioningMode ?? current.provisioningMode,
            },
        })
        : await prisma.studioIdentityProvider.create({
            data: {
                tenantId,
                enabled: input.enabled ?? false,
                issuer: input.issuer?.trim() || "",
                clientId: input.clientId?.trim() || "",
                clientSecretCiphertext: input.clientSecret?.trim()
                    ? (0, security_1.encryptStudioSecret)(input.clientSecret.trim())
                    : null,
                scopes: input.scopes?.trim() || "openid profile email",
                claimMappings: toPrismaJsonObject(input.claimMappings),
                provisioningMode: input.provisioningMode ?? "invite_only",
            },
        });
    return {
        enabled: provider.enabled,
        issuer: provider.issuer,
        clientId: provider.clientId,
        scopes: provider.scopes,
        provisioningMode: provider.provisioningMode,
        claimMappings: readJsonObject(provider.claimMappings),
        hasClientSecret: Boolean((0, security_1.decryptStudioSecret)(provider.clientSecretCiphertext)),
    };
}
async function listStudioUsers(tenantId) {
    await ensureTenantBootstrap(tenantId);
    const users = await prisma.studioUser.findMany({
        where: { tenantId },
        orderBy: [{ status: "asc" }, { displayName: "asc" }],
        include: {
            account: true,
            roles: {
                include: {
                    role: true,
                },
            },
        },
    });
    return users.map((user) => mapUserSummary({
        ...user,
        roles: user.roles.map((membership) => ({
            ...membership,
            role: {
                ...membership.role,
                permissions: [],
            },
        })),
    }));
}
async function listStudioRoles(tenantId) {
    await ensureTenantBootstrap(tenantId);
    const roles = await prisma.studioRole.findMany({
        where: { tenantId },
        include: {
            permissions: true,
            _count: {
                select: {
                    users: true,
                },
            },
        },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return roles.map((role) => mapRoleSummary(role));
}
async function ensureRolesByKeys(tenantId, roleKeys) {
    const roles = await prisma.studioRole.findMany({
        where: {
            tenantId,
            key: {
                in: roleKeys,
            },
        },
    });
    if (roles.length !== roleKeys.length) {
        throw new Error("role_not_found");
    }
    return roles;
}
async function setUserRoles(userId, roles) {
    for (const role of roles) {
        await prisma.studioUserRole.upsert({
            where: {
                studioUserId_studioRoleId: {
                    studioUserId: userId,
                    studioRoleId: role.id,
                },
            },
            update: {},
            create: {
                studioUserId: userId,
                studioRoleId: role.id,
            },
        });
    }
}
async function inviteStudioUser(tenantId, actorUserId, input) {
    await ensureTenantBootstrap(tenantId);
    const email = input.email.trim().toLowerCase();
    if (!email) {
        throw new Error("email_required");
    }
    const roleKeys = input.roleKeys?.length ? input.roleKeys : ["editor"];
    const roles = await ensureRolesByKeys(tenantId, roleKeys);
    const account = await ensureStudioAccountByEmail({
        email,
        displayName: input.displayName?.trim() || email,
        status: "invited",
    });
    const user = await prisma.studioUser.upsert({
        where: {
            tenantId_email: {
                tenantId,
                email,
            },
        },
        update: {
            accountId: account.id,
            displayName: input.displayName?.trim() || email,
            status: "invited",
        },
        create: {
            tenantId,
            accountId: account.id,
            email,
            displayName: input.displayName?.trim() || email,
            status: "invited",
        },
    });
    await setUserRoles(user.id, roles);
    await prisma.studioInvitation.updateMany({
        where: {
            tenantId,
            email,
            status: "pending",
        },
        data: {
            status: "revoked",
        },
    });
    const invitation = await prisma.studioInvitation.create({
        data: {
            tenantId,
            studioUserId: user.id,
            email,
            displayName: input.displayName?.trim() || null,
            status: "pending",
            tokenHash: (0, security_1.hashStudioToken)((0, security_1.generateStudioToken)()),
            createdByUserId: actorUserId ?? undefined,
        },
    });
    if ((0, email_1.isStudioEmailConfigured)()) {
        try {
            const activationToken = await issueStudioAccountToken({
                accountId: account.id,
                kind: "activation",
            });
            await sendStudioAccountActionEmail({
                email,
                displayName: input.displayName?.trim() || null,
                kind: "activation",
                token: activationToken,
            });
        }
        catch {
            // Best effort: access can still be activated later from the login screen.
        }
    }
    return {
        id: invitation.id,
        email: invitation.email,
        displayName: invitation.displayName,
        status: invitation.status,
        acceptedAt: invitation.acceptedAt,
        createdAt: invitation.createdAt,
        updatedAt: invitation.updatedAt,
        userId: user.id,
    };
}
async function updateStudioUser(tenantId, userId, input) {
    await ensureTenantBootstrap(tenantId);
    const existing = await prisma.studioUser.findFirst({
        where: {
            tenantId,
            id: userId,
        },
    });
    if (!existing) {
        return null;
    }
    await prisma.studioUser.update({
        where: { id: userId },
        data: {
            displayName: input.displayName?.trim() || undefined,
            status: input.status,
        },
    });
    const user = await prisma.studioUser.findFirst({
        where: { tenantId, id: userId },
        include: {
            account: true,
            roles: {
                include: {
                    role: true,
                },
            },
        },
    });
    if (!user) {
        return null;
    }
    return mapUserSummary({
        ...user,
        roles: user.roles.map((membership) => ({
            ...membership,
            role: {
                ...membership.role,
                permissions: [],
            },
        })),
    });
}
async function assignStudioRoleToUser(tenantId, userId, roleId) {
    await ensureTenantBootstrap(tenantId);
    const [user, role] = await Promise.all([
        prisma.studioUser.findFirst({ where: { id: userId, tenantId } }),
        prisma.studioRole.findFirst({ where: { id: roleId, tenantId } }),
    ]);
    if (!user || !role) {
        throw new Error("user_or_role_not_found");
    }
    await prisma.studioUserRole.upsert({
        where: {
            studioUserId_studioRoleId: {
                studioUserId: user.id,
                studioRoleId: role.id,
            },
        },
        update: {},
        create: {
            studioUserId: user.id,
            studioRoleId: role.id,
        },
    });
}
async function removeStudioRoleFromUser(tenantId, userId, roleId) {
    await ensureTenantBootstrap(tenantId);
    const [user, role] = await Promise.all([
        prisma.studioUser.findFirst({ where: { id: userId, tenantId } }),
        prisma.studioRole.findFirst({ where: { id: roleId, tenantId } }),
    ]);
    if (!user || !role) {
        throw new Error("user_or_role_not_found");
    }
    await prisma.studioUserRole.deleteMany({
        where: {
            studioUserId: user.id,
            studioRoleId: role.id,
        },
    });
}
async function ensureUniqueRoleKey(tenantId, baseValue) {
    const base = (0, security_1.normalizeRoleKey)(baseValue) || "custom_role";
    let candidate = base;
    let suffix = 1;
    for (;;) {
        const existing = await prisma.studioRole.findFirst({
            where: {
                tenantId,
                key: candidate,
            },
            select: { id: true },
        });
        if (!existing) {
            return candidate;
        }
        suffix += 1;
        candidate = `${base}_${suffix}`;
    }
}
async function createStudioRole(tenantId, input) {
    await ensureTenantBootstrap(tenantId);
    const cloned = input.cloneFromRoleId
        ? await prisma.studioRole.findFirst({
            where: {
                tenantId,
                id: input.cloneFromRoleId,
            },
            include: {
                permissions: true,
            },
        })
        : null;
    const permissions = input.permissions.length > 0
        ? input.permissions
        : cloned?.permissions.map((permission) => permission.permission) ?? [];
    const role = await prisma.studioRole.create({
        data: {
            tenantId,
            key: await ensureUniqueRoleKey(tenantId, input.key?.trim() || input.name),
            name: input.name.trim(),
            description: input.description?.trim() || cloned?.description || null,
            isSystem: false,
            permissions: {
                create: permissions.map((permission) => ({
                    permission,
                })),
            },
        },
        include: {
            permissions: true,
            _count: {
                select: {
                    users: true,
                },
            },
        },
    });
    return mapRoleSummary(role);
}
async function updateStudioRole(tenantId, roleId, input) {
    await ensureTenantBootstrap(tenantId);
    const role = await prisma.studioRole.findFirst({
        where: { tenantId, id: roleId },
        include: {
            permissions: true,
            _count: {
                select: {
                    users: true,
                },
            },
        },
    });
    if (!role) {
        return null;
    }
    if (role.isSystem) {
        throw new Error("system_role_locked");
    }
    await prisma.studioRole.update({
        where: { id: role.id },
        data: {
            name: input.name?.trim() || undefined,
            description: input.description?.trim() || undefined,
        },
    });
    if (input.permissions) {
        await prisma.studioRolePermission.deleteMany({
            where: { roleId: role.id },
        });
        if (input.permissions.length > 0) {
            await prisma.studioRolePermission.createMany({
                data: input.permissions.map((permission) => ({
                    roleId: role.id,
                    permission,
                })),
                skipDuplicates: true,
            });
        }
    }
    const updated = await prisma.studioRole.findFirst({
        where: { id: role.id },
        include: {
            permissions: true,
            _count: {
                select: {
                    users: true,
                },
            },
        },
    });
    return updated ? mapRoleSummary(updated) : null;
}
function extractMappedRoleKeys(claimMappings, claims) {
    const groupsClaim = readClaimValue(claims, claimMappings.groups, ["groups", "roles"]);
    const groups = new Set(toStringArray(groupsClaim));
    const roleMappings = Array.isArray(claimMappings.roleMappings)
        ? claimMappings.roleMappings
        : [];
    const result = new Set();
    for (const item of roleMappings) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
        }
        const record = item;
        const claimValue = typeof record.claimValue === "string" ? record.claimValue.trim() : "";
        const roleKey = typeof record.roleKey === "string" ? record.roleKey.trim() : "";
        if (claimValue && roleKey && groups.has(claimValue)) {
            result.add(roleKey);
        }
    }
    return Array.from(result);
}
async function loadFullUser(tenantId, userId) {
    return prisma.studioUser.findFirst({
        where: {
            tenantId,
            id: userId,
        },
        include: {
            account: true,
            roles: {
                include: {
                    role: {
                        include: {
                            permissions: true,
                        },
                    },
                },
            },
        },
    });
}
async function applyMappedRoles(tenantId, userId, roleKeys) {
    if (roleKeys.length === 0) {
        return;
    }
    const roles = await prisma.studioRole.findMany({
        where: {
            tenantId,
            key: {
                in: roleKeys,
            },
        },
    });
    await setUserRoles(userId, roles);
}
async function completeLocalAccountLogin(params) {
    const lastLoginAt = new Date();
    await prisma.$transaction(async (tx) => {
        await tx.studioAccount.update({
            where: { id: params.account.id },
            data: {
                status: "active",
                lastWorkspaceId: params.membership.tenantId,
                emailVerifiedAt: params.account.emailVerifiedAt ?? lastLoginAt,
                displayName: params.account.displayName || params.membership.displayName,
                avatarUrl: params.account.avatarUrl || params.membership.avatarUrl,
            },
        });
        await tx.studioUser.updateMany({
            where: {
                accountId: params.account.id,
                status: "invited",
            },
            data: {
                status: "active",
            },
        });
        await tx.studioUser.update({
            where: { id: params.membership.id },
            data: {
                lastLoginAt,
                status: "active",
            },
        });
        await tx.studioInvitation.updateMany({
            where: {
                email: params.account.email,
                status: "pending",
            },
            data: {
                status: "accepted",
                acceptedAt: lastLoginAt,
            },
        });
    });
    const hydratedUser = await loadFullUser(params.membership.tenantId, params.membership.id);
    if (!hydratedUser) {
        throw new Error("user_not_found");
    }
    await ensureTenantBootstrap(params.membership.tenantId);
    const sessionToken = await createStudioUserSession(params.membership.tenantId, params.membership.id, params.authMode);
    return {
        sessionToken,
        session: await buildHumanSession(hydratedUser, params.authMode),
    };
}
function mapLoginOptions(account, email) {
    if (!account) {
        return {
            email,
            account: null,
            accountState: "no_access",
            canUsePassword: false,
            canUseGoogle: false,
            googleClientId: null,
            needsActivation: false,
            localWorkspaces: [],
            ssoWorkspaces: [],
            recommendedWorkspaceId: null,
            requestAccessUrl: getStudioRequestAccessUrl(),
        };
    }
    const memberships = splitMembershipsByAccess(account);
    const localWorkspaces = memberships.local.map((membership) => toWorkspaceSummary(account, membership));
    const ssoWorkspaces = memberships.sso.map((membership) => toWorkspaceSummary(account, membership));
    const recommendedWorkspaceId = resolveRecommendedWorkspaceId(account, memberships.local);
    const googleClientId = (0, google_1.getStudioGoogleClientId)();
    const hasLocalAccess = memberships.local.length > 0;
    const accountState = account.status === "suspended"
        ? "suspended"
        : memberships.local.length + memberships.sso.length === 0
            ? "no_access"
            : account.status;
    return {
        email,
        account: {
            id: account.id,
            email: account.email,
            displayName: account.displayName,
            avatarUrl: account.avatarUrl,
            status: account.status,
            lastWorkspaceId: account.lastWorkspaceId,
            emailVerifiedAt: account.emailVerifiedAt,
        },
        accountState,
        canUsePassword: accountState === "active" && Boolean(account.passwordHash) && hasLocalAccess,
        canUseGoogle: accountState !== "suspended" && accountState !== "no_access" && Boolean(googleClientId) && hasLocalAccess,
        googleClientId,
        needsActivation: accountState === "invited" && hasLocalAccess,
        localWorkspaces,
        ssoWorkspaces,
        recommendedWorkspaceId,
        requestAccessUrl: getStudioRequestAccessUrl(),
    };
}
async function getStudioLoginOptions(email) {
    const normalizedEmail = normalizeStudioEmail(email);
    if (!normalizedEmail) {
        throw new Error("email_required");
    }
    const account = await getStudioAccountByEmail(normalizedEmail);
    return mapLoginOptions(account, normalizedEmail);
}
async function loginStudioAccountWithPassword(input) {
    const email = normalizeStudioEmail(input.email);
    if (!email) {
        throw new Error("email_required");
    }
    if (!input.password?.trim()) {
        throw new Error("password_required");
    }
    const account = await getStudioAccountByEmail(email);
    if (!account) {
        throw new Error("user_not_authorized");
    }
    if (account.status === "suspended") {
        throw new Error("user_suspended");
    }
    if (!account.passwordHash) {
        throw new Error(account.status === "invited" ? "activation_required" : "password_login_not_available");
    }
    const validPassword = await (0, passwords_1.verifyStudioPassword)(input.password, account.passwordHash);
    if (!validPassword) {
        throw new Error("invalid_credentials");
    }
    const memberships = splitMembershipsByAccess(account);
    const membership = resolveTargetMembership(account, memberships.local, input.workspaceId);
    return completeLocalAccountLogin({
        account,
        membership,
        authMode: "password",
    });
}
async function loginStudioAccountWithGoogle(input) {
    const identity = await (0, google_1.verifyStudioGoogleCredential)(input.credential);
    const account = (await getStudioAccountByGoogleSubject(identity.sub)) ??
        (await getStudioAccountByEmail(identity.email));
    if (!account) {
        throw new Error("user_not_authorized");
    }
    if (account.status === "suspended") {
        throw new Error("user_suspended");
    }
    if (!identity.emailVerified) {
        throw new Error("google_email_not_verified");
    }
    if (account.googleSubject && account.googleSubject !== identity.sub) {
        throw new Error("google_subject_mismatch");
    }
    await prisma.studioAccount.update({
        where: { id: account.id },
        data: {
            googleSubject: identity.sub,
            displayName: identity.name || account.displayName || undefined,
            avatarUrl: identity.picture || account.avatarUrl || undefined,
            emailVerifiedAt: account.emailVerifiedAt ?? new Date(),
            status: "active",
        },
    });
    const refreshedAccount = await getStudioAccountByEmail(account.email);
    if (!refreshedAccount) {
        throw new Error("account_not_found");
    }
    const memberships = splitMembershipsByAccess(refreshedAccount);
    const membership = resolveTargetMembership(refreshedAccount, memberships.local, input.workspaceId);
    return completeLocalAccountLogin({
        account: refreshedAccount,
        membership,
        authMode: "google",
    });
}
function roleFromKeys(roleKeys) {
    if (roleKeys.includes("admin") || roleKeys.includes("owner")) {
        return "admin";
    }
    if (roleKeys.some((key) => ["editor", "reviewer", "publisher", "analyst"].includes(key))) {
        return "editor";
    }
    return "viewer";
}
async function completeGlobalAccountLogin(params) {
    const memberships = splitMembershipsByAccess(params.account).local;
    if (memberships.length === 0) {
        throw new Error("user_not_authorized");
    }
    const lastLoginAt = new Date();
    const primaryMembership = memberships[0];
    await prisma.$transaction(async (tx) => {
        await tx.studioAccount.update({
            where: { id: params.account.id },
            data: {
                status: "active",
                lastWorkspaceId: primaryMembership.tenantId,
                emailVerifiedAt: params.account.emailVerifiedAt ?? lastLoginAt,
                displayName: params.account.displayName || primaryMembership.displayName,
                avatarUrl: params.account.avatarUrl || primaryMembership.avatarUrl,
            },
        });
        await tx.studioUser.updateMany({
            where: {
                accountId: params.account.id,
                status: "invited",
            },
            data: {
                status: "active",
            },
        });
    });
    const sites = [];
    const sessions = [];
    for (const membership of memberships) {
        await ensureTenantBootstrap(membership.tenantId);
        const user = await loadFullUser(membership.tenantId, membership.id);
        if (!user) {
            continue;
        }
        const roleKeys = buildRoleKeyList(user);
        const permissions = buildPermissionList(user);
        const role = roleFromKeys(roleKeys);
        const tenantSites = await prisma.site.findMany({
            where: { tenantId: membership.tenantId },
            orderBy: { key: "asc" },
        });
        for (const site of tenantSites) {
            sites.push({
                id: site.id,
                key: site.key,
                name: site.name,
                type: site.type,
                baseUrl: site.baseUrl,
                tenantId: membership.tenantId,
                role,
                permissions,
            });
        }
        const sessionToken = await createStudioUserSession(membership.tenantId, membership.id, params.authMode);
        sessions.push({
            tenantId: membership.tenantId,
            studioUserId: membership.id,
            sessionToken,
            permissions,
        });
    }
    if (sites.length === 0) {
        throw new Error("user_not_authorized");
    }
    const preferredTenant = params.account.lastWorkspaceId || primaryMembership.tenantId;
    const activeSite = sites.find((site) => site.tenantId === preferredTenant) ?? sites[0];
    return {
        user: {
            id: params.account.id,
            email: params.account.email,
            displayName: params.account.displayName || primaryMembership.displayName || params.account.email,
            avatarUrl: params.account.avatarUrl || primaryMembership.avatarUrl || null,
        },
        sites,
        sessions,
        activeSiteId: activeSite.id,
    };
}
async function loginStudioAccountWithPasswordGlobal(input) {
    const email = normalizeStudioEmail(input.email);
    if (!email) {
        throw new Error("email_required");
    }
    if (!input.password?.trim()) {
        throw new Error("password_required");
    }
    const account = await getStudioAccountByEmail(email);
    if (!account) {
        throw new Error("user_not_authorized");
    }
    if (account.status === "suspended") {
        throw new Error("user_suspended");
    }
    if (!account.passwordHash) {
        throw new Error(account.status === "invited" ? "activation_required" : "password_login_not_available");
    }
    const validPassword = await (0, passwords_1.verifyStudioPassword)(input.password, account.passwordHash);
    if (!validPassword) {
        throw new Error("invalid_credentials");
    }
    return completeGlobalAccountLogin({ account, authMode: "password" });
}
async function loginStudioAccountWithGoogleGlobal(input) {
    const identity = await (0, google_1.verifyStudioGoogleCredential)(input.credential);
    const account = (await getStudioAccountByGoogleSubject(identity.sub)) ??
        (await getStudioAccountByEmail(identity.email));
    if (!account) {
        throw new Error("user_not_authorized");
    }
    if (account.status === "suspended") {
        throw new Error("user_suspended");
    }
    if (!identity.emailVerified) {
        throw new Error("google_email_not_verified");
    }
    if (account.googleSubject && account.googleSubject !== identity.sub) {
        throw new Error("google_subject_mismatch");
    }
    await prisma.studioAccount.update({
        where: { id: account.id },
        data: {
            googleSubject: identity.sub,
            displayName: identity.name || account.displayName || undefined,
            avatarUrl: identity.picture || account.avatarUrl || undefined,
            emailVerifiedAt: account.emailVerifiedAt ?? new Date(),
            status: "active",
        },
    });
    const refreshed = await getStudioAccountByEmail(account.email);
    if (!refreshed) {
        throw new Error("account_not_found");
    }
    return completeGlobalAccountLogin({ account: refreshed, authMode: "google" });
}
async function sendStudioPasswordReset(email) {
    const normalizedEmail = normalizeStudioEmail(email);
    if (!normalizedEmail) {
        throw new Error("email_required");
    }
    const account = await getStudioAccountByEmail(normalizedEmail);
    if (!account || account.status === "suspended") {
        return { ok: true };
    }
    const token = await issueStudioAccountToken({
        accountId: account.id,
        kind: account.status === "invited" || !account.passwordHash ? "activation" : "password_reset",
    });
    await sendStudioAccountActionEmail({
        email: account.email,
        displayName: account.displayName,
        kind: account.status === "invited" || !account.passwordHash ? "activation" : "password_reset",
        token,
    });
    return { ok: true };
}
async function consumeStudioAccountToken(params) {
    const tokenHash = (0, security_1.hashStudioToken)(String(params.token || "").trim());
    const record = await prisma.studioAccountToken.findUnique({
        where: { tokenHash },
        include: {
            account: {
                include: {
                    users: {
                        where: {
                            status: {
                                in: ["active", "invited", "suspended"],
                            },
                        },
                        include: {
                            tenant: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                    status: true,
                                    studioIdentityProvider: {
                                        select: {
                                            enabled: true,
                                            issuer: true,
                                            provisioningMode: true,
                                        },
                                    },
                                },
                            },
                        },
                        orderBy: [{ lastLoginAt: "desc" }, { updatedAt: "desc" }],
                    },
                },
            },
        },
    });
    if (!record || record.kind !== params.kind) {
        throw new Error(params.kind === "activation" ? "invite_invalid" : "reset_invalid");
    }
    if (record.consumedAt) {
        throw new Error(params.kind === "activation" ? "invite_consumed" : "reset_consumed");
    }
    if (record.expiresAt.getTime() <= Date.now()) {
        throw new Error(params.kind === "activation" ? "invite_expired" : "reset_expired");
    }
    if (record.account.status === "suspended") {
        throw new Error("user_suspended");
    }
    const consumedAt = new Date();
    const updated = await prisma.studioAccountToken.updateMany({
        where: {
            id: record.id,
            consumedAt: null,
            expiresAt: { gt: consumedAt },
        },
        data: {
            consumedAt,
        },
    });
    if (updated.count !== 1) {
        throw new Error(params.kind === "activation" ? "invite_consumed" : "reset_consumed");
    }
    return record.account;
}
async function acceptStudioInvitation(input) {
    if (!input.password?.trim()) {
        throw new Error("password_required");
    }
    const account = await consumeStudioAccountToken({
        token: input.token,
        kind: "activation",
    });
    const memberships = splitMembershipsByAccess(account);
    const membership = resolveTargetMembership(account, memberships.local, input.workspaceId ?? null);
    const passwordHash = await (0, passwords_1.hashStudioPassword)(input.password);
    await prisma.studioAccount.update({
        where: { id: account.id },
        data: {
            passwordHash,
            status: "active",
            emailVerifiedAt: new Date(),
        },
    });
    return loginStudioAccountWithPassword({
        email: account.email,
        password: input.password,
        workspaceId: membership.tenantId,
    });
}
async function resetStudioPassword(input) {
    if (!input.password?.trim()) {
        throw new Error("password_required");
    }
    const account = await consumeStudioAccountToken({
        token: input.token,
        kind: "password_reset",
    });
    const passwordHash = await (0, passwords_1.hashStudioPassword)(input.password);
    await prisma.studioAccount.update({
        where: { id: account.id },
        data: {
            passwordHash,
            status: account.status === "suspended" ? "suspended" : "active",
        },
    });
    return { ok: true };
}
async function completeStudioSsoLogin(params) {
    const tenant = await resolveTenantBySlug(params.slug);
    if (!tenant) {
        throw new Error("workspace_not_found");
    }
    await ensureTenantBootstrap(tenant.id);
    const provider = await prisma.studioIdentityProvider.findUnique({
        where: { tenantId: tenant.id },
    });
    if (!provider?.enabled) {
        throw new Error("identity_provider_not_configured");
    }
    const claimMappings = readClaimMappingObject(provider.claimMappings);
    const emailValue = readClaimValue(params.claims, claimMappings.email, [
        "email",
        "preferred_username",
        "upn",
    ]);
    const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
    if (!email) {
        throw new Error("oidc_email_missing");
    }
    const displayNameValue = readClaimValue(params.claims, claimMappings.name, [
        "name",
        "preferred_username",
        "email",
    ]);
    const displayName = typeof displayNameValue === "string" && displayNameValue.trim()
        ? displayNameValue.trim()
        : email;
    const avatarValue = readClaimValue(params.claims, claimMappings.avatar, [
        "picture",
        "avatar_url",
    ]);
    const avatarUrl = typeof avatarValue === "string" && avatarValue.trim() ? avatarValue.trim() : null;
    const account = await ensureStudioAccountByEmail({
        email,
        displayName,
        avatarUrl,
        status: "active",
        emailVerifiedAt: new Date(),
    });
    const invitation = await prisma.studioInvitation.findFirst({
        where: {
            tenantId: tenant.id,
            email,
            status: "pending",
        },
        orderBy: {
            createdAt: "desc",
        },
    });
    let user = (await prisma.studioUser.findFirst({
        where: {
            tenantId: tenant.id,
            OR: [
                {
                    oidcIssuer: params.issuer,
                    oidcSubject: params.subject,
                },
                {
                    email,
                },
            ],
        },
    })) ?? null;
    if (!user) {
        if (provider.provisioningMode === "invite_only" && !invitation) {
            throw new Error("user_not_invited");
        }
        user = await prisma.studioUser.create({
            data: {
                tenantId: tenant.id,
                accountId: account.id,
                email,
                displayName,
                avatarUrl,
                status: "active",
                oidcIssuer: params.issuer,
                oidcSubject: params.subject,
                lastLoginAt: new Date(),
            },
        });
    }
    else {
        if (user.status === "suspended") {
            throw new Error("user_suspended");
        }
        user = await prisma.studioUser.update({
            where: { id: user.id },
            data: {
                accountId: account.id,
                email,
                displayName,
                avatarUrl,
                status: "active",
                oidcIssuer: params.issuer,
                oidcSubject: params.subject,
                lastLoginAt: new Date(),
            },
        });
    }
    if (invitation) {
        await prisma.studioInvitation.update({
            where: { id: invitation.id },
            data: {
                studioUserId: user.id,
                status: "accepted",
                acceptedAt: new Date(),
            },
        });
    }
    else if (provider.provisioningMode === "invite_only") {
        const existingAcceptedUser = await prisma.studioUser.findFirst({
            where: {
                tenantId: tenant.id,
                id: user.id,
            },
            include: {
                roles: true,
            },
        });
        if (!existingAcceptedUser) {
            throw new Error("user_not_invited");
        }
    }
    const mappedRoleKeys = extractMappedRoleKeys(claimMappings, params.claims);
    await applyMappedRoles(tenant.id, user.id, mappedRoleKeys);
    const currentUser = await loadFullUser(tenant.id, user.id);
    if (!currentUser) {
        throw new Error("user_not_found");
    }
    if (currentUser.roles.length === 0) {
        const editorRole = await prisma.studioRole.findFirst({
            where: {
                tenantId: tenant.id,
                key: "editor",
            },
        });
        if (editorRole) {
            await setUserRoles(currentUser.id, [editorRole]);
        }
    }
    const hydratedUser = await loadFullUser(tenant.id, user.id);
    if (!hydratedUser) {
        throw new Error("user_not_found");
    }
    const sessionToken = await createStudioUserSession(tenant.id, hydratedUser.id, "oidc");
    await prisma.studioAccount.update({
        where: { id: account.id },
        data: {
            lastWorkspaceId: tenant.id,
            status: "active",
            emailVerifiedAt: new Date(),
            displayName,
            avatarUrl,
        },
    });
    return {
        sessionToken,
        session: await buildHumanSession(hydratedUser, "oidc"),
    };
}
async function resolveLaunchUser(tenantId, email) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.studioUser.findFirst({
        where: {
            tenantId,
            email: normalizedEmail,
        },
        include: {
            account: true,
            roles: {
                include: {
                    role: {
                        include: {
                            permissions: true,
                        },
                    },
                },
            },
        },
    });
    if (user) {
        if (user.status === "suspended") {
            throw new Error("user_suspended");
        }
        return user;
    }
    const invitation = await prisma.studioInvitation.findFirst({
        where: {
            tenantId,
            email: normalizedEmail,
            status: "pending",
        },
        orderBy: {
            createdAt: "desc",
        },
    });
    if (invitation?.studioUserId) {
        const invitedUser = await loadFullUser(tenantId, invitation.studioUserId);
        if (!invitedUser) {
            throw new Error("interactive_login_required");
        }
        if (invitedUser.status === "suspended") {
            throw new Error("user_suspended");
        }
        return invitedUser;
    }
    if (invitation) {
        throw new Error("interactive_login_required");
    }
    throw new Error("user_not_authorized");
}
async function createStudioLaunchTicket(params) {
    const tenant = await resolveTenantBySlug(params.slug);
    if (!tenant) {
        throw new Error("workspace_not_found");
    }
    const allowedWorkspaces = getFirstPartyLaunchWorkspaceSet();
    if (!allowedWorkspaces.has(tenant.slug)) {
        throw new Error("workspace_launch_not_allowed");
    }
    const user = await resolveLaunchUser(tenant.id, params.email);
    const launchId = (0, security_1.generateStudioToken)();
    const jti = (0, security_1.generateStudioToken)();
    const returnTo = resolveStudioReturnTo(params.returnTo);
    await prisma.studioLaunchTicket.create({
        data: {
            tenantId: tenant.id,
            studioUserId: user.id,
            tokenHash: (0, security_1.hashStudioToken)(launchId),
            jti,
            requestedEmail: params.email.trim().toLowerCase(),
            requestedDisplayName: params.displayName?.trim() || null,
            sourceApp: params.sourceApp.trim(),
            returnTo,
            expiresAt: new Date(Date.now() + 60 * 1000),
        },
    });
    return {
        launchId,
        tenantSlug: tenant.slug,
        returnTo,
    };
}
async function redeemStudioLaunchTicket(launchId) {
    const tokenHash = (0, security_1.hashStudioToken)(launchId.trim());
    const record = await prisma.studioLaunchTicket.findUnique({
        where: { tokenHash },
        include: {
            tenant: {
                select: {
                    slug: true,
                },
            },
            user: {
                include: {
                    account: true,
                    roles: {
                        include: {
                            role: {
                                include: {
                                    permissions: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!record) {
        throw new Error("launch_invalid");
    }
    if (record.consumedAt) {
        throw new Error("launch_consumed");
    }
    if (record.expiresAt.getTime() <= Date.now()) {
        throw new Error("launch_expired");
    }
    if (record.user.status === "suspended") {
        throw new Error("user_suspended");
    }
    const consumedAt = new Date();
    const lastLoginAt = new Date();
    const sessionToken = (0, security_1.generateStudioToken)();
    const consumed = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.studioLaunchTicket.updateMany({
            where: {
                id: record.id,
                consumedAt: null,
                expiresAt: {
                    gt: consumedAt,
                },
            },
            data: {
                consumedAt,
            },
        });
        if (updateResult.count !== 1) {
            return false;
        }
        await tx.studioUser.update({
            where: { id: record.user.id },
            data: {
                lastLoginAt,
            },
        });
        if (record.user.accountId) {
            await tx.studioAccount.update({
                where: { id: record.user.accountId },
                data: {
                    lastWorkspaceId: record.tenantId,
                    status: "active",
                    emailVerifiedAt: record.user.account.emailVerifiedAt ?? lastLoginAt,
                },
            });
        }
        await tx.studioUserSession.create({
            data: {
                tenantId: record.tenantId,
                studioUserId: record.user.id,
                authMode: "launch",
                tokenHash: (0, security_1.hashStudioToken)(sessionToken),
                expiresAt: new Date(Date.now() + STUDIO_SESSION_TTL_MS),
                lastSeenAt: lastLoginAt,
            },
        });
        return true;
    });
    if (!consumed) {
        throw new Error("launch_consumed");
    }
    const hydratedUser = await loadFullUser(record.tenantId, record.user.id);
    if (!hydratedUser) {
        throw new Error("user_not_found");
    }
    await ensureTenantBootstrap(record.tenantId);
    return {
        sessionToken,
        session: await buildHumanSession(hydratedUser, "launch"),
        tenantSlug: record.tenant.slug || record.tenantId,
        returnTo: resolveStudioReturnTo(record.returnTo),
    };
}
async function getStudioSessionByToken(sessionToken) {
    const tokenHash = (0, security_1.hashStudioToken)(sessionToken);
    const record = await prisma.studioUserSession.findUnique({
        where: { tokenHash },
        include: {
            user: {
                include: {
                    account: true,
                    roles: {
                        include: {
                            role: {
                                include: {
                                    permissions: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
        return null;
    }
    if (record.user.status === "suspended") {
        return null;
    }
    await prisma.studioUserSession.update({
        where: { id: record.id },
        data: {
            lastSeenAt: new Date(),
        },
    });
    const session = await buildHumanSession(record.user, record.authMode);
    return {
        sessionId: record.id,
        tenantId: record.tenantId,
        userId: record.user.id,
        permissions: session.permissions,
        session,
    };
}
async function getStudioSessionBySessionId(sessionId) {
    const record = await prisma.studioUserSession.findFirst({
        where: {
            id: sessionId,
            revokedAt: null,
            expiresAt: {
                gt: new Date(),
            },
        },
        include: {
            user: {
                include: {
                    account: true,
                    roles: {
                        include: {
                            role: {
                                include: {
                                    permissions: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!record || record.user.status === "suspended") {
        return null;
    }
    return buildHumanSession(record.user, record.authMode);
}
async function revokeStudioSessionByToken(sessionToken) {
    await prisma.studioUserSession.updateMany({
        where: {
            tokenHash: (0, security_1.hashStudioToken)(sessionToken),
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        },
    });
}
