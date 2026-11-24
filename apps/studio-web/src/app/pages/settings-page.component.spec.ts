import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { throwError } from 'rxjs';
import { SettingsPageComponent } from './settings-page.component';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import type { StudioRoleSummary, StudioUserSummary } from '../models/studio.models';

describe('Settings access', () => {
  it('blocks nondelegable roles and keeps the proposed changes after a rejected save', async () => {
    const updateUser = jasmine.createSpy().and.returnValue(throwError(() => ({ error: { message: 'last_admin' } })));
    TestBed.configureTestingModule({ providers: [
      { provide: ActivatedRoute, useValue: {} },
      { provide: Router, useValue: {} },
      { provide: AppContextService, useValue: { session: () => ({ user: { id: 'me' } }) } },
      { provide: StudioApiService, useValue: { updateUser } },
      { provide: ToastService, useValue: {} },
      { provide: ConfirmService, useValue: {} },
    ] });
    const component = TestBed.runInInjectionContext(() => new SettingsPageComponent());
    component.accessPermissions = ['users.manage'];
    const role = { id: 'role', key: 'editor', permissions: ['projects.manage'] } as StudioRoleSummary;
    expect(component.canDelegate(role)).toBeFalse();
    role.permissions = ['users.manage'];
    expect(component.canDelegate(role)).toBeTrue();
    const member = { id: 'member', displayName: 'Original', status: 'active', roles: [] } as unknown as StudioUserSummary;
    component.openMemberAccess(member, { open: true, showModal: jasmine.createSpy() } as unknown as HTMLDialogElement);
    component.memberName = 'Edited';
    component.toggleMemberRole(role.id, true);
    await component.saveMemberAccess({ open: true } as HTMLDialogElement);
    expect(updateUser).toHaveBeenCalledOnceWith(member.id, { displayName: 'Edited', roleIds: [role.id] });
    expect(component.memberRoleIds).toEqual([role.id]);
    expect(component.memberName).toBe('Edited');
    expect(component.error).toBe('last_admin');
  });
});
