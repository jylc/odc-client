/*
 * Copyright 2023 OceanBase
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ipcMain, BrowserWindow, app } from 'electron';
import path from 'path';
import log from '../utils/log';
import { TabManager } from '../tabs';

// Track the settings window to prevent multiple instances
let settingsWindow: BrowserWindow | null = null;

/**
 * Register all IPC handlers for window control operations
 */
export function registerWindowHandlers(): void {
  /**
   * Minimize the main window
   * Channel: window:minimize
   */
  ipcMain.handle('window:minimize', async () => {
    try {
      const tabManager = TabManager.getInstance();
      const mainWindow = tabManager.mainWindow;
      if (mainWindow) {
        mainWindow.minimize();
        log.info('[WindowHandlers] Window minimized');
        return { success: true };
      }
      return { success: false, error: 'No main window' };
    } catch (error) {
      log.error('[WindowHandlers] minimize error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Maximize the main window
   * Channel: window:maximize
   */
  ipcMain.handle('window:maximize', async () => {
    try {
      const tabManager = TabManager.getInstance();
      const mainWindow = tabManager.mainWindow;
      if (mainWindow) {
        mainWindow.maximize();
        log.info('[WindowHandlers] Window maximized');
        return { success: true };
      }
      return { success: false, error: 'No main window' };
    } catch (error) {
      log.error('[WindowHandlers] maximize error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Unmaximize (restore) the main window
   * Channel: window:unmaximize
   */
  ipcMain.handle('window:unmaximize', async () => {
    try {
      const tabManager = TabManager.getInstance();
      const mainWindow = tabManager.mainWindow;
      if (mainWindow) {
        mainWindow.unmaximize();
        log.info('[WindowHandlers] Window unmaximized');
        return { success: true };
      }
      return { success: false, error: 'No main window' };
    } catch (error) {
      log.error('[WindowHandlers] unmaximize error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Check if window is maximized
   * Channel: window:isMaximized
   */
  ipcMain.handle('window:isMaximized', async () => {
    try {
      const tabManager = TabManager.getInstance();
      const mainWindow = tabManager.mainWindow;
      if (mainWindow) {
        const isMaximized = mainWindow.isMaximized();
        return { success: true, isMaximized };
      }
      return { success: false, isMaximized: false, error: 'No main window' };
    } catch (error) {
      log.error('[WindowHandlers] isMaximized error:', error);
      return { success: false, isMaximized: false, error: String(error) };
    }
  });

  /**
   * Close the main window
   * Channel: window:close
   */
  ipcMain.handle('window:close', async () => {
    try {
      const tabManager = TabManager.getInstance();
      const mainWindow = tabManager.mainWindow;
      if (mainWindow) {
        mainWindow.close();
        log.info('[WindowHandlers] Window close requested');
        return { success: true };
      }
      return { success: false, error: 'No main window' };
    } catch (error) {
      log.error('[WindowHandlers] close error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Open settings window as a modal child of the main window
   * Channel: window:open-settings
   */
  ipcMain.handle('window:open-settings', async () => {
    try {
      const tabManager = TabManager.getInstance();
      const mainWindow = tabManager.mainWindow;
      if (!mainWindow) {
        return { success: false, error: 'No main window' };
      }

      // If settings window already exists, focus it instead of creating a new one
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        log.info('[WindowHandlers] Settings window already exists, focusing it');
        settingsWindow.focus();
        return { success: true, alreadyOpen: true };
      }

      // Determine settings page URL
      const isDev = process.env.ODC_DEBUG_MODE === 'open' || process.env.NODE_ENV === 'development';
      const settingsUrl = isDev
        ? 'http://localhost:5173/#/settings'
        : `file://${path.join(app.getAppPath(), 'tab_service', 'dist', 'index.html')}#/settings`;

      settingsWindow = new BrowserWindow({
        width: 640,
        height: 480,
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
            process.env.NODE_ENV === 'development' ? process.cwd() : process.resourcesPath || '',
            'libraries/script',
            'preload.js',
          ),
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false,
        },
      });

      // Remove menu bar from settings window
      settingsWindow.setMenu(null);

      // Center on parent window (not screen)
      const [parentWidth, parentHeight] = mainWindow.getSize();
      const [parentX, parentY] = mainWindow.getPosition();
      const [settingsWidth, settingsHeight] = settingsWindow.getSize();
      const x = Math.round(parentX + (parentWidth - settingsWidth) / 2);
      const y = Math.round(parentY + (parentHeight - settingsHeight) / 2);
      settingsWindow.setPosition(x, y);

      // Show when ready to avoid flash
      settingsWindow.once('ready-to-show', () => {
        settingsWindow?.show();
      });

      settingsWindow.loadURL(settingsUrl).catch((e) => {
        log.error('[WindowHandlers] Failed to load settings page:', e);
      });

      // Clean up when window is closed
      settingsWindow.on('closed', () => {
        settingsWindow = null;
      });

      log.info('[WindowHandlers] Settings window opened');
      return { success: true };
    } catch (error) {
      log.error('[WindowHandlers] open-settings error:', error);
      settingsWindow = null;
      return { success: false, error: String(error) };
    }
  });

  log.info('[WindowHandlers] All window IPC handlers registered');
}

/**
 * Unregister all window IPC handlers
 */
export function unregisterWindowHandlers(): void {
  const channels = [
    'window:minimize',
    'window:maximize',
    'window:unmaximize',
    'window:isMaximized',
    'window:close',
    'window:open-settings',
  ];

  channels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });

  log.info('[WindowHandlers] All window IPC handlers unregistered');
}
