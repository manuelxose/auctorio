import type { MarketingLocale } from './marketing-content';
import { FLUJO_EDITORIAL_FAQ, FLUJO_EDITORIAL_HTML } from './articles/flujo-de-trabajo-editorial';

export type ArticleTocEntry = { id: string; title: string };

export type Article = {
  slug: string;
  locale: MarketingLocale;
  kicker: string;
  title: string;
  seoTitle: string;
  description: string;
  lead: string;
  datePublished: string;
  dateModified: string;
  heroAssetSlug: string;
  keywords: string[];
  html: string;
  faq: ReadonlyArray<{ question: string; answer: string }>;
};

export const BLOG_PATH: Record<MarketingLocale, string> = { en: '/blog', es: '/es/blog' };

export const ARTICLES: Article[] = [
  {
    slug: 'flujo-de-trabajo-editorial',
    locale: 'es',
    kicker: 'Guía',
    title: 'Flujo de trabajo editorial: guía completa para medios digitales',
    seoTitle: 'Flujo de trabajo editorial: guía completa 2026',
    description:
      'Cómo diseñar el flujo de trabajo editorial de un medio digital: fases, roles, SEO, uso de IA, control de calidad, publicación multicanal y métricas.',
    lead:
      'Qué fases debe tener, quién hace qué, dónde encaja el SEO y la inteligencia artificial, cómo evitar errores antes de publicar y cómo implantarlo en 30 días.',
    datePublished: '2026-11-11',
    dateModified: '2026-11-11',
    heroAssetSlug: 'content-operations-showcase',
    keywords: [
      'flujo de trabajo editorial',
      'workflow editorial',
      'proceso editorial medios digitales',
      'software editorial',
      'checklist de publicación',
    ],
    html: FLUJO_EDITORIAL_HTML,
    faq: FLUJO_EDITORIAL_FAQ,
  },
];

export function getArticles(locale: MarketingLocale): Article[] {
  return ARTICLES.filter((article) => article.locale === locale);
}

export function getArticle(locale: MarketingLocale, slug: string | null): Article | null {
  return ARTICLES.find((article) => article.locale === locale && article.slug === slug) ?? null;
}

export function getArticlePath(article: Article): string {
  return `${BLOG_PATH[article.locale]}/${article.slug}`;
}

/** Table of contents from the article's own <h2 id> headings, so it can never drift from the body. */
export function getArticleToc(article: Article): ArticleTocEntry[] {
  return [...article.html.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map((match) => ({
    id: match[1],
    title: match[2],
  }));
}

export function getArticleWordCount(article: Article): number {
  return article.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}
