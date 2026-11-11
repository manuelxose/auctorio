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
      <p class="marketing-kicker">{{ locale === 'en' ? 'Workflows' : 'Flujos de trabajo' }}</p>
      <h1>
        {{
          locale === 'en'
            ? 'Editorial workflow examples, step by step'
            : 'Ejemplos de flujo editorial, paso a paso'
        }}
      </h1>
      <p class="marketing-lead">
        {{
          locale === 'en'
            ? 'Four situations every editorial team knows: choosing what to cover, reviewing before publishing, sending one piece everywhere and planning the week.'
            : 'Cuatro situaciones que conoce cualquier redacción: decidir qué cubrir, revisar antes de publicar, enviar una pieza a todas partes y planificar la semana.'
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
          <p class="marketing-kicker">{{ locale === 'en' ? 'Demo' : 'Demo' }}</p>
          <h2>
            {{
              locale === 'en'
                ? 'Want to see these workflows with your own sites?'
                : '¿Quieres ver estos flujos con tus propias webs?'
            }}
          </h2>
        </div>
        <div class="wrap-actions">
          <a class="marketing-button marketing-button--primary" [routerLink]="getMarketingPath(locale, 'contact')">
            {{ locale === 'en' ? 'Request a demo' : 'Solicitar demo' }}
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
