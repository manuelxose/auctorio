import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getEnv } from "../shared/utils/env";
import { saveImageAsset } from "../infrastructure/storage/local-storage";
import { buildAssetPublicUrl } from "./orchestration";

export type SlideText = { headline: string; body: string };
export type SlideStyle = {
  fontFamily: string;
  highlightStyle: string;
  imageStyle: string;
  showBrandMark: boolean;
  brandName: string;
  accent: string;
};

const SIZE = 1080;
const FONTS: Record<string, string> = {
  sans: "Inter, Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', monospace",
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch] as string);
}

export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** One 1080×1080 slide. `hasBackground` leaves the canvas transparent-dark for a photo underneath. */
export function renderSlideSvg(slide: SlideText, style: SlideStyle, index: number, total: number, hasBackground = false): string {
  const font = FONTS[style.fontFamily] ?? FONTS.sans;
  const dark = style.imageStyle === "photo";
  const fg = dark ? "#ffffff" : "#1f1f1f";
  const bg = hasBackground ? "rgba(0,0,0,0.55)" : dark ? "#141414" : "#f6f1e7";
  const headline = wrapText(slide.headline, 22).slice(0, 4);
  const body = wrapText(slide.body, 40).slice(0, 7);
  const headSize = 72;
  const lineHeight = 86;
  let y = 260;
  const parts: string[] = [];
  for (const line of headline) {
    const width = Math.min(SIZE - 160, line.length * headSize * 0.56);
    if (style.highlightStyle === "marker") {
      parts.push(`<rect x="72" y="${y - headSize + 10}" width="${width + 16}" height="${headSize + 8}" fill="${style.accent}" opacity="0.45"/>`);
    } else if (style.highlightStyle === "underline") {
      parts.push(`<rect x="80" y="${y + 12}" width="${width}" height="8" fill="${style.accent}"/>`);
    }
    const color = style.highlightStyle === "color" ? style.accent : fg;
    parts.push(`<text x="80" y="${y}" font-size="${headSize}" font-weight="700" fill="${color}">${escapeXml(line)}</text>`);
    y += lineHeight;
  }
  y += 40;
  for (const line of body) {
    parts.push(`<text x="80" y="${y}" font-size="40" fill="${fg}" opacity="0.9">${escapeXml(line)}</text>`);
    y += 56;
  }
  const footer = [
    style.showBrandMark ? `<text x="80" y="${SIZE - 70}" font-size="32" font-weight="700" fill="${style.accent}">${escapeXml(style.brandName)}</text>` : "",
    `<text x="${SIZE - 80}" y="${SIZE - 70}" font-size="30" text-anchor="end" fill="${fg}" opacity="0.6">${index + 1}/${total}</text>`,
  ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" font-family="${font}"><rect width="100%" height="100%" fill="${bg}"/>${parts.join("")}${footer}</svg>`;
}

/** Renders every slide to PNG in local storage and returns the public URLs, in slide order. */
export async function renderSlideImages(input: {
  tenantId: string;
  socialContentId: string;
  slides: SlideText[];
  style: SlideStyle;
  backgroundStoragePath?: string | null;
}): Promise<Array<{ storagePath: string; imageUrl: string | null }>> {
  let background: Buffer | null = null;
  if (input.style.imageStyle === "photo" && input.backgroundStoragePath) {
    const root = path.resolve(getEnv("STORAGE_ROOT", "/var/www/auctorio/storage"));
    const file = path.resolve(root, input.backgroundStoragePath);
    if (file.startsWith(root + path.sep)) {
      background = await fs.readFile(file).then((bytes) => sharp(bytes).resize(SIZE, SIZE, { fit: "cover" }).toBuffer()).catch(() => null);
    }
  }
  const out: Array<{ storagePath: string; imageUrl: string | null }> = [];
  for (const [index, slide] of input.slides.entries()) {
    const svg = Buffer.from(renderSlideSvg(slide, input.style, index, input.slides.length, Boolean(background)));
    const png = background
      ? await sharp(background).composite([{ input: svg }]).png().toBuffer()
      : await sharp(svg).png().toBuffer();
    const stored = await saveImageAsset({
      tenantId: input.tenantId,
      contentImageId: `social-${input.socialContentId}-${index + 1}`,
      bytes: png,
      extension: "png",
    });
    out.push({ storagePath: stored.relativePath, imageUrl: await buildAssetPublicUrl(stored.relativePath) });
  }
  return out;
}
