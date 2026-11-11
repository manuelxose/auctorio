import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import {
  BRAND_DESCRIPTION,
  BRAND_DOMAIN_OBJECTIVE,
  BRAND_NAME,
  BRAND_TAGLINE,
  type MarketingLocale,
  type MarketingShowcaseAsset,
  TECNORIA_LINKS,
} from '../content/marketing-content';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';

export type SeoConfig = {
  title: string;
  description: string;
  path: string;
  locale: MarketingLocale;
  keywords?: string[];
  noIndex?: boolean;
  alternates?: Record<MarketingLocale | 'x-default', string>;
  imageAsset?: MarketingShowcaseAsset | null;
  schemas?: Record<string, unknown>[];
  ogType?: 'website' | 'article';
};

/** Search snippets cut at ~160 chars; trim at a word boundary instead of mid-word. */
export function clampDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) {
    return clean;
  }
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '')}…`;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly origin = inject(STUDIO_ORIGIN);

  update(config: SeoConfig): void {
    const pageTitle = config.title.includes(BRAND_NAME) ? config.title : `${config.title} | ${BRAND_NAME}`;
    const description = clampDescription(config.description);
    const canonicalUrl = this.resolveUrl(config.path);
    const keywords = config.keywords?.join(', ');
    const imageUrl = config.imageAsset ? this.resolveUrl(config.imageAsset.defaultPath) : null;

    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({
      name: 'robots',
      content: config.noIndex ? 'noindex, nofollow' : 'index, follow',
    });
    this.meta.updateTag({ name: 'author', content: BRAND_NAME });
    this.meta.updateTag({ name: 'application-name', content: BRAND_NAME });
    this.meta.updateTag({ name: 'theme-color', content: '#4f46e5' });
    if (keywords) {
      this.meta.updateTag({ name: 'keywords', content: keywords });
    }

    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: config.ogType ?? 'website' });
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl });
    this.meta.updateTag({ property: 'og:site_name', content: BRAND_NAME });
    this.meta.updateTag({
      property: 'og:locale',
      content: config.locale === 'es' ? 'es_ES' : 'en_US',
    });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });

    if (imageUrl) {
      this.meta.updateTag({ property: 'og:image', content: imageUrl });
      this.meta.updateTag({ name: 'twitter:image', content: imageUrl });
    } else {
      this.meta.removeTag("property='og:image'");
      this.meta.removeTag("name='twitter:image'");
    }

    // A noindex page (404, studio) must not canonicalise to an indexable URL.
    this.ensureCanonical(config.noIndex ? null : canonicalUrl);
    this.ensureAlternateLinks(config.noIndex ? undefined : config.alternates);

    const schemas = [
      this.createBrandSchema(),
      this.createCreatorSchema(),
      this.createSoftwareApplicationSchema(canonicalUrl),
      this.createWebSiteSchema(),
      this.createWebPageSchema(pageTitle, description, canonicalUrl, config.locale),
      ...(config.imageAsset ? [this.createImageSchema(config.imageAsset)] : []),
      ...(config.schemas ?? []),
    ];
    this.updateSchemas(schemas);
  }

  createBreadcrumbSchema(items: Array<{ name: string; path: string }>): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: this.resolveUrl(item.path),
      })),
    };
  }

  createArticleSchema(article: {
    headline: string;
    description: string;
    path: string;
    imagePath: string;
    datePublished: string;
    dateModified: string;
    locale: MarketingLocale;
    wordCount: number;
    keywords: string[];
  }): Record<string, unknown> {
    const organization = {
      '@type': 'Organization',
      name: BRAND_NAME,
      url: this.resolveUrl('/'),
      logo: { '@type': 'ImageObject', url: this.resolveUrl('/icon-512.png') },
    };
    return {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.headline,
      description: article.description,
      image: [this.resolveUrl(article.imagePath)],
      datePublished: article.datePublished,
      dateModified: article.dateModified,
      inLanguage: article.locale === 'es' ? 'es-ES' : 'en',
      wordCount: article.wordCount,
      keywords: article.keywords.join(', '),
      mainEntityOfPage: { '@type': 'WebPage', '@id': this.resolveUrl(article.path) },
      author: organization,
      publisher: organization,
    };
  }

  createFaqSchema(faqs: Array<{ question: string; answer: string }>): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    };
  }

  createImageSchema(asset: MarketingShowcaseAsset): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      name: asset.title.en,
      caption: asset.caption.en,
      contentUrl: this.resolveUrl(asset.defaultPath),
      thumbnailUrl: this.resolveUrl(asset.compactPath),
      width: asset.width,
      height: asset.height,
    };
  }

  private resolveUrl(path: string): string {
    const base = this.origin || BRAND_DOMAIN_OBJECTIVE;
    return `${base}${path === '/' ? '' : path}`;
  }

  private ensureCanonical(url: string | null): void {
    let canonical = this.document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!url) {
      canonical?.remove();
      return;
    }
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = url;
  }

  private ensureAlternateLinks(
    alternates?: Record<MarketingLocale | 'x-default', string>,
  ): void {
    const nodes = this.document.querySelectorAll("link[data-auctorio-alt='true']");
    nodes.forEach((node) => node.remove());
    if (!alternates) {
      return;
    }

    Object.entries(alternates).forEach(([hreflang, path]) => {
      const node = this.document.createElement('link');
      node.rel = 'alternate';
      node.hreflang = hreflang;
      node.href = this.resolveUrl(path);
      node.setAttribute('data-auctorio-alt', 'true');
      this.document.head.appendChild(node);
    });
  }

  private updateSchemas(schemas: Record<string, unknown>[]): void {
    // Also drops the server-rendered blocks, which hydration otherwise duplicates.
    this.document.head.querySelectorAll('script[type="application/ld+json"]').forEach((node) => node.remove());

    schemas
      .filter((schema) => !(schema['@type'] === 'BreadcrumbList' && (schema['itemListElement'] as unknown[]).length < 2))
      .forEach((schema) => {
      const node = this.document.createElement('script');
      node.type = 'application/ld+json';
      node.text = JSON.stringify(schema);
      this.document.head.appendChild(node);
    });
  }

  private createBrandSchema(): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: BRAND_NAME,
      description: BRAND_DESCRIPTION,
      url: this.origin || BRAND_DOMAIN_OBJECTIVE,
      slogan: BRAND_TAGLINE,
      parentOrganization: {
        '@type': 'Organization',
        name: 'Tecnoria',
        url: TECNORIA_LINKS.home,
      },
    };
  }

  private createCreatorSchema(): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Tecnoria',
      url: TECNORIA_LINKS.home,
      sameAs: [
        TECNORIA_LINKS.home,
      ],
    };
  }

  private createSoftwareApplicationSchema(canonicalUrl: string): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: BRAND_NAME,
      description: BRAND_DESCRIPTION,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: canonicalUrl,
      creator: {
        '@type': 'Organization',
        name: 'Tecnoria',
        url: TECNORIA_LINKS.home,
      },
    };
  }

  private createWebSiteSchema(): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: BRAND_NAME,
      url: this.origin || BRAND_DOMAIN_OBJECTIVE,
      creator: {
        '@type': 'Organization',
        name: 'Tecnoria',
        url: TECNORIA_LINKS.home,
      },
    };
  }

  private createWebPageSchema(
    title: string,
    description: string,
    canonicalUrl: string,
    locale: MarketingLocale,
  ): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonicalUrl,
      inLanguage: locale === 'es' ? 'es' : 'en',
      isPartOf: {
        '@type': 'WebSite',
        name: BRAND_NAME,
        url: this.origin || BRAND_DOMAIN_OBJECTIVE,
      },
      creator: {
        '@type': 'Organization',
        name: 'Tecnoria',
        url: TECNORIA_LINKS.home,
      },
    };
  }
}
