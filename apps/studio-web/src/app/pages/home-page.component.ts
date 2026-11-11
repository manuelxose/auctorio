import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BRAND_NAME,
  type MarketingLocale,
  getAlternatePagePaths,
  getAssetBySlug,
  getHomeExamples,
  getLocalizedFaqEntries,
  getLocalizedPageSeo,
  getLocalizedUseCases,
  getMarketingHomeContent,
  getMarketingPath,
  getStudioLoginPath,
} from '../content/marketing-content';
import { SeoService } from '../services/seo.service';
import { AppIconComponent } from '../components/ui/app-icon.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink, AppIconComponent],
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
              [routerLink]="getPagePath('examples')"
            >
              {{ content.secondaryCta }}
            </a>
          </div>

          <div class="trust-strip">
            <span *ngFor="let highlight of content.highlights">{{ highlight }}</span>
          </div>
        </article>

        <aside class="hero-panel">
          <figure class="marketing-visual marketing-visual--hero" *ngIf="heroAsset">
            <img
              [src]="heroAsset.compactPath"
              [srcset]="heroAsset.compactPath + ' 960w, ' + heroAsset.defaultPath + ' 1600w'"
              sizes="(max-width: 1060px) 100vw, 560px"
              [alt]="heroAsset.alt[locale]"
              [width]="heroAsset.width"
              [height]="heroAsset.height"
              fetchpriority="high"
              decoding="async"
            />
          </figure>
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
        <article class="marketing-card" *ngFor="let capability of content.capabilities; let i = index">
          <div class="feature-icon" aria-hidden="true">
            <app-icon [name]="capabilityIcons[i % capabilityIcons.length]"></app-icon>
          </div>
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
            {{ locale === 'en' ? 'Join the waitlist' : 'Únete a la lista de espera' }}
          </a>
          <a class="marketing-button marketing-button--ghost" [href]="studioLoginPath">
            {{ locale === 'en' ? 'Enter Studio' : 'Entrar al Studio' }}
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
  readonly studioLoginPath = getStudioLoginPath();
  readonly faqs = getLocalizedFaqEntries(this.locale);
  readonly examples = getHomeExamples(this.locale);
  readonly heroAsset = getAssetBySlug('content-operations-showcase');
  /** Workflow, search, assets, multi-site — same order as content.capabilities. */
  readonly capabilityIcons = ['plan', 'search', 'media', 'globe'];
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

  getPagePath(pageKey: 'use_cases' | 'examples' | 'contact'): string {
    return getMarketingPath(this.locale, pageKey);
  }
}
