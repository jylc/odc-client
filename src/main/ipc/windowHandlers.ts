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

import { ipcMain, BrowserWindow } from 'electron';
import log from '../utils/log';
import { TabManager } from '../tabs';

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
  ];

  channels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });

  log.info('[WindowHandlers] All window IPC handlers unregistered');
}
