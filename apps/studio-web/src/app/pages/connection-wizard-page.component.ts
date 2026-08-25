import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import type {
  ConfigSchemaField,
  ConnectorCapabilitiesResponse,
  ConnectorInstallation,
  ConnectorKind,
  InstallationDetailResponse,
  WebsiteDiscoveryResult,
} from '../models/studio.models';

type Step = { id: number; label: string; state: 'done' | 'current' | 'todo' };

@Component({
  selector: 'app-connection-wizard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent],
  styles: [
    `
/* Destination cards */
.au-destination-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--au-s3);
}

.au-destination-card {
  display: flex;
  gap: var(--au-s3);
  align-items: center;
  border: 1px solid var(--au-border);
  background: var(--au-surface);
  border-radius: var(--au-r-md);
  padding: var(--au-s3);
  cursor: pointer;
  font: inherit;
  text-align: left;
  color: var(--au-text);
  transition: border-color var(--au-ease), box-shadow var(--au-ease);
}

.au-destination-card:hover { border-color: var(--au-border-strong); }
.au-destination-card.is-selected { border-color: var(--au-brand); box-shadow: var(--au-focus-ring); }

.au-destination-card__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--au-r-sm);
  background: var(--au-brand-soft);
  color: var(--au-brand);
  font-weight: 800;
  font-size: 12px;
  flex-shrink: 0;
}

.au-destination-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.au-destination-card__name {
  font-weight: 650;
}

.au-destination-card__hint {
  color: var(--au-muted);
  font-size: var(--au-fs-metadata);
}

/* Stepper */
.au-stepper {
  list-style: none;
  display: flex;
  gap: var(--au-s2);
  padding: 0;
  margin: 0 0 var(--au-s4);
  overflow-x: auto;
}

.au-step {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.au-step__dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--au-r-full);
  background: var(--au-surface-2);
  color: var(--au-muted);
  font-size: var(--au-fs-caption);
  font-weight: 650;
  border: 1px solid var(--au-border);
}

.au-step.is-current .au-step__dot {
  background: var(--au-brand);
  color: var(--au-on-brand);
  border-color: var(--au-brand);
}

.au-step.is-done .au-step__dot {
  background: var(--au-success-soft);
  color: var(--au-success);
  border-color: var(--au-success);
}

.au-step__label {
  font-size: var(--au-fs-body-sm);
  color: var(--au-muted);
  white-space: nowrap;
}

.au-step.is-current .au-step__label { color: var(--au-text); font-weight: 600; }

/* Connection methods */
.au-method-list {
  display: flex;
  flex-direction: column;
  gap: var(--au-s2);
}

.au-method-card {
  display: flex;
  align-items: center;
  gap: var(--au-s3);
  width: 100%;
  text-align: left;
  border: 1px solid var(--au-border);
  background: var(--au-surface);
  border-radius: var(--au-r-md);
  padding: var(--au-s3);
  cursor: pointer;
  font: inherit;
  color: var(--au-text);
  transition: border-color var(--au-ease);
}

.au-method-card:hover { border-color: var(--au-border-strong); }
.au-method-card.is-selected { border-color: var(--au-brand); box-shadow: var(--au-focus-ring); }

.au-method-card__desc {
  color: var(--au-muted);
  font-size: var(--au-fs-metadata);
  margin: 2px 0 0;
}

/* Verification probes */
.au-probe-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--au-s3);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.au-probe {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--au-fs-body-sm);
  color: var(--au-text-2);
}

.au-probe app-icon { color: var(--au-success); }
    `,
  ],
  template: `
    <section class="au-page au-page--narrow">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Universal connection installer</p>
          <h1 class="au-page__title">{{ resumeId ? 'Resume connection' : 'Connect destination' }}</h1>
          <p class="au-page__subtitle">Auctorio discovers, verifies and activates publishing destinations without code changes.</p>
        </div>
      </header>

      <div class="au-banner au-banner--error" *ngIf="fatalError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ fatalError }}</span>
        <button class="au-banner__action" type="button" (click)="reset()">Start over</button>
      </div>

      <!-- Stepper -->
      <ol class="au-stepper" *ngIf="!fatalError" aria-label="Connection steps">
        <li
          class="au-step"
          *ngFor="let step of steps"
          [class.is-current]="step.state === 'current'"
          [class.is-done]="step.state === 'done'"
          [attr.aria-current]="step.state === 'current' ? 'step' : undefined"
        >
          <span class="au-step__dot">
            <app-icon *ngIf="step.state === 'done'" name="check"></app-icon>
            <ng-container *ngIf="step.state !== 'done'">{{ step.id }}</ng-container>
          </span>
          <span class="au-step__label">{{ step.label }}</span>
        </li>
      </ol>

      <!-- Step 1: Choose destination -->
      <section class="au-panel au-panel--padded" *ngIf="stepIndex === 0">
        <h2 class="au-panel__title">What do you want to connect?</h2>
        <p class="au-panel__subtitle">Capabilities below come from the connector registry, not hard-coded cards.</p>
        <div class="au-destination-grid" *ngIf="capabilities">
          <button
            class="au-destination-card"
            type="button"
            *ngFor="let kind of capabilities.kinds"
            [class.is-selected]="kind.kind === selectedKind"
            (click)="selectKind(kind.kind)"
          >
            <span class="au-destination-card__mark" aria-hidden="true">{{ kind.mark }}</span>
            <span class="au-destination-card__body">
              <span class="au-destination-card__name">{{ kind.label }}</span>
              <span class="au-destination-card__hint">{{ kindHint(kind.kind) }}</span>
            </span>
          </button>
        </div>
        <div class="au-form__actions au-mt-3">
          <button class="au-btn au-btn--primary" type="button" (click)="continueFromKind()" [disabled]="!selectedKind">
            Continue
            <app-icon name="arrow-right"></app-icon>
          </button>
        </div>
      </section>

      <!-- Step 2: Website discovery -->
      <section class="au-panel au-panel--padded" *ngIf="stepIndex === 1">
        <h2 class="au-panel__title">Website discovery</h2>
        <p class="au-panel__subtitle">Enter the site URL. Auctorio normalizes it, blocks unsafe targets and probes only public, read-only endpoints.</p>
        <form (ngSubmit)="runDiscovery()">
          <label class="au-field">
            <span class="au-field__label">Website URL</span>
            <input class="au-input" type="url" name="url" [(ngModel)]="url" required placeholder="https://example.com" />
            <span class="au-field__hint">A public GET never marks a destination as connected.</span>
          </label>
          <p class="au-error" *ngIf="discoveryError">{{ discoveryError }}</p>
          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="submit" [disabled]="discovering || !url.trim()">
              <app-icon *ngIf="discovering" name="loader"></app-icon>
              {{ discovering ? 'Discovering…' : 'Discover' }}
            </button>
            <button class="au-btn au-btn--ghost" type="button" (click)="stepIndex = 0">Back</button>
          </div>
        </form>

        <div class="au-discovery au-mt-3" *ngIf="discovery">
          <h3 class="au-section-title">{{ discovery.title || discovery.canonicalOrigin }}</h3>
          <dl class="au-detail-grid">
            <dt>Canonical origin</dt><dd>{{ discovery.canonicalOrigin }}</dd>
            <dt>Reachable</dt><dd>{{ discovery.reachable ? 'Yes (HTTP ' + (discovery.httpStatus ?? '?') + ')' : 'No' }}</dd>
            <dt>CMS detected</dt><dd>{{ discovery.cms || 'Not identified' }}</dd>
            <dt>Locale</dt><dd>{{ discovery.locale || 'Unknown' }}</dd>
            <dt>Sitemaps</dt><dd>{{ discovery.sitemapUrls.length }} found</dd>
          </dl>
          <div class="au-banner" *ngFor="let warning of discovery.warnings">
            <app-icon name="info"></app-icon>
            <span class="au-banner__text">{{ warning }}</span>
          </div>
          <div class="au-form__actions au-mt-2">
            <button class="au-btn au-btn--primary" type="button" (click)="continueToMethod()">Choose connection method</button>
            <button class="au-btn au-btn--ghost" type="button" (click)="stepIndex = 0">Back</button>
          </div>
        </div>
      </section>

      <!-- Step 3: Connection method -->
      <section class="au-panel au-panel--padded" *ngIf="stepIndex === 2">
        <h2 class="au-panel__title">Connection method</h2>
        <p class="au-panel__subtitle">Only compatible options are shown. Advanced configuration is progressive disclosure.</p>
        <div class="au-method-list" *ngIf="currentKindView">
          <button
            class="au-method-card"
            type="button"
            *ngFor="let connector of currentKindView.connectors"
            [class.is-selected]="selectedProvider === connector.id"
            (click)="selectProvider(connector.id)"
          >
            <div class="au-flex-1">
              <div class="au-cell-title__name">{{ connector.name }}</div>
              <p class="au-method-card__desc">{{ connector.description }}</p>
            </div>
            <app-icon name="chevron-right"></app-icon>
          </button>
        </div>
        <p class="au-error" *ngIf="methodError">{{ methodError }}</p>
        <div class="au-form__actions">
          <button class="au-btn au-btn--primary" type="button" (click)="continueToAuth()" [disabled]="!selectedProvider">
            Continue
          </button>
          <button class="au-btn au-btn--ghost" type="button" (click)="backFromMethod()">Back</button>
        </div>
      </section>

      <!-- Step 4: Authenticate -->
      <section class="au-panel au-panel--padded" *ngIf="stepIndex === 3">
        <ng-container *ngIf="installation?.kind === 'website'; else socialAuth">
          <h2 class="au-panel__title">Authenticate securely</h2>
          <p class="au-panel__subtitle">Secrets are write-only: encrypted at rest and never displayed again.</p>
          <form (ngSubmit)="saveCredentials()">
            <label class="au-field" *ngFor="let field of configFields">
              <span class="au-field__label">{{ field.label }}<span *ngIf="field.required" aria-hidden="true"> *</span></span>
              <input
                *ngIf="field.kind !== 'select'"
                class="au-input"
                [class.au-mono]="field.kind === 'secret'"
                [type]="field.kind === 'secret' ? 'password' : field.kind === 'url' ? 'url' : 'text'"
                [name]="field.key"
                [placeholder]="field.placeholder || ''"
                [(ngModel)]="form[field.key]"
                autocomplete="off"
              />
              <select class="au-select" *ngIf="field.kind === 'select'" [name]="field.key" [(ngModel)]="form[field.key]">
                <option *ngFor="let option of field.options || []" [value]="option.value">{{ option.label }}</option>
              </select>
              <span class="au-field__hint" *ngIf="field.help">{{ field.help }}</span>
            </label>
            <p class="au-error" *ngIf="authError">{{ authError }}</p>
            <div class="au-form__actions">
              <button class="au-btn au-btn--primary" type="submit" [disabled]="saving">
                {{ saving ? 'Saving…' : 'Save and continue' }}
              </button>
              <button class="au-btn au-btn--ghost" type="button" (click)="saveAsIncomplete()">Save as incomplete</button>
              <button class="au-btn au-btn--ghost" type="button" (click)="stepIndex = 2">Back</button>
            </div>
          </form>
        </ng-container>

        <ng-template #socialAuth>
          <h2 class="au-panel__title">Authorize {{ kindLabel(installation?.kind) }}</h2>
          <p class="au-panel__subtitle" *ngIf="socialConnectorReady">
            Authorize Auctorio with OAuth (PKCE). The provider page opens in a new window and this wizard updates automatically.
          </p>
          <div class="au-banner au-banner--warning" *ngIf="!socialConnectorReady">
            <app-icon name="info"></app-icon>
            <span class="au-banner__text">
              A social provider must be configured server-side first (Ayrshare managed API, or X/Meta developer apps).
              Ask an operator to configure the provider credentials, then this step becomes one-click.
            </span>
          </div>
          <p class="au-error" *ngIf="authError">{{ authError }}</p>
          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="button" (click)="startSocialAuthorization()" [disabled]="!socialConnectorReady || authorizing">
              <app-icon name="plug"></app-icon>
              {{ authorizing ? 'Preparing…' : 'Authorize ' + kindLabel(installation?.kind) }}
            </button>
            <button class="au-btn au-btn--ghost" type="button" (click)="stepIndex = 2">Back</button>
          </div>
          <div class="au-banner au-banner--success" *ngIf="socialAuthorized" role="status">
            <app-icon name="check"></app-icon>
            <span class="au-banner__text">Authorization received. Continue to review and activation.</span>
          </div>
        </ng-template>
      </section>

      <!-- Step 5: Verify -->
      <section class="au-panel au-panel--padded" *ngIf="stepIndex === 4">
        <h2 class="au-panel__title">Verify capabilities</h2>
        <p class="au-panel__subtitle">Reversible probes only. Auctorio creates and deletes a sandbox draft; it never publishes public content without your confirmation.</p>
        <ul class="au-probe-list" *ngIf="detail?.descriptor">
          <li class="au-probe" *ngFor="let probe of detail!.descriptor!.verification.probes">
            <app-icon name="circle-check"></app-icon>
            {{ probe.label }}
            <span class="au-badge au-badge--neutral">reversible</span>
          </li>
        </ul>
        <div class="au-banner" *ngIf="verificationSummary && !verifying">
          <app-icon [name]="verificationPassed ? 'check' : 'warning'"></app-icon>
          <span class="au-banner__text">{{ verificationSummary }}</span>
        </div>
        <p class="au-error" *ngIf="verifyError">{{ verifyError }}</p>
        <div class="au-form__actions">
          <button class="au-btn au-btn--primary" type="button" (click)="runVerification()" [disabled]="verifying || verificationPassed">
            <app-icon *ngIf="verifying" name="loader"></app-icon>
            {{ verifying ? 'Verifying…' : verificationPassed ? 'Verified' : 'Run verification' }}
          </button>
          <button class="au-btn au-btn--ghost" type="button" (click)="stepIndex = 3">Back</button>
        </div>
      </section>

      <!-- Step 6: Review & activate -->
      <section class="au-panel au-panel--padded" *ngIf="stepIndex === 5">
        <h2 class="au-panel__title">Review and activate</h2>
        <dl class="au-detail-grid">
          <dt>Destination</dt><dd>{{ installation?.displayName || kindLabel(installation?.kind) }}</dd>
          <dt>Connector</dt><dd>{{ installation?.provider }}</dd>
          <dt>State</dt><dd>{{ stateLabel(installation?.state) }}</dd>
          <dt>Verified</dt><dd>{{ installation?.verifiedAt ? (installation!.verifiedAt | date: 'medium') : 'Not yet' }}</dd>
        </dl>
        <div class="au-banner au-banner--warning" *ngIf="installation?.kind === 'website' && !installation?.verifiedAt">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text">This destination has not passed verification. Activating without an authenticated capability check is not recommended.</span>
        </div>
        <p class="au-error" *ngIf="activateError">{{ activateError }}</p>
        <div class="au-form__actions">
          <button class="au-btn au-btn--primary" type="button" (click)="activate()" [disabled]="activating || !canActivate()">
            <app-icon name="plug"></app-icon>
            {{ activating ? 'Activating…' : 'Activate destination' }}
          </button>
          <button class="au-btn au-btn--ghost" type="button" (click)="stepIndex = 4" *ngIf="installation?.kind === 'website'">Back</button>
        </div>
      </section>
    </section>
  `,
})
export class ConnectionWizardPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private poll: Subscription | null = null;

  stepIndex = 0;
  steps: Step[] = [];
  capabilities: ConnectorCapabilitiesResponse | null = null;
  detail: InstallationDetailResponse | null = null;
  installation: ConnectorInstallation | null = null;
  selectedKind: ConnectorKind | null = null;
  selectedProvider = '';
  url = '';
  discovery: WebsiteDiscoveryResult | null = null;
  form: Record<string, string> = {};
  configFields: ConfigSchemaField[] = [];
  discovering = false;
  saving = false;
  verifying = false;
  authorizing = false;
  activating = false;
  socialAuthorized = false;
  fatalError = '';
  discoveryError = '';
  methodError = '';
  authError = '';
  verifyError = '';
  activateError = '';
  verificationSummary = '';
  verificationPassed = false;
  resumeId: string | null = null;

  get currentKindView(): { connectors: Array<{ id: string; name: string; description: string }> } | null {
    const kind = this.capabilities?.kinds.find((entry) => entry.kind === this.installation?.kind);
    return kind ?? null;
  }

  get socialConnectorReady(): boolean {
    const kind = this.capabilities?.kinds.find((entry) => entry.kind === this.installation?.kind);
    const connector = kind?.connectors[0];
    return Boolean(connector?.ready);
  }

  ngOnInit(): void {
    this.resumeId = this.route.snapshot.paramMap.get('id') ?? null;
    this.api.getConnectorCapabilities().subscribe({
      next: (capabilities) => {
        this.capabilities = capabilities;
        if (this.resumeId) {
          this.loadInstallation(this.resumeId);
        }
      },
      error: () => {
        this.fatalError = 'Connector capabilities could not be loaded. Try again.';
      },
    });
  }

  ngOnDestroy(): void {
    this.poll?.unsubscribe();
  }

  private loadInstallation(id: string): void {
    this.api.getConnectorInstallation(id).subscribe({
      next: (response) => {
        this.detail = response;
        this.installation = response.installation;
        this.selectedKind = response.installation.kind;
        this.selectedProvider = response.installation.provider;
        this.restoreConfig(response);
        this.restoreStep();
      },
      error: () => {
        this.fatalError = 'This installation draft could not be found.';
      },
    });
  }

  private restoreConfig(detail: InstallationDetailResponse): void {
    const config = (detail.installation.config ?? {}) as Record<string, unknown>;
    for (const field of detail.descriptor?.configSchema.fields ?? []) {
      if (field.kind !== 'secret' && typeof config[field.key] === 'string') {
        this.form[field.key] = config[field.key] as string;
      }
    }
    const discovered = detail.installation.discovered;
    if (discovered && typeof discovered === 'object' && 'canonicalOrigin' in discovered) {
      this.discovery = discovered as unknown as WebsiteDiscoveryResult;
    }
  }

  private restoreStep(): void {
    const state = this.installation?.state;
    if (this.installation?.kind !== 'website') {
      this.buildSocialSteps();
      this.stepIndex = state === 'active' ? 2 : state === 'ready' ? 2 : 1;
      this.socialAuthorized = state === 'ready' || state === 'active';
      return;
    }
    this.buildWebsiteSteps();
    switch (state) {
      case 'draft':
      case 'cancelled':
        this.stepIndex = this.discovery ? 2 : 1;
        break;
      case 'discovering':
        this.stepIndex = 1;
        this.watchOperation();
        break;
      case 'credentials_required':
        this.stepIndex = 3;
        break;
      case 'verifying':
        this.stepIndex = 4;
        this.watchOperation();
        break;
      case 'ready':
        this.stepIndex = 5;
        break;
      case 'failed':
        this.verificationSummary = this.installation?.lastError ?? '';
        this.stepIndex = this.form && Object.keys(this.form).length > 0 ? 4 : 3;
        break;
      default:
        this.stepIndex = 1;
    }
  }

  private buildWebsiteSteps(): void {
    this.steps = [
      { id: 1, label: 'Destination', state: 'todo' },
      { id: 2, label: 'Discover', state: 'todo' },
      { id: 3, label: 'Method', state: 'todo' },
      { id: 4, label: 'Authenticate', state: 'todo' },
      { id: 5, label: 'Verify', state: 'todo' },
      { id: 6, label: 'Review', state: 'todo' },
    ].map((step, index) => ({ ...step, state: index < this.stepIndex ? 'done' : index === this.stepIndex ? 'current' : 'todo' }));
  }

  private buildSocialSteps(): void {
    this.steps = [
      { id: 1, label: 'Destination', state: 'todo' },
      { id: 2, label: 'Authorize', state: 'todo' },
      { id: 3, label: 'Review', state: 'todo' },
    ].map((step, index) => ({ ...step, state: index < this.stepIndex ? 'done' : index === this.stepIndex ? 'current' : 'todo' }));
  }

  private refreshSteps(): void {
    this.steps = this.steps.map((step, index) => ({
      ...step,
      state: index < this.stepIndex ? 'done' : index === this.stepIndex ? 'current' : 'todo',
    }));
  }

  kindHint(kind: ConnectorKind): string {
    return kind === 'website' ? 'Blogs, CMS or REST APIs' : kind === 'x' ? 'Posts and threads' : 'Feed, stories and carousels';
  }

  kindLabel(kind: string | undefined): string {
    return kind === 'x' ? 'X' : kind === 'instagram' ? 'Instagram' : 'Website';
  }

  selectKind(kind: ConnectorKind): void {
    this.selectedKind = kind;
    this.selectedProvider = '';
    this.discovery = null;
    this.detail = null;
    this.installation = null;
  }

  continueFromKind(): void {
    if (!this.selectedKind) {
      return;
    }
    if (this.selectedKind === 'website') {
      this.buildWebsiteSteps();
      this.stepIndex = 1;
      this.refreshSteps();
      return;
    }
    // Social kinds: pick the OAuth connector from the registry.
    const kind = this.capabilities?.kinds.find((entry) => entry.kind === this.selectedKind);
    const connector = kind?.connectors[0];
    if (!connector) {
      this.fatalError = 'No connector is registered for this destination.';
      return;
    }
    this.selectedProvider = connector.id;
    this.createInstallation();
  }

  private createInstallation(): void {
    if (!this.selectedKind || !this.selectedProvider) {
      return;
    }
    this.api.createConnectorInstallation({
      kind: this.selectedKind,
      provider: this.selectedProvider,
      displayName: null as unknown as string | undefined,
    }).subscribe({
      next: (installation) => {
        this.installation = installation;
        this.detail = null;
        this.buildSocialSteps();
        this.stepIndex = 1;
        this.refreshSteps();
      },
      error: (err) => {
        this.fatalError = err?.error?.error?.message || 'The installation draft could not be created.';
      },
    });
  }

  runDiscovery(): void {
    this.discovering = true;
    this.discoveryError = '';
    this.api.discoverWebsite(this.url.trim()).subscribe({
      next: async (result) => {
        this.discovery = result;
        this.discovering = false;
        if (!this.installation) {
          await this.createWebsiteInstallationFromDiscovery();
        }
      },
      error: (err) => {
        this.discovering = false;
        this.discoveryError = err?.error?.error?.message || 'Discovery failed. Check the URL and try again.';
      },
    });
  }

  private createWebsiteInstallationFromDiscovery(): Promise<void> {
    const kind = this.capabilities?.kinds.find((entry) => entry.kind === 'website');
    const provider = this.suggestProvider();
    const connector = kind?.connectors.find((entry) => entry.id === provider);
    this.selectedProvider = connector?.id ?? provider;
    return new Promise((resolve) => {
      this.api.createConnectorInstallation({
        kind: 'website',
        provider: this.selectedProvider,
        displayName: this.discovery?.title || undefined,
      }).subscribe({
        next: (installation) => {
          this.installation = installation;
          resolve();
        },
        error: () => resolve(),
      });
    });
  }

  private suggestProvider(): string {
    const wp = this.discovery?.cms === 'wordpress';
    return wp ? 'generic_rest' : 'generic_rest';
  }

  continueToMethod(): void {
    this.buildWebsiteSteps();
    this.stepIndex = 2;
    this.refreshSteps();
  }

  selectProvider(provider: string): void {
    this.selectedProvider = provider;
    this.methodError = '';
  }

  continueToAuth(): void {
    if (!this.selectedProvider) {
      this.methodError = 'Choose a connection method.';
      return;
    }
    if (!this.installation || this.installation.provider !== this.selectedProvider) {
      this.api.createConnectorInstallation({
        kind: 'website',
        provider: this.selectedProvider,
        displayName: this.discovery?.title || undefined,
        siteId: undefined,
      }).subscribe({
        next: (installation) => {
          this.installation = installation;
          this.prepareConfig();
        },
        error: (err) => {
          this.methodError = err?.error?.error?.message || 'Could not prepare the installation.';
        },
      });
      return;
    }
    this.prepareConfig();
  }

  private prepareConfig(): void {
    this.api.getConnectorInstallation(this.installation!.id).subscribe({
      next: (response) => {
        this.detail = response;
        this.configFields = response.descriptor?.configSchema.fields ?? [];
        // Seed non-secret fields from discovery.
        if (this.discovery && !this.form['baseUrl']) {
          this.form['baseUrl'] = this.discovery.canonicalOrigin;
          this.form['locale'] = this.discovery.locale ?? '';
        }
        this.buildWebsiteSteps();
        this.stepIndex = 3;
        this.refreshSteps();
      },
      error: (err) => {
        this.methodError = err?.error?.error?.message || 'Could not load the configuration schema.';
      },
    });
  }

  backFromMethod(): void {
    if (this.installation?.kind === 'website') {
      this.stepIndex = 1;
    } else {
      this.stepIndex = 0;
    }
    this.refreshSteps();
  }

  saveCredentials(): void {
    if (!this.installation) {
      return;
    }
    this.saving = true;
    this.authError = '';
    const secrets: Record<string, string> = {};
    const config: Record<string, unknown> = {};
    for (const field of this.configFields) {
      const value = this.form[field.key] ?? '';
      if (field.kind === 'secret') {
        if (value) {
          secrets[field.key] = value;
        }
      } else if (value) {
        config[field.key] = value;
      }
    }
    const discovered = this.discovery;
    if (discovered) {
      config['baseUrl'] = discovered.canonicalOrigin;
      config['inputUrl'] = discovered.inputUrl;
    }
    this.api.storeInstallationCredentials(this.installation.id, { secrets, config }).subscribe({
      next: (installation) => {
        this.installation = installation;
        this.saving = false;
        // Clear secret values from memory immediately.
        for (const field of this.configFields) {
          if (field.kind === 'secret') {
            this.form[field.key] = '';
          }
        }
        this.buildWebsiteSteps();
        this.stepIndex = 4;
        this.refreshSteps();
      },
      error: (err) => {
        this.saving = false;
        this.authError = err?.error?.error?.message || 'Credentials could not be stored.';
      },
    });
  }

  saveAsIncomplete(): void {
    this.toast.info('Progress saved. You can resume from Connections.');
    void this.router.navigate(['/studio/connections']);
  }

  startSocialAuthorization(): void {
    if (!this.installation) {
      return;
    }
    this.authorizing = true;
    this.authError = '';
    this.api.startInstallationSocialSession(this.installation.id).subscribe({
      next: (session) => {
        this.authorizing = false;
        if (this.isBrowser) {
          window.open(session.url, '_blank', 'noopener');
        } else {
          this.toast.info(`Open ${session.url} to authorize.`);
        }
        this.toast.info('Authorize the account in the opened window.');
        this.watchForSocialCompletion();
      },
      error: (err) => {
        this.authorizing = false;
        this.authError = err?.error?.error?.message || 'Authorization could not be started.';
      },
    });
  }

  private watchForSocialCompletion(): void {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      this.api.listSocialConnections().subscribe({
        next: (response) => {
          const connected = response.items.find(
            (item) => item.connectionState === 'connected' && item.platform === this.installation?.kind,
          );
          if (connected) {
            this.socialAuthorized = true;
            this.toast.success('Account authorized.');
            clearInterval(timer);
          } else if (attempts >= 30) {
            clearInterval(timer);
          }
        },
        error: () => {
          if (attempts >= 30) {
            clearInterval(timer);
          }
        },
      });
    }, 4000);
  }

  runVerification(): void {
    if (!this.installation) {
      return;
    }
    this.verifying = true;
    this.verifyError = '';
    this.api.startInstallationVerification(this.installation.id).subscribe({
      next: (response) => {
        this.watchOperation(response.operationId);
      },
      error: (err) => {
        this.verifying = false;
        this.verifyError = err?.error?.error?.message || 'Verification could not be started.';
      },
    });
  }

  private watchOperation(operationId?: string): void {
    this.poll?.unsubscribe();
    let attempts = 0;
    const pollOperation = (): void => {
      attempts += 1;
      this.api.listOperations({ page: 1, pageSize: 20 }).subscribe({
        next: (response) => {
          const mine = response.items.find((item) => item.entityType === 'connector_installation' && item.entityId === this.installation?.id);
          const operation = operationId ? response.items.find((item) => item.id === operationId) : mine;
          if (operation && ['succeeded', 'failed', 'partial', 'cancelled'].includes(operation.status)) {
            this.poll?.unsubscribe();
            this.verifying = false;
            this.refreshInstallation();
            return;
          }
          if (attempts >= 60) {
            this.poll?.unsubscribe();
            this.verifying = false;
            this.refreshInstallation();
            return;
          }
        },
        error: () => {
          if (attempts >= 60) {
            this.poll?.unsubscribe();
            this.verifying = false;
          }
        },
      });
    };
    pollOperation();
    this.poll = interval(4000).subscribe(() => pollOperation());
  }

  private refreshInstallation(): void {
    if (!this.installation) {
      return;
    }
    this.api.getConnectorInstallation(this.installation.id).subscribe({
      next: (response) => {
        this.detail = response;
        this.installation = response.installation;
        if (response.installation.state === 'ready') {
          this.verificationPassed = true;
          this.verificationSummary = 'All runnable probes passed.';
          this.buildWebsiteSteps();
          this.stepIndex = 5;
          this.refreshSteps();
        } else if (response.installation.state === 'failed') {
          this.verificationSummary = response.installation.lastError ?? 'Verification failed.';
          this.verificationPassed = false;
          this.buildWebsiteSteps();
          this.stepIndex = 4;
          this.refreshSteps();
        } else if (response.installation.state === 'credentials_required') {
          this.buildWebsiteSteps();
          this.stepIndex = 3;
          this.refreshSteps();
        }
      },
      error: () => undefined,
    });
  }

  canActivate(): boolean {
    if (this.installation?.kind === 'website') {
      return Boolean(this.installation?.verifiedAt);
    }
    return this.socialAuthorized;
  }

  activate(): void {
    if (!this.installation) {
      return;
    }
    this.activating = true;
    this.activateError = '';
    const payload: { socialAccountId?: string } = {};
    if (this.installation.kind !== 'website') {
      this.api.listSocialConnections().subscribe({
        next: (response) => {
          const account = response.items.find(
            (item) => item.connectionState === 'connected' && item.platform === this.installation?.kind,
          );
          if (account) {
            payload.socialAccountId = account.id;
          }
          this.doActivate(payload);
        },
        error: () => this.doActivate(payload),
      });
      return;
    }
    this.doActivate(payload);
  }

  private doActivate(payload: { socialAccountId?: string }): void {
    this.api.activateInstallation(this.installation!.id, payload).subscribe({
      next: () => {
        this.activating = false;
        this.toast.success('Destination activated.');
        void this.router.navigate(['/studio/connections'], { queryParams: { activated: '1' } });
      },
      error: (err) => {
        this.activating = false;
        this.activateError = err?.error?.error?.message || 'Activation failed.';
      },
    });
  }

  stateLabel(state: string | undefined): string {
    switch (state) {
      case 'draft': return 'Draft';
      case 'discovering': return 'Discovering';
      case 'credentials_required': return 'Credentials required';
      case 'verifying': return 'Verifying';
      case 'ready': return 'Ready';
      case 'active': return 'Active';
      case 'failed': return 'Failed';
      case 'expired': return 'Expired';
      case 'disabled': return 'Disabled';
      case 'cancelled': return 'Cancelled';
      default: return state ?? '—';
    }
  }

  reset(): void {
    this.fatalError = '';
    this.stepIndex = 0;
    this.installation = null;
    this.detail = null;
    this.discovery = null;
    this.selectedKind = null;
    this.selectedProvider = '';
    this.form = {};
    this.resumeId = null;
    void this.router.navigate(['/studio/connections/wizard']);
  }
}
