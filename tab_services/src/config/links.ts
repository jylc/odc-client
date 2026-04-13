/*
 * Link configuration - loaded from main process via IPC or from defaults
 */

import { reactive } from 'vue';

export interface AppLinks {
  home: string;
  help: string;
  update: string;
}

// Default links (fallback) - must match libraries/script/app-updater*.yml
const defaultLinks: AppLinks = {
  home: 'https://hellogithub.com/',
  help: 'https://www.oceanbase.com/docs/',
  update: 'https://www.oceanbase.com/download/',
};

// Reactive links object - starts with defaults, updated via loadAppLinks()
export const appLinks: AppLinks = reactive<AppLinks>({ ...defaultLinks });

/**
 * Load links from main process via IPC and update the reactive appLinks.
 * Call this once during app initialization.
 */
export async function loadAppLinks(): Promise<AppLinks> {
  try {
    const isElectron = typeof window !== 'undefined' && !!window.electron?.update;
    if (isElectron) {
      const config = await (window as any).electron.update.getConfig();
      if (config?.links) {
        Object.assign(appLinks, config.links);
        console.log('[links] Loaded from main process:', config.links);
        return appLinks;
      }
    }
  } catch (error) {
    console.warn('[links] Failed to load links from main process:', error);
  }

  return appLinks;
}
