import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  BRAND_NAME,
  TECNORIA_LINKS,
  type MarketingLocale,
  getAlternatePagePaths,
  getAssetBySlug,
  getLocalizedPageSeo,
  getMarketingPath,
} from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-made-by-tecnoria-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page-hero">
      <p class="marketing-kicker">{{ locale === 'en' ? 'Authorship' : 'Autoría' }}</p>
      <h1>
        {{
          locale === 'en'
            ? 'Auctorio is positioned as a product brand and designed and engineered by Tecnoria.'
            : 'Auctorio se posiciona como marca de producto y está diseñado e implementado por Tecnoria.'
        }}
      </h1>
      <p class="marketing-lead">
        {{
          locale === 'en'
            ? 'The product has its own positioning so it can scale in the market, but the authorship remains visible because delivery, engineering and commercial contact matter.'
            : 'El producto tiene posicionamiento propio para poder escalar en mercado, pero la autoría sigue visible porque la entrega, la ingeniería y el contacto comercial importan.'
        }}
      </p>
    </section>

    <section class="marketing-section" *ngIf="heroAsset">
      <article class="marketing-card">
        <figure class="marketing-visual marketing-visual--hero">
          <img
            [src]="heroAsset.defaultPath"
            [srcset]="heroAsset.compactPath + ' 960w, ' + heroAsset.defaultPath + ' 1600w'"
            sizes="100vw"
            [alt]="heroAsset.alt[locale]"
            [width]="heroAsset.width"
            [height]="heroAsset.height"
            decoding="async"
          />
        </figure>
      </article>
    </section>

    <section class="marketing-section">
      <div class="content-split">
        <article class="marketing-card">
          <p class="marketing-kicker">{{ locale === 'en' ? 'Why it matters' : 'Por qué importa' }}</p>
          <h2>
            {{
              locale === 'en'
                ? 'Product identity and visible authorship can work together.'
                : 'La identidad de producto y la autoría visible pueden convivir.'
            }}
          </h2>
          <ul class="marketing-bullet-list">
            <li>
              {{
                locale === 'en'
                  ? 'Auctorio carries the category message for AI content operations and editorial workflow.'
                  : 'Auctorio carga con el mensaje de categoría para operaciones de contenido con IA y workflow editorial.'
              }}
            </li>
            <li>
              {{
                locale === 'en'
                  ? 'Tecnoria signals engineering depth, implementation capability and commercial continuity.'
                  : 'Tecnoria aporta profundidad técnica, capacidad de implementación y continuidad comercial.'
              }}
            </li>
            <li>
              {{
                locale === 'en'
                  ? 'The footer, structured data and chatbot make the authorship explicit across the public site.'
                  : 'El footer, los datos estructurados y el chatbot hacen explícita la autoría en toda la capa pública.'
              }}
            </li>
          </ul>
        </article>

        <article class="marketing-card marketing-card--dark">
          <p class="marketing-kicker">Tecnoria</p>
          <h2>
            {{
              locale === 'en'
                ? 'Use these routes when you want to validate the team behind the product.'
                : 'Usa estas rutas cuando quieras validar el equipo que hay detrás del producto.'
            }}
          </h2>
          <div class="marketing-footer__links marketing-footer__links--stacked">
            <a [href]="links.home" target="_blank" rel="noopener">Tecnoria</a>
            <a [href]="links.chatbotService" target="_blank" rel="noopener">
              {{ locale === 'en' ? 'AI chatbot services' : 'Servicios de chatbots' }}
            </a>
            <a [href]="links.caseStudies" target="_blank" rel="noopener">
              {{ locale === 'en' ? 'Case studies' : 'Casos de éxito' }}
            </a>
            <a [href]="links.contact" target="_blank" rel="noopener">
              {{ locale === 'en' ? 'Contact' : 'Contacto' }}
            </a>
          </div>
        </article>
      </div>
    </section>
  `,
})
export class MadeByTecnoriaPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly brandName = BRAND_NAME;
  readonly links = TECNORIA_LINKS;
  readonly heroAsset = getAssetBySlug('content-operations-showcase');

  constructor() {
    const seoEntry = getLocalizedPageSeo(this.locale, 'built_by_tecnoria');
    const alternates = getAlternatePagePaths('built_by_tecnoria');

    this.seo.update({
      title: seoEntry.title,
      description: seoEntry.description,
      path: getMarketingPath(this.locale, 'built_by_tecnoria'),
      locale: this.locale,
      keywords: seoEntry.keywords,
      alternates: {
        ...alternates,
        'x-default': alternates.en,
      },
      imageAsset: this.heroAsset,
      schemas: [
        this.seo.createBreadcrumbSchema([
          { name: this.brandName, path: getMarketingPath(this.locale, 'home') },
          {
            name: this.locale === 'en' ? 'Built by Tecnoria' : 'Creado por Tecnoria',
            path: getMarketingPath(this.locale, 'built_by_tecnoria'),
          },
        ]),
      ],
    });
  }
}
