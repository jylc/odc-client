/*
 * Link configuration - loaded from main process via IPC or from defaults
 */

export interface AppLinks {
  home: string;
  help: string;
  update: string;
}

// Default links (fallback)
const defaultLinks: AppLinks = {
  home: 'https://www.oceanbase.com/',
  help: 'https://www.oceanbase.com/docs/',
  update: 'https://www.oceanbase.com/download/',
};

/**
 * Get app links synchronously (returns cached or default values)
 */
export function getAppLinks(): AppLinks {
  // Return cached links if available
  if (cachedLinks) {
    return cachedLinks;
  }

  try {
    // Try to get links from window.appConfig if available (injected by main process)
    if ((window as any).appConfig?.links) {
      return (window as any).appConfig.links as AppLinks;
    }
  } catch (error) {
    console.warn('[links] Failed to read appConfig:', error);
  }

  return defaultLinks;
}

let cachedLinks: AppLinks | null = null;

/**
 * Load links from main process via IPC (async)
 * Falls back to defaults if IPC is not available
 */
export async function loadAppLinks(): Promise<AppLinks> {
  try {
    const isElectron = typeof window !== 'undefined' && !!window.electron?.update;
    if (isElectron) {
      const config = await (window as any).electron.update.getConfig();
      if (config?.links) {
        cachedLinks = config.links;
        return cachedLinks!;
      }
    }
  } catch (error) {
    console.warn('[links] Failed to load links from main process:', error);
  }

  return defaultLinks;
}

// Initialize with defaults, can be updated later via loadAppLinks()
export const appLinks = getAppLinks();
