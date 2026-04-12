import { app, BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { exec } from 'child_process';
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
  private downloadedInstallerPath: string | null = null;

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

  getUpdateServerUrl(): string {
    return this.updateServerUrl;
  }

  /**
   * Open update modal as a separate BrowserWindow (not covered by tab BrowserViews)
   */
  private openUpdateModalWindow(version: string, releaseNotes: string): void {
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const windows = BrowserWindow.getAllWindows();

      // Check if update modal is already open
      for (const win of windows) {
        const url = win.webContents.getURL();
        if (url.includes('#/update')) {
          win.focus();
          log.info('[UpdateService] Update modal already open, focusing');
          return;
        }
      }

      const tabManager = TabManager.getInstance();
      const mainWindow = tabManager.mainWindow;
      if (!mainWindow) return;

      const queryParams = new URLSearchParams({ version, releaseNotes });
      const updateUrl = isDev
        ? `http://localhost:5173/#/update?${queryParams.toString()}`
        : `file://${path.join(process.resourcesPath || '', 'tab_services', 'index.html')}#/update?${queryParams.toString()}`;

      const updateWindow = new BrowserWindow({
        width: 460,
        height: 420,
        modal: true,
        parent: mainWindow,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(
            isDev ? process.cwd() : process.resourcesPath || '',
            'libraries/script',
            'preload.js',
          ),
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false,
        },
      });

      updateWindow.setMenu(null);

      // Center on parent
      const [pw, ph] = mainWindow.getSize();
      const [px, py] = mainWindow.getPosition();
      const [w, h] = updateWindow.getSize();
      updateWindow.setPosition(Math.round(px + (pw - w) / 2), Math.round(py + (ph - h) / 2));

      updateWindow.once('ready-to-show', () => updateWindow.show());
      updateWindow.loadURL(updateUrl).catch((e) => {
        log.error('[UpdateService] Failed to load update modal:', e);
      });

      log.info('[UpdateService] Update modal window opened');
    } catch (error) {
      log.error('[UpdateService] Failed to open update modal window:', error);
    }
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
   * Parse releaseNotes from YAML content generated by electron-builder
   * Supports both quoted string ("...\n...") and block scalar (|) formats
   */
  private parseYamlReleaseNotes(data: string): string {
    // Try quoted string format: releaseNotes: "content with \n"
    const quotedMatch = data.match(/releaseNotes:\s*["'](.+?)["']/s);
    if (quotedMatch) {
      return quotedMatch[1].replace(/\\n/g, '\n');
    }

    // Try block scalar format: releaseNotes: |\n  line1\n  line2\n
    const blockMatch = data.match(/releaseNotes:\s*[|>][-+]?[\s]*\n((?:[ \t]+.+\n?)*)/);
    if (blockMatch) {
      const rawLines = blockMatch[1].split('\n');
      // Find minimum indentation of non-empty lines
      let minIndent = Infinity;
      for (const line of rawLines) {
        if (line.trim().length > 0) {
          minIndent = Math.min(minIndent, line.search(/\S/));
        }
      }
      if (minIndent === Infinity) minIndent = 0;
      return rawLines
        .map((l) => l.substring(minIndent))
        .join('\n')
        .trim();
    }

    return '';
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

      // Auto-trigger hotfix download for minor updates (background check)
      if (this.updateType === 'minor') {
        log.info('[UpdateService] Minor update detected, starting hotfix download');
        this.state = 'idle';
        const hotfixUrl = HotUpdateService.buildHotfixUrl(this.updateServerUrl, remoteInfo.version);
        HotUpdateService.getInstance()
          .downloadAndApply(remoteInfo.version, hotfixUrl)
          .catch((error) => {
            log.error('[UpdateService] Hotfix download failed:', error);
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
                // Parse YAML: extract version, releaseNotes and path
                const versionMatch = data.match(/version:\s*['"]?(\d+\.\d+\.\d+)['"]?/);
                const releaseNotes = this.parseYamlReleaseNotes(data);
                // Extract installer path (e.g. "path: odc_Setup_4.4.1_win64.exe")
                const pathMatch = data.match(/^path:\s*(.+)$/m);
                const downloadUrl = pathMatch ? pathMatch[1].trim() : '';
                if (versionMatch) {
                  resolve({
                    version: versionMatch[1],
                    releaseNotes,
                    downloadUrl,
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
   * Download the major update installer.
   * In packed mode: uses autoUpdater (handles NSIS installer correctly).
   * In dev mode: falls back to HTTP download.
   */
  async downloadUpdate(): Promise<boolean> {
    if (this.state !== 'available' || !this.updateInfo) {
      log.warn('[UpdateService] No update available to download');
      return false;
    }

    this.state = 'downloading';

    if (app.isPackaged) {
      // Production: use autoUpdater to download (handles NSIS installer path correctly)
      try {
        log.info('[UpdateService] Using autoUpdater to download major update');
        const checkResult = await autoUpdater.checkForUpdates();
        if (checkResult) {
          await autoUpdater.downloadUpdate();
          // 'update-downloaded' event from setupAutoUpdaterListeners() will set state='downloaded'
          return true;
        }
        log.warn('[UpdateService] autoUpdater found no update, falling back to HTTP');
      } catch (error) {
        log.error('[UpdateService] autoUpdater download failed, trying HTTP fallback:', error);
      }
    }

    // Dev mode or autoUpdater failure: HTTP fallback
    return this.downloadUpdateHttp();
  }

  /**
   * HTTP fallback for downloading major update installer.
   * Used when autoUpdater is unavailable (dev mode) or fails.
   */
  private async downloadUpdateHttp(): Promise<boolean> {
    if (!this.updateInfo) {
      return false;
    }

    try {
      this.sendToRenderer('update:progress', { progress: 0 });

      const baseUrl = this.updateServerUrl.endsWith('/')
        ? this.updateServerUrl
        : `${this.updateServerUrl}/`;
      const installerFileName =
        this.updateInfo.downloadUrl || `odc_Setup_${this.updateInfo.version}_win64.exe`;
      const downloadUrl = installerFileName.startsWith('http')
        ? installerFileName
        : `${baseUrl}${installerFileName}`;

      log.info(`[UpdateService] Downloading installer via HTTP: ${downloadUrl}`);

      const tmpDir = app.getPath('temp');
      const installerPath = path.join(tmpDir, path.basename(installerFileName));

      await this.downloadFileHttp(downloadUrl, installerPath);

      this.downloadedInstallerPath = installerPath;
      this.state = 'downloaded';
      this.sendToRenderer('update:downloaded', { version: this.updateInfo.version });
      log.info(`[UpdateService] Installer downloaded to: ${installerPath}`);
      return true;
    } catch (error) {
      log.error('[UpdateService] HTTP download failed:', error);
      this.state = 'error';
      this.sendToRenderer('update:error', { message: String(error) });
      return false;
    }
  }

  /**
   * Install the downloaded update.
   * In packed mode: uses autoUpdater.quitAndInstall() (correct NSIS install path).
   * In dev mode: runs the downloaded installer via exec + app.exit().
   */
  async installUpdate(): Promise<void> {
    if (this.state !== 'downloaded') {
      log.warn('[UpdateService] No update downloaded to install');
      return;
    }

    try {
      if (app.isPackaged) {
        log.info('[UpdateService] Using autoUpdater.quitAndInstall()');
        // Remove will-quit handler to prevent cleanup logic from blocking exit
        // autoUpdater.quitAndInstall() needs the app to quit cleanly
        app.removeAllListeners('will-quit');
        autoUpdater.quitAndInstall();
      } else {
        // Dev mode fallback: run downloaded installer and exit
        const installerPath = this.downloadedInstallerPath;
        if (installerPath && fs.existsSync(installerPath)) {
          log.info(`[UpdateService] Launching installer: ${installerPath}`);
          exec(`"${installerPath}"`, (err) => {
            if (err) {
              log.error('[UpdateService] Failed to launch installer:', err);
            }
          });
          setTimeout(() => {
            log.info('[UpdateService] Exiting app for installer to proceed');
            app.exit(0);
          }, 1500);
        } else {
          log.warn('[UpdateService] No installer path available');
          app.exit(0);
        }
      }
    } catch (error) {
      log.error('[UpdateService] Install failed:', error);
      this.state = 'error';
      this.sendToRenderer('update:error', { message: String(error) });
    }
  }

  /**
   * Download a file via HTTP with progress tracking
   */
  private downloadFileHttp(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const doDownload = (downloadUrl: string) => {
        const request = protocol.get(downloadUrl, (response) => {
          // Handle redirects
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            doDownload(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Download failed with status ${response.statusCode}`));
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;
          const fileStream = fs.createWriteStream(destPath);

          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              const percent = Math.round((downloadedBytes / totalBytes) * 100);
              this.sendToRenderer('update:progress', { progress: percent });
            }
          });

          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            log.info(`[UpdateService] Downloaded ${destPath} (${downloadedBytes} bytes)`);
            resolve();
          });

          fileStream.on('error', (err) => {
            fs.unlinkSync(destPath);
            reject(err);
          });
        });

        request.on('error', reject);
        request.setTimeout(600000, () => {
          request.destroy();
          reject(new Error('Download timeout'));
        });
      };

      doDownload(url);
    });
  }

  /**
   * Send IPC event to all renderer processes (main window + settings window etc.)
   */
  private sendToRenderer(channel: string, data: any): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
    log.debug(`[UpdateService] Sent IPC '${channel}' to ${windows.length} window(s)`);
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
   * Read version from version.json (hot-updatable) or package.json (fallback)
   *
   * Priority:
   * 1. resources/version.json — can be updated via hotfix
   * 2. package.json — inside app.asar, only updated with full install
   * 3. app.getVersion() — last resort
   */
  private readVersionFromPackageJson(): string {
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const basePath = isDev ? process.cwd() : process.resourcesPath || '';

      if (isDev) {
        // Development: read directly from package.json
        const pkgPath = path.join(basePath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.version) {
            log.info(`[UpdateService] Read version from ${pkgPath}: ${pkg.version}`);
            return pkg.version;
          }
        }
      } else {
        // Production: prefer version.json (hot-updatable), fallback to package.json
        const versionJsonPath = path.join(basePath, 'version.json');
        if (fs.existsSync(versionJsonPath)) {
          const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
          if (versionJson.version) {
            log.info(`[UpdateService] Read version from ${versionJsonPath}: ${versionJson.version}`);
            return versionJson.version;
          }
        }

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
      }
    } catch (error) {
      log.warn(
        '[UpdateService] Failed to read version, falling back to app.getVersion()',
      );
    }
    return app.getVersion();
  }
}
