import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BRAND_NAME,
  type MarketingLocale,
  getAlternatePagePaths,
  getLocalizedAssets,
  getLocalizedPageSeo,
  getMarketingPath,
  getUseCasePath,
} from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-gallery-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-hero">
      <p class="marketing-kicker">{{ locale === 'en' ? 'Gallery' : 'Galeria' }}</p>
      <h1>
        {{
          locale === 'en'
            ? 'Generated visuals curated for publisher positioning, examples and use-case pages.'
            : 'Visuales generados y curados para posicionamiento publisher, ejemplos y paginas de casos de uso.'
        }}
      </h1>
      <p class="marketing-lead">
        {{
          locale === 'en'
            ? 'Each image is treated as a marketing asset with stable paths, descriptive alt text and clear links to the use cases it supports.'
            : 'Cada imagen se trata como un asset de marketing con rutas estables, alt descriptivo y relacion explicita con los casos de uso que apoya.'
        }}
      </p>
    </section>

    <section class="marketing-section">
      <div class="gallery-grid">
        <article class="marketing-card gallery-card" *ngFor="let asset of assets">
          <figure class="marketing-visual">
            <img
              [src]="asset.compactPath"
              [srcset]="asset.compactPath + ' 960w, ' + asset.defaultPath + ' 1600w'"
              sizes="(max-width: 1180px) 100vw, 48vw"
              [alt]="asset.localizedAlt"
              [width]="asset.width"
              [height]="asset.height"
              loading="lazy"
              decoding="async"
            />
          </figure>
          <div class="marketing-card__body">
            <h2>{{ asset.localizedTitle }}</h2>
            <p>{{ asset.localizedCaption }}</p>
            <div class="tag-list">
              <span class="tag-chip" *ngFor="let tag of asset.localizedTags">{{ tag }}</span>
            </div>
            <div class="authority-links">
              <a
                *ngFor="let useCaseId of asset.relatedUseCases"
                [routerLink]="getUseCasePath(locale, useCaseId)"
              >
                {{ useCaseLabels[useCaseId] }}
              </a>
            </div>
          </div>
        </article>
      </div>
    </section>
  `,
})
export class GalleryPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly assets = getLocalizedAssets(this.locale);
  readonly useCaseLabels = {
    digital_publishers: this.locale === 'en' ? 'Digital publishers' : 'Publicadores digitales',
    agencies_brands: this.locale === 'en' ? 'Agencies and brands' : 'Agencias y marcas',
    multi_site_editorial:
      this.locale === 'en' ? 'Multi-site editorial' : 'Operaciones multi-site',
  } as const;

  constructor() {
    const seoEntry = getLocalizedPageSeo(this.locale, 'gallery');
    const alternates = getAlternatePagePaths('gallery');

    this.seo.update({
      title: seoEntry.title,
      description: seoEntry.description,
      path: getMarketingPath(this.locale, 'gallery'),
      locale: this.locale,
      keywords: seoEntry.keywords,
      alternates: {
        ...alternates,
        'x-default': alternates.en,
      },
      imageAsset: this.assets[0] ?? null,
      schemas: [
        this.seo.createBreadcrumbSchema([
          { name: BRAND_NAME, path: getMarketingPath(this.locale, 'home') },
          {
            name: this.locale === 'en' ? 'Gallery' : 'Galeria',
            path: getMarketingPath(this.locale, 'gallery'),
          },
        ]),
      ],
    });
  }

  protected readonly getUseCasePath = getUseCasePath;
}
