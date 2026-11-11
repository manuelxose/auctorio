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

          <!-- Honeypot: hidden from people and assistive tech; bots that fill it are ignored server-side. -->
          <div class="visually-hidden" aria-hidden="true">
            <label for="contact-website">Website</label>
            <input id="contact-website" type="text" name="website" tabindex="-1" autocomplete="off" />
          </div>

          <button class="marketing-button marketing-button--primary" type="submit" [disabled]="state === 'sending'">
            {{ state === 'sending' ? (locale === 'es' ? 'Enviando…' : 'Sending…') : content.formLabels.submit }}
          </button>
          <p class="form-status form-status--success" role="status" *ngIf="state === 'done'">
            {{ locale === 'es'
              ? '¡Listo! Estás en la lista de espera. Te escribiremos en cuanto haya plaza para tu equipo.'
              : 'Done! You are on the waitlist. We will email you as soon as a place opens for your team.' }}
          </p>
          <p class="form-status form-status--error" role="alert" *ngIf="state === 'error'">
            {{ errorMessage }}
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
  state: 'idle' | 'sending' | 'done' | 'error' = 'idle';
  errorMessage = '';

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

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) ?? '').trim();
    this.state = 'sending';
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: field('name'),
          email: field('email'),
          company: field('company'),
          message: field('message'),
          website: field('website'),
          locale: this.locale,
          sourcePath: getMarketingPath(this.locale, 'contact'),
        }),
      });
      if (response.ok) {
        this.state = 'done';
        form.reset();
        return;
      }
      this.errorMessage = this.describeError(response.status, (await response.json().catch(() => ({}))).error);
    } catch {
      this.errorMessage = this.describeError(0, undefined);
    }
    this.state = 'error';
  }

  private describeError(status: number, code: string | undefined): string {
    const es = this.locale === 'es';
    if (code === 'invalid_email') {
      return es ? 'Revisa el email: no parece válido.' : 'Please check your email address.';
    }
    if (status === 429) {
      return es ? 'Demasiados intentos. Prueba de nuevo en unos minutos.' : 'Too many attempts. Please try again in a few minutes.';
    }
    return es
      ? 'No hemos podido guardar tu solicitud. Inténtalo de nuevo o escríbenos a hello@auctorio.com.'
      : 'We could not save your request. Please try again or email hello@auctorio.com.';
  }
}
