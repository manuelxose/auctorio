import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  SimpleChanges,
  inject,
} from '@angular/core';
import {
  CHAT_WIDGET_API_BASE_URL,
  CHAT_WIDGET_BASE_URL,
  CHAT_WIDGET_BRAND_LABEL,
  CHAT_WIDGET_ENTRY_CONTEXT,
  CHAT_WIDGET_SITE_KEYS,
  type MarketingLocale,
  TECNORIA_LINKS,
} from '../content/marketing-content';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';

type WidgetWindow = Window &
  typeof globalThis & {
    TecnoriaChatWidgetConfig?: {
      siteKey: string;
      apiBase: string;
      widgetBaseUrl: string;
      widgetOrigin: string;
      entryContext?: string;
      brandLabel?: string;
      sourceSite?: string;
      contactUrl?: string;
    };
  };

@Component({
  selector: 'app-auctorio-chat-widget',
  standalone: true,
  template: '',
})
export class AuctorioChatWidgetComponent implements OnInit, OnChanges, OnDestroy {
  private readonly scriptId = 'auctorio-chat-widget-loader';
  private readonly iframeTitle = 'Tecnoria Chat Widget';
  private readonly origin = inject(STUDIO_ORIGIN);
  private mountTimeoutId: number | null = null;
  @Input() locale: MarketingLocale = 'en';

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  ngOnInit(): void {
    this.mountWidget();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['locale'] || changes['locale'].firstChange) {
      return;
    }
    this.teardownWidget();
    this.mountWidget();
  }

  private mountWidget(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const win = this.document.defaultView as WidgetWindow | null;
    if (!win) {
      return;
    }

    win.TecnoriaChatWidgetConfig = {
      siteKey: CHAT_WIDGET_SITE_KEYS[this.locale],
      apiBase: CHAT_WIDGET_API_BASE_URL,
      widgetBaseUrl: CHAT_WIDGET_BASE_URL,
      widgetOrigin: CHAT_WIDGET_BASE_URL,
      entryContext: CHAT_WIDGET_ENTRY_CONTEXT[this.locale],
      brandLabel: CHAT_WIDGET_BRAND_LABEL,
      sourceSite: this.origin || win.location.origin,
      contactUrl: TECNORIA_LINKS.contact,
    };

    if (this.document.getElementById(this.scriptId)) {
      return;
    }

    const mount = () => {
      if (this.document.getElementById(this.scriptId)) {
        return;
      }

      const script = this.document.createElement('script');
      script.id = this.scriptId;
      script.async = true;
      script.src = new URL('embed.js', CHAT_WIDGET_BASE_URL).toString();
      script.dataset['siteKey'] = CHAT_WIDGET_SITE_KEYS[this.locale];
      script.dataset['apiBase'] = CHAT_WIDGET_API_BASE_URL;
      script.dataset['widgetBaseUrl'] = CHAT_WIDGET_BASE_URL;
      script.dataset['widgetOrigin'] = CHAT_WIDGET_BASE_URL;
      script.dataset['entryContext'] = CHAT_WIDGET_ENTRY_CONTEXT[this.locale];
      script.dataset['brandLabel'] = CHAT_WIDGET_BRAND_LABEL;
      script.dataset['sourceSite'] = this.origin || win.location.origin;
      script.dataset['contactUrl'] = TECNORIA_LINKS.contact;
      this.document.body.appendChild(script);
    };

    const idleCallback = (win as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
      .requestIdleCallback;
    if (idleCallback) {
      idleCallback(() => mount(), { timeout: 1600 });
      return;
    }

    this.mountTimeoutId = win.setTimeout(() => mount(), 1200);
  }

  ngOnDestroy(): void {
    this.teardownWidget();
  }

  private teardownWidget(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const win = this.document.defaultView as WidgetWindow | null;
    if (this.mountTimeoutId) {
      win?.clearTimeout(this.mountTimeoutId);
      this.mountTimeoutId = null;
    }
    this.document.getElementById(this.scriptId)?.remove();
    this.document.querySelector(`iframe[title="${this.iframeTitle}"]`)?.remove();
    if (win?.TecnoriaChatWidgetConfig) {
      delete win.TecnoriaChatWidgetConfig;
    }
  }
}
