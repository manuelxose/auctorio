import { DatePipe } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, ViewChild, computed, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppIconComponent } from '../ui/app-icon.component';
import { AppContextService } from '../../services/app-context.service';
import { AssistantApiService } from '../../services/assistant-api.service';
import { EditorialContextService } from '../../services/editorial-context.service';
import type { AssistantContextView } from '../../models/assistant.models';
import { AssistantActionCardComponent } from './assistant-action-card.component';
import { CopilotService, type CopilotMessage } from '../../services/copilot.service';
import { renderCopilotMarkdown } from '../../utils/copilot-markdown';

type Suggestion = { label: string; prompt: string; competency: string };

/**
 * Copilot workspace panel. Docked on the right of the Studio shell on wide
 * screens, a drawer on tablets and full screen on phones (layout in styles.css).
 */
@Component({
  selector: 'app-copilot-panel',
  standalone: true,
  imports: [FormsModule, DatePipe, AppIconComponent, AssistantActionCardComponent],
  template: `
    <div class="cp" role="region" aria-labelledby="cp-title">
      <header class="cp__bar">
        @if (view() === 'history') {
          <button class="au-icon-button" type="button" (click)="view.set('chat')" aria-label="Back to conversation">
            <app-icon name="chevron-left"></app-icon>
          </button>
          <h2 id="cp-title" class="cp__title">Conversations</h2>
        } @else {
          <h2 id="cp-title" class="cp__title">Copilot</h2>
          <button class="au-icon-button" type="button" (click)="openHistory()" aria-label="Conversation history" title="Conversation history">
            <app-icon name="history"></app-icon>
          </button>
          <button class="au-icon-button" type="button" (click)="copilot.newThread()" aria-label="New conversation" title="New conversation">
            <app-icon name="plus"></app-icon>
          </button>
        }
        <button class="au-icon-button cp__wide" type="button" (click)="copilot.wide.set(!copilot.wide())" [attr.aria-pressed]="copilot.wide()" aria-label="Wider panel" title="Wider panel">
          <app-icon name="expand"></app-icon>
        </button>
        <button class="au-icon-button" type="button" (click)="closed.emit()" aria-label="Close copilot" title="Close (Esc)">
          <app-icon name="close"></app-icon>
        </button>
      </header>

      @if (view() === 'history') {
        <div class="cp__history">
          <label class="cp__search">
            <span class="au-sr-only">Search conversations</span>
            <app-icon name="search"></app-icon>
            <input type="search" [(ngModel)]="historyQuery" (ngModelChange)="searchHistory()" placeholder="Search" />
          </label>
          @if (copilot.loadError()) {
            <p class="cp__note cp__note--error" role="alert">{{ copilot.loadError() }}</p>
          }
          <ul class="cp__threads">
            @for (thread of copilot.threads(); track thread.id) {
              <li class="cp__thread" [class.is-active]="thread.id === copilot.activeThreadId()">
                <button type="button" class="cp__thread-open" (click)="pickThread(thread.id)">
                  <span class="cp__thread-title">{{ thread.title }}</span>
                  <span class="cp__meta">{{ thread.updatedAt | date: 'short' }}</span>
                </button>
                <button type="button" class="au-icon-button" (click)="copilot.deleteThread(thread.id)" [attr.aria-label]="'Delete ' + thread.title">
                  <app-icon name="trash"></app-icon>
                </button>
              </li>
            } @empty {
              <li class="cp__note">{{ copilot.threadsLoading() ? 'Loading…' : 'No conversations yet' }}</li>
            }
          </ul>
        </div>
      } @else {
        <div class="cp__context" aria-label="Context sent with your message">
          <span class="cp__chip"><app-icon name="globe"></app-icon>{{ resolved()?.site?.name ?? siteName() }}</span>
          @if (resolved()?.plan; as plan) {
            <span class="cp__chip"><app-icon name="plan"></app-icon>{{ plan.name }} · {{ plan.itemCount }} items@if (plan.unfilledSlots) { · {{ plan.unfilledSlots }} open }</span>
          }
          @if (resolved()?.proposal; as proposal) {
            <span class="cp__chip"><app-icon name="edit"></app-icon>{{ proposal.title }}</span>
          } @else if (copilot.projectId()) {
            <span class="cp__chip"><app-icon name="content"></app-icon>Open article</span>
          }
          @if (resolved()?.period; as period) {
            <span class="cp__chip"><app-icon name="calendar"></app-icon>{{ period.from }} to {{ period.to }}</span>
          }
          @if (!resolved()?.plan && !copilot.projectId()) {
            <span class="cp__chip"><app-icon name="layers"></app-icon>{{ pageLabel() }}</span>
          }
        </div>

        <div class="cp__log" #log (click)="followLink($event)" role="log" aria-live="polite" aria-label="Conversation">
          @for (message of copilot.messages(); track message.id) {
            @if (message.role === 'user') {
              <div class="cp__msg cp__msg--user">{{ message.content }}</div>
            } @else {
              <div class="cp__msg cp__msg--bot" [attr.aria-busy]="message.status === 'pending'">
                @if (message.competencyKey) {
                  <span class="cp__meta">{{ competencyLabel(message.competencyKey) }}</span>
                }
                @switch (message.status) {
                  @case ('pending') {
                    <span class="cp__pending"><span class="au-spinner au-spinner--sm"></span> Reading the workspace…</span>
                  }
                  @case ('failed') {
                    <p class="cp__note cp__note--error" role="alert">{{ message.error || 'The answer could not be generated' }}</p>
                    <button class="au-btn au-btn--sm" type="button" (click)="copilot.retry(message)" [disabled]="copilot.sending()">
                      <app-icon name="refresh"></app-icon> Retry
                    </button>
                  }
                  @case ('cancelled') {
                    <p class="cp__note">Stopped</p>
                    <button class="au-btn au-btn--sm" type="button" (click)="copilot.retry(message)" [disabled]="copilot.sending()">
                      <app-icon name="refresh"></app-icon> Ask again
                    </button>
                  }
                  @default {
                    <div class="cp__md" [innerHTML]="render(message.content)"></div>
                  }
                }
                @if (message.evidence?.findings?.length) {
                  <ul class="cp__findings" aria-label="Checks">
                    @for (finding of message.evidence!.findings; track finding.message) {
                      <li><span class="cp__dot" [attr.data-severity]="finding.severity"></span>{{ finding.message }}</li>
                    }
                  </ul>
                }
                @if (message.evidence?.sources?.length) {
                  <div class="cp__sources">
                    @for (source of message.evidence!.sources; track source.path + source.label) {
                      <a [href]="source.path">{{ source.label }}</a>
                    }
                  </div>
                }
                @for (action of message.actions ?? []; track action.id) {
                  <app-assistant-action-card [action]="action" (updated)="copilot.replaceAction($event)"></app-assistant-action-card>
                }
                @if (message.status === 'completed' && message.model) {
                  <span class="cp__meta">{{ message.provider }} · {{ message.model }}{{ message.tokensOutput !== null ? ' · ' + (message.tokensInput! + message.tokensOutput) + ' tokens' : '' }}</span>
                }
              </div>
            }
          } @empty {
            <div class="cp__empty">
              <p class="cp__lead">Ask about {{ resolved()?.proposal ? 'this proposal' : resolved()?.plan ? 'this plan' : copilot.projectId() ? 'this article' : 'this site' }}. Answers use your Studio data and say where they came from. Changes always wait for your confirmation.</p>
              <ul class="cp__suggestions">
                @for (suggestion of suggestions(); track suggestion.label) {
                  <li>
                    <button type="button" class="cp__suggestion" (click)="copilot.send(suggestion.prompt, suggestion.competency || null)">
                      {{ suggestion.label }}
                    </button>
                  </li>
                }
              </ul>
            </div>
          }
        </div>

        <form class="cp__composer" (ngSubmit)="submit()">
          <label class="au-sr-only" for="cp-input">Message the copilot</label>
          <textarea
            id="cp-input"
            #input
            rows="2"
            maxlength="4000"
            [(ngModel)]="draft"
            name="draft"
            (keydown.enter)="onEnter($event)"
            placeholder="Ask the copilot"
          ></textarea>
          @if (copilot.sending()) {
            <button class="au-btn au-btn--sm" type="button" (click)="copilot.cancel()">
              <app-icon name="stop"></app-icon> Stop
            </button>
          } @else {
            <button class="au-btn au-btn--primary au-btn--sm" type="submit" [disabled]="!draft.trim()">
              <app-icon name="send"></app-icon> Send
            </button>
          }
        </form>
      }
    </div>
  `,
})
export class CopilotPanelComponent implements AfterViewChecked {
  readonly copilot = inject(CopilotService);
  private readonly appContext = inject(AppContextService);
  private readonly router = inject(Router);
  private readonly assistantApi = inject(AssistantApiService);
  private readonly editorial = inject(EditorialContextService);

  /** Selection as the server resolved it (names, counts), for the context chip. */
  readonly resolved = signal<AssistantContextView | null>(null);

  readonly closed = output<void>();
  readonly view = signal<'chat' | 'history'>('chat');
  draft = '';
  historyQuery = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCount = 0;

  @ViewChild('log') private log?: ElementRef<HTMLElement>;
  @ViewChild('input') private input?: ElementRef<HTMLTextAreaElement>;

  readonly siteName = computed(() => this.appContext.activeSite()?.name ?? 'All sites');
  readonly pageLabel = computed(() => {
    const segment = this.copilot.route().split('/')[2] || 'overview';
    return segment.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  });

  /** Prompts for the area the operator is in; the server's intent router maps them to tools. */
  readonly suggestions = computed<Suggestion[]>(() => {
    const sel = this.editorial.selection();
    const area = sel.area ?? this.areaOf(this.copilot.route());
    const ask = (label: string, prompt = label): Suggestion => ({ label, prompt, competency: '' });
    if (this.copilot.projectId()) {
      return [
        { label: 'Analyze this article for SEO weaknesses', prompt: 'Analyze this article for SEO weaknesses and suggest a better structure.', competency: 'seo-review' },
        { label: 'Explain why the QA stage failed', prompt: 'Explain why the QA stage failed and what to change.', competency: 'qa-explain' },
        { label: 'Show the latest publication attempts', prompt: 'Show the latest publication attempts for this article.', competency: 'publication-status' },
      ];
    }
    if (sel.planItemId) return [ask('Why was this proposal suggested?', 'Why is this proposal relevant? Show the evidence.'), ask('Regenerate this proposal'), ask('Find weaknesses in this plan')];
    if (area === 'calendar') return [ask('Suggest ideas for a day', sel.periodFrom ? 'Suggest ideas for ' + sel.periodFrom : 'Suggest ideas for this day'), ask('Fill the missing slots'), ask('Find gaps in this period', 'Find weaknesses in this plan')];
    if (area === 'plan' || area === 'editorial-plan') return [ask('Explain the strategy'), ask('Find weaknesses in this plan'), ask('Suggest a publishing cadence'), ask('Fill the missing slots')];
    if (area === 'intelligence' || area === 'sources' || area === 'competitors') return [ask('Explain the strategy', 'Explain the strategy and the topics it covers'), ask('Which gaps could a new source close?', 'Find weaknesses in this plan')];
    if (area === 'production') return [{ label: 'Show the latest publication attempts', prompt: 'Show the latest publication attempts.', competency: 'publication-status' }, ask('Why did the last job fail?', 'Explain why the last failed job failed')];
    return [{ label: 'What needs my attention on this site?', prompt: 'What needs my attention on this site?', competency: 'workspace-brief' }, ask('Why did the last job fail?', 'Explain why the last failed job failed')];
  });

  private areaOf(route: string): string {
    if (route.includes('/calendar')) return 'calendar';
    if (route.includes('/editorial-plan')) return 'plan';
    if (/\/(site-intelligence|sources|competitors)/.test(route)) return 'intelligence';
    if (/\/(content|media|publications|publishing)/.test(route)) return 'production';
    return 'operations';
  }

  constructor() {
    // A new site means a new conversation: answers never mix two sites' data.
    let previousSite: string | null | undefined;
    effect(() => {
      const site = this.copilot.siteId();
      if (previousSite !== undefined && site !== previousSite) this.copilot.newThread();
      previousSite = site;
    });
    // Resolve the selection server-side (tenant-checked) whenever it changes.
    effect((onCleanup) => {
      const selection = { ...this.editorial.selection(), siteId: this.copilot.siteId() };
      const timer = setTimeout(() => {
        this.assistantApi.context(selection).subscribe({ next: (view) => this.resolved.set(view), error: () => this.resolved.set(null) });
      }, 200);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngAfterViewChecked(): void {
    const count = this.copilot.messages().length;
    if (count !== this.lastCount && this.log) {
      this.lastCount = count;
      this.log.nativeElement.scrollTop = this.log.nativeElement.scrollHeight;
    }
  }

  focusInput(): void {
    setTimeout(() => this.input?.nativeElement.focus());
  }

  render(content: string): string {
    return renderCopilotMarkdown(content);
  }

  competencyLabel(key: string): string {
    return this.copilot.competencies().find((item) => item.key === key)?.label ?? key;
  }

  submit(): void {
    if (!this.draft.trim()) return;
    this.copilot.send(this.draft);
    this.draft = '';
  }

  onEnter(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.shiftKey) return;
    key.preventDefault();
    this.submit();
  }

  openHistory(): void {
    this.view.set('history');
    this.copilot.loadThreads(this.historyQuery);
  }

  pickThread(id: string): void {
    this.copilot.openThread(id);
    this.view.set('chat');
  }

  searchHistory(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.copilot.loadThreads(this.historyQuery), 250);
  }

  /** Studio links in answers navigate inside the app instead of reloading it. */
  followLink(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (href?.startsWith('/studio')) {
      event.preventDefault();
      void this.router.navigateByUrl(href);
    }
  }
}
