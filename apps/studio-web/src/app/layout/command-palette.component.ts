import { Component, ElementRef, ViewChild, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppIconComponent, type StudioIconName } from '../components/ui/app-icon.component';
import { STUDIO_NAV } from './studio-nav';

export type PaletteCommand = { id: string; label: string; group: string; icon: StudioIconName; run: () => void };

/** Ctrl/⌘+K palette: jump to any Studio screen or run a shell action. */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [AppIconComponent],
  template: `
    <div class="au-palette__scrim" (click)="closed.emit()"></div>
    <div class="au-palette" role="dialog" aria-modal="true" aria-label="Go to or run">
      <div class="au-palette__input">
        <app-icon name="search"></app-icon>
        <input
          #field
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="au-palette-list"
          [attr.aria-activedescendant]="results()[cursor()] ? 'au-cmd-' + results()[cursor()].id : null"
          placeholder="Go to or run"
          [value]="query()"
          (input)="query.set($any($event.target).value); cursor.set(0)"
          (keydown)="onKey($event)"
        />
        <kbd class="au-kbd">Esc</kbd>
      </div>
      <ul id="au-palette-list" class="au-palette__list" role="listbox">
        @for (command of results(); track command.id; let i = $index) {
          <li
            [id]="'au-cmd-' + command.id"
            role="option"
            class="au-palette__item"
            [class.is-active]="i === cursor()"
            [attr.aria-selected]="i === cursor()"
            (mousemove)="cursor.set(i)"
            (click)="run(command)"
          >
            <app-icon [name]="command.icon"></app-icon>
            <span>{{ command.label }}</span>
            <span class="au-palette__group">{{ command.group }}</span>
          </li>
        } @empty {
          <li class="au-palette__empty">No matches</li>
        }
      </ul>
    </div>
  `,
})
export class CommandPaletteComponent {
  private readonly router = inject(Router);
  readonly closed = output<void>();
  readonly actions = signal<PaletteCommand[]>([]);
  readonly query = signal('');
  readonly cursor = signal(0);

  @ViewChild('field', { static: true }) private field!: ElementRef<HTMLInputElement>;

  private readonly navCommands: PaletteCommand[] = STUDIO_NAV.flatMap((group) =>
    group.items.map((item) => ({ id: item.path.replace(/\W+/g, '-'), label: item.label, group: group.label, icon: item.icon, run: () => void this.router.navigateByUrl(item.path) })),
  );

  readonly results = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = [...this.actions(), ...this.navCommands];
    return q ? all.filter((command) => command.label.toLowerCase().includes(q) || command.group.toLowerCase().includes(q)) : all;
  });

  focus(): void {
    setTimeout(() => this.field.nativeElement.focus());
  }

  run(command: PaletteCommand): void {
    this.closed.emit();
    command.run();
  }

  onKey(event: KeyboardEvent): void {
    const count = this.results().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.cursor.set(count ? (this.cursor() + 1) % count : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.cursor.set(count ? (this.cursor() - 1 + count) % count : 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = this.results()[this.cursor()];
      if (command) this.run(command);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
    }
  }
}
