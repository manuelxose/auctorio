import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

const TOAST_DURATION_MS = 4500;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly state = signal<ToastItem[]>([]);
  private nextId = 1;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly toasts = this.state.asReadonly();

  success(message: string): void {
    this.push('success', message);
  }

  error(message: string): void {
    this.push('error', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.state.update((items) => items.filter((item) => item.id !== id));
  }

  private push(tone: ToastTone, message: string): void {
    const id = this.nextId++;
    this.state.update((items) => [...items, { id, tone, message }]);
    const timer = setTimeout(() => this.dismiss(id), TOAST_DURATION_MS);
    this.timers.set(id, timer);
  }
}
