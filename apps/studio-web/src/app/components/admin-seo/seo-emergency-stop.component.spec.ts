import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { SeoEmergencyStopComponent } from './seo-emergency-stop.component';

describe('SeoEmergencyStopComponent', () => {
  const api = jasmine.createSpyObj<AdminApiService>('api', ['seoGovernor', 'setSeoEmergencyStop']);
  const confirm = jasmine.createSpyObj<ConfirmService>('confirm', ['confirm']);
  const create = async (active: boolean) => {
    api.seoGovernor.and.returnValue(of({ emergency: { active, at: '2026-11-25T10:00:00Z', reason: null } }) as never);
    api.setSeoEmergencyStop.calls.reset();
    confirm.confirm.calls.reset();
    await TestBed.configureTestingModule({
      imports: [SeoEmergencyStopComponent],
      providers: [{ provide: AdminApiService, useValue: api }, { provide: ConfirmService, useValue: confirm }, { provide: ToastService, useValue: { success: () => undefined, error: () => undefined } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeoEmergencyStopComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    return { fixture, button };
  };

  it('stops everything without asking for confirmation', async () => {
    api.setSeoEmergencyStop.and.returnValue(of({}) as never);
    const { fixture, button } = await create(false);
    expect(button.textContent!.trim()).toBe('Parar todo ahora');
    button.click();
    await fixture.whenStable();
    expect(confirm.confirm).not.toHaveBeenCalled();
    expect(api.setSeoEmergencyStop).toHaveBeenCalledOnceWith(true, '');
  });

  it('asks before lifting the stop, and does nothing if declined', async () => {
    api.setSeoEmergencyStop.and.returnValue(of({}) as never);
    confirm.confirm.and.resolveTo(false);
    const { fixture, button } = await create(true);
    expect(button.textContent!.trim()).toBe('Levantar la parada');
    button.click();
    await fixture.whenStable();
    expect(confirm.confirm).toHaveBeenCalledTimes(1);
    expect(api.setSeoEmergencyStop).not.toHaveBeenCalled();
    confirm.confirm.and.resolveTo(true);
    button.click();
    await fixture.whenStable();
    expect(api.setSeoEmergencyStop).toHaveBeenCalledOnceWith(false, '');
  });
});
