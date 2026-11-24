import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AuRichEditorComponent } from '../components/ui/au-rich-editor.component';
import { htmlToMarkdown } from '../utils/html-to-markdown';
import { AppPopoverComponent } from '../components/ui/app-popover.component';
import type {
  InternalLinkSuggestion,
  ProjectVersionDetail,
  ReviewGateStage,
  StudioProjectDetailView,
  StudioPublication,
  StudioSocialContent,
} from '../models/studio.models';
import { stageTone } from '../utils/content-status';
import { articlePipeline, type PipelineStep } from '../utils/article-pipeline';

type WorkspaceTab = 'content' | 'media' | 'seo' | 'social' | 'schedule' | 'history';
type ProjectPublication = {
  id: string;
  channel: 'website' | 'x' | 'instagram' | 'facebook';
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  externalId: string | null;
  lastError: string | null;
  account: { id: string; platform: string; displayName: string } | null;
  site: { id: string; key: string; name: string } | null;
};

function strOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** "https://www.site.com/x" → "site.com"; '' when not an absolute URL. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

@Component({
  selector: 'app-content-workspace-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AuRichEditorComponent, AppPopoverComponent],
  styleUrls: ['./studio-page-kit.css', './content-workspace-page.component.css', './content-workspace-edit.css', './content-workspace-reference.css', './content-workspace-tabs.css'],
  template: `
    @if (project; as project) {
    <section class="sp art">
      <div class="art-crumb"><a class="art-back" routerLink="/studio/content"><app-icon name="chevron-left"></app-icon>Artículos</a><span aria-hidden="true">/</span><strong>Editor de contenido</strong></div>

      <header class="art-head">
        <div class="art-head__text">
          <p class="art-overline">Espacio de trabajo editorial <span aria-hidden="true">/</span> {{ project.site.name }}</p>
          <h1 class="art-head__title">{{ project.title }}</h1>
          <p class="art-head__meta">
            <span class="sp-status" [attr.data-tone]="stageTone(project.reviewGate)"><i class="sp-dot" aria-hidden="true"></i>{{ reviewLabels[project.reviewGate.stage] }}</span>
            <span>{{ project.site.name }}</span>
            @if (project.origin === 'auto') { <span>Generado automáticamente</span> }
            @if (project.latestVersion; as version) { <span>Versión {{ version.versionNumber }}</span> }
          </p>
        </div>
        <div class="art-head__actions">
          @if (project.latestVersion) {
            <div class="sp-seg" role="group" aria-label="Mode">
              <button type="button" class="sp-seg__item" [class.is-active]="!editing" [attr.aria-pressed]="!editing" (click)="editing = false; activeTab = 'content'"><app-icon name="eye" /> Vista previa</button>
              <button type="button" class="sp-seg__item" [class.is-active]="editing" [attr.aria-pressed]="editing" (click)="editing = true; activeTab = 'content'"><app-icon name="edit" /> Editar</button>
            </div>
          }
          @if (canApprove) {
            <button class="au-btn au-btn--primary" type="button" (click)="approve()"><app-icon name="check"></app-icon>Aprobar artículo</button>
          } @else if (canPublish) {
            <button class="au-btn au-btn--primary" type="button" (click)="publish()"><app-icon name="publications"></app-icon>{{ published ? 'Republish' : 'Publish' }}</button>
          } @else if (!project.latestVersion && canGenerate) {
            <button class="au-btn au-btn--primary" type="button" (click)="generate()"><app-icon name="sparkles"></app-icon>Generate article</button>
          }
          <button class="au-btn au-btn--secondary au-btn--icon" type="button" #moreTrigger (click)="moreMenu.toggle(moreTrigger)" aria-label="More actions" aria-haspopup="menu"><app-icon name="dots"></app-icon></button>
          <app-popover #moreMenu>
            <div class="au-menu">
              @if (canApprove && canPublish) { <button class="au-menu__item" type="button" (click)="moreMenu.hide(); publish()"><app-icon name="publications"></app-icon>{{ published ? 'Republish' : 'Publish' }}</button> }
              @if (canSyncDraft) { <button class="au-menu__item" type="button" (click)="moreMenu.hide(); syncDraft()"><app-icon name="upload"></app-icon>Save to site as draft</button> }
              @if (canGenerate && project.latestVersion) { <button class="au-menu__item" type="button" (click)="moreMenu.hide(); generate()"><app-icon name="sparkles"></app-icon>Regenerate</button> }
              @if (imageNeedsRetry) { <button class="au-menu__item" type="button" (click)="moreMenu.hide(); retryImage()"><app-icon name="refresh"></app-icon>Retry image</button> }
              @if (project.latestVersion) {
                <button class="au-menu__item" type="button" (click)="moreMenu.hide(); exportHtml()"><app-icon name="arrow-down"></app-icon>Export HTML</button>
                <button class="au-menu__item" type="button" (click)="moreMenu.hide(); exportMarkdown()"><app-icon name="arrow-down"></app-icon>Export Markdown</button>
                <button class="au-menu__item" type="button" (click)="moreMenu.hide(); copyHtml()"><app-icon name="copy"></app-icon>Copy HTML</button>
              }
              <a class="au-menu__item" routerLink="/studio/calendar" [queryParams]="{ projectId: projectId }" (click)="moreMenu.hide()"><app-icon name="calendar"></app-icon>Schedule in Calendar</a>
              @if (publications.length) { <a class="au-menu__item" routerLink="/studio/results" [queryParams]="{ projectId: projectId }" (click)="moreMenu.hide()"><app-icon name="publications"></app-icon>See publications</a> }
              <button class="au-menu__item" type="button" (click)="moreMenu.hide(); refresh()"><app-icon name="refresh"></app-icon>Refresh</button>
              @if (canUnpublish) {
                <div class="au-menu__sep"></div>
                <button class="au-menu__item is-danger" type="button" (click)="moreMenu.hide(); unpublish()"><app-icon name="arrow-down"></app-icon>Unpublish</button>
              }
            </div>
          </app-popover>
        </div>
      </header>

      <ol class="art-steps" aria-label="Flujo editorial">
        @for (step of pipeline(); track step.id) {
          <li class="art-step" [class.is-done]="step.state === 'done'" [class.is-current]="step.state === 'current'" [class.is-failed]="step.state === 'failed'"
            [attr.aria-current]="step.state === 'current' || step.state === 'failed' ? 'step' : null">
            <span class="art-step__bar" aria-hidden="true"></span>
            <span class="art-step__indicator" aria-hidden="true">
              @if (step.state === 'done') { <app-icon name="check" /> }
              @else if (step.state === 'failed') { <app-icon name="warning" /> }
              @else { {{ $index + 1 }} }
            </span>
            <span class="art-step__label">{{ step.label }}@if (step.state === 'failed') { <span class="sp-meta"> · Requiere atención</span> }</span>
          </li>
        }
      </ol>

      @if (error) { <div class="au-banner au-banner--error"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ error }}</span></div> }
      @if (notice) { <div class="au-banner au-banner--success"><app-icon name="circle-check"></app-icon><span class="au-banner__text">{{ notice }}</span></div> }

      @if (project.latestVersion) {
        <nav class="art-tabs" aria-label="Secciones del artículo">
          @for (tab of tabs; track tab) {
            <button type="button" [attr.aria-pressed]="tab === activeTab" (click)="activeTab = tab">
              <app-icon [name]="tabIcons[tab]" /> {{ tabLabel(tab) }}
              @if (tab === 'social' && social.length) { <span class="art-tab-count">{{ social.length }}</span> }
            </button>
          }
        </nav>
      }

      <div class="art-grid">
        <div class="art-main">
          @if (!editing && activeTab === 'content') {
            <article class="art-canvas" aria-label="Article preview">
              @if (project.latestVersion; as version) {
                <header class="art-panel-heading">
                  <div><p class="art-overline">Artículo · {{ version.updatedAt | date: 'd MMM yyyy' }}</p><h2>Contenido del artículo</h2><p>Previsualiza el resultado final antes de aprobarlo.</p></div>
                  <div class="art-panel-heading__actions">
                    <span class="art-save-state" aria-live="polite"><app-icon name="clock" />
                      {{ saving ? 'Guardando…' : hasPendingEdits ? 'Cambios pendientes' : 'Todos los cambios guardados' }}
                    </span>
                    <button class="au-btn au-btn--secondary au-btn--sm art-ai-action" type="button" (click)="editing = true; revisionOpen = true"><app-icon name="sparkles" /> Mejorar con IA</button>
                  </div>
                </header>
                <div class="art-preview-content">
                  @if (coverUrl; as cover) {
                    <img class="art-preview-image" [src]="cover" alt="Portada del artículo" />
                  } @else {
                    <div class="art-preview-cover" aria-hidden="true">
                      <div class="art-cover-copy">
                        <span class="art-cover-site">{{ project.site.name }}@if (draftContentType === 'guide') { · Guía completa }</span>
                        <strong>{{ project.title || version.title }}</strong>
                        @if (version.excerpt) { <p>{{ version.excerpt }}</p> }
                        <span class="art-cover-symbol"><app-icon name="globe" /></span>
                      </div>
                    </div>
                  }
                  <div class="art-preview-prose">
                    <p class="art-overline">Actualizado el {{ version.updatedAt | date: 'd MMM yyyy' }}@if (readingMinutes) { · {{ readingMinutes }} min de lectura }</p>
                    <h2 class="art-canvas__title">{{ version.title }}</h2>
                    @if (version.excerpt) { <p class="art-canvas__excerpt">{{ version.excerpt }}</p> }
                    <!-- Already allowlist-sanitized server-side (html-sanitizer.ts); Angular's own pass would strip the cards' style/data-block. -->
                    <div class="art-canvas__body" [innerHTML]="trusted(version.bodyHtml)"></div>
                  </div>
                </div>
              } @else {
                <div class="au-empty">
                  <span class="au-empty__icon"><app-icon name="sparkles"></app-icon></span>
                  <p class="au-empty__title">Writing your article</p>
                  <p class="au-empty__text">This page refreshes by itself when the first version is ready.</p>
                </div>
              }
            </article>
          } @else {
            @switch (activeTab) {
              @case ('content') {
                <section class="art-card art-edit-card">
                  <header class="art-panel-heading">
                    <div><p class="art-overline">Artículo</p><h2>Contenido del artículo</h2><p>Edita el título, el extracto y el cuerpo antes de aprobarlo.</p></div>
                    <span class="art-save-state" aria-live="polite"><app-icon name="clock" /> {{ saving ? 'Guardando…' : hasPendingEdits ? 'Cambios pendientes' : 'Todos los cambios guardados' }}</span>
                  </header>
                  @if (!project.latestVersion) {
                    <p class="sp-muted">The editor opens when the first version is ready.</p>
                  } @else {
                    <div class="art-edit-fields">
                      <label class="au-field"><span class="au-field__label">Título</span><input class="au-input" type="text" [(ngModel)]="draftTitle" /></label>
                      <label class="au-field"><span class="au-field__label">Extracto</span><textarea class="au-textarea" rows="2" [(ngModel)]="draftExcerpt"></textarea></label>
                    </div>
                    <div class="au-field">
                      <span class="au-field__label">Cuerpo del artículo</span>
                      <au-rich-editor [(ngModel)]="draftBody" (ngModelChange)="bodyDirty = true" (autosave)="onAutosave()"></au-rich-editor>
                    </div>
                    <div class="art-actions">
                      <button class="au-btn au-btn--primary" type="button" [disabled]="saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
                      <button class="au-btn au-btn--secondary" type="button" [disabled]="saving" (click)="save(true)">Guardar y cerrar</button>
                      <button class="au-btn au-btn--ghost" type="button" (click)="patchDrafts(project); editing = false">Descartar cambios</button>
                    </div>
                  }
                  <details #revisionPanel class="art-ai art-section-card" [open]="revisionOpen" (toggle)="revisionOpen = revisionPanel.open">
                    <summary>Mejorar con IA</summary>
                    <textarea class="au-textarea" rows="2" placeholder="Por ejemplo, añade una sección sobre precios" [(ngModel)]="feedback" aria-label="Qué quieres mejorar"></textarea>
                    <button class="au-btn au-btn--secondary art-ai-action" type="button" [disabled]="revising" (click)="revise()"><app-icon name="sparkles"></app-icon>{{ revising ? 'Revisando…' : 'Solicitar revisión' }}</button>
                  </details>
                </section>
              }
              @case ('media') {
                <section class="art-tab-panel">
                  <header class="art-panel-heading">
                    <div><p class="art-overline">Recursos visuales</p><h2>Multimedia</h2><p>Gestiona la portada, las variantes y las imágenes integradas en el artículo.</p></div>
                    <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="generateAsset()"><app-icon name="media" /> Generar portada</button>
                  </header>
                  <div class="art-tab-body">
                    <div class="art-media-feature">
                      @if (coverUrl) { <img class="art-media-hero" [src]="coverUrl" alt="Portada del artículo" /> }
                      @else { <div class="art-media-hero art-media-placeholder"><app-icon name="media" /><strong>{{ project.title }}</strong></div> }
                      <div>
                        <p class="art-overline">Imagen principal</p><h3>Portada del artículo</h3>
                        <p class="sp-muted">{{ project.latestVersion?.image?.status === 'queued' || project.latestVersion?.image?.status === 'processing' ? 'Generando la portada…' : imageNeedsRetry ? imageError : coverUrl ? 'Imagen para acompañar la publicación del artículo.' : 'El artículo aún no tiene portada.' }}</p>
                        @if (imageNeedsRetry) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="retryImage()"><app-icon name="refresh" /> Reintentar imagen</button> }
                      </div>
                    </div>
                    @if (project.latestVersion?.assetVariants?.length) {
                      <section class="art-section-card">
                        <h3>Variantes de portada</h3>
                        <div class="art-media">
                          @for (variant of project.latestVersion?.assetVariants ?? []; track variant.id) {
                            <figure class="art-media__item">
                              @if (variant.publicUrl) { <img [src]="variant.publicUrl" [alt]="variant.kind" loading="lazy" /> }
                              <figcaption class="sp-num sp-muted">{{ variant.kind }} · {{ variant.width }}×{{ variant.height }}</figcaption>
                            </figure>
                          }
                        </div>
                      </section>
                    }
                    <section class="art-section-card">
                      <h3>Imágenes del artículo <span class="art-tab-count">{{ inlineImageCount }}/{{ INLINE_IMAGE_MIN }}</span></h3>
                      <p class="sp-muted">Objetivo editorial de {{ INLINE_IMAGE_MIN }} imágenes integradas en el contenido.</p>
                      @if (articleImages.length) {
                        <div class="art-media art-inline-media" aria-label="Imágenes insertadas en el artículo">
                          @for (image of articleImages; track $index) {
                            <figure class="art-media__item">
                              <img [src]="image.src" [alt]="image.alt" loading="lazy" />
                              <figcaption class="sp-muted">{{ image.alt || 'Imagen ' + ($index + 1) }}</figcaption>
                            </figure>
                          }
                        </div>
                      } @else {
                        <p class="sp-muted">El contenido todavía no tiene imágenes insertadas.</p>
                      }
                      @if (inlineImageCount < INLINE_IMAGE_MIN) {
                        <button class="au-btn au-btn--secondary au-btn--sm art-ai-action" type="button" (click)="generateInlineImages()"><app-icon name="sparkles" /> Generar imágenes pendientes</button>
                      }
                    </section>
                  </div>
                </section>
              }
              @case ('seo') {
                <section class="art-tab-panel">
                  <header class="art-panel-heading">
                    <div><p class="art-overline">Visibilidad en buscadores</p><h2>SEO del artículo</h2><p>Metadatos, intención de búsqueda y enlazado interno.</p></div>
                    @if (project.latestVersion) { <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="saving" (click)="save()"><app-icon name="check" />{{ saving ? 'Guardando…' : 'Guardar SEO' }}</button> }
                  </header>
                  <div class="art-tab-body">
                  @if (project.latestVersion) {
                    <div class="au-serp art-section-card art-serp-card">
                      <h3><app-icon name="search" /> Vista previa en Google</h3>
                      <p class="au-serp__title">{{ draftSeoTitle || project.latestVersion.title }}</p>
                      <p class="au-serp__url">{{ serpUrl }}</p>
                      <p class="au-serp__desc">{{ draftSeoDescription || 'Aquí se mostrará la metadescripción.' }}</p>
                    </div>
                    <section class="art-section-card" (input)="metaDirty = true" (change)="metaDirty = true">
                    <h3>Metadatos y estrategia</h3>
                    <div class="au-field-grid art-seo-fields">
                      <label class="au-field">
                        <span class="au-field__label">Título SEO</span>
                        <input class="au-input" type="text" [(ngModel)]="draftSeoTitle" />
                        <span class="au-field__hint" [class.au-hint--over]="draftSeoTitle.length > 60">{{ draftSeoTitle.length }} / 60</span>
                      </label>
                      <label class="au-field"><span class="au-field__label">Slug</span><input class="au-input" type="text" [(ngModel)]="draftSlug" /></label>
                      <label class="au-field art-field-wide"><span class="au-field__label">Metadescripción</span><textarea class="au-textarea" rows="3" [(ngModel)]="draftSeoDescription"></textarea><span class="au-field__hint" [class.au-hint--over]="draftSeoDescription.length > 160">{{ draftSeoDescription.length }} / 160</span></label>
                      <label class="au-field art-field-wide"><span class="au-field__label">URL canónica</span><input class="au-input" type="text" [(ngModel)]="draftCanonicalUrl" placeholder="https://" /></label>
                      <label class="au-field">
                        <span class="au-field__label">Intención de búsqueda</span>
                        <select class="au-select" [(ngModel)]="draftPrimaryIntent"><option value="">Sin especificar</option>@for (intent of intentOptions; track intent) { <option [value]="intent">{{ intent }}</option> }</select>
                      </label>
                      <label class="au-field">
                        <span class="au-field__label">Formato</span>
                        <select class="au-select" [(ngModel)]="draftContentType"><option value="">Sin especificar</option>@for (format of formatOptions; track format) { <option [value]="format">{{ format }}</option> }</select>
                      </label>
                      <label class="au-field"><span class="au-field__label">Palabra clave principal</span><input class="au-input" type="text" [(ngModel)]="draftPrimaryKeyword" /></label>
                      <label class="au-field"><span class="au-field__label">Consulta objetivo</span><input class="au-input" type="text" [(ngModel)]="draftTargetQuery" /></label>
                      <label class="au-field"><span class="au-field__label">Palabras clave secundarias</span><input class="au-input" type="text" [(ngModel)]="draftSecondaryKeywords" placeholder="Separadas por comas" /></label>
                      <label class="au-field"><span class="au-field__label">Clúster temático</span><input class="au-input" type="text" [(ngModel)]="draftTopicCluster" /></label>
                    </div>
                    <div class="art-actions">
                      <button class="au-btn au-btn--secondary au-btn--sm art-ai-action" type="button" (click)="aiImprove('seoTitle')"><app-icon name="sparkles" /> Mejorar título SEO</button>
                      <button class="au-btn au-btn--secondary au-btn--sm art-ai-action" type="button" (click)="aiImprove('metaDescription')"><app-icon name="sparkles" /> Mejorar metadescripción</button>
                    </div>
                    </section>
                    <section class="art-section-card">
                    <h3>Enlaces internos del sitemap</h3>
                    <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="linksLoading" (click)="loadLinkSuggestions()"><app-icon name="link" />{{ linksLoading ? 'Buscando…' : 'Sugerir enlaces internos' }}</button>
                    @if (linkSuggestions.length) {
                      <ul class="art-list">
                        @for (suggestion of linkSuggestions; track suggestion.url) {
                          <li><span><strong>{{ suggestion.title }}</strong><span class="sp-meta">{{ suggestion.url }} · {{ suggestion.reason }}</span></span><button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="insertLinkSuggestion(suggestion)">Insertar</button></li>
                        }
                      </ul>
                    } @else if (linksChecked) {
                      <p class="sp-muted">No hay páginas del sitio que coincidan con la palabra clave.</p>
                    }
                    </section>
                  } @else {
                    <p class="sp-muted">Genera el artículo para editar el SEO de su última versión.</p>
                  }
                  </div>
                </section>
              }
              @case ('social') {
                <section class="art-tab-panel">
                  <header class="art-panel-heading">
                    <div><p class="art-overline">Distribución social</p><h2>Publicaciones para redes</h2><p>Genera, revisa y aprueba piezas específicas para cada canal.</p></div>
                    <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="socialGenerating || (!socialChannels.x && !socialChannels.instagram)" (click)="generateSocial()"><app-icon name="sparkles" />{{ socialGenerating ? 'Generando…' : 'Generar publicaciones' }}</button>
                  </header>
                  <div class="art-tab-body">
                  <div class="art-section-card art-social-config">
                    <div><strong>Plataformas</strong>
                      <div class="art-actions art-platform-options">
                        <label><input type="checkbox" [(ngModel)]="socialChannels.x" /> X</label>
                        <label><input type="checkbox" [(ngModel)]="socialChannels.instagram" /> Instagram</label>
                      </div>
                    </div>
                    <label class="au-field"><span class="au-field__label">Longitud del hilo de X</span>
                      <select class="au-select" [(ngModel)]="socialThreadLength" [disabled]="!socialChannels.x">
                        <option [ngValue]="1">Publicación individual</option><option [ngValue]="2">2 publicaciones</option><option [ngValue]="3">3 publicaciones</option><option [ngValue]="5">5 publicaciones</option>
                      </select>
                    </label>
                  </div>
                  @for (piece of social; track piece.id) {
                    <article class="art-social art-section-card">
                      <header class="art-social__head">
                        <span class="art-social-logo" [class.art-social-logo--instagram]="piece.channel === 'instagram'">
                          @if (piece.channel === 'facebook') { <app-icon name="share" /> }
                          @else { <svg aria-hidden="true" viewBox="0 0 24 24"><use [attr.href]="'/social-studio-icons.svg#soc-logo-' + piece.channel" /></svg> }
                        </span>
                        <strong>{{ piece.channel === 'x' ? 'X' : (piece.channel | titlecase) }}@if (piece.threadPosition !== null) { · publicación {{ piece.threadPosition + 1 }} }</strong>
                        <span class="sp-status" [attr.data-tone]="piece.editorialStatus === 'approved' ? 'success' : piece.editorialStatus === 'rejected' ? 'danger' : 'warning'"><i class="sp-dot" aria-hidden="true"></i>{{ piece.editorialStatus === 'approved' ? 'Aprobada' : piece.editorialStatus === 'rejected' ? 'Rechazada' : 'Borrador' }}</span>
                        @if (piece.contentType !== 'x_thread' || piece.threadPosition !== null) {
                          <span class="sp-num" [class.art-over]="isOverLimit(piece)">{{ piece.characterCount ?? 0 }}/{{ limitFor(piece) }}</span>
                        }
                      </header>
                      <textarea class="au-textarea" rows="3" [ngModel]="piece.body" (ngModelChange)="updateSocialBody(piece, $event)" [attr.aria-label]="'Texto de ' + piece.channel"></textarea>
                      <footer class="art-actions art-social-footer">
                        <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="regenerateSocialPiece(piece)"><app-icon name="refresh" /> Reescribir</button>
                        <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="saveSocialPiece(piece)">Guardar</button>
                        <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="approveSocial(piece)"><app-icon name="circle-check" /> Aprobar</button>
                      </footer>
                    </article>
                  } @empty {
                    <p class="sp-muted">Todavía no hay publicaciones para este artículo.</p>
                  }
                  </div>
                </section>
              }
              @case ('schedule') {
                <section class="art-tab-panel">
                  <header class="art-panel-heading">
                    <div><p class="art-overline">Planificación y destinos</p><h2>Programación</h2><p>Consulta los destinos y gestiona las acciones de publicación.</p></div>
                    <a class="au-btn au-btn--primary au-btn--sm" routerLink="/studio/calendar" [queryParams]="{ projectId: projectId }"><app-icon name="calendar" /> Abrir calendario</a>
                  </header>
                  <div class="art-tab-body">
                    <div class="art-schedule-banner">
                      <span class="art-schedule-icon"><app-icon name="calendar" /></span>
                      <div><h3>Publicación del artículo</h3><p>Organiza las fechas en Calendario y consulta el estado de cada destino aquí.</p></div>
                    </div>
                  @if (publications.length) {
                    <ul class="art-list art-destinations">
                      @for (publication of publications; track publication.id) {
                        <li>
                          <span><strong>{{ destinationLabel(publication) }}</strong><span class="sp-meta">{{ publication.scheduledFor ? (publication.scheduledFor | date: 'medium') : 'Sin fecha programada' }}</span>
                            @if (publication.lastError) { <span class="sp-meta sp-meta--danger">{{ publication.lastError }}</span> }</span>
                          <span class="sp-status" [attr.data-tone]="pubTone(publication.status)"><i class="sp-dot" aria-hidden="true"></i>{{ publication.status }}</span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <div class="art-section-card"><h3>Destinos de publicación</h3><p class="sp-muted">El artículo todavía no tiene publicaciones web programadas.</p></div>
                  }
                  <div class="art-actions">
                    @if (canPublish) { <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="publish()"><app-icon name="publications" />{{ published ? 'Republicar' : 'Publicar ahora' }}</button> }
                    @if (canSyncDraft) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="syncDraft()"><app-icon name="upload" /> Sincronizar borrador</button> }
                    @if (publications.length) { <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/results" [queryParams]="{ projectId: projectId }">Ver en Resultados</a> }
                  </div>
                  </div>
                </section>
              }
              @case ('history') {
                <section class="art-tab-panel">
                  <header class="art-panel-heading">
                    <div><p class="art-overline">Control de cambios</p><h2>Historial de versiones</h2><p>Revisa cada versión del artículo antes de continuar.</p></div>
                    <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="refresh()"><app-icon name="refresh" /> Actualizar historial</button>
                  </header>
                  <div class="art-tab-body art-history-layout">
                  <ul class="art-versions">
                    @for (version of project.versions; track version.id) {
                      <li>
                        <button type="button" class="art-version" [attr.aria-pressed]="version.id === (selectedVersionId ?? project.versions[0].id)" (click)="selectVersion(version)">
                          <span class="art-version-number">v{{ version.versionNumber }}</span>
                          <span><strong>{{ version.title }}</strong><small>{{ version.updatedAt | date: 'short' }}</small></span>
                        </button>
                      </li>
                    }
                  </ul>
                  @if (selectedVersion ?? project.versions[0]; as version) {
                    <div class="art-section-card art-version-preview"><p class="art-overline">Versión {{ version.versionNumber }}</p><h3>{{ version.title }}</h3><p class="sp-muted">{{ version.updatedAt | date: 'medium' }}</p><pre class="au-diff">{{ version.bodyHtml }}</pre></div>
                  } @else {
                    <p class="sp-muted">Todavía no hay versiones del artículo.</p>
                  }
                  </div>
                </section>
              }
            }
          }
        </div>

        <aside class="art-rail" aria-label="Article panel">
          <header class="art-rail-heading">
            <div><p class="art-overline">Panel de control</p><h2>Estado del artículo</h2></div>
            <a class="au-btn au-btn--secondary au-btn--icon art-ai-action" routerLink="/studio/settings/writing" aria-label="Configurar próximos artículos"><app-icon name="settings" /></a>
          </header>

          <section class="art-box" aria-labelledby="art-checks">
            <button type="button" class="art-box__toggle" (click)="checksOpen = !checksOpen" [attr.aria-expanded]="checksOpen" aria-controls="art-checks-list">
              <span class="art-check-icon"><app-icon [name]="checklist.length && checklistPassed === checklist.length ? 'circle-check' : 'scan'" /></span>
              <span id="art-checks" class="art-box__title">{{ canApprove ? 'Preparado para buscadores' : 'Preparación para buscadores' }}
                <small>{{ checklist.length ? checklistPassed + ' de ' + checklist.length + ' comprobaciones superadas' : 'Pendiente de comprobación' }}</small>
              </span>
              <app-icon [name]="checksOpen ? 'chevron-up' : 'chevron-down'"></app-icon>
            </button>
            @if (checklist.length) {
              <div class="art-editorial-score"><strong>{{ (checklistPassed / checklist.length * 100) | number:'1.0-0' }}%</strong><span>Calidad editorial</span></div>
              <span class="art-bar art-quality-fill" aria-hidden="true"><i [style.width.%]="checklistPassed / checklist.length * 100"></i></span>
            }
            @if (checksOpen) {
              <ul class="art-checks" id="art-checks-list">
                @for (issue of blockingIssues; track issue.message) {
                  <li class="is-fail"><app-icon name="circle-x"></app-icon><span>{{ issue.message }}</span></li>
                }
                @for (item of checklist; track item.key) {
                  <li [class.is-fail]="!item.passed" [title]="item.detail"><app-icon [name]="item.passed ? 'circle-check' : 'warning'"></app-icon><span>{{ item.label }}<span class="sp-meta">{{ item.detail }}</span></span></li>
                }
              </ul>
              @if (canFixWithAi) { <button class="au-btn au-btn--secondary au-btn--sm art-box__btn art-ai-action" type="button" (click)="fixWithAi()"><app-icon name="sparkles"></app-icon>Corregir con IA</button> }
            }
          </section>

          <section class="art-box">
            <h2 class="art-label">URL publicada</h2>
            @if (project.latestPublicationJob?.externalUrl) {
              <a class="art-url" [href]="externalLink" target="_blank" rel="noopener" [title]="externalLink"><i class="sp-dot" data-tone="success" aria-hidden="true"></i><span>{{ externalLink }}</span><app-icon name="external"></app-icon></a>
            } @else {
              <p class="sp-muted art-tight">Aún no publicado · <a class="au-link" routerLink="/studio/calendar" [queryParams]="{ projectId: projectId }">Programar</a></p>
            }
          </section>

          @if (project.latestVersion) {
            <section class="art-box">
              <h2 class="art-label">Datos del artículo</h2>
              <div class="art-kw">
                <span class="sp-muted">Palabra clave objetivo</span>
                <strong>{{ draftPrimaryKeyword || '—' }}</strong>
                <div class="art-kw__metrics">
                  <span><span class="sp-muted">Búsquedas/mes</span><b class="sp-num">{{ project.keywordMetrics?.searchVolume != null ? (project.keywordMetrics!.searchVolume | number) : '—' }}</b></span>
                  <span><span class="sp-muted">Dificultad</span><b class="sp-num">{{ project.keywordMetrics?.keywordDifficulty ?? '—' }}</b>
                    @if (difficultyWord(project.keywordMetrics?.keywordDifficulty); as word) { <em class="art-chip" [attr.data-tone]="word.tone"><i class="sp-dot" aria-hidden="true"></i>{{ word.label }}</em> }</span>
                </div>
              </div>
              <ul class="art-stats">
                @for (stat of stats; track stat.label) {
                  <li [title]="stat.title"><app-icon [name]="stat.icon"></app-icon><span>{{ stat.label }}</span><b class="sp-num">{{ stat.value }}</b><i class="sp-dot" [attr.data-tone]="stat.ok ? 'success' : 'warning'" [attr.aria-label]="stat.ok ? 'meets target' : 'below target'"></i></li>
                }
              </ul>
            </section>

            <section class="art-box">
              <h2 class="art-label">URL y metadatos</h2>
              <label class="art-label" for="art-slug">Slug</label>
              <input class="au-input" id="art-slug" [(ngModel)]="draftSlug" (ngModelChange)="metaDirty = true" placeholder="article-slug" />
              <span class="art-hint" [class.is-over]="draftSlug.length > 60">{{ draftSlug.length }}/60</span>
              <label class="art-label" for="art-meta">Metadescripción <span class="sp-num" [class.art-ok]="metaOk" [class.art-warn]="!metaOk">{{ draftSeoDescription.length }}/160</span></label>
              <textarea class="au-textarea" id="art-meta" rows="4" [(ngModel)]="draftSeoDescription" (ngModelChange)="metaDirty = true"></textarea>
              <span class="art-bar" aria-hidden="true"><i [style.width.%]="metaPercent" [class.art-ok]="metaOk"></i></span>
              @if (metaDirty) { <button class="au-btn au-btn--primary au-btn--sm art-box__btn" type="button" [disabled]="saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar metadatos' }}</button> }
            </section>

            <section class="art-box">
              <h2 class="art-label">Portada</h2>
              @if (coverUrl) { <img class="art-cover" [src]="coverUrl" alt="Portada del artículo" /> } @else { <p class="sp-muted art-tight">Todavía no hay portada</p> }
              @if (coverUrl && project.latestVersion?.image?.metadataStripped) { <p class="art-badge" title="EXIF, XMP and C2PA metadata were removed before storing the image"><app-icon name="check"></app-icon>No AI watermark metadata</p> }
              <button class="au-btn au-btn--secondary au-btn--sm art-box__btn" type="button" (click)="generateAsset()"><app-icon name="refresh"></app-icon>{{ coverUrl ? 'Reemplazar portada' : 'Generar portada' }}</button>
            </section>

            @if (whyThisTopic) {
              <details class="art-box art-why"><summary class="art-label">¿Por qué este tema?</summary><p class="sp-muted">{{ whyThisTopic }}</p></details>
            }
          }
        </aside>
      </div>
    </section>
    } @else {
      <div class="au-boot"><span class="au-spinner" aria-label="Loading"></span></div>
    }
  `,
})
export class ContentWorkspacePageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly domSanitizer = inject(DomSanitizer);
  private readonly document = inject(DOCUMENT);
  private trustedCache: { html: string; safe: SafeHtml } | null = null;
  private articleImagesCache?: { html: string; images: Array<{ src: string; alt: string }> };

  /** The stored body (server-sanitized) as trusted HTML, cached so change detection does not re-render it. */
  trusted(html: string | null | undefined): SafeHtml {
    const value = html ?? '';
    if (this.trustedCache?.html !== value) this.trustedCache = { html: value, safe: this.domSanitizer.bypassSecurityTrustHtml(value) };
    return this.trustedCache.safe;
  }

  project: StudioProjectDetailView | null = null;
  activeTab: WorkspaceTab = 'content';
  /** The article opens as a preview. */
  editing = false;
  revisionOpen = false;
  tabs: WorkspaceTab[] = ['content', 'media', 'seo', 'social', 'schedule', 'history'];
  readonly tabIcons = { content: 'content', media: 'media', seo: 'search', social: 'share', schedule: 'calendar', history: 'history' } as const;
  error = '';
  notice = '';
  saving = false;
  revising = false;
  feedback = '';
  selectedVersionId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // Social tab state.
  socialChannels = { x: true, instagram: true };
  socialThreadLength = 1;
  socialGenerating = false;
  socialDrafts: Record<string, string> = {};

  get social(): StudioSocialContent[] {
    return this.project?.socialContents ?? [];
  }

  get publications(): ProjectPublication[] {
    const list = this.project?.publications ?? [];
    return list.filter((publication) => publication.channel === 'website' && publication.status !== 'deleted') as ProjectPublication[];
  }

  draftTitle = '';
  draftExcerpt = '';
  draftBody = '';
  draftSeoTitle = '';
  draftSeoDescription = '';
  draftSlug = '';
  draftCanonicalUrl = '';
  draftPrimaryIntent = '';
  draftContentType = '';
  draftTargetQuery = '';
  draftPrimaryKeyword = '';
  draftSecondaryKeywords = '';
  draftTopicCluster = '';
  bodyDirty = false;
  linkSuggestions: InternalLinkSuggestion[] = [];
  linksLoading = false;
  linksChecked = false;
  intentOptions = ['informational', 'navigational', 'commercial-investigation', 'transactional', 'comparison', 'news', 'entertainment-discovery', 'where-to-watch', 'sports-live', 'mixed'];
  formatOptions = ['guide', 'news', 'ranking', 'comparison', 'analysis', 'explainer', 'tutorial', 'faq', 'review', 'preview', 'match-preview', 'match-report', 'schedule', 'where-to-watch', 'streaming-recommendation', 'evergreen-pillar', 'cluster-article'];

  checksOpen = false;
  metaDirty = false;
  private checksOpenedOnce = false;

  get blockingIssues(): Array<{ message: string }> {
    return (this.project?.reviewGate.issues ?? []).filter((issue) => issue.severity === 'blocking');
  }

  /** 140–160 characters reads complete in search results without being cut. */
  get metaOk(): boolean {
    const length = this.draftSeoDescription.length;
    return length >= 140 && length <= 160;
  }

  get metaPercent(): number {
    return Math.min(100, Math.round((this.draftSeoDescription.length / 160) * 100));
  }

  difficultyWord(difficulty: number | null | undefined): { label: string; tone: string } | null {
    if (difficulty == null) return null;
    if (difficulty < 30) return { label: 'Easy', tone: 'success' };
    if (difficulty < 50) return { label: 'Medium', tone: 'warning' };
    return { label: difficulty < 70 ? 'Hard' : 'Very hard', tone: 'danger' };
  }

  private get keywordList(): string[] {
    const list = [this.draftPrimaryKeyword, ...this.draftSecondaryKeywords.split(',')].map((keyword) => keyword.trim()).filter(Boolean);
    return [...new Set(list)];
  }

  /** Article data rows: measured from the current draft, compared with the targets the article is held to. */
  get stats(): Array<{ icon: 'content' | 'search' | 'media' | 'link' | 'external'; label: string; value: string | number; ok: boolean; title: string }> {
    const targets = this.project?.articleTargets;
    const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const text = fold(this.draftBody.replace(/<[^>]+>/g, ' '));
    const keywords = this.keywordList;
    const present = keywords.filter((keyword) => text.includes(fold(keyword)));
    const host = hostOf(this.project?.site.baseUrl ?? '');
    const hrefs = [...this.draftBody.matchAll(/<a\s[^>]*href="([^"]+)"/gi)].map((match) => match[1]);
    const internal = hrefs.filter((href) => href.startsWith('/') || (host && hostOf(href) === host)).length;
    const external = hrefs.filter((href) => /^https?:/i.test(href) && hostOf(href) !== host).length;
    const images = this.inlineImageCount + (this.coverUrl ? 1 : 0);
    const minWords = targets ? Math.round(targets.words * 0.87) : 0;
    return [
      { icon: 'content', label: 'Word count', value: this.wordCount.toLocaleString('en-US'), ok: this.wordCount >= minWords, title: targets ? `Target ${minWords.toLocaleString('en-US')}+ words` : '' },
      { icon: 'search', label: 'Keywords', value: `${present.length}/${keywords.length}`, ok: keywords.length > 0 && present.length === keywords.length, title: keywords.length ? `In the text: ${present.join(', ') || 'none'}. Planned: ${keywords.join(', ')}` : 'No keywords planned' },
      { icon: 'media', label: 'Images', value: images, ok: images >= (targets?.images ?? this.INLINE_IMAGE_MIN), title: `Target ${targets?.images ?? this.INLINE_IMAGE_MIN}, cover included` },
      { icon: 'link', label: 'Internal links', value: internal, ok: internal >= (targets?.internalLinks ?? 0), title: `Target ${targets?.internalLinks ?? 0}` },
      { icon: 'external', label: 'External links', value: external, ok: external >= (targets?.externalLinks ?? 0), title: `Target ${targets?.externalLinks ?? 0}` },
    ];
  }

  pubTone(status: string): string {
    if (status === 'published' || status === 'draft_synced') return 'success';
    if (status === 'failed' || status === 'canceled') return 'danger';
    return ['scheduled', 'queued', 'publishing', 'processing'].includes(status) ? 'warning' : 'muted';
  }

  /** Standalone HTML file of the current draft (title, meta description, body). */
  exportHtml(): void {
    const title = this.draftTitle || this.project?.title || 'Article';
    const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const html = `<!doctype html>\n<html lang="${this.project?.primaryLanguage ?? 'es'}">\n<head>\n<meta charset="utf-8">\n<title>${escape(this.draftSeoTitle || title)}</title>\n<meta name="description" content="${escape(this.draftSeoDescription)}">\n</head>\n<body>\n<h1>${escape(title)}</h1>\n${this.draftBody}\n</body>\n</html>\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    link.download = `${this.draftSlug || 'article'}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /** Markdown file of the current draft (title as H1, then the body). */
  exportMarkdown(): void {
    const title = this.draftTitle || this.project?.title || 'Article';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`# ${title}

${htmlToMarkdown(this.draftBody)}`], { type: 'text/markdown' }));
    link.download = `${this.draftSlug || 'article'}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  copyHtml(): void {
    navigator.clipboard.writeText(this.draftBody).then(
      () => this.toast.success('Article HTML copied.'),
      () => this.toast.error('The HTML could not be copied.'),
    );
  }

  /** The 10 checks QA v2 stores for the latest version (absent on reports from before M4). */
  get checklist(): Array<{ key: string; label: string; passed: boolean; detail: string }> {
    const report = this.project?.latestVersion?.qaReport as { checklist?: Array<{ key: string; label: string; passed: boolean; detail: string }> } | null;
    return report?.checklist ?? [];
  }

  get checklistPassed(): number {
    return this.checklist.filter((item) => item.passed).length;
  }

  /** The plan item's rationale, copied to the project when the plan item was produced. */
  get whyThisTopic(): string | null {
    const value = (this.project?.metadata as Record<string, unknown> | undefined)?.['rationale'];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  get serpUrl(): string {
    const base = String(this.project?.site.baseUrl ?? 'https://example.com').replace(/\/$/, '');
    const slug = this.draftSlug || (this.project?.title ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${base}/${slug}`;
  }

  get published(): boolean {
    return this.project?.reviewGate.stage === 'published';
  }

  get canGenerate(): boolean {
    const stage = this.project?.reviewGate.stage;
    return Boolean(
      this.project &&
        stage !== 'publish_queued' &&
        stage !== 'published' &&
        this.project.versions.length === 0 ? true : this.project !== null && stage !== 'publish_queued',
    );
  }

  get canApprove(): boolean {
    return Boolean(this.project?.reviewGate.approvalReady);
  }

  get canSyncDraft(): boolean {
    return Boolean(this.project?.reviewGate.publishReady && !this.published);
  }

  get canPublish(): boolean {
    return Boolean(this.project?.reviewGate.publishReady && this.project?.reviewGate.stage !== 'publish_queued');
  }

  get canUnpublish(): boolean {
    return Boolean(this.project?.latestPublicationJob?.externalId && this.published);
  }

  get canFixWithAi(): boolean {
    return Boolean(this.project && this.project.versions.length > 0 && (this.project.reviewGate.blockerCount > 0 || this.checklist.some((item) => !item.passed)));
  }

  get coverUrl(): string | null {
    const version = this.project?.latestVersion;
    return version?.assetVariants?.find((variant) => variant.kind === 'hero' && variant.publicUrl)?.publicUrl
      || version?.assetUrl || version?.assetVariants?.find((variant) => variant.publicUrl)?.publicUrl || null;
  }

  get wordCount(): number {
    return this.draftBody.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  }

  get readingMinutes(): number {
    const text = this.project?.latestVersion?.bodyHtml?.replace(/<[^>]+>/g, ' ').trim();
    return text ? Math.ceil(text.split(/\s+/).length / 220) : 0;
  }

  get hasPendingEdits(): boolean {
    const version = this.project?.latestVersion;
    return Boolean(this.bodyDirty || this.metaDirty || (version &&
      (this.draftTitle !== version.title || this.draftExcerpt !== (version.excerpt ?? '') ||
        this.draftSeoTitle !== (version.seoTitle ?? '') || this.draftSeoDescription !== (version.seoDescription ?? ''))));
  }

  readonly INLINE_IMAGE_MIN = 3;
  private inlineImagesPending = false;

  get inlineImageCount(): number {
    return (this.draftBody.match(/<img[^>]*>/gi) ?? []).length;
  }

  get articleImages(): Array<{ src: string; alt: string }> {
    const html = this.draftBody;
    if (this.articleImagesCache?.html === html) return this.articleImagesCache.images;
    const template = this.document.createElement('template');
    template.innerHTML = html;
    const images = Array.from(template.content.querySelectorAll('img[src]')).flatMap((image) => {
      const src = image.getAttribute('src')?.trim();
      return src ? [{ src, alt: image.getAttribute('alt')?.trim() ?? '' }] : [];
    });
    this.articleImagesCache = { html, images };
    return images;
  }

  get imageNeedsRetry(): boolean {
    const image = this.project?.latestVersion?.image;
    return Boolean(image && (image.status === 'failed' || image.status === 'retryable'));
  }

  get imageError(): string {
    return this.project?.latestVersion?.image?.error || 'Image generation failed.';
  }

  get selectedVersion(): ProjectVersionDetail | null {
    return this.project?.versions.find((version) => version.id === this.selectedVersionId) ?? null;
  }

  get externalLink(): string {
    const url = this.project?.latestPublicationJob?.externalUrl ?? '';
    if (url.startsWith('http')) {
      return url;
    }
    return `${this.project?.site.baseUrl ?? ''}${url.startsWith('/') ? '' : '/'}${url}`.replace(/\/$/, '');
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.stopPolling());
    this.load();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  get projectId(): string {
    return this.route.snapshot.paramMap.get('id') || '';
  }

  load(): void {
    this.api.getProject(this.projectId).subscribe({
      next: (project) => {
        this.project = project;
        this.patchDrafts(project);
        if (!this.checksOpenedOnce && (this.checklist.length || this.blockingIssues.length)) {
          this.checksOpen = true;
          this.checksOpenedOnce = true;
        }
        if (this.isWorkInFlight(project)) {
          this.startPolling();
        }
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  refresh(): void {
    this.load();
  }

  patchDrafts(project: StudioProjectDetailView): void {
    const version = project.latestVersion;
    this.draftTitle = version?.title ?? project.title;
    this.draftExcerpt = version?.excerpt ?? '';
    this.draftBody = version?.bodyHtml ?? '';
    this.draftSeoTitle = version?.seoTitle ?? '';
    this.draftSeoDescription = version?.seoDescription ?? '';
    const metadata = project.metadata ?? {};
    this.draftSlug = strOf(metadata['slug']);
    this.draftCanonicalUrl = strOf(metadata['canonicalUrl']);
    this.draftPrimaryIntent = strOf(metadata['primaryIntent']);
    this.draftContentType = strOf(metadata['contentType']);
    this.draftTargetQuery = strOf(metadata['targetQuery']);
    this.draftPrimaryKeyword = strOf(metadata['primaryKeyword']);
    this.draftTopicCluster = strOf(metadata['topicCluster']);
    this.draftSecondaryKeywords = Array.isArray(metadata['secondaryKeywords']) ? (metadata['secondaryKeywords'] as unknown[]).filter((entry): entry is string => typeof entry === 'string').join(', ') : strOf(metadata['secondaryKeywords']);
    this.bodyDirty = false;
    this.metaDirty = false;
  }

  private isWorkInFlight(project: StudioProjectDetailView): boolean {
    const imageStatus = project.latestVersion?.image?.status;
    if (imageStatus === 'queued' || imageStatus === 'processing') {
      return true;
    }
    if (this.inlineImagesPending && (project.latestVersion?.bodyHtml?.match(/<img[^>]*>/gi) ?? []).length < this.INLINE_IMAGE_MIN) {
      return true;
    }
    return ['awaiting_generation', 'publish_queued'].includes(project.reviewGate.stage);
  }

  private startPolling(): void {
    this.stopPolling();
    let attempts = 0;
    this.pollTimer = setInterval(() => {
      attempts += 1;
      if (attempts > 60) {
        this.stopPolling();
        this.notice = 'Polling stopped. Use Refresh to check the latest state.';
        return;
      }
      this.api.getProject(this.projectId).subscribe({
        next: (project) => {
          this.project = project;
          this.patchDrafts(project);
          if (!this.isWorkInFlight(project)) {
            this.stopPolling();
          }
        },
        error: (err) => {
          this.stopPolling();
          this.error = this.describe(err);
        },
      });
    }, 4000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  save(closeAfter = false): void {
    const version = this.project?.latestVersion;
    if (!version) {
      return;
    }
    this.saving = true;
    this.notice = '';
    this.error = '';
    this.api
      .updateVersionContent(version.id, {
        title: this.draftTitle,
        excerpt: this.draftExcerpt,
        bodyHtml: this.draftBody,
        seoTitle: this.draftSeoTitle,
        seoDescription: this.draftSeoDescription,
      })
      .subscribe({
        next: () => {
          this.saveStrategyMetadata(closeAfter);
        },
        error: (err) => {
          this.saving = false;
          this.error = this.describe(err);
        },
      });
  }

  private saveStrategyMetadata(closeAfter: boolean): void {
    const current = this.project?.metadata ?? {};
    const merged = {
      ...current,
      slug: this.draftSlug || undefined,
      canonicalUrl: this.draftCanonicalUrl || undefined,
      primaryIntent: this.draftPrimaryIntent || undefined,
      contentType: this.draftContentType || undefined,
      targetQuery: this.draftTargetQuery || undefined,
      primaryKeyword: this.draftPrimaryKeyword || undefined,
      topicCluster: this.draftTopicCluster || undefined,
      secondaryKeywords: this.draftSecondaryKeywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
    };
    this.api.updateProject(this.projectId, { metadata: merged }).subscribe({
      next: () => {
        this.saving = false;
        this.bodyDirty = false;
        if (closeAfter) this.editing = false;
        this.notice = 'Saved. Quality checks refreshed.';
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.describe(err);
      },
    });
  }

  onAutosave(): void {
    if (!this.bodyDirty) return;
    this.bodyDirty = false;
    const version = this.project?.latestVersion;
    if (!version) return;
    this.api.updateVersionContent(version.id, {
      title: this.draftTitle,
      excerpt: this.draftExcerpt,
      bodyHtml: this.draftBody,
      seoTitle: this.draftSeoTitle,
      seoDescription: this.draftSeoDescription,
    }).subscribe({
      next: () => {
        this.notice = 'Autosaved.';
      },
      error: () => {
        this.bodyDirty = true;
      },
    });
  }

  aiImprove(kind: 'seoTitle' | 'metaDescription' | 'outline' | 'introduction' | 'conclusion' | 'faqs' | 'readability' | 'internalLinks'): void {
    const prompts: Record<string, string> = {
      seoTitle: 'Improve the SEO title: make it compelling, under 70 characters, and include the primary keyword naturally.',
      metaDescription: 'Improve the meta description: 110-165 characters, include the primary keyword and a clear value proposition.',
      outline: 'Suggest a stronger H2/H3 outline that covers the target query and search intent, keeping the current angle.',
      introduction: 'Improve the introduction: hook the reader, state the value and include the primary keyword naturally. Do not rewrite the rest of the article.',
      conclusion: 'Improve the conclusion: summarize the main points and add a clear next step. Do not rewrite the rest of the article.',
      faqs: 'Add a FAQ section with 4-5 relevant questions and concise answers, using only information present in the article.',
      readability: 'Improve readability: shorten long paragraphs, add a list or table where useful, and avoid filler. Keep the meaning and structure.',
      internalLinks: 'Add the suggested internal links from the SEO workspace with natural anchors, only where they fit contextually.',
    };
    this.feedback = prompts[kind];
    this.revise();
  }

  loadLinkSuggestions(): void {
    if (!this.project) return;
    this.linksLoading = true;
    this.linksChecked = true;
    this.api.suggestInternalLinks(this.project.site.id, {
      keyword: this.draftPrimaryKeyword || undefined,
      topic: this.draftTopicCluster || undefined,
      q: this.draftTargetQuery || undefined,
      limit: 6,
    }).subscribe({
      next: (response) => {
        this.linksLoading = false;
        this.linkSuggestions = response.items;
      },
      error: () => {
        this.linksLoading = false;
        this.linkSuggestions = [];
      },
    });
  }

  insertLinkSuggestion(suggestion: InternalLinkSuggestion): void {
    const linkHtml = `<p><a href="${suggestion.url}">${suggestion.anchor}</a></p>`;
    this.draftBody = this.draftBody ? `${this.draftBody.trim()}\n${linkHtml}` : linkHtml;
    this.bodyDirty = true;
    this.notice = 'Link inserted. Remember to save.';
  }

  generate(): void {
    this.api.generateProject(this.projectId).subscribe({
      next: () => {
        this.notice = 'Generation queued.';
        this.load();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  generateAsset(): void {
    const versionId = this.project?.latestVersion?.id;
    this.api.generateAsset(this.projectId, versionId).subscribe({
      next: () => {
        this.notice = 'Image generation queued.';
        this.load();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  generateInlineImages(): void {
    const versionId = this.project?.latestVersion?.id;
    this.api.generateAsset(this.projectId, versionId, 'inline').subscribe({
      next: () => {
        this.notice = 'Images queued. They appear in the article as each one finishes.';
        this.inlineImagesPending = true;
        this.startPolling();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  retryImage(): void {
    const imageId = this.project?.latestVersion?.image?.id;
    if (!imageId) {
      return;
    }
    this.api.retryImage(imageId).subscribe({
      next: () => {
        this.notice = 'Image retry queued.';
        this.startPolling();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  approve(): void {
    this.api.approveProject(this.projectId).subscribe({
      next: () => {
        this.notice = 'Version approved.';
        this.load();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  revise(): void {
    if (this.feedback.trim().length < 8) {
      this.error = 'Describe the improvement in at least 8 characters.';
      return;
    }
    this.revising = true;
    this.api.reviseProject(this.projectId, this.feedback.trim()).subscribe({
      next: () => {
        this.revising = false;
        this.feedback = '';
        this.notice = 'AI revision queued.';
        this.load();
      },
      error: (err) => {
        this.revising = false;
        this.error = this.describe(err);
      },
    });
  }

  fixWithAi(): void {
    const concern = this.project?.reviewGate.primaryConcern ?? 'fix the blocking issues';
    this.feedback = concern;
    this.revise();
  }

  syncDraft(): void {
    this.api
      .publishProject(this.projectId, { action: 'update', targetStatus: 'draft' })
      .subscribe({
        next: () => {
          this.notice = 'Draft sync queued.';
          this.load();
        },
        error: (err) => {
          this.error = this.describe(err);
        },
      });
  }

  publish(): void {
    this.api
      .publishProject(this.projectId, { action: 'publish', targetStatus: 'publish' })
      .subscribe({
        next: () => {
          this.notice = 'Publication queued.';
          this.load();
        },
        error: (err) => {
          this.error = this.describe(err);
        },
      });
  }

  unpublish(): void {
    this.api
      .publishProject(this.projectId, { action: 'unpublish', targetStatus: 'publish' })
      .subscribe({
        next: () => {
          this.notice = 'Unpublish queued.';
          this.load();
        },
        error: (err) => {
          this.error = this.describe(err);
        },
      });
  }

  selectVersion(version: ProjectVersionDetail): void {
    this.selectedVersionId = this.selectedVersionId === version.id ? null : version.id;
  }

  tabLabel(tab: WorkspaceTab): string {
    switch (tab) {
      case 'content':
        return 'Contenido';
      case 'media':
        return 'Multimedia';
      case 'seo':
        return 'SEO';
      case 'social':
        return 'Redes sociales';
      case 'schedule':
        return 'Programación';
      case 'history':
        return 'Historial';
    }
  }

  // ── Social tab actions ──

  generateSocial(): void {
    const channels = [
      ...(this.socialChannels.x ? (['x'] as const) : []),
      ...(this.socialChannels.instagram ? (['instagram'] as const) : []),
    ];
    if (channels.length === 0) {
      this.error = 'Select at least one channel.';
      return;
    }
    this.socialGenerating = true;
    this.api.generateSocial(this.projectId, { channels, threadLength: this.socialThreadLength }).subscribe({
      next: () => {
        this.socialGenerating = false;
        this.notice = 'Social generation queued.';
        this.startPolling();
      },
      error: (err) => {
        this.socialGenerating = false;
        this.error = this.describe(err);
      },
    });
  }

  updateSocialBody(piece: StudioSocialContent, body: string): void {
    this.socialDrafts[piece.id] = body;
  }

  saveSocialPiece(piece: StudioSocialContent): void {
    const body = this.socialDrafts[piece.id];
    this.api.updateSocial(piece.id, body === undefined ? {} : { body }).subscribe({
      next: () => {
        this.notice = 'Social copy saved.';
        this.load();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  regenerateSocialPiece(piece: StudioSocialContent): void {
    this.api.regenerateSocial(piece.id).subscribe({
      next: () => {
        this.notice = 'Regeneration queued.';
        this.startPolling();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  approveSocial(piece: StudioSocialContent): void {
    this.api.updateSocial(piece.id, { body: this.socialDrafts[piece.id], editorialStatus: 'approved' }).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  isOverLimit(piece: StudioSocialContent): boolean {
    const count = piece.characterCount ?? 0;
    return count > this.limitFor(piece);
  }

  limitFor(piece: StudioSocialContent): number {
    return piece.channel === 'x' ? 280 : piece.channel === 'facebook' ? 63206 : 2200;
  }

  // ── Schedule tab actions ──

  destinationLabel(publication: ProjectPublication): string {
    if (publication.channel === 'website') {
      return publication.site?.name ?? 'Website';
    }
    return publication.account?.displayName ?? publication.channel;
  }

  private describe(err: unknown): string {
    const body = (err as { error?: { message?: string } })?.error;
    return body?.message ? String(body.message) : 'Request failed.';
  }

  readonly reviewLabels: Record<ReviewGateStage, string> = {
    awaiting_generation: 'Borrador',
    qa_blocked: 'Calidad por revisar',
    needs_review: 'En revisión',
    ready_to_approve: 'Pendiente de aprobación',
    approved: 'Aprobado',
    publish_queued: 'Publicación programada',
    publish_failed: 'Error de publicación',
    published: 'Publicado',
  };
  stageTone = stageTone;

  pipeline(): PipelineStep[] {
    if (!this.project) return [];
    const [brief, draft, qa, review, approved, queued, published] = articlePipeline(this.project.reviewGate.stage);
    const publicationState = published.state === 'done' ? 'done'
      : queued.state === 'failed' ? 'failed'
      : approved.state === 'todo' ? 'todo' : 'current';
    return [
      { ...brief, label: 'Planificación' },
      { ...draft, label: 'Redacción' },
      { ...qa, label: 'SEO y calidad' },
      { ...review, label: 'Revisión' },
      { id: 'publication', label: 'Publicación', state: publicationState },
    ];
  }
}
