import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApiService, AdminSeo, AdminSeoProvider } from '../services/admin-api.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';

const MODE_LABELS: Record<string, string> = {
  disabled: 'External SEO disabled',
  dataforseo_only: 'DataForSEO only',
  anyapi_only: 'AnyAPI only',
  manual: 'Choose per capability',
  cost_optimized: 'Cost-optimized (locked until budgets are enforced)',
};
const CAPABILITY_LABELS: Record<string, string> = {
  keyword_metrics: 'Keyword metrics',
  keyword_suggestions: 'Keyword discovery',
  ranked_keywords: 'Domain rankings',
  serp_organic: 'Google results',
  search_volume: 'Search volume fallback',
  youtube_search: 'YouTube results',
};
const REASONS: Record<string, string> = {
  external_disabled: 'external calls disabled',
  provider_disabled: 'provider disabled',
  not_configured: 'no credentials',
  not_selected: 'no provider chosen',
  unsupported_capability: 'not supported',
  paid_automation_locked: 'automation locked until SEO-V2-02',
  automatic_routing_locked: 'automatic routing locked until SEO-V2-02',
};

/** External SEO providers: mode, kill switch, credentials, priority and authorized live tests (platform admins). */
@Component({
  selector: 'app-seo-provider-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="au-panel au-panel--padded" *ngIf="seo as s">
      <h2 class="au-panel__title">Operating mode</h2>
      <p class="au-panel__subtitle au-mb-3">Opening this page never calls a provider. A paid fallback to another provider never happens.</p>
      <div class="au-row">
        <select class="au-input au-flex-1" [ngModel]="s.mode" (ngModelChange)="setMode($event)" name="seo-mode" aria-label="Operating mode">
          <option *ngFor="let m of s.modes" [value]="m.id" [disabled]="m.locked">{{ modeLabel(m.id) }}</option>
        </select>
        <button class="au-btn" type="button" *ngIf="s.mode !== 'disabled'" (click)="disableAll()">Disable all external SEO calls</button>
      </div>
      <div class="au-row" *ngFor="let c of s.capabilities">
        <span class="au-row__title">{{ capabilityLabel(c.id) }}</span>
        <span class="au-badge" [ngClass]="c.provider ? 'au-badge--brand' : 'au-badge--neutral'">{{ c.provider ? providerLabel(c.provider) : reason(c.reason) }}</span>
        <select class="au-input" *ngIf="s.mode === 'manual'" [ngModel]="s.routing[c.id] ?? ''" (ngModelChange)="route(c.id, $event)" [name]="'route-' + c.id" [attr.aria-label]="'Provider for ' + capabilityLabel(c.id)">
          <option value="">None</option>
          <option *ngFor="let p of supporting(c.id)" [value]="p.id">{{ p.label }}</option>
        </select>
      </div>
    </section>

    <section class="au-panel au-panel--padded au-mt-4" *ngFor="let p of seo?.providers">
      <h2 class="au-panel__title">{{ p.label }}</h2>
      <div class="au-row">
        <span class="au-badge" [ngClass]="p.enabled ? 'au-badge--brand' : 'au-badge--neutral'">{{ p.enabled ? 'Enabled' : 'Disabled' }}</span>
        <span class="au-badge au-badge--outline">{{ p.configured ? 'Credentials set' : 'No credentials' }}</span>
        <span class="au-badge au-badge--outline">Live verification: {{ p.liveVerification }}</span>
        <span class="au-badge au-badge--neutral" *ngIf="p.automationLocked">Automation locked until SEO-V2-02</span>
        <label class="au-row__meta">Priority
          <input class="au-input" style="width: 80px" type="number" min="1" max="999" [ngModel]="p.priority" (change)="setPriority(p, $event)" [name]="'prio-' + p.id" />
        </label>
        <button class="au-btn" type="button" (click)="toggle(p)">{{ p.enabled ? 'Disable' : 'Enable' }}</button>
      </div>
      <div class="au-row" *ngFor="let c of p.credentials">
        <span class="au-row__title">{{ c.label }}</span>
        <span class="au-badge au-badge--neutral">{{ c.source === 'ui' ? 'Set (panel)' : c.source === 'env' ? 'Set (server)' : 'Not set' }}</span>
        <input class="au-input au-flex-1" type="password" autocomplete="off" [placeholder]="c.envName" [(ngModel)]="drafts[c.envName]" [name]="'cred-' + c.envName" [attr.aria-label]="p.label + ' ' + c.label" />
        <button class="au-btn" type="button" [disabled]="!drafts[c.envName]" (click)="saveCredential(p, c.envName, drafts[c.envName])">Save</button>
        <button class="au-btn" type="button" *ngIf="c.source === 'ui'" (click)="saveCredential(p, c.envName, '')">Remove</button>
      </div>
      <p class="au-muted au-mt-2" *ngIf="p.health.lastErrorAt">Last error {{ p.health.lastErrorAt | date: 'short' }}: {{ p.health.lastErrorCode }} — {{ p.health.lastErrorMessage }}</p>
      <p class="au-muted au-mt-2" *ngIf="p.health.lastSuccessAt">Last success {{ p.health.lastSuccessAt | date: 'short' }}</p>

      <h3 class="au-panel__title au-mt-4 au-mb-2">Capabilities</h3>
      <div class="au-row" *ngFor="let id of capabilityIds">
        <span class="au-row__title">{{ capabilityLabel(id) }}</span>
        <span class="au-badge" [ngClass]="p.capabilities[id].supported ? 'au-badge--brand' : 'au-badge--neutral'">{{ p.capabilities[id].supported ? p.capabilities[id].dataKind : 'not supported' }}</span>
        <span class="au-row__meta">{{ p.capabilities[id].degraded || p.capabilities[id].reason || p.capabilities[id].methodology }}</span>
      </div>
      <p class="au-muted au-mt-2">
        Commercial use: {{ p.licensing.commercialUse }} · Storage: {{ p.licensing.storage }} · Sharing between workspaces: {{ p.licensing.crossTenantSharing }} ·
        <a [href]="p.licensing.termsUrl" target="_blank" rel="noopener noreferrer">Terms</a> checked {{ p.licensing.checkedAt }}
      </p>

      <h3 class="au-panel__title au-mt-4 au-mb-2">Live test (paid)</h3>
      <div class="au-row">
        <select class="au-input" [(ngModel)]="test[p.id].capability" [name]="'tc-' + p.id" [attr.aria-label]="'Capability to test on ' + p.label">
          <option *ngFor="let id of capabilityIds" [value]="id">{{ capabilityLabel(id) }}</option>
        </select>
        <input class="au-input" style="width: 90px" [(ngModel)]="test[p.id].locale" [name]="'tl-' + p.id" [attr.aria-label]="'Locale to test on ' + p.label" />
        <label class="au-row__meta">Max USD
          <input class="au-input" style="width: 90px" type="number" step="0.01" min="0" [max]="seo!.maxTestSpendUsd" [(ngModel)]="test[p.id].maxSpendUsd" [name]="'ts-' + p.id" />
        </label>
        <button class="au-btn" type="button" [disabled]="!p.enabled || !p.configured || testing || !test[p.id].maxSpendUsd" (click)="runTest(p)">Authorize and test</button>
      </div>
    </section>
    <p class="au-muted au-mt-2">Credentials are stored encrypted and never shown again. Saved credentials override the server environment.</p>
  `,
})
export class SeoProviderSettingsComponent implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  @Output() readonly forbidden = new EventEmitter<void>();
  readonly capabilityIds = Object.keys(CAPABILITY_LABELS);
  seo: AdminSeo | null = null;
  drafts: Record<string, string> = {};
  test: Record<string, { capability: string; locale: string; maxSpendUsd: number | null }> = {};
  testing = false;

  ngOnInit(): void {
    this.load();
  }

  modeLabel = (id: string) => MODE_LABELS[id] ?? id;
  capabilityLabel = (id: string) => CAPABILITY_LABELS[id] ?? id;
  reason = (code: string | null) => REASONS[code ?? ''] ?? code ?? 'unavailable';
  providerLabel = (id: string) => this.seo?.providers.find((p) => p.id === id)?.label ?? id;
  supporting = (capability: string) => this.seo?.providers.filter((p) => p.capabilities[capability].supported) ?? [];

  private load(): void {
    this.api.seo().subscribe({
      next: (seo) => {
        for (const p of seo.providers) this.test[p.id] ??= { capability: 'keyword_metrics', locale: 'es-ES', maxSpendUsd: null };
        this.seo = seo;
      },
      error: (e: { status?: number }) => (e.status === 403 ? this.forbidden.emit() : this.toast.error('Could not load the SEO providers.')),
    });
  }

  private after(message: string) {
    return {
      next: () => { this.toast.success(message); this.load(); },
      error: (e: { error?: { message?: string } }) => { this.toast.error(e?.error?.message ?? 'Could not save.'); this.load(); },
    };
  }

  setMode(mode: string): void {
    this.api.setSeoControl({ mode }).subscribe(this.after('Operating mode saved.'));
  }

  disableAll(): void {
    this.api.setSeoControl({ mode: 'disabled' }).subscribe(this.after('All external SEO calls are disabled.'));
  }

  route(capability: string, providerId: string): void {
    this.api.setSeoControl({ routing: { ...this.seo!.routing, [capability]: providerId } }).subscribe(this.after('Provider saved.'));
  }

  toggle(p: AdminSeoProvider): void {
    this.api.updateSeoProvider(p.id, { enabled: !p.enabled }).subscribe(this.after(`${p.label} is now ${p.enabled ? 'disabled' : 'enabled'}.`));
  }

  setPriority(p: AdminSeoProvider, event: Event): void {
    this.api.updateSeoProvider(p.id, { priority: Number((event.target as HTMLInputElement).value) }).subscribe(this.after('Priority saved.'));
  }

  saveCredential(p: AdminSeoProvider, envName: string, value: string): void {
    this.drafts[envName] = '';
    this.api.setSeoCredential(p.id, envName, value).subscribe(this.after(value ? 'Saved.' : 'Removed.'));
  }

  async runTest(p: AdminSeoProvider): Promise<void> {
    const input = this.test[p.id];
    const ok = await this.confirm.confirm({ title: `Call ${p.label} now?`, message: `One real ${this.capabilityLabel(input.capability)} request. It can cost up to ${input.maxSpendUsd} USD.`, confirmLabel: 'Authorize and test' });
    if (!ok) return;
    this.testing = true;
    this.api.testSeoProvider(p.id, { capability: input.capability, locale: input.locale, maxSpendUsd: Number(input.maxSpendUsd), authorize: true }).subscribe({
      next: (r) => { this.testing = false; this.toast.success(`${r.rows} rows, ${r.costUsd ?? 'unreported'} USD.`); this.load(); },
      error: (e) => { this.testing = false; this.toast.error(e?.error?.message ?? 'The test failed.'); this.load(); },
    });
  }
}
