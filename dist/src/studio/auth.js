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
exports.completeStudioSsoLogin = completeStudioSsoLogin;
exports.getStudioSessionByToken = getStudioSessionByToken;
exports.getStudioSessionBySessionId = getStudioSessionBySessionId;
exports.revokeStudioSessionByToken = revokeStudioSessionByToken;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/db/prisma");
const security_1 = require("./security");
const prompts_1 = require("./prompts");
const prisma = (0, prisma_1.getPrismaClient)();
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
async function buildHumanSession(user) {
    const tenant = await ensureTenantBootstrap(user.tenantId);
    const provider = await prisma.studioIdentityProvider.findUnique({
        where: { tenantId: user.tenantId },
        select: {
            enabled: true,
            issuer: true,
            provisioningMode: true,
        },
    });
    const counts = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: {
            _count: {
                select: {
                    sites: true,
                    contentProjects: true,
                },
            },
        },
    });
    return {
        tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
        },
        authMode: "oidc",
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
        identityProvider: provider
            ? {
                enabled: provider.enabled,
                issuer: provider.issuer,
                provisioningMode: provider.provisioningMode,
            }
            : null,
        siteCount: counts?._count.sites ?? 0,
        projectCount: counts?._count.contentProjects ?? 0,
    };
}
async function buildApiKeyStudioSession(tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
    });
    if (!tenant) {
        return null;
    }
    const bootstrappedTenant = await ensureTenantBootstrap(tenantId);
    const counts = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
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
    return {
        tenant: {
            id: bootstrappedTenant.id,
            name: bootstrappedTenant.name,
            slug: bootstrappedTenant.slug,
            status: bootstrappedTenant.status,
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
        identityProvider: counts?.studioIdentityProvider
            ? {
                enabled: counts.studioIdentityProvider.enabled,
                issuer: counts.studioIdentityProvider.issuer,
                provisioningMode: counts.studioIdentityProvider.provisioningMode,
            }
            : null,
        siteCount: counts?._count.sites ?? 0,
        projectCount: counts?._count.contentProjects ?? 0,
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
    const user = await prisma.studioUser.upsert({
        where: {
            tenantId_email: {
                tenantId,
                email,
            },
        },
        update: {
            displayName: input.displayName?.trim() || email,
            status: "invited",
        },
        create: {
            tenantId,
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
    const sessionToken = (0, security_1.generateStudioToken)();
    await prisma.studioUserSession.create({
        data: {
            tenantId: tenant.id,
            studioUserId: hydratedUser.id,
            tokenHash: (0, security_1.hashStudioToken)(sessionToken),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 12),
            lastSeenAt: new Date(),
        },
    });
    return {
        sessionToken,
        session: await buildHumanSession(hydratedUser),
    };
}
async function getStudioSessionByToken(sessionToken) {
    const tokenHash = (0, security_1.hashStudioToken)(sessionToken);
    const record = await prisma.studioUserSession.findUnique({
        where: { tokenHash },
        include: {
            user: {
                include: {
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
    const session = await buildHumanSession(record.user);
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
    return buildHumanSession(record.user);
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
