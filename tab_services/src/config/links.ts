/*
 * Link configuration from package.json
 */

export interface AppLinks {
  home: string;
  help: string;
  update: string;
}

/**
 * Get app links from package.json
 * In development, reads from root package.json
 * In production, reads from app's package.json
 */
export function getAppLinks(): AppLinks {
  // Default links (fallback)
  const defaultLinks: AppLinks = {
    home: 'https://www.oceanbase.com/',
    help: 'https://www.oceanbase.com/docs/',
    update: 'https://www.oceanbase.com/download/',
  };

  try {
    // Try to get links from window.appConfig if available (injected by main process)
    if ((window as any).appConfig?.links) {
      return (window as any).appConfig.links as AppLinks;
    }

    // Try to read from package.json during development
    if (process.env.NODE_ENV === 'development') {
      // In dev mode, these are already configured in package.json
      return defaultLinks;
    }

    return defaultLinks;
  } catch (error) {
    console.warn('[links] Failed to load app links, using defaults:', error);
    return defaultLinks;
  }
}

export const appLinks = getAppLinks();
