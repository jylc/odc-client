import { app, BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import log from '../utils/log';
import { TabManager } from '../tabs';

// Type for release notes (can be string or array of objects with note property)
type ReleaseNoteInfo = { note?: string; [key: string]: any };

// Update server configuration
const UPDATE_SERVER_URL = 'http://192.168.1.26:12345/';

// Configure autoUpdater feed URL
autoUpdater.setFeedURL({
  provider: 'generic',
  url: UPDATE_SERVER_URL,
  channel: 'latest',
});

// Configure autoUpdater behavior
autoUpdater.autoDownload = false; // Manual download trigger
autoUpdater.autoInstallOnAppQuit = false; // Manual install trigger

export interface RemoteUpdateInfo {
  version: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export class UpdateService {
  private static instance: UpdateService | null = null;
  private state: UpdateState = 'idle';
  private updateInfo: RemoteUpdateInfo | null = null;
  private currentVersion: string;

  private constructor() {
    this.currentVersion = app.getVersion();
    this.setupAutoUpdaterListeners();
    log.info(`[UpdateService] Current version: ${this.currentVersion}`);
    log.info(`[UpdateService] Update server: ${UPDATE_SERVER_URL}`);
  }

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  getState(): UpdateState {
    return this.state;
  }

  getUpdateInfo(): RemoteUpdateInfo | null {
    return this.updateInfo;
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Format release notes to string
   * electron-updater returns string | ReleaseNoteInfo[]
   */
  private formatReleaseNotes(releaseNotes: string | ReleaseNoteInfo[] | null | undefined): string {
    if (!releaseNotes) {
      return '';
    }
    if (typeof releaseNotes === 'string') {
      return releaseNotes;
    }
    // Handle ReleaseNoteInfo[] format
    if (Array.isArray(releaseNotes)) {
      return releaseNotes.map((note) => note.note || JSON.stringify(note)).join('\n');
    }
    return String(releaseNotes);
  }

  /**
   * Set up electron-updater event listeners
   * Converts electron-updater events to our custom format
   */
  private setupAutoUpdaterListeners(): void {
    // When checking for updates
    autoUpdater.on('checking-for-update', () => {
      this.state = 'checking';
      this.sendToRenderer('update:checking', {});
      log.info('[UpdateService] Checking for updates...');
    });

    // When update is available
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.state = 'available';
      const releaseNotes = this.formatReleaseNotes(info.releaseNotes);
      this.updateInfo = {
        version: info.version,
        releaseNotes,
        downloadUrl: info.path,
      };
      this.sendToRenderer('update:available', {
        version: info.version,
        releaseNotes,
      });
      log.info(`[UpdateService] Update available: ${info.version}`);
    });

    // When no update is available
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.state = 'idle';
      this.sendToRenderer('update:not-available', {});
      log.info('[UpdateService] No update available');
    });

    // Download progress
    autoUpdater.on(
      'download-progress',
      (progress: {
        percent: number;
        bytesPerSecond: number;
        transferred: number;
        total: number;
      }) => {
        this.state = 'downloading';
        const percent = Math.round(progress.percent);
        this.sendToRenderer('update:progress', { progress: percent });
        log.debug(`[UpdateService] Download progress: ${percent}%`);
      },
    );

    // Update downloaded
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.state = 'downloaded';
      this.sendToRenderer('update:downloaded', {
        version: info.version,
      });
      log.info(`[UpdateService] Update downloaded: ${info.version}`);
    });

    // Error occurred
    autoUpdater.on('error', (error: Error) => {
      this.state = 'error';
      this.sendToRenderer('update:error', { message: error.message });
      log.error('[UpdateService] Update error:', error);
    });
  }

  /**
   * Check for updates
   */
  async checkForUpdate(): Promise<RemoteUpdateInfo | null> {
    if (this.state === 'checking' || this.state === 'downloading') {
      log.warn('[UpdateService] Update check already in progress');
      return null;
    }

    try {
      const result = await autoUpdater.checkForUpdates();

      if (result && result.updateInfo) {
        return {
          version: result.updateInfo.version,
          releaseNotes: this.formatReleaseNotes(result.updateInfo.releaseNotes),
        };
      }
      return null;
    } catch (error) {
      log.error('[UpdateService] Check failed:', error);
      this.state = 'error';
      this.sendToRenderer('update:error', { message: String(error) });
      return null;
    }
  }

  /**
   * Download the update
   */
  async downloadUpdate(): Promise<boolean> {
    if (this.state !== 'available') {
      log.warn('[UpdateService] No update available to download');
      return false;
    }

    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      log.error('[UpdateService] Download failed:', error);
      this.state = 'error';
      this.sendToRenderer('update:error', { message: String(error) });
      return false;
    }
  }

  /**
   * Install the downloaded update
   */
  async installUpdate(): Promise<void> {
    if (this.state !== 'downloaded') {
      log.warn('[UpdateService] No update downloaded to install');
      return;
    }

    try {
      // electron-updater will restart and install
      setImmediate(() => {
        app.removeAllListeners('window-all-closed');
        autoUpdater.quitAndInstall();
      });
    } catch (error) {
      log.error('[UpdateService] Install failed:', error);
      this.state = 'error';
      this.sendToRenderer('update:error', { message: String(error) });
    }
  }

  /**
   * Send IPC event to renderer process
   */
  private sendToRenderer(channel: string, data: any): void {
    const tabManager = TabManager.getInstance();
    const mainWindow = tabManager.mainWindow;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
      log.debug(`[UpdateService] Sent IPC '${channel}' to renderer`);
    }
  }
}
