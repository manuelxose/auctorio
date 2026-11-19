import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { SocialCarouselComponent, type SocialSlide } from '../components/social-carousel.component';
import { SOCIAL_SECTIONS } from '../layout/studio-nav';
import type { SiteSocialPost } from '../models/studio.models';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';

/** The state a post shows in the queue, from its review and its delivery record. */
export function socialPostState(post: Pick<SiteSocialPost, 'generationStatus' | 'editorialStatus' | 'publication'>): string {
  if (post.generationStatus === 'failed') return 'Error';
  if (post.generationStatus !== 'done') return 'Generando';
  if (post.editorialStatus === 'rejected') return 'Rechazado';
  if (post.editorialStatus === 'draft') return 'Pendiente de aprobación';
  switch (post.publication?.status) {
    case 'scheduled': return 'Programado';
    case 'ready': return 'Listo para publicar a mano';
    case 'published': return 'Publicado';
    case 'canceled': return 'Cancelado';
    case 'unpublished': return 'Retirado';
    case 'failed': return 'Falló la publicación';
    case 'queued':
    case 'publishing': return 'Publicando';
    default: return 'Aprobado · conecta una cuenta para programarlo';
  }
}

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'review', label: 'Por aprobar' },
  { id: 'scheduled', label: 'Programadas' },
  { id: 'published', label: 'Publicadas' },
] as const;
type Filter = typeof FILTERS[number]['id'];

function matchesFilter(post: SiteSocialPost, filter: Filter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'review': return post.editorialStatus === 'draft' && post.generationStatus === 'done';
    case 'scheduled': return ['scheduled', 'queued', 'publishing'].includes(post.publication?.status ?? '');
    case 'published': return post.publication?.status === 'published';
  }
}

const FORMAT_LABELS: Record<SiteSocialPost['contentType'], string> = {
  x_post: 'Post', x_thread: 'Hilo', instagram_caption: 'Post', instagram_carousel: 'Carrusel',
  instagram_story: 'Historia', facebook_post: 'Post', social_post: 'Post',
};

@Component({
  selector: 'app-social-page',
  standalone: true,
  imports: [AppIconComponent, DatePipe, FormsModule, RouterLink, SocialCarouselComponent],
  template: `
    <header class="au-page__header soc-heading">
      <div>
        <h1 class="au-page__title">{{ channelLabel() }}</h1>
        <p class="au-page__subtitle">{{ channel() === 'instagram' ? 'Carruseles y publicaciones de tus artículos.' : 'Posts e hilos creados a partir de tus artículos.' }}</p>
      </div>
      <div class="soc-actions">
        <a class="au-btn au-btn--secondary" routerLink="/studio/calendar"><app-icon name="calendar"></app-icon> Calendario</a>
        <a class="au-btn au-btn--secondary" routerLink="/studio/settings/social"><app-icon name="settings"></app-icon> Ajustes de publicación</a>
      </div>
    </header>

    <nav class="soc-tabs" aria-label="Canales de redes">
      @for (section of channels; track section.id) {
        <a routerLink="/studio/social" [queryParams]="{ tab: section.id }"
          [attr.aria-current]="channel() === section.id ? 'page' : null">{{ section.label }}</a>
      }
    </nav>

    <section aria-labelledby="soc-posts" [attr.aria-busy]="loading()">
      @if (!postId() && !loadError() && !loading()) {
        <div class="soc-filters" role="group" aria-label="Estado de las publicaciones">
          @for (status of filters; track status.id) {
            <button type="button" class="soc-filter" [attr.aria-pressed]="filter() === status.id" (click)="filter.set(status.id)">
              <span>{{ status.label }}</span><strong>{{ counts()[status.id] }}</strong>
            </button>
          }
        </div>
      }
      <header class="soc-section-head">
        <h2 id="soc-posts">Publicaciones en {{ channelLabel() }}</h2>
        @if (postId()) {
          <a class="au-btn au-btn--ghost" routerLink="/studio/social" [queryParams]="{ tab: channel() }">Ver todas</a>
        }
      </header>

      @if (loadError()) {
        <div class="au-panel soc-empty" role="status">
          <p>No se pudieron cargar las publicaciones.</p>
          <button class="au-btn au-btn--secondary" type="button" (click)="loadPosts()">Reintentar</button>
        </div>
      } @else if (loading() && !posts().length) {
        <div class="au-panel soc-empty" role="status">Cargando publicaciones…</div>
      } @else if (visiblePosts().length) {
        <div class="soc-layout" [class.soc-layout--gallery]="channel() === 'instagram' && visiblePosts().length > 1">
          @if (channel() === 'instagram' && visiblePosts().length > 1) {
            <div class="soc-library" role="group" aria-label="Elegir publicación de Instagram">
              @for (item of visiblePosts(); track item.id) {
                <button class="soc-library-item" type="button" [attr.aria-pressed]="displayPosts()[0]?.id === item.id" (click)="selectedPostId.set(item.id)">
                  @if (slides(item)[0]?.imageUrl; as cover) {
                    <img [src]="cover" alt="" width="48" height="60" loading="lazy" />
                  } @else {
                    <span class="soc-library-icon"><app-icon name="share"></app-icon></span>
                  }
                  <span class="soc-library-copy">
                    <strong>{{ item.projectTitle }}</strong>
                    <span>{{ formatLabels[item.contentType] }} · {{ state(item) }}</span>
                  </span>
                </button>
              }
            </div>
          }
          <div class="soc-stack" [class.soc-stack--x]="channel() === 'x'">
          @for (post of displayPosts(); track post.id) {
            <article class="au-panel soc-post" [attr.data-post-id]="post.id">
              <header class="soc-post-head">
                <div>
                  <div class="soc-post-meta">{{ formatLabels[post.contentType] }} · {{ post.createdAt | date: 'd MMM yyyy' }}</div>
                  <h3><a [routerLink]="['/studio/content', post.projectId]">{{ post.projectTitle }}</a></h3>
                </div>
                <span class="au-badge soc-status" [attr.data-state]="post.publication?.status || post.editorialStatus" data-testid="post-state">{{ state(post) }}</span>
              </header>

              @if (post.publication?.scheduledFor; as at) {
                <div class="soc-post-meta"><app-icon name="calendar"></app-icon> {{ at | date: 'EEE d MMM, HH:mm' }}</div>
              }
              @if (channel() === 'instagram' && slides(post).length) {
                <app-social-carousel [slides]="slides(post)"></app-social-carousel>
              }
              @if (channel() === 'x' && imageUrl(post); as cover) {
                <img class="soc-cover" [src]="cover" alt="Portada del artículo" width="560" height="240" loading="lazy" />
              }
              @if (channel() === 'x' && post.contentType === 'x_thread' && post.body) {
                <ol class="soc-thread" role="list" aria-label="Vista previa del hilo">
                  @for (part of threadParts(post.body); track $index) {
                    <li><span class="soc-thread-number" aria-hidden="true">{{ $index + 1 }}</span><p>{{ part }}</p></li>
                  }
                </ol>
              } @else if (channel() === 'x' && post.body) {
                <p class="soc-body">{{ post.body }}</p>
              }
              <details class="soc-details" [open]="postId() === post.id">
                <summary>{{ post.editorialStatus === 'draft' && post.generationStatus === 'done' ? 'Revisar publicación' : 'Ver detalles' }}</summary>
              @if (post.editorialStatus === 'draft' && post.generationStatus === 'done') {
                <label class="au-field soc-editor">
                  <span>Texto</span>
                  @if (post.contentType === 'x_thread') { <small>Separa los posts del hilo con una línea en blanco.</small> }
                  <textarea class="au-input" [rows]="post.contentType === 'x_thread' ? 8 : 4" [(ngModel)]="post.body"></textarea>
                </label>
                <div class="soc-actions">
                  <button type="button" class="au-btn au-btn--primary au-btn--sm" (click)="approve(post)">Aprobar</button>
                  <button type="button" class="au-btn au-btn--secondary au-btn--sm" (click)="regenerate(post)">Regenerar</button>
                  <button type="button" class="au-btn au-btn--ghost au-btn--sm" (click)="reject(post)">Rechazar</button>
                </div>
              } @else if (post.generationStatus === 'failed') {
                <div class="soc-actions">
                  <button type="button" class="au-btn au-btn--secondary au-btn--sm" (click)="regenerate(post)">Regenerar</button>
                </div>
              } @else if (channel() === 'instagram') {
                <p class="soc-body">{{ post.body }}</p>
              }
              @if (post.publication?.status === 'published' && post.publication?.externalUrl; as url) {
                <a class="au-btn au-btn--ghost au-btn--sm soc-external" [href]="url" target="_blank" rel="noopener"><app-icon name="external"></app-icon> Ver publicación</a>
              }
              </details>
            </article>
          }
          </div>
        </div>
      } @else {
        <div class="au-panel soc-empty">
          @if (postId()) {
            <h3>La publicación no está disponible</h3>
          } @else if (filter() !== 'all') {
            <h3>No hay publicaciones con este estado</h3>
            <button class="au-btn au-btn--secondary" type="button" (click)="filter.set('all')">Ver todas</button>
          } @else {
            <app-icon name="send"></app-icon>
            <h3>Aún no hay publicaciones en {{ channelLabel() }}</h3>
            <p>Abre un artículo y genera una publicación desde su pestaña social.</p>
            <a class="au-btn au-btn--secondary" routerLink="/studio/content">Ver artículos</a>
          }
        </div>
      }
    </section>
  `,
  styleUrl: './social-page.component.css',
})
export class SocialPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private request?: Subscription;

  readonly filters = FILTERS;
  readonly channels = SOCIAL_SECTIONS;
  readonly formatLabels = FORMAT_LABELS;
  readonly posts = signal<SiteSocialPost[]>([]);
  readonly channel = signal<SiteSocialPost['channel']>('instagram');
  readonly postId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly filter = signal<Filter>('all');
  readonly selectedPostId = signal<string | null>(null);
  readonly channelLabel = computed(() => this.channels.find(({ id }) => id === this.channel())?.label);
  readonly visiblePosts = computed(() => this.posts().filter((post) => matchesFilter(post, this.filter())));
  readonly displayPosts = computed(() => {
    const posts = this.visiblePosts();
    if (this.channel() === 'x') return posts;
    const current = posts.find(({ id }) => id === this.selectedPostId()) ?? posts[0];
    return current ? [current] : [];
  });
  readonly counts = computed(() => {
    const posts = this.posts();
    return {
      all: posts.length,
      review: posts.filter((post) => matchesFilter(post, 'review')).length,
      scheduled: posts.filter((post) => matchesFilter(post, 'scheduled')).length,
      published: posts.filter((post) => matchesFilter(post, 'published')).length,
    };
  });
  readonly state = socialPostState;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      const section = this.channels.find(({ id }) => id === params.get('tab'));
      this.channel.set(section?.id ?? 'instagram');
      this.postId.set(params.get('post'));
      this.selectedPostId.set(null);
      this.filter.set('all');
      this.posts.set([]);
      this.loadPosts();
    });
  }

  slides(post: SiteSocialPost): SocialSlide[] {
    const slides = (post.metadata as { slides?: SocialSlide[] } | null)?.slides;
    return Array.isArray(slides) ? slides : [];
  }

  imageUrl(post: SiteSocialPost): string | undefined {
    return (post.metadata as { imageUrl?: string } | null)?.imageUrl;
  }

  threadParts(body: string): string[] {
    return body.split(/\r?\n\s*\r?\n/).filter((part) => part.trim());
  }

  approve(post: SiteSocialPost): void {
    this.api.updateSocial(post.id, { body: post.body, editorialStatus: 'approved' }).subscribe({
      next: (res) => {
        if ((res as { needsAccount?: boolean }).needsAccount) this.toast.error('Aprobado, pero no hay cuenta conectada para este canal: conéctala para programarlo.');
        else this.toast.success('Post aprobado.');
        this.loadPosts();
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'No se pudo aprobar el post.'),
    });
  }

  reject(post: SiteSocialPost): void {
    this.api.updateSocial(post.id, { editorialStatus: 'rejected' }).subscribe({ next: () => this.loadPosts(), error: () => this.toast.error('No se pudo rechazar el post.') });
  }

  regenerate(post: SiteSocialPost): void {
    this.api.regenerateSocial(post.id).subscribe({
      next: () => { this.toast.info('Regenerando el post.'); this.loadPosts(); },
      error: () => this.toast.error('No se pudo regenerar el post.'),
    });
  }

  loadPosts(): void {
    this.request?.unsubscribe();
    this.loadError.set(false);
    const siteId = this.appContext.activeSite()?.id;
    if (!siteId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = this.api.listSiteSocial(siteId, this.channel(), this.postId()).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: ({ items }) => {
        this.posts.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }
}
