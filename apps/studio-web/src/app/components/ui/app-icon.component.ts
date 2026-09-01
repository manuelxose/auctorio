import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

type IconElement =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number };

const ICONS: Record<string, IconElement[]> = {
  overview: [
    { kind: 'rect', x: 3, y: 3, width: 7, height: 7, rx: 1 },
    { kind: 'rect', x: 14, y: 3, width: 7, height: 7, rx: 1 },
    { kind: 'rect', x: 14, y: 14, width: 7, height: 7, rx: 1 },
    { kind: 'rect', x: 3, y: 14, width: 7, height: 7, rx: 1 },
  ],
  inbox: [
    { kind: 'path', d: 'M22 12h-6l-2 3h-4l-2-3H2' },
    {
      kind: 'path',
      d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    },
  ],
  plan: [
    { kind: 'path', d: 'm3 17 2 2 4-4' },
    { kind: 'path', d: 'm3 7 2 2 4-4' },
    { kind: 'path', d: 'M13 6h8' },
    { kind: 'path', d: 'M13 12h8' },
    { kind: 'path', d: 'M13 18h8' },
  ],
  content: [
    { kind: 'path', d: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z' },
    { kind: 'path', d: 'M14 2v6h6' },
    { kind: 'path', d: 'M16 13H8' },
    { kind: 'path', d: 'M16 17H8' },
    { kind: 'path', d: 'M10 9H8' },
  ],
  calendar: [
    { kind: 'rect', x: 3, y: 4, width: 18, height: 17, rx: 2 },
    { kind: 'path', d: 'M16 2v4' },
    { kind: 'path', d: 'M8 2v4' },
    { kind: 'path', d: 'M3 10h18' },
  ],
  publications: [{ kind: 'path', d: 'M22 2 11 13' }, { kind: 'path', d: 'M22 2 15 22l-4-9-9-4Z' }],
  media: [
    { kind: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2 },
    { kind: 'circle', cx: 9, cy: 9, r: 2 },
    { kind: 'path', d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' },
  ],
  connections: [
    { kind: 'path', d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
    { kind: 'path', d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  ],
  sources: [
    { kind: 'path', d: 'M4 11a9 9 0 0 1 9 9' },
    { kind: 'path', d: 'M4 4a16 16 0 0 1 16 16' },
    { kind: 'circle', cx: 5, cy: 19, r: 1 },
  ],
  automation: [{ kind: 'path', d: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z' }],
  settings: [
    {
      kind: 'path',
      d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    },
    { kind: 'circle', cx: 12, cy: 12, r: 3 },
  ],
  search: [
    { kind: 'circle', cx: 11, cy: 11, r: 8 },
    { kind: 'path', d: 'm21 21-4.3-4.3' },
  ],
  plus: [{ kind: 'path', d: 'M5 12h14' }, { kind: 'path', d: 'M12 5v14' }],
  'chevron-down': [{ kind: 'path', d: 'm6 9 6 6 6-6' }],
  'chevron-up': [{ kind: 'path', d: 'm18 15-6-6-6 6' }],
  'chevron-right': [{ kind: 'path', d: 'm9 18 6-6-6-6' }],
  'chevron-left': [{ kind: 'path', d: 'm15 18-6-6 6-6' }],
  check: [{ kind: 'path', d: 'M20 6 9 17l-5-5' }],
  close: [{ kind: 'path', d: 'M18 6 6 18' }, { kind: 'path', d: 'm6 6 12 12' }],
  dots: [
    { kind: 'circle', cx: 5, cy: 12, r: 1 },
    { kind: 'circle', cx: 12, cy: 12, r: 1 },
    { kind: 'circle', cx: 19, cy: 12, r: 1 },
  ],
  external: [
    { kind: 'path', d: 'M15 3h6v6' },
    { kind: 'path', d: 'M10 14 21 3' },
    { kind: 'path', d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
  ],
  edit: [
    { kind: 'path', d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' },
    { kind: 'path', d: 'm15 5 4 4' },
  ],
  trash: [
    { kind: 'path', d: 'M3 6h18' },
    { kind: 'path', d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' },
    { kind: 'path', d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' },
    { kind: 'path', d: 'M10 11v6' },
    { kind: 'path', d: 'M14 11v6' },
  ],
  warning: [
    { kind: 'path', d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' },
    { kind: 'path', d: 'M12 9v4' },
    { kind: 'path', d: 'M12 17h.01' },
  ],
  info: [
    { kind: 'circle', cx: 12, cy: 12, r: 10 },
    { kind: 'path', d: 'M12 16v-4' },
    { kind: 'path', d: 'M12 8h.01' },
  ],
  'circle-check': [
    { kind: 'circle', cx: 12, cy: 12, r: 10 },
    { kind: 'path', d: 'm9 12 2 2 4-4' },
  ],
  'circle-x': [
    { kind: 'circle', cx: 12, cy: 12, r: 10 },
    { kind: 'path', d: 'm15 9-6 6' },
    { kind: 'path', d: 'm9 9 6 6' },
  ],
  refresh: [
    { kind: 'path', d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' },
    { kind: 'path', d: 'M21 3v5h-5' },
  ],
  // Gauge-style operations icon (lucide "gauge").
  operations: [
    { kind: 'path', d: 'm12 14 4-4' },
    { kind: 'path', d: 'M3.34 19a10 10 0 1 1 17.32 0' },
  ],
  clock: [
    { kind: 'circle', cx: 12, cy: 12, r: 10 },
    { kind: 'path', d: 'M12 6v6l4 2' },
  ],
  globe: [
    { kind: 'circle', cx: 12, cy: 12, r: 10 },
    { kind: 'path', d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' },
    { kind: 'path', d: 'M2 12h20' },
  ],
  user: [
    { kind: 'path', d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' },
    { kind: 'circle', cx: 12, cy: 7, r: 4 },
  ],
  logout: [
    { kind: 'path', d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' },
    { kind: 'path', d: 'm16 17 5-5-5-5' },
    { kind: 'path', d: 'M21 12H9' },
  ],
  sun: [
    { kind: 'circle', cx: 12, cy: 12, r: 4 },
    { kind: 'path', d: 'M12 2v2' },
    { kind: 'path', d: 'M12 20v2' },
    { kind: 'path', d: 'm4.93 4.93 1.41 1.41' },
    { kind: 'path', d: 'm17.66 17.66 1.41 1.41' },
    { kind: 'path', d: 'M2 12h2' },
    { kind: 'path', d: 'M20 12h2' },
    { kind: 'path', d: 'm6.34 17.66-1.41 1.41' },
    { kind: 'path', d: 'm19.07 4.93-1.41 1.41' },
  ],
  moon: [{ kind: 'path', d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }],
  monitor: [
    { kind: 'rect', x: 2, y: 3, width: 20, height: 14, rx: 2 },
    { kind: 'path', d: 'M8 21h8' },
    { kind: 'path', d: 'M12 17v4' },
  ],
  'arrow-up': [{ kind: 'path', d: 'm5 12 7-7 7 7' }, { kind: 'path', d: 'M12 19V5' }],
  'arrow-down': [{ kind: 'path', d: 'M12 5v14' }, { kind: 'path', d: 'm19 12-7 7-7-7' }],
  filter: [{ kind: 'path', d: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' }],
  pause: [
    { kind: 'rect', x: 6, y: 4, width: 4, height: 16, rx: 1 },
    { kind: 'rect', x: 14, y: 4, width: 4, height: 16, rx: 1 },
  ],
  play: [{ kind: 'path', d: 'M6 3.5v17a.5.5 0 0 0 .77.42l13.23-8.5a.5.5 0 0 0 0-.84L6.77 3.08A.5.5 0 0 0 6 3.5z' }],
  eye: [
    { kind: 'path', d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' },
    { kind: 'circle', cx: 12, cy: 12, r: 3 },
  ],
  copy: [
    { kind: 'rect', x: 8, y: 8, width: 14, height: 14, rx: 2 },
    { kind: 'path', d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' },
  ],
  sparkles: [
    {
      kind: 'path',
      d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
    },
    { kind: 'path', d: 'M20 3v4' },
    { kind: 'path', d: 'M22 5h-4' },
  ],
  scan: [
    { kind: 'path', d: 'M3 7V5a2 2 0 0 1 2-2h2' },
    { kind: 'path', d: 'M17 3h2a2 2 0 0 1 2 2v2' },
    { kind: 'path', d: 'M21 17v2a2 2 0 0 1-2 2h-2' },
    { kind: 'path', d: 'M7 21H5a2 2 0 0 1-2-2v-2' },
    { kind: 'path', d: 'M7 12h10' },
  ],
  undo: [
    { kind: 'path', d: 'M3 7v6h6' },
    { kind: 'path', d: 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13' },
  ],
  redo: [
    { kind: 'path', d: 'M21 7v6h-6' },
    { kind: 'path', d: 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13' },
  ],
  upload: [
    { kind: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
    { kind: 'path', d: 'm17 8-5-5-5 5' },
    { kind: 'path', d: 'M12 3v12' },
  ],
  bell: [
    { kind: 'path', d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' },
    { kind: 'path', d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' },
  ],
  history: [
    { kind: 'path', d: 'M3 3v5h5' },
    { kind: 'path', d: 'M3.05 13A9 9 0 1 0 6 5.3L3 8' },
    { kind: 'path', d: 'M12 7v5l4 2' },
  ],
  'thumbs-up': [
    { kind: 'path', d: 'M7 10v12' },
    { kind: 'path', d: 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z' },
  ],
  'thumbs-down': [
    { kind: 'path', d: 'M17 14V2' },
    { kind: 'path', d: 'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z' },
  ],
  home: [
    { kind: 'path', d: 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { kind: 'path', d: 'M9 22V12h6v10' },
  ],
  layers: [
    { kind: 'path', d: 'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z' },
    { kind: 'path', d: 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65' },
    { kind: 'path', d: 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65' },
  ],
  lock: [
    { kind: 'rect', x: 3, y: 11, width: 18, height: 11, rx: 2 },
    { kind: 'path', d: 'M7 11V7a5 5 0 0 1 10 0v4' },
  ],
  plug: [
    { kind: 'path', d: 'M12 22v-5' },
    { kind: 'path', d: 'M9 8V2' },
    { kind: 'path', d: 'M15 8V2' },
    { kind: 'path', d: 'M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z' },
  ],
};

export type StudioIconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <ng-container *ngFor="let element of elements">
        <path *ngIf="element.kind === 'path'" [attr.d]="element.d" />
        <circle
          *ngIf="element.kind === 'circle'"
          [attr.cx]="element.cx"
          [attr.cy]="element.cy"
          [attr.r]="element.r"
        />
        <rect
          *ngIf="element.kind === 'rect'"
          [attr.x]="element.x"
          [attr.y]="element.y"
          [attr.width]="element.width"
          [attr.height]="element.height"
          [attr.rx]="element.rx ?? null"
        />
      </ng-container>
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      svg {
        width: 16px;
        height: 16px;
        display: block;
      }
    `,
  ],
})
export class AppIconComponent {
  readonly name = input.required<string>();
  readonly size = input<number | null>(null);

  get elements(): IconElement[] {
    return ICONS[this.name()] ?? ICONS['circle-x'];
  }
}
