import { signal } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AppContextService } from '../../services/app-context.service';
import { KeywordPage, SeoIntelligenceApiService, SiteKeywordRow } from '../../services/seo-intelligence-api.service';
import { ToastService } from '../../services/toast.service';
import { SeoKeywordsComponent } from './seo-keywords.component';

const row = (keyword: string, patch: Partial<SiteKeywordRow> = {}): SiteKeywordRow => ({
  id: keyword, keyword, market: 'es-ES', status: 'relevant', reason: null, score: null, cluster: null, volume: null, difficulty: null, cpc: null, intent: null, quality: null, measuredAt: null, ageDays: null, freshness: 'unmeasured',
  impressions: null, clicks: null, position: null, page: null, opportunity: null, discoveries: [], ...patch,
});
const page = (...items: SiteKeywordRow[]): KeywordPage => ({ items, total: items.length, page: 1, pages: 1, counts: { discovered: items.length, relevant: items.length, opportunity: 0, rejected: 0, measured: 0 }, clusters: [], intents: [], searchConsoleThrough: null });

describe('SeoKeywordsComponent', () => {
  const api = jasmine.createSpyObj<SeoIntelligenceApiService>('api', ['keywords', 'keywordHistory']);
  const create = (first = of(page())) => {
    api.keywords.calls.reset();
    api.keywords.and.returnValue(first);
    TestBed.configureTestingModule({
      imports: [SeoKeywordsComponent],
      providers: [provideRouter([]), { provide: SeoIntelligenceApiService, useValue: api }, { provide: ToastService, useValue: { success: () => undefined, error: () => undefined } }, { provide: AppContextService, useValue: { activeSite: signal({ id: 'site' }) } }],
    });
    const fixture = TestBed.createComponent(SeoKeywordsComponent);
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  };
  const cells = (host: HTMLElement) => [...host.querySelectorAll('tbody tr:first-child td')].map((cell) => cell.textContent!.trim());

  it('shows a missing volume, difficulty and CPC as unavailable, never as zero', fakeAsync(() => {
    const { host } = create(of(page(row('guia tv'))));
    const [, , , volume, difficulty, cpc] = cells(host);
    expect([volume, difficulty, cpc]).toEqual(['No disponible', 'No disponible', 'No disponible']);
  }));

  it('shows a real zero as 0', fakeAsync(() => {
    const { host } = create(of(page(row('guia tv', { volume: 0, difficulty: 0, cpc: 0 }))));
    const [, , , volume, difficulty, cpc] = cells(host);
    expect([volume, difficulty, cpc]).toEqual(['0', '0', '0,00']);
  }));

  it('waits for the person to stop typing before searching', fakeAsync(() => {
    const { fixture, host } = create();
    expect(api.keywords).toHaveBeenCalledTimes(1);
    const input = host.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'cine';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    tick(200);
    expect(api.keywords).toHaveBeenCalledTimes(1);
    tick(100);
    expect(api.keywords).toHaveBeenCalledTimes(2);
    expect(api.keywords.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ search: 'cine', page: 1 }));
  }));

  it('ignores an answer that arrives after a newer request', fakeAsync(() => {
    const { fixture, host } = create();
    const slow = new Subject<KeywordPage>();
    const fast = new Subject<KeywordPage>();
    api.keywords.and.returnValues(slow, fast);
    void fixture.componentInstance.load(1);
    void fixture.componentInstance.load(1);
    fast.next(page(row('nueva')));
    fast.complete();
    flushMicrotasks();
    slow.next(page(row('antigua')));
    slow.complete();
    flushMicrotasks();
    fixture.detectChanges();
    expect(host.querySelector('tbody')!.textContent).toContain('nueva');
    expect(host.querySelector('tbody')!.textContent).not.toContain('antigua');
  }));
});
