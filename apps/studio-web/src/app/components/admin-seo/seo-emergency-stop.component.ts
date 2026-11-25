import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApiService, AdminSeoGovernor } from '../../services/admin-api.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { SEO_LOCALE, seoError } from '../seo-labels';

/** Always at hand in the operations center, whatever its section. */
@Component({
  selector: 'app-seo-emergency-stop',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule],
  styles: [`.row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; } .row p { margin: 4px 0 0; color: var(--au-muted); font-size: var(--au-fs-body-sm); } .row > div { flex: 1 1 280px; } .row input { flex: 1 1 200px; max-width: 320px; }`],
  template: `
    @if (emergency(); as e) {
      @if (e.active) { <div class="au-banner au-banner--error" role="status"><span class="au-banner__text"><strong>Parada de emergencia activa</strong> desde el {{ e.at | date: 'd/MM/y, HH:mm' }}{{ e.reason ? ': ' + e.reason : '' }}. No sale ninguna petición nueva; las que ya habían salido terminan y se contabilizan.</span></div> }
      <section class="au-panel au-panel--padded row" aria-labelledby="es-title">
        <div>
          <h2 class="au-panel__title" id="es-title">Parada de emergencia</h2>
          <p>Corta en el acto todas las peticiones externas, pruebas incluidas. Las ya enviadas no se pueden recuperar: terminan y se contabilizan.</p>
        </div>
        @if (!e.active) { <input class="au-input" [(ngModel)]="reason" name="stop-reason" placeholder="Motivo (opcional)" aria-label="Motivo de la parada" maxlength="300" /> }
        <button class="au-btn" [class.au-btn--danger]="!e.active" [class.au-btn--secondary]="e.active" type="button" [disabled]="busy()" (click)="toggle(!e.active)">{{ e.active ? 'Levantar la parada' : 'Parar todo ahora' }}</button>
      </section>
    }
  `,
})
export class SeoEmergencyStopComponent implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly changed = output<void>();
  readonly forbidden = output<void>();
  readonly emergency = signal<AdminSeoGovernor['emergency'] | null>(null);
  readonly busy = signal(false);
  reason = '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.seoGovernor().subscribe({ next: (data) => this.emergency.set(data.emergency), error: (error: { status?: number }) => (error.status === 403 ? this.forbidden.emit() : this.toast.error('No se ha podido leer la parada de emergencia.')) });
  }

  /** Stopping asks nothing: it must be instant. Lifting it lets money out again, so it does. */
  async toggle(active: boolean): Promise<void> {
    if (!active && !(await this.confirm.confirm({ title: '¿Levantar la parada de emergencia?', message: 'Las peticiones de pago volverán a salir dentro de los presupuestos, con el modo de trabajo que había.', confirmLabel: 'Levantar', cancelLabel: 'Cancelar' }))) return;
    this.busy.set(true);
    this.api.setSeoEmergencyStop(active, this.reason).subscribe({
      next: () => {
        this.busy.set(false);
        this.reason = '';
        this.toast.success(active ? 'Parada activa: no sale ninguna petición.' : 'Parada levantada.');
        this.load();
        this.changed.emit();
      },
      error: (error) => {
        this.busy.set(false);
        this.toast.error(seoError(error));
      },
    });
  }
}
