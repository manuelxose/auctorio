import { CommonModule, ViewportScroller } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuctorioChatWidgetComponent } from '../components/auctorio-chat-widget.component';
import {
  BRAND_NAME,
  BRAND_SIGNATURE,
  type MarketingLocale,
  getFooterResources,
  getLocalizedUseCases,
  getMarketingLocaleFromPath,
  getMarketingNavigation,
  getMarketingPath,
  getStudioLoginPath,
  TECNORIA_LINKS,
  translateMarketingPath,
} from '../content/marketing-content';
import { BLOG_PATH } from '../content/articles';

@Component({
  selector: 'app-public-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, AuctorioChatWidgetComponent],
  template: `
    <a class="skip-link" href="#main-content">
      {{ currentLocale === 'es' ? 'Saltar al contenido' : 'Skip to content' }}
    </a>

    <div class="marketing-shell">
      <header class="marketing-header">
        <div class="marketing-header__inner">
          <a [routerLink]="homePath" class="brand-signature" [attr.aria-label]="brandName + (currentLocale === 'es' ? ', inicio' : ', home')">
            <img src="/logo.svg" alt="" width="36" height="36" />
            <span class="brand-signature__name">{{ brandName }}</span>
          </a>

          <nav id="primary-navigation" class="marketing-nav" [class.is-open]="menuOpen" aria-label="Primary navigation">
            <a
              *ngFor="let item of navigation"
              [routerLink]="item.path"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: item.key === 'home' }"
              (click)="menuOpen = false"
            >
              {{ item.label }}
            </a>
          </nav>

          <div class="marketing-header__actions">
            <a
              class="marketing-link"
              [routerLink]="alternateLocalePath"
              [attr.aria-label]="currentLocale === 'en' ? 'Switch to Spanish' : 'Switch to English'"
            >
              {{ currentLocale === 'en' ? 'ES' : 'EN' }}
            </a>
            <a class="marketing-button marketing-button--ghost" [href]="studioLoginPath">
              {{ currentLocale === 'en' ? 'Enter Studio' : 'Entrar al Studio' }}
            </a>
            <a class="marketing-button marketing-button--primary" [routerLink]="contactPath">
              {{ currentLocale === 'es' ? 'Solicitar demo' : 'Request a demo' }}
            </a>
            <button
              class="mobile-menu-toggle"
              (click)="menuOpen = !menuOpen"
              [attr.aria-expanded]="menuOpen"
              aria-controls="primary-navigation"
              [attr.aria-label]="menuOpen ? 'Close menu' : 'Open menu'"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" class="marketing-main">
        <router-outlet></router-outlet>
      </main>

      <footer class="marketing-footer">
        <div class="marketing-footer__grid">
          <section class="marketing-footer__lead">
            <a [routerLink]="homePath" class="brand-signature"><img src="/logo.svg" alt="" width="36" height="36" loading="lazy" /><span class="brand-signature__name">{{ brandName }}</span></a>
            <p class="marketing-copy">{{ footerResources.legalCopy }}</p>
          </section>

          <nav [attr.aria-label]="footerResources.productTitle">
            <p class="marketing-kicker">{{ footerResources.productTitle }}</p>
            <div class="marketing-footer__links">
              <a [routerLink]="homePath">{{ currentLocale === 'es' ? 'Plataforma' : 'Platform' }}</a>
              <a [routerLink]="examplesPath">{{ currentLocale === 'es' ? 'Flujos de trabajo' : 'Workflows' }}</a>
              <a *ngFor="let useCase of useCases" [routerLink]="useCase.path">{{ useCase.localizedName }}</a>
            </div>
          </nav>

          <nav [attr.aria-label]="footerResources.resourcesTitle">
            <p class="marketing-kicker">{{ footerResources.resourcesTitle }}</p>
            <div class="marketing-footer__links">
              <a [routerLink]="useCasesPath">{{ currentLocale === 'es' ? 'Casos de uso' : 'Use cases' }}</a>
              <a *ngIf="blogPath" [routerLink]="blogPath">Blog</a>
              <a [routerLink]="faqPath">{{ currentLocale === 'es' ? 'Preguntas frecuentes' : 'FAQ' }}</a>
              <a [routerLink]="contactPath">{{ currentLocale === 'es' ? 'Contacto' : 'Contact' }}</a>
            </div>
          </nav>

          <nav [attr.aria-label]="footerResources.startTitle">
            <p class="marketing-kicker">{{ footerResources.startTitle }}</p>
            <div class="marketing-footer__links">
              <a [routerLink]="contactPath">{{ currentLocale === 'es' ? 'Solicitar demo' : 'Request a demo' }}</a>
              <a [href]="studioLoginPath">{{ currentLocale === 'es' ? 'Entrar al Studio' : 'Sign in to Studio' }}</a>
            </div>
          </nav>
        </div>

        <div class="marketing-footer__bottom">
          <span>© {{ year }} {{ brandName }}</span>
          <a [href]="tecnoriaLinks.home" target="_blank" rel="noopener">{{ signature }}</a>
        </div>
      </footer>

      <app-auctorio-chat-widget [locale]="currentLocale"></app-auctorio-chat-widget>
    </div>
  `,
})
export class PublicShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private subscription: Subscription | null = null;

  constructor() {
    // Anchor jumps (article table of contents) must clear the sticky glass header.
    inject(ViewportScroller).setOffset([0, 112]);
  }

  readonly brandName = BRAND_NAME;
  readonly signature = BRAND_SIGNATURE;
  readonly tecnoriaLinks = TECNORIA_LINKS;
  readonly studioLoginPath = getStudioLoginPath();

  menuOpen = false;
  currentLocale: MarketingLocale = 'en';
  navigation = getMarketingNavigation('en');
  footerResources = getFooterResources('en');
  alternateLocalePath = '/es';
  homePath = getMarketingPath('en', 'home');
  useCasesPath = getMarketingPath('en', 'use_cases');
  examplesPath = getMarketingPath('en', 'examples');
  faqPath = getMarketingPath('en', 'faq');
  contactPath = getMarketingPath('en', 'contact');
  useCases = getLocalizedUseCases('en');
  blogPath: string | undefined = BLOG_PATH.en;
  readonly year = new Date().getFullYear();

  ngOnInit(): void {
    this.syncState(this.router.url);
    this.subscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.menuOpen = false;
        this.syncState((event as NavigationEnd).urlAfterRedirects);
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private syncState(url: string): void {
    this.currentLocale = getMarketingLocaleFromPath(url);
    this.navigation = getMarketingNavigation(this.currentLocale);
    this.footerResources = getFooterResources(this.currentLocale);
    this.alternateLocalePath = translateMarketingPath(
      url.split('?')[0] || '/',
      this.currentLocale === 'en' ? 'es' : 'en',
    );
    this.homePath = getMarketingPath(this.currentLocale, 'home');
    this.useCasesPath = getMarketingPath(this.currentLocale, 'use_cases');
    this.examplesPath = getMarketingPath(this.currentLocale, 'examples');
    this.faqPath = getMarketingPath(this.currentLocale, 'faq');
    this.useCases = getLocalizedUseCases(this.currentLocale);
    this.blogPath = BLOG_PATH[this.currentLocale];
    this.contactPath = getMarketingPath(this.currentLocale, 'contact');
  }
}
