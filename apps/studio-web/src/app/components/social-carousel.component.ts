import { Component, input, linkedSignal, output, signal } from '@angular/core';
import { AppIconComponent } from './ui/app-icon.component';

export type SocialSlide = { headline?: string; body?: string; imageUrl?: string };

@Component({
  selector: 'app-social-carousel',
  standalone: true,
  imports: [AppIconComponent],
  template: `
    @if (slides()[position()]; as slide) {
      @if (studioGallery()) {
        <section aria-roledescription="carrusel" aria-label="Vistas de la publicación"
          (keydown.arrowleft)="move(-1, $event)" (keydown.arrowright)="move(1, $event)">
          <div class="preview-stage">
            @if (slides().length > 1) {
              <button class="stage-arrow previous" type="button" aria-label="Diapositiva anterior" [disabled]="position() === 0" (click)="move(-1)">
                <svg class="ico" aria-hidden="true"><use href="/social-studio-icons.svg#soc-i-chevron-left" /></svg>
              </button>
            }
            <div class="slide-content">
              @if (slide.imageUrl; as source) {
                <img class="preview-image" [src]="source" [alt]="slide.headline || 'Diapositiva ' + (position() + 1)" />
              } @else {
                <div class="slide-placeholder">
                  <div class="slide-visual"><svg class="ico" aria-hidden="true"><use href="/social-studio-icons.svg#soc-i-image" /></svg></div>
                  <h3>{{ slide.headline || 'Diapositiva ' + (position() + 1) }}</h3>
                  @if (slide.body) { <p>{{ slide.body }}</p> }
                </div>
              }
            </div>
            @if (slides().length > 1) {
              <button class="stage-arrow next" type="button" aria-label="Diapositiva siguiente" [disabled]="position() === slides().length - 1" (click)="move(1)">
                <svg class="ico" aria-hidden="true"><use href="/social-studio-icons.svg#soc-i-chevron-right" /></svg>
              </button>
            }
          </div>
          <div class="thumbnails" role="group" aria-label="Elegir diapositiva">
            @for (preview of slides(); track $index) {
              <button class="thumbnail" type="button" [class.active]="position() === $index"
                [attr.aria-current]="position() === $index ? 'true' : null"
                [attr.aria-label]="'Diapositiva ' + ($index + 1) + (preview.headline ? ' · ' + preview.headline : '')" (click)="select($index)">
                @if (preview.imageUrl; as source) { <img [src]="source" alt="" loading="lazy" /> }
                @else { <svg class="ico" aria-hidden="true"><use href="/social-studio-icons.svg#soc-i-image" /></svg> }
                <span class="thumbnail-num">{{ $index + 1 }}</span>
              </button>
            }
            @if (canAddSlide()) {
              <button class="add-thumbnail" type="button" aria-label="Añadir diapositiva" [disabled]="busy()" (click)="addSlide.emit()">
                <svg class="ico" aria-hidden="true"><use href="/social-studio-icons.svg#soc-i-plus" /></svg>Añadir
              </button>
            }
          </div>
          <div class="gallery-footer">
            <div role="status" aria-atomic="true">
              <span class="slide-index">{{ position() + 1 }} / {{ slides().length }}</span>
              <strong class="slide-title">{{ slide.headline }}</strong>
            </div>
            @if (slides().length > 1) {
              <div class="gallery-nav">
                <button class="square-button" type="button" aria-label="Anterior" [disabled]="position() === 0" (click)="move(-1)">
                  <svg class="ico" aria-hidden="true"><use href="/social-studio-icons.svg#soc-i-chevron-left" /></svg>
                </button>
                <button class="square-button" type="button" aria-label="Siguiente" [disabled]="position() === slides().length - 1" (click)="move(1)">
                  <svg class="ico" aria-hidden="true"><use href="/social-studio-icons.svg#soc-i-chevron-right" /></svg>
                </button>
              </div>
            }
          </div>
        </section>
      } @else {
      <section class="viewer" [class.viewer--backward]="direction() < 0" aria-roledescription="carrusel" aria-label="Vistas de la publicación"
        (keydown.arrowleft)="move(-1, $event)" (keydown.arrowright)="move(1, $event)">
        <figure class="stage">
          @for (frame of [position()]; track frame) {
            <div class="stage-frame" animate.enter="stage-enter" animate.leave="stage-leave">
              @if (slide.imageUrl; as src) {
                <img class="stage-backdrop" [src]="src" alt="" aria-hidden="true" />
                <img class="stage-image" [src]="src" [alt]="slide.headline || 'Diapositiva ' + (frame + 1)" />
              } @else {
                <div class="stage-text">
                  <strong>{{ slide.headline || 'Diapositiva ' + (frame + 1) }}</strong>
                  <p>{{ slide.body }}</p>
                </div>
              }
            </div>
          }
        </figure>
        <div class="controls">
          <div class="controls-position" role="status" aria-atomic="true">
            <span>{{ position() + 1 }} / {{ slides().length }}</span>
            @for (frame of [position()]; track frame) {
              @if (slide.headline) { <strong animate.enter="caption-enter">{{ slide.headline }}</strong> }
            }
          </div>
          @if (slides().length > 1) {
            <div class="arrows">
              <button class="au-btn au-btn--secondary" type="button" aria-label="Diapositiva anterior" (click)="move(-1)">
                <app-icon name="chevron-left"></app-icon>
              </button>
              <button class="au-btn au-btn--secondary" type="button" aria-label="Diapositiva siguiente" (click)="move(1)">
                <app-icon name="chevron-right"></app-icon>
              </button>
            </div>
          }
        </div>
        @if (slides().length > 1) {
          <div class="previews" role="group" aria-label="Elegir diapositiva">
            @for (preview of slides(); track $index) {
              <button type="button" class="preview" [attr.aria-current]="position() === $index ? 'true' : null"
                [attr.aria-label]="'Diapositiva ' + ($index + 1) + (preview.headline ? ' · ' + preview.headline : '')" (click)="select($index)">
                @if (preview.imageUrl; as src) { <img [src]="src" alt="" loading="lazy" /> }
                @else { <span>{{ $index + 1 }}</span> }
              </button>
            }
          </div>
        }
      </section>
      }
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .viewer { display: grid; gap: 12px; min-width: 0; }
    .viewer { --slide-travel: 11%; }
    .viewer--backward { --slide-travel: -11%; }
    .stage { position: relative; isolation: isolate; display: grid; place-items: center; height: clamp(240px, 38vw, 460px); margin: 0; overflow: hidden; border: 1px solid var(--au-border); border-radius: 14px; background: var(--au-surface-2); }
    .stage-frame { position: absolute; inset: 0; isolation: isolate; display: grid; place-items: center; }
    .stage-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(24px); opacity: .28; transform: scale(1.12); z-index: -1; }
    .stage-image { display: block; width: 100%; height: 100%; position: absolute; inset: 0; object-fit: contain; padding: 12px; }
    .stage-text { max-height: 100%; max-width: 44ch; padding: 24px; overflow: auto; overflow-wrap: anywhere; }
    .stage-text strong { display: block; font-size: clamp(1.25rem, 3vw, 2rem); line-height: 1.2; }
    .stage-text p { margin: 8px 0 0; white-space: pre-wrap; }
    .controls, .arrows { display: flex; align-items: center; gap: 8px; }
    .controls { justify-content: space-between; }
    .controls-position { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
    .controls-position span { color: var(--au-muted); font-variant-numeric: tabular-nums; }
    .arrows { flex: none; }
    .arrows button { width: 44px; min-height: 44px; padding: 0; justify-content: center; }
    .previews { display: flex; gap: 8px; overflow-x: auto; padding: 4px; }
    .preview { flex: 0 0 64px; height: 72px; padding: 2px; overflow: hidden; cursor: pointer; color: var(--au-text); background: var(--au-surface-2); border: 2px solid var(--au-border); border-radius: 8px; }
    .preview[aria-current="true"] { border-color: var(--au-text); }
    .preview img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
    .preview:focus-visible { outline: 2px solid var(--au-text); outline-offset: 1px; }
    @media (prefers-reduced-motion: no-preference) {
      .stage-enter { z-index: 1; animation: slide-promote 500ms cubic-bezier(.2,.75,.25,1) both; }
      .stage-leave { pointer-events: none; animation: slide-retire 360ms ease-in both; }
      .caption-enter, .stage-enter .stage-text > * { animation: reveal-copy 440ms ease-out 90ms both; }
      .stage-enter .stage-text p { animation-delay: 150ms; }
      .preview, .arrows button { transition: transform 160ms ease, border-color 160ms ease; }
      .preview:hover, .arrows button:hover { transform: translateY(-2px); }
      .preview:active, .arrows button:active { transform: scale(.96); }
      @keyframes slide-promote {
        from { opacity: 0; transform: translateX(var(--slide-travel)) scale(.91); }
        to { opacity: 1; transform: translateX(0) scale(1); }
      }
      @keyframes slide-retire {
        to { opacity: 0; transform: translateX(calc(var(--slide-travel) * -.5)) scale(.97); }
      }
      @keyframes reveal-copy {
        from { opacity: 0; transform: translateY(12px); filter: blur(4px); }
        to { opacity: 1; transform: translateY(0); filter: blur(0); }
      }
    }
  `],
})
export class SocialCarouselComponent {
  readonly slides = input.required<readonly SocialSlide[]>();
  readonly studioGallery = input(false);
  readonly canAddSlide = input(false);
  readonly busy = input(false);
  readonly addSlide = output<void>();
  readonly position = linkedSignal({ source: () => this.slides().length, computation: () => 0 });
  readonly direction = signal<-1 | 1>(1);

  select(index: number): void {
    if (index === this.position()) return;
    this.direction.set(index > this.position() ? 1 : -1);
    this.position.set(index);
  }

  move(offset: -1 | 1, event?: Event): void {
    const count = this.slides().length;
    if (count < 2) return;
    event?.preventDefault();
    const next = this.position() + offset;
    if (this.studioGallery() && (next < 0 || next >= count)) return;
    this.direction.set(offset);
    this.position.set((next + count) % count);
  }
}
