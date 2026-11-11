import type { MarketingLocale } from './marketing-content';
import { FLUJO_EDITORIAL_FAQ, FLUJO_EDITORIAL_HTML } from './articles/flujo-de-trabajo-editorial';
import { EDITORIAL_WORKFLOW_FAQ, EDITORIAL_WORKFLOW_HTML } from './articles/editorial-workflow';
import { CONTENT_CALENDAR_FAQ, CONTENT_CALENDAR_HTML } from './articles/content-calendar';
import { CALENDARIO_EDITORIAL_FAQ, CALENDARIO_EDITORIAL_HTML } from './articles/calendario-editorial';
import { AI_CONTENT_FAQ, AI_CONTENT_HTML } from './articles/ai-content-creation';
import { CONTENIDO_IA_FAQ, CONTENIDO_IA_HTML } from './articles/contenido-con-ia';
import { CALENDARIO_EDITORIAL_EXTRA, CONTENT_CALENDAR_EXTRA } from './articles/content-calendar-extra';
import { AI_CONTENT_EXTRA, CONTENIDO_IA_EXTRA } from './articles/ai-content-extra';

/** Inserts extra sections right before the guide's conclusion heading. */
function beforeConclusion(html: string, extra: string): string {
  const marker = '<h2 id="conclusion">';
  if (!html.includes(marker)) {
    throw new Error('Article is missing its conclusion heading');
  }
  return html.replace(marker, extra + marker);
}

export type ArticleTocEntry = { id: string; title: string };

export type Article = {
  /** Same value across the translations of one guide: drives hreflang and the language switch. */
  translationKey: string;
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
    translationKey: 'editorial-workflow',
    slug: 'editorial-workflow',
    locale: 'en',
    kicker: 'Guide',
    title: 'Editorial workflow: the complete guide for digital publishers',
    seoTitle: 'Editorial Workflow: The Complete Guide (2026)',
    description:
      'How to design an editorial workflow for a digital publisher: stages, roles, SEO, AI, quality checks, multi-channel publishing and the metrics that matter.',
    lead:
      'Which stages it needs, who does what, where SEO and AI fit, how to stop errors before they go live and how to roll it out in 30 days.',
    datePublished: '2026-11-11',
    dateModified: '2026-11-11',
    heroAssetSlug: 'content-operations-showcase',
    keywords: ['editorial workflow', 'content workflow', 'editorial process', 'newsroom workflow', 'publishing checklist'],
    html: EDITORIAL_WORKFLOW_HTML,
    faq: EDITORIAL_WORKFLOW_FAQ,
  },
  {
    translationKey: 'editorial-workflow',
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
    keywords: ['flujo de trabajo editorial', 'workflow editorial', 'proceso editorial medios digitales', 'software editorial', 'checklist de publicación'],
    html: FLUJO_EDITORIAL_HTML,
    faq: FLUJO_EDITORIAL_FAQ,
  },
  {
    translationKey: 'content-calendar',
    slug: 'content-calendar',
    locale: 'en',
    kicker: 'Guide',
    title: 'How to create a content calendar (with a free template structure)',
    seoTitle: 'How to Create a Content Calendar (+ Template)',
    description:
      'Build a content calendar that your team actually uses: what to include, a field-by-field template, planning rhythms, tools and the mistakes to avoid.',
    lead:
      'What a content calendar is, what every entry needs, how to plan by week, month and quarter, and how to keep it alive across sites and social channels.',
    datePublished: '2026-11-11',
    dateModified: '2026-11-11',
    heroAssetSlug: 'brand-content-program',
    keywords: ['content calendar', 'editorial calendar', 'content calendar template', 'social media content calendar', 'content planning'],
    html: beforeConclusion(CONTENT_CALENDAR_HTML, CONTENT_CALENDAR_EXTRA),
    faq: CONTENT_CALENDAR_FAQ,
  },
  {
    translationKey: 'content-calendar',
    slug: 'calendario-editorial',
    locale: 'es',
    kicker: 'Guía',
    title: 'Cómo hacer un calendario editorial (con plantilla)',
    seoTitle: 'Calendario editorial: cómo hacerlo + plantilla',
    description:
      'Crea un calendario editorial que tu equipo use de verdad: qué incluir, una plantilla campo a campo, ritmos de planificación, herramientas y errores a evitar.',
    lead:
      'Qué es un calendario editorial, qué necesita cada entrada, cómo planificar por semana, mes y trimestre, y cómo mantenerlo vivo en varias webs y redes.',
    datePublished: '2026-11-11',
    dateModified: '2026-11-11',
    heroAssetSlug: 'brand-content-program',
    keywords: ['calendario editorial', 'plantilla calendario editorial', 'calendario de contenidos', 'calendario editorial redes sociales', 'planificación de contenidos'],
    html: beforeConclusion(CALENDARIO_EDITORIAL_HTML, CALENDARIO_EDITORIAL_EXTRA),
    faq: CALENDARIO_EDITORIAL_FAQ,
  },
  {
    translationKey: 'ai-content',
    slug: 'ai-content-creation',
    locale: 'en',
    kicker: 'Guide',
    title: 'AI content creation: how to use AI to write content that ranks',
    seoTitle: 'AI Content Creation: Write Content That Ranks',
    description:
      'A practical guide to AI content creation: what AI does well, where it fails, a human-in-the-loop workflow, SEO rules, prompts and quality checks.',
    lead:
      'Where AI genuinely saves time, where it creates risk, and the workflow, prompts and checks that keep AI-assisted content accurate, useful and visible in search.',
    datePublished: '2026-11-11',
    dateModified: '2026-11-11',
    heroAssetSlug: 'editorial-qa-review',
    keywords: ['ai content creation', 'ai content writing', 'ai writing tools', 'ai generated content seo', 'ai content workflow'],
    html: beforeConclusion(AI_CONTENT_HTML, AI_CONTENT_EXTRA),
    faq: AI_CONTENT_FAQ,
  },
  {
    translationKey: 'ai-content',
    slug: 'crear-contenido-con-ia',
    locale: 'es',
    kicker: 'Guía',
    title: 'Crear contenido con IA: cómo usar la inteligencia artificial para escribir contenido que posicione',
    seoTitle: 'Crear contenido con IA que posicione: guía',
    description:
      'Guía práctica para crear contenido con IA: qué hace bien, dónde falla, un flujo con revisión humana, reglas SEO, instrucciones y controles de calidad.',
    lead:
      'Dónde ahorra tiempo de verdad la IA, dónde genera riesgos, y el flujo, las instrucciones y las comprobaciones que mantienen el contenido exacto, útil y visible.',
    datePublished: '2026-11-11',
    dateModified: '2026-11-11',
    heroAssetSlug: 'editorial-qa-review',
    keywords: ['crear contenido con ia', 'redacción con ia', 'herramientas de ia para escribir', 'contenido generado por ia seo', 'inteligencia artificial para contenidos'],
    html: beforeConclusion(CONTENIDO_IA_HTML, CONTENIDO_IA_EXTRA),
    faq: CONTENIDO_IA_FAQ,
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

export function getArticleTranslation(article: Article, locale: MarketingLocale): Article | null {
  return ARTICLES.find((entry) => entry.translationKey === article.translationKey && entry.locale === locale) ?? null;
}

/** hreflang map for an article, only when every locale has a translation. */
export function getArticleAlternates(article: Article): Record<MarketingLocale | 'x-default', string> | undefined {
  const en = getArticleTranslation(article, 'en');
  const es = getArticleTranslation(article, 'es');
  if (!en || !es) {
    return undefined;
  }
  return { en: getArticlePath(en), es: getArticlePath(es), 'x-default': getArticlePath(en) };
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
