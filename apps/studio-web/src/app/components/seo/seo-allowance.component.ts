import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { ResearchAllowance } from '../../services/seo-intelligence-api.service';
import { SEO_LOCALE, ALLOWANCE_STATES } from '../seo-labels';
import { AppIconComponent } from '../ui/app-icon.component';

/** What is left of the subscription's research allowance, and why nothing new is being asked. Never an amount. */
@Component({
  selector: 'app-seo-allowance',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, AppIconComponent],
  template: `
    <div class="au-banner" [ngClass]="'au-banner--' + state().tone" [attr.role]="state().tone === 'error' ? 'alert' : 'status'">
      <app-icon [name]="state().tone === 'info' ? 'info' : 'warning'"></app-icon>
      <span class="au-banner__text">
        <strong>{{ state().title }}</strong>@if (counted()) { · {{ allowance().usedPercent }} % usado{{ allowance().kind === 'onboarding' ? ' de la asignación de alta' : '' }}@if (allowance().renewsAt; as at) {, se renueva el {{ at | date: 'd/MM/y' }}} }. {{ state().text }}
        @if (allowance().held; as reason) { La plataforma no deja que empiece sola en este sitio: {{ reason }}. }
      </span>
    </div>
  `,
})
export class SeoAllowanceComponent {
  readonly allowance = input.required<ResearchAllowance>();
  readonly state = computed(() => ALLOWANCE_STATES[this.allowance().state] ?? ALLOWANCE_STATES['available']);
  readonly counted = computed(() => ['available', 'low', 'exhausted'].includes(this.allowance().state));
}
