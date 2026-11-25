import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppContextService } from '../../services/app-context.service';
import { ConfirmService } from '../../services/confirm.service';
import { SearchConsoleStatus, SeoIntelligenceApiService } from '../../services/seo-intelligence-api.service';
import { ToastService } from '../../services/toast.service';
import { SEO_LOCALE, SEARCH_CONSOLE_STATUS, seoError } from '../seo-labels';
import { AppIconComponent } from '../ui/app-icon.component';

/** The site's Search Console connection: connect, choose the property, synchronize and disconnect. */
@Component({
  selector: 'app-search-console-card',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, AppIconComponent],
  styles: [`
    .head, .actions { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 10px; }
    .actions { justify-content: flex-start; margin-top: 12px; }
    p { font-size: var(--au-fs-body-sm); overflow-wrap: anywhere; }
  `],
  template: `
    <section class="au-panel au-panel--padded" aria-labelledby="sc-title">
      @if (failed(); as reason) { <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div> }
      @if (connection(); as c) {
        <div class="advanced-card-header head">
          <div><h2 class="au-panel__title" id="sc-title">Search Console</h2><p>{{ label() }}@if (c.property) { · {{ c.property }} }</p></div>
          @if (editable()) {
            <div class="head">
              @if (c.status === 'active') {
                <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy() || c.syncing" (click)="sync()">{{ busy() === 'sync' || c.syncing ? 'Sincronizando…' : 'Sincronizar' }}</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="disconnect(false)">Desconectar</button>
                <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="disconnect(true)">Desconectar y borrar datos</button>
              } @else {
                <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy() || !c.configured" (click)="connect()">{{ c.status === 'not_connected' ? 'Conectar Search Console' : 'Volver a conectar' }}</button>
              }
            </div>
          }
        </div>
        @if (!c.configured) { <p>La plataforma no tiene configurado el acceso a Google. Un administrador debe añadirlo en el servidor.</p> }
        @if (!editable()) { <p>Para conectarlo o desconectarlo hace falta el permiso de integraciones.</p> }
        @if (c.syncedThrough) { <p>Datos del {{ c.syncedFrom | date: 'd/MM/y' }} al {{ c.syncedThrough | date: 'd/MM/y' }}{{ c.backfillComplete ? '' : ' (descargando el historial)' }}. Google publica los datos definitivos con dos o tres días de retraso{{ (c.dataAgeDays ?? 0) > 5 ? '; estos tienen ' + c.dataAgeDays + ' días' : '' }}.</p> }
        @if (c.lastError) { <p class="au-error" role="alert">Último error: {{ c.lastError }}. {{ c.nextSyncAt ? 'Próximo intento: ' + (c.nextSyncAt | date: 'd/MM/y, HH:mm') : 'No se reintentará hasta que vuelvas a conectar.' }}</p> }
        @if (c.status === 'pending_property' && editable()) {
          @if (properties().length) { <div class="actions" role="group" aria-label="Elegir propiedad">@for (item of properties(); track item.property) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="select(item.property)">{{ item.property }}</button> }</div> }
          @else { <p>La cuenta de Google no tiene ninguna propiedad verificada de este dominio.</p> }
        }
      } @else if (!failed()) { <div class="au-skeleton" style="height: 96px" aria-label="Cargando Search Console"></div> }
    </section>
  `,
})
export class SearchConsoleCardComponent {
  private readonly api = inject(SeoIntelligenceApiService);
  private readonly app = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly connection = signal<SearchConsoleStatus | null>(null);
  readonly properties = signal<Array<{ property: string }>>([]);
  readonly busy = signal('');
  readonly failed = signal('');
  readonly editable = computed(() => this.app.can('integrations.manage'));
  readonly label = computed(() => SEARCH_CONSOLE_STATUS[this.connection()?.status ?? ''] ?? '');

  constructor() {
    effect(() => {
      if (this.app.activeSite()?.id) void this.load();
    });
  }

  async load(): Promise<void> {
    const siteId = this.app.activeSite()?.id;
    if (!siteId) return;
    try {
      const connection = await firstValueFrom(this.api.connection(siteId));
      if (siteId !== this.app.activeSite()?.id) return;
      this.failed.set('');
      this.connection.set(connection);
      this.properties.set(connection.status === 'pending_property' && this.editable() ? (await firstValueFrom(this.api.properties(siteId))).items : []);
    } catch (error) {
      this.failed.set(seoError(error, 'No se ha podido leer el estado de Search Console.'));
    }
  }

  private async work(name: string, run: (siteId: string) => Promise<void>): Promise<void> {
    const siteId = this.app.activeSite()?.id;
    if (this.busy() || !siteId) return;
    this.busy.set(name);
    try {
      await run(siteId);
    } catch (error) {
      this.toast.error(seoError(error));
    } finally {
      this.busy.set('');
      await this.load();
    }
  }

  connect(): Promise<void> {
    return this.work('connect', async (siteId) => {
      window.location.href = (await firstValueFrom(this.api.connect(siteId))).url;
    });
  }
  select(property: string): Promise<void> {
    return this.work('select', async (siteId) => void (await firstValueFrom(this.api.selectProperty(siteId, property))));
  }
  sync(): Promise<void> {
    return this.work('sync', async (siteId) => {
      const result = await firstValueFrom(this.api.sync(siteId));
      if (result.status === 'failed') this.toast.error(`Google no respondió bien: ${result.error}`);
      else this.toast.success(result.days ? `${result.days} día(s) nuevos.` : 'No hay días nuevos.');
    });
  }
  async disconnect(deleteData: boolean): Promise<void> {
    const ok = await this.confirm.confirm(deleteData
      ? { title: '¿Desconectar y borrar los datos?', message: 'Se borran para siempre las cifras de Search Console de este sitio y lo que se dedujo de ellas.', confirmLabel: 'Desconectar y borrar', cancelLabel: 'Cancelar', danger: true }
      : { title: '¿Desconectar Search Console?', message: 'Deja de sincronizarse. Los datos guardados se conservan.', confirmLabel: 'Desconectar', cancelLabel: 'Cancelar' });
    if (ok) await this.work('disconnect', async (siteId) => void (await firstValueFrom(this.api.disconnect(siteId, deleteData))));
  }
}
