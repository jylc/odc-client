import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import log from '../utils/log';
import { UpdateService, HotUpdateService, getUpdaterConfig } from '../updater';

/**
 * Register all IPC handlers for update operations
 */
export function registerUpdateHandlers(): void {
  const updateService = UpdateService.getInstance();

  /**
   * Check for updates
   * Channel: update:check
   * Returns: { hasUpdate: boolean, version?: string, releaseNotes?: string, updateType?: string }
   */
  ipcMain.handle('update:check', async () => {
    try {
      // If already downloaded, return cached result (don't re-check which resets state)
      const currentState = updateService.getState();
      const updateInfo = updateService.getUpdateInfo();
      const updateType = updateService.getUpdateType();
      if ((currentState === 'downloaded' || currentState === 'downloading') && updateInfo) {
        return {
          hasUpdate: true,
          version: updateInfo.version,
          releaseNotes: updateInfo.releaseNotes,
          updateType,
        };
      }

      const result = await updateService.checkForUpdate();
      if (result) {
        return {
          hasUpdate: true,
          version: result.version,
          releaseNotes: result.releaseNotes,
          updateType: updateService.getUpdateType(),
        };
      }
      return { hasUpdate: false };
    } catch (error) {
      log.error('[update:check] Error:', error);
      return { hasUpdate: false, error: String(error) };
    }
  });

  /**
   * Download the available update (major updates only)
   * Channel: update:download
   * Returns: { success: boolean }
   */
  ipcMain.handle('update:download', async () => {
    try {
      const success = await updateService.downloadUpdate();
      return { success };
    } catch (error) {
      log.error('[update:download] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Install the downloaded update
   * Channel: update:install
   * Returns: { success: boolean }
   */
  ipcMain.handle('update:install', async () => {
    try {
      await updateService.installUpdate();
      return { success: true };
    } catch (error) {
      log.error('[update:install] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Get current major update download status
   * Channel: update:download-status
   * Returns: { state: string, version?: string }
   */
  ipcMain.handle('update:download-status', async () => {
    return {
      state: updateService.getState(),
      updateType: updateService.getUpdateType(),
      version: updateService.getUpdateInfo()?.version || null,
    };
  });

  /**
   * Get current app version
   * Channel: update:get-version
   * Returns: { version: string }
   */
  ipcMain.handle('update:get-version', async () => {
    return { version: updateService.getCurrentVersion() };
  });

  /**
   * Get updater configuration (links, etc.)
   * Channel: update:get-config
   * Returns: { links: { home, help, update } }
   */
  ipcMain.handle('update:get-config', async () => {
    const config = getUpdaterConfig();
    return {
      links: config.links,
    };
  });

  /**
   * Get release notes from local version.json or release-note.md
   * Channel: update:get-release-notes
   * Returns: { releaseNotes: string, version: string }
   */
  ipcMain.handle('update:get-release-notes', async () => {
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const basePath = isDev ? process.cwd() : process.resourcesPath || '';
      const version = updateService.getCurrentVersion();

      // Production: read from version.json (bundled with app)
      if (!isDev) {
        const versionJsonPath = path.join(basePath, 'version.json');
        if (fs.existsSync(versionJsonPath)) {
          const content = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
          return { releaseNotes: content.releaseNotes || '', version };
        }
      }

      // Dev fallback: read from release-note.md
      const mdPath = path.join(isDev ? basePath : path.dirname(app.getAppPath()), 'release-note.md');
      if (fs.existsSync(mdPath)) {
        const notes = fs.readFileSync(mdPath, 'utf-8').trim();
        return { releaseNotes: notes, version };
      }
    } catch (error) {
      log.error('[update:get-release-notes] Error:', error);
    }
    return { releaseNotes: '', version: '' };
  });

  /**
   * Download hotfix update (minor updates only)
   * Channel: update:hotfix-download
   * Triggers HotUpdateService.downloadAndApply(), progress sent via update:hotfix-progress event
   * Returns: { success: boolean }
   */
  ipcMain.handle('update:hotfix-download', async () => {
    try {
      const updateInfo = updateService.getUpdateInfo();
      if (!updateInfo) {
        return { success: false, error: 'No update info available' };
      }
      const hotfixUrl = HotUpdateService.buildHotfixUrl(
        updateService.getUpdateServerUrl(),
        updateInfo.version,
      );
      const success = await HotUpdateService.getInstance().downloadAndApply(
        updateInfo.version,
        hotfixUrl,
      );
      return { success };
    } catch (error) {
      log.error('[update:hotfix-download] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Get current hotfix download status
   * Channel: update:hotfix-status
   * Returns: { status: string, version?: string }
   */
  ipcMain.handle('update:hotfix-status', async () => {
    const hotfixService = HotUpdateService.getInstance();
    const state = hotfixService.getState();
    const pending = hotfixService.hasPendingHotfix();
    if (pending.pending) {
      return { status: 'pending-restart', version: pending.version };
    }
    return { status: state.status, version: state.version };
  });

  /**
   * Restart the application (for applying hotfix updates)
   * Channel: update:restart-app
   */
  ipcMain.handle('update:restart-app', async () => {
    log.info('[update:restart-app] Restarting app to apply hotfix');
    app.relaunch();
    app.exit();
  });

  log.info('[UpdateHandlers] All update IPC handlers registered');
}

/**
 * Unregister all update IPC handlers
 */
export function unregisterUpdateHandlers(): void {
  const channels = [
    'update:check',
    'update:download',
    'update:install',
    'update:get-version',
    'update:get-config',
    'update:get-release-notes',
    'update:hotfix-download',
    'update:hotfix-status',
    'update:download-status',
    'update:restart-app',
  ];

  channels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });

  log.info('[UpdateHandlers] All update IPC handlers unregistered');
}
