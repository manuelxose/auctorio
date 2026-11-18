// Visuals settings (BLG parity M6/M8): image instructions and styles, «use only my media library»,
// one optional infographic and one optional YouTube video per article. Stored in
// site_planning_settings.article_targets.visuals; applied when images are requested and in the seo stage.

export const IMAGE_STYLES = ["realistic", "illustration", "editorial", "minimal"] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];

export type VisualSettings = {
  /** Free instructions for every image («no people», «warm light»…); ≤500 chars. */
  imageInstructions: string;
  coverStyle: ImageStyle;
  /** Body images: a style, or only images already in the site's media library. */
  bodyStyle: ImageStyle | "media_library";
  /** One body image becomes an infographic of the section with steps, figures or a comparison. */
  infographic: boolean;
  youtube: { enabled: boolean; channelOnly: boolean; channelUrl: string };
};

export const DEFAULT_VISUALS: VisualSettings = {
  imageInstructions: "",
  coverStyle: "realistic",
  bodyStyle: "realistic",
  infographic: false,
  youtube: { enabled: false, channelOnly: false, channelUrl: "" },
};

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const isStyle = (value: unknown): value is ImageStyle => typeof value === "string" && (IMAGE_STYLES as readonly string[]).includes(value);

export function readVisualSettings(value: unknown): VisualSettings {
  const raw = rec(value);
  const youtube = rec(raw.youtube);
  const channelUrl = typeof youtube.channelUrl === "string" ? youtube.channelUrl.trim().slice(0, 200) : "";
  return {
    imageInstructions: typeof raw.imageInstructions === "string" ? raw.imageInstructions.replace(/\s+/g, " ").trim().slice(0, 500) : "",
    coverStyle: isStyle(raw.coverStyle) ? raw.coverStyle : DEFAULT_VISUALS.coverStyle,
    bodyStyle: raw.bodyStyle === "media_library" || isStyle(raw.bodyStyle) ? raw.bodyStyle : DEFAULT_VISUALS.bodyStyle,
    infographic: raw.infographic === true,
    youtube: {
      enabled: youtube.enabled === true,
      channelOnly: youtube.channelOnly === true && /^https:\/\/(www\.)?youtube\.com\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+)\/?$/.test(channelUrl),
      channelUrl: /^https:\/\/(www\.)?youtube\.com\//.test(channelUrl) ? channelUrl : "",
    },
  };
}

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  realistic: "Realistic editorial photograph, natural light, no text, no logos, no watermarks.",
  illustration: "Clean flat editorial illustration, no text, no logos.",
  editorial: "Magazine-style editorial image with a strong composition, no text, no logos.",
  minimal: "Minimal composition with plenty of negative space, no text, no logos.",
};

/** Prompt suffix for one image: its style, the site's own instructions and its brand palette. */
export function imageStylePrompt(style: ImageStyle | "media_library" | null | undefined, instructions: string, brandColors = ""): string {
  const palette = /^#[0-9a-f]{6}(, #[0-9a-f]{6})*$/i.test(brandColors)
    ? `Brand palette: ${brandColors}. Use these colours as the dominant accents (lighting, props, clothing, set details), naturally, so the image matches the site.`
    : "";
  return [style && style !== "media_library" ? STYLE_PROMPTS[style] : "", instructions ? `Site image instructions: ${instructions}` : "", palette].filter(Boolean).join("\n");
}

export const INFOGRAPHIC_PROMPT_PREFIX = "Editorial infographic";

/** Prompt for the article's one infographic: the section's steps, figures or comparison, few short labels. */
export function infographicPrompt(section: string, sectionText: string, language: "es" | "en"): string {
  return [
    `${INFOGRAPHIC_PROMPT_PREFIX}, flat vector style, clean grid layout, that visualizes «${section}».`,
    `Content to visualize (steps, figures or comparison): ${sectionText.slice(0, 600)}`,
    `Use only a few short labels in ${language === "es" ? "Spanish" : "English"}, large and legible; no logos, no watermarks.`,
  ].join("\n");
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** H2 sections (heading + its HTML) of a body, in order. */
export function h2Sections(html: string): Array<{ heading: string; html: string }> {
  const parts = html.split(/(?=<h2[\s>])/i).filter((part) => /^<h2[\s>]/i.test(part));
  return parts.map((part) => ({ heading: text(/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(part)?.[1] ?? ""), html: part }));
}

/** The first section with steps (<ol>) or a comparison (<table>): what an infographic can show. */
export function infographicSection(html: string): { index: number; heading: string; text: string } | null {
  const index = h2Sections(html).findIndex((section) => /<(ol|table)[\s>]/i.test(section.html));
  if (index < 0) return null;
  const section = h2Sections(html)[index];
  const items = [...section.html.matchAll(/<(li|tr)[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => text(match[2])).filter(Boolean);
  return { index, heading: section.heading, text: (items.length ? items.join(" · ") : text(section.html)).slice(0, 600) };
}

// ────────────────────────────────────────────────────────────── YouTube

export type YoutubeVideo = { id: string; title: string; channel: string; channelUrl: string };

/** No-JS video block (the thumbnail links to the video): publishers strip iframes, a figure always survives. */
export function youtubeFigureHtml(video: YoutubeVideo): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<figure data-block="youtube"><a href="https://www.youtube.com/watch?v=${video.id}"><img src="https://i.ytimg.com/vi/${video.id}/hqdefault.jpg" alt="${escape(video.title)}" width="480" height="360" loading="lazy"></a><figcaption>${escape(video.title)}${video.channel ? ` — ${escape(video.channel)}` : ""}</figcaption></figure>`;
}

/** Places the video after the first body section (before the second H2); once per article. */
export function insertYoutube(html: string, video: YoutubeVideo): string {
  if (/data-block="youtube"/.test(html)) return html;
  const figure = youtubeFigureHtml(video);
  const index = [...html.matchAll(/<h2[\s>]/gi)][1]?.index;
  return index === undefined ? `${html}${figure}` : `${html.slice(0, index)}${figure}${html.slice(index)}`;
}

/** The first video, optionally only from the site's own channel (matched on its URL). */
export function pickYoutubeVideo(videos: YoutubeVideo[], youtube: VisualSettings["youtube"]): YoutubeVideo | null {
  const channel = youtube.channelUrl.replace(/^https:\/\/(www\.)?youtube\.com\//, "").replace(/\/$/, "").toLowerCase();
  return videos.find((video) => !youtube.channelOnly || (channel && video.channelUrl.toLowerCase().includes(channel))) ?? null;
}
