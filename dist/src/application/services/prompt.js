"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTextPrompt = buildTextPrompt;
exports.buildImagePrompt = buildImagePrompt;
function buildTextPrompt(input) {
    const languageLabel = input.language === "es" ? "espanol" : "english";
    const tone = typeof input.options?.tone === "string" ? input.options.tone : undefined;
    const length = typeof input.options?.length === "string" ? input.options.length : undefined;
    const hashtags = Boolean(input.options?.hashtags);
    const goal = typeof input.options?.goal === "string" ? input.options.goal : "article";
    const siteName = typeof input.options?.site_name === "string" ? input.options.site_name : undefined;
    const revisionFeedback = typeof input.options?.revision_feedback === "string"
        ? input.options.revision_feedback
        : undefined;
    const siteType = typeof input.options?.site_type === "string"
        ? String(input.options.site_type).trim().toLowerCase()
        : undefined;
    const destinationGuidance = siteType === "guiatv"
        ? "Destination: GuiaTV (guiaprogramaciontv.com). Suitable formats: TV guides, streaming guides, football and sports articles, rankings, editorial explainers, platform comparisons, schedules, evergreen SEO content and relevant news. Write with the depth a TV programming audience expects, use practical channel and platform facts when provided, and structure the SEO metadata around real programming queries."
        : undefined;
    const targetAudience = typeof input.options?.target_audience === "string"
        ? input.options.target_audience
        : undefined;
    const brandVoice = input.options?.brand_voice && typeof input.options.brand_voice === "object"
        ? JSON.stringify(input.options.brand_voice)
        : undefined;
    const seoRules = input.options?.seo_rules && typeof input.options.seo_rules === "object"
        ? JSON.stringify(input.options.seo_rules)
        : undefined;
    const metadata = input.options?.metadata && typeof input.options.metadata === "object"
        ? JSON.stringify(input.options.metadata)
        : undefined;
    const systemPrompt = input.type === "seo"
        ? `You are a senior SEO and editorial writer. Respond in ${languageLabel}.${siteType === "guiatv" ? " You write for a TV programming and streaming guide destination." : ""}`
        : `You are a senior social media copywriter for Instagram. Respond in ${languageLabel}.`;
    const facts = input.facts.length > 0 ? input.facts.map((fact) => `- ${fact}`).join("\n") : "- (no facts provided)";
    const promptLines = [
        `Topic: ${input.topicTitle}`,
        input.topicDescription ? `Description: ${input.topicDescription}` : null,
        `Facts:\n${facts}`,
        siteName ? `Site: ${siteName}` : null,
        `Editorial goal: ${goal}`,
        tone ? `Tone: ${tone}` : null,
        length ? `Length: ${length}` : null,
        targetAudience ? `Target audience: ${targetAudience}` : null,
        brandVoice ? `Brand voice JSON: ${brandVoice}` : null,
        seoRules ? `SEO rules JSON: ${seoRules}` : null,
        metadata ? `Structured metadata JSON: ${metadata}` : null,
        revisionFeedback ? `Revision feedback: ${revisionFeedback}` : null,
        destinationGuidance ? `Editorial guidance: ${destinationGuidance}` : null,
        input.type === "instagram" && hashtags ? "Include relevant hashtags." : null,
        input.type === "seo"
            ? "Write production-ready editorial content with a clear title, a compelling introduction, H2 sections, actionable detail, and a strong ending. Return clean HTML or clearly structured markdown."
            : "Write a concise caption suited for Instagram.",
    ].filter(Boolean);
    return {
        systemPrompt,
        prompt: promptLines.join("\n"),
    };
}
function buildImagePrompt(input) {
    const style = typeof input.options?.style === "string" ? input.options.style : undefined;
    const siteName = typeof input.options?.site_name === "string" ? input.options.site_name : undefined;
    const goal = typeof input.options?.goal === "string" ? input.options.goal : undefined;
    const base = input.mode === "contextual" && input.textOutput ? input.textOutput : input.topicTitle;
    const details = [
        base,
        input.topicDescription ? input.topicDescription : null,
        siteName ? `Brand/site: ${siteName}` : null,
        goal ? `Editorial goal: ${goal}` : null,
        style ? `Style: ${style}` : null,
        "Create a professional hero image suitable for editorial publication and social reuse.",
    ].filter(Boolean);
    return details.join("\n");
}
