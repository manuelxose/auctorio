import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminSeoOpsApiService, Governance } from '../../services/admin-seo-ops-api.service';
import { AppContextService } from '../../services/app-context.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { SeoGovernanceComponent } from './seo-governance.component';

const record = (id: string, createdBy: string) => ({ id, providerId: 'dataforseo', commercialUse: 'permitted', storage: 'permitted', crossTenantSharing: 'permitted', documentUrl: 'https://x.test/doc', notes: 'Cláusula 4', status: 'pending', validUntil: null, expired: false, createdBy, approvedBy: null, createdAt: '2026-11-25T10:00:00Z', createdByUserId: 'u' });
const governance = (patch: Partial<Governance> = {}): Governance => ({
  retention: [{ providerId: 'dataforseo', label: 'DataForSEO', storage: 'permitted', days: 30, termsUrl: 'https://x.test/terms', checkedAt: '2026-01-01' }],
  searchConsoleRetentionDays: 480, freshness: { serp: { days: 7 } }, licences: [{ providerId: 'dataforseo', commercialUse: 'permitted', storage: 'permitted', crossTenantSharing: 'unverified' }],
  records: [record('mine', 'me@x.test'), record('theirs', 'other@x.test')], sharing: { requested: false, eligible: ['dataforseo'], active: false }, provenance: [], cache: [], warnings: [], sync: [], ...patch,
} as Governance);

describe('SeoGovernanceComponent', () => {
  const ops = jasmine.createSpyObj<AdminSeoOpsApiService>('ops', ['governance']);
  const admin = jasmine.createSpyObj<AdminApiService>('admin', ['seoGovernor', 'setSeoPolicy']);
  const confirm = jasmine.createSpyObj<ConfirmService>('confirm', ['confirm']);
  const create = async (view: Governance) => {
    ops.governance.and.returnValue(of(view));
    admin.setSeoPolicy.calls.reset();
    await TestBed.configureTestingModule({
      imports: [SeoGovernanceComponent],
      providers: [{ provide: AdminSeoOpsApiService, useValue: ops }, { provide: AdminApiService, useValue: admin }, { provide: ConfirmService, useValue: confirm }, { provide: ToastService, useValue: { success: () => undefined, error: () => undefined } },
        { provide: AppContextService, useValue: { user: signal({ email: 'me@x.test' }) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeoGovernanceComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const buttons = (text: string) => [...host.querySelectorAll('button')].filter((entry) => entry.textContent!.trim() === text) as HTMLButtonElement[];
    return { fixture, host, buttons };
  };

  it('does not let the author approve their own pending record', async () => {
    const { host, buttons } = await create(governance());
    const [mine, theirs] = buttons('Aprobar');
    expect(mine.disabled).toBeTrue();
    expect(theirs.disabled).toBeFalse();
    expect(host.textContent).toContain('debe aprobarlo otro administrador');
  });

  it('disables sharing while no provider has an approved licence', async () => {
    const { buttons } = await create(governance({ sharing: { requested: false, eligible: [], active: false } }));
    expect(buttons('Compartir')[0].disabled).toBeTrue();
  });

  it('enables sharing with an eligible provider', async () => {
    const { buttons } = await create(governance());
    expect(buttons('Compartir')[0].disabled).toBeFalse();
  });

  it('sends the whole policy, with freshnessDays, when sharing is switched off', async () => {
    admin.seoGovernor.and.returnValue(of({ policy: { mode: 'automatic', shareMarketData: true, freshness: { serp: { days: 7 } } } }) as never);
    admin.setSeoPolicy.and.returnValue(of({}) as never);
    const { fixture, buttons } = await create(governance({ sharing: { requested: true, eligible: ['dataforseo'], active: true } }));
    buttons('Dejar de compartir')[0].click();
    await fixture.whenStable();
    expect(admin.setSeoPolicy).toHaveBeenCalledOnceWith({ mode: 'automatic', shareMarketData: false, freshnessDays: { serp: 7 } } as never);
  });
});
