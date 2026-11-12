import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AssistantApiService } from '../services/assistant-api.service';
import type { AssistantTool } from '../models/assistant.models';
import { CopilotService, type CopilotCompetency, type CopilotCompetencyStat, type CopilotMessage } from '../services/copilot.service';

const SCOPE_LABEL: Record<CopilotCompetency['scope'], string> = {
  workspace: 'Active site',
  site: 'Site or open article',
  project: 'Open article',
};

/** Registry of copilot competencies with their permissions and real run history. */
@Component({
  selector: 'app-competencies-page',
  standalone: true,
  imports: [DatePipe, AppIconComponent],
  template: `
    <header class="au-page__header">
      <h1 class="au-page__title">Assistant tools</h1>
      <p class="au-page__subtitle">What the copilot can do with your Studio data. Read tools answer from computed data. Write tools only prepare a change: nothing happens until you confirm it, and every confirmed change is audited.</p>
    </header>

    @if (error()) {
      <p class="au-alert au-alert--danger" role="alert">{{ error() }}</p>
    }

    <section class="au-panel" aria-labelledby="comp-tools">
      <div class="au-panel__header"><h2 id="comp-tools" class="au-panel__title">Editorial tools</h2></div>
      <div class="au-table-wrap"><table class="au-table">
        <thead>
          <tr>
            <th scope="col">Tool</th>
            <th scope="col">Type</th>
            <th scope="col">Needs</th>
            <th scope="col">Permission</th>
            <th scope="col">Confirmation</th>
          </tr>
        </thead>
        <tbody>
          @for (tool of tools(); track tool.name) {
            <tr>
              <td data-label="Tool"><strong>{{ tool.label }}</strong><div class="au-muted">{{ tool.description }}</div></td>
              <td data-label="Type"><span class="au-badge" [class.au-badge--neutral]="tool.kind === 'read'">{{ tool.kind === 'read' ? 'Read' : 'Write' }}</span></td>
              <td data-label="Needs">{{ tool.needs }}</td>
              <td data-label="Permission"><code>{{ tool.permission }}</code>@if (!tool.allowed) { <span class="au-muted"> · not in your role</span> }</td>
              <td data-label="Confirmation">{{ tool.confirmation ? 'Required' : 'Not needed' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="au-muted">{{ loading() ? 'Loading…' : 'No tools available' }}</td></tr>
          }
        </tbody>
      </table></div>
    </section>

    <section class="au-panel" aria-labelledby="comp-registry">
      <div class="au-panel__header"><h2 id="comp-registry" class="au-panel__title">Registry</h2></div>
      <div class="au-table-wrap"><table class="au-table">
        <thead>
          <tr>
            <th scope="col">Competency</th>
            <th scope="col">Needs</th>
            <th scope="col">Permission</th>
            <th scope="col" class="au-num">Runs</th>
            <th scope="col">Last run</th>
            <th scope="col"><span class="au-sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          @for (item of rows(); track item.key) {
            <tr>
              <td data-label="Competency">
                <strong>{{ item.label }}</strong>
                <div class="au-muted">{{ item.description }}</div>
              </td>
              <td data-label="Needs">{{ scopeLabel(item.scope) }}</td>
              <td data-label="Permission"><code>{{ item.permission }}</code>@if (!item.allowed) { <span class="au-muted"> · not in your role</span> }</td>
              <td class="au-num" data-label="Runs">{{ item.runs }}@if (item.failed) { <span class="au-muted"> ({{ item.failed }} failed)</span> }</td>
              <td data-label="Last run">{{ item.lastRunAt ? (item.lastRunAt | date: 'short') : '—' }}</td>
              <td>
                @if (item.scope === 'project') {
                  <span class="au-muted">Run from an article</span>
                } @else {
                  <button class="au-btn au-btn--sm" type="button" [disabled]="!item.allowed" (click)="run(item)">
                    <app-icon name="play"></app-icon> Run
                  </button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="au-muted">{{ loading() ? 'Loading…' : 'No competencies available' }}</td></tr>
          }
        </tbody>
      </table></div>
    </section>

    <section class="au-panel" aria-labelledby="comp-history">
      <div class="au-panel__header"><h2 id="comp-history" class="au-panel__title">Your recent runs</h2></div>
      <div class="au-table-wrap"><table class="au-table">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Competency</th>
            <th scope="col">Status</th>
            <th scope="col">Model</th>
            <th scope="col" class="au-num">Tokens</th>
            <th scope="col" class="au-num">Time</th>
          </tr>
        </thead>
        <tbody>
          @for (run of runs(); track run.id) {
            <tr>
              <td data-label="When">{{ run.createdAt | date: 'short' }}</td>
              <td data-label="Competency">{{ labelOf(run.competencyKey) }}</td>
              <td data-label="Status"><span class="au-badge" [class.au-badge--success]="run.status === 'completed'" [class.au-badge--danger]="run.status === 'failed'" [class.au-badge--neutral]="run.status === 'cancelled'">{{ run.status }}</span></td>
              <td data-label="Model">{{ run.model ? run.provider + ' · ' + run.model : '—' }}</td>
              <td class="au-num" data-label="Tokens">{{ run.tokensOutput !== null ? run.tokensInput! + run.tokensOutput : 'not reported' }}</td>
              <td class="au-num" data-label="Time">{{ run.durationMs !== null ? (run.durationMs / 1000).toFixed(1) + ' s' : '—' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="au-muted">No runs yet. Ask the copilot or run a competency above.</td></tr>
          }
        </tbody>
      </table></div>
    </section>
  `,
})
export class CompetenciesPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly copilot = inject(CopilotService);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2/copilot`;

  private readonly assistantApi = inject(AssistantApiService);
  readonly tools = signal<AssistantTool[]>([]);
  readonly items = signal<CopilotCompetency[]>([]);
  readonly stats = signal<CopilotCompetencyStat[]>([]);
  readonly runs = signal<CopilotMessage[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly rows = computed(() =>
    this.items().map((item) => {
      const stats = this.stats().filter((stat) => stat.key === item.key);
      const lastRunAt = stats.map((stat) => stat.lastRunAt).sort().at(-1) ?? null;
      return {
        ...item,
        runs: stats.reduce((sum, stat) => sum + stat.runs, 0),
        failed: stats.filter((stat) => stat.status !== 'completed').reduce((sum, stat) => sum + stat.runs, 0),
        lastRunAt,
      };
    }),
  );

  ngOnInit(): void {
    this.assistantApi.tools().subscribe({ next: (response) => this.tools.set(response.items), error: () => undefined });
    this.http.get<{ items: CopilotCompetency[]; stats: CopilotCompetencyStat[] }>(`${this.base}/competencies`).subscribe({
      next: (response) => {
        this.items.set(response.items);
        this.stats.set(response.stats);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('The competency registry could not be loaded.');
      },
    });
    this.http.get<{ items: CopilotMessage[] }>(`${this.base}/runs`, { params: { limit: 20 } }).subscribe({
      next: (response) => this.runs.set(response.items),
      error: () => undefined,
    });
  }

  scopeLabel(scope: CopilotCompetency['scope']): string {
    return SCOPE_LABEL[scope];
  }

  labelOf(key: string | null): string {
    return this.items().find((item) => item.key === key)?.label ?? key ?? '—';
  }

  run(item: CopilotCompetency): void {
    this.copilot.toggle(true);
    this.copilot.newThread();
    this.copilot.send(`${item.label}: ${item.description}`, item.key);
  }
}
