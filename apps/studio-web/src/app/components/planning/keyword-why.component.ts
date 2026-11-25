import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { KeywordOrigin, PlanItemSelectionView } from '../../models/planning.models';
import { evidenceOf } from './planning-utils';

const ORIGIN: Record<KeywordOrigin['kind'], (value: string) => string> = {
  competitor: (value) => `${value} (competidor) posiciona para esta palabra`,
  opportunity: (value) => `sale de "${value}", un tema que cubren tus competidores y tu sitio no`,
  site_topic: (value) => `sale de "${value}", un tema principal de tu sitio`,
  cluster: (value) => `sale de "${value}", un grupo de temas de tu sitio`,
  search_console: () => 'Search Console ya muestra tu sitio para esa búsqueda y ninguna página la cubre',
};

const PARTS = [
  { key: 'demand', label: 'Demanda', hint: 'búsquedas al mes o, sin ellas, impresiones propias' },
  { key: 'winnability', label: 'Alcanzable', hint: 'posición media propia o dificultad frente a lo que tu sitio puede posicionar' },
  { key: 'relevance', label: 'Relevancia', hint: 'encaje con los temas de tu sitio' },
  { key: 'intentFit', label: 'Intención', hint: 'tipo de búsqueda' },
] as const;

/** Read-only: why a plan item has its keyword, from the stored research (never reconstructed). */
@Component({
  selector: 'app-keyword-why',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    :host { display: grid; gap: 14px; }
    h3 { margin: 0 0 4px; font-size: 14px; }
    p { margin: 0; }
    .kw-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 0; }
    .kw-facts div { padding: 10px 12px; border: 1px solid var(--au-border); border-radius: 10px; background: var(--au-table-head); }
    dt { color: var(--au-muted); font-size: 12px; }
    dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
    .kw-part { display: grid; grid-template-columns: 110px 1fr 44px; align-items: center; gap: 10px; font-size: 13px; }
    .kw-part small { grid-column: 2 / -1; color: var(--au-muted); }
    .kw-bar { height: 8px; border-radius: 999px; background: var(--au-border); overflow: hidden; }
    .kw-bar i { display: block; height: 100%; background: var(--au-brand); }
    .kw-parts { display: grid; gap: 10px; }
    ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
    .kw-muted { color: var(--au-muted); font-size: 13px; overflow-wrap: anywhere; }
  `],
  template: `
    @if (view; as v) {
      <section>
        <h3>Motivo</h3>
        <p>{{ reason() }}</p>
        @if (v.item.rationale) { <p class="kw-muted">Nota del plan: {{ v.item.rationale }}</p> }
      </section>
      <dl class="kw-facts">
        <div><dt>Búsquedas al mes</dt><dd>{{ v.item.searchVolume !== null ? (v.item.searchVolume | number) : 'Sin dato' }}</dd></div>
        <div><dt>Dificultad (KD)</dt><dd>{{ v.item.keywordDifficulty ?? 'Sin dato' }}</dd></div>
        <div><dt>Puntuación</dt><dd>{{ v.selection?.score ?? 'Sin medir' }}</dd></div>
        <div><dt>Puesto</dt><dd>{{ v.selection?.rank ? v.selection!.rank + ' de ' + (v.research?.candidates?.length ?? '—') : '—' }}</dd></div>
      </dl>
      @if (v.selection?.parts; as parts) {
        <section class="kw-parts" aria-label="Desglose de la puntuación">
          <h3>Cómo se calculó la puntuación</h3>
          @for (part of partRows; track part.key) {
            <div class="kw-part">
              <span>{{ part.label }}</span>
              <span class="kw-bar" aria-hidden="true"><i [style.width.%]="(parts[part.key] ?? 0) * 100"></i></span>
              <span>{{ parts[part.key] === null ? 'Sin dato' : (parts[part.key]! * 100 | number: '1.0-0') + '%' }}</span>
              <small>{{ part.hint }}</small>
            </div>
          }
          <p class="kw-muted">La puntuación combina los factores conocidos con los pesos de tu sitio; los que no se conocen no cuentan.</p>
        </section>
      }
      <section>
        <h3>Plan e investigación</h3>
        <p>
          <a routerLink="/studio/plan" [queryParams]="{ plan: v.plan.id, item: v.item.id }">{{ v.plan.name }}</a>
          @if (v.research; as run) { · investigación del {{ run.at | date: 'd/MM/y, HH:mm' }} }
        </p>
        @if (v.research; as run) {
          @if (run.provider) {
            <p class="kw-muted">{{ run.rows | number }} palabras analizadas a partir de {{ seeds(run) }}{{ run.competitors.length ? ' y de ' + run.competitors.join(', ') : '' }}. Dificultad alcanzable estimada: {{ run.reachableDifficulty }}.</p>
          } @else {
            <p class="kw-muted">Esta ejecución no tuvo palabras medidas: las propuso la IA a partir de los temas de tu sitio.</p>
          }
        } @else if (v.selection?.source !== 'user') {
          <p class="kw-muted">Este elemento se planificó antes de guardar la investigación: no hay registro de las alternativas que se valoraron.</p>
        }
      </section>
      @if (evidence().length) {
        <section>
          <h3>Evidencias del brief</h3>
          <ul>@for (entry of evidence(); track entry.title) { <li class="kw-muted">{{ entry.title }}{{ entry.url ? ' · ' + entry.url : '' }}</li> }</ul>
        </section>
      }
      @if (v.history.length) {
        <section>
          <h3>Cambios de palabra clave</h3>
          <ul>@for (change of v.history; track change.at) { <li class="kw-muted">{{ change.at | date: 'd/MM/y, HH:mm' }} · "{{ change.from ?? '—' }}" → "{{ change.to }}"{{ change.by ? ' · ' + change.by : '' }}</li> }</ul>
        </section>
      }
    }
  `,
})
export class KeywordWhyComponent {
  @Input() view: PlanItemSelectionView | null = null;
  readonly partRows = PARTS;

  reason(): string {
    const { selection, item } = this.view!;
    const origin = selection?.origin ? ORIGIN[selection.origin.kind](selection.origin.value) : '';
    if (!selection) return 'No hay registro de por qué se eligió esta palabra.';
    if (selection.source === 'user') return `La eligió tu equipo.${origin ? ` En la investigación, ${origin}.` : ' No estaba entre las candidatas medidas.'}`;
    if (selection.source === 'model') return 'La propuso la IA a partir de los temas de tu sitio; no salió de la investigación de palabras medidas.';
    return `"${item.primaryKeyword}" se eligió por su puntuación (${selection.score} de 100)${selection.rank ? `, la n.º ${selection.rank} entre las candidatas` : ''}${origin ? `: ${origin}` : ''}.`;
  }

  seeds(run: NonNullable<PlanItemSelectionView['research']>): string {
    return run.seeds.map((seed) => `"${seed.keyword}"`).join(', ') || 'los temas de tu sitio';
  }

  evidence() {
    return evidenceOf(this.view?.item.sourceEvidence);
  }
}
