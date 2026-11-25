import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keyboard of a modal drawer: focus goes in, stays in, and returns to what opened it; Escape closes. */
@Directive({ selector: '[appDrawer]', standalone: true, host: { role: 'dialog', 'aria-modal': 'true', '(keydown)': 'key($event)' } })
export class AppDrawerDirective implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly opener = document.activeElement as HTMLElement | null;

  readonly closed = output<void>();

  ngAfterViewInit(): void {
    this.focusable()[0]?.focus();
  }

  ngOnDestroy(): void {
    this.opener?.focus();
  }

  private focusable(): HTMLElement[] {
    return [...this.element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
  }

  key(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = this.focusable();
    const edge = event.shiftKey ? items[0] : items.at(-1);
    if (document.activeElement !== edge && this.element.contains(document.activeElement)) return;
    event.preventDefault();
    (event.shiftKey ? items.at(-1) : items[0])?.focus();
  }
}
