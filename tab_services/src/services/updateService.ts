/**
 * Update Service - IPC communication layer for app updates
 */

export { UPDATE_EVENTS } from '../types/update';

import type { UpdaterConfig } from '../types/update';

const isElectron = typeof window !== 'undefined' && !!window.electron?.update;

function getUpdateAPI() {
  return window.electron.update;
}

export const updateService = {
  isAvailable(): boolean {
    return isElectron;
  },

  async check(): Promise<{
    hasUpdate: boolean;
    version?: string;
    releaseNotes?: string;
    updateType?: 'major' | 'minor';
  }> {
    if (!isElectron) {
      console.warn('[updateService] Not in Electron');
      return { hasUpdate: false };
    }
    return getUpdateAPI().check();
  },

  async download(): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: false };
    }
    return getUpdateAPI().download();
  },

  async install(): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: false };
    }
    return getUpdateAPI().install();
  },

  async getVersion(): Promise<string> {
    if (!isElectron) {
      return '1.0.0';
    }
    const result = await getUpdateAPI().getVersion();
    return result.version;
  },

  async getConfig(): Promise<UpdaterConfig> {
    if (!isElectron) {
      return {
        links: {
          home: 'https://www.oceanbase.com/',
          help: 'https://www.oceanbase.com/docs/',
          update: 'https://www.oceanbase.com/download/',
        },
      };
    }
    return getUpdateAPI().getConfig();
  },

  async getReleaseNotes(): Promise<{ releaseNotes: string; version: string }> {
    if (!isElectron) {
      return { releaseNotes: '', version: '' };
    }
    return getUpdateAPI().getReleaseNotes();
  },

  async hotfixDownload(): Promise<{ success: boolean }> {
    if (!isElectron) {
      return { success: false };
    }
    return getUpdateAPI().hotfixDownload();
  },

  async hotfixStatus(): Promise<{ status: string; version?: string }> {
    if (!isElectron) {
      return { status: 'idle' };
    }
    return getUpdateAPI().hotfixStatus();
  },

  async downloadStatus(): Promise<{ state: string; updateType?: string; version?: string }> {
    if (!isElectron) {
      return { state: 'idle' };
    }
    return getUpdateAPI().downloadStatus();
  },

  async restartApp(): Promise<void> {
    if (!isElectron) {
      return;
    }
    return getUpdateAPI().restartApp();
  },

  subscribe(event: string, callback: (data: any) => void): () => void {
    if (!isElectron) {
      return () => {};
    }
    return getUpdateAPI().on(event, callback);
  },
};
