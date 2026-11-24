import { DatePipe } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, computed, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Observable, Subscription } from 'rxjs';
import { SocialCarouselComponent, type SocialSlide } from '../components/social-carousel.component';
import { SOCIAL_SECTIONS, SOCIAL_VIEWS } from '../layout/studio-nav';
import type { SiteSocialPost, StudioProjectSummary } from '../models/studio.models';
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
  { id: 'all', label: 'Todas', icon: 'grid', tone: 'lavender' },
  { id: 'review', label: 'Por aprobar', icon: 'clock', tone: 'lavender-subtle' },
  { id: 'scheduled', label: 'Programadas', icon: 'calendar', tone: 'lavender-subtle' },
  { id: 'published', label: 'Publicadas', icon: 'check-circle', tone: 'green' },
] as const;
type Filter = typeof FILTERS[number]['id'];
type View = 'posts' | typeof SOCIAL_VIEWS[number]['id'];
type Dialog = 'rename' | 'delete' | 'slide';
type TemplateFormat = 'instagram_carousel' | 'instagram_story' | 'x_post' | 'x_thread';

export function editSocialHashtags(body: string, tags: string[], tag: string, remove: boolean) {
  const normalize = (value: string) => value.toLowerCase();
  const current = normalize(tag);
  const inCaption = (body.match(/#[\p{L}\p{N}_]+/gu) ?? []).some((item) => normalize(item) === current);
  return remove
    ? {
        hashtags: tags.filter((item) => normalize(item) !== current),
        body: body.replace(/#[\p{L}\p{N}_]+/gu, (item) => normalize(item) === current ? '' : item).trimEnd(),
      }
    : {
        hashtags: [...new Set([...tags.filter((item) => normalize(item) !== current), tag])],
        body: inCaption ? body : [body.trimEnd(), tag].filter(Boolean).join('\n'),
      };
}

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
  imports: [DatePipe, FormsModule, RouterLink, SocialCarouselComponent],
  templateUrl: './social-page.component.html',
})
export class SocialPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private request?: Subscription;
  private refreshTimer?: ReturnType<typeof setTimeout>;

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
  readonly view = signal<View>('posts');
  readonly menuOpen = signal(false);
  readonly mobileOpen = signal(false);
  readonly inspector = signal<'details' | 'caption' | 'hashtags' | 'schedule'>('details');
  readonly busy = signal(false);
  readonly templateSources = signal<StudioProjectSummary[]>([]);
  readonly loadingTemplates = signal(false);
  readonly templateError = signal(false);
  readonly dialog = signal<Dialog | null>(null);
  readonly browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly inspectors = [
    { id: 'details', label: 'Detalles', icon: 'info' },
    { id: 'caption', label: 'Caption', icon: 'link' },
    { id: 'hashtags', label: 'Hashtags', icon: 'hash' },
    { id: 'schedule', label: 'Programación', icon: 'calendar' },
  ] as const;
  readonly templates = computed(() => this.channel() === 'instagram'
    ? [
        { format: 'instagram_carousel', label: 'Carrusel informativo', description: 'Una secuencia de imágenes y un texto.' },
        { format: 'instagram_story', label: 'Historia destacada', description: 'Contenido breve para Stories.' },
      ] as const
    : [
        { format: 'x_post', label: 'Post de X', description: 'Un texto breve a partir del artículo.' },
        { format: 'x_thread', label: 'Hilo de X', description: 'Desarrolla el artículo en cinco posts.' },
      ] as const);
  readonly channelLabel = computed(() => this.channels.find(({ id }) => id === this.channel())?.label);
  readonly visiblePosts = computed(() => this.posts()
    .filter((post) => matchesFilter(post, this.view() === 'drafts' ? 'review' : this.filter())));
  readonly selected = computed(() => this.visiblePosts().find(({ id }) => id === this.selectedPostId()) ?? this.visiblePosts()[0]);
  readonly caption = linkedSignal(() => this.selected()?.body ?? '');
  readonly scheduleTime = linkedSignal(() => {
    const at = this.selected()?.publication?.scheduledFor;
    if (!at) return '';
    const local = new Date(at);
    return new Date(local.getTime() - local.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
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

  percent(count: number): number {
    const total = this.counts().all;
    return total ? Math.round(count / total * 100) : 0;
  }

  ngOnInit(): void {
    this.destroy.onDestroy(() => clearTimeout(this.refreshTimer));
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      const channel = this.channels.find(({ id }) => id === params.get('tab'))?.id ?? 'instagram';
      const postId = params.get('post');
      const view = SOCIAL_VIEWS.find(({ id }) => id === params.get('view'))?.id ?? 'posts';
      const reload = !this.request || this.channel() !== channel || this.postId() !== postId;
      this.channel.set(channel);
      this.postId.set(postId);
      this.view.set(view);
      this.filter.set('all');
      this.inspector.set('details');
      this.mobileOpen.set(false);
      if (view === 'templates') this.loadTemplateSources();
      if (reload) {
        this.selectedPostId.set(null);
        this.posts.set([]);
        this.loadPosts();
      }
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

  @HostListener('document:keydown.escape')
  closeMenus(): void {
    this.menuOpen.set(false);
    this.mobileOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  closeMenuOnOutsideClick(event: MouseEvent): void {
    if (this.menuOpen() && !(event.target instanceof Element && event.target.closest('.more-wrapper'))) {
      this.menuOpen.set(false);
    }
  }

  showPosts(filter: Filter = 'all'): void {
    this.mobileOpen.set(false);
    this.menuOpen.set(false);
    if (this.view() === 'posts') {
      this.filter.set(filter);
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: this.channel() } })
      .then((navigated) => { if (navigated) this.filter.set(filter); });
  }

  select(post: SiteSocialPost): void {
    if (this.view() !== 'drafts' && this.view() !== 'posts') this.showPosts();
    this.mobileOpen.set(false);
    this.menuOpen.set(false);
    this.selectedPostId.set(post.id);
    this.inspector.set('details');
  }

  isDraft(post: SiteSocialPost): boolean {
    return post.editorialStatus === 'draft' && post.generationStatus === 'done';
  }

  canDelete(post: SiteSocialPost): boolean {
    return !post.publication && post.threadPosition === null
      && (post.editorialStatus === 'draft' || post.editorialStatus === 'rejected')
      && (post.generationStatus === 'done' || post.generationStatus === 'failed');
  }

  canSchedule(post: SiteSocialPost): boolean {
    return post.editorialStatus === 'approved' && (!post.publication
      || ['draft', 'ready', 'scheduled', 'failed', 'canceled'].includes(post.publication.status));
  }

  approve(post: SiteSocialPost, body = post.body): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.updateSocial(post.id, { body, editorialStatus: 'approved' }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (res) => {
        this.busy.set(false);
        if ((res as { needsAccount?: boolean }).needsAccount) this.toast.error('Aprobado, pero no hay cuenta conectada para este canal: conéctala para programarlo.');
        else this.toast.success('Post aprobado.');
        this.loadPosts();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(err?.error?.message ?? 'No se pudo aprobar el post.');
      },
    });
  }

  reject(post: SiteSocialPost): void {
    this.save(this.api.updateSocial(post.id, { editorialStatus: 'rejected' }), 'Publicación rechazada.');
  }

  regenerate(post: SiteSocialPost): void {
    this.save(this.api.regenerateSocial(post.id), 'Generación en cola.');
  }

  saveCaption(post: SiteSocialPost): void {
    this.save(this.api.updateSocial(post.id, { body: this.caption() }), 'Texto guardado.');
  }

  changeHashtag(post: SiteSocialPost, value: string, remove = false): void {
    const tag = '#' + value.trim().replace(/^#/, '');
    if (!/^#[\p{L}\p{N}_]+$/u.test(tag)) {
      this.toast.error('Usa letras, números o guiones bajos en el hashtag.');
      return;
    }
    const changes = editSocialHashtags(this.caption(), post.hashtags ?? [], tag, remove);
    this.save(this.api.updateSocial(post.id, changes), remove ? 'Hashtag eliminado.' : 'Hashtag guardado.');
  }

  duplicate(post: SiteSocialPost): void {
    this.menuOpen.set(false);
    this.save(this.api.duplicateSocial(post.id), 'Copia guardada como borrador.', (copy) => {
      if (this.postId()) {
        void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: post.channel, post: copy.id } });
        return;
      }
      this.filter.set('all');
      this.select({ ...post, id: copy.id });
    });
  }

  showDialog(dialog: Dialog, element: HTMLDialogElement): void {
    this.menuOpen.set(false);
    this.dialog.set(dialog);
    element.showModal();
  }

  submitDialog(element: HTMLDialogElement, post: SiteSocialPost, title: string, body: string): void {
    if (this.dialog() === 'rename') {
      if (!title.trim()) return;
      this.save(this.api.updateSocial(post.id, { title: title.trim() }), 'Título actualizado.', () => element.close());
    } else if (this.dialog() === 'slide') {
      if (!title.trim()) return;
      this.save(this.api.appendSocialSlide(post.id, { headline: title.trim(), body: body.trim() }), 'Diapositiva añadida.', () => element.close());
    } else if (this.dialog() === 'delete') {
      this.save(this.api.deleteSocialDraft(post.id), 'Borrador eliminado.', () => {
        element.close();
        if (this.postId()) void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: post.channel } });
      });
    }
  }

  schedule(post: SiteSocialPost): void {
    const date = new Date(this.scheduleTime());
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      this.toast.error('Elige una fecha y hora futuras.');
      return;
    }
    this.save(this.api.scheduleSocial(post.id, date.toISOString()), 'Publicación programada.');
  }

  publishNow(id: string): void {
    this.save(this.api.publishNow(id), 'Publicación enviada a la cola.');
  }

  cancelSchedule(id: string): void {
    this.save(this.api.cancelPublication(id), 'Programación cancelada.');
  }

  createFromTemplate(format: TemplateFormat, projectId: string): void {
    if (!this.templateSources().some(({ id }) => id === projectId)) return;
    this.save(this.api.generateSocial(projectId, {
      channels: [this.channel()],
      ...(format === 'x_thread' ? { threadLength: 5 } : {}),
      ...(format === 'instagram_carousel' || format === 'instagram_story' ? { instagramFormat: format } : {}),
    }), 'Generación en cola.', () => this.showPosts());
  }

  loadTemplateSources(): void {
    const siteId = this.appContext.activeSite()?.id;
    if (!siteId || this.loadingTemplates()) return;
    this.loadingTemplates.set(true);
    this.templateError.set(false);
    this.templateSources.set([]);
    this.api.listProjects({ siteId, pageSize: 100 }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: ({ items }) => {
        this.templateSources.set(items.filter(({ versionCount }) => versionCount > 0));
        this.loadingTemplates.set(false);
      },
      error: () => {
        this.templateError.set(true);
        this.loadingTemplates.set(false);
      },
    });
  }

  private save<T>(request: Observable<T>, message: string, after?: (value: T) => void): void {
    if (this.busy()) return;
    const channel = this.channel();
    const postId = this.postId();
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (value) => {
        this.busy.set(false);
        this.toast.success(message);
        if (channel === this.channel() && postId === this.postId()) {
          after?.(value);
          this.loadPosts();
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(err?.error?.message ?? 'No se pudo guardar el cambio.');
      },
    });
  }

  loadPosts(background = false): void {
    clearTimeout(this.refreshTimer);
    this.request?.unsubscribe();
    this.loadError.set(false);
    const siteId = this.appContext.activeSite()?.id;
    if (!siteId) {
      this.loading.set(false);
      return;
    }
    if (!background) this.loading.set(true);
    this.request = this.api.listSiteSocial(siteId, this.channel(), this.postId()).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: ({ items }) => {
        if (background) {
          const previous = new Map(this.posts().map((post) => [post.id, post]));
          this.posts.set(items.map((post) => {
            const saved = previous.get(post.id);
            return saved?.updatedAt === post.updatedAt && saved?.publication?.status === post.publication?.status ? saved : post;
          }));
        } else {
          this.posts.set(items);
        }
        this.loading.set(false);
        if (items.some((post) => ['queued', 'processing'].includes(post.generationStatus)
          || ['queued', 'publishing'].includes(post.publication?.status ?? ''))) {
          this.refreshTimer = setTimeout(() => this.loadPosts(true), 5000);
        }
      },
      error: () => {
        if (background) this.refreshTimer = setTimeout(() => this.loadPosts(true), 10000);
        else this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }
}
