import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, ElementRef, EventEmitter, Inject, Input, OnDestroy, OnInit, Output, PLATFORM_ID, ViewChild, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AppIconComponent } from './app-icon.component';

// Mirrors src/studio/html-sanitizer.ts: summary/TOC/brand cards are <aside>/<nav> blocks and must survive an edit.
const ALLOWED_TAGS = new Set(['P', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'IMG', 'BR', 'FIGURE', 'FIGCAPTION', 'ASIDE', 'NAV']);
const ALLOWED_ATTRS: Record<string, string[]> = {
  A: ['href', 'title', 'rel', 'target', 'style'],
  IMG: ['src', 'alt', 'width', 'height', 'loading'],
  H2: ['id', 'style'],
  H3: ['id', 'style'],
  TH: ['scope'],
  ASIDE: ['style'],
  P: ['style'],
};
const STYLE_PROPERTIES = new Set(['text-align', 'color', 'background-color', 'border', 'border-left', 'border-color', 'border-radius', 'padding', 'margin', 'display', 'text-decoration', 'font-weight']);

function cleanStyle(value: string): string {
  return value
    .split(';')
    .map((declaration) => declaration.split(':'))
    .filter((parts) => parts.length === 2 && STYLE_PROPERTIES.has(parts[0].trim().toLowerCase()) && /^[#a-z0-9 .%-]+$/i.test(parts[1].trim()))
    .map(([property, val]) => `${property.trim().toLowerCase()}:${val.trim()}`)
    .join(';');
}

/** youtube.com/watch?v=, youtu.be/ or /shorts/ → video id. */
export function youtubeId(url: string): string | null {
  const match = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return match ? match[1] : null;
}

/** No-JS video block: the thumbnail links to the video (iframes are stripped by the publishers' sanitizer). */
export function youtubeFigure(id: string, title: string): string {
  const safe = title.replace(/[<>"&]/g, '');
  return `<figure data-block="youtube"><a href="https://www.youtube.com/watch?v=${id}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="${safe}" width="480" height="360" loading="lazy"></a><figcaption>${safe}</figcaption></figure>`;
}

function sanitizeHtml(html: string): string {
  if (isPlatformBrowserSafe()) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clean = (element: Element) => {
      for (const child of Array.from(element.children)) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          child.replaceWith(...Array.from(child.childNodes));
          continue;
        }
        for (const attribute of Array.from(child.attributes)) {
          const name = attribute.name.toLowerCase();
          const allowed = ALLOWED_ATTRS[child.tagName] ?? [];
          if (!allowed.includes(name) && !name.startsWith('data-')) {
            child.removeAttribute(attribute.name);
          } else if (name === 'style') {
            const style = cleanStyle(attribute.value);
            if (style) child.setAttribute('style', style);
            else child.removeAttribute('style');
          }
        }
        if (child.tagName === 'A') {
          const href = child.getAttribute('href') ?? '';
          if (href.trim().toLowerCase().startsWith('javascript:')) {
            child.removeAttribute('href');
          }
        }
        clean(child);
      }
    };
    clean(doc.body);
    return doc.body.innerHTML;
  }
  return html;
}

function isPlatformBrowserSafe(): boolean {
  try {
    return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof DOMParser !== 'undefined';
  } catch {
    return false;
  }
}

@Component({
  selector: 'au-rich-editor',
  standalone: true,
  imports: [CommonModule, AppIconComponent],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: AuRichEditorComponent, multi: true }],
  template: `
    <div class="au-rich-editor">
      <div class="au-rich-editor__toolbar" role="toolbar" aria-label="Formatting toolbar">
        <button class="au-rich-editor__btn" type="button" title="Undo (Ctrl+Z)" aria-label="Undo" (mousedown)="exec('undo')"><app-icon name="undo"></app-icon></button>
        <button class="au-rich-editor__btn" type="button" title="Redo (Ctrl+Y)" aria-label="Redo" (mousedown)="exec('redo')"><app-icon name="redo"></app-icon></button>
        <span class="au-rich-editor__sep" aria-hidden="true"></span>
        <button class="au-rich-editor__btn" type="button" title="Paragraph" aria-label="Paragraph" (mousedown)="execBlock('p')">P</button>
        <button class="au-rich-editor__btn" type="button" title="Heading 2" aria-label="Heading 2" (mousedown)="execBlock('h2')">H2</button>
        <button class="au-rich-editor__btn" type="button" title="Heading 3" aria-label="Heading 3" (mousedown)="execBlock('h3')">H3</button>
        <span class="au-rich-editor__sep" aria-hidden="true"></span>
        <button class="au-rich-editor__btn au-rich-editor__btn--bold" type="button" title="Bold (Ctrl+B)" aria-label="Bold" (mousedown)="exec('bold')"><strong>B</strong></button>
        <button class="au-rich-editor__btn au-rich-editor__btn--italic" type="button" title="Italic (Ctrl+I)" aria-label="Italic" (mousedown)="exec('italic')"><em>I</em></button>
        <button class="au-rich-editor__btn" type="button" title="Underline (Ctrl+U)" aria-label="Underline" (mousedown)="exec('underline')"><u>U</u></button>
        <button class="au-rich-editor__btn" type="button" title="Strikethrough" aria-label="Strikethrough" (mousedown)="exec('strikeThrough')"><s>S</s></button>
        <span class="au-rich-editor__sep" aria-hidden="true"></span>
        <button class="au-rich-editor__btn" type="button" title="Bullet list" aria-label="Bullet list" (mousedown)="exec('insertUnorderedList')">• List</button>
        <button class="au-rich-editor__btn" type="button" title="Numbered list" aria-label="Numbered list" (mousedown)="exec('insertOrderedList')">1. List</button>
        <button class="au-rich-editor__btn" type="button" title="Blockquote" aria-label="Blockquote" (mousedown)="exec('formatBlock', '<blockquote>')">❝</button>
        <button class="au-rich-editor__btn" type="button" title="Link" aria-label="Link" (mousedown)="insertLink()"><app-icon name="link"></app-icon></button>
        <button class="au-rich-editor__btn" type="button" title="Insert table" aria-label="Insert table" (mousedown)="insertTable()">▦</button>
        <button class="au-rich-editor__btn" type="button" title="Divider" aria-label="Divider" (mousedown)="exec('insertHorizontalRule')">―</button>
        <button class="au-rich-editor__btn" type="button" title="Image" aria-label="Insert image" (mousedown)="insertImage()"><app-icon name="media"></app-icon></button>
        <button class="au-rich-editor__btn" type="button" title="YouTube video" aria-label="Insert YouTube video" (mousedown)="insertYoutube()">▶</button>
        <span class="au-rich-editor__sep" aria-hidden="true"></span>
        <button class="au-rich-editor__btn" type="button" title="Align left" aria-label="Align left" (mousedown)="exec('justifyLeft')">⇤</button>
        <button class="au-rich-editor__btn" type="button" title="Align center" aria-label="Align center" (mousedown)="exec('justifyCenter')">↔</button>
        <button class="au-rich-editor__btn" type="button" title="Align right" aria-label="Align right" (mousedown)="exec('justifyRight')">⇥</button>
        <span class="au-rich-editor__sep" aria-hidden="true"></span>
        <button class="au-rich-editor__btn" type="button" title="Clear formatting" aria-label="Clear formatting" (mousedown)="exec('removeFormat')">Tx</button>
      </div>
      <div
        #editable
        class="au-rich-editor__surface"
        [class.is-empty]="isEmpty"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        aria-label="Article content editor"
        [innerHTML]="safeHtml"
        (input)="onInput()"
        (paste)="onPaste($event)"
        (keydown.control.z)="exec('undo')"
        (keydown.control.y)="exec('redo')"
        (blur)="onTouched()"
      ></div>
      <div class="au-rich-editor__status" role="status">
        <span>{{ words }} words</span>
        <span>{{ chars }} characters</span>
        <span>{{ readingMinutes }} min read</span>
        <span>{{ headingCount }} headings</span>
        <span class="au-rich-editor__dirty" *ngIf="dirty">● unsaved changes</span>
      </div>
    </div>
  `,
})
export class AuRichEditorComponent implements OnInit, OnDestroy, ControlValueAccessor {
  @ViewChild('editable', { static: false }) editableRef!: ElementRef<HTMLElement>;
  @Input() placeholder = 'Write or paste your article…';
  @Input() autosaveMs = 30000;
  @Output() autosave = new EventEmitter<string>();
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  value = '';
  safeHtml = '';
  words = 0;
  chars = 0;
  readingMinutes = 0;
  headingCount = 0;
  dirty = false;
  get isEmpty(): boolean {
    return !this.value || this.value.replace(/<[^>]+>/g, '').trim().length === 0;
  }
  private onChange: ((value: string) => void) | null = null;
  private onTouchedCb: (() => void) | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private browser = false;

  ngOnInit(): void {
    this.browser = isPlatformBrowser(this.platformId);
    // Alignment as inline text-align (kept by both sanitizers), not <div align>.
    if (this.browser) document.execCommand('styleWithCSS', false, 'true');
    if (this.browser && this.autosaveMs > 0) {
      const interval = setInterval(() => {
        if (this.dirty) {
          this.dirty = false;
          this.autosave.emit(this.value);
        }
      }, this.autosaveMs);
      this.destroyRef.onDestroy(() => clearInterval(interval));
    }
    this.refreshStats();
  }

  ngOnDestroy(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
  }

  writeValue(value: string | null): void {
    const next = sanitizeHtml(String(value ?? ''));
    if (this.safeHtml === next) return;
    this.value = next;
    this.safeHtml = next;
    this.refreshStats();
  }

  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouchedCb = fn; }
  setDisabledState?(_disabled: boolean): void { /* contenteditable handles its own state */ }

  private currentHtml(): string {
    if (!this.browser || !this.editableRef) return this.value;
    return this.editableRef.nativeElement.innerHTML;
  }

  onInput(): void {
    if (!this.browser) return;
    const html = this.currentHtml();
    this.value = html;
    this.safeHtml = sanitizeHtml(html);
    if (this.safeHtml !== html && this.editableRef) {
      this.editableRef.nativeElement.innerHTML = this.safeHtml;
    }
    this.dirty = true;
    this.refreshStats();
    this.onChange?.(this.value);
  }

  onPaste(event: ClipboardEvent): void {
    if (!this.browser) return;
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html') ?? '';
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const clean = html ? sanitizeHtml(html) : (text ? text.replace(/\n/g, '<br>') : '');
    document.execCommand('insertHTML', false, clean);
    this.onInput();
  }

  onTouched(): void {
    this.onTouchedCb?.();
  }

  exec(command: string, value?: string): void {
    if (!this.browser) return;
    this.editableRef.nativeElement.focus();
    document.execCommand(command, false, value);
    this.onInput();
  }

  execBlock(tag: string): void {
    this.exec('formatBlock', tag === 'p' ? '<p>' : `<${tag}>`);
  }

  insertLink(): void {
    if (!this.browser) return;
    const href = window.prompt('Link URL (use only verified destination URLs for internal links):');
    if (!href || href.trim().toLowerCase().startsWith('javascript:')) return;
    document.execCommand('createLink', false, href.trim());
    this.onInput();
  }

  insertImage(): void {
    if (!this.browser) return;
    const src = window.prompt('Image URL (https://…):')?.trim();
    if (!src || !/^https?:\/\//i.test(src)) return;
    const alt = (window.prompt('Describe the image (alt text):') ?? '').replace(/[<>"&]/g, '').trim();
    document.execCommand('insertHTML', false, `<figure><img src="${src.replace(/"/g, '%22')}" alt="${alt}" loading="lazy"></figure>`);
    this.onInput();
  }

  insertYoutube(): void {
    if (!this.browser) return;
    const id = youtubeId(window.prompt('YouTube video URL:') ?? '');
    if (!id) return;
    document.execCommand('insertHTML', false, youtubeFigure(id, window.prompt('Video title (caption):') ?? 'Vídeo'));
    this.onInput();
  }

  insertTable(): void {
    if (!this.browser) return;
    const rows = 3;
    const cols = 2;
    const html =
      '<table><thead><tr>' +
      Array.from({ length: cols }, () => '<th>Heading</th>').join('') +
      '</tr></thead><tbody>' +
      Array.from({ length: rows - 1 }, () => `<tr>${Array.from({ length: cols }, () => '<td>Cell</td>').join('')}</tr>`).join('') +
      '</tbody></table>';
    document.execCommand('insertHTML', false, html);
    this.onInput();
  }

  private refreshStats(): void {
    const text = this.value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    this.words = text ? text.split(' ').filter(Boolean).length : 0;
    this.chars = text.length;
    this.readingMinutes = Math.max(1, Math.round(this.words / 200));
    this.headingCount = (this.value.match(/<h[23][^>]*>/gi) ?? []).length;
  }
}
