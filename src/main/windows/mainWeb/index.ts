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

import { app, BrowserWindow, dialog, BrowserView } from 'electron';
import path from 'path';
import { PathnameStore } from '../../store';
import log from '../../utils/log';
import { downloadEvent } from './event';
import { TabManager } from '../../tabs';

// Tab bar height constant (matches tab_service)
const TAB_BAR_HEIGHT = 80;

export function openMainWebWindow(mainWindow: BrowserWindow) {
  // TODO：启动 jar，获取空闲的端口号，然后传递给 renderer 进程

  downloadEvent(mainWindow);

  // Note: newWindowEvent is now handled by setupTabEvents in main.ts
  // But we keep downloadEvent here
  if (process.platform !== 'darwin') {
    mainWindow.setMenu(null);
  }
  if (process.env.ODC_DEBUG_MODE === 'open' || process.env.NODE_ENV === 'development') {
    mainWindow!.webContents.openDevTools();
  }

  mainWindow.webContents?.on('did-fail-load', (e, code, desc, url, isMainFrame, frameProcId) => {
    log.error('webcontent load failed', code, desc, url, isMainFrame, frameProcId);
    log.error(e);
  });
  mainWindow.webContents.on('certificate-error', (e) => {
    log.error('certificate-error', e);
  });
  mainWindow.webContents.on('render-process-gone', (e, details) => {
    log.error('render-process-gone', details.reason, details.exitCode);
    log.error(e);
  });

  // Initialize TabManager with main window
  const tabManager = TabManager.getInstance();
  tabManager.initialize(mainWindow);
  tabManager.setTabBarHeight(TAB_BAR_HEIGHT);

  // Get the initial URL for the first content tab
  const initialContentUrl = PathnameStore.getUrl();

  // Determine tab_service URL (development vs production)
  const isDev = process.env.ODC_DEBUG_MODE === 'open' || process.env.NODE_ENV === 'development';
  const tabServiceUrl = isDev
    ? 'http://localhost:5173' // Vite dev server
    : `file://${path.join(app.getAppPath(), 'tab_service', 'dist', 'index.html')}`;

  // Load tab_service as the tab bar UI
  mainWindow!.loadURL(tabServiceUrl).catch((e) => {
    log.error('loadURL error for tab_service', e);
    dialog.showErrorBox(
      `Open ODC Tab Bar Failed`,
      `Please submit the log to the administrator（${app.getPath('userData')}/logs）`,
    );
    app.quit();
  });

  PathnameStore.reset();

  // After the tab bar loads, create the first content tab with the initial URL
  mainWindow.webContents.once('did-finish-load', () => {
    log.info('[MainWindow] Tab bar loaded, creating initial content tab');

    // Use initial URL or default to github.com
    const initialUrl = initialContentUrl || 'https://github.com/';

    // Create first tab with the ODC content URL
    try {
      const tab = tabManager.createTab(initialUrl, { isActive: true });
      log.info(`[MainWindow] Created initial tab: ${tab.id} for URL: ${initialUrl}`);
    } catch (error) {
      log.error('[MainWindow] Failed to create initial tab:', error);
    }

    // Set up window resize handler
    mainWindow.on('resize', () => {
      const [width, height] = mainWindow.getSize();
      const bounds = {
        x: 0,
        y: TAB_BAR_HEIGHT,
        width,
        height: height - TAB_BAR_HEIGHT,
      };
      tabManager.updateTabBounds(bounds);
    });
  });

  return mainWindow;
}
