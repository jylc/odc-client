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

import { BrowserWindow } from 'electron';
import log from '../utils/log';
import { TabManager } from './TabManager';

/**
 * Set up tab-related events for the main window
 * This should be called after the main window is created
 */
export function setupTabEvents(mainWindow: BrowserWindow): void {
  const tabManager = TabManager.getInstance();

  // Handle window.open() to open in new tab instead of new window
  mainWindow.webContents.setWindowOpenHandler((details) => {
    log.info(`[TabEvents] Intercepted window.open for URL: ${details.url}`);

    // Create a new tab for the URL
    const tabManager = TabManager.getInstance();
    tabManager.createTab(details.url, { isActive: true });

    // Prevent opening in new window
    return {
      action: 'deny',
    };
  });

  // Note: Navigation events (did-navigate, page-title-updated, etc.) are NOT
  // monitored here because mainWindow hosts the tab bar UI (tab_services), not
  // tab content. Each TabContainer already listens on its own BrowserView
  // webContents for URL/title/favicon/loading updates. Listening on mainWindow
  // would incorrectly overwrite active tab data with tab_services' own URL.

  log.info('[TabEvents] Tab events set up for main window');
}

/**
 * Handle new window event from BrowserView
 * This is called when a BrowserView tries to open a new window
 */
export function handleNewWindow(event: any, url: string): void {
  log.info(`[TabEvents] BrowserView requested new window: ${url}`);

  // Create a new tab instead of opening a new window
  const tabManager = TabManager.getInstance();
  tabManager.createTab(url, { isActive: true });

  event.preventDefault();
}
