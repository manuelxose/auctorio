import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BRAND_NAME,
  type MarketingLocale,
  getAlternatePagePaths,
  getLocalizedExamples,
  getLocalizedPageSeo,
  getMarketingPath,
} from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-examples-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-hero">
      <p class="marketing-kicker">{{ locale === 'en' ? 'Examples' : 'Ejemplos' }}</p>
      <h1>
        {{
          locale === 'en'
            ? 'Content workflow examples for publishers, editorial desks and multi-site teams.'
            : 'Ejemplos de workflow de contenido para publishers, redacciones y equipos multi-site.'
        }}
      </h1>
      <p class="marketing-lead">
        {{
          locale === 'en'
            ? 'These examples explain how briefs, review loops, assets and publishing states can live inside one operating model.'
            : 'Estos ejemplos explican como briefs, revisiones, assets y estados de publicacion pueden convivir dentro del mismo modelo operativo.'
        }}
      </p>
    </section>

    <section class="marketing-section">
      <div class="examples-grid">
        <article class="marketing-card example-card example-card--wide" *ngFor="let example of examples">
          <figure class="marketing-visual" *ngIf="example.asset">
            <img
              [src]="example.asset.compactPath"
              [srcset]="example.asset.compactPath + ' 960w, ' + example.asset.defaultPath + ' 1600w'"
              sizes="(max-width: 1180px) 100vw, 48vw"
              [alt]="example.asset.alt[locale]"
              [width]="example.asset.width"
              [height]="example.asset.height"
              loading="lazy"
              decoding="async"
            />
          </figure>
          <div class="marketing-card__body">
            <p class="marketing-kicker">{{ example.localizedEyebrow }}</p>
            <h2>{{ example.localizedTitle }}</h2>
            <p>{{ example.localizedSummary }}</p>
            <ul class="marketing-bullet-list">
              <li *ngFor="let bullet of example.localizedBullets">{{ bullet }}</li>
            </ul>
          </div>
        </article>
      </div>
    </section>

    <section class="marketing-section marketing-section--final">
      <div class="cta-banner">
        <div>
          <p class="marketing-kicker">{{ locale === 'en' ? 'Use cases' : 'Casos de uso' }}</p>
          <h2>
            {{
              locale === 'en'
                ? 'Examples explain the workflow. Use cases explain where the workflow creates leverage.'
                : 'Los ejemplos explican el workflow. Los casos de uso explican donde crea ventaja.'
            }}
          </h2>
        </div>
        <div class="wrap-actions">
          <a class="marketing-button marketing-button--primary" [routerLink]="getMarketingPath(locale, 'use_cases')">
            {{ locale === 'en' ? 'Explore use cases' : 'Explorar casos de uso' }}
          </a>
        </div>
      </div>
    </section>
  `,
})
export class ExamplesPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly examples = getLocalizedExamples(this.locale);

  constructor() {
    const seoEntry = getLocalizedPageSeo(this.locale, 'examples');
    const alternates = getAlternatePagePaths('examples');

    this.seo.update({
      title: seoEntry.title,
      description: seoEntry.description,
      path: getMarketingPath(this.locale, 'examples'),
      locale: this.locale,
      keywords: seoEntry.keywords,
      alternates: {
        ...alternates,
        'x-default': alternates.en,
      },
      imageAsset: this.examples[0]?.asset ?? null,
      schemas: [
        this.seo.createBreadcrumbSchema([
          { name: BRAND_NAME, path: getMarketingPath(this.locale, 'home') },
          {
            name: this.locale === 'en' ? 'Examples' : 'Ejemplos',
            path: getMarketingPath(this.locale, 'examples'),
          },
        ]),
      ],
    });
  }

  protected readonly getMarketingPath = getMarketingPath;
}
