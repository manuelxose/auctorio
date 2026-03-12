import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  BRAND_NAME,
  type MarketingLocale,
  getAlternatePagePaths,
  getLocalizedFaqEntries,
  getLocalizedPageSeo,
  getMarketingPath,
} from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-faq-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page-hero">
      <p class="marketing-kicker">FAQ</p>
      <h1>
        {{
          locale === 'en'
            ? 'Frequently asked questions about Auctorio'
            : 'Preguntas frecuentes sobre Auctorio'
        }}
      </h1>
      <p class="marketing-lead">
        {{
          locale === 'en'
            ? 'Everything you need to know about the platform, editorial workflow, integrations and getting started.'
            : 'Todo lo que necesitas saber sobre la plataforma, flujo editorial, integraciones y cómo empezar.'
        }}
      </p>
    </section>

    <section class="marketing-section">
      <div class="faq-list faq-list--full">
        <details class="faq-item" *ngFor="let faq of faqs; let first = first" [attr.open]="first ? '' : null">
          <summary><h2>{{ faq.question }}</h2></summary>
          <p>{{ faq.answer }}</p>
        </details>
      </div>
    </section>
  `,
})
export class FaqPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly faqs = getLocalizedFaqEntries(this.locale);

  constructor() {
    const seoEntry = getLocalizedPageSeo(this.locale, 'faq');
    const alternates = getAlternatePagePaths('faq');

    this.seo.update({
      title: seoEntry.title,
      description: seoEntry.description,
      path: getMarketingPath(this.locale, 'faq'),
      locale: this.locale,
      keywords: seoEntry.keywords,
      alternates: {
        ...alternates,
        'x-default': alternates.en,
      },
      schemas: [
        this.seo.createFaqSchema(this.faqs),
        this.seo.createBreadcrumbSchema([
          { name: BRAND_NAME, path: getMarketingPath(this.locale, 'home') },
          { name: 'FAQ', path: getMarketingPath(this.locale, 'faq') },
        ]),
      ],
    });
  }
}
