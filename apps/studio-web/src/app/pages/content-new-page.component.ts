import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import type { StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-content-new-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent],
  template: `
    <section class="au-page au-page--narrow">
      <a class="au-link au-mb-2" routerLink="/studio/content">
        <app-icon name="chevron-left"></app-icon>
        Back to content
      </a>
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">New piece</p>
          <h1 class="au-page__title">New content</h1>
          <p class="au-page__subtitle">Generation starts right after creation.</p>
        </div>
      </header>

      <section class="au-panel au-panel--padded">
        <form (ngSubmit)="submit()">
          <label class="au-field">
            <span class="au-field__label">Destination</span>
            <select class="au-select" name="site" [(ngModel)]="siteId" required>
              <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
            </select>
            <span class="au-field__hint">The site this piece will be published to.</span>
          </label>

          <label class="au-field">
            <span class="au-field__label">Topic / title</span>
            <input
              class="au-input"
              type="text"
              name="title"
              placeholder="e.g. Champions League TV guide"
              [(ngModel)]="title"
              required
              minlength="12"
            />
          </label>

          <label class="au-field">
            <span class="au-field__label">What do you want to create?</span>
            <select class="au-select" name="goal" [(ngModel)]="goal">
              <option value="article">Article</option>
              <option value="comparison">Comparison</option>
              <option value="landing">Landing page</option>
              <option value="faq">FAQ</option>
              <option value="newsletter">Newsletter</option>
            </select>
          </label>

          <label class="au-field">
            <span class="au-field__label">Additional instructions</span>
            <textarea
              class="au-textarea"
              name="brief"
              rows="4"
              placeholder="Audience, angle, sections, tone…"
              [(ngModel)]="brief"
            ></textarea>
          </label>

          <details class="au-advanced">
            <summary>Advanced options</summary>
            <label class="au-field au-mt-3">
              <span class="au-field__label">Slug</span>
              <input class="au-input" type="text" name="slug" [(ngModel)]="slug" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Categories (comma separated)</span>
              <input class="au-input" type="text" name="categories" [(ngModel)]="categories" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Keywords (comma separated)</span>
              <input class="au-input" type="text" name="keywords" [(ngModel)]="keywords" />
            </label>
          </details>

          <p class="au-error" *ngIf="error">{{ error }}</p>

          <div class="au-form__actions">
            <a class="au-btn au-btn--secondary" routerLink="/studio/content">Cancel</a>
            <button class="au-btn au-btn--primary" type="submit" [disabled]="busy">
              <app-icon name="sparkles"></app-icon>
              {{ busy ? 'Creating…' : 'Create & Generate' }}
            </button>
          </div>
        </form>
      </section>
    </section>
  `,
})
export class ContentNewPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly router = inject(Router);
  private readonly appContext = inject(AppContextService);

  sites: StudioSite[] = [];
  siteId = '';
  title = '';
  brief = '';
  goal = 'article';
  slug = '';
  categories = '';
  keywords = '';
  busy = false;
  error = '';

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.siteId = this.appContext.activeSite()?.id ?? this.sites[0]?.id ?? '';
  }

  submit(): void {
    if (!this.siteId || this.title.trim().length < 12) {
      this.error = 'Choose a destination and a topic of at least 12 characters.';
      return;
    }

    this.busy = true;
    this.error = '';

    const metadata: Record<string, unknown> = {
      contentType: 'guide',
      targetQuery: this.title.trim(),
      primaryIntent: 'informational',
    };
    if (this.slug.trim()) {
      metadata['slug'] = this.slug.trim();
    }
    if (this.categories.trim()) {
      metadata['categories'] = this.categories
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (this.keywords.trim()) {
      metadata['keywords'] = this.keywords
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    this.api
      .createProject({
        siteId: this.siteId,
        title: this.title.trim(),
        brief: this.brief.trim() || `Articulo editorial sobre: ${this.title.trim()}`,
        goal: this.goal as never,
        primaryLanguage: 'es',
        metadata,
      })
      .subscribe({
        next: (created) => {
          this.api.generateProject(created.id).subscribe({
            next: () => {
              void this.router.navigate(['/studio/content', created.id]);
            },
            error: (err) => {
              this.busy = false;
              this.error = this.describe(err);
            },
          });
        },
        error: (err) => {
          this.busy = false;
          this.error = this.describe(err);
        },
      });
  }

  private describe(err: unknown): string {
    const body = (err as { error?: { message?: string } })?.error;
    return body?.message ? String(body.message) : 'Could not create the piece.';
  }
}
