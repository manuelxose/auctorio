import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, effect, ElementRef, inject, PLATFORM_ID, viewChild } from '@angular/core';
import { ConfirmService } from '../../services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (active(); as options) {
      <div
        class="au-dialog-scrim"
        role="presentation"
        (click)="onScrimClick($event)"
      >
        <div
          class="au-dialog"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          [attr.aria-describedby]="bodyId"
        >
          <h2 class="au-dialog__title" [id]="titleId">{{ options.title }}</h2>
          <p class="au-dialog__body" [id]="bodyId">{{ options.message }}</p>
          <div class="au-dialog__actions">
            <button
              class="au-btn au-btn--secondary"
              type="button"
              #cancelButton
              (click)="respond(false)"
            >
              {{ options.cancelLabel }}
            </button>
            <button
              class="au-btn"
              [class.au-btn--danger]="options.danger"
              [class.au-btn--primary]="!options.danger"
              type="button"
              #confirmButton
              (click)="respond(true)"
            >
              {{ options.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AppConfirmDialogComponent {
  private readonly confirmService = inject(ConfirmService);
  private readonly host = inject(ElementRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly active = this.confirmService.active;
  protected readonly titleId = 'confirm-title';
  protected readonly bodyId = 'confirm-body';

  private readonly confirmButtonRef = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  private readonly cancelButtonRef = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    if (this.browser) {
      document.addEventListener('keydown', this.onKeydown, true);
    }
    // Move focus into the dialog whenever it opens.
    effect(() => {
      if (this.active() && this.browser) {
        queueMicrotask(() => this.confirmButtonRef()?.nativeElement.focus());
      }
    });
  }

  ngOnDestroy(): void {
    if (this.browser) {
      document.removeEventListener('keydown', this.onKeydown, true);
    }
  }

  ngAfterViewInit(): void {
    // Focus moves into the dialog whenever it opens.
    if (this.active()) {
      this.confirmButtonRef()?.nativeElement.focus();
    }
  }

  respond(confirmed: boolean): void {
    this.confirmService.respond(confirmed);
  }

  onScrimClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.respond(false);
    }
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (!this.active()) {
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.respond(false);
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  };

  private trapFocus(event: KeyboardEvent): void {
    const confirm = this.confirmButtonRef()?.nativeElement;
    const cancel = this.cancelButtonRef()?.nativeElement;
    if (!confirm || !cancel) {
      return;
    }
    const focusable = [cancel, confirm];
    const current = document.activeElement;
    if (event.shiftKey && current === cancel) {
      event.preventDefault();
      confirm.focus();
    } else if (!event.shiftKey && current === confirm) {
      event.preventDefault();
      cancel.focus();
    } else if (!this.host.nativeElement.contains(current)) {
      event.preventDefault();
      confirm.focus();
    }
  }
}
