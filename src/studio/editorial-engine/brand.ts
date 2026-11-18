// CTAs and branding (BLG parity M5): business details, brand colours and the
// link / contact / map cards. Stored in site_planning_settings.article_targets.brand;
// the writer gets the facts as guidance and the app renders the cards itself
// (semantic HTML, inline brand colours, no JS) so publishers get the same block.

import { load } from "cheerio";

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
export function renderBrandGuidance(brand: ResolvedBrand): string[] {
  const lines = [brand.domain ? `Site name: ${brand.siteName} — domain: ${brand.domain} — home URL (allowed link): ${brand.homeUrl}` : `Site name: ${brand.siteName}`];
  if (brand.positioning) lines.push(`Brand positioning (use it for the intro's value proposition and the promo block): ${brand.positioning}`);
  if (brand.audience.length) lines.push(`Target audience: ${brand.audience.join("; ")}`);
  const place = [brand.location.cities.join(", "), brand.location.country].filter(Boolean).join(" — ");
  if (place) lines.push(`Business location: ${place}`);
  if (brand.offers.length) {
    lines.push(`What the site offers (mention only when relevant; these URLs are allowed links):\n${brand.offers.map((offer) => `- ${offer.name}${offer.price ? ` — ${offer.price}` : ""}${offer.url ? ` — ${offer.url}` : ""}`).join("\n")}`);
  }
  if (brand.blogPath) lines.push(`The site's blog lives under ${brand.blogPath}.`);
  const card = brand.linkCard;
  if (card.headline || card.text) lines.push(`Link card wording (use verbatim): headline «${card.headline || "(write one)"}», sentence «${card.text || "(write one)"}».`);
  if (brand.promo) lines.push(`The brand promo block must convey: ${brand.promo}`);
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

function renderCard(brand: ResolvedBrand, card: CardContent): string {
  const primary = brand.primaryColor || "#1f2937";
  const border = brand.secondaryColor || "#d1d5db";
  const logo = brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.siteName)}" width="32" height="32" loading="lazy"> ` : "";
  const site = `<p style="margin:0"><strong>${escapeHtml(brand.siteName)}</strong>${brand.domain ? ` · ${escapeHtml(brand.domain)}` : ""}</p>`;
  const title = card.title ? `<p style="margin:8px 0 0"><strong>${escapeHtml(card.title)}</strong></p>` : "";
  const body = card.lines.map((line) => `<p style="margin:4px 0 0">${line}</p>`).join("");
  const button = card.button
    ? `<p style="margin:12px 0 0"><a href="${escapeHtml(card.button.href)}" style="display:inline-block;padding:8px 16px;border-radius:6px;background-color:${primary};color:${readableOn(primary)};text-decoration:none;font-weight:600">${escapeHtml(card.button.label)}</a></p>`
    : "";
  return `<aside data-block="${card.kind}" style="margin:24px 0;padding:16px 20px;border:1px solid ${border};border-left:4px solid ${primary};border-radius:8px">${logo ? `<p style="margin:0 0 8px">${logo}</p>` : ""}${site}${title}${body}${button}</aside>`;
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
