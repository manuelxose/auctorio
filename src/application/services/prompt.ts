export type TextPromptInput = {
  topicTitle: string;
  topicDescription?: string | null;
  facts: string[];
  type: "seo" | "instagram";
  language: "es" | "en";
  options?: Record<string, unknown>;
};

export type TextPromptOutput = {
  systemPrompt: string;
  prompt: string;
};

export type ImagePromptInput = {
  topicTitle: string;
  topicDescription?: string | null;
  mode: "contextual" | "independent";
  textOutput?: string | null;
  options?: Record<string, unknown>;
};

export function buildTextPrompt(input: TextPromptInput): TextPromptOutput {
  const languageLabel = input.language === "es" ? "espanol" : "english";
  const tone = typeof input.options?.tone === "string" ? input.options.tone : undefined;
  const length = typeof input.options?.length === "string" ? input.options.length : undefined;
  const hashtags = Boolean(input.options?.hashtags);
  const goal = typeof input.options?.goal === "string" ? input.options.goal : "article";
  const siteName = typeof input.options?.site_name === "string" ? input.options.site_name : undefined;
  const revisionFeedback =
    typeof input.options?.revision_feedback === "string"
      ? input.options.revision_feedback
      : undefined;
  const targetAudience =
    typeof input.options?.target_audience === "string"
      ? input.options.target_audience
      : undefined;
  const brandVoice =
    input.options?.brand_voice && typeof input.options.brand_voice === "object"
      ? JSON.stringify(input.options.brand_voice)
      : undefined;
  const seoRules =
    input.options?.seo_rules && typeof input.options.seo_rules === "object"
      ? JSON.stringify(input.options.seo_rules)
      : undefined;
  const metadata =
    input.options?.metadata && typeof input.options.metadata === "object"
      ? JSON.stringify(input.options.metadata)
      : undefined;

  const systemPrompt =
    input.type === "seo"
      ? `You are a senior SEO and editorial writer. Respond in ${languageLabel}.`
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

export function buildImagePrompt(input: ImagePromptInput): string {
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
