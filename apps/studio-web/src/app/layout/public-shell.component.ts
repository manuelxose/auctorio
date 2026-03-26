import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuctorioChatWidgetComponent } from '../components/auctorio-chat-widget.component';
import {
  BRAND_NAME,
  BRAND_SIGNATURE,
  BRAND_TAGLINE,
  type MarketingLocale,
  getFooterResources,
  getMarketingLocaleFromPath,
  getMarketingNavigation,
  getMarketingPath,
  getStudioLoginPath,
  TECNORIA_LINKS,
  translateMarketingPath,
} from '../content/marketing-content';

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
          <a [routerLink]="homePath" class="brand-signature">
            <span class="brand-signature__name">{{ brandName }}</span>
          </a>

          <nav class="marketing-nav" [class.is-open]="menuOpen" aria-label="Primary navigation">
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
            <p class="brand-signature__name" style="font-size:1.25rem;margin-bottom:.5rem">{{ brandName }}</p>
            <p class="marketing-copy">{{ brandTagline }}</p>
            <p class="marketing-footer__note">{{ footerResources.legalCopy }}</p>
          </section>

          <section>
            <p class="marketing-kicker">{{ footerResources.productTitle }}</p>
            <div class="marketing-footer__links">
              <a [routerLink]="homePath">{{ currentLocale === 'es' ? 'Plataforma' : 'Platform' }}</a>
              <a [routerLink]="useCasesPath">{{ currentLocale === 'es' ? 'Casos de uso' : 'Use cases' }}</a>
              <a [routerLink]="examplesPath">{{ currentLocale === 'es' ? 'Ejemplos' : 'Examples' }}</a>
              <a [href]="studioLoginPath">{{ currentLocale === 'es' ? 'Entrar al Studio' : 'Enter Studio' }}</a>
              <a [routerLink]="contactPath">{{ currentLocale === 'es' ? 'Contacto' : 'Contact' }}</a>
            </div>
          </section>

          <section>
            <p class="marketing-kicker">{{ footerResources.resourcesTitle }}</p>
            <div class="marketing-footer__links">
              <a [routerLink]="faqPath">FAQ</a>
              <a [routerLink]="builtByPath">
                {{ currentLocale === 'es' ? 'Creado por Tecnoria' : 'Built by Tecnoria' }}
              </a>
              <a [href]="tecnoriaLinks.caseStudies" target="_blank" rel="noopener">
                {{ currentLocale === 'es' ? 'Casos de éxito' : 'Case studies' }}
              </a>
            </div>
          </section>

          <section>
            <p class="marketing-kicker">Tecnoria</p>
            <div class="marketing-footer__links">
              <a [href]="tecnoriaLinks.home" target="_blank" rel="noopener">tecnoria.com</a>
              <a [href]="tecnoriaLinks.chatbotService" target="_blank" rel="noopener">
                {{ currentLocale === 'es' ? 'Chatbots IA' : 'AI chatbots' }}
              </a>
              <a [href]="tecnoriaLinks.contact" target="_blank" rel="noopener">
                {{ currentLocale === 'es' ? 'Contactar Tecnoria' : 'Contact Tecnoria' }}
              </a>
            </div>
          </section>
        </div>

        <div class="marketing-footer__bottom">
          <span>{{ signature }}</span>
          <span>{{ currentLocale === 'es' ? 'Sitio público bilingüe orientado a SEO.' : 'Bilingual public site built for SEO.' }}</span>
        </div>
      </footer>

      <app-auctorio-chat-widget [locale]="currentLocale"></app-auctorio-chat-widget>
    </div>
  `,
})
export class PublicShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private subscription: Subscription | null = null;

  readonly brandName = BRAND_NAME;
  readonly signature = BRAND_SIGNATURE;
  readonly brandTagline = BRAND_TAGLINE;
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
  galleryPath = getMarketingPath('en', 'gallery');
  faqPath = getMarketingPath('en', 'faq');
  builtByPath = getMarketingPath('en', 'built_by_tecnoria');
  contactPath = getMarketingPath('en', 'contact');

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
    this.galleryPath = getMarketingPath(this.currentLocale, 'gallery');
    this.faqPath = getMarketingPath(this.currentLocale, 'faq');
    this.builtByPath = getMarketingPath(this.currentLocale, 'built_by_tecnoria');
    this.contactPath = getMarketingPath(this.currentLocale, 'contact');
  }
}
