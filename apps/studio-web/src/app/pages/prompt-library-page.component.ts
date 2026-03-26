import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { StudioEmptyStateComponent } from '../components/studio-empty-state.component';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioSidePanelComponent } from '../components/studio-side-panel.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import type {
  StudioProjectSummary,
  StudioPromptPresetDetail,
  StudioPromptPresetSummary,
  StudioPromptVersionSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type PromptSurface = 'text_seo' | 'text_instagram' | 'image_contextual' | 'image_independent';

@Component({
  selector: 'app-prompt-library-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    StudioEmptyStateComponent,
    StudioPageHeaderComponent,
    StudioSidePanelComponent,
    StudioStatStripComponent,
  ],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="AI Generation"
        title="Prompt Library"
        intro="Presets versionados, approvals, asignaciones por site y preview sobre contexto editorial real."
      >
        <div page-meta *ngIf="!loading">
          <span class="console-tag console-tag--accent">{{ presets.length }} presets</span>
          <span class="console-tag console-tag--success">{{ approvedPresetCount }} approved</span>
          <span class="console-tag console-tag--muted">{{ assignedPresetCount }} assigned</span>
        </div>

        <a page-actions class="console-button console-button--secondary" routerLink="/studio/ai/text-generation">
          Open text generation
        </a>
        <button page-actions type="button" class="console-button" (click)="loadData()">
          Refresh prompts
        </button>
      </app-studio-page-header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="stats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Prompt posture</p>
            <h2 class="console-surface__title">Governance of the AI runtime</h2>
            <p class="console-hero-copy__body">{{ libraryNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Approved presets</span>
                <strong>{{ approvedPresetCount }}</strong>
                <small>Presets whose latest saved version is already approved for production usage.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Assignments</span>
                <strong>{{ assignedPresetCount }}</strong>
                <small>Defaults currently resolved by tenant or by site for downstream generation flows.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Site scoped</span>
                <strong>{{ siteScopedPresetCount }}</strong>
                <small>Overrides that already diverge from the tenant global baseline.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Prompt governance watchlist</h2>
              </div>
            </div>

            <div class="console-focus-list">
              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                [disabled]="!approvalLead"
                (click)="focusPrompt(approvalLead)"
              >
                <div>
                  <strong>{{ approvalLead?.name || 'Approval backlog clear' }}</strong>
                  <p>{{ approvalLead ? approvalLeadNarrative : 'No draft preset is currently waiting for approval.' }}</p>
                </div>
                <span class="console-tag" [ngClass]="approvalLead ? 'console-tag--warning' : 'console-tag--success'">
                  {{ approvalLead ? 'Needs approval' : 'Healthy' }}
                </span>
              </button>

              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                [disabled]="!assignmentLead"
                (click)="focusPrompt(assignmentLead)"
              >
                <div>
                  <strong>{{ assignmentLead?.name || 'Assignment gap' }}</strong>
                  <p>{{ assignmentLead ? assignmentLeadNarrative : 'No active default is currently assigned to a preset.' }}</p>
                </div>
                <span class="console-tag" [ngClass]="assignmentLead ? 'console-tag--accent' : 'console-tag--warning'">
                  {{ assignmentLead ? 'Assigned' : 'Needs assignment' }}
                </span>
              </button>

              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                [disabled]="!siteScopedLead"
                (click)="focusPrompt(siteScopedLead)"
              >
                <div>
                  <strong>{{ siteScopedLead?.name || 'Global baseline only' }}</strong>
                  <p>{{ siteScopedLead ? siteScopedLeadNarrative : 'No site-specific override exists yet in the current library.' }}</p>
                </div>
                <span class="console-tag" [ngClass]="siteScopedLead ? 'console-tag--muted' : 'console-tag--accent'">
                  {{ siteScopedLead ? 'Site scoped' : 'Tenant default' }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Library</p>
                <h2 class="console-surface__title">Prompt presets</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ filteredPresets.length }} visible presets</span>
            </div>

            <div class="console-toolbar console-toolbar--stretch">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  [formControl]="queryControl"
                  placeholder="Preset, surface, site or active assignment"
                />
              </label>
              <label class="console-select">
                <span>Surface</span>
                <select [formControl]="surfaceControl">
                  <option value="">All surfaces</option>
                  <option value="text_seo">Text SEO</option>
                  <option value="text_instagram">Text Instagram</option>
                  <option value="image_contextual">Image contextual</option>
                  <option value="image_independent">Image independent</option>
                </select>
              </label>
            </div>

            <div class="console-list-grid" *ngIf="filteredPresets.length; else emptyPresets">
              <article class="console-list-card" *ngFor="let preset of filteredPresets" (click)="selectPreset(preset)">
                <div class="console-version-card__head">
                  <div>
                    <strong>{{ preset.name }}</strong>
                    <p>{{ preset.key }} · {{ surfaceLabel(preset.surface) }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span class="console-tag console-tag--muted">{{ preset.scope }}</span>
                    <span *ngIf="preset.latestVersion" class="console-tag" [ngClass]="versionStatusTagClass(preset.latestVersion.status)">
                      v{{ preset.latestVersion.versionNumber }} · {{ preset.latestVersion.status }}
                    </span>
                  </div>
                </div>

                <p class="console-version-card__body">
                  {{ preset.description || 'No description provided for this prompt preset.' }}
                </p>

                <div class="console-meta-grid">
                  <article class="console-meta-card">
                    <span>Assignment</span>
                    <strong>{{ preset.activeAssignment?.assignmentKey || 'Unassigned' }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Owner scope</span>
                    <strong>{{ preset.site?.name || 'Tenant default' }}</strong>
                  </article>
                </div>
              </article>
            </div>
          </section>

          <section class="console-surface console-surface--editorial" *ngIf="selectedPromptDetail as prompt">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Detail</p>
                <h2 class="console-surface__title">{{ prompt.name }}</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ prompt.versions.length }} versions</span>
            </div>

            <div class="console-toolbar console-toolbar--stretch">
              <label class="console-select">
                <span>Preview project</span>
                <select [formControl]="previewProjectControl" (change)="reloadSelectedPrompt()">
                  <option value="">No preview</option>
                  <option *ngFor="let project of projects" [value]="project.id">{{ project.title }}</option>
                </select>
              </label>

              <label class="console-select">
                <span>Assign site</span>
                <select #assignmentSite class="console-input console-input--compact">
                  <option value="">Global default</option>
                  <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
                </select>
              </label>
            </div>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Assignments</span>
                <strong>{{ prompt.assignments.length }}</strong>
                <small>Active tenant or site-level defaults currently tied to this preset.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Preview source</span>
                <strong>{{ prompt.preview?.source || 'manual' }}</strong>
                <small>Origin of the resolved context used to render the current prompt preview.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Latest version</span>
                <strong>{{ prompt.latestVersion ? 'v' + prompt.latestVersion.versionNumber : 'none' }}</strong>
                <small>{{ prompt.latestVersion?.status || 'No version has been saved yet.' }}</small>
              </article>
            </div>

            <div class="console-prompt-layout">
              <div class="console-prompt-timeline">
                <article class="console-prompt-version" *ngFor="let version of prompt.versions">
                  <div class="console-version-card__head">
                    <div>
                    <strong>v{{ version.versionNumber }}</strong>
                    <p>{{ version.createdBy?.displayName || 'System seed' }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span class="console-tag" [ngClass]="versionStatusTagClass(version.status)">
                      {{ version.status }}
                    </span>
                  </div>
                </div>

                  <p class="console-version-card__body">{{ version.notes || 'No notes for this version.' }}</p>

                  <div class="console-inline-actions">
                    <button
                      type="button"
                      class="console-button console-button--secondary console-button--small"
                      (click)="copyVersionToDraft(version)"
                    >
                      Create draft
                    </button>
                    <button
                      type="button"
                      class="console-button console-button--secondary console-button--small"
                      *ngIf="version.status === 'draft'"
                      (click)="approveVersion(prompt.id, version.id)"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      class="console-button console-button--secondary console-button--small"
                      *ngIf="version.status !== 'deprecated'"
                      (click)="deprecateVersion(prompt.id, version.id)"
                    >
                      Deprecate
                    </button>
                    <button
                      type="button"
                      class="console-button console-button--small"
                      *ngIf="version.status === 'approved'"
                      (click)="assignVersion(prompt.id, version.id, assignmentSite.value)"
                    >
                      Assign
                    </button>
                  </div>
                </article>
              </div>

              <div class="console-prompt-preview">
                <section class="console-surface console-surface--nested">
                  <div class="console-surface__head">
                    <div>
                      <p class="console-surface__eyebrow">Preview</p>
                      <h2 class="console-surface__title">Resolved prompt</h2>
                    </div>
                  </div>

                  <div class="console-code-block">
                    <strong>System</strong>
                    <pre>{{ prompt.preview?.systemPrompt || 'Select a project to render preview context.' }}</pre>
                  </div>

                  <div class="console-code-block">
                    <strong>User</strong>
                    <pre>{{ prompt.preview?.userPrompt || 'Prompt preview requires a selected project.' }}</pre>
                  </div>
                </section>

                <section class="console-surface console-surface--nested">
                  <div class="console-surface__head">
                    <div>
                      <p class="console-surface__eyebrow">Assignments</p>
                      <h2 class="console-surface__title">Resolved defaults</h2>
                    </div>
                  </div>

                  <div class="console-feed" *ngIf="prompt.assignments.length; else emptyAssignments">
                    <article class="console-feed__item" *ngFor="let assignment of prompt.assignments">
                      <div>
                        <strong>{{ assignment.assignmentKey }}</strong>
                        <p>{{ assignment.site?.name || 'Tenant default' }} · v{{ assignment.version.versionNumber }} · {{ assignment.version.status }}</p>
                      </div>
                      <span class="console-tag" [ngClass]="versionStatusTagClass(assignment.version.status)">
                        {{ assignment.site ? 'Site' : 'Global' }}
                      </span>
                    </article>
                  </div>
                </section>
              </div>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <app-studio-side-panel eyebrow="Create" title="New preset">
            <form class="console-form" [formGroup]="createForm" (ngSubmit)="createPreset()">
              <label class="console-field">
                <span>Name</span>
                <input type="text" formControlName="name" placeholder="SEO Article Prompt" />
              </label>

              <label class="console-field">
                <span>Key</span>
                <input type="text" formControlName="key" placeholder="text-seo-v2" />
              </label>

              <label class="console-field">
                <span>Surface</span>
                <select formControlName="surface">
                  <option value="text_seo">Text SEO</option>
                  <option value="text_instagram">Text Instagram</option>
                  <option value="image_contextual">Image contextual</option>
                  <option value="image_independent">Image independent</option>
                </select>
              </label>

              <label class="console-field">
                <span>Scope</span>
                <select formControlName="scope">
                  <option value="global">Global</option>
                  <option value="site">Site</option>
                </select>
              </label>

              <label class="console-field" *ngIf="createForm.controls.scope.value === 'site'">
                <span>Site</span>
                <select formControlName="siteId">
                  <option value="">Select a site</option>
                  <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
                </select>
              </label>

              <label class="console-field">
                <span>Description</span>
                <textarea rows="3" formControlName="description"></textarea>
              </label>

              <label class="console-field">
                <span>System template</span>
                <textarea rows="4" formControlName="systemTemplate"></textarea>
              </label>

              <label class="console-field">
                <span>User template</span>
                <textarea rows="8" formControlName="userTemplate"></textarea>
              </label>

              <label class="console-field">
                <span>Notes</span>
                <textarea rows="3" formControlName="notes"></textarea>
              </label>

              <button type="submit" class="console-button console-button--full" [disabled]="createForm.invalid || savingPreset">
                {{ savingPreset ? 'Saving…' : 'Create preset' }}
              </button>
            </form>
          </app-studio-side-panel>

          <app-studio-side-panel eyebrow="Draft" title="Create next version">
            <form class="console-form" [formGroup]="draftForm" (ngSubmit)="createDraftVersion()" *ngIf="selectedPromptDetail">
              <label class="console-field">
                <span>System template</span>
                <textarea rows="4" formControlName="systemTemplate"></textarea>
              </label>

              <label class="console-field">
                <span>User template</span>
                <textarea rows="8" formControlName="userTemplate"></textarea>
              </label>

              <label class="console-field">
                <span>Notes</span>
                <textarea rows="3" formControlName="notes"></textarea>
              </label>

              <button type="submit" class="console-button console-button--full" [disabled]="draftForm.invalid || savingVersion">
                {{ savingVersion ? 'Creating…' : 'Create draft version' }}
              </button>
            </form>

            <div class="console-empty-compact" *ngIf="!selectedPromptDetail">
              <p>Select a preset to create its next draft version.</p>
            </div>
          </app-studio-side-panel>
        </aside>
      </div>

      <ng-template #loadingState>
        <app-studio-empty-state
          kicker="AI Generation"
          title="Loading prompt library"
          body="Estamos reuniendo presets, versiones aprobadas y asignaciones activas por surface."
        ></app-studio-empty-state>
      </ng-template>

      <ng-template #emptyPresets>
        <app-studio-empty-state
          kicker="AI Generation"
          title="No prompt presets yet"
          body="Crea el primer preset editable para empezar a gobernar el runtime de IA desde el cockpit."
        ></app-studio-empty-state>
      </ng-template>

      <ng-template #emptyAssignments>
        <div class="console-empty-compact">
          <p>No active assignments for this preset yet.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class PromptLibraryPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly route = inject(ActivatedRoute);

  readonly createForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    key: new FormControl('', { nonNullable: true }),
    surface: new FormControl<PromptSurface>('text_seo', { nonNullable: true }),
    scope: new FormControl<'global' | 'site'>('global', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    systemTemplate: new FormControl('', { nonNullable: true }),
    userTemplate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true }),
  });

  readonly draftForm = new FormGroup({
    systemTemplate: new FormControl('', { nonNullable: true }),
    userTemplate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true }),
  });

  readonly queryControl = new FormControl('', { nonNullable: true });
  readonly surfaceControl = new FormControl('', { nonNullable: true });
  readonly previewProjectControl = new FormControl('', { nonNullable: true });

  presets: StudioPromptPresetSummary[] = [];
  filteredPresets: StudioPromptPresetSummary[] = [];
  selectedPromptDetail: StudioPromptPresetDetail | null = null;
  stats: StudioStatItem[] = [];
  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  loading = true;
  savingPreset = false;
  savingVersion = false;
  error = '';
  notice = '';

  get approvedPresetCount(): number {
    return this.presets.filter((preset) => preset.latestVersion?.status === 'approved').length;
  }

  get assignedPresetCount(): number {
    return this.presets.filter((preset) => Boolean(preset.activeAssignment)).length;
  }

  get siteScopedPresetCount(): number {
    return this.presets.filter((preset) => preset.scope === 'site').length;
  }

  get approvalLead(): StudioPromptPresetSummary | null {
    return this.filteredPresets.find((preset) => preset.latestVersion?.status === 'draft') ?? null;
  }

  get assignmentLead(): StudioPromptPresetSummary | null {
    return this.filteredPresets.find((preset) => preset.latestVersion?.status === 'approved' && !preset.activeAssignment) ?? null;
  }

  get siteScopedLead(): StudioPromptPresetSummary | null {
    return this.filteredPresets.find((preset) => preset.scope === 'site') ?? null;
  }

  get libraryNarrative(): string {
    if (!this.presets.length) {
      return 'Todavia no existe una libreria de prompts gobernable. Antes de escalar generacion y canales hace falta fijar presets versionados y asignables.';
    }

    const draftCount = this.presets.filter((preset) => preset.latestVersion?.status === 'draft').length;

    if (draftCount > 0) {
      return `${draftCount} preset${draftCount === 1 ? '' : 's'} siguen con una draft version en cabeza. La libreria ya no es solo almacenamiento: es la cola de gobierno del runtime de IA antes de mover defaults a producción.`;
    }

    if (this.assignedPresetCount < this.approvedPresetCount) {
      return `${this.approvedPresetCount - this.assignedPresetCount} preset${this.approvedPresetCount - this.assignedPresetCount === 1 ? '' : 's'} aprobados siguen sin asignacion activa. El riesgo ya no está en escribir prompts, sino en gobernar su resolución real.`;
    }

    return `${this.approvedPresetCount} presets aprobados y ${this.assignedPresetCount} asignaciones activas ya gobiernan el runtime de IA. Prompt library empieza a funcionar como control plane, no como repositorio pasivo.`;
  }

  get approvalLeadNarrative(): string {
    return this.approvalLead
      ? `${this.surfaceLabel(this.approvalLead.surface)} · latest version still waits for approval before becoming a safe default.`
      : '';
  }

  get assignmentLeadNarrative(): string {
    return this.assignmentLead
      ? `${this.surfaceLabel(this.assignmentLead.surface)} · approved but still missing an active assignment.`
      : '';
  }

  get siteScopedLeadNarrative(): string {
    return this.siteScopedLead
      ? `${this.siteScopedLead.site?.name || 'Site scope'} override already diverges from the tenant default.`
      : '';
  }

  ngOnInit(): void {
    this.queryControl.valueChanges.subscribe(() => this.applyFilters());
    this.surfaceControl.valueChanges.subscribe(() => this.applyFilters());
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      presets: this.api.listPromptPresets(),
      sites: this.api.listSites(1, 100),
      projects: this.api.listProjects({ page: 1, pageSize: 100 }),
    }).subscribe({
      next: ({ presets, sites, projects }) => {
        this.presets = presets;
        this.sites = sites.items;
        this.projects = projects.items;
        this.stats = [
          {
            label: 'Presets',
            value: presets.length,
            detail: 'Objetos gobernables del runtime de prompts.',
            tone: presets.length > 0 ? 'accent' : 'muted',
          },
          {
            label: 'Approved versions',
            value: presets.filter((preset) => preset.latestVersion?.status === 'approved').length,
            detail: 'Presets cuya versión más reciente ya está aprobada.',
            tone: presets.some((preset) => preset.latestVersion?.status === 'approved') ? 'success' : 'muted',
          },
          {
            label: 'Assignments',
            value: presets.filter((preset) => Boolean(preset.activeAssignment)).length,
            detail: 'Defaults activos resueltos por tenant o por site.',
            tone: presets.some((preset) => Boolean(preset.activeAssignment)) ? 'accent' : 'warning',
          },
          {
            label: 'Surfaces',
            value: 4,
            detail: 'Text SEO, Instagram y generación de imagen contextual/independiente.',
            tone: 'muted',
          },
        ];
        this.applyFilters();
        this.loading = false;

        const requestedPresetKey = String(
          this.route.snapshot.queryParamMap.get('preset') || '',
        ).trim();
        if (requestedPresetKey && !this.selectedPromptDetail) {
          const match = presets.find((preset) => preset.key === requestedPresetKey);
          if (match) {
            this.selectPreset(match);
          }
        }

        if (this.selectedPromptDetail) {
          const stillExists = presets.find((preset) => preset.id === this.selectedPromptDetail?.id);
          if (stillExists) {
            this.selectPreset(stillExists, false);
          } else {
            this.selectedPromptDetail = null;
          }
        }
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
    });
  }

  applyFilters(): void {
    const query = this.queryControl.value.trim().toLowerCase();
    const surface = this.surfaceControl.value;

    this.filteredPresets = this.presets.filter((preset) => {
      if (surface && preset.surface !== surface) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [
        preset.name,
        preset.key,
        preset.description || '',
        preset.surface,
        preset.site?.name || '',
        preset.activeAssignment?.assignmentKey || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  selectPreset(preset: StudioPromptPresetSummary, resetDraft = true): void {
    this.api
      .getPromptPreset(preset.id, this.previewProjectControl.value || null)
      .subscribe({
        next: (detail) => {
          this.selectedPromptDetail = detail;
          if (resetDraft) {
            const baseVersion = detail.versions[0];
            this.draftForm.reset({
              systemTemplate: baseVersion?.systemTemplate || '',
              userTemplate: baseVersion?.userTemplate || '',
              notes: '',
            });
          }
        },
        error: (error) => {
          this.error = formatApiError(error);
        },
      });
  }

  focusPrompt(preset: StudioPromptPresetSummary | null): void {
    if (!preset) {
      return;
    }

    this.selectPreset(preset);
  }

  reloadSelectedPrompt(): void {
    const presetId = this.selectedPromptDetail?.id;
    if (!presetId) {
      return;
    }

    const preset = this.presets.find((item) => item.id === presetId);
    if (preset) {
      this.selectPreset(preset, false);
    }
  }

  createPreset(): void {
    if (this.createForm.invalid || this.savingPreset) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.savingPreset = true;
    this.api
      .createPromptPreset({
        key: this.createForm.controls.key.value.trim() || undefined,
        name: this.createForm.controls.name.value.trim(),
        surface: this.createForm.controls.surface.value,
        scope: this.createForm.controls.scope.value,
        siteId:
          this.createForm.controls.scope.value === 'site'
            ? this.createForm.controls.siteId.value || null
            : null,
        description: this.createForm.controls.description.value.trim() || null,
        systemTemplate: this.createForm.controls.systemTemplate.value.trim() || null,
        userTemplate: this.createForm.controls.userTemplate.value,
        notes: this.createForm.controls.notes.value.trim() || null,
      })
      .subscribe({
        next: (preset) => {
          this.savingPreset = false;
          this.notice = 'Prompt preset created.';
          this.createForm.reset({
            name: '',
            key: '',
            surface: 'text_seo',
            scope: 'global',
            siteId: '',
            description: '',
            systemTemplate: '',
            userTemplate: '',
            notes: '',
          });
          this.loadData();
          this.selectedPromptDetail = preset;
        },
        error: (error) => {
          this.savingPreset = false;
          this.error = formatApiError(error);
        },
      });
  }

  createDraftVersion(): void {
    if (!this.selectedPromptDetail || this.draftForm.invalid || this.savingVersion) {
      this.draftForm.markAllAsTouched();
      return;
    }

    this.savingVersion = true;
    this.api
      .createPromptVersion(this.selectedPromptDetail.id, {
        systemTemplate: this.draftForm.controls.systemTemplate.value.trim() || null,
        userTemplate: this.draftForm.controls.userTemplate.value,
        notes: this.draftForm.controls.notes.value.trim() || null,
      })
      .subscribe({
        next: () => {
          this.savingVersion = false;
          this.notice = 'Draft version created.';
          this.reloadSelectedPrompt();
          this.loadData();
        },
        error: (error) => {
          this.savingVersion = false;
          this.error = formatApiError(error);
        },
      });
  }

  copyVersionToDraft(version: StudioPromptVersionSummary & { systemTemplate?: string | null; userTemplate?: string }): void {
    this.draftForm.reset({
      systemTemplate: version.systemTemplate || '',
      userTemplate: version.userTemplate || '',
      notes: '',
    });
  }

  approveVersion(promptId: string, versionId: string): void {
    this.api.approvePromptVersion(promptId, versionId).subscribe({
      next: () => {
        this.notice = `Version approved.`;
        this.reloadSelectedPrompt();
        this.loadData();
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  deprecateVersion(promptId: string, versionId: string): void {
    this.api.updatePromptVersion(promptId, versionId, { status: 'deprecated' }).subscribe({
      next: () => {
        this.notice = 'Version deprecated.';
        this.reloadSelectedPrompt();
        this.loadData();
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  assignVersion(promptId: string, versionId: string, siteId: string): void {
    this.api.assignPromptVersion(promptId, { versionId, siteId: siteId || null }).subscribe({
      next: () => {
        this.notice = siteId ? 'Site assignment updated.' : 'Global assignment updated.';
        this.reloadSelectedPrompt();
        this.loadData();
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
      });
  }

  versionStatusTagClass(status: StudioPromptVersionSummary['status']): string {
    switch (status) {
      case 'approved':
        return 'console-tag--success';
      case 'draft':
        return 'console-tag--warning';
      case 'deprecated':
      default:
        return 'console-tag--danger';
    }
  }

  surfaceLabel(surface: PromptSurface): string {
    return {
      text_seo: 'Text SEO',
      text_instagram: 'Text Instagram',
      image_contextual: 'Image contextual',
      image_independent: 'Image independent',
    }[surface];
  }
}
