"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignmentKeyForSite = assignmentKeyForSite;
exports.getDefaultPromptSeedDefinitions = getDefaultPromptSeedDefinitions;
exports.ensureTenantPromptLibrarySeeded = ensureTenantPromptLibrarySeeded;
exports.renderPromptTemplate = renderPromptTemplate;
exports.resolveTextPrompt = resolveTextPrompt;
exports.resolveImagePrompt = resolveImagePrompt;
exports.listStudioPromptPresets = listStudioPromptPresets;
exports.getStudioPromptPresetDetail = getStudioPromptPresetDetail;
exports.createStudioPromptPreset = createStudioPromptPreset;
exports.createStudioPromptVersion = createStudioPromptVersion;
exports.updateStudioPromptVersion = updateStudioPromptVersion;
exports.approveStudioPromptVersion = approveStudioPromptVersion;
exports.assignStudioPromptVersion = assignStudioPromptVersion;
const client_1 = require("@prisma/client");
const prompt_1 = require("../application/services/prompt");
const DEFAULT_PROMPT_DEFINITIONS = [
    {
        key: "text-seo-default",
        name: "SEO Article Prompt",
        surface: "text_seo",
        scope: "global",
        description: "Prompt base para generación de artículos SEO listos para revisión editorial.",
        systemTemplate: "You are a senior SEO and editorial writer. Respond in {{languageLabel}}.",
        userTemplate: [
            "Topic: {{topicTitle}}",
            "{{topicDescriptionLine}}",
            "Facts:",
            "{{factsBlock}}",
            "{{siteNameLine}}",
            "Editorial goal: {{goal}}",
            "{{toneLine}}",
            "{{lengthLine}}",
            "{{targetAudienceLine}}",
            "{{brandVoiceLine}}",
            "{{seoRulesLine}}",
            "{{metadataLine}}",
            "{{revisionFeedbackLine}}",
            "Write production-ready editorial content with a clear title, a compelling introduction, H2 sections, actionable detail, and a strong ending. Return clean HTML or clearly structured markdown.",
        ].join("\n"),
        variables: [
            "languageLabel",
            "topicTitle",
            "topicDescriptionLine",
            "factsBlock",
            "siteNameLine",
            "goal",
            "toneLine",
            "lengthLine",
            "targetAudienceLine",
            "brandVoiceLine",
            "seoRulesLine",
            "metadataLine",
            "revisionFeedbackLine",
        ],
        notes: "Seed v1 derivado del prompt hardcoded original del worker de texto.",
    },
    {
        key: "text-instagram-default",
        name: "Instagram Caption Prompt",
        surface: "text_instagram",
        scope: "global",
        description: "Prompt base para captions sociales ligados al circuito editorial.",
        systemTemplate: "You are a senior social media copywriter for Instagram. Respond in {{languageLabel}}.",
        userTemplate: [
            "Topic: {{topicTitle}}",
            "{{topicDescriptionLine}}",
            "Facts:",
            "{{factsBlock}}",
            "{{siteNameLine}}",
            "Editorial goal: {{goal}}",
            "{{toneLine}}",
            "{{lengthLine}}",
            "{{targetAudienceLine}}",
            "{{brandVoiceLine}}",
            "{{metadataLine}}",
            "{{revisionFeedbackLine}}",
            "{{hashtagsLine}}",
            "Write a concise caption suited for Instagram.",
        ].join("\n"),
        variables: [
            "languageLabel",
            "topicTitle",
            "topicDescriptionLine",
            "factsBlock",
            "siteNameLine",
            "goal",
            "toneLine",
            "lengthLine",
            "targetAudienceLine",
            "brandVoiceLine",
            "metadataLine",
            "revisionFeedbackLine",
            "hashtagsLine",
        ],
        notes: "Seed v1 derivado del prompt hardcoded original para social captions.",
    },
    {
        key: "image-contextual-default",
        name: "Contextual Hero Prompt",
        surface: "image_contextual",
        scope: "global",
        description: "Hero visual para piezas con contexto textual ya generado.",
        systemTemplate: null,
        userTemplate: [
            "{{basePrompt}}",
            "{{topicDescriptionLine}}",
            "{{siteNameLine}}",
            "{{goalLine}}",
            "{{styleLine}}",
            "Create a professional hero image suitable for editorial publication and social reuse.",
        ].join("\n"),
        variables: [
            "basePrompt",
            "topicDescriptionLine",
            "siteNameLine",
            "goalLine",
            "styleLine",
        ],
        notes: "Seed v1 para generación contextual de hero images.",
    },
    {
        key: "image-independent-default",
        name: "Independent Hero Prompt",
        surface: "image_independent",
        scope: "global",
        description: "Hero visual para briefs o piezas sin texto final enlazado.",
        systemTemplate: null,
        userTemplate: [
            "{{basePrompt}}",
            "{{topicDescriptionLine}}",
            "{{siteNameLine}}",
            "{{goalLine}}",
            "{{styleLine}}",
            "Create a professional hero image suitable for editorial publication and social reuse.",
        ].join("\n"),
        variables: [
            "basePrompt",
            "topicDescriptionLine",
            "siteNameLine",
            "goalLine",
            "styleLine",
        ],
        notes: "Seed v1 para generación independiente de hero images.",
    },
];
function assignmentKeyForSite(siteId) {
    return siteId?.trim() || "global";
}
function readJsonObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function toNullableJsonInput(value) {
    if (!value) {
        return client_1.Prisma.JsonNull;
    }
    return value;
}
function getDefaultPromptSeedDefinitions() {
    return DEFAULT_PROMPT_DEFINITIONS.map((definition) => ({ ...definition }));
}
async function ensureTenantPromptLibrarySeeded(prisma, tenantId) {
    for (const definition of DEFAULT_PROMPT_DEFINITIONS) {
        const preset = await prisma.studioPromptPreset.upsert({
            where: {
                tenantId_key: {
                    tenantId,
                    key: definition.key,
                },
            },
            update: {
                name: definition.name,
                surface: definition.surface,
                scope: definition.scope,
                description: definition.description,
            },
            create: {
                tenantId,
                key: definition.key,
                name: definition.name,
                surface: definition.surface,
                scope: definition.scope,
                description: definition.description,
            },
        });
        const version = await prisma.studioPromptVersion.findUnique({
            where: {
                presetId_versionNumber: {
                    presetId: preset.id,
                    versionNumber: 1,
                },
            },
        });
        const seedVersion = version ??
            (await prisma.studioPromptVersion.create({
                data: {
                    presetId: preset.id,
                    versionNumber: 1,
                    status: "approved",
                    systemTemplate: definition.systemTemplate,
                    userTemplate: definition.userTemplate,
                    variablesJson: {
                        keys: definition.variables,
                    },
                    notes: definition.notes,
                    approvedAt: new Date(),
                },
            }));
        if (version && version.status !== "approved") {
            await prisma.studioPromptVersion.update({
                where: { id: version.id },
                data: {
                    status: "approved",
                    approvedAt: version.approvedAt ?? new Date(),
                },
            });
        }
        await prisma.studioPromptAssignment.upsert({
            where: {
                tenantId_surface_assignmentKey: {
                    tenantId,
                    surface: definition.surface,
                    assignmentKey: assignmentKeyForSite(null),
                },
            },
            update: {
                presetId: preset.id,
                versionId: seedVersion.id,
            },
            create: {
                tenantId,
                surface: definition.surface,
                assignmentKey: assignmentKeyForSite(null),
                presetId: preset.id,
                versionId: seedVersion.id,
            },
        });
    }
}
function renderPromptTemplate(template, context) {
    if (!template) {
        return "";
    }
    return template
        .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => context[key] ?? "")
        .replace(/\n{3,}/g, "\n\n")
        .split("\n")
        .map((line) => line.replace(/\s+$/g, ""))
        .join("\n")
        .trim();
}
function line(label, value) {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized ? `${label}: ${normalized}` : "";
}
function jsonLine(label, value) {
    return value && typeof value === "object" ? `${label}: ${JSON.stringify(value)}` : "";
}
function buildTextContext(input) {
    const languageLabel = input.language === "es" ? "espanol" : "english";
    const factsBlock = input.facts.length > 0
        ? input.facts.map((fact) => `- ${fact}`).join("\n")
        : "- (no facts provided)";
    return {
        languageLabel,
        topicTitle: input.topicTitle.trim(),
        topicDescriptionLine: line("Description", input.topicDescription),
        factsBlock,
        siteNameLine: line("Site", input.options?.site_name),
        goal: typeof input.options?.goal === "string" && input.options.goal.trim()
            ? input.options.goal.trim()
            : "article",
        toneLine: line("Tone", input.options?.tone),
        lengthLine: line("Length", input.options?.length),
        targetAudienceLine: line("Target audience", input.options?.target_audience),
        brandVoiceLine: jsonLine("Brand voice JSON", input.options?.brand_voice),
        seoRulesLine: jsonLine("SEO rules JSON", input.options?.seo_rules),
        metadataLine: jsonLine("Structured metadata JSON", input.options?.metadata),
        revisionFeedbackLine: line("Revision feedback", input.options?.revision_feedback),
        hashtagsLine: input.type === "instagram" && input.options?.hashtags ? "Include relevant hashtags." : "",
    };
}
function buildImageContext(input) {
    return {
        basePrompt: input.mode === "contextual" && input.textOutput?.trim()
            ? input.textOutput.trim()
            : input.topicTitle.trim(),
        topicDescriptionLine: input.topicDescription?.trim() || "",
        siteNameLine: line("Brand/site", input.options?.site_name),
        goalLine: line("Editorial goal", input.options?.goal),
        styleLine: line("Style", input.options?.style),
    };
}
function fallbackTextPrompt(input) {
    const prompt = (0, prompt_1.buildTextPrompt)(input);
    return {
        surface: input.type === "instagram" ? "text_instagram" : "text_seo",
        source: "fallback",
        presetId: null,
        presetKey: input.type === "instagram" ? "text-instagram-default" : "text-seo-default",
        presetName: input.type === "instagram" ? "Instagram Caption Prompt" : "SEO Article Prompt",
        promptPresetVersionId: null,
        promptVersionLabel: String(input.options?.prompt_version || "v1"),
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.prompt,
        variables: buildTextContext(input),
    };
}
function fallbackImagePrompt(input) {
    return {
        surface: input.mode === "contextual" ? "image_contextual" : "image_independent",
        source: "fallback",
        presetId: null,
        presetKey: input.mode === "contextual" ? "image-contextual-default" : "image-independent-default",
        presetName: input.mode === "contextual" ? "Contextual Hero Prompt" : "Independent Hero Prompt",
        promptPresetVersionId: null,
        promptVersionLabel: String(input.options?.prompt_version || "v1"),
        systemPrompt: "",
        userPrompt: (0, prompt_1.buildImagePrompt)(input),
        variables: buildImageContext(input),
    };
}
async function loadAssignedVersion(prisma, tenantId, surface, siteId) {
    const siteAssignment = siteId
        ? await prisma.studioPromptAssignment.findFirst({
            where: {
                tenantId,
                surface,
                assignmentKey: assignmentKeyForSite(siteId),
            },
            include: {
                preset: true,
                version: true,
            },
        })
        : null;
    if (siteAssignment?.version.status === "approved") {
        return { source: "site", assignment: siteAssignment };
    }
    const globalAssignment = await prisma.studioPromptAssignment.findFirst({
        where: {
            tenantId,
            surface,
            assignmentKey: assignmentKeyForSite(null),
        },
        include: {
            preset: true,
            version: true,
        },
    });
    if (globalAssignment?.version.status === "approved") {
        return { source: "global", assignment: globalAssignment };
    }
    return null;
}
async function loadManualVersion(prisma, tenantId, promptPresetVersionId) {
    return prisma.studioPromptVersion.findFirst({
        where: {
            id: promptPresetVersionId,
            status: "approved",
            preset: {
                tenantId,
            },
        },
        include: {
            preset: true,
        },
    });
}
async function resolveTextPrompt(prisma, input) {
    const context = buildTextContext(input);
    if (input.promptPresetVersionId?.trim()) {
        const version = await loadManualVersion(prisma, input.tenantId, input.promptPresetVersionId.trim());
        if (version) {
            return {
                surface: version.preset.surface,
                source: "manual",
                presetId: version.preset.id,
                presetKey: version.preset.key,
                presetName: version.preset.name,
                promptPresetVersionId: version.id,
                promptVersionLabel: `v${version.versionNumber}`,
                systemPrompt: renderPromptTemplate(version.systemTemplate, context),
                userPrompt: renderPromptTemplate(version.userTemplate, context),
                variables: context,
            };
        }
    }
    const assigned = await loadAssignedVersion(prisma, input.tenantId, input.type === "instagram" ? "text_instagram" : "text_seo", input.siteId);
    if (assigned) {
        return {
            surface: assigned.assignment.preset.surface,
            source: assigned.source,
            presetId: assigned.assignment.preset.id,
            presetKey: assigned.assignment.preset.key,
            presetName: assigned.assignment.preset.name,
            promptPresetVersionId: assigned.assignment.version.id,
            promptVersionLabel: `v${assigned.assignment.version.versionNumber}`,
            systemPrompt: renderPromptTemplate(assigned.assignment.version.systemTemplate, context),
            userPrompt: renderPromptTemplate(assigned.assignment.version.userTemplate, context),
            variables: context,
        };
    }
    return fallbackTextPrompt(input);
}
async function resolveImagePrompt(prisma, input) {
    const context = buildImageContext(input);
    if (input.promptPresetVersionId?.trim()) {
        const version = await loadManualVersion(prisma, input.tenantId, input.promptPresetVersionId.trim());
        if (version) {
            return {
                surface: version.preset.surface,
                source: "manual",
                presetId: version.preset.id,
                presetKey: version.preset.key,
                presetName: version.preset.name,
                promptPresetVersionId: version.id,
                promptVersionLabel: `v${version.versionNumber}`,
                systemPrompt: renderPromptTemplate(version.systemTemplate, context),
                userPrompt: renderPromptTemplate(version.userTemplate, context),
                variables: context,
            };
        }
    }
    const assigned = await loadAssignedVersion(prisma, input.tenantId, input.mode === "contextual" ? "image_contextual" : "image_independent", input.siteId);
    if (assigned) {
        return {
            surface: assigned.assignment.preset.surface,
            source: assigned.source,
            presetId: assigned.assignment.preset.id,
            presetKey: assigned.assignment.preset.key,
            presetName: assigned.assignment.preset.name,
            promptPresetVersionId: assigned.assignment.version.id,
            promptVersionLabel: `v${assigned.assignment.version.versionNumber}`,
            systemPrompt: renderPromptTemplate(assigned.assignment.version.systemTemplate, context),
            userPrompt: renderPromptTemplate(assigned.assignment.version.userTemplate, context),
            variables: context,
        };
    }
    return fallbackImagePrompt(input);
}
function mapPromptVersionSummary(version) {
    return {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        notes: version.notes,
        approvedAt: version.approvedAt,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        createdBy: version.createdByUser
            ? {
                id: version.createdByUser.id,
                displayName: version.createdByUser.displayName,
                email: version.createdByUser.email,
            }
            : null,
        approvedBy: version.approvedByUser
            ? {
                id: version.approvedByUser.id,
                displayName: version.approvedByUser.displayName,
                email: version.approvedByUser.email,
            }
            : null,
    };
}
function mapPromptAssignmentSummary(assignment) {
    return {
        id: assignment.id,
        surface: assignment.surface,
        assignmentKey: assignment.assignmentKey,
        siteId: assignment.siteId,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
        site: assignment.site
            ? {
                id: assignment.site.id,
                name: assignment.site.name,
                key: assignment.site.key,
            }
            : null,
        version: {
            id: assignment.version.id,
            versionNumber: assignment.version.versionNumber,
            status: assignment.version.status,
        },
    };
}
function mapPromptPresetSummary(preset) {
    const latestVersion = preset.versions[0] ? mapPromptVersionSummary(preset.versions[0]) : null;
    const globalAssignment = preset.assignments.find((assignment) => assignment.assignmentKey === assignmentKeyForSite(null)) ??
        preset.assignments[0] ??
        null;
    return {
        id: preset.id,
        key: preset.key,
        name: preset.name,
        surface: preset.surface,
        scope: preset.scope,
        description: preset.description,
        siteId: preset.siteId,
        createdAt: preset.createdAt,
        updatedAt: preset.updatedAt,
        site: preset.site
            ? {
                id: preset.site.id,
                name: preset.site.name,
                key: preset.site.key,
            }
            : null,
        latestVersion,
        activeAssignment: globalAssignment ? mapPromptAssignmentSummary(globalAssignment) : null,
    };
}
function mapPromptPresetDetail(preset, preview) {
    return {
        ...mapPromptPresetSummary(preset),
        versions: preset.versions.map((version) => ({
            ...mapPromptVersionSummary(version),
            systemTemplate: version.systemTemplate,
            userTemplate: version.userTemplate,
            variablesJson: readJsonObject(version.variablesJson),
        })),
        assignments: preset.assignments.map((assignment) => mapPromptAssignmentSummary(assignment)),
        preview,
    };
}
async function buildPromptPreview(prisma, preset, versionId, projectId) {
    if (!projectId) {
        return null;
    }
    const version = preset.versions.find((item) => item.id === versionId) ??
        preset.versions.find((item) => item.status === "approved") ??
        preset.versions[0];
    if (!version) {
        return null;
    }
    const project = await prisma.contentProject.findFirst({
        where: {
            id: projectId,
            tenantId: preset.tenantId,
        },
        include: {
            site: true,
            versions: {
                orderBy: { versionNumber: "desc" },
                take: 1,
                include: {
                    contentText: true,
                },
            },
        },
    });
    if (!project) {
        return null;
    }
    if (preset.surface === "text_seo" || preset.surface === "text_instagram") {
        const resolved = renderPromptTemplate(version.systemTemplate, buildTextContext({
            topicTitle: project.title,
            topicDescription: project.brief,
            facts: [project.brief],
            type: preset.surface === "text_instagram" ? "instagram" : "seo",
            language: project.primaryLanguage === "en" ? "en" : "es",
            options: {
                goal: project.goal,
                site_name: project.site.name,
                brand_voice: project.site.brandVoice ?? {},
                seo_rules: project.site.seoRules ?? {},
                metadata: project.metadata ?? {},
            },
        }));
        const context = buildTextContext({
            topicTitle: project.title,
            topicDescription: project.brief,
            facts: [project.brief],
            type: preset.surface === "text_instagram" ? "instagram" : "seo",
            language: project.primaryLanguage === "en" ? "en" : "es",
            options: {
                goal: project.goal,
                site_name: project.site.name,
                brand_voice: project.site.brandVoice ?? {},
                seo_rules: project.site.seoRules ?? {},
                metadata: project.metadata ?? {},
            },
        });
        return {
            source: "manual",
            systemPrompt: resolved,
            userPrompt: renderPromptTemplate(version.userTemplate, context),
            variables: context,
        };
    }
    const context = buildImageContext({
        topicTitle: project.title,
        topicDescription: project.brief,
        mode: preset.surface === "image_contextual" ? "contextual" : "independent",
        textOutput: project.versions[0]?.contentText?.output ?? project.versions[0]?.bodyHtml ?? null,
        options: {
            goal: project.goal,
            site_name: project.site.name,
        },
    });
    return {
        source: "manual",
        systemPrompt: renderPromptTemplate(version.systemTemplate, context),
        userPrompt: renderPromptTemplate(version.userTemplate, context),
        variables: context,
    };
}
async function listStudioPromptPresets(prisma, tenantId) {
    const presets = await prisma.studioPromptPreset.findMany({
        where: { tenantId },
        include: {
            site: true,
            versions: {
                orderBy: { versionNumber: "desc" },
                include: {
                    createdByUser: true,
                    approvedByUser: true,
                },
            },
            assignments: {
                include: {
                    site: true,
                    version: true,
                },
            },
        },
        orderBy: [{ surface: "asc" }, { name: "asc" }],
    });
    return presets.map((preset) => mapPromptPresetSummary(preset));
}
async function getStudioPromptPresetDetail(prisma, tenantId, presetId, projectId) {
    const preset = await prisma.studioPromptPreset.findFirst({
        where: {
            tenantId,
            id: presetId,
        },
        include: {
            site: true,
            versions: {
                orderBy: { versionNumber: "desc" },
                include: {
                    createdByUser: true,
                    approvedByUser: true,
                },
            },
            assignments: {
                include: {
                    site: true,
                    version: true,
                },
            },
        },
    });
    if (!preset) {
        return null;
    }
    return mapPromptPresetDetail(preset, await buildPromptPreview(prisma, preset, undefined, projectId));
}
async function ensureUniquePromptKey(prisma, tenantId, baseValue) {
    const normalized = baseValue
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "prompt";
    let candidate = normalized;
    let suffix = 1;
    for (;;) {
        const existing = await prisma.studioPromptPreset.findFirst({
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
        candidate = `${normalized}-${suffix}`;
    }
}
async function createStudioPromptPreset(prisma, tenantId, actorUserId, input) {
    const preset = await prisma.studioPromptPreset.create({
        data: {
            tenantId,
            key: input.key?.trim() || (await ensureUniquePromptKey(prisma, tenantId, input.name)),
            name: input.name.trim(),
            surface: input.surface,
            scope: input.scope ?? "global",
            siteId: input.siteId ?? null,
            description: input.description?.trim() || null,
            createdByUserId: actorUserId ?? undefined,
            updatedByUserId: actorUserId ?? undefined,
            versions: {
                create: {
                    versionNumber: 1,
                    status: "draft",
                    systemTemplate: input.systemTemplate ?? null,
                    userTemplate: input.userTemplate,
                    variablesJson: toNullableJsonInput(input.variablesJson),
                    notes: input.notes?.trim() || null,
                    createdByUserId: actorUserId ?? undefined,
                },
            },
        },
        include: {
            site: true,
            versions: {
                orderBy: { versionNumber: "desc" },
                include: {
                    createdByUser: true,
                    approvedByUser: true,
                },
            },
            assignments: {
                include: {
                    site: true,
                    version: true,
                },
            },
        },
    });
    return mapPromptPresetDetail(preset, null);
}
async function createStudioPromptVersion(prisma, tenantId, presetId, actorUserId, input) {
    const preset = await prisma.studioPromptPreset.findFirst({
        where: {
            tenantId,
            id: presetId,
        },
        include: {
            versions: {
                orderBy: { versionNumber: "desc" },
                take: 1,
            },
        },
    });
    if (!preset) {
        return null;
    }
    const version = await prisma.studioPromptVersion.create({
        data: {
            presetId,
            versionNumber: (preset.versions[0]?.versionNumber ?? 0) + 1,
            status: "draft",
            systemTemplate: input.systemTemplate ?? null,
            userTemplate: input.userTemplate,
            variablesJson: toNullableJsonInput(input.variablesJson),
            notes: input.notes?.trim() || null,
            createdByUserId: actorUserId ?? undefined,
        },
        include: {
            createdByUser: true,
            approvedByUser: true,
        },
    });
    return mapPromptVersionSummary(version);
}
async function updateStudioPromptVersion(prisma, tenantId, presetId, versionId, actorUserId, input) {
    const version = await prisma.studioPromptVersion.findFirst({
        where: {
            id: versionId,
            presetId,
            preset: {
                tenantId,
            },
        },
    });
    if (!version) {
        return null;
    }
    const updated = await prisma.studioPromptVersion.update({
        where: { id: version.id },
        data: {
            status: input.status ?? undefined,
            systemTemplate: input.systemTemplate === undefined ? undefined : input.systemTemplate,
            userTemplate: input.userTemplate ?? undefined,
            variablesJson: input.variablesJson === undefined ? undefined : toNullableJsonInput(input.variablesJson),
            notes: input.notes === undefined ? undefined : input.notes,
            approvedAt: input.status === "approved"
                ? version.approvedAt ?? new Date()
                : input.status === "deprecated"
                    ? version.approvedAt
                    : undefined,
            approvedByUserId: input.status === "approved" ? actorUserId ?? undefined : undefined,
        },
        include: {
            createdByUser: true,
            approvedByUser: true,
        },
    });
    return mapPromptVersionSummary(updated);
}
async function approveStudioPromptVersion(prisma, tenantId, presetId, versionId, actorUserId) {
    return updateStudioPromptVersion(prisma, tenantId, presetId, versionId, actorUserId, {
        status: "approved",
    });
}
async function assignStudioPromptVersion(prisma, tenantId, presetId, actorUserId, input) {
    const version = await prisma.studioPromptVersion.findFirst({
        where: {
            id: input.versionId,
            status: "approved",
            presetId,
            preset: {
                tenantId,
            },
        },
        include: {
            preset: true,
        },
    });
    if (!version) {
        return null;
    }
    const assignment = await prisma.studioPromptAssignment.upsert({
        where: {
            tenantId_surface_assignmentKey: {
                tenantId,
                surface: version.preset.surface,
                assignmentKey: assignmentKeyForSite(input.siteId ?? null),
            },
        },
        update: {
            siteId: input.siteId ?? null,
            presetId: version.preset.id,
            versionId: version.id,
            createdByUserId: actorUserId ?? undefined,
        },
        create: {
            tenantId,
            siteId: input.siteId ?? null,
            surface: version.preset.surface,
            assignmentKey: assignmentKeyForSite(input.siteId ?? null),
            presetId: version.preset.id,
            versionId: version.id,
            createdByUserId: actorUserId ?? undefined,
        },
        include: {
            site: true,
            version: true,
        },
    });
    return mapPromptAssignmentSummary(assignment);
}
