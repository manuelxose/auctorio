import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdminAi, AdminApiService, AdminOverview, AdminTenant } from '../services/admin-api.service';
import { ToastService } from '../services/toast.service';
import { AiProviderSettingsComponent } from '../components/ai-provider-settings.component';
import { SeoProviderSettingsComponent } from '../components/seo-provider-settings.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';

type AdminSection = 'overview' | 'workspaces' | 'ai' | 'seo';

/** Platform admin area: first approximation of SaaS control (health, workspaces, AI keys and spend). */
@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppEmptyStateComponent, AiProviderSettingsComponent, SeoProviderSettingsComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">All workspaces</p>
          <h1 class="au-page__title">{{ titles[section] }}</h1>
          <p class="au-page__subtitle">Applies to every workspace on Auctorio, not only this one.</p>
        </div>
      </header>

      <app-empty-state *ngIf="denied" icon="lock" title="Platform admins only" text="Your account is not on the platform admin list (PLATFORM_ADMIN_EMAILS)."></app-empty-state>

      <div class="au-admin" *ngIf="!denied">
        <app-seo-provider-settings *ngIf="section === 'seo'" (forbidden)="denied = true"></app-seo-provider-settings>
        <p class="workspace-caption" *ngIf="section === 'overview' && overview">Platform overview · all workspaces</p>
        <div class="au-stats" *ngIf="section === 'overview' && overview">
          <div class="au-stat"><span class="au-stat__label">Workspaces</span><span class="au-stat__value">{{ overview.tenants }}</span><span class="au-stat__note">{{ overview.suspended }} suspended</span></div>
          <div class="au-stat"><span class="au-stat__label">Sites</span><span class="au-stat__value">{{ overview.sites }}</span></div>
          <div class="au-stat"><span class="au-stat__label">Users</span><span class="au-stat__value">{{ overview.users }}</span></div>
          <div class="au-stat"><span class="au-stat__label">Texts generated</span><span class="au-stat__value">{{ overview.texts }}</span></div>
          <div class="au-stat"><span class="au-stat__label">Images generated</span><span class="au-stat__value">{{ overview.images }}</span></div>
          <div class="au-stat" [class.is-alert]="overview.failedJobs24h > 0"><span class="au-stat__label">Failed jobs</span><span class="au-stat__value">{{ overview.failedJobs24h }}</span><span class="au-stat__note">last 24 hours</span></div>
        </div>

        <section class="au-panel" *ngIf="section === 'workspaces'">
          <header class="au-panel__header"><div>
            <h2 class="au-panel__title">Workspaces</h2>
            <p class="au-panel__subtitle">Suspend a workspace or set its plan. Suspended workspaces cannot use the API.</p>
          </div></header>
          <app-empty-state *ngIf="tenants.length === 0" icon="globe" title="No workspaces" text="Workspaces appear here once created."></app-empty-state>
          <div class="au-row" *ngFor="let t of tenants">
            <span class="au-row__title">{{ t.name }}</span>
            <span class="au-badge" [ngClass]="t.status === 'active' ? 'au-badge--brand' : 'au-badge--neutral'">{{ t.status }}</span>
            <span class="au-row__meta">{{ t.sites }} sites · {{ t.users }} users · {{ t.texts }} texts · {{ t.images }} images</span>
                        <input class="au-input" style="width: 120px" placeholder="plan" [(ngModel)]="plans[t.id]" [name]="'plan-' + t.id" (change)="setPlan(t)" aria-label="Plan" />
            <button class="au-btn" type="button" (click)="toggle(t)">{{ t.status === 'active' ? 'Suspend' : 'Reactivate' }}</button>
          </div>
        </section>

        <section class="au-panel au-panel--padded" *ngIf="section === 'ai'">
          <h2 class="au-panel__title">AI providers</h2>
          <p class="au-panel__subtitle au-mb-3">
            Only platform admins see this; workspace users never see which model they use. Workspaces with no choice use
            {{ ai?.defaults?.text }} for writing and {{ ai?.defaults?.image }} for images.
          </p>
          <h3 class="au-panel__title au-mb-2">API keys</h3>
          <div class="au-row" *ngFor="let p of ai?.providers">
            <span class="au-row__title">{{ p.label }}</span>
            <span class="au-badge au-badge--outline">{{ p.kind }}</span>
            <span class="au-badge" [ngClass]="p.configured ? 'au-badge--brand' : 'au-badge--neutral'">{{ p.configured ? 'Key set (' + (p.keySource === 'ui' ? 'panel' : 'server') + ')' : 'No key' }}</span>
            <input class="au-input au-flex-1" style="min-width: 180px" type="password" autocomplete="off" [placeholder]="p.keyEnv" [(ngModel)]="drafts[p.keyEnv]" [name]="'k-' + p.kind + p.id" [attr.aria-label]="p.label + ' API key'" />
            <button class="au-btn" type="button" [disabled]="!drafts[p.keyEnv]" (click)="saveKey(p.keyEnv)">Save</button>
            <button class="au-btn" type="button" *ngIf="p.keySource === 'ui'" (click)="clearKey(p.keyEnv)">Remove</button>
            <ng-container *ngIf="p.baseUrlEnv && p.id === 'custom'">
              <input class="au-input" style="min-width: 200px" [placeholder]="p.baseUrlEnv" [(ngModel)]="drafts[p.baseUrlEnv]" [name]="'u-' + p.id" aria-label="Endpoint URL" />
              <button class="au-btn" type="button" [disabled]="!drafts[p.baseUrlEnv]" (click)="saveKey(p.baseUrlEnv)">Save URL</button>
            </ng-container>
          </div>
          <p class="au-muted au-mt-2">Keys are stored encrypted and never shown again. Saved keys override the server environment.</p>

          <h3 class="au-panel__title au-mt-4 au-mb-2">Models for the active workspace</h3>
          <app-ai-provider-settings task="text" [canEdit]="true"></app-ai-provider-settings>
          <app-ai-provider-settings task="image" [canEdit]="true"></app-ai-provider-settings>

          <h3 class="au-panel__title au-mt-4 au-mb-2">Usage across all workspaces</h3>
          <app-empty-state *ngIf="!ai?.usage?.length" icon="sparkles" title="No AI usage yet" text="Usage appears after the first generation."></app-empty-state>
          <div class="au-row" *ngFor="let u of ai?.usage">
            <span class="au-row__title">{{ u.provider || 'unknown' }} / {{ u.model || 'unknown' }}</span>
            <span class="au-badge au-badge--outline">{{ u.kind }}</span>
            <span class="au-badge au-badge--neutral">{{ u.count }} {{ u.kind === 'text' ? 'texts' : 'images' }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="u.tokens">{{ u.tokens }} tokens</span>
            <span class="au-badge au-badge--brand">\${{ u.costUsd.toFixed(4) }}</span>
          </div>
        </section>
      </div>
    </section>
  `,
})
export class AdminPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  readonly titles: Record<AdminSection, string> = { overview: 'Usage', workspaces: 'Workspaces', ai: 'AI providers', seo: 'Proveedores SEO' };
  section: AdminSection = 'overview';
  denied = false;
  overview: AdminOverview | null = null;
  tenants: AdminTenant[] = [];
  plans: Record<string, string> = {};
  ai: AdminAi | null = null;
  drafts: Record<string, string> = {};

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const s = params.get('section');
      this.section = s === 'workspaces' || s === 'ai' || s === 'seo' ? s : 'overview';
      this.load();
    });
  }

  private load(): void {
    const fail = (e: { status?: number }) => { if (e.status === 403) this.denied = true; };
    if (this.section === 'overview') this.api.overview().subscribe({ next: (r) => (this.overview = r), error: fail });
    if (this.section === 'ai') this.api.ai().subscribe({ next: (r) => (this.ai = r), error: fail });
    if (this.section === 'workspaces') {
      this.api.tenants().subscribe({
        next: (r) => {
          this.tenants = r.items;
          this.plans = Object.fromEntries(r.items.map((t) => [t.id, t.plan ?? '']));
        },
        error: fail,
      });
    }
  }

  saveKey(envName: string, value = this.drafts[envName]): void {
    this.api.setKey(envName, value ?? '').subscribe({
      next: () => {
        this.drafts[envName] = '';
        this.toast.success(value ? 'Saved.' : 'Removed.');
        this.load();
      },
      error: (e) => this.toast.error(e?.error?.message ?? 'Could not save.'),
    });
  }

  clearKey(envName: string): void {
    this.saveKey(envName, '');
  }

  modelOf(m: { provider: string; model: string } | null): string {
    return m ? `${m.provider} / ${m.model}` : 'default';
  }

  toggle(t: AdminTenant): void {
    const status = t.status === 'active' ? 'suspended' : 'active';
    this.api.updateTenant(t.id, { status }).subscribe({
      next: () => { t.status = status; this.toast.success(`${t.name} is now ${status}.`); },
      error: () => this.toast.error('Could not update the workspace.'),
    });
  }

  setPlan(t: AdminTenant): void {
    this.api.updateTenant(t.id, { plan: this.plans[t.id] || null }).subscribe({
      next: () => this.toast.success('Plan saved.'),
      error: () => this.toast.error('Could not save the plan.'),
    });
  }
}