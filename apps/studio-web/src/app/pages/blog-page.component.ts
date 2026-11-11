import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ARTICLES, BLOG_PATH, getArticlePath, getArticleWordCount } from '../content/articles';
import { getAssetBySlug, getMarketingPath, type MarketingLocale } from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-blog-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-hero">
      <p class="marketing-kicker">Blog</p>
      <h1>{{ copy.title }}</h1>
      <p class="marketing-lead">{{ copy.lead }}</p>
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
          <p class="marketing-kicker">
            {{ article.kicker }} · {{ article.minutes }} {{ copy.minutes }}
            <span class="tag-chip" *ngIf="article.locale !== locale" [attr.lang]="article.locale">{{ article.locale === 'es' ? 'Español' : 'English' }}</span>
          </p>
          <h2 [attr.lang]="article.locale"><a [routerLink]="article.path">{{ article.title }}</a></h2>
          <p [attr.lang]="article.locale">{{ article.description }}</p>
          <a class="marketing-inline-link" [routerLink]="article.path">{{ copy.read }}</a>
        </article>
      </div>
    </section>
  `,
})
export class BlogPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly copy =
    this.locale === 'es'
      ? { title: 'Guías sobre flujo editorial, SEO y publicación', lead: 'Artículos prácticos para redacciones y equipos de contenido: cómo planificar, revisar y publicar mejor.', minutes: 'min de lectura', read: 'Leer la guía' }
      : { title: 'Guides on editorial workflow, SEO and publishing', lead: 'Practical articles for newsrooms and content teams on planning, reviewing and publishing better. Some guides are only available in Spanish for now.', minutes: 'min read', read: 'Read the guide' };
  // Every guide is listed in both indexes, own-language first, so the blog is never empty in either locale.
  readonly articles = [...ARTICLES].sort((a, b) => Number(b.locale === this.locale) - Number(a.locale === this.locale)).map((article) => ({
    ...article,
    path: getArticlePath(article),
    asset: getAssetBySlug(article.heroAssetSlug),
    minutes: Math.round(getArticleWordCount(article) / 220),
  }));

  constructor() {
    const path = BLOG_PATH[this.locale];
    this.seo.update({
      title: this.locale === 'es' ? 'Blog: flujo editorial, SEO y publicación' : 'Blog: editorial workflow, SEO and publishing',
      description:
        this.locale === 'es'
          ? 'Guías prácticas para redacciones y equipos de contenido sobre flujo de trabajo editorial, SEO para medios, uso de IA y publicación en varias webs.'
          : 'Practical guides for newsrooms and content teams on editorial workflow, SEO for publishers, using AI and publishing to several sites.',
      path,
      locale: this.locale,
      alternates: { en: BLOG_PATH.en, es: BLOG_PATH.es, 'x-default': BLOG_PATH.en },
      schemas: [
        this.seo.createBreadcrumbSchema([
          { name: this.locale === 'es' ? 'Inicio' : 'Home', path: getMarketingPath(this.locale, 'home') },
          { name: 'Blog', path },
        ]),
      ],
    });
  }
}
