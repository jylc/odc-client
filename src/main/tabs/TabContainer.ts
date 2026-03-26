/*
 * Copyright 2023 OceanBase
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BrowserView } from 'electron';
import log from '../utils/log';
import { ITabContainer, TabBounds, TabInfo, TAB_EVENTS } from './types';

/**
 * Generate a unique tab ID
 */
function generateTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Event callback type for tab state changes
 */
export type TabEventCallback = (event: string, data: any) => void;

export class TabContainer implements ITabContainer {
  public readonly id: string;
  public readonly browserView: BrowserView;
  public url: string;
  public title: string;
  public favicon?: string;
  public isActive: boolean;
  public isLoading: boolean;

  private currentBounds: TabBounds;
  private isDestroyed: boolean = false;
  private eventCallback: TabEventCallback | null = null;

  constructor(url: string, id?: string) {
    this.id = id || generateTabId();
    this.url = url;
    this.title = this.extractTitleFromUrl(url);
    this.isActive = false;
    this.isLoading = false;
    this.currentBounds = { x: 0, y: 0, width: 0, height: 0 };

    this.browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false,
      },
    });

    this.setupBrowserViewEvents();
  }

  /**
   * Set callback for tab events (to be called by TabManager)
   */
  setEventCallback(callback: TabEventCallback): void {
    this.eventCallback = callback;
  }

  /**
   * Emit event to callback if set
   */
  private emitEvent(event: string, data: any = {}): void {
    if (this.eventCallback) {
      this.eventCallback(event, { tabId: this.id, ...data });
    }
  }

  /**
   * Open DevTools for this tab
   */
  openDevTools(): void {
    if (!this.isDestroyed) {
      this.browserView.webContents.openDevTools();
    }
  }

  /**
   * Close DevTools for this tab
   */
  closeDevTools(): void {
    if (!this.isDestroyed) {
      this.browserView.webContents.closeDevTools();
    }
  }

  /**
   * Check if DevTools is open
   */
  isDevToolsOpened(): boolean {
    return !this.isDestroyed && this.browserView.webContents.isDevToolsOpened();
  }

  private setupBrowserViewEvents(): void {
    const webContents = this.browserView.webContents;

    webContents.on('did-start-loading', () => {
      if (this.isDestroyed) return;
      this.isLoading = true;
      // Close DevTools before page reload to avoid disconnect message
      if (this.isDevToolsOpened()) {
        this.closeDevTools();
        log.info(`[Tab ${this.id}] DevTools closed before reload`);
      }
      log.info(`[Tab ${this.id}] Started loading: ${this.url}`);
      this.emitEvent(TAB_EVENTS.TAB_LOADING, { isLoading: true });
    });

    // Listen for dom-ready to reopen DevTools as early as possible
    webContents.on('dom-ready', () => {
      if (this.isDestroyed) return;
      log.info(`[Tab ${this.id}] DOM ready`);
      this.emitEvent('dom-ready', {});
    });

    webContents.on('did-stop-loading', () => {
      if (this.isDestroyed) return;
      this.isLoading = false;
      log.info(`[Tab ${this.id}] Stopped loading: ${this.url}`);
      this.emitEvent(TAB_EVENTS.TAB_LOADED, { isLoading: false });
    });

    webContents.on('did-finish-load', () => {
      if (this.isDestroyed) return;
      this.isLoading = false;
      this.url = webContents.getURL();
      this.title = this.extractTitleFromUrl(this.url);
      log.info(`[Tab ${this.id}] Finished loading: ${this.url}`);
      this.emitEvent(TAB_EVENTS.TAB_LOADED, {
        isLoading: false,
        url: this.url,
        title: this.title,
      });
    });

    webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      if (this.isDestroyed) return;
      this.isLoading = false;
      log.error(`[Tab ${this.id}] Failed to load: ${validatedURL}`, errorCode, errorDescription);
      this.emitEvent(TAB_EVENTS.TAB_LOADED, { isLoading: false, error: errorDescription });
    });

    webContents.on('page-title-updated', (event, title) => {
      if (this.isDestroyed) return;
      this.title = title || this.extractTitleFromUrl(this.url);
      log.info(`[Tab ${this.id}] Title updated: ${this.title}`);
      this.emitEvent(TAB_EVENTS.TAB_TITLE_UPDATED, { title: this.title });
    });

    webContents.on('page-favicon-updated', (event, favicons) => {
      if (this.isDestroyed) return;
      if (favicons && favicons.length > 0) {
        this.favicon = favicons[0];
        this.emitEvent(TAB_EVENTS.TAB_FAVICON_UPDATED, { favicon: this.favicon });
      }
    });

    webContents.on('did-navigate', (event, url) => {
      if (this.isDestroyed) return;
      this.url = url;
      this.emitEvent(TAB_EVENTS.TAB_UPDATED, { url });
    });

    webContents.on('did-navigate-in-page', (event, url) => {
      if (this.isDestroyed) return;
      this.url = url;
      this.emitEvent(TAB_EVENTS.TAB_UPDATED, { url });
    });

    // Track DevTools state changes
    webContents.on('devtools-opened', () => {
      log.info(`[Tab ${this.id}] DevTools opened`);
      this.emitEvent('devtools:opened', {});
    });

    webContents.on('devtools-closed', () => {
      log.info(`[Tab ${this.id}] DevTools closed`);
      this.emitEvent('devtools:closed', {});
    });

    if (process.env.ODC_DEBUG_MODE === 'open' || process.env.NODE_ENV === 'development') {
      webContents.on('console-message', (event, level, message, line, sourceId) => {
        log.debug(`[Tab ${this.id}] Console [${level}]: ${message}`);
      });
    }
  }

  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname) {
        return urlObj.hostname;
      }
      return url;
    } catch {
      return url;
    }
  }

  async loadURL(url: string): Promise<void> {
    if (this.isDestroyed) {
      log.warn(`[Tab ${this.id}] Attempted to load URL on destroyed tab`);
      return;
    }

    this.url = url;
    this.title = this.extractTitleFromUrl(url);
    this.isLoading = true;

    try {
      await this.browserView.webContents.loadURL(url);
    } catch (error) {
      this.isLoading = false;
      log.error(`[Tab ${this.id}] Failed to load URL: ${url}`, error);
      throw error;
    }
  }

  setActive(active: boolean, bounds?: TabBounds): void {
    if (this.isDestroyed) {
      log.warn(`[Tab ${this.id}] Attempted to set active on destroyed tab`);
      return;
    }

    this.isActive = active;

    if (active && bounds) {
      this.updateBounds(bounds);
    }
  }

  updateBounds(bounds: TabBounds): void {
    if (this.isDestroyed) {
      return;
    }

    this.currentBounds = { ...bounds };
    this.browserView.setBounds(bounds);
  }

  goBack(): void {
    if (!this.isDestroyed && this.browserView.webContents.canGoBack()) {
      this.browserView.webContents.goBack();
    }
  }

  goForward(): void {
    if (!this.isDestroyed && this.browserView.webContents.canGoForward()) {
      this.browserView.webContents.goForward();
    }
  }

  reload(): void {
    if (!this.isDestroyed) {
      this.browserView.webContents.reload();
    }
  }

  stop(): void {
    if (!this.isDestroyed) {
      this.browserView.webContents.stop();
    }
  }

  getTabInfo(): TabInfo {
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      favicon: this.favicon,
      isActive: this.isActive,
      isLoading: this.isLoading,
      canGoBack: !this.isDestroyed && this.browserView.webContents.canGoBack(),
      canGoForward: !this.isDestroyed && this.browserView.webContents.canGoForward(),
    };
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    log.info(`[Tab ${this.id}] Destroying tab`);
    this.isDestroyed = true;

    try {
      // Remove webContents event listeners
      this.browserView.webContents.removeAllListeners();
    } catch (error) {
      log.warn(`[Tab ${this.id}] Error removing listeners:`, error);
    }

    this.isActive = false;
  }
}
