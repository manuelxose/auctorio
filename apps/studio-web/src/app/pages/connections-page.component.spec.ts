import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ConnectionsPageComponent } from './connections-page.component';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';

describe('Connections loading', () => {
  it('merges linked social records after all requests and reports partial failures', () => {
    const social = new Subject<any>();
    const api = {
      listSocialConnections: () => social,
      listPublishingAccounts: () => of({ items: [{ id: 's', platform: 'x', status: 'active', enabled: true }] }),
      listConnectorInstallations: () => of({ items: [{ id: 'i', kind: 'x', externalAccountId: 's', state: 'active' }] }),
      getSocialSetup: () => throwError(() => new Error('offline')),
    };
    TestBed.configureTestingModule({ providers: [
      { provide: AppContextService, useValue: { permissions: () => [], sites: () => [] } },
      { provide: StudioApiService, useValue: api },
      { provide: ConfirmService, useValue: {} }, { provide: ToastService, useValue: {} },
      { provide: ActivatedRoute, useValue: {} }, { provide: Router, useValue: {} }, { provide: PLATFORM_ID, useValue: 'server' },
    ] });
    const page = TestBed.runInInjectionContext(() => new ConnectionsPageComponent());
    page.load();
    expect(page.loading).toBeTrue();
    social.next({ items: [{ id: 's', platform: 'x', displayName: 'Account', provider: 'native', connectionState: 'connected' }] });
    social.complete();
    expect(page.loading).toBeFalse();
    expect(page.rows.length).toBe(1);
    expect(page.loadError).toContain('social setup');
    expect(page.canManage).toBeFalse();
  });
  it('ignores an earlier request that finishes after a reload', () => {
    const old = new Subject<any>(); const fresh = new Subject<any>(); let count = 0;
    TestBed.configureTestingModule({ providers: [
      { provide: AppContextService, useValue: { permissions: () => [], sites: () => [] } },
      { provide: StudioApiService, useValue: {
        listSocialConnections: () => (++count === 1 ? old : fresh),
        listPublishingAccounts: () => of({ items: [] }), listConnectorInstallations: () => of({ items: [] }),
        getSocialSetup: () => of({ provider: { configured: true } }),
      } },
      { provide: ConfirmService, useValue: {} }, { provide: ToastService, useValue: {} },
      { provide: ActivatedRoute, useValue: {} }, { provide: Router, useValue: {} }, { provide: PLATFORM_ID, useValue: 'server' },
    ] });
    const page = TestBed.runInInjectionContext(() => new ConnectionsPageComponent());
    page.load(); page.load();
    fresh.next({ items: [{ id: 'new', platform: 'x', displayName: 'New', provider: 'native', connectionState: 'connected' }] }); fresh.complete();
    old.next({ items: [{ id: 'old', platform: 'x', displayName: 'Old', provider: 'native', connectionState: 'connected' }] }); old.complete();
    expect(page.rows.map((row) => row.id)).toEqual(['new']);
  });
});
