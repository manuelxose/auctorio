import { CommonModule } from '@angular/common';
import { Component, inject, RESPONSE_INIT } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SeoService } from '../services/seo.service';
import {
  getMarketingLocaleFromPath,
  getMarketingPath,
  getStudioLoginPath,
  type MarketingLocale,
} from '../content/marketing-content';

@Component({
  selector: 'app-public-not-found-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page-hero">
      <p class="marketing-kicker">404</p>
      <h1>
        {{
          locale === 'en'
            ? 'We could not find that page'
            : 'No encontramos esa página'
        }}
      </h1>
      <p class="marketing-lead">
        {{
          locale === 'en'
            ? 'It may have moved or been removed. Go back to the home page or sign in to the Studio.'
            : 'Puede que se haya movido o eliminado. Vuelve a la portada o entra en el Studio.'
        }}
      </p>
      <div class="hero-actions">
        <a class="marketing-button marketing-button--primary" [routerLink]="getMarketingPath(locale, 'home')">
          {{ locale === 'en' ? 'Back to platform' : 'Ir a la plataforma' }}
        </a>
        <a class="marketing-button marketing-button--ghost" [href]="studioLoginPath">
          {{ locale === 'en' ? 'Enter Studio' : 'Entrar al Studio' }}
        </a>
      </div>
    </section>
  `,
})
export class PublicNotFoundPageComponent {
  private readonly seo = inject(SeoService);
  private readonly router = inject(Router);

  readonly locale: MarketingLocale = getMarketingLocaleFromPath(this.router.url || '/');
  readonly studioLoginPath = getStudioLoginPath();

  constructor() {
    // Real 404 on the server render instead of a soft 404 (200 + "not found" copy).
    const response = inject(RESPONSE_INIT, { optional: true });
    if (response) {
      response.status = 404;
    }
    this.seo.update({
      title: this.locale === 'en' ? 'Page not found' : 'Página no encontrada',
      description:
        this.locale === 'en'
          ? 'The requested route does not exist inside the public Auctorio marketing site.'
          : 'La ruta solicitada no existe dentro del microsite publico de Auctorio.',
      path: getMarketingPath(this.locale, 'home'),
      locale: this.locale,
      noIndex: true,
    });
  }

  protected readonly getMarketingPath = getMarketingPath;
}
