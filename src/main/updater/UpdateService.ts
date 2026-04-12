import { app, BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import log from '../utils/log';
import { TabManager } from '../tabs';
import { getUpdaterConfig } from './configLoader';
import { compareUpdateType } from './versionUtils';
import { HotUpdateService } from './HotUpdateService';

// Type for release notes (can be string or array of objects with note property)
type ReleaseNoteInfo = { note?: string; [key: string]: any };

// Configure autoUpdater behavior (safe to set at module level)
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
  private updateType: 'major' | 'minor' | null = null;
  private periodicCheckTimer: ReturnType<typeof setInterval> | null = null;
  private updateServerUrl: string;

  private constructor() {
    // Load config at construction time (after app.ready)
    const updaterConfig = getUpdaterConfig();
    this.updateServerUrl = updaterConfig.updateServerUrl;

    this.currentVersion = this.readVersionFromPackageJson();
    this.setupAutoUpdaterListeners();

    // Set feed URL only if we have a valid URL
    if (this.updateServerUrl) {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: this.updateServerUrl,
        channel: 'latest',
      });
    }

    log.info(`[UpdateService] Current version: ${this.currentVersion}`);
    log.info(`[UpdateService] Update server: ${this.updateServerUrl}`);
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

  getUpdateType(): 'major' | 'minor' | null {
    return this.updateType;
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
   * Only used for download/install progress tracking
   */
  private setupAutoUpdaterListeners(): void {
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
   * Check for updates by querying the server directly
   * Does not rely on electron-updater's internal version comparison
   */
  async checkForUpdate(): Promise<RemoteUpdateInfo | null> {
    if (this.state === 'checking' || this.state === 'downloading') {
      log.warn('[UpdateService] Update check already in progress');
      return null;
    }

    this.state = 'checking';
    this.sendToRenderer('update:checking', {});
    log.info('[UpdateService] Checking for updates...');

    try {
      const remoteInfo = await this.fetchRemoteVersion();

      if (!remoteInfo) {
        this.state = 'idle';
        this.sendToRenderer('update:not-available', {});
        log.info('[UpdateService] No update available or failed to fetch remote version');
        return null;
      }

      log.info(`[UpdateService] Remote version from server: ${remoteInfo.version}`);
      log.info(`[UpdateService] Local version from package.json: ${this.currentVersion}`);

      // Compare versions
      const result = compareUpdateType(this.currentVersion, remoteInfo.version);

      if (result === 'equal' || result === 'older') {
        this.state = 'idle';
        this.sendToRenderer('update:not-available', {});
        log.info(`[UpdateService] No update needed (comparison result: ${result})`);
        return null;
      }

      // Update available
      this.state = 'available';
      this.updateType = result;
      this.updateInfo = remoteInfo;
      log.info(`[UpdateService] Update available: ${remoteInfo.version}, type: ${this.updateType}`);

      this.sendToRenderer('update:available', {
        version: remoteInfo.version,
        releaseNotes: remoteInfo.releaseNotes,
        updateType: this.updateType,
      });

      // Auto-trigger hotfix download for minor updates
      if (this.updateType === 'minor') {
        log.info('[UpdateService] Minor update detected, starting hotfix download silently');
        this.state = 'idle';
        const hotfixUrl = HotUpdateService.buildHotfixUrl(this.updateServerUrl, remoteInfo.version);
        HotUpdateService.getInstance()
          .downloadAndApply(remoteInfo.version, hotfixUrl)
          .catch((error) => {
            log.error('[UpdateService] Auto hotfix failed:', error);
          });
      }

      return remoteInfo;
    } catch (error) {
      log.error('[UpdateService] Check failed:', error);
      this.state = 'error';
      this.sendToRenderer('update:error', { message: String(error) });
      return null;
    }
  }

  /**
   * Fetch latest version info from update server
   * Tries: {updateServerUrl}/latest.json or {updateServerUrl}/latest.yml
   */
  private fetchRemoteVersion(): Promise<RemoteUpdateInfo | null> {
    return new Promise((resolve) => {
      const baseUrl = this.updateServerUrl.endsWith('/')
        ? this.updateServerUrl
        : `${this.updateServerUrl}/`;

      // Try JSON endpoint first, then fall back to YAML
      const endpoints = ['latest.json', 'latest.yml'];

      const tryEndpoint = (index: number) => {
        if (index >= endpoints.length) {
          log.warn('[UpdateService] No version info found on server');
          resolve(null);
          return;
        }

        const url = baseUrl + endpoints[index];
        log.info(`[UpdateService] Fetching: ${url}`);
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, (response) => {
          if (response.statusCode === 404) {
            log.info(`[UpdateService] ${endpoints[index]} not found, trying next`);
            tryEndpoint(index + 1);
            return;
          }

          if (response.statusCode !== 200) {
            log.warn(`[UpdateService] Server returned status ${response.statusCode}`);
            tryEndpoint(index + 1);
            return;
          }

          let data = '';
          response.on('data', (chunk: string) => {
            data += chunk;
          });

          response.on('end', () => {
            try {
              if (endpoints[index] === 'latest.json') {
                const json = JSON.parse(data);
                resolve({
                  version: json.version,
                  releaseNotes: json.releaseNotes || json.changelog || '',
                  downloadUrl: json.downloadUrl || json.path || '',
                });
              } else {
                // Parse simple YAML: extract version from "version: x.y.z"
                const versionMatch = data.match(/version:\s*['"]?(\d+\.\d+\.\d+)['"]?/);
                if (versionMatch) {
                  resolve({
                    version: versionMatch[1],
                    releaseNotes: '',
                    downloadUrl: '',
                  });
                } else {
                  log.warn('[UpdateService] Could not parse version from YAML');
                  tryEndpoint(index + 1);
                }
              }
            } catch (parseError) {
              log.warn(`[UpdateService] Failed to parse ${endpoints[index]}:`, parseError);
              tryEndpoint(index + 1);
            }
          });
        });

        request.on('error', (err) => {
          log.warn(`[UpdateService] Request to ${url} failed:`, err.message);
          tryEndpoint(index + 1);
        });

        request.setTimeout(10000, () => {
          request.destroy();
          log.warn(`[UpdateService] Request to ${url} timed out`);
          tryEndpoint(index + 1);
        });
      };

      tryEndpoint(0);
    });
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

  /**
   * Start periodic update check
   * @param intervalMs Check interval in milliseconds (default: 2 hours)
   */
  startPeriodicCheck(intervalMs: number = 2 * 60 * 60 * 1000): void {
    if (this.periodicCheckTimer) {
      log.warn('[UpdateService] Periodic check already running');
      return;
    }

    log.info(`[UpdateService] Starting periodic check every ${intervalMs / 1000}s`);
    this.periodicCheckTimer = setInterval(() => {
      if (this.state === 'idle' || this.state === 'error') {
        log.info('[UpdateService] Periodic check triggered');
        this.checkForUpdate().catch((error) => {
          log.error('[UpdateService] Periodic check failed:', error);
        });
      } else {
        log.debug(`[UpdateService] Skipping periodic check, state: ${this.state}`);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic update check
   */
  stopPeriodicCheck(): void {
    if (this.periodicCheckTimer) {
      clearInterval(this.periodicCheckTimer);
      this.periodicCheckTimer = null;
      log.info('[UpdateService] Periodic check stopped');
    }
  }

  /**
   * Read version directly from package.json (not app.getVersion())
   * app.getVersion() reads the asar's package.json which may be stale
   */
  private readVersionFromPackageJson(): string {
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const basePath = isDev ? process.cwd() : process.resourcesPath || '';
      // In production, electron-builder copies package.json into the app root
      // Try resourcesPath first, then app path
      const candidates = [
        path.join(basePath, 'package.json'),
        path.join(app.getAppPath(), 'package.json'),
      ];

      for (const pkgPath of candidates) {
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.version) {
            log.info(`[UpdateService] Read version from ${pkgPath}: ${pkg.version}`);
            return pkg.version;
          }
        }
      }
    } catch (error) {
      log.warn(
        '[UpdateService] Failed to read version from package.json, falling back to app.getVersion()',
      );
    }
    return app.getVersion();
  }
}
