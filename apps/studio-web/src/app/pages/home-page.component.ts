import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BRAND_NAME,
  TECNORIA_LINKS,
  type MarketingLocale,
  getAlternatePagePaths,
  getAssetBySlug,
  getHomeAssets,
  getHomeExamples,
  getLocalizedFaqEntries,
  getLocalizedPageSeo,
  getLocalizedUseCases,
  getMarketingHomeContent,
  getMarketingPath,
} from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="hero-section">
      <div class="hero-grid">
        <article class="hero-copy">
          <p class="marketing-kicker">{{ content.kicker }}</p>
          <h1 class="hero-title">{{ content.title }}</h1>
          <p class="marketing-lead">{{ content.lead }}</p>

          <div class="hero-actions">
            <a class="marketing-button marketing-button--primary" [routerLink]="getPagePath('contact')">
              {{ content.primaryCta }}
            </a>
            <a
              class="marketing-button marketing-button--ghost"
              [routerLink]="getPagePath('use_cases')"
            >
              {{ content.secondaryCta }}
            </a>
          </div>

          <div class="trust-strip">
            <span *ngFor="let highlight of content.highlights">{{ highlight }}</span>
          </div>
        </article>

        <aside class="hero-panel">
          <div class="stat-grid">
            <div class="stat-card" *ngFor="let metric of content.metrics">
              <strong>{{ metric.value }}</strong>
              <span>{{ metric.label }}</span>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section class="marketing-section">
      <div class="section-headline">
        <p class="marketing-kicker">{{ content.problemEyebrow }}</p>
        <h2>{{ content.problemTitle }}</h2>
      </div>

      <div class="marketing-card-grid marketing-card-grid--triple">
        <article class="marketing-card mini-card" *ngFor="let pain of content.painPoints">
          <p>{{ pain }}</p>
        </article>
      </div>
    </section>

    <section class="marketing-section">
      <div class="section-headline">
        <p class="marketing-kicker">{{ content.platformEyebrow }}</p>
        <h2>{{ content.platformTitle }}</h2>
      </div>

      <div class="marketing-card-grid marketing-card-grid--quad">
        <article class="marketing-card" *ngFor="let capability of content.capabilities">
          <div class="feature-icon"></div>
          <h3>{{ capability.title }}</h3>
          <p>{{ capability.body }}</p>
        </article>
      </div>
    </section>

    <section class="marketing-section marketing-section--accent">
      <div class="section-headline">
        <p class="marketing-kicker">{{ content.workflowEyebrow }}</p>
        <h2>{{ content.workflowTitle }}</h2>
      </div>

      <div class="workflow-list">
        <article class="workflow-step" *ngFor="let step of content.workflowSteps; let i = index">
          <span class="workflow-step__number">{{ i + 1 }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.body }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="marketing-section">
      <div class="section-headline">
        <p class="marketing-kicker">{{ content.examplesEyebrow }}</p>
        <h2>{{ content.examplesTitle }}</h2>
      </div>

      <div class="marketing-card-grid marketing-card-grid--triple">
        <article class="marketing-card example-card" *ngFor="let example of examples">
          <figure class="marketing-visual" *ngIf="example.asset">
            <img
              [src]="example.asset.compactPath"
              [srcset]="example.asset.compactPath + ' 960w, ' + example.asset.defaultPath + ' 1600w'"
              sizes="(max-width: 780px) 100vw, 33vw"
              [alt]="example.asset.alt[locale]"
              [width]="example.asset.width"
              [height]="example.asset.height"
              loading="lazy"
              decoding="async"
            />
          </figure>
          <p class="marketing-kicker">{{ example.localizedEyebrow }}</p>
          <h3>{{ example.localizedTitle }}</h3>
          <p>{{ example.localizedSummary }}</p>
          <ul class="marketing-bullet-list">
            <li *ngFor="let bullet of example.localizedBullets">{{ bullet }}</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="marketing-section">
      <div class="section-headline">
        <p class="marketing-kicker">{{ content.galleryEyebrow }}</p>
        <h2>{{ content.galleryTitle }}</h2>
      </div>

      <div class="gallery-grid">
        <article class="marketing-card gallery-card" *ngFor="let asset of galleryAssets">
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
          <div class="tag-list">
            <span class="tag-chip" *ngFor="let tag of asset.localizedTags">{{ tag }}</span>
          </div>
        </article>
      </div>
    </section>

    <section class="marketing-section">
      <div class="section-headline">
        <p class="marketing-kicker">{{ content.useCasesEyebrow }}</p>
        <h2>{{ content.useCasesTitle }}</h2>
      </div>

      <div class="marketing-card-grid marketing-card-grid--triple">
        <article class="marketing-card use-case-card" *ngFor="let useCase of useCases">
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
          <h3>{{ useCase.localizedName }}</h3>
          <p>{{ useCase.localizedSummary }}</p>
          <a class="marketing-inline-link" [routerLink]="useCase.path">
            {{ locale === 'en' ? 'View use case' : 'Ver caso de uso' }}
          </a>
        </article>
      </div>
    </section>

    <section class="marketing-section">
      <div class="authority-grid">
        <article class="marketing-card">
          <p class="marketing-kicker">{{ content.authorityEyebrow }}</p>
          <h2>{{ content.authorityTitle }}</h2>
          <ul class="marketing-bullet-list">
            <li *ngFor="let point of content.authorityPoints">{{ point }}</li>
          </ul>
        </article>

        <article class="marketing-card marketing-card--dark">
          <p class="marketing-kicker">Tecnoria</p>
          <h2>{{ locale === 'en' ? 'Product strategy, engineering and delivery — visible on purpose.' : 'Estrategia de producto, ingeniería y entrega — visibles a propósito.' }}</h2>
          <div class="authority-links">
            <a [href]="tecnoriaLinks.home" target="_blank" rel="noopener">Tecnoria</a>
            <a [href]="tecnoriaLinks.chatbotService" target="_blank" rel="noopener">
              {{ locale === 'en' ? 'AI chatbots' : 'Chatbots IA' }}
            </a>
            <a [href]="tecnoriaLinks.caseStudies" target="_blank" rel="noopener">
              {{ locale === 'en' ? 'Case studies' : 'Casos de éxito' }}
            </a>
            <a [href]="tecnoriaLinks.contact" target="_blank" rel="noopener">
              {{ locale === 'en' ? 'Contact Tecnoria' : 'Contactar con Tecnoria' }}
            </a>
          </div>
        </article>
      </div>
    </section>

    <section class="marketing-section">
      <div class="section-headline">
        <p class="marketing-kicker">{{ content.faqEyebrow }}</p>
        <h2>{{ content.faqTitle }}</h2>
      </div>

      <div class="faq-list">
        <details class="faq-item" *ngFor="let faq of faqs; let first = first" [attr.open]="first ? '' : null">
          <summary><h3>{{ faq.question }}</h3></summary>
          <p>{{ faq.answer }}</p>
        </details>
      </div>
    </section>

    <section class="marketing-section marketing-section--final">
      <div class="cta-banner">
        <div>
          <p class="marketing-kicker">{{ content.finalEyebrow }}</p>
          <h2>{{ content.finalTitle }}</h2>
          <p class="marketing-copy">{{ content.finalLead }}</p>
        </div>

        <div class="wrap-actions">
          <a class="marketing-button marketing-button--primary" [routerLink]="getPagePath('contact')">
            {{ locale === 'en' ? 'Request a demo' : 'Solicitar demo' }}
          </a>
          <a
            class="marketing-button marketing-button--ghost"
            [routerLink]="getPagePath('use_cases')"
          >
            {{ locale === 'en' ? 'See use cases' : 'Ver casos de uso' }}
          </a>
        </div>
      </div>
    </section>
  `,
})
export class HomePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly content = getMarketingHomeContent(this.locale);
  readonly brandName = BRAND_NAME;
  readonly tecnoriaLinks = TECNORIA_LINKS;
  readonly faqs = getLocalizedFaqEntries(this.locale);
  readonly examples = getHomeExamples(this.locale);
  readonly galleryAssets = getHomeAssets(this.locale);
  readonly heroAsset = getAssetBySlug('content-operations-showcase');
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
    const seoEntry = getLocalizedPageSeo(this.locale, 'home');
    const alternates = getAlternatePagePaths('home');

    this.seo.update({
      title: seoEntry.title,
      description: seoEntry.description,
      path: getMarketingPath(this.locale, 'home'),
      locale: this.locale,
      keywords: seoEntry.keywords,
      alternates: {
        ...alternates,
        'x-default': alternates.en,
      },
      imageAsset: this.heroAsset,
      schemas: [
        this.seo.createBreadcrumbSchema([
          {
            name: this.locale === 'en' ? BRAND_NAME : 'Auctorio',
            path: getMarketingPath(this.locale, 'home'),
          },
        ]),
        this.seo.createFaqSchema(this.faqs),
      ],
    });
  }

  getPagePath(pageKey: 'use_cases' | 'built_by_tecnoria' | 'contact'): string {
    return getMarketingPath(this.locale, pageKey);
  }
}
