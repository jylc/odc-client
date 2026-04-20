/**
 * Tab types for tab_service - matches main process types
 */

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isActive: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  tag?: string; // Optional tag to identify special tabs (e.g., 'home', 'help')
}

export interface TabOptions {
  id?: string;
  url: string;
  title?: string;
  favicon?: string;
  isActive?: boolean;
  tag?: string; // Optional tag to identify special tabs (e.g., 'home', 'help')
}

export interface TabBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TAB_EVENTS = {
  TAB_CREATED: 'tab:created',
  TAB_UPDATED: 'tab:updated',
  TAB_ACTIVATED: 'tab:activated',
  TAB_CLOSED: 'tab:closed',
  TAB_LOADING: 'tab:loading',
  TAB_LOADED: 'tab:loaded',
  TAB_TITLE_UPDATED: 'tab:title-updated',
  TAB_FAVICON_UPDATED: 'tab:favicon-updated',
} as const;

/**
 * Electron tab API interface (exposed via preload.js)
 */
export interface ElectronTabAPI {
  create: (url: string, options?: Partial<TabOptions>) => Promise<TabInfo>;
  switch: (tabId: string) => Promise<{ success: boolean }>;
  close: (tabId: string) => Promise<{ success: boolean }>;
  getAll: () => Promise<TabInfo[]>;
  getActive: () => Promise<TabInfo | null>;
  updateBounds: (bounds: TabBounds) => Promise<{ success: boolean }>;
  setBarHeight: (height: number) => Promise<{ success: boolean }>;
  goBack: () => Promise<{ success: boolean }>;
  goForward: () => Promise<{ success: boolean }>;
  reload: () => Promise<{ success: boolean }>;
  stop: () => Promise<{ success: boolean }>;
  loadURL: (url: string) => Promise<{ success: boolean }>;
  getDefaultUrl: () => Promise<{ url: string }>;
  on: (event: string, callback: (data: any) => void) => () => void;
  off: (event: string, callback?: (data: any) => void) => void;
  once: (event: string, callback: (data: any) => void) => void;
}

/**
 * Window control API interface (exposed via preload.js)
 */
export interface ElectronWindowControlAPI {
  minimize: () => Promise<{ success: boolean }>;
  maximize: () => Promise<{ success: boolean }>;
  unmaximize: () => Promise<{ success: boolean }>;
  isMaximized: () => Promise<{ success: boolean; isMaximized: boolean }>;
  close: () => Promise<{ success: boolean }>;
  openSettings: () => Promise<{ success: boolean; alreadyOpen?: boolean }>;
}

/**
 * Update API interface (exposed via preload.js)
 */
export interface ElectronUpdateAPI {
  check: () => Promise<{
    hasUpdate: boolean;
    version?: string;
    releaseNotes?: string;
    updateType?: 'major' | 'minor';
    error?: string;
  }>;
  download: () => Promise<{ success: boolean; error?: string }>;
  install: () => Promise<{ success: boolean }>;
  getVersion: () => Promise<{ version: string }>;
  getConfig: () => Promise<{ links: { home: string; help: string; update: string } }>;
  getReleaseNotes: () => Promise<{ releaseNotes: string; version: string }>;
  hotfixDownload: () => Promise<{ success: boolean; error?: string }>;
  hotfixStatus: () => Promise<{ status: string; version?: string }>;
  downloadStatus: () => Promise<{ state: string; updateType?: string; version?: string }>;
  restartApp: () => Promise<void>;
  on: (event: string, callback: (data: any) => void) => () => void;
}

/**
 * Shell API interface (exposed via preload.js)
 */
export interface ElectronShellAPI {
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    electron: {
      tab: ElectronTabAPI;
      windowControl: ElectronWindowControlAPI;
      update: ElectronUpdateAPI;
      shell: ElectronShellAPI;
    };
  }
}
