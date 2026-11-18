import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SocialSetupGuideComponent } from '../components/social-setup-guide.component';
import type { SiteSocialPost, SiteSocialSettings } from '../models/studio.models';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';

const WORKFLOWS: Array<{ id: SiteSocialSettings['workflow']; label: string; hint: string }> = [
  { id: 'auto', label: 'Automático', hint: 'Los posts se aprueban y programan en cuanto se generan.' },
  { id: 'approve', label: 'Aprobar antes', hint: 'Recomendado. Revisas cada post y después se programa.' },
  { id: 'manual', label: 'Manual', hint: 'Los posts aprobados quedan listos para publicarlos a mano.' },
];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const CATEGORIES = [
  { id: 'educational', label: 'Educativo' },
  { id: 'philosophical', label: 'Filosófico' },
  { id: 'myths', label: 'Mitos' },
  { id: 'storytelling', label: 'Storytelling' },
];

type Slide = { headline?: string; body?: string; imageUrl?: string };

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
    case 'failed': return 'Falló la publicación';
    case 'queued':
    case 'publishing': return 'Publicando';
    default: return 'Aprobado · conecta una cuenta para programarlo';
  }
}

@Component({
  selector: 'app-social-page',
  standalone: true,
  imports: [DatePipe, FormsModule, SocialSetupGuideComponent],
  template: `
    <header class="au-page__header">
      <h1 class="au-page__title">Social</h1>
      <p class="au-page__subtitle">Publicaciones de tus artículos en Instagram, Facebook y X.</p>
    </header>

    <label class="au-field">
      <span>Canal</span>
      <select class="au-input" [ngModel]="channel()" (ngModelChange)="selectChannel($event)">
        <option value="instagram">Instagram</option>
        <option value="facebook">Facebook</option>
        <option value="x">X</option>
      </select>
    </label>
    <app-social-setup-guide [platform]="channel()" />

    @if (settings(); as s) {
      <section class="au-panel" aria-labelledby="soc-workflow">
        <div class="au-panel__header"><h2 id="soc-workflow" class="au-panel__title">Flujo de publicación</h2></div>
        <div class="soc-cards" role="radiogroup" aria-label="Flujo de publicación">
          @for (w of workflows; track w.id) {
            <button type="button" class="au-btn soc-card" role="radio" [attr.aria-checked]="s.workflow === w.id"
              [class.au-btn--primary]="s.workflow === w.id" [class.au-btn--secondary]="s.workflow !== w.id" (click)="s.workflow = w.id">
              <strong>{{ w.label }}</strong><span>{{ w.hint }}</span>
            </button>
          }
        </div>
      </section>

      <section class="au-panel" aria-labelledby="soc-schedule">
        <div class="au-panel__header"><h2 id="soc-schedule" class="au-panel__title">Calendario</h2></div>
        <fieldset class="soc-days"><legend>Días</legend>
          @for (d of days; track $index) {
            <label><input type="checkbox" [checked]="s.postDays.includes($index)" (change)="toggleDay($index)" /> {{ d }}</label>
          }
        </fieldset>
        <label class="au-field"><span>Hora</span>
          <select class="au-input" [(ngModel)]="s.postTime" name="postTime">
            @for (t of times; track t) { <option [value]="t">{{ t }}</option> }
          </select>
        </label>
        <label class="au-field"><span>Zona horaria</span><input class="au-input" [(ngModel)]="s.timezone" name="timezone" /></label>
      </section>

      <section class="au-panel" aria-labelledby="soc-content">
        <div class="au-panel__header"><h2 id="soc-content" class="au-panel__title">Contenido</h2></div>
        <fieldset class="soc-days"><legend>Categorías</legend>
          @for (c of categories; track c.id) {
            <label><input type="checkbox" [checked]="s.categories.includes(c.id)" (change)="toggleCategory(c.id)" /> {{ c.label }}</label>
          }
        </fieldset>
        <label class="au-field"><span>Estilo de imagen</span>
          <select class="au-input" [(ngModel)]="s.imageStyle" name="imageStyle"><option value="photo">Foto</option><option value="sketch">Boceto</option></select>
        </label>
        <label class="au-field"><span>Fuente</span>
          <select class="au-input" [(ngModel)]="s.fontFamily" name="fontFamily"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select>
        </label>
        <label class="au-field"><span>Resaltado</span>
          <select class="au-input" [(ngModel)]="s.highlightStyle" name="highlightStyle">
            <option value="color">Color</option><option value="marker">Marcador</option><option value="underline">Subrayado</option><option value="none">Ninguno</option>
          </select>
        </label>
        <label><input type="checkbox" [(ngModel)]="s.useLogo" name="useLogo" /> Usar logo en vez del dominio</label>
        <label><input type="checkbox" [(ngModel)]="s.showBrandMark" name="showBrandMark" /> Marca en cada slide</label>
        <div><button type="button" class="au-btn au-btn--primary" [disabled]="saving()" (click)="save()">Guardar ajustes</button></div>
      </section>

      <section class="au-panel" aria-labelledby="soc-preview">
        <div class="au-panel__header"><h2 id="soc-preview" class="au-panel__title">Vista previa</h2></div>
        <div class="soc-preview" [attr.data-font]="s.fontFamily" [attr.data-highlight]="s.highlightStyle" [attr.data-style]="s.imageStyle">
          <figure class="soc-slide" aria-label="Primer slide">
            <p class="soc-slide__title">5 <mark>claves</mark> del artículo</p>
            @if (s.showBrandMark) { <span class="soc-slide__brand">{{ brand() }}</span> }
          </figure>
          <figure class="soc-slide" aria-label="Último slide">
            <p class="soc-slide__title">Lee el artículo <mark>completo</mark></p>
            <span class="soc-slide__brand">{{ s.useLogo ? 'Logo' : brand() }}</span>
          </figure>
        </div>
      </section>
    }

    <section class="au-panel" aria-labelledby="soc-posts">
      <div class="au-panel__header"><h2 id="soc-posts" class="au-panel__title">Posts</h2></div>
      @for (post of posts(); track post.id) {
        <article class="soc-post" [attr.data-post-id]="post.id">
          <header><strong>{{ post.projectTitle }}</strong> · {{ post.channel }} ·
            <span class="au-badge" data-testid="post-state">{{ state(post) }}</span>
            @if (post.publication?.scheduledFor; as at) { <span class="au-muted"> {{ at | date: 'EEE d MMM, HH:mm' }}</span> }
          </header>
          @if (slides(post).length) {
            <div class="soc-slides">
              @for (slide of slides(post); track $index) {
                @if (slide.imageUrl) { <img [src]="slide.imageUrl" [alt]="slide.headline || 'Slide ' + ($index + 1)" width="120" height="150" /> }
              }
            </div>
          }
          @if (post.channel === 'x' && imageUrl(post); as cover) {
            <div class="soc-slides"><img [src]="cover" alt="Portada del artículo" width="120" height="120" /></div>
          }
          @if (post.editorialStatus === 'draft' && post.generationStatus === 'done') {
            <label class="au-field">
              <span>Texto</span>
              @if (post.contentType === 'x_thread') { <small>Separa los posts del hilo con una línea en blanco.</small> }
              <textarea class="au-input" rows="4" [(ngModel)]="post.body" [name]="'body-' + post.id"></textarea>
            </label>
            <div class="soc-actions">
              <button type="button" class="au-btn au-btn--primary" (click)="approve(post)">Aprobar</button>
              <button type="button" class="au-btn au-btn--secondary" (click)="regenerate(post)">Regenerar</button>
              <button type="button" class="au-btn au-btn--ghost" (click)="reject(post)">Rechazar</button>
            </div>
          } @else {
            <p class="soc-post__body">{{ post.body }}</p>
          }
        </article>
      } @empty {
        <p class="au-muted">{{ loading() ? 'Cargando…' : 'Aún no hay posts. Genera posts sociales desde un artículo.' }}</p>
      }
    </section>
  `,
  styles: [`
    .soc-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .soc-card { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left; white-space: normal; height: auto; padding: 12px; }
    .soc-days { display: flex; flex-wrap: wrap; gap: 12px; border: 0; padding: 0; margin: 0 0 12px; }
    .soc-post { border-top: 1px solid var(--au-border, #e5e5e5); padding: 12px 0; display: grid; gap: 8px; }
    .soc-slides { display: flex; gap: 8px; overflow-x: auto; }
    .soc-slides img { border-radius: 6px; object-fit: cover; }
    .soc-post__body { white-space: pre-wrap; overflow-wrap: anywhere; }
    .soc-actions { display: flex; gap: 8px; }
    .soc-preview { display: flex; gap: 12px; }
    .soc-slide { position: relative; width: 160px; height: 200px; margin: 0; padding: 14px; border-radius: 8px; background: #1f2937; color: #fff; display: flex; align-items: center; font-family: system-ui, sans-serif; }
    .soc-preview[data-style="sketch"] .soc-slide { background: #f5f0e6; color: #222; }
    .soc-preview[data-font="serif"] .soc-slide { font-family: Georgia, serif; }
    .soc-preview[data-font="mono"] .soc-slide { font-family: ui-monospace, monospace; }
    .soc-slide__title { font-size: 18px; font-weight: 700; margin: 0; }
    .soc-slide mark { background: none; color: inherit; }
    .soc-preview[data-highlight="color"] mark { color: #f5b301; }
    .soc-preview[data-highlight="marker"] mark { background: #f5b301; color: #111; }
    .soc-preview[data-highlight="underline"] mark { text-decoration: underline 3px #f5b301; }
    .soc-slide__brand { position: absolute; bottom: 8px; left: 14px; font-size: 11px; opacity: .8; }
  `],
})
export class SocialPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);

  readonly workflows = WORKFLOWS;
  readonly days = DAYS;
  readonly times = TIMES;
  readonly categories = CATEGORIES;
  readonly settings = signal<SiteSocialSettings | null>(null);
  readonly posts = signal<SiteSocialPost[]>([]);
  readonly channel = signal<SiteSocialPost['channel']>('instagram');
  readonly loading = signal(true);
  readonly saving = signal(false);
  private readonly siteId = computed(() => this.appContext.activeSite()?.id ?? null);
  readonly brand = computed(() => { const site = this.appContext.activeSite() as { name?: string; domain?: string } | null; return site?.domain || site?.name || 'tu-sitio.com'; });
  readonly state = socialPostState;

  ngOnInit(): void {
    const siteId = this.siteId();
    if (!siteId) { this.loading.set(false); return; }
    this.api.getSocialSettings(siteId).subscribe({ next: (s) => this.settings.set(s), error: () => this.toast.error('No se pudieron cargar los ajustes sociales.') });
    this.loadPosts();
  }

  slides(post: SiteSocialPost): Slide[] {
    const slides = (post.metadata as { slides?: Slide[] } | null)?.slides;
    return Array.isArray(slides) ? slides : [];
  }

  imageUrl(post: SiteSocialPost): string | undefined {
    return (post.metadata as { imageUrl?: string } | null)?.imageUrl;
  }

  selectChannel(channel: SiteSocialPost['channel']): void {
    this.channel.set(channel);
    this.posts.set([]);
    this.loadPosts();
  }

  toggleDay(day: number): void {
    const s = this.settings();
    if (s) s.postDays = s.postDays.includes(day) ? s.postDays.filter((d) => d !== day) : [...s.postDays, day].sort();
  }

  toggleCategory(category: string): void {
    const s = this.settings();
    if (s) s.categories = s.categories.includes(category) ? s.categories.filter((c) => c !== category) : [...s.categories, category];
  }

  save(): void {
    const s = this.settings();
    const siteId = this.siteId();
    if (!s || !siteId) return;
    const { siteId: _ignored, ...patch } = s;
    this.saving.set(true);
    this.api.putSocialSettings(siteId, patch).subscribe({
      next: (saved) => { this.settings.set(saved); this.saving.set(false); this.toast.success('Ajustes guardados. Se aplican a los posts nuevos.'); },
      error: (err) => { this.saving.set(false); this.toast.error(err?.error?.message ?? 'No se pudieron guardar los ajustes.'); },
    });
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

  private loadPosts(): void {
    const siteId = this.siteId();
    if (!siteId) return;
    const channel = this.channel();
    this.loading.set(true);
    this.api.listSiteSocial(siteId, channel).subscribe({
      next: ({ items }) => {
        if (this.channel() !== channel) return;
        this.posts.set(items);
        this.loading.set(false);
      },
      error: () => {
        if (this.channel() !== channel) return;
        this.loading.set(false);
        this.toast.error('No se pudieron cargar los posts.');
      },
    });
  }
}
