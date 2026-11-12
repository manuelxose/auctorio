import { Component, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import type { AssistantAction } from '../../models/assistant.models';
import { AssistantApiService } from '../../services/assistant-api.service';

const TOOL_LABEL: Record<string, string> = {
  update_proposal: 'Update proposal',
  regenerate_proposal: 'Regenerate proposal',
  fill_missing_slots: 'Fill missing slots',
  suggest_proposals_for_day: 'Suggest proposals for a day',
  propose_source: 'Propose source',
};

/** A write action the assistant staged. Nothing runs until the operator confirms it here. */
@Component({
  selector: 'app-assistant-action-card',
  standalone: true,
  template: `
    <div class="cp__action" [attr.data-status]="action().status" role="group" [attr.aria-label]="label() + ', ' + action().status">
      <p class="cp__action-title">{{ label() }}</p>
      <p class="cp__action-summary">{{ action().summary }}</p>
      @switch (action().status) {
        @case ('pending') {
          <div class="cp__action-buttons">
            <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="confirm()" [disabled]="busy()">Confirm</button>
            <button class="au-btn au-btn--sm" type="button" (click)="cancel()" [disabled]="busy()">Cancel</button>
          </div>
        }
        @case ('executing') {
          <p class="cp__note">Running…</p>
        }
        @case ('confirmed') {
          <p class="cp__note">Done.</p>
          @if (action().result?.links?.length) {
            <div class="cp__sources">
              @for (link of action().result!.links; track link.path) {
                <a [href]="link.path" (click)="go($event, link.path)">{{ link.label }}</a>
              }
            </div>
          }
        }
        @case ('failed') {
          <p class="cp__note cp__note--error" role="alert">{{ action().error || 'The action failed' }}</p>
        }
        @case ('cancelled') {
          <p class="cp__note">Cancelled. Nothing was changed.</p>
        }
      }
      @if (error()) {
        <p class="cp__note cp__note--error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
})
export class AssistantActionCardComponent {
  private readonly api = inject(AssistantApiService);
  private readonly router = inject(Router);

  readonly action = input.required<AssistantAction>();
  readonly updated = output<AssistantAction>();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  label(): string {
    return TOOL_LABEL[this.action().tool] ?? this.action().tool;
  }

  confirm(): void {
    this.run(this.api.confirm(this.action().id), (response) => response.action);
  }

  cancel(): void {
    this.run(this.api.cancel(this.action().id), (response) => response.action);
  }

  private run<T>(request: import('rxjs').Observable<T>, pick: (value: T) => AssistantAction): void {
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: (value) => {
        this.busy.set(false);
        this.updated.emit(pick(value));
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(this.api.describe(error));
      },
    });
  }

  go(event: Event, path: string): void {
    event.preventDefault();
    void this.router.navigateByUrl(path);
  }
}
