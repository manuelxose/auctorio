import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BLOG_PATH, getArticlePath, getArticles, getArticleWordCount } from '../content/articles';
import { getAssetBySlug, getMarketingPath, type MarketingLocale } from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-blog-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-hero">
      <p class="marketing-kicker">Blog</p>
      <h1>Guías sobre flujo editorial, SEO y publicación</h1>
      <p class="marketing-lead">
        Artículos prácticos para redacciones y equipos de contenido: cómo planificar, revisar y publicar mejor.
      </p>
    </section>

    <section class="marketing-section">
      <div class="marketing-card-grid marketing-card-grid--triple">
        <article class="marketing-card use-case-card" *ngFor="let article of articles">
          <figure class="marketing-visual" *ngIf="article.asset">
            <img
              [src]="article.asset.compactPath"
              [srcset]="article.asset.compactPath + ' 960w, ' + article.asset.defaultPath + ' 1600w'"
              sizes="(max-width: 780px) 100vw, 33vw"
              [alt]="article.asset.alt[locale]"
              [width]="article.asset.width"
              [height]="article.asset.height"
              loading="lazy"
              decoding="async"
            />
          </figure>
          <p class="marketing-kicker">{{ article.kicker }} · {{ article.minutes }} min de lectura</p>
          <h2><a [routerLink]="article.path">{{ article.title }}</a></h2>
          <p>{{ article.description }}</p>
          <a class="marketing-inline-link" [routerLink]="article.path">Leer la guía</a>
        </article>
      </div>
    </section>
  `,
})
export class BlogPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'es';
  readonly articles = getArticles(this.locale).map((article) => ({
    ...article,
    path: getArticlePath(article),
    asset: getAssetBySlug(article.heroAssetSlug),
    minutes: Math.round(getArticleWordCount(article) / 220),
  }));

  constructor() {
    const path = BLOG_PATH[this.locale] ?? '/';
    this.seo.update({
      title: 'Blog: flujo editorial, SEO y publicación',
      description:
        'Guías prácticas para redacciones y equipos de contenido sobre flujo de trabajo editorial, SEO para medios, uso de IA y publicación en varias webs.',
      path,
      locale: this.locale,
      schemas: [
        this.seo.createBreadcrumbSchema([
          { name: 'Inicio', path: getMarketingPath(this.locale, 'home') },
          { name: 'Blog', path },
        ]),
      ],
    });
  }
}
