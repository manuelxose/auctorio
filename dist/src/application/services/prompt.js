"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTextPrompt = buildTextPrompt;
exports.buildImagePrompt = buildImagePrompt;
const prompt_injection_1 = require("../../studio/prompt-injection");
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
    // ── Approved SEO brief fields (EditorialPlanGenerationSchemaV2)
    const brief = input.options?.metadata && typeof input.options.metadata === "object"
        ? input.options.metadata
        : {};
    const briefIntent = typeof brief.primaryIntent === "string" ? brief.primaryIntent : undefined;
    const briefContentType = typeof brief.contentType === "string" ? brief.contentType : undefined;
    const briefWordMin = typeof brief.recommendedWordCountMin === "number" ? brief.recommendedWordCountMin : undefined;
    const briefWordMax = typeof brief.recommendedWordCountMax === "number" ? brief.recommendedWordCountMax : undefined;
    const briefOutline = Array.isArray(brief.outline)
        ? brief.outline
            .map((entry) => (entry && typeof entry === "object" ? String(entry.heading ?? "").trim() : ""))
            .filter(Boolean)
        : [];
    const briefInternalLinks = Array.isArray(brief.suggestedInternalLinks)
        ? brief.suggestedInternalLinks.filter((entry) => typeof entry === "string")
        : [];
    const briefFaqs = Array.isArray(brief.faqCandidates)
        ? brief.faqCandidates
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => entry)
            .filter((entry) => typeof entry.question === "string" && typeof entry.answer === "string")
        : [];
    const briefQuestions = Array.isArray(brief.questionsToAnswer)
        ? brief.questionsToAnswer.filter((entry) => typeof entry === "string")
        : [];
    const briefSchemaTypes = Array.isArray(brief.schemaTypes)
        ? brief.schemaTypes.filter((entry) => typeof entry === "string")
        : [];
    const briefTargetQuery = typeof brief.targetQuery === "string" ? brief.targetQuery : undefined;
    const briefPrimaryKeyword = typeof brief.primaryKeyword === "string" ? brief.primaryKeyword : undefined;
    const briefSemanticKeywords = Array.isArray(brief.semanticKeywords)
        ? brief.semanticKeywords.filter((entry) => typeof entry === "string")
        : [];
    const briefFreshness = typeof brief.freshnessRequirement === "string" ? brief.freshnessRequirement : undefined;
    const INTENT_GUIDANCE = {
        informational: "Search intent: informational. Answer the reader's question thoroughly and practically; educate first, then guide.",
        "commercial-investigation": "Search intent: commercial investigation. Compare options objectively, cover pricing, catalog and pros/cons, and help the reader decide.",
        transactional: "Search intent: transactional. Guide the reader toward a concrete decision or action (subscribe, watch, buy) with clear steps.",
        comparison: "Search intent: comparison. Use structured comparisons and a summary table when useful; be fair to all options.",
        "where-to-watch": "Search intent: where-to-watch. Tell the reader exactly where and how to watch (platforms, channels, schedules) using only evidence present in the provided facts.",
        "sports-live": "Search intent: sports live query. Lead with the match facts available in the sources: date, time, channel and how to watch.",
        news: "Search intent: news/freshness. News writing: lead with what happened, keep facts strictly grounded in the provided sources.",
        "entertainment-discovery": "Search intent: entertainment discovery. Help the reader discover what to watch next with concrete recommendations.",
        navigational: "Search intent: navigational. Point the reader to the destination resource clearly, then add useful context.",
        mixed: "Search intent: mixed. Cover the informational need first, then add comparison and next-step guidance.",
    };
    const intentGuidance = briefIntent ? INTENT_GUIDANCE[briefIntent] : undefined;
    const FORMAT_GUIDANCE = {
        guide: "Content format: comprehensive guide. Deep but scannable structure with clear H2 sections.",
        ranking: "Content format: ranking. Numbered ranking with clear criteria and per-item justification.",
        comparison: "Content format: comparison. Side-by-side analysis; use a table when it helps.",
        analysis: "Content format: analysis. Interpret facts, do not invent them; separate fact from opinion.",
        "where-to-watch": "Content format: where-to-watch. Practical availability section per platform/channel.",
        schedule: "Content format: TV schedule article. Organized by time/channel using the provided schedule facts.",
        news: "Content format: news article. Inverted pyramid; facts only from the provided sources.",
        "match-preview": "Content format: match preview. Teams, context, time, channel and what to expect.",
        "match-report": "Content format: match report. What happened, key moments, result; grounded in sources.",
        "evergreen-pillar": "Content format: evergreen pillar. Authoritative reference that stays useful for months.",
        "streaming-recommendation": "Content format: streaming recommendation. Concrete picks with reasons, grouped by taste.",
    };
    const formatGuidance = briefContentType ? FORMAT_GUIDANCE[briefContentType] : undefined;
    const briefInstructions = [];
    if (intentGuidance) {
        briefInstructions.push(intentGuidance);
    }
    if (formatGuidance) {
        briefInstructions.push(formatGuidance);
    }
    if (briefWordMin && briefWordMax) {
        briefInstructions.push(`Length target: ${briefWordMin}-${briefWordMax} words. Depth and usefulness first; never pad with filler.`);
    }
    if (briefTargetQuery) {
        briefInstructions.push(`Target search query: "${briefTargetQuery}". Cover it naturally without keyword stuffing.`);
    }
    if (briefPrimaryKeyword) {
        briefInstructions.push(`Primary keyword: "${briefPrimaryKeyword}". Use it in the title, the introduction and one heading.`);
    }
    if (briefSemanticKeywords.length > 0) {
        briefInstructions.push(`Semantic terms to cover naturally: ${briefSemanticKeywords.join(", ")}.`);
    }
    if (briefOutline.length > 0) {
        briefInstructions.push(`Suggested structure (H2 sections): ${briefOutline.join(" → ")}.`);
    }
    if (briefQuestions.length > 0) {
        briefInstructions.push(`Questions the article must answer: ${briefQuestions.join(" | ")}.`);
    }
    if (briefInternalLinks.length > 0) {
        briefInstructions.push(`Internal links (verified destination URLs — use ONLY these, with natural anchors): ${briefInternalLinks.join(", ")}.`);
    }
    if (briefFaqs.length > 0) {
        briefInstructions.push(`End with an FAQ section using these question/answer pairs: ${briefFaqs.map((faq) => `Q: ${faq.question}`).join(" | ")}.`);
    }
    if (briefSchemaTypes.length > 0) {
        briefInstructions.push(`Recommended structured data: ${briefSchemaTypes.join(", ")}. Mark up the corresponding semantic blocks.`);
    }
    if (briefFreshness) {
        briefInstructions.push(`Freshness requirement: ${briefFreshness}. ${briefFreshness === "high" ? "Use only current facts from the provided sources; do not invent schedules, prices or availability." : "Keep evergreen statements general unless a source supports specifics."}`);
    }
    briefInstructions.push("Formatting requirements: semantic HTML only (h2/h3, strong for genuinely important concepts, ul/ol, tables when useful). " +
        "Short paragraphs. No keyword stuffing. No invented statistics, quotes or prices. No generic AI filler phrases.");
    const systemPrompt = goal === "news_article"
        ? `You are a senior newsroom editor and original writer. Respond in ${languageLabel}.
${prompt_injection_1.SOURCE_DATA_RULES}
Strict rules:
- Preserve factual accuracy: never fabricate facts, quotes, statistics or names.
- Only use facts present in the provided source material.
- Distinguish confirmed facts from speculation or opinion explicitly.
- Never paraphrase the sources sentence by sentence. Write an ORIGINAL article with your own structure and wording.
- Preserve names, places, dates and factual events accurately.
- Synthesize multiple sources when available.
- Write a reader-oriented introduction that explains why the story matters.
- Use proper H2 headings.
- Follow the site tone and SEO rules when provided.`
        : input.type === "seo"
            ? `You are a senior SEO and editorial writer. Respond in ${languageLabel}.${siteType === "guiatv" ? " You write for a TV programming and streaming guide destination." : ""}
${prompt_injection_1.SOURCE_DATA_RULES}`
            : `You are a senior social media copywriter for Instagram. Respond in ${languageLabel}.
${prompt_injection_1.SOURCE_DATA_RULES}`;
    const facts = (0, prompt_injection_1.wrapUntrustedContent)("source-facts", input.facts.length > 0 ? input.facts.map((fact) => `- ${fact}`).join("\n") : "- (no facts provided)");
    const newsInstructions = goal === "news_article"
        ? [
            "Originality requirement: do not reuse the source sentence structure or phrasing. The article must read as an original piece, not a rewrite.",
            "Grounding requirement: every factual claim must come from the provided facts. If a fact is attributed to a source, keep the attribution.",
            "Structure: engaging headline, lead paragraph answering who/what/when/where, context section, detail sections with H2 headings, closing outlook. Do not invent a closing quote.",
        ]
        : [];
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
        ...briefInstructions,
        ...newsInstructions,
        input.type === "instagram" && hashtags ? "Include relevant hashtags." : null,
        goal === "news_article"
            ? "Write the original news article now. Return clean HTML or clearly structured markdown."
            : input.type === "seo"
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
