import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import originalFs from 'original-fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { pipeline } from 'stream';
import { promisify } from 'util';
import * as AdmZip from 'adm-zip';
import log from '../utils/log';
import { TabManager } from '../tabs';

const pipelineAsync = promisify(pipeline);

export interface HotUpdateState {
  status: 'idle' | 'downloading' | 'extracting' | 'pending-restart' | 'error';
  version?: string;
  progress?: number;
  error?: string;
}

export class HotUpdateService {
  private static instance: HotUpdateService | null = null;
  private state: HotUpdateState = { status: 'idle' };
  private userDataPath: string;
  private resourcesPath: string;
  private updatesDir: string;
  private pendingMarkerPath: string;

  private constructor() {
    this.userDataPath = app.getPath('userData');
    this.resourcesPath = process.resourcesPath || '';
    this.updatesDir = path.join(this.userDataPath, 'updates');
    this.pendingMarkerPath = path.join(this.userDataPath, 'hotfix-pending.json');
  }

  static getInstance(): HotUpdateService {
    if (!HotUpdateService.instance) {
      HotUpdateService.instance = new HotUpdateService();
    }
    return HotUpdateService.instance;
  }

  getState(): HotUpdateState {
    return { ...this.state };
  }

  /**
   * Ensure the updates directory exists
   */
  private ensureUpdatesDir(): void {
    if (!fs.existsSync(this.updatesDir)) {
      fs.mkdirSync(this.updatesDir, { recursive: true });
    }
  }

  /**
   * Download and apply a hotfix update silently
   * @param version The target version
   * @param hotfixUrl URL to download hotfix-{version}.zip
   */
  async downloadAndApply(version: string, hotfixUrl: string): Promise<boolean> {
    if (this.state.status === 'downloading' || this.state.status === 'extracting') {
      log.warn('[HotUpdateService] Update already in progress');
      return false;
    }

    try {
      this.state = { status: 'downloading', version, progress: 0 };
      this.sendToRenderer('update:hotfix-progress', {
        status: 'downloading',
        version,
        progress: 0,
      });

      // Download zip to temp directory
      this.ensureUpdatesDir();
      const zipPath = path.join(this.updatesDir, `hotfix-${version}.zip`);
      await this.downloadFile(hotfixUrl, zipPath);

      // Extract to staging directory
      this.state = { status: 'extracting', version };
      this.sendToRenderer('update:hotfix-progress', {
        status: 'extracting',
        version,
      });

      const stagingDir = path.join(this.updatesDir, `hotfix-${version}-staging`);
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      fs.mkdirSync(stagingDir, { recursive: true });

      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();
      for (const entry of entries) {
        const entryName = entry.entryName;
        const targetPath = path.join(stagingDir, entryName);

        if (entry.isDirectory) {
          fs.mkdirSync(targetPath, { recursive: true });
          continue;
        }

        // Ensure parent directory exists
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });

        // Use original-fs to bypass Electron's .asar interception
        const writeFs = targetPath.endsWith('.asar') ? originalFs : fs;
        const content = entry.getData();
        if (content) {
          writeFs.writeFileSync(targetPath, content);
        }
      }

      log.info(`[HotUpdateService] Extracted hotfix ${version} to ${stagingDir}`);

      // Write pending marker for next restart
      const marker = {
        version,
        stagingPath: stagingDir,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(this.pendingMarkerPath, JSON.stringify(marker, null, 2));

      // Clean up zip file
      fs.unlinkSync(zipPath);

      this.state = { status: 'pending-restart', version };
      this.sendToRenderer('update:hotfix-progress', {
        status: 'pending-restart',
        version,
      });

      log.info(`[HotUpdateService] Hotfix ${version} ready, will apply on next restart`);
      return true;
    } catch (error) {
      log.error('[HotUpdateService] Download/apply failed:', error);
      this.state = { status: 'error', version, error: String(error) };
      this.sendToRenderer('update:hotfix-progress', {
        status: 'error',
        version,
        error: String(error),
      });
      return false;
    }
  }

  /**
   * Download a file with progress tracking
   */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      log.info(`[HotUpdateService] Downloading ${url} to ${destPath}`);
      const request = protocol.get(url, (response) => {
        // Handle redirects
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          return this.downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
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
            const progress = Math.round((downloadedBytes / totalBytes) * 100);
            if (this.state.progress !== progress) {
              this.state.progress = progress;
              this.sendToRenderer('update:hotfix-progress', {
                status: 'downloading',
                version: this.state.version,
                progress,
              });
            }
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          log.info(`[HotUpdateService] Downloaded ${destPath} (${downloadedBytes} bytes)`);
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
      });

      request.on('error', (err) => {
        reject(err);
      });

      // Set timeout
      request.setTimeout(300000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Apply pending hotfix on startup (before any resources are locked)
   * Called during app initialization
   */
  applyPendingHotfix(): boolean {
    if (!fs.existsSync(this.pendingMarkerPath)) {
      return false;
    }

    try {
      const markerContent = fs.readFileSync(this.pendingMarkerPath, 'utf-8');
      const marker = JSON.parse(markerContent);
      const stagingDir = marker.stagingPath;

      log.info(`[HotUpdateService] Applying pending hotfix ${marker.version} from ${stagingDir}`);

      if (!fs.existsSync(stagingDir)) {
        log.error(`[HotUpdateService] Staging directory not found: ${stagingDir}`);
        this.cleanPendingMarker();
        return false;
      }

      // Replace renderer directory
      const stagingRenderer = path.join(stagingDir, 'renderer');
      if (fs.existsSync(stagingRenderer)) {
        const targetRenderer = path.join(this.resourcesPath, 'renderer');
        if (fs.existsSync(targetRenderer)) {
          fs.rmSync(targetRenderer, { recursive: true, force: true });
        }
        fs.cpSync(stagingRenderer, targetRenderer, { recursive: true });
        log.info('[HotUpdateService] Replaced renderer directory');
      }

      // Replace tab_services directory
      const stagingTabServices = path.join(stagingDir, 'tab_services');
      if (fs.existsSync(stagingTabServices)) {
        const targetTabServices = path.join(this.resourcesPath, 'tab_services');
        if (fs.existsSync(targetTabServices)) {
          fs.rmSync(targetTabServices, { recursive: true, force: true });
        }
        fs.cpSync(stagingTabServices, targetTabServices, { recursive: true });
        log.info('[HotUpdateService] Replaced tab_services directory');
      }

      // Replace version.json (so next update check uses the new version)
      const stagingVersionJson = path.join(stagingDir, 'version.json');
      if (fs.existsSync(stagingVersionJson)) {
        const targetVersionJson = path.join(this.resourcesPath, 'version.json');
        fs.copyFileSync(stagingVersionJson, targetVersionJson);
        log.info('[HotUpdateService] Replaced version.json');
      }

      // Note: app.asar (main process) cannot be replaced while running on Windows
      // Main process changes require a major update (full installer)

      // Clean up
      fs.rmSync(stagingDir, { recursive: true, force: true });
      this.cleanPendingMarker();

      log.info(`[HotUpdateService] Hotfix ${marker.version} applied successfully`);
      return true;
    } catch (error) {
      log.error('[HotUpdateService] Failed to apply pending hotfix:', error);
      return false;
    }
  }

  /**
   * Check if there is a pending hotfix
   */
  hasPendingHotfix(): { pending: boolean; version?: string } {
    if (!fs.existsSync(this.pendingMarkerPath)) {
      return { pending: false };
    }

    try {
      const markerContent = fs.readFileSync(this.pendingMarkerPath, 'utf-8');
      const marker = JSON.parse(markerContent);
      return { pending: true, version: marker.version };
    } catch {
      return { pending: false };
    }
  }

  /**
   * Remove the pending marker file
   */
  private cleanPendingMarker(): void {
    try {
      if (fs.existsSync(this.pendingMarkerPath)) {
        fs.unlinkSync(this.pendingMarkerPath);
      }
    } catch (error) {
      log.error('[HotUpdateService] Failed to clean pending marker:', error);
    }
  }

  /**
   * Build hotfix download URL from update server URL and version
   */
  static buildHotfixUrl(updateServerUrl: string, version: string): string {
    const baseUrl = updateServerUrl.endsWith('/') ? updateServerUrl : `${updateServerUrl}/`;
    return `${baseUrl}hotfix-${version}.zip`;
  }

  /**
   * Send IPC event to all renderer processes (main window + settings window etc.)
   */
  private sendToRenderer(channel: string, data: any): void {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (win && !win.isDestroyed()) {
          win.webContents.send(channel, data);
        }
      }
    } catch (error) {
      log.debug('[HotUpdateService] Could not send to renderer:', error);
    }
  }
}
