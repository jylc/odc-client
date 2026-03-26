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

import { BrowserWindow, BrowserView } from 'electron';
import log from '../utils/log';
import { TabContainer, TabEventCallback } from './TabContainer';
import { TabStore } from './TabStore';
import { ITabManager, ITabContainer, TabOptions, TabInfo, TabBounds, TAB_EVENTS } from './types';

export class TabManager implements ITabManager {
  private static instance: TabManager | null = null;
  private tabStore: TabStore;
  private eventEmitter: Map<string, Set<Function>>;
  private tabBarHeight: number = 40; // Default tab bar height
  private initialUrl: string | null = null; // Store initial URL for first tab
  private devToolsEnabled: boolean = false; // Track if DevTools should be auto-opened
  private devToolsTabs: Set<string> = new Set(); // Track tabs with DevTools open
  private rightCtrlPressCount: number = 0; // Track right Ctrl press count for DevTools toggle
  private rightCtrlPressTimer: NodeJS.Timeout | null = null; // Timer for resetting Ctrl press count

  public mainWindow: BrowserWindow | null = null;
  public tabs: Map<string, ITabContainer> = new Map();
  public activeTabId: string | null = null;

  private constructor() {
    this.tabStore = new TabStore();
    this.eventEmitter = new Map();
    this.initializeEventEmitter();
  }

  private initializeEventEmitter(): void {
    Object.values(TAB_EVENTS).forEach((eventName) => {
      this.eventEmitter.set(eventName, new Set());
    });
  }

  static getInstance(): TabManager {
    if (!TabManager.instance) {
      TabManager.instance = new TabManager();
    }
    return TabManager.instance;
  }

  initialize(mainWindow: BrowserWindow): void {
    if (this.mainWindow) {
      log.warn('[TabManager] Already initialized');
      return;
    }

    this.mainWindow = mainWindow;
    log.info('[TabManager] Initialized with main window');

    // Set up triple Ctrl press to toggle DevTools
    this.setupTripleCtrlListener();

    // Set up window close handler to save session
    mainWindow.on('close', () => {
      this.saveSession();
    });
  }

  /**
   * Set up triple right Ctrl press listener to toggle DevTools for active tab
   */
  private setupTripleCtrlListener(): void {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.on('before-input-event', (event, input) => {
      // Check for right Control key (location === 2 indicates right key)
      if (input.key === 'Control' && input.location === 2 && input.type === 'keyDown') {
        log.info('[TabManager] Right Ctrl pressed');
        this.rightCtrlPressCount++;

        // Clear previous timer if exists
        if (this.rightCtrlPressTimer) {
          clearTimeout(this.rightCtrlPressTimer);
        }

        // Set timer to reset count after 500ms
        this.rightCtrlPressTimer = setTimeout(() => {
          this.rightCtrlPressCount = 0;
        }, 500);

        // If pressed 3 times within 500ms, toggle DevTools
        if (this.rightCtrlPressCount === 3) {
          const activeTab = this.getActiveTab();
          if (activeTab) {
            if (activeTab.isDevToolsOpened()) {
              activeTab.closeDevTools();
              log.info(`[TabManager] DevTools closed via triple Ctrl for tab: ${activeTab.id}`);
            } else {
              activeTab.openDevTools();
              log.info(`[TabManager] DevTools opened via triple Ctrl for tab: ${activeTab.id}`);
            }
          } else {
            log.warn('[TabManager] No active tab to toggle DevTools');
          }
          this.rightCtrlPressCount = 0;
          if (this.rightCtrlPressTimer) {
            clearTimeout(this.rightCtrlPressTimer);
            this.rightCtrlPressTimer = null;
          }
        }
      }
    });

    log.info('[TabManager] Triple Ctrl listener set up for DevTools toggle');
  }

  /**
   * Set the initial URL for the first tab (main window content)
   */
  setInitialUrl(url: string): void {
    this.initialUrl = url;
    log.info(`[TabManager] Initial URL set to: ${url}`);
  }

  /**
   * Create the initial tab with the main window's URL
   * This should be called after the main window has loaded
   */
  createInitialTab(): void {
    if (!this.mainWindow) {
      log.warn('[TabManager] Main window not initialized');
      return;
    }

    // Create a virtual tab representing the main window content
    const initialTab: ITabContainer = {
      id: 'main-content',
      browserView: null as any, // Main window doesn't use BrowserView
      url: this.initialUrl || this.mainWindow.webContents.getURL(),
      title: 'ODC',
      favicon: undefined,
      isActive: true,
      isLoading: false,
      loadURL: async () => {},
      setActive: () => {},
      updateBounds: () => {},
      destroy: () => {},
      goBack: () => {},
      goForward: () => {},
      reload: () => this.mainWindow?.webContents.reload(),
      stop: () => {},
      getTabInfo: () => ({
        id: 'main-content',
        url: this.mainWindow?.webContents.getURL() || '',
        title: 'ODC',
        isActive: true,
        isLoading: false,
        canGoBack: this.mainWindow?.webContents.canGoBack() || false,
        canGoForward: this.mainWindow?.webContents.canGoForward() || false,
      }),
      openDevTools: () => {},
      closeDevTools: () => {},
      isDevToolsOpened: () => false,
    };

    this.tabs.set(initialTab.id, initialTab);
    this.activeTabId = initialTab.id;

    // Notify renderer about the initial tab
    this.sendToRenderer('tab:created', initialTab.getTabInfo());
    log.info('[TabManager] Initial tab created for main window content');
  }

  private restoreSession(): void {
    const savedTabs = this.tabStore.load();
    if (savedTabs.length > 0 && this.mainWindow) {
      log.info(`[TabManager] Restoring session with ${savedTabs.length} tabs`);

      // Only restore the first tab to avoid resource issues
      const firstTab = savedTabs[0];
      this.createTab(firstTab.url, {
        id: firstTab.id,
        title: firstTab.title,
        favicon: firstTab.favicon,
      });
    }
  }

  private saveSession(): void {
    const tabs = this.getAllTabInfo();
    this.tabStore.save(tabs);
  }

  createTab(url: string, options: Partial<TabOptions> = {}): ITabContainer {
    if (!this.mainWindow) {
      throw new Error('[TabManager] Main window not initialized');
    }

    const tab = new TabContainer(url, options.id);

    // Set up event callback for IPC broadcasting
    tab.setEventCallback((event, data) => {
      this.handleTabEvent(event, data);
    });

    if (options.title) {
      tab.title = options.title;
    }
    if (options.favicon) {
      tab.favicon = options.favicon;
    }

    this.tabs.set(tab.id, tab);
    log.info(`[TabManager] Created tab ${tab.id} for URL: ${url}`);

    // Auto-open DevTools in development mode
    const isDevMode =
      process.env.ODC_DEBUG_MODE === 'open' || process.env.NODE_ENV === 'development';
    if (isDevMode && this.devToolsEnabled) {
      // Track that this tab should have DevTools open
      this.devToolsTabs.add(tab.id);
      // Open DevTools after a delay to ensure the tab is ready
      setTimeout(() => {
        try {
          tab.openDevTools();
          log.info(`[TabManager] DevTools opened for new tab: ${tab.id}`);
        } catch (error) {
          log.error(`[TabManager] Failed to open DevTools for new tab:`, error);
        }
      }, 500);
    }

    // By default, activate the newly created tab
    // This ensures that when user clicks "new tab", they see the new tab immediately
    // Only skip activation if explicitly set to false
    const shouldActivate = options.isActive !== false;
    if (shouldActivate) {
      this.switchTab(tab.id);
    }

    // Emit tab created event locally and to renderer
    const tabInfo = tab.getTabInfo();
    this.emit(TAB_EVENTS.TAB_CREATED, tabInfo);
    this.sendToRenderer(TAB_EVENTS.TAB_CREATED, tabInfo);

    return tab;
  }

  /**
   * Handle events from TabContainer and broadcast to renderer
   */
  private handleTabEvent(event: string, data: any): void {
    log.debug(`[TabManager] Received tab event: ${event}`, data);

    // Track DevTools state
    if (event === 'devtools:opened') {
      this.devToolsTabs.add(data.tabId);
    } else if (event === 'devtools:closed') {
      this.devToolsTabs.delete(data.tabId);
    }
    // Reopen DevTools immediately when DOM is ready (before page fully loads)
    else if (event === 'dom-ready' && this.devToolsEnabled) {
      const tabId = data.tabId;
      if (this.devToolsTabs.has(tabId)) {
        const tab = this.tabs.get(tabId);
        if (tab) {
          // Open immediately without delay - DOM is ready
          try {
            tab.openDevTools();
            log.info(`[TabManager] DevTools reopened on dom-ready for tab: ${tabId}`);
          } catch (error) {
            log.error(`[TabManager] Failed to reopen DevTools:`, error);
          }
        }
      }
    }

    // Broadcast to renderer
    this.sendToRenderer(event, data);

    // Also emit locally for any internal listeners
    this.emit(event, data);
  }

  switchTab(tabId: string): void {
    if (!this.mainWindow) {
      log.warn('[TabManager] Main window not initialized');
      return;
    }

    const tab = this.tabs.get(tabId);
    if (!tab) {
      log.warn(`[TabManager] Tab ${tabId} not found`);
      return;
    }

    // Deactivate currently active tab
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabs.get(this.activeTabId);
      if (currentTab) {
        currentTab.setActive(false);
        // Remove BrowserView from window
        this.mainWindow.removeBrowserView(currentTab.browserView);
      }
    }

    // Activate new tab
    const bounds = this.getTabBounds();
    tab.setActive(true, bounds);

    // Add BrowserView to window
    this.mainWindow.addBrowserView(tab.browserView);
    tab.browserView.setBounds(bounds);

    this.activeTabId = tabId;
    log.info(`[TabManager] Switched to tab ${tabId}`);

    // Emit tab activated event locally and to renderer
    const tabInfo = tab.getTabInfo();
    this.emit(TAB_EVENTS.TAB_ACTIVATED, tabInfo);
    this.sendToRenderer(TAB_EVENTS.TAB_ACTIVATED, tabInfo);
  }

  closeTab(tabId: string): void {
    if (!this.mainWindow) {
      log.warn('[TabManager] Main window not initialized');
      return;
    }

    const tab = this.tabs.get(tabId);
    if (!tab) {
      log.warn(`[TabManager] Tab ${tabId} not found`);
      return;
    }

    // Remove BrowserView from window if active
    if (tab.isActive) {
      this.mainWindow.removeBrowserView(tab.browserView);
    }

    // Destroy tab
    tab.destroy();
    this.tabs.delete(tabId);

    log.info(`[TabManager] Closed tab ${tabId}`);

    // If we closed the active tab, switch to another
    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.tabs.keys());
      if (remainingTabs.length > 0) {
        // Switch to the last tab
        this.switchTab(remainingTabs[remainingTabs.length - 1]);
      } else {
        this.activeTabId = null;
      }
    }

    // Emit tab closed event locally and to renderer
    const closeData = { tabId };
    this.emit(TAB_EVENTS.TAB_CLOSED, closeData);
    this.sendToRenderer(TAB_EVENTS.TAB_CLOSED, closeData);
  }

  getActiveTab(): ITabContainer | null {
    if (!this.activeTabId) {
      return null;
    }
    return this.tabs.get(this.activeTabId) || null;
  }

  getAllTabs(): ITabContainer[] {
    return Array.from(this.tabs.values());
  }

  getTabInfo(tabId: string): TabInfo | null {
    const tab = this.tabs.get(tabId);
    return tab ? tab.getTabInfo() : null;
  }

  getAllTabInfo(): TabInfo[] {
    return Array.from(this.tabs.values()).map((tab) => tab.getTabInfo());
  }

  updateTabBounds(bounds: TabBounds): void {
    if (!this.mainWindow) {
      return;
    }

    const activeTab = this.getActiveTab();
    if (activeTab && activeTab.isActive) {
      activeTab.updateBounds(bounds);
    }
  }

  setTabBarHeight(height: number): void {
    this.tabBarHeight = height;
    if (this.mainWindow) {
      const bounds = this.getTabBounds();
      this.updateTabBounds(bounds);
    }
  }

  private getTabBounds(): TabBounds {
    if (!this.mainWindow) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const [width, height] = this.mainWindow.getSize();
    return {
      x: 0,
      y: this.tabBarHeight,
      width,
      height: height - this.tabBarHeight,
    };
  }

  // Event emitter methods
  on(event: string, listener: Function): void {
    const listeners = this.eventEmitter.get(event);
    if (listeners) {
      listeners.add(listener);
    }
  }

  off(event: string, listener: Function): void {
    const listeners = this.eventEmitter.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventEmitter.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          log.error(`[TabManager] Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Send IPC event to renderer process
   */
  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
      log.debug(`[TabManager] Sent IPC event '${channel}' to renderer`);
    }
  }

  /**
   * Notify renderer about tab state changes
   */
  private notifyTabUpdate(tabId: string, updates: Partial<TabInfo>): void {
    this.sendToRenderer('tab:updated', { tabId, updates });
  }

  /**
   * Enable auto DevTools for all tabs (development mode)
   */
  enableDevTools(): void {
    this.devToolsEnabled = true;
    log.info('[TabManager] DevTools auto-reopen enabled');

    // Open DevTools for existing tabs
    this.tabs.forEach((tab) => {
      this.devToolsTabs.add(tab.id);
      setTimeout(() => {
        try {
          tab.openDevTools();
          log.info(`[TabManager] DevTools opened for existing tab: ${tab.id}`);
        } catch (error) {
          log.error(`[TabManager] Failed to open DevTools:`, error);
        }
      }, 100);
    });
  }

  /**
   * Disable auto DevTools
   */
  disableDevTools(): void {
    this.devToolsEnabled = false;
    this.devToolsTabs.clear();
    log.info('[TabManager] DevTools auto-reopen disabled');

    // Close DevTools for all tabs
    this.tabs.forEach((tab) => {
      try {
        tab.closeDevTools();
      } catch (error) {
        log.error(`[TabManager] Failed to close DevTools:`, error);
      }
    });
  }

  destroy(): void {
    log.info('[TabManager] Destroying all tabs');

    // Destroy all tabs
    this.tabs.forEach((tab) => {
      tab.destroy();
    });
    this.tabs.clear();

    // Clear event listeners
    this.eventEmitter.forEach((listeners) => {
      listeners.clear();
    });

    // Clear the Ctrl press timer
    if (this.rightCtrlPressTimer) {
      clearTimeout(this.rightCtrlPressTimer);
      this.rightCtrlPressTimer = null;
    }

    this.activeTabId = null;
    this.mainWindow = null;

    // Save session before destroying
    this.saveSession();
  }
}
