import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { PlanningApiService, apiMessage } from '../services/planning-api.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import type { ArticleSectionKey, ArticleTargetsOverride, WritingSettings } from '../models/planning.models';

const DEFAULT_WRITING: WritingSettings = {
  instructions: [],
  length: 'dynamic',
  authorPerspective: false,
  citations: true,
  mentionCompetitors: false,
  summaryVariant: 'tldr',
  internalLinks: { enabled: true, www: false, trailingSlash: false },
  disclaimer: '',
};

type Toggle = { label: string; hint: string; get: () => boolean; set: (on: boolean) => void };

/** Settings · Writing: how every future article of the active site is written (stored in article_targets.writing). */
@Component({
  selector: 'app-writing-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent],
  styleUrls: ['./studio-page-kit.css'],
  template: `
    <section class="sp ws">
      <header class="sp-head">
        <div>
          <h1 class="sp-head__title">Writing</h1>
          <p class="sp-head__sub">How every future article for {{ siteName }} is written. Articles already written keep their text</p>
        </div>
        <div class="sp-head__actions">
          <a class="au-btn au-btn--secondary" routerLink="/studio/automation"><app-icon name="calendar"></app-icon>Publishing days</a>
        </div>
      </header>

      @if (!writing) {
        <p class="sp-muted">{{ message || 'Loading…' }}</p>
      } @else {
        <section class="ws-card" aria-labelledby="ws-rules">
          <h2 class="ws-card__title" id="ws-rules">Writing instructions</h2>
          <p class="ws-card__sub">Anything every article should do or avoid: words, claims, topics, audience, tone, facts about your business</p>
          @if (writing.instructions.length) {
            <ol class="ws-rules">
              @for (rule of writing.instructions; track rule; let i = $index) {
                <li class="ws-rule">
                  <span class="ws-rule__n">{{ i + 1 }}</span>
                  <span class="ws-rule__text">{{ rule }}</span>
                  <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="removeRule(i)" [attr.aria-label]="'Remove rule ' + (i + 1)"><app-icon name="close"></app-icon></button>
                </li>
              }
            </ol>
          } @else {
            <p class="ws-empty">No rules yet. Articles follow the site's detected tone</p>
          }
          <form class="ws-add" (ngSubmit)="addRule()">
            <label class="au-sr-only" for="ws-new-rule">New rule</label>
            <input class="au-input" id="ws-new-rule" name="rule" maxlength="300" [(ngModel)]="newRule" placeholder='e.g. Never use the word "leverage"' />
            <button class="au-btn au-btn--secondary" type="submit" [disabled]="!newRule.trim() || writing.instructions.length >= 30">Add</button>
          </form>
          <details class="ws-examples">
            <summary>See example rules</summary>
            <div class="ws-examples__list">
              @for (example of examples; track example) {
                <button type="button" class="ws-chip" (click)="addRule(example)" [disabled]="writing.instructions.includes(example)">{{ example }}</button>
              }
            </div>
          </details>
        </section>

        <section class="ws-card" aria-labelledby="ws-length">
          <h2 class="ws-card__title" id="ws-length">Length</h2>
          <p class="ws-card__sub">How long an article runs</p>
          <div class="ws-options" role="radiogroup" aria-labelledby="ws-length">
            @for (option of lengths; track option.key) {
              <label class="ws-option" [class.is-on]="writing.length === option.key">
                <input type="radio" name="length" [value]="option.key" [(ngModel)]="writing.length" (ngModelChange)="dirty = true" />
                <span class="ws-option__title">{{ option.label }}</span>
                <span class="ws-option__hint">{{ option.hint }}</span>
              </label>
            }
          </div>
        </section>

        <section class="ws-card" aria-labelledby="ws-blocks">
          <h2 class="ws-card__title" id="ws-blocks">What every article includes</h2>
          <p class="ws-card__sub">The blocks and habits added to each article</p>
          <ul class="ws-switches">
            @for (toggle of toggles; track toggle.label) {
              <li class="ws-switch">
                <span><span class="ws-switch__label">{{ toggle.label }}</span><span class="ws-switch__hint">{{ toggle.hint }}</span></span>
                <input type="checkbox" role="switch" class="ws-toggle" [checked]="toggle.get()" (change)="toggle.set(!toggle.get()); dirty = true" [attr.aria-label]="toggle.label" />
              </li>
            }
          </ul>
          @if (sectionOn('summary')) {
            <div class="ws-variants" role="radiogroup" aria-label="Summary style">
              <label class="ws-variant" [class.is-on]="writing.summaryVariant === 'tldr'">
                <input type="radio" name="summary" value="tldr" [(ngModel)]="writing.summaryVariant" (ngModelChange)="dirty = true" />
                <span class="ws-variant__art" aria-hidden="true"><b>En resumen</b><i></i><i></i><i></i></span>
                <span class="ws-option__title">TL;DR</span>
                <span class="ws-option__hint">3–5 bullet points in a highlighted box</span>
              </label>
              <label class="ws-variant" [class.is-on]="writing.summaryVariant === 'key_takeaways'">
                <input type="radio" name="summary" value="key_takeaways" [(ngModel)]="writing.summaryVariant" (ngModelChange)="dirty = true" />
                <span class="ws-variant__art ws-variant__art--table" aria-hidden="true"><b>Puntos clave</b><i></i><i></i><i></i></span>
                <span class="ws-option__title">Key takeaways</span>
                <span class="ws-option__hint">One-sentence thesis and a Point / Detail table</span>
              </label>
            </div>
          }
        </section>

        <section class="ws-card" aria-labelledby="ws-links">
          <h2 class="ws-card__title" id="ws-links">Internal linking</h2>
          <p class="ws-card__sub">Links to pages of your sitemap, written into each article</p>
          <ul class="ws-switches">
            @for (toggle of linkToggles; track toggle.label) {
              <li class="ws-switch">
                <span><span class="ws-switch__label">{{ toggle.label }}</span><span class="ws-switch__hint">{{ toggle.hint }}</span></span>
                <input type="checkbox" role="switch" class="ws-toggle" [checked]="toggle.get()" (change)="toggle.set(!toggle.get()); dirty = true" [attr.aria-label]="toggle.label" [disabled]="toggle.label !== 'Internal links' && !writing.internalLinks.enabled" />
              </li>
            }
          </ul>
        </section>

        <section class="ws-card" aria-labelledby="ws-disclaimer">
          <h2 class="ws-card__title" id="ws-disclaimer">Article disclaimer</h2>
          <p class="ws-card__sub">Optional text added at the very end of every article</p>
          <label class="au-field au-mb-0">
            <span class="au-sr-only">Disclaimer text</span>
            <textarea class="au-input" rows="3" maxlength="500" [(ngModel)]="writing.disclaimer" (ngModelChange)="dirty = true" placeholder="e.g. This article was written with AI assistance and reviewed by our editors"></textarea>
            <span class="au-hint">{{ writing.disclaimer.length }} / 500</span>
          </label>
        </section>

        <div class="ws-save" [class.is-dirty]="dirty" role="region" aria-label="Save changes">
          <span class="sp-muted">{{ dirty ? 'Unsaved changes' : 'All changes saved' }}</span>
          <button class="au-btn au-btn--ghost" type="button" [disabled]="!dirty || saving" (click)="load()">Discard</button>
          <button class="au-btn au-btn--primary" type="button" [disabled]="!dirty || saving" (click)="save()">{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>
      }
    </section>
  `,
  styles: [`
    .ws { max-width: 820px; padding-bottom: 96px; }
    .ws-card { padding: 20px 24px; margin-bottom: 16px; border: 1px solid var(--sp-line); border-radius: var(--sp-r); background: var(--sp-cell); }
    .ws-card__title { margin: 0; font-size: 16px; font-weight: 600; }
    .ws-card__sub { margin: 4px 0 16px; color: var(--au-muted); font-size: 13px; }
    .ws-empty { margin: 0 0 12px; padding: 16px; border: 1px dashed var(--sp-line); border-radius: 8px; color: var(--au-muted); font-size: 13px; }
    .ws-rules { list-style: none; margin: 0 0 12px; padding: 0; border-top: 1px solid var(--sp-line); }
    .ws-rule { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--sp-line); font-size: 14px; }
    .ws-rule__n { font-family: var(--au-mono); font-size: 12px; color: var(--au-faint); }
    .ws-add { display: flex; gap: 8px; }
    .ws-add input { flex: 1; }
    .ws-examples { margin-top: 12px; font-size: 13px; }
    .ws-examples summary { cursor: pointer; color: var(--au-muted); }
    .ws-examples__list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .ws-chip { padding: 6px 10px; border: 1px solid var(--sp-line); border-radius: 8px; background: var(--au-surface-2); color: var(--au-text-2); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
    .ws-chip:hover:not(:disabled) { border-color: var(--au-border-strong); }
    .ws-chip:disabled { opacity: .5; cursor: default; }
    .ws-options, .ws-variants { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
    .ws-variants { margin-top: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .ws-option, .ws-variant { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 12px; border: 1px solid var(--sp-line); border-radius: 10px; cursor: pointer; transition: border-color .15s ease, background-color .15s ease; }
    .ws-option:hover, .ws-variant:hover { border-color: var(--au-border-strong); }
    .ws-option.is-on, .ws-variant.is-on { border-color: var(--au-brand-strong); background: var(--au-surface-selected); }
    .ws-option input, .ws-variant input { position: absolute; opacity: 0; pointer-events: none; }
    .ws-option:has(input:focus-visible), .ws-variant:has(input:focus-visible) { box-shadow: var(--au-focus-ring); }
    .ws-option__title { font-size: 14px; font-weight: 500; }
    .ws-option__hint { font-size: 12px; color: var(--au-muted); }
    .ws-variant__art { display: grid; gap: 4px; height: 72px; margin-bottom: 8px; padding: 10px 12px; border-radius: 6px; background: var(--au-surface-2); }
    .ws-variant__art b { font-size: 11px; font-weight: 500; color: var(--au-text-2); }
    .ws-variant__art i { height: 5px; width: 70%; border-radius: 3px; background: var(--au-border-strong); }
    .ws-variant__art--table i { width: 100%; height: 8px; border-radius: 2px; background: linear-gradient(90deg, var(--au-border-strong) 0 34%, transparent 34% 38%, var(--au-border) 38%); }
    .ws-switches { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--sp-line); }
    .ws-switch { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--sp-line); }
    .ws-switch__label { display: block; font-size: 14px; }
    .ws-switch__hint { display: block; font-size: 12px; color: var(--au-muted); }
    .ws-toggle { appearance: none; flex: none; position: relative; width: 36px; height: 20px; margin: 0; border-radius: 10px; background: var(--au-border-strong); cursor: pointer; transition: background-color .15s ease; }
    .ws-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .2); transition: transform .15s ease; }
    .ws-toggle:checked { background: var(--au-brand-strong); }
    .ws-toggle:checked::after { transform: translateX(16px); }
    .ws-toggle:disabled { opacity: .4; cursor: default; }
    .ws-toggle:focus-visible { outline: none; box-shadow: var(--au-focus-ring); }
    .ws-save { position: sticky; bottom: 16px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 12px; border: 1px solid var(--sp-line); border-radius: var(--sp-r); background: var(--sp-cell); }
    .ws-save span { margin-right: auto; }
    .ws-save.is-dirty { border-color: var(--au-brand-strong); }
    @media (prefers-reduced-motion: reduce) { .ws-toggle, .ws-toggle::after { transition: none; } }
  `],
})
export class WritingSettingsPageComponent implements OnInit {
  private readonly api = inject(PlanningApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly siteId = this.appContext.activeSite()?.id ?? '';
  readonly siteName = this.appContext.activeSite()?.name ?? 'this site';

  writing: WritingSettings | null = null;
  private targets: ArticleTargetsOverride = {};
  newRule = '';
  dirty = false;
  saving = false;
  message = '';

  readonly examples = [
    'Never use the word "leverage"',
    'Write prices in euros with the € sign after the number',
    'Address the reader as "tú", never "usted"',
    'Do not promise schedules we cannot confirm',
    'Mention that our guide is free and needs no sign-up',
  ];
  readonly lengths: Array<{ key: WritingSettings['length']; label: string; hint: string }> = [
    { key: 'dynamic', label: 'Dynamic', hint: 'Follows the search intent' },
    { key: 'short', label: '1,200–1,600', hint: 'Quick answers' },
    { key: 'medium', label: '1,700–2,300', hint: 'Complete guides' },
    { key: 'long', label: '2,400–2,800', hint: 'In-depth pillars' },
  ];
  readonly toggles: Toggle[] = [
    { label: 'Author perspective', hint: 'Write as the publication, sharing first-hand experience', get: () => this.writing!.authorPerspective, set: (on) => (this.writing!.authorPerspective = on) },
    { label: 'Table of contents', hint: 'Linked list of the sections, after the summary', get: () => this.sectionOn('toc'), set: (on) => this.setSection('toc', on) },
    { label: 'Recommended reads', hint: 'Links to other posts of your blog at the end', get: () => this.sectionOn('furtherReading'), set: (on) => this.setSection('furtherReading', on) },
    { label: 'Sources section', hint: 'Every external source listed as "Title, Publisher"', get: () => this.sectionOn('sources'), set: (on) => this.setSection('sources', on) },
    { label: 'Citations', hint: 'Each figure and claim attributed inline to its source', get: () => this.writing!.citations, set: (on) => (this.writing!.citations = on) },
    { label: 'FAQ', hint: 'Questions and short self-contained answers', get: () => this.sectionOn('faq'), set: (on) => this.setSection('faq', on) },
    { label: 'Call-to-action card', hint: 'A card that sends readers to your site', get: () => this.sectionOn('cta'), set: (on) => this.setSection('cta', on) },
    { label: 'Mention competitors when relevant', hint: 'Off by default: competitors are never recommended', get: () => this.writing!.mentionCompetitors, set: (on) => (this.writing!.mentionCompetitors = on) },
    { label: 'Schema markup (JSON-LD)', hint: 'Article, FAQ and breadcrumb data for search engines', get: () => this.sectionOn('jsonLd'), set: (on) => this.setSection('jsonLd', on) },
    { label: 'Summary', hint: 'A short summary right after the introduction', get: () => this.sectionOn('summary'), set: (on) => this.setSection('summary', on) },
  ];
  readonly linkToggles: Toggle[] = [
    { label: 'Internal links', hint: 'Link to real pages of your sitemap', get: () => this.writing!.internalLinks.enabled, set: (on) => (this.writing!.internalLinks.enabled = on) },
    { label: 'Add "www" to internal links', hint: 'https://www.example.com/page', get: () => this.writing!.internalLinks.www, set: (on) => (this.writing!.internalLinks.www = on) },
    { label: 'Add a trailing "/" to internal links', hint: 'https://example.com/page/', get: () => this.writing!.internalLinks.trailingSlash, set: (on) => (this.writing!.internalLinks.trailingSlash = on) },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (!this.siteId) {
      this.message = 'Pick a site in the top bar first.';
      return;
    }
    this.api.getPlanningSettings(this.siteId).subscribe({
      next: (settings) => {
        this.targets = structuredClone(settings.articleTargets ?? {});
        const stored = this.targets.writing;
        this.writing = { ...DEFAULT_WRITING, ...stored, instructions: [...(stored?.instructions ?? [])], internalLinks: { ...DEFAULT_WRITING.internalLinks, ...stored?.internalLinks } };
        this.dirty = false;
      },
      error: (err) => (this.message = apiMessage(err, 'Writing settings could not be loaded.')),
    });
  }

  /** Every section is on unless the site switched it off. */
  sectionOn(key: ArticleSectionKey): boolean {
    return this.targets.sections?.[key] !== false;
  }

  private setSection(key: ArticleSectionKey, on: boolean): void {
    (this.targets.sections ??= {})[key] = on;
  }

  addRule(rule = this.newRule): void {
    const text = rule.replace(/\s+/g, ' ').trim();
    if (!text || !this.writing || this.writing.instructions.includes(text) || this.writing.instructions.length >= 30) return;
    this.writing.instructions = [...this.writing.instructions, text];
    if (rule === this.newRule) this.newRule = '';
    this.dirty = true;
  }

  removeRule(index: number): void {
    this.writing!.instructions = this.writing!.instructions.filter((_rule, i) => i !== index);
    this.dirty = true;
  }

  save(): void {
    if (!this.writing) return;
    this.saving = true;
    // article_targets is replaced as a whole: send the targets and sections back with the writing block.
    this.api.putPlanningSettings(this.siteId, { articleTargets: { ...this.targets, writing: this.writing } }).subscribe({
      next: (settings) => {
        this.saving = false;
        this.dirty = false;
        this.targets = structuredClone(settings.articleTargets ?? {});
        this.toast.success('Writing settings saved. They apply to the next articles.');
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(apiMessage(err, 'Writing settings could not be saved.'));
      },
    });
  }
}
