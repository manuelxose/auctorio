import { Injectable, signal } from '@angular/core';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly state = signal<ConfirmOptions | null>(null);
  private opener: HTMLElement | null = null;
  private resolver: ((confirmed: boolean) => void) | null = null;

  readonly active = this.state.asReadonly();

  confirm(options: ConfirmOptions): Promise<boolean> {
    this.opener = document.activeElement as HTMLElement | null;
    this.state.set({
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: false,
      ...options,
    });
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  respond(confirmed: boolean): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.state.set(null);
    resolve?.(confirmed);
    const opener = this.opener;
    // Once the dialog is gone, and only if the answer did not move the focus elsewhere.
    setTimeout(() => { if (document.activeElement === document.body) opener?.focus(); });
  }
}
