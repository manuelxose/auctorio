import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { SocialSetupGuideComponent } from '../components/social-setup-guide.component';
import { OnboardingTimelineComponent } from '../components/intelligence/onboarding-timeline.component';
import { detectConnectTarget, type ConnectTarget } from '../utils/connect-target';
import type {
  ConfigSchemaField,
  ConnectorCapabilitiesResponse,
  ConnectorInstallation,
  ConnectorKind,
  InstallationDetailResponse,
  StudioSiteDetail,
  WebsiteDiscoveryResult,
} from '../models/studio.models';

type Step = { id: number; label: string; state: 'done' | 'current' | 'todo' };

/** A platform maps onto a registered connector plus field presets; provider null = not supported yet. */
type Platform = { id: string; name: string; mark: string; method: string; provider: string | null; preset?: Record<string, string> };

const PLATFORM_GROUPS: Array<{ label: string; items: Platform[] }> = [
  {
    label: 'Website platforms',
    items: [
      { id: 'wordpress', name: 'WordPress', mark: 'WP', method: 'Application password', provider: 'generic_rest',
        preset: { authScheme: 'basic_user_pass', restBasePath: '/wp-json/wp/v2', contentPath: '/posts', mediaPath: '/media' } },
      // shortcut: these need native adapters in src/studio/publishers.ts; enable each once its publisher exists.
      { id: 'webflow', name: 'Webflow', mark: 'WF', method: 'API token + CMS collection', provider: null },
      { id: 'shopify', name: 'Shopify', mark: 'SH', method: 'Custom app', provider: null },
      { id: 'wix', name: 'Wix', mark: 'WX', method: 'API key + Site ID', provider: null },
      { id: 'ghost', name: 'Ghost', mark: 'GH', method: 'Admin API key', provider: null },
      { id: 'framer', name: 'Framer', mark: 'FR', method: 'Plugin', provider: null },
    ],
  },
  {
    label: 'For developers',
    items: [
      { id: 'api', name: 'Auctorio API', mark: 'API', method: 'Your site pulls articles with a key', provider: 'auctorio_feed' },
      { id: 'rest', name: 'Custom REST API', mark: 'REST', method: 'Auctorio pushes with a bearer token', provider: 'generic_rest', preset: { authScheme: 'bearer' } },
      { id: 'webhook', name: 'Signed webhook', mark: '{ }', method: 'Endpoint + signing secret', provider: 'generic_webhook' },
    ],
  },
];

@Component({
  selector: 'app-connection-wizard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, SocialSetupGuideComponent, OnboardingTimelineComponent],
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

.au-destination-card { position: relative; padding: var(--au-s4) var(--au-s3); }
.au-destination-card:hover { transform: translateY(-1px); }
.au-destination-card__check { position: absolute; top: 10px; right: 10px; color: var(--au-brand); }
.au-destination-card__mark[data-kind='instagram'] { background: #fdeef4; color: #c13584; }
.au-destination-card__mark[data-kind='x'] { background: var(--au-text); color: var(--au-surface); }
.au-destination-card__mark[data-platform='wordpress'] { background: #e7f1f8; color: #21759b; }
.au-destination-card__mark[data-platform='webflow'] { background: #e9efff; color: #146ef5; }
.au-destination-card__mark[data-platform='shopify'] { background: #eef6e5; color: #5e8e3e; }
.au-destination-card__mark[data-platform='ghost'],
.au-destination-card__mark[data-platform='framer'],
.au-destination-card__mark[data-platform='wix'] { background: var(--au-surface-2, #f2f2f4); color: var(--au-text); }
.au-destination-card__mark[data-platform='rest'],
.au-destination-card__mark[data-platform='webhook'] { background: var(--au-info-soft); color: var(--au-info); font-family: var(--au-font-mono, monospace); }

/* Platform gallery */
.au-platform-group {
  margin: var(--au-s4) 0 var(--au-s2);
  font-size: var(--au-fs-body-sm);
  font-weight: 650;
  color: var(--au-text-2);
}

.au-platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--au-s2);
}

.au-platform-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--au-s3);
  text-align: left;
  border: 1px solid var(--au-border);
  background: var(--au-surface);
  border-radius: var(--au-r-md);
  padding: var(--au-s3);
  cursor: pointer;
  font: inherit;
  color: var(--au-text);
  transition: border-color var(--au-ease), box-shadow var(--au-ease);
}

.au-platform-card:hover:not(:disabled) { border-color: var(--au-border-strong); }
.au-platform-card.is-selected { border-color: var(--au-brand); box-shadow: var(--au-focus-ring); }
.au-platform-card:disabled { cursor: not-allowed; opacity: 0.6; }
.au-platform-card__badge { position: absolute; top: 8px; right: 8px; }

.au-platform-steps {
  margin: 0 0 var(--au-s3);
  padding: var(--au-s3) var(--au-s3) var(--au-s3) calc(var(--au-s3) + 16px);
  background: var(--au-brand-soft);
  border-radius: var(--au-r-md);
  font-size: var(--au-fs-body-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.au-codebox {
  display: flex;
  align-items: flex-start;
  gap: var(--au-s2);
  background: var(--au-surface-2, #f4f4f6);
  border: 1px solid var(--au-border);
  border-radius: var(--au-r-sm);
  padding: var(--au-s2) var(--au-s3);
  margin: var(--au-s2) 0;
  overflow-x: auto;
}
.au-codebox code, .au-codebox pre { flex: 1; margin: 0; font-size: 12.5px; white-space: pre; word-break: break-all; }
.au-segmented { display: inline-flex; border: 1px solid var(--au-border); border-radius: var(--au-r-sm); overflow: hidden; margin-bottom: var(--au-s2); }
.au-segmented button { font: inherit; font-size: var(--au-fs-body-sm); border: 0; background: transparent; padding: 6px 14px; cursor: pointer; color: var(--au-text-2); }
.au-segmented button.is-active { background: var(--au-brand-soft); color: var(--au-brand); font-weight: 650; }
.au-guide { font-size: var(--au-fs-body-sm); color: var(--au-text-2); }
.au-guide ul { padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.au-agent-brief { width: 100%; font-size: 12.5px; line-height: 1.5; }

.au-advanced { margin: var(--au-s2) 0 var(--au-s3); }
.au-advanced summary { cursor: pointer; color: var(--au-text-2); font-size: var(--au-fs-body-sm); margin-bottom: var(--au-s2); }

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
          <p class="au-page__eyebrow">Connections</p>
          <h1 class="au-page__title">{{ resumeId ? 'Resume connection' : 'Connect a site or account' }}</h1>
          <p class="au-page__subtitle">Auctorio reads the destination, checks it with a test draft and only then lets you publish to it</p>
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
      <section class="au-panel au-panel--padded" *ngIf="panel === 0">
        <h2 class="au-panel__title">What do you want to connect?</h2>
        <p class="au-panel__subtitle">Paste a website address, a profile link or an @handle. Auctorio works out the rest.</p>

        <form class="au-magic" (ngSubmit)="startFromTarget()">
          <label class="au-magic__field">
            <span class="au-sr-only">Website, profile link or handle</span>
            <app-icon name="plug"></app-icon>
            <input
              class="au-magic__input"
              type="text"
              name="target"
              autocomplete="off"
              spellcheck="false"
              [(ngModel)]="targetInput"
              (ngModelChange)="detected = detect($event)"
              placeholder="example.com, instagram.com/yourbrand or @yourbrand"
              aria-describedby="au-magic-result"
            />
            <button class="au-btn au-btn--primary" type="submit" [disabled]="!detected || detected.kind === 'handle'">
              Connect
              <app-icon name="arrow-right"></app-icon>
            </button>
          </label>
          <div id="au-magic-result" class="au-magic__result" aria-live="polite">
            @if (detected) {
              @if (detected.kind === 'handle') {
                <span>Which network is {{ detected.label }} on?</span>
                <button class="au-btn au-btn--sm" type="button" (click)="startSocial('instagram', detected.handle)">Instagram</button>
                <button class="au-btn au-btn--sm" type="button" (click)="startSocial('x', detected.handle)">X</button>
              } @else {
                <span class="au-magic__chip" [attr.data-kind]="detected.kind">
                  <app-icon [name]="detected.kind === 'website' ? 'globe' : 'user'"></app-icon>
                  {{ detected.kind === 'website' ? 'Website' : '' }} {{ detected.label }}
                </span>
                <span class="au-muted">{{ detected.kind === 'website' ? 'Next: read the site and suggest how to publish to it' : 'Next: authorize the account' }}</span>
              }
            } @else if (targetInput.trim()) {
              <span class="au-muted">Enter a domain like example.com, a profile link, or a handle starting with &#64;</span>
            }
          </div>
        </form>

        <p class="au-magic__or"><span>or choose a destination</span></p>
        <div class="au-destination-grid" *ngIf="capabilities">
          <button
            class="au-destination-card"
            type="button"
            *ngFor="let kind of capabilities.kinds"
            [class.is-selected]="kind.kind === selectedKind"
            (click)="selectKind(kind.kind)"
          >
            <span class="au-destination-card__mark" aria-hidden="true" [attr.data-kind]="kind.kind">{{ kind.mark }}</span>
            <span class="au-destination-card__body">
              <span class="au-destination-card__name">{{ kind.label }}</span>
              <span class="au-destination-card__hint">{{ kindHint(kind.kind) }}</span>
            </span>
            <app-icon class="au-destination-card__check" *ngIf="kind.kind === selectedKind" name="circle-check"></app-icon>
          </button>
        </div>
        <div class="au-form__actions au-mt-3">
          <button class="au-btn au-btn--primary" type="button" (click)="continueFromStart()" [disabled]="!selectedKind && !canStartFromTarget()">
            Continue
            <app-icon name="arrow-right"></app-icon>
          </button>
        </div>
      </section>

      <!-- Step 2: Website discovery -->
      <section class="au-panel au-panel--padded" *ngIf="panel === 1">
        <h2 class="au-panel__title">Read the website</h2>
        <p class="au-panel__subtitle">Auctorio looks only at public pages: the CMS, the language and the sitemaps. Nothing is changed on the site.</p>
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
      <section class="au-panel au-panel--padded" *ngIf="panel === 2">
        <h2 class="au-panel__title">Where is the site built?</h2>
        <p class="au-panel__subtitle">Pick the platform{{ discovery?.cms ? ' (we detected ' + discovery!.cms + ')' : '' }}. Auctorio asks only for what that platform needs.</p>
        @for (group of platformGroups; track group.label) {
          <h3 class="au-platform-group">{{ group.label }}</h3>
          <div class="au-platform-grid">
            @for (platform of group.items; track platform.id) {
              <button
                class="au-platform-card"
                type="button"
                [class.is-selected]="platformChoice === platform.id"
                [disabled]="!platform.provider"
                [attr.aria-pressed]="platformChoice === platform.id"
                (click)="selectPlatform(platform)"
              >
                <span class="au-destination-card__mark" aria-hidden="true" [attr.data-platform]="platform.id">{{ platform.mark }}</span>
                <span class="au-destination-card__body">
                  <span class="au-destination-card__name">{{ platform.name }}</span>
                  <span class="au-destination-card__hint">{{ platform.method }}</span>
                </span>
                @if (!platform.provider) {
                  <span class="au-badge au-badge--neutral au-platform-card__badge">Coming soon</span>
                } @else if (platform.id === recommendedPlatform) {
                  <span class="au-badge au-badge--success au-platform-card__badge">{{ platform.id === 'wordpress' ? 'Detected' : 'Recommended' }}</span>
                }
              </button>
            }
          </div>
        }
        <p class="au-error" *ngIf="methodError">{{ methodError }}</p>
        <div class="au-form__actions">
          <button class="au-btn au-btn--primary" type="button" (click)="continueToAuth()" [disabled]="!selectedProvider">
            Continue
          </button>
          <button class="au-btn au-btn--ghost" type="button" (click)="backFromMethod()">Back</button>
        </div>
      </section>

      <!-- Step 4: Authenticate -->
      <section class="au-panel au-panel--padded" *ngIf="panel === 3">
        <ng-container *ngIf="installation?.kind === 'website' && platformChoice === 'api'">
          <h2 class="au-panel__title">Connect with the Auctorio API</h2>
          <p class="au-panel__subtitle">
            A developer integration: your site's code fetches finished articles on a schedule and stores them.
            Auctorio never writes to your server.
          </p>

          <h3 class="au-platform-group">1. Your API key</h3>
          @if (feedKey) {
            <div class="au-codebox">
              <code class="au-mono">{{ feedKey }}</code>
              <button class="au-btn au-btn--sm" type="button" (click)="copy(feedKey, 'API key')">Copy</button>
            </div>
            <p class="au-field__hint">Shown only now. Keep it server-side: never in client code or a public repository. Generating a new key revokes this one.</p>
          } @else {
            <p class="au-muted" *ngIf="feedKeyHint">A key ending in …{{ feedKeyHint }} is active. Generate a new one only if you lost it; the old key stops working.</p>
            <button class="au-btn au-btn--primary" type="button" (click)="issueFeedKey()" [disabled]="issuingKey">
              <app-icon [name]="issuingKey ? 'loader' : 'plug'"></app-icon>
              {{ issuingKey ? 'Generating…' : feedKeyHint ? 'Generate a new key' : 'Generate API key' }}
            </button>
          }

          <h3 class="au-platform-group">2. Set up your site</h3>
          <div class="au-segmented" role="tablist">
            <button type="button" role="tab" [attr.aria-selected]="feedTab === 'guide'" [class.is-active]="feedTab === 'guide'" (click)="feedTab = 'guide'">Guide</button>
            <button type="button" role="tab" [attr.aria-selected]="feedTab === 'agent'" [class.is-active]="feedTab === 'agent'" (click)="feedTab = 'agent'">Copy for agent</button>
          </div>
          @if (feedTab === 'guide') {
            <div class="au-guide">
              <p><strong>Environment variables</strong> (server-side). Sites with a ready Auctorio client, like GuíaTV's sync job, only need these:</p>
              <div class="au-codebox"><pre class="au-mono">AUCTORIO_FEED_API_KEY={{ feedKey || 'your_api_key' }}
AUCTORIO_FEED_BASE_URL={{ feedBase }}{{ feedSiteKey ? '\\nAUCTORIO_FEED_SITE=' + feedSiteKey : '' }}</pre></div>
              <p><strong>Every request</strong> sends <code>X-API-Key</code> and <code>Content-Type: application/json</code>.</p>
              <div class="au-codebox"><pre class="au-mono">curl "{{ feedBase }}/v1/articles?limit=50&amp;offset=0" \\
  -H "X-API-Key: {{ feedKey || 'your_api_key' }}"

curl "{{ feedBase }}/v1/articles/ARTICLE_ID" \\
  -H "X-API-Key: {{ feedKey || 'your_api_key' }}"</pre></div>
              <ul>
                <li>The list returns summaries, newest first, at most 50 per page; page with <code>offset</code> until a page comes back short.</li>
                <li>The single article returns <code>content_html</code>, <code>content_markdown</code>, <code>meta_description</code>, <code>hero_image_url</code>, <code>jsonLd</code> and <code>published_url</code>. Upsert by <code>slug</code>.</li>
                <li>Store articles yourself and serve them from there; run the sync on a schedule (every 15–60 min) and on deploy, never on page views.</li>
              </ul>
            </div>
          } @else {
            <textarea class="au-input au-mono au-agent-brief" readonly rows="14" [value]="agentInstructions" aria-label="Instructions for a coding agent"></textarea>
            <div class="au-form__actions">
              <button class="au-btn au-btn--sm" type="button" (click)="copy(agentInstructions, 'Instructions')">Copy instructions</button>
            </div>
          }

          <h3 class="au-platform-group">3. Run your sync once, then verify</h3>
          <p class="au-muted">Auctorio marks the connection verified when it sees the first request with this key.</p>
          <p class="au-error" *ngIf="authError">{{ authError }}</p>
          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="button" (click)="continueToVerify()" [disabled]="!feedKey && !feedKeyHint">
              I've set it up — verify
              <app-icon name="arrow-right"></app-icon>
            </button>
            <button class="au-btn au-btn--ghost" type="button" (click)="saveAsIncomplete()">Finish later</button>
            <button class="au-btn au-btn--ghost" type="button" (click)="stepIndex = 2; refreshSteps()">Back</button>
          </div>
        </ng-container>

        <ng-container *ngIf="installation?.kind === 'website'; else socialAuth">
          <ng-container *ngIf="platformChoice !== 'api'">
          <h2 class="au-panel__title">Authenticate securely</h2>
          <p class="au-panel__subtitle">Secrets are write-only: encrypted at rest and never displayed again.</p>
          <form (ngSubmit)="saveCredentials()">
            <ol class="au-platform-steps" *ngIf="platformChoice === 'wordpress'">
              <li>In WordPress, open <strong>Users → Profile</strong> with an Administrator or Editor account.</li>
              <li>Under <strong>Application passwords</strong>, type “Auctorio” and click <strong>Add new</strong>.</li>
              <li>Paste your username and the generated password below.</li>
            </ol>
            <label class="au-field" *ngIf="platformChoice === 'wordpress'">
              <span class="au-field__label">WordPress username<span aria-hidden="true"> *</span></span>
              <input class="au-input" type="text" name="wpUser" [(ngModel)]="wpUser" autocomplete="off" required />
            </label>
            <ng-container *ngTemplateOutlet="fieldList; context: { $implicit: primaryFields }"></ng-container>
            <details class="au-advanced" *ngIf="advancedFields.length">
              <summary>Advanced settings</summary>
              <ng-container *ngTemplateOutlet="fieldList; context: { $implicit: advancedFields }"></ng-container>
            </details>
            <ng-template #fieldList let-fields>
              <label class="au-field" *ngFor="let field of fields">
                <span class="au-field__label">{{ fieldLabel(field) }}<span *ngIf="field.required" aria-hidden="true"> *</span></span>
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
                <span class="au-field__hint" *ngIf="fieldHelp(field)">{{ fieldHelp(field) }}</span>
              </label>
            </ng-template>
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
        </ng-container>

        <ng-template #socialAuth>
          <h2 class="au-panel__title">Authorize {{ kindLabel(installation?.kind) }}{{ socialHandle ? ' · @' + socialHandle : '' }}</h2>
          <p class="au-panel__subtitle" *ngIf="socialConnectorReady">
            Sign in to the account in the window that opens. This page updates on its own when it is done.
          </p>
          <app-social-setup-guide *ngIf="!socialConnectorReady" [platform]="installation?.kind === 'x' ? 'x' : 'instagram'"></app-social-setup-guide>
          <p class="au-error" *ngIf="authError">{{ authError }}</p>
          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="button" (click)="startSocialAuthorization()" [disabled]="!socialConnectorReady || authorizing">
              <app-icon name="plug"></app-icon>
              {{ authorizing ? 'Preparing…' : 'Authorize ' + kindLabel(installation?.kind) }}
            </button>
            <button class="au-btn au-btn--ghost" type="button" (click)="stepIndex = 0; refreshSteps()">Back</button>
          </div>
          <div class="au-banner au-banner--success" *ngIf="socialAuthorized" role="status">
            <app-icon name="check"></app-icon>
            <span class="au-banner__text">Authorization received</span>
            <button class="au-banner__action" type="button" (click)="stepIndex = 2; refreshSteps()">Continue to review</button>
          </div>
        </ng-template>
      </section>

      <!-- Step 5: Verify -->
      <section class="au-panel au-panel--padded" *ngIf="panel === 4">
        <h2 class="au-panel__title">Verify capabilities</h2>
        <p class="au-panel__subtitle">{{ detail?.descriptor?.verification?.notes || 'Auctorio creates a test draft, reads it back and deletes it. Nothing is published.' }}</p>
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
      <!-- After a website activates: live editorial onboarding of the new destination -->
      <ng-container *ngIf="onboardingSiteId">
        <div class="au-banner au-banner--success au-mb-3">
          <app-icon name="circle-check"></app-icon>
          <span class="au-banner__text">Destination activated. Auctorio is now learning the website; this runs in the background and you can leave this page.</span>
        </div>
        <section class="au-panel au-panel--padded au-mb-3" *ngIf="profileSite">
          <h2 class="au-panel__title">About {{ profileSite.name }}</h2>
          <p class="au-panel__subtitle">Every article is written from this context. Check what Auctorio read from the site and correct it.</p>
          <form (ngSubmit)="saveProfile()">
            <label class="au-field">
              <span class="au-field__label">Website language</span>
              <select class="au-select" name="profileLocale" [(ngModel)]="profileLocale">
                <option *ngFor="let locale of localeOptions" [value]="locale.value">{{ locale.label }}</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">What the site does</span>
              <textarea class="au-input" name="profileDescription" rows="4" maxlength="2000" [(ngModel)]="profileDescription"
                placeholder="e.g. Free TV listings for every channel in Spain, with what's on now, films and series picks"></textarea>
            </label>
            <label class="au-field">
              <span class="au-field__label">Target audience</span>
              <textarea class="au-input" name="profileAudience" rows="4" [(ngModel)]="profileAudience"
                placeholder="One group per line, e.g. viewers who want to know what's on TV tonight"></textarea>
              <span class="au-field__hint">One audience per line.</span>
            </label>
            <label class="au-field">
              <span class="au-field__label">Target location</span>
              <input class="au-input" name="profileLocation" [(ngModel)]="profileLocation" placeholder="e.g. Spain" />
              <span class="au-field__hint">Countries or cities, separated by commas.</span>
            </label>
            <p class="au-error" *ngIf="profileError">{{ profileError }}</p>
            <div class="au-form__actions">
              <button class="au-btn au-btn--primary" type="submit" [disabled]="profileSaving">
                {{ profileSaving ? 'Saving…' : profileSavedAt ? 'Saved' : 'Looks good, save' }}
              </button>
            </div>
          </form>
        </section>
        <app-onboarding-timeline [siteId]="onboardingSiteId" [showStrategyLink]="true"></app-onboarding-timeline>
        <div class="au-form__actions au-mt-3">
          <button class="au-btn au-btn--ghost" type="button" (click)="goToConnections()">Back to connections</button>
        </div>
      </ng-container>

      <section class="au-panel au-panel--padded" *ngIf="panel === 5 && !onboardingSiteId">
        <h2 class="au-panel__title">Review and activate</h2>
        <dl class="au-detail-grid">
          <dt>Destination</dt><dd>{{ installation?.displayName || kindLabel(installation?.kind) }}</dd>
          <dt>Connector</dt><dd>{{ detail?.descriptor?.name || installation?.provider }}</dd>
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
  private readonly ngPlatformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.ngPlatformId);
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
  targetInput = '';
  detected: ConnectTarget | null = null;
  socialHandle: string | null = null;
  /** Set once a website activates: the wizard then shows that site's onboarding timeline. */
  onboardingSiteId: string | null = null;

  readonly platformGroups = PLATFORM_GROUPS;
  platformChoice = '';
  wpUser = '';

  get recommendedPlatform(): string {
    if (this.discovery?.cms === 'wordpress') return 'wordpress';
    return this.discovery && !this.discovery.cms ? 'api' : '';
  }

  // Auctorio API (pull) setup
  feedKey = '';
  feedSiteKey: string | null = null;
  feedBaseUrl = '';
  feedTab: 'guide' | 'agent' = 'guide';
  issuingKey = false;

  /** Hint of a key issued earlier (the key itself is never shown twice). */
  get feedKeyHint(): string {
    const config = (this.installation?.config ?? {}) as Record<string, unknown>;
    return typeof config['feedKeyHint'] === 'string' ? config['feedKeyHint'] : '';
  }

  get feedBase(): string {
    return this.feedBaseUrl || 'https://auctorio.com/api/integrations';
  }

  get siteOrigin(): string {
    return this.discovery?.canonicalOrigin ?? String((this.installation?.config as Record<string, unknown> | undefined)?.['baseUrl'] ?? '');
  }

  /** Paste-ready brief for a coding agent working on the destination site. */
  get agentInstructions(): string {
    const key = this.feedKey || '<your Auctorio API key>';
    return [
      `# Connect ${this.siteOrigin || 'this website'} to Auctorio (pull API)`,
      '',
      'Goal: articles Auctorio publishes for this site appear here automatically.',
      '',
      '## Credentials (server-side environment only, never in client code or git)',
      `AUCTORIO_FEED_API_KEY=${key}`,
      `AUCTORIO_FEED_BASE_URL=${this.feedBase}`,
      ...(this.feedSiteKey ? [`AUCTORIO_FEED_SITE=${this.feedSiteKey}`] : []),
      '',
      'If this codebase already has an Auctorio/BabyLoveGrowth feed client that reads these variables, only set them and run the sync once.',
      '',
      '## API',
      'Every request sends `X-API-Key: $AUCTORIO_FEED_API_KEY` and `Content-Type: application/json`.',
      '- List (summaries, newest first): `GET $AUCTORIO_FEED_BASE_URL/v1/articles?limit=50&offset=0` → `{ items, total, limit, offset }`. Max limit 50; keep paging with offset until a page has fewer items than the limit.',
      '- One article (full body): `GET $AUCTORIO_FEED_BASE_URL/v1/articles/{id}` → `{ article }`.',
      '',
      '## Article fields',
      '- `id`, `slug` (idempotency key: upsert by slug), `title`, `publishedAt` (ISO 8601), `languageCode`',
      '- `content_html` (sanitized HTML, use it for most CMSs), `content_markdown`',
      '- `meta_description`, `hero_image_url`',
      '- `jsonLd` (Article schema for the page head as application/ld+json), `faqJsonLd` (may be null)',
      '- `published_url` (empty until Auctorio detects the live URL)',
      '',
      '## Implement',
      '1. A sync job: list every page, fetch each new or changed article by id, upsert it into this site\'s own storage by slug. Never call the API on page views (it is rate-limited).',
      '2. Schedule it (cron or background job every 15–60 minutes) and run it on deploy.',
      '3. Render title, content_html, meta description, hero image and JSON-LD; canonical URL = this site\'s URL for the slug.',
      '4. Run the sync once now: Auctorio verifies the connection when it sees the first request with this key.',
      '',
      '## Done when',
      '- The first sync returns HTTP 200 (an empty list is fine before anything is published).',
      '- "Verify" passes in the Auctorio connection wizard.',
    ].join('\n');
  }

  issueFeedKey(): void {
    if (!this.installation) return;
    this.issuingKey = true;
    this.authError = '';
    this.api.issueInstallationFeedKey(this.installation.id, this.siteOrigin).subscribe({
      next: (response) => {
        this.issuingKey = false;
        this.installation = response.installation;
        this.feedKey = response.key;
        this.feedSiteKey = response.siteKey;
        this.feedBaseUrl = response.feedBaseUrl;
      },
      error: (err) => {
        this.issuingKey = false;
        this.authError = err?.error?.message || err?.error?.error?.message || 'The API key could not be generated.';
      },
    });
  }

  copy(text: string, label: string): void {
    if (!this.isBrowser || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => this.toast.success(`${label} copied`));
  }

  // Site profile (after activation)
  profileSite: StudioSiteDetail | null = null;
  profileLocale = '';
  profileDescription = '';
  profileAudience = '';
  profileLocation = '';
  profileSaving = false;
  profileSavedAt = '';
  profileError = '';

  get localeOptions(): Array<{ value: string; label: string }> {
    const options = [
      { value: 'es-ES', label: 'Spanish (Spain)' }, { value: 'es-MX', label: 'Spanish (Mexico)' },
      { value: 'en-US', label: 'English (US)' }, { value: 'en-GB', label: 'English (UK)' },
      { value: 'pt-BR', label: 'Portuguese (Brazil)' }, { value: 'pt-PT', label: 'Portuguese (Portugal)' },
      { value: 'fr-FR', label: 'French' }, { value: 'de-DE', label: 'German' }, { value: 'it-IT', label: 'Italian' },
    ];
    return options.some((option) => option.value === this.profileLocale) || !this.profileLocale
      ? options
      : [{ value: this.profileLocale, label: this.profileLocale }, ...options];
  }

  private loadSiteProfile(siteId: string): void {
    this.api.getSite(siteId).subscribe({
      next: (site) => {
        const voice = (site.brandVoice ?? {}) as Record<string, unknown>;
        const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(String).filter(Boolean) : []);
        this.profileSite = site;
        this.profileLocale = site.locale || this.discovery?.locale?.replace('_', '-') || 'es-ES';
        this.profileDescription = typeof voice['description'] === 'string' ? voice['description'] : '';
        this.profileAudience = list(voice['audience']).join('\n');
        this.profileLocation = list(voice['location']).join(', ');
        if (!this.profileDescription || !this.profileAudience) {
          // Not confirmed yet: prefill from what onboarding detected, when it has run.
          this.api.getEditorialProfile(siteId).subscribe({
            next: (profile) => {
              this.profileDescription ||= profile.editorialDescription ?? '';
              this.profileAudience ||= profile.audience.join('\n');
            },
            error: () => undefined,
          });
        }
      },
      error: () => undefined,
    });
  }

  saveProfile(): void {
    const site = this.profileSite;
    if (!site) return;
    this.profileSaving = true;
    this.profileError = '';
    const lines = (value: string, separator: RegExp) => value.split(separator).map((entry) => entry.trim()).filter(Boolean);
    const brandVoice = {
      ...(site.brandVoice ?? {}),
      description: this.profileDescription.trim(),
      audience: lines(this.profileAudience, /\n/),
      location: lines(this.profileLocation, /,/),
      confirmedAt: new Date().toISOString(),
    };
    this.api.updateSite(site.id, { name: site.name, type: site.type, locale: this.profileLocale, brandVoice }).subscribe({
      next: (updated) => {
        this.profileSite = updated;
        this.profileSaving = false;
        this.profileSavedAt = new Date().toISOString();
        this.toast.success('Site profile saved');
        this.api.rebuildEditorialProfile(site.id).subscribe({ error: () => undefined });
      },
      error: (err) => {
        this.profileSaving = false;
        this.profileError = err?.error?.message || 'The profile could not be saved.';
      },
    });
  }

  continueToVerify(): void {
    this.buildWebsiteSteps();
    this.stepIndex = 4;
    this.refreshSteps();
    this.runVerification();
  }

  get primaryFields(): ConfigSchemaField[] {
    return this.configFields.filter((field) => field.required);
  }

  get advancedFields(): ConfigSchemaField[] {
    return this.configFields.filter((field) => !field.required);
  }

  fieldLabel(field: ConfigSchemaField): string {
    return this.platformChoice === 'wordpress' && field.key === 'apiToken' ? 'Application password' : field.label;
  }

  fieldHelp(field: ConfigSchemaField): string | undefined {
    return this.platformChoice === 'wordpress' && field.key === 'apiToken' ? 'The 24-character password WordPress generated, spaces included.' : field.help;
  }

  selectPlatform(platform: Platform): void {
    if (!platform.provider) return;
    this.platformChoice = platform.id;
    this.selectProvider(platform.provider);
  }

  canStartFromTarget(): boolean {
    return Boolean(this.detected && this.detected.kind !== 'handle');
  }

  /** Continue on step 1 uses a selected card, or else what was typed in the box. */
  continueFromStart(): void {
    if (!this.selectedKind && this.canStartFromTarget()) {
      this.startFromTarget();
      return;
    }
    this.continueFromKind();
  }

  /** Panels follow the website numbering; the 3-step social flow maps onto authorize (3) and review (5). */
  get panel(): number {
    if (this.installation && this.installation.kind !== 'website') return [0, 3, 5][this.stepIndex] ?? 0;
    return this.stepIndex;
  }

  get socialConnectorReady(): boolean {
    const kind = this.capabilities?.kinds.find((entry) => entry.kind === this.installation?.kind);
    const connector = kind?.connectors[0];
    return Boolean(connector?.ready);
  }

  ngOnInit(): void {
    this.resumeId = this.route.snapshot.paramMap.get('id') ?? null;
    const target = this.route.snapshot.queryParamMap.get('target') ?? '';
    this.api.getConnectorCapabilities().subscribe({
      next: (capabilities) => {
        this.capabilities = capabilities;
        if (this.resumeId) {
          this.loadInstallation(this.resumeId);
        } else if (target) {
          // Arrived from a "Connect" box elsewhere: start with what was pasted there.
          this.targetInput = target;
          this.detected = this.detect(target);
          if (this.detected && this.detected.kind !== 'handle') this.startFromTarget();
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
        const config = (response.installation.config ?? {}) as Record<string, unknown>;
        this.platformChoice = response.installation.provider === 'generic_rest' && config['authScheme'] === 'bearer'
          ? 'rest'
          : this.platformForProvider(response.installation.provider);
        this.configFields = response.descriptor?.configSchema.fields ?? [];
        this.restoreStep();
        this.refreshSteps(); // the step list is built before restoreStep picks the step
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

  refreshSteps(): void {
    this.steps = this.steps.map((step, index) => ({
      ...step,
      state: index < this.stepIndex ? 'done' : index === this.stepIndex ? 'current' : 'todo',
    }));
  }

  detect(value: string): ConnectTarget | null {
    return detectConnectTarget(value);
  }

  /** One-box start: a website goes straight to discovery, a profile straight to authorization. */
  startFromTarget(): void {
    const target = this.detected;
    if (!target || target.kind === 'handle') return;
    if (target.kind === 'website') {
      this.selectKind('website');
      this.continueFromKind();
      this.url = target.url;
      this.runDiscovery();
      return;
    }
    this.startSocial(target.kind, target.handle);
  }

  /** Resumes an unfinished draft for the same network instead of piling up duplicates. */
  startSocial(kind: 'instagram' | 'x', handle: string | null): void {
    this.socialHandle = handle;
    this.selectKind(kind);
    this.api.listConnectorInstallations(kind).subscribe({
      next: (response) => {
        const open = response.items.find((item) => item.state === 'draft' || item.state === 'cancelled');
        if (open) {
          this.loadInstallation(open.id);
        } else {
          this.continueFromKind();
        }
      },
      error: () => this.continueFromKind(),
    });
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

  /** WordPress gets the REST push; any other site (custom code, frameworks) pulls from the Auctorio API. */
  private suggestProvider(): string {
    return this.discovery?.cms === 'wordpress' ? 'generic_rest' : 'auctorio_feed';
  }

  continueToMethod(): void {
    if (!this.platformChoice) this.platformChoice = this.platformForProvider(this.selectedProvider);
    this.buildWebsiteSteps();
    this.stepIndex = 2;
    this.refreshSteps();
  }

  private platformForProvider(provider: string): string {
    if (provider === 'generic_webhook') return 'webhook';
    if (provider === 'auctorio_feed') return 'api';
    if (provider !== 'generic_rest') return '';
    return this.discovery?.cms === 'wordpress' || !this.discovery ? 'wordpress' : 'rest';
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
        const preset = PLATFORM_GROUPS.flatMap((group) => group.items).find((item) => item.id === this.platformChoice)?.preset;
        Object.assign(this.form, preset ?? {});
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
    // The REST publisher sends Basic base64(apiToken), so WordPress needs "user:application-password".
    if (this.platformChoice === 'wordpress' && secrets['apiToken']) {
      if (!this.wpUser.trim()) {
        this.saving = false;
        this.authError = 'Enter the WordPress username.';
        return;
      }
      secrets['apiToken'] = `${this.wpUser.trim()}:${secrets['apiToken']}`;
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
      next: (response) => {
        this.activating = false;
        this.toast.success('Destination activated.');
        // Website activation starts onboarding (see routes-connectors.ts); show its live timeline here.
        const initialization = (response as ConnectorInstallation & { initialization?: { siteId?: string } | null }).initialization;
        // A re-linked site whose onboarding already ran returns no initialization; it still gets the profile step.
        const siteId = initialization?.siteId ?? response.siteId;
        if (this.installation?.kind === 'website' && siteId) {
          this.installation = response;
          this.onboardingSiteId = siteId;
          this.loadSiteProfile(siteId);
          return;
        }
        this.goToConnections();
      },
      error: (err) => {
        this.activating = false;
        this.activateError = err?.error?.error?.message || 'Activation failed.';
      },
    });
  }

  goToConnections(): void {
    void this.router.navigate(['/studio/connections'], { queryParams: { activated: '1' } });
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
