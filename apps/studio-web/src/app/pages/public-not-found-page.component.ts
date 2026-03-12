import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SeoService } from '../services/seo.service';
import { getMarketingLocaleFromPath, getMarketingPath, type MarketingLocale } from '../content/marketing-content';

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
            ? 'The page you are looking for is not part of the public Auctorio site.'
            : 'La pagina que buscas no forma parte de la capa publica de Auctorio.'
        }}
      </h1>
      <p class="marketing-lead">
        {{
          locale === 'en'
            ? 'Go back to the platform overview, browse the public use cases or enter the Studio if you already operate the workflow.'
            : 'Puedes volver a la home, revisar los casos de uso o entrar al Studio si ya vienes a operar el workflow.'
        }}
      </p>
      <div class="hero-actions">
        <a class="marketing-button marketing-button--primary" [routerLink]="getMarketingPath(locale, 'home')">
          {{ locale === 'en' ? 'Back to platform' : 'Ir a la plataforma' }}
        </a>
        <a class="marketing-button marketing-button--ghost" routerLink="/studio/login">
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

  constructor() {
    this.seo.update({
      title: this.locale === 'en' ? 'Page not found' : 'Pagina no encontrada',
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
