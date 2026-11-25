import { CommonModule } from '@angular/common';
import { Component, DoCheck, OnDestroy, effect, inject, untracked } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { PlanningApiService, apiMessage } from '../services/planning-api.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import type { ArticleSectionKey, ArticleTargetsOverride, BrandSettings, DetectedBrand, ImageStyle, VisualSettings, WritingSettings } from '../models/planning.models';

const DEFAULT_WRITING: WritingSettings = {
  instructions: [],
  length: 'dynamic',
  authorPerspective: false,
  citations: true,
  mentionCompetitors: false,
  summaryVariant: 'tldr',
  internalLinks: { enabled: true, www: false, trailingSlash: false },
  disclaimer: '',
};

const DEFAULT_BRAND: BrandSettings = {
  logoUrl: '',
  primaryColor: '',
  secondaryColor: '',
  positioning: '',
  audience: [],
  location: { country: '', cities: [] },
  offers: [],
  blogPath: '',
  linkCard: { headline: '', text: '', url: '', buttonText: '' },
  contactCard: { headline: '', text: '', email: '', phone: '', url: '', buttonText: '' },
  mapCard: { headline: '', address: '', url: '' },
  cardStyle: 'classic',
  cardCorners: 'rounded',
  promo: '',
};

const DEFAULT_VISUALS: VisualSettings = {
  imageInstructions: '',
  coverStyle: 'realistic',
  bodyStyle: 'realistic',
  infographic: false,
  youtube: { enabled: false, channelOnly: false, channelUrl: '', approved: [] },
};

type WritingDraft = {
  targets: ArticleTargetsOverride;
  writing: WritingSettings;
  brand: BrandSettings;
  visuals: VisualSettings;
  audienceText: string;
  citiesText: string;
  newRule: string;
  dirty: boolean;
  saving: boolean;
  message: string;
};

type Toggle = { label: string; hint: string; get: () => boolean; set: (on: boolean) => void };

/** Settings · Writing: how every future article of the active site is written (stored in article_targets.writing). */
@Component({
  selector: 'app-writing-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent],
  styleUrls: ['./studio-page-kit.css'],
  template: `
    <section class="sp ws">
      <header class="sp-head">
        <div>
          <p class="ws-kicker">Configuración · Artículos</p>
          <h1 class="sp-head__title">Estilo y contenido</h1>
          <p class="sp-head__sub">Define cómo se redactan los artículos futuros de {{ siteName }}. Las versiones ya escritas no se alteran.</p>
        </div>
        <div class="sp-head__actions">
          <a class="au-btn au-btn--ghost" routerLink="/studio/competitors">Competidores</a>
          <a class="au-btn au-btn--ghost" routerLink="/studio/settings/sites">Páginas guardadas</a>
          <a class="au-btn au-btn--secondary" routerLink="/studio/automation"><app-icon name="calendar"></app-icon>Días de publicación</a>
        </div>
      </header>

      @if (!writing) {
        <p class="sp-muted" role="status">{{ message || 'Cargando…' }}</p>
        <button *ngIf="message && siteId" class="au-btn au-btn--secondary" type="button" (click)="load()">Reintentar</button>
      } @else {
        <section class="ws-card" aria-labelledby="ws-rules" [hidden]="!showTab('rules')">
          <h2 class="ws-card__title" id="ws-rules">Instrucciones editoriales</h2>
          <p class="ws-card__sub">Reglas persistentes para todos los artículos futuros (máximo 30): palabras, afirmaciones, temas, audiencia, tono y datos de tu negocio</p>
          @if (writing.instructions.length) {
            <ol class="ws-rules">
              @for (rule of writing.instructions; track rule; let i = $index) {
                <li class="ws-rule">
                  <span class="ws-rule__n">{{ i + 1 }}.</span>
                  @if (editingRule === i) {
                    <input class="au-input ws-rule__edit" [attr.aria-label]="'Editar regla ' + (i + 1)" maxlength="300" [(ngModel)]="editText" name="edit-rule-{{ i }}" (keydown.enter)="$event.preventDefault(); saveRule()" (keydown.escape)="cancelEdit()" />
                    <span class="ws-rule__actions">
                      <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!editText.trim()" (click)="saveRule()">Guardar</button>
                      <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="cancelEdit()">Cancelar</button>
                    </span>
                  } @else {
                    <span class="ws-rule__text">{{ rule }}</span>
                    <span class="ws-rule__actions">
                      <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="startEdit(i)" [attr.aria-label]="'Editar regla ' + (i + 1)"><app-icon name="edit"></app-icon>Editar</button>
                      <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="removeRule(i)" [attr.aria-label]="'Eliminar regla ' + (i + 1)"><app-icon name="trash"></app-icon>Eliminar</button>
                    </span>
                  }
                </li>
              }
            </ol>
          } @else {
            <p class="ws-empty">Aún no hay reglas. Los artículos siguen el tono detectado del sitio</p>
          }
          <form class="ws-add" (ngSubmit)="addRule()">
            <label class="au-sr-only" for="ws-new-rule">Nueva instrucción</label>
            <input class="au-input" id="ws-new-rule" name="rule" maxlength="300" [(ngModel)]="newRule" placeholder='p. ej. No usar nunca la palabra «apalancar»' />
            <button class="au-btn au-btn--secondary" type="submit" [disabled]="!newRule.trim() || writing.instructions.length >= 30">Añadir regla</button>
          </form>
          <details class="ws-examples" [open]="writing.instructions.length < 3">
            <summary>Ver reglas de ejemplo</summary>
            <div class="ws-examples__list">
              @for (example of examples; track example) {
                <button type="button" class="ws-chip" (click)="addRule(example)" [disabled]="writing.instructions.includes(example)">{{ example }}</button>
              }
            </div>
          </details>
        </section>

        <section class="ws-card" aria-labelledby="ws-length" [hidden]="!showTab('structure')">
          <h2 class="ws-card__title" id="ws-length">Extensión</h2>
          <p class="ws-card__sub">Cuánto se extiende un artículo</p>
          <div class="ws-options" role="radiogroup" aria-labelledby="ws-length">
            @for (option of lengths; track option.key) {
              <label class="ws-option" [class.is-on]="writing.length === option.key">
                <input type="radio" name="length" [value]="option.key" [(ngModel)]="writing.length" (ngModelChange)="dirty = true" />
                <span class="ws-option__title">{{ option.label }}</span>
                <span class="ws-option__hint">{{ option.hint }}</span>
              </label>
            }
          </div>
        </section>

        <section class="ws-card" aria-labelledby="ws-blocks" [hidden]="!showTab('structure')">
          <h2 class="ws-card__title" id="ws-blocks">Estructura y redacción del artículo</h2>
          <p class="ws-card__sub">Las reglas se aplican a los borradores nuevos. Cada plantilla de artículo determina qué bloques admite.</p>
          <ul class="ws-switches">
            @for (toggle of toggles; track toggle.label) {
              <li class="ws-switch">
                <span><span class="ws-switch__label">{{ toggle.label }}</span><span class="ws-switch__hint">{{ toggle.hint }}</span></span>
                <input type="checkbox" role="switch" class="ws-toggle" [checked]="toggle.get()" (change)="toggle.set(!toggle.get()); dirty = true" [attr.aria-label]="toggle.label" />
              </li>
            }
          </ul>
          @if (sectionOn('summary')) {
            <div class="ws-variants" role="radiogroup" aria-label="Estilo del resumen">
              <label class="ws-variant" [class.is-on]="writing.summaryVariant === 'tldr'">
                <input type="radio" name="summary" value="tldr" [(ngModel)]="writing.summaryVariant" (ngModelChange)="dirty = true" />
                <span class="ws-variant__art" aria-hidden="true"><b>En resumen</b><i></i><i></i><i></i></span>
                <span class="ws-option__title">TL;DR</span>
                <span class="ws-option__hint">3–5 viñetas en un recuadro destacado</span>
              </label>
              <label class="ws-variant" [class.is-on]="writing.summaryVariant === 'key_takeaways'">
                <input type="radio" name="summary" value="key_takeaways" [(ngModel)]="writing.summaryVariant" (ngModelChange)="dirty = true" />
                <span class="ws-variant__art ws-variant__art--table" aria-hidden="true"><b>Puntos clave</b><i></i><i></i><i></i></span>
                <span class="ws-option__title">Puntos clave</span>
                <span class="ws-option__hint">Tesis en una frase y tabla Punto / Detalle</span>
              </label>
            </div>
          }
        </section>

        <section class="ws-card" aria-labelledby="ws-links" [hidden]="!showTab('structure')">
          <h2 class="ws-card__title" id="ws-links">Enlazado interno</h2>
          <p class="ws-card__sub">Enlaces a páginas de tu sitemap, escritos en cada artículo</p>
          <ul class="ws-switches">
            @for (toggle of linkToggles; track toggle.label) {
              <li class="ws-switch">
                <span><span class="ws-switch__label">{{ toggle.label }}</span><span class="ws-switch__hint">{{ toggle.hint }}</span></span>
                <input type="checkbox" role="switch" class="ws-toggle" [checked]="toggle.get()" (change)="toggle.set(!toggle.get()); dirty = true" [attr.aria-label]="toggle.label" [disabled]="toggle.label !== 'Enlaces internos' && !writing.internalLinks.enabled" />
              </li>
            }
          </ul>
        </section>

        <section class="ws-card" aria-labelledby="ws-visuals" [hidden]="!showTab('visuals')">
          <h2 class="ws-card__title" id="ws-visuals">Visuales</h2>
          <p class="ws-card__sub">Imágenes, infografía y vídeo. Cada imagen se guarda sin metadatos EXIF ni C2PA</p>
          <label class="au-field ws-promo">
            <span>Instrucciones de imagen</span>
            <textarea class="au-input" rows="2" maxlength="500" [(ngModel)]="visuals.imageInstructions" (ngModelChange)="dirty = true" placeholder="p. ej. Sin personas, luz natural cálida, viviendas españolas"></textarea>
          </label>
          <div class="ws-fields">
            <label class="au-field"><span>Estilo de portada</span>
              <select class="au-input" name="v-cover" [(ngModel)]="visuals.coverStyle" (ngModelChange)="dirty = true">
                @for (style of imageStyles; track style.key) { <option [value]="style.key">{{ style.label }}</option> }
              </select>
            </label>
            <label class="au-field"><span>Imágenes del cuerpo</span>
              <select class="au-input" name="v-body" [(ngModel)]="visuals.bodyStyle" (ngModelChange)="dirty = true">
                @for (style of imageStyles; track style.key) { <option [value]="style.key">{{ style.label }}</option> }
                <option value="media_library">Solo mi biblioteca de medios</option>
              </select>
            </label>
          </div>
          <ul class="ws-switches ws-promo">
            @for (toggle of visualToggles; track toggle.label) {
              <li class="ws-switch">
                <span><span class="ws-switch__label">{{ toggle.label }}</span><span class="ws-switch__hint">{{ toggle.hint }}</span></span>
                <input type="checkbox" role="switch" class="ws-toggle" [checked]="toggle.get()" (change)="toggle.set(!toggle.get()); dirty = true" [attr.aria-label]="toggle.label" [disabled]="toggle.label === 'Solo vídeos de mi canal' && !visuals.youtube.enabled" />
              </li>
            }
          </ul>
          @if (visuals.youtube.enabled) {
            <label class="au-field ws-promo"><span>Vídeos aprobados (uno por línea: dirección | título)</span><textarea class="au-textarea" name="v-approved" rows="3" [ngModel]="approvedText" (ngModelChange)="setApproved($event)" placeholder="https://www.youtube.com/watch?v=… | Cómo sintonizar la TDT"></textarea><small class="au-muted">Se prueban antes de buscar en YouTube. La búsqueda solo se hace si el artículo pide un vídeo.</small></label>
          }
          @if (visuals.youtube.enabled) {
            <label class="au-field ws-promo"><span>URL de tu canal de YouTube</span><input class="au-input" name="v-channel" type="url" maxlength="200" [(ngModel)]="visuals.youtube.channelUrl" (ngModelChange)="dirty = true" placeholder="https://www.youtube.com/@tucanal" /></label>
          }
        </section>

        <section class="ws-card" aria-labelledby="ws-cta" [hidden]="!showTab('ctas')">
          <h2 class="ws-card__title" id="ws-cta">Llamadas a la acción</h2>
          <p class="ws-card__sub">Tarjetas con los colores de tu marca. Los campos vacíos usan el nombre del sitio, la portada y lo que redacte el escritor</p>
          <h3 class="ws-sub ws-sub--first" id="ws-card-style">Estilo de las tarjetas</h3>
          <div class="ws-fields ws-card-style">
            <label class="au-field"><span>Estilo</span>
              <select class="au-input" name="card-style" [(ngModel)]="brand.cardStyle" (ngModelChange)="dirty = true">
                @for (option of cardStyles; track option.key) { <option [value]="option.key">{{ option.label }}</option> }
              </select>
              <span class="au-hint">{{ cardStyleHint }}</span>
            </label>
            <label class="au-field"><span>Esquinas</span>
              <select class="au-input" name="card-corners" [(ngModel)]="brand.cardCorners" (ngModelChange)="dirty = true" [disabled]="brand.cardStyle === 'editorial'">
                @for (option of cardCorners; track option.key) { <option [value]="option.key">{{ option.label }}</option> }
              </select>
              @if (brand.cardStyle === 'editorial') { <span class="au-hint">El estilo editorial no tiene esquinas.</span> }
            </label>
          </div>
          <p class="ws-hint">El color principal y el secundario se eligen en <a class="au-link" routerLink="/studio/settings/writing" [queryParams]="{ tab: 'brand' }">Marca y aviso</a>; el logotipo también.</p>
          <h3 class="ws-sub" id="ws-card-preview">Vista previa en el artículo</h3>
          <p class="ws-card__sub">Así se publicarán las tarjetas en el artículo. Los textos de ejemplo se sustituyen al rellenar los campos.</p>
          @if (previewError) { <p class="ws-empty" role="alert">{{ previewError }}</p> }
          <div class="ws-preview" aria-labelledby="ws-card-preview">
            @for (item of previewItems; track item.kind) {
              <figure class="ws-preview__item">
                <figcaption>{{ item.label }}</figcaption>
                <div class="ws-preview__frame" [innerHTML]="previewHtml[item.kind]"></div>
              </figure>
            }
          </div>
          <ul class="ws-switches">
            @for (toggle of ctaToggles; track toggle.label) {
              <li class="ws-switch">
                <span><span class="ws-switch__label">{{ toggle.label }}</span><span class="ws-switch__hint">{{ toggle.hint }}</span></span>
                <input type="checkbox" role="switch" class="ws-toggle" [checked]="toggle.get()" (change)="toggle.set(!toggle.get()); dirty = true" [attr.aria-label]="toggle.label" />
              </li>
            }
          </ul>
          <fieldset class="ws-fields" (input)="dirty = true">
            <legend>Tarjeta de enlace</legend>
            <label class="au-field"><span>Titular</span><input class="au-input" name="lc-headline" maxlength="80" [(ngModel)]="brand.linkCard.headline" placeholder="p. ej. Descubre qué hay ahora en TV" /></label>
            <label class="au-field"><span>Frase</span><input class="au-input" name="lc-text" maxlength="200" [(ngModel)]="brand.linkCard.text" /></label>
            <label class="au-field"><span>URL del botón</span><input class="au-input" name="lc-url" type="url" maxlength="500" [(ngModel)]="brand.linkCard.url" placeholder="Página de inicio" /></label>
            <label class="au-field"><span>Texto del botón</span><input class="au-input" name="lc-button" maxlength="30" [(ngModel)]="brand.linkCard.buttonText" placeholder="Visitar" /></label>
          </fieldset>
          <fieldset class="ws-fields" (input)="dirty = true">
            <legend>Tarjeta de contacto</legend>
            <label class="au-field"><span>Titular</span><input class="au-input" name="cc-headline" maxlength="80" [(ngModel)]="brand.contactCard.headline" /></label>
            <label class="au-field"><span>Frase</span><input class="au-input" name="cc-text" maxlength="200" [(ngModel)]="brand.contactCard.text" /></label>
            <label class="au-field"><span>Correo</span><input class="au-input" name="cc-email" type="email" maxlength="200" [(ngModel)]="brand.contactCard.email" /></label>
            <label class="au-field"><span>Teléfono</span><input class="au-input" name="cc-phone" type="tel" maxlength="30" [(ngModel)]="brand.contactCard.phone" /></label>
            <label class="au-field"><span>URL del botón</span><input class="au-input" name="cc-url" type="url" maxlength="500" [(ngModel)]="brand.contactCard.url" /></label>
            <label class="au-field"><span>Texto del botón</span><input class="au-input" name="cc-button" maxlength="30" [(ngModel)]="brand.contactCard.buttonText" placeholder="Contactar" /></label>
          </fieldset>
          <fieldset class="ws-fields" (input)="dirty = true">
            <legend>Tarjeta de mapa</legend>
            <label class="au-field"><span>Titular</span><input class="au-input" name="mc-headline" maxlength="80" [(ngModel)]="brand.mapCard.headline" /></label>
            <label class="au-field"><span>Dirección</span><input class="au-input" name="mc-address" maxlength="200" [(ngModel)]="brand.mapCard.address" /></label>
            <label class="au-field"><span>URL del mapa</span><input class="au-input" name="mc-url" type="url" maxlength="500" [(ngModel)]="brand.mapCard.url" placeholder="Búsqueda de la dirección en Google Maps" /></label>
          </fieldset>
          <label class="au-field au-mb-0 ws-promo">
            <span>Párrafo promocional: qué debe decir</span>
            <textarea class="au-input" rows="2" maxlength="500" [(ngModel)]="brand.promo" (ngModelChange)="dirty = true" placeholder="p. ej. Nuestra guía es gratuita y muestra la programación de todos los canales en una página"></textarea>
          </label>
        </section>

        <section class="ws-card" aria-labelledby="ws-business" [hidden]="!showTab('business')">
          <h2 class="ws-card__title" id="ws-business">Datos del negocio</h2>
          <p class="ws-card__sub">Lo que el escritor sabe de tu negocio. El posicionamiento y la audiencia usan por defecto lo detectado en tu sitio</p>
          <div class="ws-fields" (input)="dirty = true">
            <label class="au-field ws-wide"><span>Posicionamiento</span><textarea class="au-input" rows="3" maxlength="500" [(ngModel)]="brand.positioning"></textarea><span class="au-hint">{{ brand.positioning.length }} / 500</span></label>
            <label class="au-field ws-wide"><span>Público objetivo (uno por línea)</span><textarea class="au-input" rows="2" [ngModel]="audienceText" (ngModelChange)="brand.audience = lines($event, 10)"></textarea></label>
            <label class="au-field"><span>País</span><input class="au-input" name="b-country" maxlength="80" [(ngModel)]="brand.location.country" /></label>
            <label class="au-field"><span>Ciudades (separadas por comas)</span><input class="au-input" name="b-cities" [ngModel]="citiesText" (ngModelChange)="brand.location.cities = commas($event)" /></label>
            <label class="au-field"><span>Ruta del blog</span><input class="au-input" name="b-blog" maxlength="100" [(ngModel)]="brand.blogPath" placeholder="/blog" /></label>
          </div>
          <h3 class="ws-sub">Qué vendes ({{ brand.offers.length }} / 20)</h3>
          @for (offer of brand.offers; track $index; let i = $index) {
            <div class="ws-offer" (input)="dirty = true">
              <input class="au-input" [name]="'o-name-' + i" maxlength="120" [(ngModel)]="offer.name" placeholder="Oferta" aria-label="Nombre de la oferta" />
              <input class="au-input" [name]="'o-price-' + i" maxlength="40" [(ngModel)]="offer.price" placeholder="Precio" aria-label="Precio de la oferta" />
              <input class="au-input" [name]="'o-url-' + i" type="url" maxlength="500" [(ngModel)]="offer.url" placeholder="https://" aria-label="URL de la oferta" />
              <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="removeOffer(i)" [attr.aria-label]="'Eliminar oferta ' + (i + 1)"><app-icon name="close"></app-icon></button>
            </div>
          }
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="addOffer()" [disabled]="brand.offers.length >= 20">Añadir oferta</button>
        </section>

        <section class="ws-card" aria-labelledby="ws-branding" [hidden]="!showTab('brand')">
          <h2 class="ws-card__title" id="ws-branding">Marca</h2>
          <p class="ws-card__sub">Logotipo y colores de las tarjetas. Colores como #rrggbb. Lo que dejes vacío se toma de tu sitio.</p>
          <div class="ws-detected" aria-live="polite">
            <div class="ws-detected__head">
              <strong>Detectado en tu sitio</strong>
              <span class="ws-detected__src">{{ detectedInfo?.source || 'Sin URL del sitio' }}</span>
            </div>
            @if (detecting) { <p class="ws-card__sub">Leyendo tu sitio…</p> }
            @else if (detectedInfo?.detected; as found) {
              <div class="ws-detected__body">
                @if (found.logoUrl) { <img class="ws-detected__logo" [src]="found.logoUrl" alt="Logotipo detectado" width="40" height="40" /> }
                @if (found.primaryColor) { <span class="ws-detected__chip"><i [style.background]="found.primaryColor"></i>Primario {{ found.primaryColor }}</span> }
                @if (found.secondaryColor) { <span class="ws-detected__chip"><i [style.background]="found.secondaryColor"></i>Secundario {{ found.secondaryColor }}</span> }
              </div>
            } @else if (detectedInfo) {
              <p class="ws-card__sub">No se pudo leer la marca de tu sitio. Introduce el logotipo y los colores a mano.</p>
            }
            <div class="ws-detected__actions">
              <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="useDetected()" [disabled]="!detectedInfo?.detected || detecting">Usar los datos detectados</button>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="recrawl()" [disabled]="detecting || !detectedInfo?.source">Volver a leer el sitio</button>
            </div>
          </div>
          <div class="ws-fields" (input)="dirty = true">
            <label class="au-field ws-wide"><span>URL del logotipo</span><input class="au-input" name="br-logo" type="url" maxlength="500" [(ngModel)]="brand.logoUrl" [placeholder]="detectedInfo?.detected?.logoUrl || 'https://…/logo.png'" /></label>
            <label class="au-field"><span>Color primario</span><span class="ws-color"><i [style.background]="brand.primaryColor || detectedInfo?.detected?.primaryColor || 'transparent'"></i><input class="au-input" name="br-primary" maxlength="7" pattern="#[0-9a-fA-F]{6}" [(ngModel)]="brand.primaryColor" [placeholder]="detectedInfo?.detected?.primaryColor || '#1f2937'" /></span></label>
            <label class="au-field"><span>Color secundario</span><span class="ws-color"><i [style.background]="brand.secondaryColor || detectedInfo?.detected?.secondaryColor || 'transparent'"></i><input class="au-input" name="br-secondary" maxlength="7" pattern="#[0-9a-fA-F]{6}" [(ngModel)]="brand.secondaryColor" [placeholder]="detectedInfo?.detected?.secondaryColor || '#d1d5db'" /></span></label>
          </div>
        </section>

        <section class="ws-card" aria-labelledby="ws-disclaimer" [hidden]="!showTab('brand')">
          <h2 class="ws-card__title" id="ws-disclaimer">Aviso del artículo</h2>
          <p class="ws-card__sub">Texto opcional añadido al final de cada artículo</p>
          <label class="au-field au-mb-0">
            <span class="au-sr-only">Texto del aviso</span>
            <textarea class="au-input" rows="3" maxlength="500" [(ngModel)]="writing.disclaimer" (ngModelChange)="dirty = true" placeholder="p. ej. Este artículo se redactó con ayuda de IA y lo revisó nuestro equipo editorial"></textarea>
            <span class="au-hint">{{ writing.disclaimer.length }} / 500</span>
          </label>
        </section>

        <div class="ws-save" [class.is-dirty]="dirty" role="region" aria-label="Guardar cambios">
          <span class="sp-muted">{{ message || (dirty ? 'Cambios sin guardar' : 'Todos los cambios guardados') }}</span>
          <button class="au-btn au-btn--ghost" type="button" [disabled]="!dirty || saving" (click)="load()">Descartar</button>
          <button class="au-btn au-btn--primary" type="button" [disabled]="!dirty || saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      }
    </section>
  `,
  styles: [`
    .ws { max-width: 1600px; padding-bottom: 96px; }
    .ws .sp-head__title { margin: 4px 0 6px; font: 700 clamp(1.75rem, 2.55vw, 2.45rem)/1.13 Georgia, serif; letter-spacing: -.035em; }
    .ws .sp-head__sub { font-size: .875rem; }
    .ws-kicker { margin: 0; color: var(--au-muted); font-size: .69rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
    .ws-card { padding: 20px 24px; margin-bottom: 16px; border: 1px solid var(--sp-line); border-radius: 15px; background: var(--au-surface-solid); }
    .ws-card__title { margin: 0; font-size: 16px; font-weight: 600; }
    .ws-card__sub { margin: 4px 0 16px; color: var(--au-muted); font-size: 13px; }
    .ws-empty { margin: 0 0 12px; padding: 16px; border: 1px dashed var(--sp-line); border-radius: 8px; color: var(--au-muted); font-size: 13px; }
        .ws-rules { display: grid; gap: 7px; list-style: none; margin: 0 0 14px; padding: 0; }
        .ws-rule { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 8px 10px; border: 1px solid var(--au-border); border-radius: 9px; background: var(--au-table-head); font-size: 13px; }
    .ws-rule__n { font-size: 11px; font-weight: 800; color: var(--au-brand); }
    .ws-rule__actions { display: flex; gap: 4px; }
    .ws-rule__edit { min-width: 0; }
    @media (max-width: 600px) { .ws-rule { grid-template-columns: 28px minmax(0, 1fr); } .ws-rule__actions { grid-column: 2; } }
    .ws-add { display: flex; gap: 8px; }
    .ws-add input { flex: 1; }
    .ws-examples { margin-top: 12px; font-size: 13px; }
    .ws-examples summary { cursor: pointer; color: var(--au-muted); }
    .ws-examples__list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .ws-chip { padding: 6px 10px; border: 1px solid var(--sp-line); border-radius: 8px; background: var(--au-surface-2); color: var(--au-text-2); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
    .ws-chip:hover:not(:disabled) { border-color: var(--au-border-strong); }
    .ws-chip:disabled { opacity: .5; cursor: default; }
    .ws-options, .ws-variants { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
    .ws-variants { margin-top: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .ws-option, .ws-variant { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 12px; border: 1px solid var(--sp-line); border-radius: 10px; cursor: pointer; transition: border-color .15s ease, background-color .15s ease; }
    .ws-option:hover, .ws-variant:hover { border-color: var(--au-border-strong); }
    .ws-option.is-on, .ws-variant.is-on { border-color: var(--au-brand-strong); background: var(--au-surface-selected); }
    .ws-option input, .ws-variant input { position: absolute; opacity: 0; pointer-events: none; }
    .ws-option:has(input:focus-visible), .ws-variant:has(input:focus-visible) { box-shadow: var(--au-focus-ring); }
    .ws-option__title { font-size: 14px; font-weight: 500; }
    .ws-option__hint { font-size: 12px; color: var(--au-muted); }
    .ws-variant__art { display: grid; gap: 4px; height: 72px; margin-bottom: 8px; padding: 10px 12px; border-radius: 6px; background: var(--au-surface-2); }
    .ws-variant__art b { font-size: 11px; font-weight: 500; color: var(--au-text-2); }
    .ws-variant__art i { height: 5px; width: 70%; border-radius: 3px; background: var(--au-border-strong); }
    .ws-variant__art--table i { width: 100%; height: 8px; border-radius: 2px; background: linear-gradient(90deg, var(--au-border-strong) 0 34%, transparent 34% 38%, var(--au-border) 38%); }
    .ws-switches { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--sp-line); }
    .ws-switch { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--sp-line); }
    .ws-switch__label { display: block; font-size: 14px; }
    .ws-switch__hint { display: block; font-size: 12px; color: var(--au-muted); }
    .ws-toggle { appearance: none; flex: none; position: relative; width: 36px; height: 20px; margin: 0; border-radius: 10px; background: var(--au-border-strong); cursor: pointer; transition: background-color .15s ease; }
    .ws-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .2); transition: transform .15s ease; }
    .ws-toggle:checked { background: var(--au-brand-strong); }
    .ws-toggle:checked::after { transform: translateX(16px); }
    .ws-toggle:disabled { opacity: .4; cursor: default; }
    .ws-toggle:focus-visible { outline: none; box-shadow: var(--au-focus-ring); }
    .ws-save { position: sticky; bottom: 16px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 12px; border: 1px solid var(--sp-line); border-radius: var(--sp-r); background: var(--sp-cell); }
    .ws-save span { margin-right: auto; }
    .ws-save.is-dirty { border-color: var(--au-brand-strong); }
    .ws-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 16px 0 0; padding: 0; border: 0; min-width: 0; }
    .ws-fields legend { grid-column: 1 / -1; padding: 0; margin-bottom: 4px; font-size: 14px; font-weight: 500; }
    .ws-fields .au-field { margin: 0; }
    .ws-wide { grid-column: 1 / -1; }
    .ws-promo { display: block; margin-top: 16px; }
    .ws-sub { margin: 20px 0 8px; font-size: 14px; font-weight: 500; }
    .ws-sub--first { margin-top: 4px; }
    .ws-detected { margin-bottom: 16px; padding: 12px 14px; border: 1px solid var(--au-border); border-radius: 12px; background: var(--au-table-head); }
    .ws-detected__head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; justify-content: space-between; }
    .ws-detected__src { color: var(--au-muted); font-size: 12px; overflow-wrap: anywhere; }
    .ws-detected__body { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 10px; }
    .ws-detected__logo { border-radius: 8px; background: #ffffff; border: 1px solid var(--au-border); object-fit: contain; }
    .ws-detected__chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--au-border); border-radius: 999px; background: var(--au-surface-solid); font-size: 12px; }
    .ws-detected__chip i { width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--au-border); }
    .ws-detected__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .ws-hint { margin: 8px 0 0; color: var(--au-muted); font-size: 12px; }
    .ws-preview { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); align-items: start; gap: 16px; }
    .ws-preview__item { margin: 0; min-width: 0; }
    .ws-preview__item figcaption { margin-bottom: 4px; color: var(--au-muted); font-size: 12px; font-weight: 600; }
    .ws-preview__frame aside { margin: 16px 0 !important; }
    .ws-preview__frame { padding: 0 16px; border: 1px solid var(--au-border); border-radius: 12px; background: #ffffff; color: #111827; font-size: 15px; overflow: hidden; }
    .ws-preview__frame :is(a) { color: #2563eb; }
    .ws-offer { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2fr) auto; gap: 8px; margin-bottom: 8px; }
    .ws-color { display: flex; align-items: center; gap: 8px; }
    .ws-color i { flex: none; width: 24px; height: 24px; border: 1px solid var(--sp-line); border-radius: 6px; }
    @media (max-width: 600px) { .ws-card { padding: 16px; } .ws-offer { grid-template-columns: 1fr; } .ws-add { flex-wrap: wrap; } .ws-add input { min-width: 0; } }
    @media (prefers-reduced-motion: reduce) { .ws-toggle, .ws-toggle::after { transition: none; } }
  `],
})
export class WritingSettingsPageComponent implements DoCheck, OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  readonly cardStyles: Array<{ key: BrandSettings['cardStyle']; label: string; hint: string }> = [
    { key: 'classic', label: 'Clásico', hint: 'Cabecera oscura con la marca y halo de color' },
    { key: 'editorial', label: 'Editorial', hint: 'Filete superior, titular grande y enlace subrayado, como en una revista' },
    { key: 'soft', label: 'Suave', hint: 'Panel tintado con borde de acento' },
    { key: 'minimal', label: 'Minimalista', hint: 'Fondo blanco, filete fino y botón con contorno' },
    { key: 'bold', label: 'Destacado', hint: 'Fondo con tu color principal y botón de contraste' },
    { key: 'ink', label: 'Oscuro', hint: 'Panel casi negro con línea de acento y botón blanco' },
    { key: 'frame', label: 'Marco centrado', hint: 'Texto centrado dentro de un marco de tu color y botón en píldora' },
  ];
  readonly cardCorners: Array<{ key: BrandSettings['cardCorners']; label: string }> = [
    { key: 'rounded', label: 'Esquinas redondeadas' },
    { key: 'square', label: 'Esquinas rectas' },
  ];
  readonly previewItems = [
    { kind: 'link_card' as const, label: 'Tarjeta de enlace' },
    { kind: 'contact_card' as const, label: 'Tarjeta de contacto' },
    { kind: 'map_card' as const, label: 'Tarjeta de mapa' },
  ];
  detectedInfo: DetectedBrand | null = null;
  detecting = false;

  private loadDetected(refresh = false): void {
    const siteId = this.siteId;
    this.detecting = true;
    (refresh ? this.api.refreshDetectedBrand(siteId) : this.api.getDetectedBrand(siteId)).subscribe({
      next: (info) => { if (siteId === this.siteId) { this.detectedInfo = info; this.detecting = false; } },
      error: () => { if (siteId === this.siteId) { this.detectedInfo = { source: null, detected: null }; this.detecting = false; } },
    });
  }

  recrawl(): void { this.loadDetected(true); }

  /** Copies what the crawl found into the brand fields; the editor still has to save. */
  useDetected(): void {
    const found = this.detectedInfo?.detected;
    if (!found) return;
    if (found.primaryColor) this.brand.primaryColor = found.primaryColor;
    if (found.secondaryColor) this.brand.secondaryColor = found.secondaryColor;
    if (found.logoUrl) this.brand.logoUrl = found.logoUrl;
    this.dirty = true;
  }

  get cardStyleHint(): string { return this.cardStyles.find((option) => option.key === this.brand.cardStyle)?.hint ?? ''; }
  previewHtml: Partial<Record<'link_card' | 'contact_card' | 'map_card', SafeHtml>> = {};
  previewError = '';
  private previewKey = '';
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private previewRequest = 0;

  /** Re-renders the preview (debounced) whenever the CTA tab is shown and the brand draft changes. */
  ngDoCheck(): void {
    if (!this.writing || !this.siteId || !this.showTab('ctas') || this.route.snapshot.queryParamMap.get('tab') !== 'ctas') return;
    const key = this.siteId + JSON.stringify(this.brand) + JSON.stringify(this.detectedInfo?.detected ?? null);
    if (key === this.previewKey) return;
    this.previewKey = key;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.refreshPreview(), 350);
  }

  ngOnDestroy(): void { clearTimeout(this.previewTimer); }

  private refreshPreview(): void {
    const request = ++this.previewRequest;
    this.api.previewCtaCards(this.siteId, structuredClone(this.brand)).subscribe({
      next: ({ cards }) => {
        if (request !== this.previewRequest) return;
        this.previewError = '';
        // The HTML is produced and sanitized by the server (same renderer as published articles); Angular would strip its inline styles.
        this.previewHtml = { link_card: this.sanitizer.bypassSecurityTrustHtml(cards.link_card), contact_card: this.sanitizer.bypassSecurityTrustHtml(cards.contact_card), map_card: this.sanitizer.bypassSecurityTrustHtml(cards.map_card) };
      },
      error: (err) => { if (request === this.previewRequest) this.previewError = apiMessage(err, 'No se pudo generar la vista previa.'); },
    });
  }

  private readonly route = inject(ActivatedRoute);
  showTab(tab: string): boolean {
    const selected = this.route.snapshot.queryParamMap.get('tab');
    return !selected || !['rules', 'structure', 'visuals', 'ctas', 'business', 'brand'].includes(selected) || selected === tab;
  }
  private readonly api = inject(PlanningApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  siteId = '';
  get siteName(): string { return this.appContext.activeSite()?.name ?? 'este sitio'; }
  private readonly drafts = new Map<string, WritingDraft>();
  private loadVersion = 0;

  constructor() {
    effect(() => {
      const siteId = this.appContext.activeSite()?.id ?? '';
      untracked(() => this.switchSite(siteId));
    });
  }

  private snapshot(): WritingDraft | null {
    if (!this.writing) return null;
    return structuredClone({ targets: this.targets, writing: this.writing, brand: this.brand, visuals: this.visuals,
      audienceText: this.audienceText, citiesText: this.citiesText, newRule: this.newRule,
      dirty: this.dirty, saving: this.saving, message: this.message });
  }

  private restore(draft: WritingDraft): void {
    this.targets = draft.targets; this.writing = draft.writing; this.brand = draft.brand; this.visuals = draft.visuals;
    this.audienceText = draft.audienceText; this.citiesText = draft.citiesText; this.newRule = draft.newRule;
    this.dirty = draft.dirty; this.saving = draft.saving; this.message = draft.message;
  }

  private switchSite(siteId: string): void {
    if (siteId === this.siteId && (siteId || this.message)) return;
    const previous = this.snapshot();
    if (this.siteId && previous && (previous.dirty || previous.saving || previous.newRule.trim())) this.drafts.set(this.siteId, previous);
    this.loadVersion++;
    this.siteId = siteId;
    this.writing = null; this.dirty = false; this.saving = false; this.message = ''; this.newRule = '';
    const draft = this.drafts.get(siteId);
    if (draft) { this.drafts.delete(siteId); this.restore(draft); }
    else this.load();
  }

  writing: WritingSettings | null = null;
  brand: BrandSettings = structuredClone(DEFAULT_BRAND);
  visuals: VisualSettings = structuredClone(DEFAULT_VISUALS);
  approvedText = '';

  /** Lines without a YouTube address and a title are not stored. */
  setApproved(text: string): void {
    this.approvedText = text;
    this.visuals.youtube.approved = text.split('\n').flatMap((line) => {
      const match = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})\S*\s*\|\s*(.+)$/.exec(line.trim());
      return match ? [{ id: match[1], title: match[2].trim() }] : [];
    });
    this.dirty = true;
  }
  readonly imageStyles: Array<{ key: ImageStyle; label: string }> = [
    { key: 'realistic', label: 'Foto realista' },
    { key: 'illustration', label: 'Ilustración' },
    { key: 'editorial', label: 'Editorial' },
    { key: 'minimal', label: 'Minimalista' },
  ];
  readonly visualToggles: Toggle[] = [
    { label: 'Infografía', hint: 'Una por artículo, a partir de la sección con pasos, cifras o una comparación', get: () => this.visuals.infographic, set: (on) => (this.visuals.infographic = on) },
    { label: 'Vídeo de YouTube', hint: 'Un vídeo relacionado por artículo, como miniatura enlazada', get: () => this.visuals.youtube.enabled, set: (on) => (this.visuals.youtube.enabled = on) },
    { label: 'Solo vídeos de mi canal', hint: 'Omite el vídeo cuando tu canal no tiene ninguno para la palabra clave', get: () => this.visuals.youtube.channelOnly, set: (on) => (this.visuals.youtube.channelOnly = on) },
  ];
  private targets: ArticleTargetsOverride = {};
  newRule = '';
  dirty = false;
  saving = false;
  message = '';

  readonly examples = [
    'No usar nunca la palabra «apalancar»',
    'Escribir los precios en euros con el signo € tras el número',
    'Tratar al lector de «tú», nunca de «usted»',
    'No prometer horarios que no podamos confirmar',
    'Mencionar que nuestra guía es gratuita y no requiere registro',
  ];
  readonly lengths: Array<{ key: WritingSettings['length']; label: string; hint: string }> = [
    { key: 'dynamic', label: 'Dinámica', hint: 'Sigue la intención de búsqueda' },
    { key: 'short', label: '1,200–1,600', hint: 'Respuestas rápidas' },
    { key: 'medium', label: '1,700–2,300', hint: 'Guías completas' },
    { key: 'long', label: '2,400–2,800', hint: 'Pilares en profundidad' },
  ];
  readonly toggles: Toggle[] = [
    { label: 'Perspectiva del autor', hint: 'Escribe como la publicación, con experiencia de primera mano', get: () => this.writing!.authorPerspective, set: (on) => (this.writing!.authorPerspective = on) },
    { label: 'Tabla de contenidos', hint: 'Lista enlazada de secciones, tras el resumen', get: () => this.sectionOn('toc'), set: (on) => this.setSection('toc', on) },
    { label: 'Lecturas recomendadas', hint: 'Enlaces a otras entradas de tu blog al final', get: () => this.sectionOn('furtherReading'), set: (on) => this.setSection('furtherReading', on) },
    { label: 'Sección de fuentes', hint: 'Cada fuente externa listada como «Título, Editor»', get: () => this.sectionOn('sources'), set: (on) => this.setSection('sources', on) },
    { label: 'Citas', hint: 'Cada cifra y afirmación atribuida en el texto a su fuente', get: () => this.writing!.citations, set: (on) => (this.writing!.citations = on) },
    { label: 'Preguntas frecuentes', hint: 'Preguntas y respuestas breves y autosuficientes', get: () => this.sectionOn('faq'), set: (on) => this.setSection('faq', on) },
    { label: 'Tarjeta de llamada a la acción', hint: 'Una tarjeta final que lleva a los lectores a tu sitio (artículos que no son guías)', get: () => this.sectionOn('cta'), set: (on) => this.setSection('cta', on) },
    { label: 'Mencionar competidores cuando sea relevante', hint: 'Desactivado por defecto: nunca se recomienda a la competencia', get: () => this.writing!.mentionCompetitors, set: (on) => (this.writing!.mentionCompetitors = on) },
    { label: 'Marcado schema (JSON-LD)', hint: 'Datos de artículo, FAQ y migas de pan para buscadores', get: () => this.sectionOn('jsonLd'), set: (on) => this.setSection('jsonLd', on) },
    { label: 'Resumen', hint: 'Un resumen breve justo después de la introducción', get: () => this.sectionOn('summary'), set: (on) => this.setSection('summary', on) },
  ];
  readonly ctaToggles: Toggle[] = [
    { label: 'Tarjeta de enlace', hint: 'Tu sitio, un titular y un botón, justo tras la introducción', get: () => this.sectionOn('linkCard'), set: (on) => this.setSection('linkCard', on) },
    { label: 'Tarjeta de mapa', hint: 'Tu dirección con indicaciones, en el cuerpo (requiere dirección)', get: () => this.sectionOn('mapCard'), set: (on) => this.setSection('mapCard', on) },
    { label: 'Tarjeta de contacto', hint: 'Cómo contactarte, al final (requiere correo, teléfono o URL)', get: () => this.sectionOn('contactCard'), set: (on) => this.setSection('contactCard', on) },
    { label: 'Párrafo promocional', hint: 'Una sección sobre lo que ofrece tu sitio, antes de las FAQ', get: () => this.sectionOn('promo'), set: (on) => this.setSection('promo', on) },
  ];
  readonly linkToggles: Toggle[] = [
    { label: 'Enlaces internos', hint: 'Enlaza a páginas reales de tu sitemap', get: () => this.writing!.internalLinks.enabled, set: (on) => (this.writing!.internalLinks.enabled = on) },
    { label: 'Añadir «www» a los enlaces internos', hint: 'https://www.example.com/page', get: () => this.writing!.internalLinks.www, set: (on) => (this.writing!.internalLinks.www = on) },
    { label: 'Añadir «/» final a los enlaces internos', hint: 'https://example.com/page/', get: () => this.writing!.internalLinks.trailingSlash, set: (on) => (this.writing!.internalLinks.trailingSlash = on) },
  ];

  load(): void {
    if (!this.siteId) {
      this.message = 'Elige primero un sitio en la barra superior.';
      return;
    }
    const siteId = this.siteId;
    const version = ++this.loadVersion;
    this.writing = null;
    this.message = '';
    this.api.getPlanningSettings(siteId).subscribe({
      next: (settings) => {
        if (siteId !== this.siteId || version !== this.loadVersion) return;
        this.targets = structuredClone(settings.articleTargets ?? {});
        const stored = this.targets.writing;
        this.writing = { ...DEFAULT_WRITING, ...stored, instructions: [...(stored?.instructions ?? [])], internalLinks: { ...DEFAULT_WRITING.internalLinks, ...stored?.internalLinks } };
        const b = this.targets.brand;
        this.brand = {
          ...structuredClone(DEFAULT_BRAND),
          ...b,
          location: { ...DEFAULT_BRAND.location, ...b?.location },
          linkCard: { ...DEFAULT_BRAND.linkCard, ...b?.linkCard },
          contactCard: { ...DEFAULT_BRAND.contactCard, ...b?.contactCard },
          mapCard: { ...DEFAULT_BRAND.mapCard, ...b?.mapCard },
        };
        this.audienceText = this.brand.audience.join('\n');
        const v = this.targets.visuals;
        this.visuals = { ...structuredClone(DEFAULT_VISUALS), ...v, youtube: { ...DEFAULT_VISUALS.youtube, ...v?.youtube } };
        this.approvedText = this.visuals.youtube.approved.map((video) => `https://www.youtube.com/watch?v=${video.id} | ${video.title}`).join('\n');
        this.citiesText = this.brand.location.cities.join(', ');
        this.dirty = false;
        this.detectedInfo = null;
        this.loadDetected();
      },
      error: (err) => { if (siteId === this.siteId && version === this.loadVersion) this.message = apiMessage(err, 'No se pudo cargar la configuración de escritura.'); },
    });
  }

  /** Every section is on unless the site switched it off. */
  sectionOn(key: ArticleSectionKey): boolean {
    return this.targets.sections?.[key] !== false;
  }

  private setSection(key: ArticleSectionKey, on: boolean): void {
    (this.targets.sections ??= {})[key] = on;
  }

  addRule(rule = this.newRule): void {
    const text = rule.replace(/\s+/g, ' ').trim();
    if (!text || !this.writing || this.writing.instructions.includes(text) || this.writing.instructions.length >= 30) return;
    this.writing.instructions = [...this.writing.instructions, text];
    if (rule === this.newRule) this.newRule = '';
    this.dirty = true;
  }

  editingRule = -1;
  editText = '';

  startEdit(index: number): void { this.editingRule = index; this.editText = this.writing!.instructions[index]; }

  cancelEdit(): void { this.editingRule = -1; }

  saveRule(): void {
    const text = this.editText.replace(/\s+/g, ' ').trim();
    const list = this.writing!.instructions;
    if (!text || list.some((rule, i) => i !== this.editingRule && rule === text)) return;
    if (text !== list[this.editingRule]) { this.writing!.instructions = list.map((rule, i) => (i === this.editingRule ? text : rule)); this.dirty = true; }
    this.editingRule = -1;
  }

  removeRule(index: number): void {
    this.editingRule = -1;
    this.writing!.instructions = this.writing!.instructions.filter((_rule, i) => i !== index);
    this.dirty = true;
  }

  audienceText = '';

  lines(value: string, max: number): string[] {
    this.audienceText = value;
    this.dirty = true;
    return value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, max);
  }

  citiesText = '';

  commas(value: string): string[] {
    this.citiesText = value;
    this.dirty = true;
    return value.split(',').map((city) => city.trim()).filter(Boolean).slice(0, 10);
  }

  addOffer(): void {
    if (this.brand.offers.length >= 20) return;
    this.brand.offers = [...this.brand.offers, { name: '', price: '', url: '' }];
    this.dirty = true;
  }

  removeOffer(index: number): void {
    this.brand.offers = this.brand.offers.filter((_offer, i) => i !== index);
    this.dirty = true;
  }

  save(): void {
    if (!this.writing || this.saving || !this.siteId) return;
    const siteId = this.siteId;
    const sent = structuredClone({ ...this.targets, writing: this.writing, brand: this.brand, visuals: this.visuals });
    this.saving = true;
    this.message = '';
    this.api.putPlanningSettings(siteId, { articleTargets: sent }).subscribe({
      next: (settings) => {
        const current = siteId === this.siteId;
        const draft = current ? this.snapshot() : this.drafts.get(siteId);
        if (!draft) return;
        const now = { ...draft.targets, writing: draft.writing, brand: draft.brand, visuals: draft.visuals };
        const changed = JSON.stringify(now) !== JSON.stringify(sent);
        if (!changed) draft.targets = structuredClone(settings.articleTargets ?? {});
        draft.saving = false;
        draft.dirty = changed;
        draft.message = '';
        if (current) { this.restore(draft); this.toast.success('Configuración de escritura guardada. Se aplica a los próximos artículos.'); }
      },
      error: (err) => {
        const current = siteId === this.siteId;
        const draft = current ? this.snapshot() : this.drafts.get(siteId);
        if (!draft) return;
        draft.saving = false;
        draft.message = apiMessage(err, 'No se pudo guardar la configuración de escritura.');
        if (current) { this.restore(draft); this.toast.error(draft.message); }
      },
    });
  }
}
