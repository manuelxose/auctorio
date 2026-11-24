import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApiService, AdminSeo, AdminSeoProvider } from '../services/admin-api.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { SeoGovernorSettingsComponent } from './seo-governor-settings.component';
import { SEO_CAPABILITY_LABELS as CAPABILITY_LABELS } from './seo-labels';

const MODE_LABELS: Record<string, string> = {
  disabled: 'SEO externo desactivado',
  dataforseo_only: 'Solo DataForSEO',
  anyapi_only: 'Solo AnyAPI',
  manual: 'Elegir por capacidad',
  cost_optimized: 'Optimizado por coste (bloqueado hasta cumplir las condiciones de producción)',
};
const REASONS: Record<string, string> = {
  external_disabled: 'llamadas externas desactivadas',
  provider_disabled: 'proveedor desactivado',
  not_configured: 'sin credenciales',
  not_selected: 'sin proveedor elegido',
  unsupported_capability: 'no disponible',
  emergency_stop: 'parada de emergencia',
  license_prohibited: 'su licencia no lo permite',
  paid_automation_locked: 'automatización bloqueada: faltan condiciones de producción',
  automatic_routing_locked: 'enrutado automático bloqueado: faltan condiciones de producción',
};

/** External SEO providers: mode, kill switch, credentials, priority and authorized live tests (platform admins). */
@Component({
  selector: 'app-seo-provider-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, SeoGovernorSettingsComponent],
  styles: ['.au-row { flex-wrap: wrap; } .au-row__title { min-width: 160px; } .seo-select { width: 200px; } .au-row__meta { white-space: normal; }'],
  template: `
    <section class="au-panel au-panel--padded" *ngIf="seo as s">
      <h2 class="au-panel__title">Modo de trabajo</h2>
      <p class="au-panel__subtitle au-mb-3">Abrir esta página no llama a ningún proveedor. Nunca se paga a otro proveedor como respaldo.</p>
      <div class="au-row">
        <select class="au-input au-flex-1" [ngModel]="s.mode" (ngModelChange)="setMode($event)" name="seo-mode" aria-label="Modo de trabajo">
          <option *ngFor="let m of s.modes" [value]="m.id" [disabled]="m.locked">{{ modeLabel(m.id) }}</option>
        </select>
        <button class="au-btn" type="button" *ngIf="s.mode !== 'disabled'" (click)="disableAll()">Desactivar todo el SEO externo</button>
      </div>
      <div class="au-row" *ngFor="let c of s.capabilities">
        <span class="au-row__title">{{ capabilityLabel(c.id) }}</span>
        <span class="au-badge" [ngClass]="c.provider ? 'au-badge--brand' : 'au-badge--neutral'">{{ c.provider ? providerLabel(c.provider) : reason(c.reason) }}</span>
        <select class="au-input seo-select" *ngIf="s.mode === 'manual'" [ngModel]="s.routing[c.id] ?? ''" (ngModelChange)="route(c.id, $event)" [name]="'route-' + c.id" [attr.aria-label]="'Proveedor para ' + capabilityLabel(c.id)">
          <option value="">Ninguno</option>
          <option *ngFor="let p of supporting(c.id)" [value]="p.id">{{ p.label }}</option>
        </select>
      </div>
    </section>

    <app-seo-governor-settings *ngIf="seo" class="au-mt-4" style="display: block" (changed)="load()" />

    <section class="au-panel au-panel--padded au-mt-4" *ngFor="let p of seo?.providers">
      <h2 class="au-panel__title">{{ p.label }}</h2>
      <div class="au-row">
        <span class="au-badge" [ngClass]="p.enabled ? 'au-badge--brand' : 'au-badge--neutral'">{{ p.enabled ? 'Activado' : 'Desactivado' }}</span>
        <span class="au-badge au-badge--outline">{{ p.configured ? 'Con credenciales' : 'Sin credenciales' }}</span>
        <span class="au-badge au-badge--outline">Verificación real: {{ verificationLabel(p.liveVerification) }}</span>
        <span class="au-badge au-badge--neutral" *ngIf="p.automationLocked">Automatización bloqueada: faltan condiciones de producción</span>
        <label class="au-row__meta">Prioridad
          <input class="au-input" style="width: 80px" type="number" min="1" max="999" [ngModel]="p.priority" (change)="setPriority(p, $event)" [name]="'prio-' + p.id" />
        </label>
        <button class="au-btn" type="button" (click)="toggle(p)">{{ p.enabled ? 'Desactivar' : 'Activar' }}</button>
      </div>
      <div class="au-row" *ngFor="let c of p.credentials">
        <span class="au-row__title">{{ c.label }}</span>
        <span class="au-badge au-badge--neutral">{{ c.source === 'ui' ? 'Guardada (panel)' : c.source === 'env' ? 'Guardada (servidor)' : 'Sin definir' }}</span>
        <input class="au-input au-flex-1" type="password" autocomplete="off" [placeholder]="c.envName" [(ngModel)]="drafts[c.envName]" [name]="'cred-' + c.envName" [attr.aria-label]="p.label + ' ' + c.label" />
        <button class="au-btn" type="button" [disabled]="!drafts[c.envName]" (click)="saveCredential(p, c.envName, drafts[c.envName])">Guardar</button>
        <button class="au-btn" type="button" *ngIf="c.source === 'ui'" (click)="saveCredential(p, c.envName, '')">Quitar</button>
      </div>
      <div class="au-row" *ngIf="p.health.circuit as circuit">
        <span class="au-badge au-badge--warning">En pausa hasta {{ circuit.until | date: 'short' }} ({{ circuit.reason }})</span>
        <button class="au-btn au-btn--sm" type="button" (click)="resetCircuit(p)">Reintentar ya</button>
      </div>
      <p class="au-muted au-mt-2" *ngIf="p.health.lastErrorAt">Último error {{ p.health.lastErrorAt | date: 'short' }}: {{ p.health.lastErrorCode }} — {{ p.health.lastErrorMessage }}</p>
      <p class="au-muted au-mt-2" *ngIf="p.health.lastSuccessAt">Último acierto {{ p.health.lastSuccessAt | date: 'short' }}</p>

      <h3 class="au-panel__title au-mt-4 au-mb-2">Capacidades</h3>
      <div class="au-row" *ngFor="let id of capabilityIds">
        <span class="au-row__title">{{ capabilityLabel(id) }}</span>
        <span class="au-badge" [ngClass]="p.capabilities[id].supported ? 'au-badge--brand' : 'au-badge--neutral'">{{ p.capabilities[id].supported ? dataKindLabel(p.capabilities[id].dataKind) : 'no disponible' }}</span>
        <span class="au-row__meta">{{ p.capabilities[id].degraded || p.capabilities[id].reason || p.capabilities[id].methodology }}</span>
      </div>
      <p class="au-muted au-mt-2">
        Uso comercial: {{ licenceLabel(p.licensing.commercialUse) }} · Almacenamiento: {{ licenceLabel(p.licensing.storage) }} · Compartir entre workspaces: {{ licenceLabel(p.licensing.crossTenantSharing) }} ·
        <a [href]="p.licensing.termsUrl" target="_blank" rel="noopener noreferrer">Términos</a> revisados el {{ p.licensing.checkedAt }}
      </p>

      <h3 class="au-panel__title au-mt-4 au-mb-2">Prueba real (de pago)</h3>
      <div class="au-row">
        <select class="au-input seo-select" [(ngModel)]="test[p.id].capability" [name]="'tc-' + p.id" [attr.aria-label]="'Capacidad que probar en ' + p.label">
          <option *ngFor="let id of capabilityIds" [value]="id">{{ capabilityLabel(id) }}</option>
        </select>
        <input class="au-input" style="width: 90px" [(ngModel)]="test[p.id].locale" [name]="'tl-' + p.id" [attr.aria-label]="'Idioma y país que probar en ' + p.label" />
        <label class="au-row__meta">Máx. USD
          <input class="au-input" style="width: 90px" type="number" step="0.01" min="0" [max]="seo!.maxTestSpendUsd" [(ngModel)]="test[p.id].maxSpendUsd" [name]="'ts-' + p.id" />
        </label>
        <button class="au-btn" type="button" [disabled]="!p.enabled || !p.configured || testing || !test[p.id].maxSpendUsd" (click)="runTest(p)">Autorizar y probar</button>
      </div>
    </section>
    <p class="au-muted au-mt-2">Las credenciales se guardan cifradas y no se vuelven a mostrar. Las guardadas aquí tienen prioridad sobre las del servidor.</p>
  `,
})
export class SeoProviderSettingsComponent implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  @Output() readonly forbidden = new EventEmitter<void>();
  readonly capabilityIds = Object.keys(CAPABILITY_LABELS);
  seo: AdminSeo | null = null;
  drafts: Record<string, string> = {};
  test: Record<string, { capability: string; locale: string; maxSpendUsd: number | null }> = {};
  testing = false;

  ngOnInit(): void {
    this.load();
  }

  modeLabel = (id: string) => MODE_LABELS[id] ?? id;
  capabilityLabel = (id: string) => CAPABILITY_LABELS[id] ?? id;
  reason = (code: string | null) => REASONS[code ?? ''] ?? code ?? 'no disponible';
  verificationLabel = (state: string) => ({ pending: 'pendiente', partial: 'parcial', verified: 'verificada' } as Record<string, string>)[state] ?? state;
  licenceLabel = (state: string) => ({ permitted: 'permitido', prohibited: 'prohibido', unverified: 'sin verificar' } as Record<string, string>)[state] ?? state;
  dataKindLabel = (kind?: string) => ({ observed: 'observado', provider_reported: 'del proveedor', estimated: 'estimado', historical: 'histórico' } as Record<string, string>)[kind ?? ''] ?? kind;
  providerLabel = (id: string) => this.seo?.providers.find((p) => p.id === id)?.label ?? id;
  supporting = (capability: string) => this.seo?.providers.filter((p) => p.capabilities[capability].supported) ?? [];

  load(): void {
    this.api.seo().subscribe({
      next: (seo) => {
        for (const p of seo.providers) this.test[p.id] ??= { capability: 'keyword_metrics', locale: 'es-ES', maxSpendUsd: null };
        this.seo = seo;
      },
      error: (e: { status?: number }) => (e.status === 403 ? this.forbidden.emit() : this.toast.error('No se han podido cargar los proveedores SEO.')),
    });
  }

  private after(message: string) {
    return {
      next: () => { this.toast.success(message); this.load(); },
      error: (e: { error?: { message?: string } }) => { this.toast.error(e?.error?.message ?? 'No se ha podido guardar.'); this.load(); },
    };
  }

  setMode(mode: string): void {
    this.api.setSeoControl({ mode }).subscribe(this.after('Modo de trabajo guardado.'));
  }

  disableAll(): void {
    this.api.setSeoControl({ mode: 'disabled' }).subscribe(this.after('Todo el SEO externo está desactivado.'));
  }

  route(capability: string, providerId: string): void {
    this.api.setSeoControl({ routing: { ...this.seo!.routing, [capability]: providerId } }).subscribe(this.after('Proveedor guardado.'));
  }

  toggle(p: AdminSeoProvider): void {
    this.api.updateSeoProvider(p.id, { enabled: !p.enabled }).subscribe(this.after(`${p.label}: ${p.enabled ? 'desactivado' : 'activado'}.`));
  }

  setPriority(p: AdminSeoProvider, event: Event): void {
    this.api.updateSeoProvider(p.id, { priority: Number((event.target as HTMLInputElement).value) }).subscribe(this.after('Prioridad guardada.'));
  }

  resetCircuit(p: AdminSeoProvider): void {
    this.api.updateSeoProvider(p.id, { resetCircuit: true }).subscribe(this.after(`${p.label}: se volverá a intentar.`));
  }

  saveCredential(p: AdminSeoProvider, envName: string, value: string): void {
    this.drafts[envName] = '';
    this.api.setSeoCredential(p.id, envName, value).subscribe(this.after(value ? 'Guardada.' : 'Quitada.'));
  }

  async runTest(p: AdminSeoProvider): Promise<void> {
    const input = this.test[p.id];
    const ok = await this.confirm.confirm({ title: `¿Llamar ahora a ${p.label}?`, message: `Una petición real (${this.capabilityLabel(input.capability)}). Puede costar hasta ${input.maxSpendUsd} USD.`, confirmLabel: 'Autorizar y probar' });
    if (!ok) return;
    this.testing = true;
    this.api.testSeoProvider(p.id, { capability: input.capability, locale: input.locale, maxSpendUsd: Number(input.maxSpendUsd), authorize: true, requestId: crypto.randomUUID() }).subscribe({
      next: (r) => { this.testing = false; this.toast.success(`${r.rows} filas; coste ${r.costUsd ?? 'no informado'} USD.`); this.load(); },
      error: (e) => { this.testing = false; this.toast.error(e?.error?.message ?? 'La prueba ha fallado.'); this.load(); },
    });
  }
}
