import { app, net, shell, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import compareVersions from 'compare-versions';
import log from '../utils/log';
import { TabManager } from '../tabs';

const UPDATE_SERVER_URL = 'http://192.168.1.26:12345/';

export interface RemoteUpdateInfo {
  version: string;
  releaseNotes?: string;
  downloadUrl: string;
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
  private downloadProgress = 0;
  private installerPath: string | null = null;
  private currentVersion: string;

  private constructor() {
    this.currentVersion = app.getVersion();
    log.info(`[UpdateService] Current version: ${this.currentVersion}`);
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

  getProgress(): number {
    return this.downloadProgress;
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Check remote server for updates
   */
  async checkForUpdate(): Promise<RemoteUpdateInfo | null> {
    if (this.state === 'checking' || this.state === 'downloading') {
      log.warn('[UpdateService] Update check already in progress');
      return null;
    }

    this.state = 'checking';
    this.sendToRenderer('update:checking', {});

    try {
      const remoteInfo = await this.fetchUpdateInfo();

      if (!remoteInfo || !remoteInfo.version) {
        this.state = 'idle';
        this.sendToRenderer('update:not-available', {});
        log.info('[UpdateService] No update available');
        return null;
      }

      const hasUpdate = compareVersions.compare(remoteInfo.version, this.currentVersion, '>');

      if (!hasUpdate) {
        this.state = 'idle';
        this.sendToRenderer('update:not-available', {});
        log.info(
          `[UpdateService] Already up to date (remote: ${remoteInfo.version}, local: ${this.currentVersion})`,
        );
        return null;
      }

      this.state = 'available';
      this.updateInfo = remoteInfo;
      this.sendToRenderer('update:available', {
        version: remoteInfo.version,
        releaseNotes: remoteInfo.releaseNotes || '',
        downloadUrl: remoteInfo.downloadUrl,
      });
      log.info(`[UpdateService] Update available: ${remoteInfo.version}`);
      return remoteInfo;
    } catch (error) {
      this.state = 'error';
      this.sendToRenderer('update:error', { message: String(error) });
      log.error('[UpdateService] Check failed:', error);
      return null;
    }
  }

  /**
   * Download the update installer
   */
  async downloadUpdate(): Promise<boolean> {
    if (!this.updateInfo?.downloadUrl) {
      log.warn('[UpdateService] No download URL available');
      return false;
    }

    this.state = 'downloading';
    this.downloadProgress = 0;
    this.sendToRenderer('update:progress', { progress: 0 });

    try {
      const fileName = `dbdc-update-${this.updateInfo.version}.exe`;
      const tempDir = app.getPath('temp');
      this.installerPath = path.join(tempDir, fileName);

      await this.downloadFile(this.updateInfo.downloadUrl, this.installerPath);

      this.state = 'downloaded';
      this.downloadProgress = 100;
      this.sendToRenderer('update:downloaded', {
        installerPath: this.installerPath,
        version: this.updateInfo.version,
      });
      log.info(`[UpdateService] Download complete: ${this.installerPath}`);
      return true;
    } catch (error) {
      this.state = 'error';
      this.sendToRenderer('update:error', { message: String(error) });
      log.error('[UpdateService] Download failed:', error);
      return false;
    }
  }

  /**
   * Install the downloaded update
   */
  async installUpdate(): Promise<void> {
    if (!this.installerPath || !fs.existsSync(this.installerPath)) {
      log.warn('[UpdateService] Installer not found');
      return;
    }

    log.info(`[UpdateService] Launching installer: ${this.installerPath}`);
    await shell.openPath(this.installerPath);
    app.quit();
  }

  /**
   * Fetch update info from remote server
   */
  private fetchUpdateInfo(): Promise<RemoteUpdateInfo> {
    return new Promise((resolve, reject) => {
      const request = http.request(UPDATE_SERVER_URL, { method: 'GET', timeout: 10000 }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const info = JSON.parse(data) as RemoteUpdateInfo;
            resolve(info);
          } catch (error) {
            reject(new Error(`Failed to parse update info: ${error}`));
          }
        });
      });

      request.on('error', (error) => {
        reject(new Error(`Network error: ${error.message}`));
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });

      request.end();
    });
  }

  /**
   * Download file with progress tracking
   */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const request = protocol.request(url, { method: 'GET' }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          // Follow redirect
          this.downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with status: ${res.statusCode}`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let receivedBytes = 0;

        const fileStream = fs.createWriteStream(destPath);

        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (totalBytes > 0) {
            this.downloadProgress = Math.round((receivedBytes / totalBytes) * 100);
          } else {
            this.downloadProgress = Math.min(99, Math.round(receivedBytes / 1024 / 1024));
          }
          this.sendToRenderer('update:progress', { progress: this.downloadProgress });
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (error) => {
          fs.unlinkSync(destPath);
          reject(error);
        });
      });

      request.on('error', (error) => {
        reject(new Error(`Download error: ${error.message}`));
      });

      request.end();
    });
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
