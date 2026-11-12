import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, forkJoin, of, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { OverviewWeekComponent, type WeekDay } from '../components/overview-week.component';
import type { AutomationPolicy, EditorialPlan, EditorialPlanItem, OperationItem, SiteIntelligenceOverview, StudioOverview } from '../models/studio.models';
import { activityLabel, autopilotHeadline, humanError, difficultyLabel, modeSummary, planChip, sameDay, setupSteps, type PlanChip, type SetupStep } from '../utils/overview-model';

type Mode = 'manual' | 'assisted' | 'autopilot';
type DayItem = { item: EditorialPlanItem; title: string; chip: PlanChip };

/**
 * Overview: what Auctorio did and will do for the active site, what is still needed to run
 * on autopilot, and what it learned about the site. Every figure comes from the API.
 */
@Component({
  selector: 'app-overview-page',
  standalone: true,
  imports: [CommonModule, RouterLink, AppIconComponent, OverviewWeekComponent],
  template: `
    <section class="au-page ov">
      <header class="ov__head">
        <div>
          <p class="au-page__eyebrow">{{ today | date: 'EEEE d MMMM' }}</p>
          <h1 class="au-page__title">{{ siteName() }}</h1>
          <p class="ov__status" [attr.data-tone]="headline().tone" role="status">
            <span class="ov__dot" aria-hidden="true"></span>{{ headline().text }}
          </p>
        </div>
        <a class="au-btn au-btn--primary" routerLink="/studio/content/new"><app-icon name="plus"></app-icon>New content</a>
      </header>

      @for (alert of attentionItems(); track alert.title) {
        <div class="au-banner au-banner--error" role="alert">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text"><strong>{{ alert.title }}</strong> · {{ alert.detail }}</span>
          <a class="au-banner__action" [routerLink]="alert.link">{{ alert.action }}</a>
        </div>
      }

      <dl class="ov__kpis" aria-label="Key figures">
        @if (overview(); as o) {
          <div><dt>Published today</dt><dd>{{ o.today.articlesPublished }}</dd><span>of {{ o.today.articlesPlanned }} planned</span></div>
          <div><dt>Waiting for review</dt><dd>{{ o.pipeline.review }}</dd><span>{{ o.pipeline.drafts }} drafts in progress</span></div>
          <div><dt>Scheduled</dt><dd>{{ o.pipeline.scheduled }}</dd><span>ready to go out</span></div>
          <div [class.is-bad]="o.pipeline.failed > 0"><dt>Failed</dt><dd>{{ o.pipeline.failed }}</dd><span>{{ o.pipeline.failed ? 'need a retry' : 'nothing to fix' }}</span></div>
          <div><dt>Next 7 days</dt><dd>{{ weekTopicCount() }}</dd><span>topics planned</span></div>
        } @else {
          @for (n of [1, 2, 3, 4, 5]; track n) { <div class="is-loading"><dt>&nbsp;</dt><dd>&nbsp;</dd></div> }
        }
      </dl>

      <div class="ov__cols">
        <div class="ov__main">
          <!-- Activity by day -->
          <section class="au-panel ov__card ov__activity" aria-labelledby="ov-activity">
            <div class="ov__card-head">
              <div>
                <h2 id="ov-activity" class="ov__title">{{ dayOffset() === 0 ? 'Today' : dayOffset() > 0 ? 'Planned for ' : 'Done on ' }}{{ dayOffset() === 0 ? '' : (day() | date: 'EEE d MMM') }}</h2>
                <p class="au-muted">{{ dayCount() }}</p>
              </div>
              <div class="ov__stepper" role="group" aria-label="Choose day">
                <button class="au-icon-button" type="button" (click)="shiftDay(-1)" aria-label="Previous day"><app-icon name="chevron-left"></app-icon></button>
                <button class="ov__stepper-day" type="button" (click)="dayOffset.set(0)" [disabled]="dayOffset() === 0">
                  <span>{{ dayOffset() === 0 ? 'Today' : (day() | date: 'EEE') }}</span>
                  <span class="au-muted">{{ day() | date: 'd MMM' }}</span>
                </button>
                <button class="au-icon-button" type="button" (click)="shiftDay(1)" aria-label="Next day"><app-icon name="chevron-right"></app-icon></button>
              </div>
            </div>

            @if (featured(); as f) {
              <article class="ov__feature">
                <div class="ov__feature-top">
                  <span class="ov__chip" [attr.data-chip]="f.chip">{{ f.chip }}</span>
                  @if (f.item.contentType) { <span class="au-muted">{{ f.item.contentType }}</span> }
                </div>
                <h3 class="ov__feature-title">
                  @if (f.item.projectId) {
                    <a [routerLink]="['/studio/content', f.item.projectId]">{{ f.title }}</a>
                  } @else { {{ f.title }} }
                </h3>
                <dl class="ov__facts">
                  @if (f.item.primaryKeyword) { <div><dt>Keyword</dt><dd>{{ f.item.primaryKeyword }}</dd></div> }
                  @if (difficulty(f.item); as d) { <div><dt>Difficulty</dt><dd><span class="ov__diff" [attr.data-level]="d">{{ d }}</span></dd></div> }
                  @if (f.item.primaryIntent) { <div><dt>Intent</dt><dd>{{ f.item.primaryIntent }}</dd></div> }
                  @if (f.item.scheduledFor) { <div><dt>Scheduled</dt><dd>{{ f.item.scheduledFor | date: 'HH:mm' }}</dd></div> }
                </dl>
                @if (f.item.rationale) {
                  <details class="ov__why">
                    <summary><app-icon name="info"></app-icon>Why this topic</summary>
                    <p>{{ f.item.rationale }}</p>
                  </details>
                }
              </article>
            }

            <ul class="ov__feed">
              @for (op of dayOperations(); track op.id) {
                <li [class.is-failed]="label(op).failed">
                  <span class="ov__feed-icon"><app-icon [name]="label(op).icon"></app-icon></span>
                  <span class="ov__feed-text">{{ label(op).label }}@if (op.errorSummary && label(op).failed) {<span class="au-muted"> · {{ humanError(op.errorSummary) }}</span>}</span>
                  <time class="au-muted">{{ op.createdAt | date: 'HH:mm' }}</time>
                </li>
              }
              @for (entry of otherDayItems(); track entry.item.id) {
                <li>
                  <span class="ov__feed-icon"><app-icon name="plan"></app-icon></span>
                  <span class="ov__feed-text">Topic: {{ entry.title }}</span>
                  <span class="ov__chip" [attr.data-chip]="entry.chip">{{ entry.chip }}</span>
                </li>
              }
            </ul>
            @if (!featured() && dayOperations().length === 0) {
              <p class="ov__empty">{{ dayOffset() > 0 ? 'Nothing planned for this day yet.' : 'Nothing ran on this day.' }} @if (!planReady()) { <button class="au-link" type="button" (click)="runStep('plan')">Plan the next 30 days</button> }</p>
            }
          </section>

          <!-- Coming up: next 7 days of the content plan -->
          <section class="au-panel ov__card" aria-labelledby="ov-week">
            <div class="ov__card-head">
              <div>
                <h2 id="ov-week" class="ov__title">Coming up</h2>
                <p class="au-muted">{{ weekSummary() }}</p>
              </div>
              <a class="au-btn au-btn--sm" routerLink="/studio/editorial-plan">Open plan<app-icon name="chevron-right"></app-icon></a>
            </div>
            <app-overview-week [days]="week()" (pick)="openDay($event)"></app-overview-week>
          </section>

          <section class="au-panel ov__card" aria-labelledby="ov-latest">
            <div class="ov__card-head">
              <div><h2 id="ov-latest" class="ov__title">Latest publications</h2><p class="au-muted">What went out, or tried to</p></div>
              <a class="au-btn au-btn--sm" routerLink="/studio/publications">All publications<app-icon name="chevron-right"></app-icon></a>
            </div>
            <ul class="ov__feed">
              @for (pub of (overview()?.recentPublications ?? []).slice(0, 6); track pub.id) {
                <li [class.is-failed]="pub.status === 'failed'">
                  <span class="ov__feed-icon"><app-icon [name]="pub.status === 'failed' ? 'warning' : 'publications'"></app-icon></span>
                  <span class="ov__feed-text">{{ pub.title }}<span class="au-muted"> · {{ pub.destination }}</span>@if (pub.lastError && pub.status === 'failed') {<span class="au-muted"> · {{ humanError(pub.lastError) }}</span>}</span>
                  <span class="ov__chip" [attr.data-chip]="pub.status === 'published' ? 'Published' : pub.status === 'failed' ? 'Failed' : 'Queued'">{{ pub.status }}</span>
                  <time class="au-muted">{{ (pub.publishedAt ?? pub.scheduledFor) | date: 'd MMM HH:mm' }}</time>
                </li>
              } @empty {
                <li class="au-muted">Nothing published yet. Articles appear here once a destination is connected and the first one goes out.</li>
              }
            </ul>
          </section>
        </div>
        <div class="ov__side">
          <!-- Setup checklist -->
          <section class="au-panel ov__card ov__setup" aria-labelledby="ov-setup">
            <div class="ov__card-head">
              <div>
                <h2 id="ov-setup" class="ov__title">{{ requiredLeft() === 0 ? 'All set' : 'Get started' }}</h2>
                <p class="au-muted">{{ requiredDone() }} of {{ requiredTotal() }} required steps done</p>
              </div>
            </div>
            <div class="ov__progress" role="progressbar" [attr.aria-valuenow]="requiredDone()" aria-valuemin="0" [attr.aria-valuemax]="requiredTotal()" aria-label="Setup progress">
              <span [style.width.%]="(requiredDone() / requiredTotal()) * 100"></span>
            </div>

            @for (group of ['Required', 'Optional']; track group) {
              <h3 class="ov__group">{{ group }}</h3>
              <ul class="ov__steps">
                @for (step of stepsFor(group === 'Required'); track step.id) {
                  <li class="ov__step" [class.is-done]="step.done">
                    <span class="ov__check" aria-hidden="true">@if (step.done) { <app-icon name="check"></app-icon> }</span>
                    <div class="ov__step-body">
                      <span class="ov__step-label">{{ step.label }}<span class="au-sr-only">{{ step.done ? ', done' : ', to do' }}</span></span>
                      <span class="ov__step-detail">{{ step.detail }}</span>
                      @if (step.id === 'autopilot' && (modePickerOpen() || !step.done)) {
                        <div class="ov__modes" role="radiogroup" aria-label="How much runs on its own">
                          @for (m of modes; track m.id) {
                            <button type="button" role="radio" class="ov__mode" [attr.aria-checked]="policy()?.mode === m.id && policy()?.enabled" [disabled]="busy() === 'autopilot'" (click)="setMode(m.id)">
                              {{ m.short }}
                            </button>
                          }
                        </div>
                        <p class="ov__mode-note">{{ modeNote() }}</p>
                      }
                    </div>
                    @switch (step.id) {
                      @case ('website') { @if (!step.done) { <a class="au-btn au-btn--sm au-btn--primary" routerLink="/studio/connections/wizard">Connect</a> } @else { <a class="au-btn au-btn--sm" routerLink="/studio/connections">Manage</a> } }
                      @case ('learn') { <button class="au-btn au-btn--sm" [class.au-btn--primary]="!step.done" type="button" (click)="runStep('learn')" [disabled]="busy() === 'learn' || indexing()">{{ busy() === 'learn' || indexing() ? 'Reading…' : step.done ? 'Read again' : 'Analyze' }}</button> }
                      @case ('plan') { @if (!step.done) { <button class="au-btn au-btn--sm au-btn--primary" type="button" (click)="runStep('plan')" [disabled]="busy() === 'plan' || planGenerating()">{{ busy() === 'plan' || planGenerating() ? 'Planning… ' + planProgress() : 'Plan' }}</button> } @else { <a class="au-btn au-btn--sm" routerLink="/studio/editorial-plan">Open</a> } }
                      @case ('autopilot') { @if (step.done) { <button class="au-btn au-btn--sm" type="button" (click)="modePickerOpen.set(!modePickerOpen())">Change</button> } }
                      @case ('instagram') { @if (!step.done) { <a class="au-btn au-btn--sm" routerLink="/studio/connections/wizard" [queryParams]="{ target: 'instagram.com' }">Connect</a> } }
                      @case ('x') { @if (!step.done) { <a class="au-btn au-btn--sm" routerLink="/studio/connections/wizard" [queryParams]="{ target: 'x.com' }">Connect</a> } }
                      @case ('sources') { <a class="au-btn au-btn--sm" routerLink="/studio/sources">{{ step.done ? 'Manage' : 'Add' }}</a> }
                    }
                  </li>
                }
              </ul>
            }
            @if (stepError()) { <p class="au-error" role="alert">{{ stepError() }}</p> }
          </section>
          <!-- What we learned -->
          <section class="au-panel ov__card" aria-labelledby="ov-learned">
            <div class="ov__card-head">
              <div>
                <h2 id="ov-learned" class="ov__title">What Auctorio learned about {{ siteName() }}</h2>
                <p class="au-muted">Used to plan and write every article</p>
              </div>
            </div>
            @if (profile(); as p) {
              @if (p.brandSummary) { <p class="ov__summary">{{ p.brandSummary }}</p> }
              <dl class="au-detail-grid">
                @if (p.detectedAudience) { <dt>Audience</dt><dd>{{ p.detectedAudience }}</dd> }
                @if (p.detectedLanguage) { <dt>Language</dt><dd>{{ p.detectedLanguage }}</dd> }
                @if (p.editorialTone) { <dt>Tone</dt><dd>{{ p.editorialTone }}</dd> }
                @if (p.detectedSiteType) { <dt>Site type</dt><dd>{{ p.detectedSiteType }}</dd> }
                <dt>Pages read</dt><dd>{{ p.pageCount }}@if (p.indexedAt) { <span class="au-muted"> · {{ p.indexedAt | date: 'd MMM, HH:mm' }}</span> }</dd>
              </dl>
              @if (p.mainTopics.length) {
                <ul class="ov__tags" aria-label="Main topics">
                  @for (topic of p.mainTopics.slice(0, 12); track topic) { <li>{{ topic }}</li> }
                </ul>
              }
              <div class="ov__actions">
                <a class="au-btn au-btn--sm" routerLink="/studio/site-intelligence">Not quite right, review it</a>
                <button class="au-btn au-btn--sm" type="button" (click)="runStep('learn')" [disabled]="busy() === 'learn' || indexing()">{{ indexing() ? 'Reading the site…' : 'Read the site again' }}</button>
              </div>
            } @else {
              <p class="ov__empty">Nothing learned yet. Auctorio reads your public pages to find your topics, audience and tone.</p>
              <div class="ov__actions"><button class="au-btn au-btn--sm au-btn--primary" type="button" (click)="runStep('learn')" [disabled]="busy() === 'learn' || indexing()">{{ indexing() ? 'Reading the site…' : 'Analyze my site' }}</button></div>
            }
          </section>

          <section class="au-panel ov__card" aria-labelledby="ov-dest">
            <div class="ov__card-head"><h2 id="ov-dest" class="ov__title">Publishing to</h2><a class="au-btn au-btn--sm" routerLink="/studio/connections">Manage</a></div>
            <ul class="ov__dest">
              @for (c of overview()?.connections ?? []; track c.id) {
                <li><span class="ov__dest-dot" [attr.data-state]="connectionState(c)"></span>{{ c.displayName }}<span class="au-muted">{{ connectionLabel(c) }}</span></li>
              } @empty {
                <li class="au-muted">No destinations yet · <a class="au-link" routerLink="/studio/connections/wizard">connect one</a></li>
              }
            </ul>
          </section>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .ov { display: flex; flex-direction: column; gap: var(--au-s5); }
      .ov__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--au-s4); flex-wrap: wrap; }
      .ov__status { display: flex; align-items: center; gap: var(--au-s2); margin-top: var(--au-s2); color: var(--au-text-2); }
      .ov__dot { width: 8px; height: 8px; border-radius: 4px; background: var(--au-faint); flex: 0 0 8px; }
      .ov__status[data-tone='ok'] .ov__dot { background: var(--au-success); box-shadow: 0 0 0 3px var(--au-success-soft); }
      .ov__status[data-tone='warn'] .ov__dot { background: var(--au-warning); box-shadow: 0 0 0 3px var(--au-warning-soft); }
      .ov__cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 380px); gap: var(--au-s5); align-items: start; }
      .ov__main, .ov__side { display: flex; flex-direction: column; gap: var(--au-s5); min-width: 0; }
      .ov__kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--au-s3); margin: 0; }
      .ov__kpis > div { display: flex; flex-direction: column; gap: 2px; padding: var(--au-s4); border: 1px solid var(--au-border); border-radius: 14px; background: var(--au-surface); box-shadow: var(--au-shadow-glass); }
      .ov__kpis dt { color: var(--au-muted); font-size: var(--au-fs-caption); }
      .ov__kpis dd { margin: 0; font: 600 26px/1.15 var(--au-font); font-variant-numeric: tabular-nums; }
      .ov__kpis span { color: var(--au-faint); font-size: var(--au-fs-caption); }
      .ov__kpis .is-bad dd { color: var(--au-danger); }
      .ov__kpis .is-loading { min-height: 88px; }
      .ov__card { padding: var(--au-s5); display: flex; flex-direction: column; gap: var(--au-s4); }
      .ov__card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--au-s3); }
      .ov__title { font: 600 var(--au-fs-card) / 1.3 'Source Serif 4', Georgia, serif; }
      .ov__stepper { display: flex; align-items: center; gap: var(--au-s1); padding: 2px; border: 1px solid var(--au-border); border-radius: 12px; background: var(--au-surface-hover); }
      .ov__stepper-day { display: flex; flex-direction: column; align-items: center; min-width: 76px; padding: 2px var(--au-s2); border: 0; background: none; color: var(--au-text); font: 500 var(--au-fs-body-sm) / 1.2 var(--au-font); cursor: pointer; }
      .ov__stepper-day .au-muted { font-size: var(--au-fs-caption); font-weight: 400; }
      .ov__feature { display: flex; flex-direction: column; gap: var(--au-s3); padding: var(--au-s4) var(--au-s5); border: 1px solid var(--au-border); border-radius: 14px; background: var(--au-surface-hover); box-shadow: var(--au-shadow-glass); }
      .ov__feature-top { display: flex; align-items: center; gap: var(--au-s2); font-size: var(--au-fs-caption); }
      .ov__feature-title { font: 600 18px/1.35 'Source Serif 4', Georgia, serif; }
      .ov__feature-title a { color: inherit; text-decoration: none; }
      .ov__facts { display: flex; flex-wrap: wrap; gap: var(--au-s2) var(--au-s5); margin: 0; font-size: var(--au-fs-body-sm); }
      .ov__facts div { display: flex; flex-direction: column; gap: 2px; }
      .ov__facts dt { color: var(--au-muted); font-size: var(--au-fs-caption); }
      .ov__facts dd { margin: 0; color: var(--au-text); }
      .ov__diff { padding: 1px 8px; border-radius: 6px; font-size: var(--au-fs-caption); background: var(--au-success-soft); color: var(--au-success); }
      .ov__diff[data-level='Medium'] { background: var(--au-warning-soft); color: var(--au-warning); }
      .ov__diff[data-level='Hard'] { background: var(--au-danger-soft); color: var(--au-danger); }
      .ov__why summary { display: inline-flex; align-items: center; gap: 6px; color: var(--au-brand); font-size: var(--au-fs-body-sm); cursor: pointer; list-style: none; }
      .ov__why p { margin-top: var(--au-s2); color: var(--au-text-2); font-size: var(--au-fs-body-sm); }
      .ov__feed { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
      .ov__feed li { display: flex; align-items: center; gap: var(--au-s3); min-height: 44px; padding: var(--au-s2) 0; border-bottom: 1px solid var(--au-border); font-size: var(--au-fs-body-sm); }
      .ov__feed li:last-child { border-bottom: 0; }
      .ov__feed li.is-failed .ov__feed-icon { color: var(--au-danger); background: var(--au-danger-soft); }
      .ov__feed-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: var(--au-surface-2); color: var(--au-muted); flex: 0 0 32px; }
      .ov__feed-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      .ov__empty { color: var(--au-muted); font-size: var(--au-fs-body-sm); }
      .ov__chip { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: var(--au-fs-caption); font-weight: 500; white-space: nowrap; background: var(--au-surface-2); color: var(--au-muted); }
      .ov__chip[data-chip='Published'] { background: var(--au-success-soft); color: var(--au-success); }
      .ov__chip[data-chip='Written'] { background: var(--au-info-soft); color: var(--au-info); }
      .ov__chip[data-chip='Queued'] { background: var(--au-warning-soft); color: var(--au-warning); }
      .ov__chip[data-chip='Needs approval'] { background: var(--au-brand-soft); color: var(--au-brand); }
      .ov__chip[data-chip='Failed'] { background: var(--au-danger-soft); color: var(--au-danger); }
      .ov__progress { height: 6px; border-radius: 3px; background: var(--au-surface-2); overflow: hidden; }
      .ov__progress span { display: block; height: 100%; border-radius: 3px; background: var(--au-success); }
      .ov__group { margin-top: var(--au-s2); color: var(--au-muted); font-size: var(--au-fs-caption); font-weight: 500; }
      .ov__steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--au-s2); }
      .ov__step { display: flex; align-items: flex-start; gap: var(--au-s3); padding: var(--au-s3); border: 1px solid var(--au-border); border-radius: 12px; background: var(--au-surface-hover); }
      .ov__step.is-done { background: transparent; }
      .ov__step.is-done .ov__step-label { color: var(--au-text-2); }
      .ov__check { display: grid; place-items: center; width: 22px; height: 22px; margin-top: 1px; border: 1.5px solid var(--au-border-strong); border-radius: 11px; color: var(--au-success); flex: 0 0 22px; }
      .ov__step.is-done .ov__check { border-color: var(--au-success); background: var(--au-success-soft); }
      .ov__check app-icon { width: 13px; height: 13px; }
      .ov__step-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .ov__step-label { font-weight: 500; font-size: var(--au-fs-body-sm); }
      .ov__step-detail { color: var(--au-muted); font-size: var(--au-fs-caption); }
      .ov__modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; margin-top: var(--au-s2); padding: 2px; border: 1px solid var(--au-border); border-radius: 10px; background: var(--au-surface-2); }
      .ov__mode { padding: 6px 4px; border: 0; border-radius: 8px; background: transparent; color: var(--au-text-2); font: 500 var(--au-fs-caption) / 1.2 var(--au-font); cursor: pointer; }
      .ov__mode[aria-checked='true'] { background: var(--au-surface); color: var(--au-text); box-shadow: var(--au-shadow-glass); }
      .ov__mode-note { margin-top: 4px; color: var(--au-muted); font-size: var(--au-fs-caption); }
      .ov__summary { color: var(--au-text-2); line-height: 1.6; }
      .ov__tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
      .ov__tags li { padding: 2px 10px; border-radius: 8px; background: var(--au-surface-2); color: var(--au-text-2); font-size: var(--au-fs-caption); }
      .ov__actions { display: flex; flex-wrap: wrap; gap: var(--au-s2); }
      .ov__dest { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--au-s2); font-size: var(--au-fs-body-sm); }
      .ov__dest li { display: flex; align-items: center; gap: var(--au-s2); }
      .ov__dest li .au-muted { margin-left: auto; font-size: var(--au-fs-caption); }
      .ov__dest-dot { width: 8px; height: 8px; border-radius: 4px; background: var(--au-faint); }
      .ov__dest-dot[data-state='ok'] { background: var(--au-success); }
      .ov__dest-dot[data-state='bad'] { background: var(--au-danger); }
      @media (max-width: 1100px) { .ov__cols { grid-template-columns: minmax(0, 1fr); } .ov__kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 600px) {
        .ov__card { padding: var(--au-s4); }
        .ov__card-head { flex-direction: column; }
        .ov__kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .ov__kpis > div:last-child { grid-column: span 2; }
      }
    `,
  ],
})
export class OverviewPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);

  readonly today = new Date();
  readonly modes: Array<{ id: Mode; short: string }> = [
    { id: 'manual', short: 'On request' },
    { id: 'assisted', short: 'I approve' },
    { id: 'autopilot', short: 'Autopilot' },
  ];

  readonly overview = signal<StudioOverview | null>(null);
  readonly policy = signal<AutomationPolicy | null>(null);
  readonly intelligence = signal<SiteIntelligenceOverview | null>(null);
  readonly plans = signal<EditorialPlan[]>([]);
  readonly planItems = signal<EditorialPlanItem[]>([]);
  readonly operations = signal<OperationItem[]>([]);
  readonly dayOffset = signal(0);
  readonly busy = signal<'learn' | 'plan' | 'autopilot' | null>(null);
  readonly stepError = signal<string | null>(null);
  readonly modePickerOpen = signal(false);

  private refresh: Subscription | null = null;

  readonly siteId = computed(() => this.appContext.activeSite()?.id ?? null);
  readonly siteName = computed(() => this.appContext.activeSite()?.name ?? 'All sites');
  readonly profile = computed(() => this.intelligence()?.profile ?? null);
  readonly indexing = computed(() => Boolean(this.intelligence()?.indexing));
  /** A plan still "generating" after 30 minutes without an update was interrupted; do not block a new one. */
  readonly planGenerating = computed(() => this.plans().some((plan) => plan.status === 'generating' && Date.now() - new Date(plan.updatedAt ?? plan.createdAt ?? 0).getTime() < 30 * 60_000));
  /** "12 of 30" from the running planning operation, written after each wave of topics. */
  readonly planProgress = computed(() => {
    const op = this.operations().find((o) => o.type === 'editorial_plan_generation' && (o.status === 'running' || o.status === 'queued'));
    return op && op.totalSteps > 0 ? `${op.completedSteps} of ${op.totalSteps}` : '';
  });
  readonly planReady = computed(() => {
    const now = new Date();
    return this.plans().some((plan) => plan.status === 'ready' && new Date(plan.dateTo) >= now);
  });

  readonly steps = computed<SetupStep[]>(() => {
    const o = this.overview();
    const connections = o?.connections ?? [];
    const connected = (platform: string) => connections.some((c) => c.platform === platform && c.enabled && (c.status === 'active' || c.connectionState === 'connected'));
    const p = this.policy();
    return setupSteps({
      websiteConnected: connected('website'),
      siteAnalyzed: Boolean(this.profile()?.indexedAt),
      planReady: this.planReady(),
      autopilotMode: p?.mode ?? null,
      automationEnabled: Boolean(p?.enabled),
      instagramConnected: connected('instagram'),
      xConnected: connected('x'),
      sourceCount: o?.sources.total ?? 0,
    });
  });
  readonly requiredTotal = computed(() => this.steps().filter((s) => s.required).length);
  readonly requiredDone = computed(() => this.steps().filter((s) => s.required && s.done).length);
  readonly requiredLeft = computed(() => this.requiredTotal() - this.requiredDone());
  readonly headline = computed(() => {
    const a = this.overview()?.automation;
    const p = this.policy();
    return autopilotHeadline(this.steps(), { enabled: Boolean(p?.enabled ?? a?.enabled), paused: (p?.state ?? a?.state) === 'paused', pausedReason: p?.pausedReason ?? a?.pausedReason ?? null, mode: p?.mode ?? null });
  });

  readonly day = computed(() => {
    const d = new Date();
    d.setDate(d.getDate() + this.dayOffset());
    return d;
  });
  private readonly publishedTitles = computed(() => new Set((this.overview()?.recentPublications ?? []).filter((p) => p.status === 'published').map((p) => p.title.trim().toLowerCase())));
  private itemsOn(date: Date): DayItem[] {
    return this.planItems()
      .filter((item) => item.channel === 'website' && item.scheduledFor && sameDay(new Date(item.scheduledFor), date))
      .map((item) => {
        const title = item.finalSuggestedTitle || item.workingTitle || item.title;
        return { item, title, chip: planChip(item, this.publishedTitles(), title) };
      })
      .filter((entry): entry is DayItem => entry.chip !== null);
  }
  readonly dayItems = computed(() => this.itemsOn(this.day()));
  readonly featured = computed(() => this.dayItems()[0] ?? null);
  readonly otherDayItems = computed(() => this.dayItems().slice(1));
  readonly dayOperations = computed(() => (this.dayOffset() > 0 ? [] : this.operations().filter((op) => sameDay(new Date(op.createdAt), this.day()))));
  readonly dayCount = computed(() => {
    const ops = this.dayOperations().length;
    const topics = this.dayItems().length;
    const parts = [ops ? `${ops} ${ops === 1 ? 'activity' : 'activities'}` : '', topics ? `${topics} ${topics === 1 ? 'topic' : 'topics'}` : ''].filter(Boolean);
    return parts.join(' · ') || (this.dayOffset() > 0 ? 'Nothing planned yet' : 'No activity');
  });
  readonly week = computed<WeekDay[]>(() =>
    Array.from({ length: 7 }, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return { offset, date, isToday: offset === 0, items: this.itemsOn(date) };
    }),
  );
  readonly weekTopicCount = computed(() => this.week().reduce((sum, d) => sum + d.items.length, 0));
  readonly modeNote = computed(() => { const p = this.policy(); return p?.enabled && p.mode ? modeSummary(p.mode) : 'Pick one; you can change it any time'; });
  readonly weekSummary = computed(() => {
    const items = this.week().flatMap((d) => d.items);
    if (!items.length) return this.planReady() ? 'No topics in the next 7 days' : 'No plan yet';
    const count = (chip: PlanChip) => items.filter((i) => i.chip === chip).length;
    return [`${items.length} topic${items.length === 1 ? '' : 's'}`, count('Written') ? `${count('Written')} written` : '', count('Queued') ? `${count('Queued')} queued` : '', count('Needs approval') ? `${count('Needs approval')} need approval` : ''].filter(Boolean).join(' · ');
  });

  ngOnInit(): void {
    this.load();
    // Every 5 s while a plan is being written (to show its progress), otherwise every 30 s.
    let ticks = 0;
    this.refresh = timer(5_000, 5_000).subscribe(() => {
      ticks += 1;
      if (!document.hidden && (this.planGenerating() || ticks % 6 === 0)) this.load();
    });
  }

  ngOnDestroy(): void {
    this.refresh?.unsubscribe();
  }

  load(): void {
    const siteId = this.siteId() ?? undefined;
    this.api.getOverview().subscribe({ next: (o) => this.overview.set(o), error: () => undefined });
    this.api.getAutomationPolicy(siteId).subscribe({ next: (p) => this.policy.set(p), error: () => undefined });
    if (siteId) this.api.getSiteIntelligence(siteId).subscribe({ next: (i) => this.intelligence.set(i), error: () => undefined });
    this.api.listOperations({ page: 1, pageSize: 100, siteId }).subscribe({ next: (r) => this.operations.set(r.items), error: () => undefined });
    this.api
      .listEditorialPlans(1, 10)
      .pipe(
        switchMap((page) => {
          const plans = page.items.filter((plan) => !siteId || !plan.siteId || plan.siteId === siteId);
          this.plans.set(plans);
          const current = plans.filter((plan) => plan.status === 'ready' && new Date(plan.dateTo) >= new Date(Date.now() - 86_400_000)).slice(0, 3);
          return current.length ? forkJoin(current.map((plan) => this.api.getEditorialPlan(plan.id).pipe(catchError(() => of(null))))) : of([]);
        }),
      )
      .subscribe({
        next: (details) => this.planItems.set(details.flatMap((plan) => plan?.items ?? [])),
        error: () => undefined,
      });
  }

  stepsFor(required: boolean): SetupStep[] {
    return this.steps().filter((step) => step.required === required);
  }

  shiftDay(delta: number): void {
    this.dayOffset.update((value) => Math.max(-30, Math.min(30, value + delta)));
  }

  openDay(offset: number): void {
    this.dayOffset.set(offset);
    document.getElementById('ov-activity')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  readonly humanError = humanError;

  label(op: OperationItem) {
    return activityLabel(op.type, op.status);
  }

  difficulty(item: EditorialPlanItem) {
    return difficultyLabel(item.difficultyEstimate);
  }

  runStep(step: 'learn' | 'plan'): void {
    const siteId = this.siteId();
    if (!siteId) {
      this.stepError.set('Choose a site first');
      return;
    }
    this.stepError.set(null);
    this.busy.set(step);
    const done = (message: string) => {
      this.busy.set(null);
      this.toast.success(message);
      this.load();
    };
    const fail = (err: { error?: { error?: { message?: string } | string; message?: string } }) => {
      this.busy.set(null);
      const body = err?.error;
      this.stepError.set((typeof body?.error === 'object' ? body.error?.message : body?.message) || 'That step could not start. Try again.');
    };
    if (step === 'learn') {
      this.api.indexSite(siteId, { crawl: true }).subscribe({ next: () => done('Reading your site. This page updates when it is done.'), error: fail });
      return;
    }
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 29);
    const perDay = Math.max(1, this.policy()?.articlesPerDay ?? 1);
    this.api
      .generateEditorialPlan({
        siteId,
        dateFrom: from.toISOString().slice(0, 10),
        dateTo: to.toISOString().slice(0, 10),
        channels: ['website'],
        publicationCount: 30 * perDay,
        frequency: 'daily',
        timezone: this.policy()?.timezone,
      })
      .subscribe({ next: () => done('Planning the next 30 days. Topics appear here as soon as they are ready.'), error: fail });
  }

  setMode(mode: Mode): void {
    const siteId = this.siteId();
    this.busy.set('autopilot');
    this.stepError.set(null);
    this.api.updateAutomationPolicy({ siteId, mode }).subscribe({
      next: (policy) => {
        this.policy.set(policy);
        this.busy.set(null);
        this.modePickerOpen.set(false);
        this.toast.success(modeSummary(mode));
      },
      error: (err) => {
        this.busy.set(null);
        this.stepError.set(err?.error?.error?.message || err?.error?.message || 'The mode could not be saved.');
      },
    });
  }

  connectionState(c: { enabled: boolean; status: string; connectionState: string | null }): 'ok' | 'bad' | 'idle' {
    if (!c.enabled) return 'idle';
    if (c.connectionState === 'connected' || c.status === 'active') return 'ok';
    if (c.status === 'error' || ['expired', 'provider_error', 'permissions_required'].includes(c.connectionState ?? '')) return 'bad';
    return 'idle';
  }

  connectionLabel(c: { enabled: boolean; status: string; connectionState: string | null }): string {
    const state = this.connectionState(c);
    return !c.enabled ? 'Disabled' : state === 'ok' ? 'Connected' : state === 'bad' ? 'Action needed' : 'Not verified';
  }

  attentionItems(): Array<{ title: string; detail: string; action: string; link: string }> {
    const o = this.overview();
    if (!o) return [];
    const items: Array<{ title: string; detail: string; action: string; link: string }> = [];
    if (o.pipeline.failed > 0) items.push({ title: `${o.pipeline.failed} failed publication${o.pipeline.failed === 1 ? '' : 's'}`, detail: 'Open the attempt and retry or fix the destination', action: 'Review', link: '/studio/publications' });
    for (const c of o.connections) {
      if (this.connectionState(c) === 'bad') items.push({ title: `${c.displayName} needs attention`, detail: 'Its credentials stopped working', action: 'Fix', link: '/studio/connections' });
    }
    if (o.sources.failing > 0) items.push({ title: `${o.sources.failing} failing source${o.sources.failing === 1 ? '' : 's'}`, detail: 'They stopped feeding the inbox', action: 'Review', link: '/studio/sources' });
    return items;
  }
}
