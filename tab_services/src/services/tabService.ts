/**
 * Tab Service - IPC communication layer with main process
 * Provides abstraction for all tab operations via IPC
 */

import type { TabInfo, TabOptions, TabBounds, ElectronTabAPI } from '../types/tab';

// Re-export TAB_EVENTS for convenience
export { TAB_EVENTS } from '../types/tab';

// Check if running in Electron environment
const isElectron = typeof window !== 'undefined' && !!window.electron?.tab;

/**
 * Get the Electron tab API (throws if not available)
 */
function getTabAPI(): ElectronTabAPI {
  if (!isElectron) {
    throw new Error('Electron tab API not available - running in standalone mode');
  }
  return window.electron.tab;
}

/**
 * Tab service for IPC communication with main process
 */
export const tabService = {
  /**
   * Check if Electron API is available
   */
  isAvailable(): boolean {
    const available = isElectron;
    console.log(
      '[tabService] isAvailable:',
      available,
      'window.electron:',
      typeof window !== 'undefined' && !!window.electron,
      'window.electron?.tab:',
      typeof window !== 'undefined' && !!window.electron?.tab,
    );
    return available;
  },

  /**
   * Create a new tab
   */
  async createTab(url: string, options?: Partial<TabOptions>): Promise<TabInfo> {
    console.log('[tabService] createTab called with URL:', url, 'options:', options);
    if (!isElectron) {
      console.warn('[tabService] Not in Electron, returning mock');
      // Mock for development
      return {
        id: `tab-${Date.now()}`,
        url,
        title: url,
        isActive: true,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      };
    }
    console.log('[tabService] Calling window.electron.tab.create');
    return getTabAPI().create(url, options);
  },

  /**
   * Switch to a specific tab
   */
  async switchTab(tabId: string): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: true };
    }
    return getTabAPI().switch(tabId);
  },

  /**
   * Close a tab
   */
  async closeTab(tabId: string): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: true };
    }
    return getTabAPI().close(tabId);
  },

  /**
   * Get all tabs
   */
  async getAllTabs(): Promise<TabInfo[]> {
    console.log('[tabService] getAllTabs called');
    if (!isElectron) {
      console.warn('[tabService] Not in Electron, returning empty array');
      return [];
    }
    console.log('[tabService] Calling window.electron.tab.getAll');
    return getTabAPI().getAll();
  },

  /**
   * Get active tab
   */
  async getActiveTab(): Promise<TabInfo | null> {
    console.log('[tabService] getActiveTab called');
    if (!isElectron) {
      console.warn('[tabService] Not in Electron, returning null');
      return null;
    }
    console.log('[tabService] Calling window.electron.tab.getActive');
    return getTabAPI().getActive();
  },

  /**
   * Update tab bounds (for content area)
   */
  async updateBounds(bounds: TabBounds): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: true };
    }
    return getTabAPI().updateBounds(bounds);
  },

  /**
   * Set tab bar height (so main process knows content area offset)
   */
  async setBarHeight(height: number): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: true };
    }
    return getTabAPI().setBarHeight(height);
  },

  /**
   * Navigate back in active tab
   */
  async goBack(): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: true };
    }
    return getTabAPI().goBack();
  },

  /**
   * Navigate forward in active tab
   */
  async goForward(): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: true };
    }
    return getTabAPI().goForward();
  },

  /**
   * Reload active tab
   */
  async reload(): Promise<{ success: boolean }> {
    console.log('[tabService] reload called');
    if (!isElectron) {
      console.warn('[tabService] Not in Electron, returning success');
      return { success: true };
    }
    console.log('[tabService] Calling window.electron.tab.reload');
    return getTabAPI().reload();
  },

  /**
   * Stop loading in active tab
   */
  async stop(): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: true };
    }
    return getTabAPI().stop();
  },

  /**
   * Load URL in active tab
   */
  async loadURL(url: string): Promise<{ success: boolean }> {
    console.log('[tabService] loadURL called with URL:', url);
    if (!isElectron) {
      console.warn('[tabService] Not in Electron, returning success');
      return { success: true };
    }
    return getTabAPI().loadURL(url);
  },

  /**
   * Get default URL for new tabs
   */
  async getDefaultUrl(): Promise<string> {
    if (!isElectron) {
      return 'about:blank';
    }
    const result = await getTabAPI().getDefaultUrl();
    return result?.url || 'about:blank';
  },

  /**
   * Subscribe to tab events from main process
   * Returns unsubscribe function
   */
  subscribe(event: string, callback: (data: any) => void): () => void {
    if (!isElectron) {
      return () => {};
    }
    return getTabAPI().on(event, callback);
  },

  /**
   * Unsubscribe from tab events
   */
  unsubscribe(event: string, callback?: (data: any) => void): void {
    if (!isElectron) {
      return;
    }
    getTabAPI().off(event, callback);
  },

  /**
   * Subscribe to a tab event once
   */
  once(event: string, callback: (data: any) => void): void {
    if (!isElectron) {
      return;
    }
    getTabAPI().once(event, callback);
  },
};
