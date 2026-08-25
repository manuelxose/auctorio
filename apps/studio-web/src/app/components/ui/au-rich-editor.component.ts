import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, ElementRef, EventEmitter, Inject, Input, OnDestroy, OnInit, Output, PLATFORM_ID, ViewChild, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AppIconComponent } from './app-icon.component';

const ALLOWED_TAGS = new Set(['P', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'U', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'BR', 'FIGURE', 'FIGCAPTION']);

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
          const allowed = child.tagName === 'A' ? ['href', 'title', 'rel', 'target'] : child.tagName === 'IMG' ? ['src', 'alt', 'width', 'height'] : [];
          if (!allowed.includes(name) && !name.startsWith('data-')) {
            child.removeAttribute(attribute.name);
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
        <span class="au-rich-editor__sep" aria-hidden="true"></span>
        <button class="au-rich-editor__btn" type="button" title="Bullet list" aria-label="Bullet list" (mousedown)="exec('insertUnorderedList')">• List</button>
        <button class="au-rich-editor__btn" type="button" title="Numbered list" aria-label="Numbered list" (mousedown)="exec('insertOrderedList')">1. List</button>
        <button class="au-rich-editor__btn" type="button" title="Blockquote" aria-label="Blockquote" (mousedown)="exec('formatBlock', '<blockquote>')">❝</button>
        <button class="au-rich-editor__btn" type="button" title="Link" aria-label="Link" (mousedown)="insertLink()">🔗</button>
        <button class="au-rich-editor__btn" type="button" title="Insert table" aria-label="Insert table" (mousedown)="insertTable()">▦</button>
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
