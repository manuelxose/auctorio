import { Component, input, output } from '@angular/core';

/** Page controls of a table. Hidden when there is a single page. */
@Component({
  selector: 'app-pager',
  standalone: true,
  template: `
    @if (pages() > 1) {
      <nav class="au-pagination" [attr.aria-label]="'Páginas de ' + label()">
        <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="page() <= 1" (click)="go.emit(page() - 1)">Anterior</button>
        <span aria-live="polite">Página {{ page() }} de {{ pages() }}</span>
        <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="page() >= pages()" (click)="go.emit(page() + 1)">Siguiente</button>
      </nav>
    }
  `,
  styles: [`nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; font-size: var(--au-fs-metadata); color: var(--au-muted); }`],
})
export class AppPagerComponent {
  readonly page = input.required<number>();
  readonly pages = input.required<number>();
  readonly label = input('la lista');
  readonly go = output<number>();
}
