// Schema.org JSON-LD for published articles (M4): Article, FAQPage and BreadcrumbList.
// The integrations feed and the guiatv / generic_rest publishers share these builders.

import { load } from "cheerio";

export interface FaqItem {
  question: string;
  answer: string;
}

const withoutEmpty = (input: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );

export function buildFaqJsonLd(items: FaqItem[]): Record<string, unknown> | null {
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function buildArticleJsonLd(input: {
  title: string;
  description: string;
  image: string;
  publishedAt: string;
  modifiedAt: string;
  languageCode: string;
  url: string;
  publisherName: string;
  publisherUrl: string;
}): Record<string, unknown> {
  return withoutEmpty({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    image: input.image ? [input.image] : [],
    datePublished: input.publishedAt,
    dateModified: input.modifiedAt,
    inLanguage: input.languageCode,
    mainEntityOfPage: input.url,
    url: input.url,
    author: input.publisherName ? { "@type": "Organization", name: input.publisherName } : undefined,
    publisher: input.publisherName
      ? withoutEmpty({ "@type": "Organization", name: input.publisherName, url: input.publisherUrl })
      : undefined,
  });
}

/** Home → article. The last crumb may lack a URL before the destination reports one. */
export function buildBreadcrumbJsonLd(crumbs: Array<{ name: string; url?: string | null }>): Record<string, unknown> | null {
  const items = crumbs.filter((crumb) => crumb.name.trim());
  if (items.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((crumb, index) =>
      withoutEmpty({ "@type": "ListItem", position: index + 1, name: crumb.name.trim(), item: crumb.url || undefined }),
    ),
  };
}

const FAQ_HEADING = /preguntas frecuentes|faq|frequently asked/i;

/** Questions (H3) and answers (text until the next H3/H2) under the article's FAQ H2. */
export function faqItemsFromHtml(html: string): FaqItem[] {
  const $ = load(html, null, false);
  const faq = $("h2").filter((_index, el) => FAQ_HEADING.test($(el).text())).first();
  if (!faq.length) return [];
  const items: FaqItem[] = [];
  let current: FaqItem | null = null;
  for (let node = faq.next(); node.length && !node.is("h2"); node = node.next()) {
    if (node.is("h3")) {
      current = { question: node.text().replace(/\s+/g, " ").trim(), answer: "" };
      items.push(current);
    } else if (current) {
      current.answer = `${current.answer} ${node.text()}`.replace(/\s+/g, " ").trim();
    }
  }
  return items.filter((item) => item.question && item.answer).slice(0, 12);
}

/** Everything a destination needs: Article, BreadcrumbList and, when the body has a FAQ, FAQPage. */
export function buildPublicationJsonLd(input: {
  title: string;
  description: string;
  image: string | null;
  publishedAt: string;
  modifiedAt: string;
  languageCode: string;
  url: string | null;
  siteName: string;
  siteUrl: string | null;
  faqItems: FaqItem[];
}): Array<Record<string, unknown>> {
  const article = buildArticleJsonLd({
    title: input.title,
    description: input.description,
    image: input.image ?? "",
    publishedAt: input.publishedAt,
    modifiedAt: input.modifiedAt,
    languageCode: input.languageCode,
    url: input.url ?? "",
    publisherName: input.siteName,
    publisherUrl: input.siteUrl ?? "",
  });
  const breadcrumb = input.siteUrl
    ? buildBreadcrumbJsonLd([
        { name: input.languageCode.startsWith("en") ? "Home" : "Inicio", url: input.siteUrl },
        { name: input.title, url: input.url },
      ])
    : null;
  return [article, breadcrumb, buildFaqJsonLd(input.faqItems)].filter((block): block is Record<string, unknown> => Boolean(block));
}
