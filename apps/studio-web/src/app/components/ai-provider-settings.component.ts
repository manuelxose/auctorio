import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppIconComponent } from './ui/app-icon.component';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';

type ProviderView = { id: string; label: string; description: string; keyEnv: string; configured: boolean; models: string[]; defaultModel: string | null; freeModel: boolean };
type Choice = { provider: string; model: string };
type Selection = Choice & { uses?: Record<string, Choice>; fallback?: Choice | null };
type ProviderGroup = { selection: Selection | null; environmentDefault: { provider: string; model: string | null }; providers: ProviderView[] };
type ProvidersResponse = ProviderGroup & { tasks: { task: string; label: string; uses: string[] }[]; uses?: { key: string; label: string }[]; image: ProviderGroup };
type TestResult = { ok: boolean; provider?: string; model?: string; latencyMs: number; sample?: string; error?: string };

/** Settings → AI: which provider and model write (task="text") or draw (task="image") for this workspace. Keys live in the server env only. */
@Component({
  selector: 'app-ai-provider-settings',
  standalone: true,
  imports: [FormsModule, AppIconComponent],
  template: `
    <section class="aip" aria-labelledby="aip-title">
      <div class="aip__head">
        <div>
          <h3 id="aip-title" class="aip__title">{{ task() === 'image' ? 'Model used for images' : 'Model used for writing' }}</h3>
          <p class="aip__sub">Used for: {{ uses() }}</p>
        </div>
        @if (current(); as c) {
          <span class="aip__current"><span class="aip__dot"></span>{{ labelOf(c.provider) }} · {{ c.model }}</span>
        } @else if (view()) {
          <span class="aip__current is-default">Server default: {{ view()!.environmentDefault.provider }}{{ view()!.environmentDefault.model ? ' · ' + view()!.environmentDefault.model : '' }}</span>
        }
      </div>

      @if (error()) { <p class="au-error" role="alert">{{ error() }}</p> }

      <div class="aip__grid" role="radiogroup" aria-label="Provider">
        @for (p of view()?.providers ?? []; track p.id) {
          <button
            type="button"
            role="radio"
            class="aip__card"
            [attr.aria-checked]="provider() === p.id"
            [disabled]="!p.configured || !canEdit()"
            (click)="pick(p)"
          >
            <span class="aip__card-top">
              <strong>{{ p.label }}</strong>
              <span class="aip__key" [class.is-on]="p.configured">{{ p.configured ? 'Key on server' : 'No key' }}</span>
            </span>
            <span class="aip__desc">{{ p.description }}</span>
            @if (!p.configured) { <code class="aip__env">{{ p.keyEnv }}</code> }
          </button>
        }
      </div>

      @if (selected(); as p) {
        <div class="aip__model">
          <label class="au-field">
            <span class="au-field__label">Model</span>
            @if (p.models.length) {
              <select class="au-input au-select" [(ngModel)]="model" name="model" [disabled]="!canEdit()">
                @for (m of p.models; track m) { <option [value]="m">{{ m }}</option> }
                @if (p.freeModel && model && !p.models.includes(model)) { <option [value]="model">{{ model }}</option> }
              </select>
            } @else {
              <input class="au-input" [(ngModel)]="model" name="model" placeholder="model id from your account" [disabled]="!canEdit()" />
            }
          </label>
          <div class="aip__actions">
            <button class="au-btn au-btn--primary" type="button" (click)="save()" [disabled]="!canEdit() || saving() || !model.trim() || unchanged()">
              {{ saving() ? 'Saving…' : 'Use this model' }}
            </button>
            @if (task() === 'text') {
              <button class="au-btn" type="button" (click)="test()" [disabled]="!canEdit() || testing() || !current()">
                <app-icon name="activity"></app-icon>{{ testing() ? 'Testing…' : 'Test connection' }}
              </button>
            }
          </div>
        </div>
      }

      @if (testResult(); as t) {
        <p class="aip__test" [class.is-bad]="!t.ok" role="status">
          @if (t.ok) { Answered in {{ (t.latencyMs / 1000).toFixed(1) }} s by {{ t.model }}: “{{ t.sample }}” } @else { Test failed after {{ (t.latencyMs / 1000).toFixed(1) }} s: {{ t.error }} }
        </p>
      }
      @if (task() === 'text' && current(); as c) {
        <div class="aip__uses">
          <h4 class="aip__title">Model per use</h4>
          <p class="aip__sub">Each use can run on its own model. If a model fails (no credit, outage, timeout), the fallback runs, then any other provider with a key on the server.</p>
          @for (u of data()?.uses ?? []; track u.key) {
            <label class="au-field aip__row">
              <span class="au-field__label">{{ u.label }}</span>
              <select class="au-input au-select" [(ngModel)]="useChoice[u.key]" [name]="'use-' + u.key" [disabled]="!canEdit()">
                <option value="">Same as above ({{ labelOf(c.provider) }} · {{ c.model }})</option>
                @for (o of options(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
              </select>
            </label>
          }
          <label class="au-field aip__row">
            <span class="au-field__label">Fallback</span>
            <select class="au-input au-select" [(ngModel)]="fallbackChoice" name="fallback" [disabled]="!canEdit()">
              <option value="">Automatic (any other provider with a key)</option>
              @for (o of options(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
            </select>
          </label>
          <div class="aip__actions">
            <button class="au-btn au-btn--primary" type="button" (click)="saveUses()" [disabled]="!canEdit() || saving()">{{ saving() ? 'Saving…' : 'Save per-use models' }}</button>
          </div>
        </div>
      }
      @if (!canEdit()) { <p class="aip__sub">Only workspace admins can change the model.</p> }
    </section>
  `,
  styles: [
    `
      .aip { display: flex; flex-direction: column; gap: var(--au-s4); margin-bottom: var(--au-s6); }
      .aip__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--au-s3); flex-wrap: wrap; }
      .aip__title { font-size: var(--au-fs-section); font-weight: 600; }
      .aip__sub { color: var(--au-muted); font-size: var(--au-fs-body-sm); }
      .aip__current { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; background: var(--au-success-soft); color: var(--au-success); font-size: var(--au-fs-caption); font-weight: 500; }
      .aip__current.is-default { background: var(--au-surface-2); color: var(--au-muted); }
      .aip__dot { width: 6px; height: 6px; border-radius: 3px; background: currentColor; }
      .aip__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--au-s3); }
      .aip__card { display: flex; flex-direction: column; gap: var(--au-s1); padding: var(--au-s4); border: 1px solid var(--au-border); border-radius: 12px; background: var(--au-surface-hover); color: var(--au-text); font: inherit; text-align: left; cursor: pointer; }
      .aip__card:disabled { cursor: not-allowed; opacity: 0.6; }
      .aip__card[aria-checked='true'] { border-color: var(--au-brand); box-shadow: 0 0 0 3px var(--au-brand-soft); }
      .aip__card-top { display: flex; align-items: center; justify-content: space-between; gap: var(--au-s2); }
      .aip__key { font-size: var(--au-fs-caption); color: var(--au-muted); }
      .aip__key.is-on { color: var(--au-success); }
      .aip__desc { color: var(--au-muted); font-size: var(--au-fs-caption); }
      .aip__env { font: 11px var(--au-mono); color: var(--au-faint); }
      .aip__model { display: flex; align-items: flex-end; gap: var(--au-s3); flex-wrap: wrap; }
      .aip__model .au-field { flex: 1 1 260px; margin: 0; }
      .aip__actions { display: flex; gap: var(--au-s2); flex-wrap: wrap; }
      .aip__test { padding: var(--au-s3); border-radius: 10px; background: var(--au-success-soft); color: var(--au-text); font-size: var(--au-fs-body-sm); }
      .aip__test.is-bad { background: var(--au-danger-soft); }
      .aip__uses { display: flex; flex-direction: column; gap: var(--au-s3); padding-top: var(--au-s4); border-top: 1px solid var(--au-border); }
      .aip__row { display: grid; grid-template-columns: minmax(140px, 200px) minmax(0, 1fr); align-items: center; gap: var(--au-s3); margin: 0; }
      @media (max-width: 600px) { .aip__row { grid-template-columns: 1fr; } }
    `,
  ],
})
export class AiProviderSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2/ai`;
  readonly canEdit = input(false);
  readonly task = input<'text' | 'image'>('text');

  readonly data = signal<ProvidersResponse | null>(null);
  readonly view = computed(() => (this.task() === 'image' ? this.data()?.image : this.data()) ?? null);
  readonly uses = computed(() => this.data()?.tasks.find((t) => t.task === this.task())?.uses.join(', ') ?? '');
  readonly current = computed(() => this.view()?.selection ?? null);
  readonly provider = signal<string | null>(null);
  readonly selected = computed(() => this.view()?.providers.find((p) => p.id === this.provider()) ?? null);
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly error = signal<string | null>(null);
  readonly testResult = signal<TestResult | null>(null);
  /** Every model of a provider with a key, as "provider|model" options. */
  readonly options = computed(() =>
    (this.data()?.providers ?? [])
      .filter((p) => p.configured)
      .flatMap((p) => (p.models.length ? p.models : p.defaultModel ? [p.defaultModel] : []).map((m) => ({ value: `${p.id}|${m}`, label: `${p.label} · ${m}` }))),
  );
  model = '';
  useChoice: Record<string, string> = {};
  fallbackChoice = '';

  ngOnInit(): void {
    this.http.get<ProvidersResponse>(`${this.base}/providers`).subscribe({
      next: (response) => {
        this.data.set(response);
        const group = this.view()!;
        const chosen = group.selection;
        const fallback = group.providers.find((p) => p.configured);
        this.provider.set(chosen?.provider ?? fallback?.id ?? null);
        this.model = chosen?.model ?? fallback?.defaultModel ?? fallback?.models[0] ?? '';
        this.readUses(response.selection);
      },
      error: (e: HttpErrorResponse) => this.error.set(this.describe(e)),
    });
  }

  labelOf(id: string): string {
    return this.view()?.providers.find((p) => p.id === id)?.label ?? id;
  }

  unchanged(): boolean {
    const c = this.current();
    return Boolean(c && c.provider === this.provider() && c.model === this.model.trim());
  }

  pick(p: ProviderView): void {
    this.provider.set(p.id);
    this.model = this.current()?.provider === p.id ? this.current()!.model : p.defaultModel ?? p.models[0] ?? '';
    this.testResult.set(null);
  }

  save(): void {
    this.saving.set(true);
    this.error.set(null);
    this.http.put<{ selection: { provider: string; model: string } }>(`${this.base}/${this.task() === 'image' ? 'image-provider' : 'provider'}`, { provider: this.provider(), model: this.model.trim() }).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.data.update((d) => (d ? (this.task() === 'image' ? { ...d, image: { ...d.image, selection: r.selection } } : { ...d, selection: r.selection }) : d));
        if (this.task() === 'text') this.test();
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.describe(e));
      },
    });
  }

  saveUses(): void {
    const c = this.current();
    if (!c) return;
    const parse = (value: string): Choice | null => (value ? { provider: value.split('|')[0], model: value.slice(value.indexOf('|') + 1) } : null);
    const uses = Object.fromEntries(Object.entries(this.useChoice).map(([key, value]) => [key, parse(value)]).filter(([, value]) => value));
    this.saving.set(true);
    this.error.set(null);
    this.http.put<{ selection: Selection }>(`${this.base}/provider`, { provider: c.provider, model: c.model, uses, fallback: parse(this.fallbackChoice) }).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.data.update((d) => (d ? { ...d, selection: r.selection } : d));
        this.readUses(r.selection);
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.describe(e));
      },
    });
  }

  private readUses(selection: Selection | null): void {
    const key = (c?: Choice | null) => (c ? `${c.provider}|${c.model}` : '');
    this.useChoice = Object.fromEntries((this.data()?.uses ?? []).map((u) => [u.key, key(selection?.uses?.[u.key])]));
    this.fallbackChoice = key(selection?.fallback);
  }

  test(): void {
    this.testing.set(true);
    this.testResult.set(null);
    this.http.post<TestResult>(`${this.base}/provider/test`, {}).subscribe({
      next: (r) => {
        this.testing.set(false);
        this.testResult.set(r);
      },
      error: (e: HttpErrorResponse) => {
        this.testing.set(false);
        this.testResult.set({ ok: false, latencyMs: 0, error: this.describe(e) });
      },
    });
  }

  private describe(e: HttpErrorResponse): string {
    const body = e.error as { error?: { message?: string } | string; message?: string } | null;
    if (body && typeof body.error === 'object' && body.error?.message) return body.error.message;
    return body?.message || `Request failed (${e.status})`;
  }
}
