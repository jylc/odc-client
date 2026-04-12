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
import { registerTabHandlers, registerWindowHandlers, registerUpdateHandlers } from '../../ipc';
import { UpdateService } from '../../updater';

// Tab bar height constant (matches tab_service)
// 44px TabBar (border-box, includes 1px border-bottom) + 40px UrlBar (border-box, includes 1px border-bottom) = 84px
const TAB_BAR_HEIGHT = 84;

export function openMainWebWindow(mainWindow: BrowserWindow) {
  // TODO：启动 jar，获取空闲的端口号，然后传递给 renderer 进程

  downloadEvent(mainWindow);

  // Note: newWindowEvent is now handled by setupTabEvents in main.ts
  // But we keep downloadEvent here
  if (process.platform !== 'darwin') {
    mainWindow.setMenu(null);
  }
  /*  if (process.env.ODC_DEBUG_MODE === 'open' || process.env.NODE_ENV === 'development') {
    mainWindow!.webContents.openDevTools();
  }*/

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

  // Register IPC handlers BEFORE loading the UI
  // This ensures handlers are ready when Vue app calls getAllTabs()
  registerTabHandlers();
  registerWindowHandlers();
  registerUpdateHandlers();
  log.info('[MainWindow] IPC handlers registered');

  // Use github.com as the homepage (local ODC server starts in background)
  const initialUrl = 'https://www.github.com/';

  // Store the initial URL so new tabs can use it
  tabManager.setInitialUrl(initialUrl);

  // Create first tab BEFORE loading the tab_service UI
  // The tab data will be available when Vue app calls getAllTabs()
  try {
    const tab = tabManager.createTab(initialUrl, { isActive: true, title: 'GitHub' });
    log.info(`[MainWindow] Created initial tab: ${tab.id} for URL: ${initialUrl}`);
  } catch (error) {
    log.error('[MainWindow] Failed to create initial tab:', error);
  }

  // Determine tab_service URL (development vs production)
  const isDev = process.env.ODC_DEBUG_MODE === 'open' || process.env.NODE_ENV === 'development';
  const tabServiceUrl = isDev
    ? 'http://localhost:5173' // Vite dev server
    : `file://${path.join(process.resourcesPath, 'tab_services', 'index.html')}`;

  // Load tab_service as the tab bar UI
  mainWindow!.loadURL(tabServiceUrl).catch((e) => {
    log.error('loadURL error for tab_service', e);
    dialog.showErrorBox(
      `Open ODC Tab Bar Failed`,
      `Please submit the log to the administrator（${app.getPath('userData')}/logs）`,
    );
    app.quit();
  });

  // 等待页面加载完成后，检查并注入 token
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('[MainWindow] Page loaded, checking for pending token...');

    if (PathnameStore.hasPendingToken()) {
      const { token } = PathnameStore.consumeTokenParams();
      if (token) {
      }
    }
  });

  PathnameStore.reset();

  // Check for updates after a delay (don't block startup)
  // Then start periodic check every 2 hours
  const updateService = UpdateService.getInstance();
  setTimeout(() => {
    updateService.checkForUpdate().catch((error) => {
      log.error('[MainWindow] Auto update check failed:', error);
    });
    // Start periodic check (every 2 hours)
    updateService.startPeriodicCheck(2 * 60 * 60 * 1000);
  }, 5000);

  // Set up window resize handler
  mainWindow.on('resize', () => {
    const bounds = tabManager.getTabBounds();
    tabManager.updateTabBounds(bounds);
  });

  return mainWindow;
}
