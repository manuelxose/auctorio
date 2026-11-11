import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  BRAND_NAME,
  type MarketingLocale,
  getAlternatePagePaths,
  getLocalizedPageSeo,
  getMarketingContactContent,
  getMarketingPath,
} from '../content/marketing-content';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page-hero">
      <p class="marketing-kicker">{{ content.kicker }}</p>
      <h1>{{ content.title }}</h1>
      <p class="marketing-lead">{{ content.lead }}</p>
    </section>

    <section class="marketing-section">
      <div class="contact-grid">
        <form class="contact-form" (submit)="onSubmit($event)" novalidate>
          <div class="contact-field">
            <label for="contact-name">{{ content.formLabels.name }}</label>
            <input
              id="contact-name"
              type="text"
              name="name"
              [placeholder]="content.formLabels.name"
              required
              autocomplete="name"
            />
          </div>

          <div class="contact-field">
            <label for="contact-email">{{ content.formLabels.email }}</label>
            <input
              id="contact-email"
              type="email"
              name="email"
              [placeholder]="content.formLabels.email"
              required
              autocomplete="email"
            />
          </div>

          <div class="contact-field">
            <label for="contact-company">{{ content.formLabels.company }}</label>
            <input
              id="contact-company"
              type="text"
              name="company"
              [placeholder]="content.formLabels.company"
              autocomplete="organization"
            />
          </div>

          <div class="contact-field">
            <label for="contact-message">{{ content.formLabels.message }}</label>
            <textarea
              id="contact-message"
              name="message"
              rows="5"
              [placeholder]="content.formLabels.message"
              required
            ></textarea>
          </div>

          <button class="marketing-button marketing-button--primary" type="submit">
            {{ content.formLabels.submit }}
          </button>
          <p class="auth-note" role="status" *ngIf="submitted">
            {{ locale === 'es'
              ? 'Se ha abierto tu programa de correo con la solicitud. Envíala para entrar en la lista; si no se abre, escríbenos a hello@auctorio.com.'
              : 'Your email app has opened with the request. Send it to join the list; if it did not open, write to hello@auctorio.com.' }}
          </p>
        </form>

        <aside class="contact-info">
          <h2>{{ content.infoTitle }}</h2>
          <div class="contact-info__items">
            <div *ngFor="let item of content.infoItems" class="contact-info__item">
              <span class="marketing-kicker">{{ item.label }}</span>
              <p>{{ item.value }}</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `,
})
export class ContactPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

  readonly locale = (this.route.snapshot.data['locale'] as MarketingLocale | undefined) ?? 'en';
  readonly content = getMarketingContactContent(this.locale);
  submitted = false;

  constructor() {
    const seoEntry = getLocalizedPageSeo(this.locale, 'contact');
    const alternates = getAlternatePagePaths('contact');

    this.seo.update({
      title: seoEntry.title,
      description: seoEntry.description,
      path: getMarketingPath(this.locale, 'contact'),
      locale: this.locale,
      keywords: seoEntry.keywords,
      alternates: {
        ...alternates,
        'x-default': alternates.en,
      },
      schemas: [
        this.seo.createBreadcrumbSchema([
          { name: BRAND_NAME, path: getMarketingPath(this.locale, 'home') },
          {
            name: this.locale === 'es' ? 'Lista de espera' : 'Waitlist',
            path: getMarketingPath(this.locale, 'contact'),
          },
        ]),
      ],
    });
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    // shortcut: there is no waitlist endpoint yet, so the request goes out by email instead of being silently dropped. Replace with a POST to a waitlist API when it exists.
    const field = (name: string) => String(new FormData(form).get(name) ?? '').trim();
    const subject = this.locale === 'es' ? 'Lista de espera de Auctorio' : 'Auctorio waitlist';
    const body = [
      `${this.content.formLabels.name}: ${field('name')}`,
      `${this.content.formLabels.email}: ${field('email')}`,
      `${this.content.formLabels.company}: ${field('company')}`,
      '',
      field('message'),
    ].join('\n');
    window.location.href = `mailto:hello@auctorio.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.submitted = true;
  }
}
