import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminSeoOpsApiService, Governance, LicenseRecord } from '../../services/admin-seo-ops-api.service';
import { AppContextService } from '../../services/app-context.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { SEO_LOCALE, SEARCH_CONSOLE_STATUS, SEO_CAPABILITY_LABELS, seoError } from '../seo-labels';
import { AppIconComponent } from '../ui/app-icon.component';

const WARNINGS: Record<string, string> = {
  metrics_without_volume: 'métricas sin volumen', low_quality_metrics: 'métricas con menos de la mitad de los datos', expired_metrics: 'métricas pasadas de su retención', uncertain_billing: 'peticiones sin confirmar', expired_cache: 'respuestas guardadas ya caducadas',
  sync_failing: 'sincronizaciones de Search Console con fallos', price_unknown: 'operaciones sin precio máximo conocido', price_suspect: 'precios que facturaron de más',
};
const TERMS: Record<string, string> = { permitted: 'Permitido', prohibited: 'Prohibido', unverified: 'Sin verificar' };

/** Retention, freshness, licences, sharing, provenance and data quality. */
@Component({
  selector: 'app-seo-governance',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule, AppIconComponent],
  styles: [`
    :host { display: grid; gap: 14px; }
    :host > * { margin-block: 0 !important; min-width: 0; }
    .note { color: var(--au-muted); font-size: var(--au-fs-metadata); }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: start; gap: 10px; }
    .au-row { flex-wrap: wrap; }
    .au-row__meta { white-space: normal; overflow-wrap: anywhere; }
    table { min-width: 620px; }
  `],
  template: `
    @if (failed(); as reason) { <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div> }
    @if (data(); as d) {
      <section class="au-panel au-panel--padded" aria-labelledby="gv-warnings">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="gv-warnings">Avisos de calidad</h2></div>
        @for (warning of d.warnings; track warning.code) { <div class="au-row"><span class="au-badge au-badge--warning">{{ warning.count }}</span><span class="au-row__title">{{ warnings[warning.code] ?? warning.code }}</span></div> } @empty { <p class="note">Ningún aviso.</p> }
      </section>

      <section class="au-panel au-panel--padded" aria-labelledby="gv-sharing">
        <div class="advanced-card-header head"><div><h2 class="au-panel__title" id="gv-sharing">Compartir datos de mercado entre workspaces</h2><p>Hace falta una licencia que permita guardar y compartir, registrada por un administrador y aprobada por otro. Los datos privados de cada workspace nunca se comparten.</p></div>
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy() || (!d.sharing.requested && !d.sharing.eligible.length)" (click)="toggleSharing(d)">{{ d.sharing.requested ? 'Dejar de compartir' : 'Compartir' }}</button></div>
        <div class="au-row"><span class="au-badge" [ngClass]="d.sharing.active ? 'au-badge--brand' : 'au-badge--neutral'">{{ d.sharing.active ? 'Activo' : 'Desactivado' }}</span><span class="au-row__meta">{{ d.sharing.eligible.length ? 'Proveedores con licencia aprobada: ' + d.sharing.eligible.join(', ') : 'Ningún proveedor tiene una licencia aprobada que lo permita.' }}</span></div>
      </section>

      <section class="au-panel au-panel--padded" aria-labelledby="gv-licences">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="gv-licences">Licencias de los proveedores</h2><p>Lo que está en vigor: lo establecido al integrar cada proveedor, mejorado solo por registros aprobados. Una prohibición siempre manda.</p></div>
        <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Licencias en vigor" tabindex="0"><table class="au-table au-table--keep-columns"><thead><tr><th scope="col">Proveedor</th><th scope="col">Uso comercial</th><th scope="col">Guardar</th><th scope="col">Compartir</th><th scope="col" class="au-num">Retención</th><th scope="col">Términos</th></tr></thead>
          <tbody>@for (row of licences(); track row.providerId) { <tr><td>{{ row.label }}</td><td>{{ terms[row.commercialUse] }}</td><td>{{ terms[row.storage] }}</td><td>{{ terms[row.crossTenantSharing] }}</td><td class="au-num">{{ row.days }} días</td><td><a [href]="row.termsUrl" target="_blank" rel="noopener noreferrer">Ver</a>, revisados el {{ row.checkedAt }}</td></tr> }</tbody></table></div>
        @for (record of d.records; track record.id) {
          <div class="au-row">
            <span class="au-row__title">{{ record.providerId }}</span><span class="au-badge" [ngClass]="record.status === 'approved' && !record.expired ? 'au-badge--success' : record.status === 'pending' ? 'au-badge--warning' : 'au-badge--neutral'">{{ record.expired ? 'Caducado' : states[record.status] ?? record.status }}</span>
            <span class="au-row__meta">Uso {{ terms[record.commercialUse] | lowercase }}, guardar {{ terms[record.storage] | lowercase }}, compartir {{ terms[record.crossTenantSharing] | lowercase }} · <a [href]="record.documentUrl" target="_blank" rel="noopener noreferrer">documento</a> · {{ record.notes }} · registró {{ record.createdBy ?? 'alguien que ya no está' }}{{ record.approvedBy ? ', aprobó ' + record.approvedBy : '' }}</span>
            @if (record.status === 'pending') { <button class="au-btn au-btn--sm" type="button" [disabled]="!!busy() || mine(record)" [title]="mine(record) ? 'Debe aprobarlo otro administrador' : ''" (click)="approve(record)">Aprobar</button> }
            @if (record.status === 'pending' || record.status === 'approved') { <button class="au-btn au-btn--sm" type="button" [disabled]="!!busy()" (click)="revoke(record)">Revocar</button> }
          </div>
          @if (record.status === 'pending' && mine(record)) { <p class="note">Lo registraste tú: debe aprobarlo otro administrador de la plataforma.</p> }
        }
        <h3 class="au-panel__title au-mt-4 au-mb-2">Registrar una licencia</h3>
        <form (ngSubmit)="record()">
          <div class="au-field-grid">
            <label class="au-field"><span class="au-field__label">Proveedor</span><select class="au-select" name="provider" required [(ngModel)]="draft.providerId"><option value="" disabled>Elige…</option>@for (row of d.retention; track row.providerId) { <option [value]="row.providerId">{{ row.label }}</option> }</select></label>
            @for (field of termFields; track field.key) { <label class="au-field"><span class="au-field__label">{{ field.label }}</span><select class="au-select" [name]="field.key" [(ngModel)]="draft[field.key]">@for (term of termKeys; track term) { <option [value]="term">{{ terms[term] }}</option> }</select></label> }
            <label class="au-field"><span class="au-field__label">Válida hasta (opcional)</span><input class="au-input" type="date" name="validUntil" [(ngModel)]="draft.validUntil" /></label>
            <label class="au-field au-field--wide"><span class="au-field__label">Documento (https)</span><input class="au-input" type="url" name="documentUrl" required pattern="https://.+" [(ngModel)]="draft.documentUrl" /></label>
            <label class="au-field au-field--wide"><span class="au-field__label">Cláusula que lo dice</span><input class="au-input" name="notes" required maxlength="1000" [(ngModel)]="draft.notes" /></label>
          </div>
          <button class="au-btn au-btn--secondary au-mt-3" type="submit" [disabled]="!!busy() || !draft.providerId || !draft.documentUrl.startsWith('https://') || !draft.notes.trim()">Registrar, pendiente de aprobación</button>
        </form>
      </section>

      <section class="au-panel au-panel--padded" aria-labelledby="gv-retention">
        <div class="advanced-card-header head"><div><h2 class="au-panel__title" id="gv-retention">Retención y caché</h2><p>Se borra solo cada hora lo que pasa de su retención. Search Console se guarda {{ d.searchConsoleRetentionDays }} días.</p></div><button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="purge()">{{ busy() === 'purge' ? 'Borrando…' : 'Borrar ya lo caducado' }}</button></div>
        <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Respuestas guardadas" tabindex="0"><table class="au-table au-table--keep-columns"><thead><tr><th scope="col">Proveedor</th><th scope="col">Tipo</th><th scope="col" class="au-num">Guardadas</th><th scope="col" class="au-num">Reutilizaciones</th><th scope="col" class="au-num">Sin datos</th><th scope="col" class="au-num">Caducadas</th></tr></thead>
          <tbody>@for (row of d.cache; track row.provider_key + row.resource_type) { <tr><td>{{ row.provider_key }}</td><td>{{ row.resource_type }}</td><td class="au-num">{{ row.entries | number }}</td><td class="au-num">{{ row.hits | number }}</td><td class="au-num">{{ row.negative | number }}</td><td class="au-num">{{ row.expired | number }}</td></tr> } @empty { <tr><td colspan="6">Todavía no hay nada guardado.</td></tr> }</tbody></table></div>
        <h3 class="au-panel__title au-mt-4 au-mb-2">Frescura</h3>
        <p class="note">@for (entry of freshness(); track entry.label; let last = $last) { {{ entry.label }}: {{ entry.days }} días{{ last ? '.' : ' · ' }} } Se cambia en Presupuestos. Pasarla no compra nada.</p>
      </section>

      <section class="au-panel au-panel--padded" aria-labelledby="gv-provenance">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="gv-provenance">Procedencia de las métricas</h2><p>Cada cifra conserva quién la dio y con qué licencia se guardó.</p></div>
        <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Procedencia de las métricas" tabindex="0"><table class="au-table au-table--keep-columns"><thead><tr><th scope="col">Fuente</th><th scope="col">Guardar / compartir</th><th scope="col" class="au-num">Palabras</th><th scope="col" class="au-num">Completas</th><th scope="col">Entre</th><th scope="col" class="au-num">Caducan en 7 días</th></tr></thead>
          <tbody>@for (row of d.provenance; track $index) { <tr><td>{{ row.provider_id }} · {{ row.source }}</td><td>{{ terms[row.storage] ?? row.storage }} / {{ terms[row.sharing] ?? row.sharing }}</td><td class="au-num">{{ row.keywords | number }}</td><td class="au-num">{{ row.quality === null ? '—' : row.quality + ' %' }}</td><td>{{ row.oldest | date: 'd/MM/y' }} y {{ row.newest | date: 'd/MM/y' }}</td><td class="au-num">{{ row.expiring | number }}</td></tr> } @empty { <tr><td colspan="6">Todavía no hay métricas.</td></tr> }</tbody></table></div>
      </section>

      <section class="au-panel au-panel--padded" aria-labelledby="gv-sync">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="gv-sync">Sincronización de Search Console</h2><p>Solo el estado: las cifras son privadas de cada workspace.</p></div>
        <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Sincronización de Search Console" tabindex="0"><table class="au-table au-table--keep-columns"><thead><tr><th scope="col">Sitio</th><th scope="col">Estado</th><th scope="col">Datos hasta</th><th scope="col">Última sincronización</th><th scope="col">Fallos</th></tr></thead>
          <tbody>@for (row of d.sync; track row.siteId) { <tr><td>{{ row.site }}<br /><span class="note">{{ row.tenant }}</span></td><td>{{ consoleStates[row.status] ?? row.status }}</td><td>{{ row.syncedThrough ? (row.syncedThrough | date: 'd/MM/y') : '—' }}</td><td>{{ row.lastSuccessAt ? (row.lastSuccessAt | date: 'd/MM/y, HH:mm') : '—' }}</td><td>{{ row.failureCount }}{{ row.lastError ? ': ' + row.lastError : '' }}</td></tr> } @empty { <tr><td colspan="5">Ningún sitio la ha conectado.</td></tr> }</tbody></table></div>
      </section>
    } @else if (!failed()) { <div class="au-skeleton-list" aria-label="Cargando datos y gobierno">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 72px"></div> }</div> }
  `,
})
export class SeoGovernanceComponent implements OnInit {
  private readonly api = inject(AdminSeoOpsApiService);
  private readonly admin = inject(AdminApiService);
  private readonly app = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly warnings = WARNINGS;
  readonly terms = TERMS;
  readonly termKeys = Object.keys(TERMS);
  readonly consoleStates = SEARCH_CONSOLE_STATUS;
  readonly states: Record<string, string> = { pending: 'Pendiente de aprobar', approved: 'Aprobado', revoked: 'Revocado' };
  readonly termFields = [{ key: 'commercialUse', label: 'Uso comercial' }, { key: 'storage', label: 'Guardar' }, { key: 'crossTenantSharing', label: 'Compartir entre workspaces' }] as const;
  readonly data = signal<Governance | null>(null);
  readonly busy = signal('');
  readonly failed = signal('');
  readonly licences = computed(() => (this.data()?.licences ?? []).map((row) => ({ ...this.data()!.retention.find((entry) => entry.providerId === row.providerId)!, ...row })));
  readonly freshness = computed(() => Object.entries(this.data()?.freshness ?? {}).map(([key, value]) => ({ label: SEO_CAPABILITY_LABELS[key] ?? key, days: value.days })));
  draft = { providerId: '', commercialUse: 'unverified', storage: 'unverified', crossTenantSharing: 'unverified', documentUrl: '', notes: '', validUntil: '' };

  ngOnInit(): void {
    void this.load();
  }

  mine(record: LicenseRecord): boolean {
    return record.createdBy === this.app.user()?.email;
  }

  async load(): Promise<void> {
    try {
      this.data.set(await firstValueFrom(this.api.governance()));
      this.failed.set('');
    } catch (error) {
      this.failed.set(seoError(error, 'No se han podido cargar los datos de gobierno.'));
    }
  }

  private async work(name: string, run: () => Promise<string>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(name);
    try {
      this.toast.success(await run());
    } catch (error) {
      this.toast.error(seoError(error));
    } finally {
      this.busy.set('');
      await this.load();
    }
  }

  async toggleSharing(d: Governance): Promise<void> {
    const on = !d.sharing.requested;
    if (on && !(await this.confirm.confirm({ title: '¿Compartir datos de mercado?', message: `Las métricas de ${d.sharing.eligible.join(', ')} que se guarden con esa licencia podrán responder a otros workspaces, palabra por palabra y sin decir quién las obtuvo.`, confirmLabel: 'Compartir', cancelLabel: 'Cancelar' }))) return;
    await this.work('sharing', async () => {
      const { policy } = await firstValueFrom(this.admin.seoGovernor());
      // The whole policy is stored at once: what is not sent goes back to its default.
      const { freshness, ...rest } = policy;
      await firstValueFrom(this.admin.setSeoPolicy({ ...rest, shareMarketData: on, freshnessDays: Object.fromEntries(Object.entries(freshness).map(([key, range]) => [key, range.days])) }));
      return on ? 'Datos de mercado compartidos.' : 'Ya no se comparten.';
    });
  }
  record(): Promise<void> {
    return this.work('record', async () => {
      const { validUntil, ...rest } = this.draft;
      await firstValueFrom(this.api.recordLicense({ ...rest, ...(validUntil ? { validUntil } : {}) }));
      this.draft = { providerId: '', commercialUse: 'unverified', storage: 'unverified', crossTenantSharing: 'unverified', documentUrl: '', notes: '', validUntil: '' };
      return 'Registrada. Falta que la apruebe otro administrador.';
    });
  }
  async approve(record: LicenseRecord): Promise<void> {
    if (!(await this.confirm.confirm({ title: '¿Aprobar esta licencia?', message: `${record.providerId}: ${record.notes}. Confirma que has leído el documento.`, confirmLabel: 'Aprobar', cancelLabel: 'Cancelar' }))) return;
    await this.work('approve', async () => {
      await firstValueFrom(this.api.approveLicense(record.id));
      return 'Licencia aprobada.';
    });
  }
  async revoke(record: LicenseRecord): Promise<void> {
    if (!(await this.confirm.confirm({ title: '¿Revocar este registro?', message: 'Deja de contar en el acto. Si de él dependía compartir datos, se deja de compartir.', confirmLabel: 'Revocar', cancelLabel: 'Cancelar', danger: true }))) return;
    await this.work('revoke', async () => {
      await firstValueFrom(this.api.revokeLicense(record.id));
      return 'Registro revocado.';
    });
  }
  async purge(): Promise<void> {
    if (!(await this.confirm.confirm({ title: '¿Borrar lo caducado?', message: 'Se borran para siempre los datos de proveedores que ya pasaron de su retención. Nada que siga en vigor.', confirmLabel: 'Borrar', cancelLabel: 'Cancelar', danger: true }))) return;
    await this.work('purge', async () => `${(await firstValueFrom(this.api.purge())).deleted} registros borrados.`);
  }
}
