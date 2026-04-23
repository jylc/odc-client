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
import { preloadScriptPath } from '../config';
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
  public readonly tag?: string; // Optional tag to identify special tabs (e.g., 'home', 'help')

  private currentBounds: TabBounds;
  private isDestroyed: boolean = false;
  private eventCallback: TabEventCallback | null = null;
  private wasLocalUrl: boolean = false; // Track initial URL type for security boundary detection
  private devToolsShouldStayOpen: boolean = false; // Track DevTools state to keep open across navigations

  constructor(url: string, id?: string, tag?: string) {
    this.id = id || generateTabId();
    this.url = url;
    this.title = this.extractTitleFromUrl(url);
    this.isActive = false;
    this.isLoading = false;
    this.tag = tag; // Store the tag
    this.currentBounds = { x: 0, y: 0, width: 0, height: 0 };

    // Determine security settings based on URL
    // Local/trusted content: enable Node.js for ODC functionality
    // Remote/untrusted content: disable Node.js for security
    const isLocalContent = this.isLocalUrl(url);
    this.wasLocalUrl = isLocalContent; // Track initial URL type

    this.browserView = new BrowserView({
      webPreferences: {
        preload: preloadScriptPath,
        nodeIntegration: isLocalContent,
        contextIsolation: !isLocalContent,
        webSecurity: !isLocalContent,
        // Always enable sandbox for better security
        sandbox: !isLocalContent,
      },
    });

    this.setupBrowserViewEvents();

    // Load the initial URL immediately after creating BrowserView
    this.loadURL(url).catch((error) => {
      log.error(`[Tab ${this.id}] Failed to load initial URL:`, error);
    });

    if (isLocalContent) {
      log.info(`[Tab ${this.id}] Created with Node.js enabled for local content: ${url}`);
    } else {
      log.info(`[Tab ${this.id}] Created with Node.js disabled for remote content: ${url}`);
    }
  }

  /**
   * Check if URL is local/trusted content that requires Node.js integration
   */
  private isLocalUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Localhost variants
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '[::1]'
      ) {
        return true;
      }

      // Local network ranges (optional - uncomment if needed)
      // if (hostname.startsWith('192.168.') ||
      //     hostname.startsWith('10.') ||
      //     hostname.startsWith('172.')) {
      //   return true;
      // }

      // about:blank for new tabs
      if (urlObj.protocol === 'about:') {
        return true;
      }

      return false;
    } catch {
      // Invalid URL, treat as local (could be about:blank)
      return true;
    }
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

    // Intercept new window requests (e.g., target="_blank" links, window.open())
    // and redirect to open in a new tab instead
    webContents.setWindowOpenHandler(({ url, frameName, features, disposition }) => {
      log.info(`[Tab ${this.id}] New window request intercepted:`, {
        url,
        frameName,
        features,
        disposition,
      });

      // For all new window requests (popup, new window, background tab, etc.)
      // emit an event to create a new tab instead of opening a new window
      this.emitEvent('tab:new-window-request', {
        url,
        frameName,
        features,
        disposition,
      });

      // Prevent the default behavior (opening a new window)
      return { action: 'deny' };
    });

    webContents.on('did-start-loading', () => {
      if (this.isDestroyed) return;
      this.isLoading = true;
      // Remember DevTools state so we can reopen if Electron closes it during navigation
      this.devToolsShouldStayOpen = this.isDevToolsOpened();
      log.info(`[Tab ${this.id}] Started loading: ${this.url}`);
      this.emitEvent(TAB_EVENTS.TAB_LOADING, { isLoading: true });
    });

    // Listen for dom-ready to reopen DevTools as early as possible (fallback)
    webContents.on('dom-ready', () => {
      if (this.isDestroyed) return;
      log.info(`[Tab ${this.id}] DOM ready`);
      // Fallback: ensure DevTools is open if it should stay open
      if (this.devToolsShouldStayOpen && !this.isDevToolsOpened()) {
        try {
          this.openDevTools();
          log.info(`[Tab ${this.id}] DevTools reopened on dom-ready`);
        } catch (error) {
          log.error(`[Tab ${this.id}] Failed to reopen DevTools on dom-ready:`, error);
        }
      }
      this.devToolsShouldStayOpen = false;
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
      // Safely access webContents methods - frame might be disposed during rapid navigation
      try {
        this.url = webContents.getURL();
        this.title = webContents.getTitle() || this.extractTitleFromUrl(this.url);
      } catch (error) {
        // Frame was disposed, use current state as fallback
        log.debug(`[Tab ${this.id}] WebFrame disposed during did-finish-load, using cached state`);
      }
      log.info(`[Tab ${this.id}] Finished loading: ${this.url}`);

      // Include navigation state when page finishes loading
      const tabInfo = this.getTabInfo();
      this.emitEvent(TAB_EVENTS.TAB_LOADED, {
        isLoading: false,
        url: this.url,
        title: this.title,
        canGoBack: tabInfo.canGoBack,
        canGoForward: tabInfo.canGoForward,
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
      // For blank tabs, keep the "新标签页" title
      if (this.url === 'about:blank') {
        this.title = '新标签页';
      } else {
        this.title = title || this.extractTitleFromUrl(this.url);
      }
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

      // Include navigation state (canGoBack, canGoForward) in the update
      const tabInfo = this.getTabInfo();
      this.emitEvent(TAB_EVENTS.TAB_UPDATED, {
        url,
        canGoBack: tabInfo.canGoBack,
        canGoForward: tabInfo.canGoForward,
      });

      // Track security boundary changes
      if (this.wasLocalUrl && !this.isLocalUrl(url)) {
        log.warn(`[Tab ${this.id}] SECURITY WARNING: Navigated from local to remote URL: ${url}`);
      }
      this.wasLocalUrl = this.isLocalUrl(url);
    });

    webContents.on('did-navigate-in-page', (event, url) => {
      if (this.isDestroyed) return;
      // Skip if URL hasn't actually changed to avoid redundant events
      if (this.url === url) return;
      this.url = url;

      // Include navigation state (canGoBack, canGoForward) in the update
      const tabInfo = this.getTabInfo();
      this.emitEvent(TAB_EVENTS.TAB_UPDATED, {
        url,
        canGoBack: tabInfo.canGoBack,
        canGoForward: tabInfo.canGoForward,
      });
    });

    // Track DevTools state changes
    webContents.on('devtools-opened', () => {
      log.info(`[Tab ${this.id}] DevTools opened`);
      this.emitEvent('devtools:opened', {});
    });

    webContents.on('devtools-closed', () => {
      log.info(`[Tab ${this.id}] DevTools closed`);
      // If DevTools should stay open (navigation caused the close), reopen immediately
      if (this.devToolsShouldStayOpen && !this.isDestroyed && this.isLoading) {
        setTimeout(() => {
          if (!this.isDestroyed && this.devToolsShouldStayOpen) {
            this.openDevTools();
            log.info(
              `[Tab ${this.id}] DevTools reopened after Electron auto-close during navigation`,
            );
          }
        }, 50);
      }
      this.emitEvent('devtools:closed', {});
    });

    if (process.env.ODC_DEBUG_MODE === 'open' || process.env.NODE_ENV === 'development') {
      webContents.on('console-message', (event, level, message, line, sourceId) => {
        log.debug(`[Tab ${this.id}] Console [${level}]: ${message}`);
      });
    }
  }

  private extractTitleFromUrl(url: string): string {
    if (!url || url === 'about:blank') {
      return '新标签页';
    }
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
    // Check if webContents is still valid before accessing it
    const webContentsValid =
      !this.isDestroyed && this.browserView && !this.browserView.webContents.isDestroyed();
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      favicon: this.favicon,
      isActive: this.isActive,
      isLoading: this.isLoading,
      canGoBack: webContentsValid && this.browserView.webContents.canGoBack(),
      canGoForward: webContentsValid && this.browserView.webContents.canGoForward(),
      tag: this.tag,
    };
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    log.info(`[Tab ${this.id}] Destroying tab`);
    this.isDestroyed = true;

    try {
      const webContents = this.browserView.webContents;

      // Close DevTools first if open to free additional memory
      // DevTools runs in a separate process and must be explicitly closed
      if (webContents.isDevToolsOpened()) {
        webContents.closeDevTools();
        log.info(`[Tab ${this.id}] DevTools closed during destroy`);
      }

      // Remove all event listeners to prevent memory leaks
      // This prevents callbacks from firing on destroyed objects
      webContents.removeAllListeners();

      // CRITICAL: Destroy webContents to free memory and stop renderer process
      // The webContents object maintains a renderer process that consumes memory
      // Calling destroy() properly cleans up the process and releases resources
      (webContents as any).destroy();
      log.info(`[Tab ${this.id}] webContents destroyed, renderer process terminated`);
    } catch (error) {
      log.warn(`[Tab ${this.id}] Error during cleanup:`, error);
    }

    this.isActive = false;
    log.info(`[Tab ${this.id}] Tab fully destroyed and memory freed`);
  }
}
