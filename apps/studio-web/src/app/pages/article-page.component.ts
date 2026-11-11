import { CommonModule } from '@angular/common';
import { Component, RESPONSE_INIT, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BLOG_PATH,
  getArticle,
  getArticleAlternates,
  getArticlePath,
  getArticleToc,
  getArticleWordCount,
} from '../content/articles';
import { getAssetBySlug, getMarketingPath, type MarketingLocale } from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

const ARTICLE_COPY = {
  es: {
    breadcrumbs: 'Migas de pan', home: 'Inicio', by: 'Por el equipo editorial de Auctorio', updated: 'Actualizado el',
    minutes: 'min de lectura', toc: 'Índice', inThisGuide: 'En esta guía', faq: 'Preguntas frecuentes', faqId: 'preguntas-frecuentes',
    ctaTitle: 'Pon en marcha tu flujo editorial con Auctorio',
    ctaLead: 'Planificación por demanda de búsqueda, revisión con comprobaciones previas y publicación en todas tus webs y redes.',
    cta: 'Únete a la lista de espera', useCases: 'Ver casos de uso',
    missingTitle: 'No encontramos este artículo', missingLead: 'Puede que se haya movido. Consulta el resto de guías del blog.', toBlog: 'Ir al blog',
  },
  en: {
    breadcrumbs: 'Breadcrumbs', home: 'Home', by: 'By the Auctorio editorial team', updated: 'Updated',
    minutes: 'min read', toc: 'Table of contents', inThisGuide: 'In this guide', faq: 'Frequently asked questions', faqId: 'faq',
    ctaTitle: 'Run your editorial workflow in Auctorio',
    ctaLead: 'Planning from search demand, review with pre-publication checks and publishing to every site and channel.',
    cta: 'Join the waitlist', useCases: 'See use cases',
    missingTitle: 'We could not find this article', missingLead: 'It may have moved. Browse the other guides on the blog.', toBlog: 'Go to the blog',
  },
} as const;

@Component({
  selector: 'app-article-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <ng-container *ngIf="article; else missing">
      <nav class="breadcrumbs" [attr.aria-label]="t.breadcrumbs">
        <a [routerLink]="homePath">{{ t.home }}</a>
        <span aria-hidden="true">/</span>
        <a [routerLink]="blogPath">Blog</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{{ article.kicker }}</span>
      </nav>

      <header class="page-hero article-hero">
        <p class="marketing-kicker">{{ article.kicker }}</p>
        <h1>{{ article.title }}</h1>
        <p class="marketing-lead">{{ article.lead }}</p>
        <p class="article-meta">
          {{ t.by }} ·
          <time [attr.datetime]="article.dateModified">{{ t.updated }} {{ updatedLabel }}</time>
          · {{ minutes }} {{ t.minutes }}
        </p>
      </header>

      <figure class="marketing-visual marketing-visual--hero article-figure" *ngIf="asset">
        <img
          [src]="asset.compactPath"
          [srcset]="asset.compactPath + ' 960w, ' + asset.defaultPath + ' 1600w'"
          sizes="(max-width: 1200px) 100vw, 1136px"
          [alt]="asset.alt[locale]"
          [width]="asset.width"
          [height]="asset.height"
          fetchpriority="high"
          decoding="async"
        />
      </figure>

      <div class="article-layout">
        <aside class="article-toc" [attr.aria-label]="t.toc">
          <p class="marketing-kicker">{{ t.inThisGuide }}</p>
          <ol>
            <li *ngFor="let entry of toc"><a [href]="articlePath + '#' + entry.id">{{ entry.title }}</a></li>
            <li><a [href]="articlePath + '#' + t.faqId">{{ t.faq }}</a></li>
          </ol>
        </aside>

        <article class="article-body">
          <div [innerHTML]="html"></div>

          <section class="article-faq" [attr.aria-labelledby]="t.faqId">
            <h2 [id]="t.faqId">{{ t.faq }}</h2>
            <div class="faq-list faq-list--full">
              <details class="faq-item" *ngFor="let faq of article.faq">
                <summary><h3>{{ faq.question }}</h3></summary>
                <p>{{ faq.answer }}</p>
              </details>
            </div>
          </section>
        </article>
      </div>

      <section class="marketing-section marketing-section--final">
        <div class="cta-banner">
          <div>
            <p class="marketing-kicker">Auctorio</p>
            <h2>{{ t.ctaTitle }}</h2>
            <p class="marketing-copy">{{ t.ctaLead }}</p>
          </div>
          <div class="wrap-actions">
            <a class="marketing-button marketing-button--primary" [routerLink]="contactPath">{{ t.cta }}</a>
            <a class="marketing-button marketing-button--ghost" [routerLink]="useCasesPath">{{ t.useCases }}</a>
          </div>
        </div>
      </section>
    </ng-container>

    <ng-template #missing>
      <section class="page-hero">
        <p class="marketing-kicker">404</p>
        <h1>{{ t.missingTitle }}</h1>
        <p class="marketing-lead">{{ t.missingLead }}</p>
        <div class="hero-actions">
          <a class="marketing-button marketing-button--primary" [routerLink]="blogPath">{{ t.toBlog }}</a>
        </div>
      </section>
    </ng-template>
  `,
})
export class ArticlePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly t = ARTICLE_COPY[this.locale];
  readonly article = getArticle(this.locale, this.route.snapshot.paramMap.get('slug'));
  readonly asset = this.article ? getAssetBySlug(this.article.heroAssetSlug) : null;
  readonly toc = this.article ? getArticleToc(this.article) : [];
  readonly wordCount = this.article ? getArticleWordCount(this.article) : 0;
  readonly minutes = Math.max(1, Math.round(this.wordCount / 220));
  readonly homePath = getMarketingPath(this.locale, 'home');
  readonly blogPath = BLOG_PATH[this.locale];
  readonly contactPath = getMarketingPath(this.locale, 'contact');
  readonly useCasesPath = getMarketingPath(this.locale, 'use_cases');
  readonly articlePath = this.article ? getArticlePath(this.article) : this.blogPath;
  // Static first-party HTML compiled into the bundle; trusted so the sanitizer keeps the heading ids the TOC links to.
  readonly html = this.article ? this.sanitizer.bypassSecurityTrustHtml(this.article.html) : '';
  readonly updatedLabel = this.article
    ? new Intl.DateTimeFormat(this.locale === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(this.article.dateModified))
    : '';

  constructor() {
    if (!this.article) {
      const response = inject(RESPONSE_INIT, { optional: true });
      if (response) {
        response.status = 404;
      }
      this.seo.update({
        title: this.t.missingTitle,
        description: this.t.missingLead,
        path: this.blogPath,
        locale: this.locale,
        noIndex: true,
      });
      return;
    }

    const article = this.article;
    this.seo.update({
      title: article.seoTitle,
      description: article.description,
      path: this.articlePath,
      locale: this.locale,
      keywords: article.keywords,
      imageAsset: this.asset,
      ogType: 'article',
      alternates: getArticleAlternates(article),
      schemas: [
        this.seo.createArticleSchema({
          headline: article.title,
          description: article.description,
          path: this.articlePath,
          imagePath: this.asset?.defaultPath ?? '/icon-512.png',
          datePublished: article.datePublished,
          dateModified: article.dateModified,
          locale: article.locale,
          wordCount: this.wordCount,
          keywords: article.keywords,
        }),
        this.seo.createBreadcrumbSchema([
          { name: this.t.home, path: this.homePath },
          { name: 'Blog', path: this.blogPath },
          { name: article.title, path: this.articlePath },
        ]),
        this.seo.createFaqSchema([...article.faq]),
      ],
    });
  }
}
