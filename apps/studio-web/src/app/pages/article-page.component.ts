import { CommonModule } from '@angular/common';
import { Component, RESPONSE_INIT, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BLOG_PATH,
  getArticle,
  getArticlePath,
  getArticleToc,
  getArticleWordCount,
} from '../content/articles';
import { getAssetBySlug, getMarketingPath, type MarketingLocale } from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-article-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <ng-container *ngIf="article; else missing">
      <nav class="breadcrumbs" aria-label="Migas de pan">
        <a [routerLink]="homePath">Inicio</a>
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
          Por el equipo editorial de Auctorio ·
          <time [attr.datetime]="article.dateModified">Actualizado el {{ updatedLabel }}</time>
          · {{ minutes }} min de lectura
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
        <aside class="article-toc" aria-label="Índice">
          <p class="marketing-kicker">En esta guía</p>
          <ol>
            <li *ngFor="let entry of toc"><a [href]="articlePath + '#' + entry.id">{{ entry.title }}</a></li>
            <li><a [href]="articlePath + '#preguntas-frecuentes'">Preguntas frecuentes</a></li>
          </ol>
        </aside>

        <article class="article-body">
          <div [innerHTML]="html"></div>

          <section class="article-faq" aria-labelledby="preguntas-frecuentes">
            <h2 id="preguntas-frecuentes">Preguntas frecuentes</h2>
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
            <h2>Pon en marcha tu flujo editorial con Auctorio</h2>
            <p class="marketing-copy">Planificación por demanda de búsqueda, revisión con comprobaciones previas y publicación en todas tus webs y redes.</p>
          </div>
          <div class="wrap-actions">
            <a class="marketing-button marketing-button--primary" [routerLink]="contactPath">Únete a la lista de espera</a>
            <a class="marketing-button marketing-button--ghost" [routerLink]="useCasesPath">Ver casos de uso</a>
          </div>
        </div>
      </section>
    </ng-container>

    <ng-template #missing>
      <section class="page-hero">
        <p class="marketing-kicker">404</p>
        <h1>No encontramos este artículo</h1>
        <p class="marketing-lead">Puede que se haya movido. Consulta el resto de guías del blog.</p>
        <div class="hero-actions">
          <a class="marketing-button marketing-button--primary" [routerLink]="blogPath">Ir al blog</a>
        </div>
      </section>
    </ng-template>
  `,
})
export class ArticlePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'es';
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
    ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(this.article.dateModified))
    : '';

  constructor() {
    if (!this.article) {
      const response = inject(RESPONSE_INIT, { optional: true });
      if (response) {
        response.status = 404;
      }
      this.seo.update({
        title: 'Artículo no encontrado',
        description: 'El artículo que buscas no existe o se ha movido.',
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
          { name: 'Inicio', path: this.homePath },
          { name: 'Blog', path: this.blogPath },
          { name: article.title, path: this.articlePath },
        ]),
        this.seo.createFaqSchema([...article.faq]),
      ],
    });
  }
}
