import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BRAND_NAME,
  type MarketingLocale,
  getAlternatePagePaths,
  getAssetBySlug,
  getLocalizedAssets,
  getMarketingPath,
  getStudioLoginPath,
  getUseCaseAlternatePaths,
  getUseCaseBySlug,
  getUseCaseSeo,
} from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-use-case-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-hero" *ngIf="useCase; else missingState">
      <p class="marketing-kicker">{{ useCase.audience[locale] }}</p>
      <h1>{{ useCase.heroTitle[locale] }}</h1>
      <p class="marketing-lead">{{ useCase.heroIntro[locale] }}</p>
    </section>

    <section class="marketing-section" *ngIf="useCase && leadAsset">
      <article class="marketing-card">
        <figure class="marketing-visual marketing-visual--hero">
          <img
            [src]="leadAsset.defaultPath"
            [srcset]="leadAsset.compactPath + ' 960w, ' + leadAsset.defaultPath + ' 1600w'"
            sizes="100vw"
            [alt]="leadAsset.localizedAlt"
            [width]="leadAsset.width"
            [height]="leadAsset.height"
            decoding="async"
          />
        </figure>
        <div class="marketing-card__body">
          <h2>{{ leadAsset.localizedTitle }}</h2>
          <p>{{ leadAsset.localizedCaption }}</p>
        </div>
      </article>
    </section>

    <section class="marketing-section" *ngIf="useCase">
      <div class="content-split">
        <article class="marketing-card">
          <p class="marketing-kicker">{{ locale === 'en' ? 'Typical friction' : 'Fricciones tipicas' }}</p>
          <h2>{{ locale === 'en' ? 'What usually slows the operation down.' : 'Lo que suele frenar la operativa.' }}</h2>
          <ul class="marketing-bullet-list">
            <li *ngFor="let pain of useCase.pains[locale]">{{ pain }}</li>
          </ul>
        </article>

        <article class="marketing-card marketing-card--dark">
          <p class="marketing-kicker">{{ locale === 'en' ? 'Outcomes' : 'Resultados' }}</p>
          <h2>{{ locale === 'en' ? 'What changes when the workflow is structured.' : 'Lo que cambia cuando el workflow esta estructurado.' }}</h2>
          <ul class="marketing-bullet-list">
            <li *ngFor="let outcome of useCase.outcomes[locale]">{{ outcome }}</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="marketing-section" *ngIf="useCase">
      <div class="section-headline">
        <p class="marketing-kicker">{{ locale === 'en' ? 'Deliverables' : 'Entregables' }}</p>
        <h2>{{ locale === 'en' ? 'The layers that make this workflow viable.' : 'Las capas que hacen viable este workflow.' }}</h2>
      </div>

      <div class="marketing-card-grid marketing-card-grid--triple">
        <article class="marketing-card" *ngFor="let deliverable of useCase.deliverables[locale]">
          <p>{{ deliverable }}</p>
        </article>
      </div>
    </section>

    <section class="marketing-section" *ngIf="supportingAssets.length > 0">
      <div class="section-headline">
        <p class="marketing-kicker">{{ locale === 'en' ? 'Visual support' : 'Apoyo visual' }}</p>
        <h2>{{ locale === 'en' ? 'Generated visuals that explain the operating model.' : 'Visuales generados que explican el modelo operativo.' }}</h2>
      </div>

      <div class="gallery-grid">
        <article class="marketing-card gallery-card" *ngFor="let asset of supportingAssets">
          <figure class="marketing-visual">
            <img
              [src]="asset.compactPath"
              [srcset]="asset.compactPath + ' 960w, ' + asset.defaultPath + ' 1600w'"
              sizes="(max-width: 780px) 100vw, 33vw"
              [alt]="asset.localizedAlt"
              [width]="asset.width"
              [height]="asset.height"
              loading="lazy"
              decoding="async"
            />
          </figure>
          <h3>{{ asset.localizedTitle }}</h3>
          <p>{{ asset.localizedCaption }}</p>
        </article>
      </div>
    </section>

    <section class="marketing-section marketing-section--final" *ngIf="useCase">
      <div class="cta-banner">
        <div>
          <p class="marketing-kicker">{{ locale === 'en' ? 'Next step' : 'Siguiente paso' }}</p>
          <h2>{{ locale === 'en' ? 'Use the public layer for positioning. Use the Studio when the team is ready to operate.' : 'Usa la capa publica para posicionamiento. Usa el Studio cuando el equipo este listo para operar.' }}</h2>
        </div>

        <div class="wrap-actions">
          <a class="marketing-button marketing-button--primary" [href]="studioLoginPath">
            {{ locale === 'en' ? 'Enter Studio' : 'Entrar al Studio' }}
          </a>
          <a
            class="marketing-button marketing-button--ghost"
            [routerLink]="getMarketingPath(locale, 'use_cases')"
          >
            {{ locale === 'en' ? 'All use cases' : 'Todos los casos de uso' }}
          </a>
        </div>
      </div>
    </section>

    <ng-template #missingState>
      <section class="page-hero">
        <p class="marketing-kicker">404</p>
        <h1>
          {{
            locale === 'en'
              ? 'This URL does not match a published use case.'
              : 'Esta URL no corresponde a un caso de uso publicado.'
          }}
        </h1>
        <p class="marketing-lead">
          {{
            locale === 'en'
              ? 'Go back to the overview, continue exploring the public site or enter the Studio directly.'
              : 'Vuelve al overview, sigue explorando la capa publica o entra directamente al Studio.'
          }}
        </p>
        <div class="hero-actions">
          <a class="marketing-button marketing-button--primary" [routerLink]="getMarketingPath(locale, 'use_cases')">
            {{ locale === 'en' ? 'Back to use cases' : 'Volver a casos de uso' }}
          </a>
          <a class="marketing-button marketing-button--ghost" [href]="studioLoginPath">
            {{ locale === 'en' ? 'Enter Studio' : 'Entrar al Studio' }}
          </a>
        </div>
      </section>
    </ng-template>
  `,
})
export class UseCaseDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly studioLoginPath = getStudioLoginPath();
  readonly useCase = getUseCaseBySlug(this.locale, this.route.snapshot.paramMap.get('slug'));
  readonly assets = this.useCase ? getLocalizedAssets(this.locale, this.useCase.assetSlugs) : [];
  readonly leadAsset = this.assets[0] ?? null;
  readonly supportingAssets = this.assets.slice(1);

  constructor() {
    if (this.useCase) {
      const seoEntry = getUseCaseSeo(this.locale, this.useCase);
      const alternates = getUseCaseAlternatePaths(this.useCase.id);

      this.seo.update({
        title: seoEntry.title,
        description: seoEntry.description,
        path: alternates[this.locale],
        locale: this.locale,
        keywords: seoEntry.keywords,
        alternates: {
          ...alternates,
          'x-default': alternates.en,
        },
        imageAsset: getAssetBySlug(this.useCase.assetSlugs[0] || ''),
        schemas: [
          this.seo.createBreadcrumbSchema([
            { name: BRAND_NAME, path: getMarketingPath(this.locale, 'home') },
            {
              name: this.locale === 'en' ? 'Use cases' : 'Casos de uso',
              path: getMarketingPath(this.locale, 'use_cases'),
            },
            {
              name: this.useCase.name[this.locale],
              path: alternates[this.locale],
            },
          ]),
        ],
      });
      return;
    }

    const useCasesAlternates = getAlternatePagePaths('use_cases');
    this.seo.update({
      title: this.locale === 'en' ? 'Use case not found' : 'Caso de uso no encontrado',
      description:
        this.locale === 'en'
          ? 'The requested URL does not match a public use case from Auctorio.'
          : 'La ruta solicitada no corresponde a un caso de uso publico de Auctorio.',
      path: getMarketingPath(this.locale, 'use_cases'),
      locale: this.locale,
      noIndex: true,
      alternates: {
        ...useCasesAlternates,
        'x-default': useCasesAlternates.en,
      },
    });
  }

  protected readonly getMarketingPath = getMarketingPath;
}
