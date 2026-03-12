import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BRAND_NAME,
  type MarketingLocale,
  getAlternatePagePaths,
  getAssetBySlug,
  getLocalizedPageSeo,
  getLocalizedUseCases,
  getMarketingPath,
} from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-use-cases-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-hero">
      <p class="marketing-kicker">{{ locale === 'en' ? 'Use cases' : 'Casos de uso' }}</p>
      <h1>
        {{
          locale === 'en'
            ? 'Content operations use cases built to rank, review and publish at scale.'
            : 'Casos de uso de operaciones de contenido pensados para posicionar, revisar y publicar a escala.'
        }}
      </h1>
      <p class="marketing-lead">
        {{
          locale === 'en'
            ? 'Auctorio is positioned first for digital publishers, then extended to agencies, brands and multi-site editorial operations that need a stronger workflow.'
            : 'Auctorio se posiciona primero para publishers digitales y luego se extiende a agencias, marcas y operaciones editoriales multi-site que necesitan un workflow más fuerte.'
        }}
      </p>
    </section>

    <section class="marketing-section">
      <div class="marketing-card-grid marketing-card-grid--triple">
        <article class="marketing-card marketing-card--tall use-case-card" *ngFor="let useCase of useCases">
          <figure class="marketing-visual" *ngIf="useCase.leadAsset">
            <img
              [src]="useCase.leadAsset.compactPath"
              [srcset]="useCase.leadAsset.compactPath + ' 960w, ' + useCase.leadAsset.defaultPath + ' 1600w'"
              sizes="(max-width: 780px) 100vw, 33vw"
              [alt]="useCase.leadAsset.localizedAlt"
              [width]="useCase.leadAsset.width"
              [height]="useCase.leadAsset.height"
              loading="lazy"
              decoding="async"
            />
          </figure>

          <p class="marketing-kicker">{{ useCase.localizedAudience }}</p>
          <h2>{{ useCase.localizedName }}</h2>
          <p>{{ useCase.localizedSummary }}</p>

          <div class="marketing-list">
            <strong>{{ locale === 'en' ? 'Outcomes' : 'Resultados' }}</strong>
            <ul>
              <li *ngFor="let item of useCase.localizedOutcomes">{{ item }}</li>
            </ul>
          </div>

          <a class="marketing-inline-link" [routerLink]="useCase.path">
            {{ locale === 'en' ? 'See full use case' : 'Ver caso completo' }}
          </a>
        </article>
      </div>
    </section>
  `,
})
export class UseCasesPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly useCases = getLocalizedUseCases(this.locale).map((useCase) => {
    const leadAsset = getAssetBySlug(useCase.assetSlugs[0] || '');
    return {
      ...useCase,
      leadAsset: leadAsset
        ? {
            ...leadAsset,
            localizedAlt: leadAsset.alt[this.locale],
          }
        : null,
    };
  });

  constructor() {
    const seoEntry = getLocalizedPageSeo(this.locale, 'use_cases');
    const alternates = getAlternatePagePaths('use_cases');

    this.seo.update({
      title: seoEntry.title,
      description: seoEntry.description,
      path: getMarketingPath(this.locale, 'use_cases'),
      locale: this.locale,
      keywords: seoEntry.keywords,
      alternates: {
        ...alternates,
        'x-default': alternates.en,
      },
      imageAsset: getAssetBySlug('publisher-command-center'),
      schemas: [
        this.seo.createBreadcrumbSchema([
          { name: BRAND_NAME, path: getMarketingPath(this.locale, 'home') },
          {
            name: this.locale === 'en' ? 'Use cases' : 'Casos de uso',
            path: getMarketingPath(this.locale, 'use_cases'),
          },
        ]),
      ],
    });
  }
}
