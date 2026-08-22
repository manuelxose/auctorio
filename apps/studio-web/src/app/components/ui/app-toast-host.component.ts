import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AppIconComponent } from './app-icon.component';
import { ToastService, type ToastItem } from '../../services/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule, AppIconComponent],
  template: `
    <div class="au-toasts" aria-live="polite" aria-atomic="false">
      @for (toast of toasts; track toast.id) {
        <div class="au-toast" [class]="'au-toast--' + toast.tone" role="status">
          <app-icon [name]="iconFor(toast)"></app-icon>
          <span class="au-toast__text">{{ toast.message }}</span>
          <button
            class="au-toast__dismiss"
            type="button"
            [attr.aria-label]="'Dismiss notification: ' + toast.message"
            (click)="dismiss(toast.id)"
          >
            <app-icon name="close"></app-icon>
          </button>
        </div>
      }
    </div>
  `,
})
export class AppToastHostComponent {
  private readonly toastService = inject(ToastService);

  get toasts(): ToastItem[] {
    return this.toastService.toasts();
  }

  iconFor(toast: ToastItem): string {
    switch (toast.tone) {
      case 'success':
        return 'circle-check';
      case 'error':
        return 'warning';
      default:
        return 'info';
    }
  }

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
