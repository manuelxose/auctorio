import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';

/**
 * Minimal anchored popover. The parent binds an anchor element via `show(anchor)`
 * and closes via `hide()`. Outside clicks and Escape close it automatically.
 */
@Component({
  selector: 'app-popover',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen()) {
      <div
        class="au-pop"
        role="menu"
        [style.left.px]="x()"
        [style.top.px]="y()"
        [style.width.px]="width() || null"
      >
        <ng-content></ng-content>
      </div>
    }
  `,
})
export class AppPopoverComponent {
  private readonly host = inject(ElementRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly isOpen = signal(false);
  readonly x = signal(0);
  readonly y = signal(0);
  readonly width = signal<number | null>(null);

  private anchor: HTMLElement | null = null;

  constructor() {
    if (this.browser) {
      document.addEventListener('click', this.onDocumentClick, true);
      document.addEventListener('keydown', this.onKeydown, true);
    }
  }

  ngOnDestroy(): void {
    if (this.browser) {
      document.removeEventListener('click', this.onDocumentClick, true);
      document.removeEventListener('keydown', this.onKeydown, true);
    }
  }

  show(anchor: HTMLElement): void {
    this.anchor = anchor;
    this.isOpen.set(true);
    requestAnimationFrame(() => this.position());
  }

  hide(): void {
    this.isOpen.set(false);
    this.anchor = null;
  }

  toggle(anchor: HTMLElement): void {
    if (this.isOpen() && this.anchor === anchor) {
      this.hide();
      return;
    }
    this.show(anchor);
  }

  private readonly onDocumentClick = (event: MouseEvent): void => {
    if (!this.isOpen()) {
      return;
    }
    const target = event.target as Node | null;
    if (!target) {
      return;
    }
    if (this.host.nativeElement.contains(target)) {
      return;
    }
    if (this.anchor?.contains(target)) {
      return;
    }
    this.hide();
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isOpen()) {
      this.hide();
      this.anchor?.focus();
    }
  };

  private position(): void {
    if (!this.anchor) {
      return;
    }
    const rect = this.anchor.getBoundingClientRect();
    const panel = this.host.nativeElement.querySelector('.au-pop') as HTMLElement | null;
    const panelWidth = panel?.offsetWidth ?? 200;
    const panelHeight = panel?.offsetHeight ?? 200;
    const gap = 6;
    const maxX = window.innerWidth - panelWidth - 8;

    let left = Math.min(Math.max(8, rect.left), maxX);
    let top = rect.bottom + gap;

    if (top + panelHeight > window.innerHeight - 8 && rect.top - panelHeight - gap > 8) {
      top = rect.top - panelHeight - gap;
    }

    this.x.set(Math.round(left));
    this.y.set(Math.round(top));
    this.width.set(panelWidth);
  }
}
