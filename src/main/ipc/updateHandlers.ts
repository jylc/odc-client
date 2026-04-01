import { ipcMain } from 'electron';
import log from '../utils/log';
import { UpdateService } from '../updater';

/**
 * Register all IPC handlers for update operations
 */
export function registerUpdateHandlers(): void {
  const updateService = UpdateService.getInstance();

  /**
   * Check for updates
   * Channel: update:check
   * Returns: { hasUpdate: boolean, version?: string, releaseNotes?: string }
   */
  ipcMain.handle('update:check', async () => {
    try {
      const updateInfo = await updateService.checkForUpdate();
      if (updateInfo) {
        return {
          hasUpdate: true,
          version: updateInfo.version,
          releaseNotes: updateInfo.releaseNotes,
        };
      }
      return { hasUpdate: false };
    } catch (error) {
      log.error('[update:check] Error:', error);
      return { hasUpdate: false, error: String(error) };
    }
  });

  /**
   * Download the available update
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
   * Get current app version
   * Channel: update:get-version
   * Returns: { version: string }
   */
  ipcMain.handle('update:get-version', async () => {
    return { version: updateService.getCurrentVersion() };
  });

  log.info('[UpdateHandlers] All update IPC handlers registered');
}

/**
 * Unregister all update IPC handlers
 */
export function unregisterUpdateHandlers(): void {
  const channels = ['update:check', 'update:download', 'update:install', 'update:get-version'];

  channels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });

  log.info('[UpdateHandlers] All update IPC handlers unregistered');
}
