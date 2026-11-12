import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppIconComponent } from './ui/app-icon.component';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';

type ProviderView = { id: string; label: string; description: string; keyEnv: string; configured: boolean; models: string[]; defaultModel: string | null; freeModel: boolean };
type ProvidersResponse = { selection: { provider: string; model: string } | null; environmentDefault: { provider: string; model: string | null }; providers: ProviderView[] };
type TestResult = { ok: boolean; provider?: string; model?: string; latencyMs: number; sample?: string; error?: string };

/** Settings → AI: which provider and model write for this workspace. Keys live in the server env only. */
@Component({
  selector: 'app-ai-provider-settings',
  standalone: true,
  imports: [FormsModule, AppIconComponent],
  template: `
    <section class="aip" aria-labelledby="aip-title">
      <div class="aip__head">
        <div>
          <h3 id="aip-title" class="aip__title">Model used for writing</h3>
          <p class="aip__sub">Applies to plans, articles, quality repair, social posts and the copilot for this workspace</p>
        </div>
        @if (current(); as c) {
          <span class="aip__current"><span class="aip__dot"></span>{{ labelOf(c.provider) }} · {{ c.model }}</span>
        } @else if (data()) {
          <span class="aip__current is-default">Server default: {{ data()!.environmentDefault.provider }}{{ data()!.environmentDefault.model ? ' · ' + data()!.environmentDefault.model : '' }}</span>
        }
      </div>

      @if (error()) { <p class="au-error" role="alert">{{ error() }}</p> }

      <div class="aip__grid" role="radiogroup" aria-label="Provider">
        @for (p of data()?.providers ?? []; track p.id) {
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
            <button class="au-btn" type="button" (click)="test()" [disabled]="!canEdit() || testing() || !current()">
              <app-icon name="activity"></app-icon>{{ testing() ? 'Testing…' : 'Test connection' }}
            </button>
          </div>
        </div>
      }

      @if (testResult(); as t) {
        <p class="aip__test" [class.is-bad]="!t.ok" role="status">
          @if (t.ok) { Answered in {{ (t.latencyMs / 1000).toFixed(1) }} s by {{ t.model }}: “{{ t.sample }}” } @else { Test failed after {{ (t.latencyMs / 1000).toFixed(1) }} s: {{ t.error }} }
        </p>
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
    `,
  ],
})
export class AiProviderSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2/ai`;
  readonly canEdit = input(false);

  readonly data = signal<ProvidersResponse | null>(null);
  readonly current = computed(() => this.data()?.selection ?? null);
  readonly provider = signal<string | null>(null);
  readonly selected = computed(() => this.data()?.providers.find((p) => p.id === this.provider()) ?? null);
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly error = signal<string | null>(null);
  readonly testResult = signal<TestResult | null>(null);
  model = '';

  ngOnInit(): void {
    this.http.get<ProvidersResponse>(`${this.base}/providers`).subscribe({
      next: (response) => {
        this.data.set(response);
        const chosen = response.selection;
        const fallback = response.providers.find((p) => p.configured);
        this.provider.set(chosen?.provider ?? fallback?.id ?? null);
        this.model = chosen?.model ?? fallback?.defaultModel ?? fallback?.models[0] ?? '';
      },
      error: (e: HttpErrorResponse) => this.error.set(this.describe(e)),
    });
  }

  labelOf(id: string): string {
    return this.data()?.providers.find((p) => p.id === id)?.label ?? id;
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
    this.http.put<{ selection: { provider: string; model: string } }>(`${this.base}/provider`, { provider: this.provider(), model: this.model.trim() }).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.data.update((d) => (d ? { ...d, selection: r.selection } : d));
        this.test();
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.describe(e));
      },
    });
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
