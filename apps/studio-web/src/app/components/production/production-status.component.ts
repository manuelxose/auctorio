import { CommonModule } from '@angular/common';
import { Component, OnChanges, OnDestroy, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, timer } from 'rxjs';
import type { ProductionJob } from '../../models/production.models';
import { ProductionApiService } from '../../services/production-api.service';
import { ToastService } from '../../services/toast.service';

const BADGE: Record<string, string> = {
  queued: 'au-badge--neutral',
  running: 'au-badge--info',
  needs_review: 'au-badge--warning',
  ready: 'au-badge--success',
  failed: 'au-badge--danger',
  cancelled: 'au-badge--neutral',
};

/** Live stage progress of a production job, with retry / cancel / review / open-in-editor. Give it jobId, planItemId or clusterId. */
@Component({
  selector: 'app-production-status',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (job(); as j) {
      <div class="au-panel au-panel--padded" [attr.data-production-status]="j.status">
        <div class="au-panel__header">
          <h3 class="au-panel__title">Production</h3>
          <span class="au-badge" [ngClass]="badge(j.status)">{{ j.status.replace('_', ' ') }}</span>
        </div>
        <div class="au-progress" role="progressbar" aria-label="Production progress" [attr.aria-valuenow]="j.progress" aria-valuemin="0" aria-valuemax="100">
          <span class="au-progress__bar" [style.width.%]="j.progress"></span>
        </div>
        <ul class="au-table__meta" style="list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem">
          @for (s of j.stages; track s.stage) {
            <li [class.au-muted]="s.status === 'pending'">{{ s.stage }}: {{ s.status }}</li>
          }
        </ul>
        @if (j.error) {
          <p class="au-banner au-banner--error" role="alert">{{ j.errorCode }}: {{ j.error }}</p>
        }
        <div class="au-form__actions">
          @if (j.retryable) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="busy()" (click)="run(api.retry(j.id))">Retry</button> }
          @if (j.cancellable) { <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="busy()" (click)="run(api.cancel(j.id))">Cancel</button> }
          @if (j.reviewable) {
            <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="busy()" (click)="run(api.review(j.id, 'approve'))">Approve</button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="busy()" (click)="run(api.review(j.id, 'reject'))">Reject</button>
          }
          @if (j.links.editorUrl; as url) { <a class="au-btn au-btn--ghost au-btn--sm" [routerLink]="'/studio' + url">Open in editor</a> }
        </div>
      </div>
    }
  `,
})
export class ProductionStatusComponent implements OnChanges, OnDestroy {
  readonly jobId = input<string | null>(null);
  readonly planItemId = input<string | null>(null);
  readonly clusterId = input<string | null>(null);
  readonly changed = output<ProductionJob>();

  protected readonly api = inject(ProductionApiService);
  private readonly toasts = inject(ToastService);
  readonly job = signal<ProductionJob | null>(null);
  readonly busy = signal(false);
  private poll: Subscription | null = null;

  ngOnChanges(): void {
    this.poll?.unsubscribe();
    this.poll = timer(0, 4000).subscribe(() => this.refresh());
  }

  ngOnDestroy(): void {
    this.poll?.unsubscribe();
  }

  badge(status: string): string {
    return BADGE[status] ?? 'au-badge--neutral';
  }

  private refresh(): void {
    const id = this.jobId();
    const planItemId = this.planItemId() ?? undefined;
    const clusterId = this.clusterId() ?? undefined;
    const source: Observable<ProductionJob | null> | null = id ? this.api.get(id) : planItemId || clusterId ? this.api.latestFor({ planItemId, clusterId }) : null;
    source?.subscribe({
      next: (job) => {
        const prev = this.job();
        this.job.set(job);
        if (job && prev && prev.status !== job.status) this.changed.emit(job);
      },
      error: () => undefined,
    });
  }

  run(action: Observable<ProductionJob>): void {
    this.busy.set(true);
    action.subscribe({
      next: (job) => {
        this.job.set(job);
        this.busy.set(false);
        this.changed.emit(job);
      },
      error: (err) => {
        this.busy.set(false);
        this.toasts.error(err?.error?.message ?? 'Action failed');
      },
    });
  }
}
