// CTAs and branding (BLG parity M5): business details, brand colours and the
// link / contact / map cards. Stored in site_planning_settings.article_targets.brand;
// the writer gets the facts as guidance and the app renders the cards itself
// (semantic HTML, inline brand colours, no JS) so publishers get the same block.

import { load } from "cheerio";
import type { ArticleSections } from "./structure";

export const CARD_STYLES = ["classic", "editorial", "soft", "minimal", "bold", "ink", "frame"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];
export const CARD_CORNERS = ["rounded", "square"] as const;
export type CardCorners = (typeof CARD_CORNERS)[number];

export type BrandOffer = { name: string; price: string; url: string };

export type BrandSettings = {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  /** What makes the business different; ≤500 chars. */
  positioning: string;
  audience: string[];
  location: { country: string; cities: string[] };
  /** «What you sell»: ≤20 offers. */
  offers: BrandOffer[];
  /** Where the site's own posts live, e.g. /blog. */
  blogPath: string;
  linkCard: { headline: string; text: string; url: string; buttonText: string };
  contactCard: { headline: string; text: string; email: string; phone: string; url: string; buttonText: string };
  mapCard: { headline: string; address: string; url: string };
  /** Look of the three CTA cards: one of CARD_STYLES, with rounded or square corners. */
  cardStyle: CardStyle;
  cardCorners: CardCorners;
  /** What the brand promo paragraph before the FAQ must convey. */
  promo: string;
};

export const DEFAULT_BRAND: BrandSettings = {
  logoUrl: "",
  primaryColor: "",
  secondaryColor: "",
  positioning: "",
  audience: [],
  location: { country: "", cities: [] },
  offers: [],
  blogPath: "",
  linkCard: { headline: "", text: "", url: "", buttonText: "" },
  contactCard: { headline: "", text: "", email: "", phone: "", url: "", buttonText: "" },
  mapCard: { headline: "", address: "", url: "" },
  cardStyle: "classic",
  cardCorners: "rounded",
  promo: "",
};

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (value: unknown, maxItems: number, maxChars: number) =>
  Array.isArray(value) ? [...new Set(value.map((entry) => text(entry, maxChars)).filter(Boolean))].slice(0, maxItems) : [];
const httpUrl = (value: unknown) => {
  const raw = text(value, 500);
  try {
    return /^https?:$/.test(new URL(raw).protocol) ? raw : "";
  } catch {
    return "";
  }
};
const hex = (value: unknown) => {
  const raw = text(value, 7);
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : "";
};

/** Valid brand settings from untrusted JSON: unknown keys dropped, URLs must be http(s), colours #rrggbb. */
export function readBrandSettings(value: unknown): BrandSettings {
  const raw = rec(value);
  const location = rec(raw.location);
  const link = rec(raw.linkCard);
  const contact = rec(raw.contactCard);
  const map = rec(raw.mapCard);
  const email = text(contact.email, 200);
  const blogPath = text(raw.blogPath, 100);
  return {
    logoUrl: httpUrl(raw.logoUrl),
    primaryColor: hex(raw.primaryColor),
    secondaryColor: hex(raw.secondaryColor),
    positioning: text(raw.positioning, 500),
    audience: list(raw.audience, 10, 120),
    location: { country: text(location.country, 80), cities: list(location.cities, 10, 80) },
    offers: (Array.isArray(raw.offers) ? raw.offers : [])
      .map((entry) => ({ name: text(rec(entry).name, 120), price: text(rec(entry).price, 40), url: httpUrl(rec(entry).url) }))
      .filter((offer) => offer.name)
      .slice(0, 20),
    blogPath: /^\/[\w\-/]*$/.test(blogPath) ? blogPath : "",
    linkCard: { headline: text(link.headline, 80), text: text(link.text, 200), url: httpUrl(link.url), buttonText: text(link.buttonText, 30) },
    contactCard: {
      headline: text(contact.headline, 80),
      text: text(contact.text, 200),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
      phone: text(contact.phone, 30).replace(/[^\d+()\s-]/g, ""),
      url: httpUrl(contact.url),
      buttonText: text(contact.buttonText, 30),
    },
    mapCard: { headline: text(map.headline, 80), address: text(map.address, 200), url: httpUrl(map.url) },
    cardStyle: (CARD_STYLES as readonly string[]).includes(raw.cardStyle as string) ? (raw.cardStyle as CardStyle) : "classic",
    cardCorners: raw.cardCorners === "square" ? "square" : "rounded",
    promo: text(raw.promo, 500),
  };
}

/** Brand settings plus what the app already knows about the site (name, home, crawled profile). */
export type ResolvedBrand = BrandSettings & { siteName: string; domain: string | null; homeUrl: string | null };

export function resolveBrand(
  settings: BrandSettings,
  site: { name: string; baseUrl: string | null },
  profile?: { brandSummary?: string | null; detectedAudience?: string | null } | null,
): ResolvedBrand {
  let domain: string | null = null;
  try {
    domain = site.baseUrl ? new URL(site.baseUrl).hostname.replace(/^www\./, "") : null;
  } catch {
    domain = null;
  }
  return {
    ...settings,
    // The crawled profile fills what the editor left empty.
    positioning: settings.positioning || text(profile?.brandSummary, 500),
    audience: settings.audience.length ? settings.audience : list(profile?.detectedAudience ? [profile.detectedAudience] : [], 1, 120),
    siteName: site.name,
    domain,
    homeUrl: site.baseUrl,
  };
}

export const hasContactCard = (brand: BrandSettings) => Boolean(brand.contactCard.email || brand.contactCard.phone || brand.contactCard.url);
export const hasMapCard = (brand: BrandSettings) => Boolean(brand.mapCard.address);

/** Writer guidance: the business facts, offers and CTA wording. */
export function renderBrandGuidance(brand: ResolvedBrand, sections: Pick<ArticleSections, "linkCard" | "promo"> | null = { linkCard: true, promo: true }): string[] {
  const lines = [brand.domain ? `Site name: ${brand.siteName} — domain: ${brand.domain} — home URL (allowed link): ${brand.homeUrl}` : `Site name: ${brand.siteName}`];
  if (brand.positioning) lines.push(`Brand positioning: ${brand.positioning}`);
  if (brand.audience.length) lines.push(`Target audience: ${brand.audience.join("; ")}`);
  const place = [brand.location.cities.join(", "), brand.location.country].filter(Boolean).join(" — ");
  if (place) lines.push(`Business location: ${place}`);
  if (brand.offers.length) {
    lines.push(`What the site offers (mention only when relevant; these URLs are allowed links):\n${brand.offers.map((offer) => `- ${offer.name}${offer.price ? ` — ${offer.price}` : ""}${offer.url ? ` — ${offer.url}` : ""}`).join("\n")}`);
  }
  if (brand.blogPath) lines.push(`The site's blog lives under ${brand.blogPath}.`);
  const card = brand.linkCard;
  if (sections?.linkCard && (card.headline || card.text)) lines.push(`Link card wording (use verbatim): headline «${card.headline || "(write one)"}», sentence «${card.text || "(write one)"}».`);
  if (sections?.promo && brand.promo) lines.push(`The brand promo block must convey: ${brand.promo}`);
  return lines;
}

// ────────────────────────────────────────────────────────────── Card rendering

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Black or white text, whichever reads better on the colour (WCAG relative luminance). */
export function readableOn(color: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#111111" : "#ffffff";
}

type CardContent = { kind: "link_card" | "contact_card" | "map_card"; title: string; lines: string[]; button?: { href: string; label: string } };

/** The colour mixed toward white (amount 0–1): the card's soft halo. */
export function tint(color: string, amount: number): string {
  return `#${[1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) + (255 - parseInt(color.slice(i, i + 2), 16)) * amount).toString(16).padStart(2, "0")).join("")}`;
}

const isDark = (color: string) => readableOn(color) === "#ffffff";

/**
 * CTA card in inline styles only (no JS, no classes, so every publisher renders it the same). Seven looks, all
 * limited to the properties the sanitizer keeps (html-sanitizer STYLE_PROPERTIES: no shadows, gradients or fonts),
 * each with one clear primary action and text contrast of at least 4.5:1 on its own background:
 * - classic: dark header with the brand pill and domain, accent bar, soft halo of the brand colour (BLG).
 * - editorial: magazine rule on top, kicker, large headline and an underlined text link.
 * - soft: brand-tinted panel with a thick accent edge.
 * - minimal: white card with a hairline border and an outlined button.
 * - bold: the brand colour as background with a contrasting button.
 * - ink: near-black panel with a brand accent line and a white button.
 * - frame: centred card inside a brand-colour frame with a pill button.
 * Stacked, so it also reads on mobile.
 */
function renderCard(brand: ResolvedBrand, card: CardContent): string {
  const primary = brand.primaryColor || "#2563eb";
  const square = brand.cardCorners === "square";
  const radius = (rounded: number) => (square ? 0 : rounded);
  const style = brand.cardStyle ?? "classic";
  const ink = isDark(primary) ? primary : "#111827";
  const logo = (margin: string) => (brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.siteName)}" width="28" height="28" loading="lazy" style="display:inline-block;margin:${margin};border-radius:${radius(6)}px"> ` : "");
  const lines = (color: string, gutter = 24) => card.lines.map((line) => `<p style="margin:12px ${gutter}px 0;color:${color};line-height:1.6">${line}</p>`).join("");
  const button = (background: string, color: string, border = "", gutter = 24, pill = false) =>
    card.button
      ? `<p style="margin:20px ${gutter}px 0"><a href="${escapeHtml(card.button.href)}" style="display:inline-block;padding:12px 24px;${border ? `border:${border};` : ""}border-radius:${pill ? radius(999) : radius(10)}px;background-color:${background};color:${color};font-weight:700;text-decoration:none">${escapeHtml(card.button.label)} →</a></p>`
      : "";
  const label = (color: string, gutter = 24, top = 22) =>
    `<p style="margin:0;padding:${top}px ${gutter}px 0;color:${color};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;line-height:1.6">${logo("0 10px 0 0")}${escapeHtml(brand.siteName)}</p>`;
  const title = (color: string, gutter = 24, top = 12, size = 22) =>
    card.title ? `<p style="margin:0;padding:${top}px ${gutter}px 0;color:${color};font-size:${size}px;font-weight:700;line-height:1.3">${escapeHtml(card.title)}</p>` : "";
  const shell = (css: string, inner: string) => `<aside data-block="${card.kind}" style="margin:32px 0;${css};overflow:hidden">${inner}</aside>`;

  if (style === "editorial") {
    const link = card.button ? `<p style="margin:16px 0 0;padding:0 0 4px"><a href="${escapeHtml(card.button.href)}" style="display:inline-block;padding:10px 0;color:${ink};font-size:17px;font-weight:700;text-decoration:underline">${escapeHtml(card.button.label)} →</a></p>` : "";
    return shell(`padding:0 0 12px;border-top:4px solid ${ink};background-color:#ffffff`, `${label(ink, 0, 16)}${title("#111827", 0, 8, 28)}${lines("#374151", 0)}${link}`);
  }
  if (style === "soft") {
    return shell(`padding:0 0 24px;border-left:6px solid ${primary};border-radius:0 ${radius(14)}px ${radius(14)}px 0;background-color:${tint(primary, 0.9)}`, `${label(ink)}${title("#111827")}${lines("#374151")}${button(primary, readableOn(primary))}`);
  }
  if (style === "minimal") {
    return shell(`padding:0 0 24px;border:1px solid #e5e7eb;border-radius:${radius(12)}px;background-color:#ffffff`, `${label("#6b7280")}${title("#111827")}${lines("#4b5563")}${button("#ffffff", ink, `2px solid ${primary}`)}`);
  }
  if (style === "bold") {
    const fg = readableOn(primary);
    return shell(`padding:0 0 24px;border-radius:${radius(20)}px;background-color:${primary}`, `${label(fg)}${title(fg)}${lines(fg)}${button(fg, primary)}`);
  }
  if (style === "ink") {
    const base = brand.secondaryColor && isDark(brand.secondaryColor) ? brand.secondaryColor : "#0f172a";
    return shell(`padding:0 0 28px;border-top:5px solid ${primary};border-radius:0 0 ${radius(16)}px ${radius(16)}px;background-color:${base}`, `${label(tint(primary, 0.6))}${title("#ffffff")}${lines("#e2e8f0")}${button("#ffffff", "#0f172a", `2px solid ${primary}`)}`);
  }
  if (style === "frame") {
    const rule = `<p style="margin:14px auto 0;width:48px;border-top:3px solid ${primary}"></p>`;
    return shell(`padding:0 0 28px;border:2px solid ${primary};border-radius:${radius(18)}px;background-color:#ffffff;text-align:center`, `${label(ink)}${title("#111827", 24, 10, 24)}${rule}${lines("#4b5563")}${button(primary, readableOn(primary), "", 24, true)}`);
  }

  const dark = brand.secondaryColor && isDark(brand.secondaryColor) ? brand.secondaryColor : isDark(primary) ? primary : "#111827";
  const header =
    `<p style="margin:0;padding:20px 24px ${brand.domain ? "6px" : "20px"};background-color:${dark};color:#ffffff;line-height:1.6">${logo("0 10px 0 0")}` +
    `<strong style="display:inline-block;padding:4px 14px;border-radius:${radius(999)}px;background-color:#ffffff;color:${dark};font-size:13px;letter-spacing:1px;text-transform:uppercase">${escapeHtml(brand.siteName)}</strong></p>` +
    (brand.domain ? `<p style="margin:0;padding:0 24px 20px;background-color:${dark};color:#d1d5db;font-size:13px">${escapeHtml(brand.domain)}</p>` : "");
  const accent = `<p style="margin:12px 24px 0;width:56px;border-top:5px solid ${primary};border-radius:${radius(4)}px"></p>`;
  return shell(`padding:0 0 24px;border:10px solid ${tint(primary, 0.82)};border-radius:${radius(24)}px;background-color:#ffffff`, `${header}${title("#111827", 24, 24)}${accent}${lines("#4b5563")}${button(primary, readableOn(primary))}`);
}

const visitLabel = (language: "es" | "en") => (language === "es" ? "Visitar" : "Visit");

/**
 * Replaces the writer's card blocks with the app-rendered ones. The link card keeps the writer's headline and
 * sentence unless the site configured its own; contact and map cards are rendered only when their data exists,
 * at the writer's placeholder or (missing placeholder) the contact card at the end and the map card before it.
 */
export function applyBrandCards(
  html: string,
  brand: ResolvedBrand,
  sections: { linkCard: boolean; contactCard: boolean; mapCard: boolean },
  language: "es" | "en",
  disclaimer = "",
): string {
  const $ = load(html, null, false);
  const placeholder = (kind: string) => $(`aside[data-block="${kind}"]`);

  const link = placeholder("link_card");
  if (sections.linkCard && (link.length || brand.linkCard.headline)) {
    const paragraphs = link.first().find("p").toArray().map((p) => $(p).text().trim());
    const url = brand.linkCard.url || brand.homeUrl;
    const card = renderCard(brand, {
      kind: "link_card",
      title: brand.linkCard.headline || paragraphs[1] || "",
      lines: [escapeHtml(brand.linkCard.text || paragraphs[2] || "")].filter(Boolean),
      ...(url ? { button: { href: url, label: brand.linkCard.buttonText || visitLabel(language) } } : {}),
    });
    if (link.length) link.first().replaceWith(card);
    else {
      const anchor = $('aside[data-block="summary"], nav, h2').first();
      if (anchor.length) anchor.before(card);
      else $.root().prepend(card);
    }
  }
  link.slice(1).remove();
  if (!sections.linkCard) placeholder("link_card").remove();

  const place = (kind: "contact_card" | "map_card", card: string | null) => {
    const found = placeholder(kind);
    if (!card) return void found.remove();
    if (found.length) {
      found.first().replaceWith(card);
      found.slice(1).remove();
      return;
    }
    const contact = placeholder("contact_card");
    // The site disclaimer stays the article's last paragraph.
    const last = $.root().children().last();
    if (kind === "map_card" && contact.length) contact.first().before(card);
    else if (disclaimer && last.is("p") && last.text().trim() === disclaimer) last.before(card);
    else $.root().append(card);
  };

  const contact = brand.contactCard;
  place(
    "contact_card",
    sections.contactCard && hasContactCard(brand)
      ? renderCard(brand, {
          kind: "contact_card",
          title: contact.headline || (language === "es" ? "Contacto" : "Contact"),
          lines: [
            contact.text ? escapeHtml(contact.text) : "",
            contact.email ? `<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>` : "",
            contact.phone ? `<a href="tel:${escapeHtml(contact.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(contact.phone)}</a>` : "",
          ].filter(Boolean),
          ...(contact.url ? { button: { href: contact.url, label: contact.buttonText || (language === "es" ? "Contactar" : "Contact us") } } : {}),
        })
      : null,
  );
  const map = brand.mapCard;
  place(
    "map_card",
    sections.mapCard && hasMapCard(brand)
      ? renderCard(brand, {
          kind: "map_card",
          title: map.headline || (language === "es" ? "Dónde estamos" : "Where to find us"),
          lines: [escapeHtml(map.address)],
          button: { href: map.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(map.address)}`, label: language === "es" ? "Cómo llegar" : "Get directions" },
        })
      : null,
  );
  return $.html();
}

/** The three cards as the article will show them, with sample wording where the site left a field empty (Settings preview). */
export function previewBrandCards(brand: ResolvedBrand, language: "es" | "en" = "es"): Record<CardContent["kind"], string> {
  const es = language === "es";
  const { linkCard: link, contactCard: contact, mapCard: map } = brand;
  const home = link.url || brand.homeUrl || "https://example.com";
  const address = map.address || (es ? "Calle Mayor 1, Madrid" : "1 Main Street, London");
  return {
    link_card: renderCard(brand, {
      kind: "link_card",
      title: link.headline || (es ? "Titular de la llamada a la acción" : "Call-to-action headline"),
      lines: [escapeHtml(link.text || (es ? "Una frase que invita al lector a dar el siguiente paso." : "A sentence inviting the reader to take the next step."))],
      button: { href: home, label: link.buttonText || visitLabel(language) },
    }),
    contact_card: renderCard(brand, {
      kind: "contact_card",
      title: contact.headline || (es ? "Contacto" : "Contact"),
      lines: [
        contact.text ? escapeHtml(contact.text) : "",
        `<a href="mailto:${escapeHtml(contact.email || "hola@ejemplo.com")}">${escapeHtml(contact.email || "hola@ejemplo.com")}</a>`,
        contact.phone ? `<a href="tel:${escapeHtml(contact.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(contact.phone)}</a>` : "",
      ].filter(Boolean),
      button: { href: contact.url || home, label: contact.buttonText || (es ? "Contactar" : "Contact us") },
    }),
    map_card: renderCard(brand, {
      kind: "map_card",
      title: map.headline || (es ? "Dónde estamos" : "Where to find us"),
      lines: [escapeHtml(address)],
      button: { href: map.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, label: es ? "Cómo llegar" : "Get directions" },
    }),
  };
}
