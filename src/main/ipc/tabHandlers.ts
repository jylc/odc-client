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

import { ipcMain } from 'electron';
import log from '../utils/log';
import { TabManager } from '../tabs';
import { TabInfo, TabOptions, TAB_EVENTS } from '../tabs/types';

/**
 * Register all IPC handlers for tab operations
 */
export function registerTabHandlers(): void {
  const tabManager = TabManager.getInstance();

  /**
   * Create a new tab
   * Channel: tab:create
   * Params: { url: string, options?: TabOptions }
   * Returns: TabInfo
   */
  ipcMain.handle('tab:create', async (event, url: string, options?: Partial<TabOptions>) => {
    try {
      const tab = tabManager.createTab(url, options);
      return tab.getTabInfo();
    } catch (error) {
      log.error('[tab:create] Error:', error);
      throw error;
    }
  });

  /**
   * Switch to a specific tab
   * Channel: tab:switch
   * Params: tabId: string
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:switch', async (event, tabId: string) => {
    try {
      tabManager.switchTab(tabId);
      return { success: true };
    } catch (error) {
      log.error('[tab:switch] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Close a tab
   * Channel: tab:close
   * Params: tabId: string
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:close', async (event, tabId: string) => {
    try {
      tabManager.closeTab(tabId);
      return { success: true };
    } catch (error) {
      log.error('[tab:close] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Get all tabs
   * Channel: tab:getAll
   * Returns: TabInfo[]
   */
  ipcMain.handle('tab:getAll', async () => {
    try {
      return tabManager.getAllTabInfo();
    } catch (error) {
      log.error('[tab:getAll] Error:', error);
      return [];
    }
  });

  /**
   * Get active tab
   * Channel: tab:getActive
   * Returns: TabInfo | null
   */
  ipcMain.handle('tab:getActive', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      return activeTab ? activeTab.getTabInfo() : null;
    } catch (error) {
      log.error('[tab:getActive] Error:', error);
      return null;
    }
  });

  /**
   * Get default URL for new tabs
   * Channel: tab:getDefaultUrl
   * Returns: { url: string }
   */
  ipcMain.handle('tab:getDefaultUrl', async () => {
    try {
      const url = tabManager.getDefaultUrl();
      return { url };
    } catch (error) {
      log.error('[tab:getDefaultUrl] Error:', error);
      return { url: 'about:blank' };
    }
  });

  /**
   * Update tab bounds
   * Channel: tab:updateBounds
   * Params: { x: number, y: number, width: number, height: number }
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:updateBounds', async (event, bounds) => {
    try {
      tabManager.updateTabBounds(bounds);
      return { success: true };
    } catch (error) {
      log.error('[tab:updateBounds] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Set tab bar height
   * Channel: tab:setBarHeight
   * Params: height: number
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:setBarHeight', async (event, height: number) => {
    try {
      tabManager.setTabBarHeight(height);
      return { success: true };
    } catch (error) {
      log.error('[tab:setBarHeight] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Navigate back in active tab
   * Channel: tab:goBack
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:goBack', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (activeTab) {
        activeTab.goBack();
        return { success: true };
      }
      return { success: false, error: 'No active tab' };
    } catch (error) {
      log.error('[tab:goBack] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Navigate forward in active tab
   * Channel: tab:goForward
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:goForward', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (activeTab) {
        activeTab.goForward();
        return { success: true };
      }
      return { success: false, error: 'No active tab' };
    } catch (error) {
      log.error('[tab:goForward] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Reload active tab
   * Channel: tab:reload
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:reload', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (activeTab) {
        activeTab.reload();
        return { success: true };
      }
      return { success: false, error: 'No active tab' };
    } catch (error) {
      log.error('[tab:reload] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Load URL in active tab
   * Channel: tab:loadURL
   * Params: url: string
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:loadURL', async (event, url: string) => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (activeTab) {
        await activeTab.loadURL(url);
        return { success: true };
      }
      return { success: false, error: 'No active tab' };
    } catch (error) {
      log.error('[tab:loadURL] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Stop loading active tab
   * Channel: tab:stop
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:stop', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (activeTab) {
        activeTab.stop();
        return { success: true };
      }
      return { success: false, error: 'No active tab' };
    } catch (error) {
      log.error('[tab:stop] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Toggle DevTools for active tab
   * Channel: tab:toggleDevTools
   * Returns: { success: boolean, isOpen: boolean }
   */
  ipcMain.handle('tab:toggleDevTools', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (activeTab && activeTab.browserView) {
        const webContents = activeTab.browserView.webContents;
        if (webContents.isDevToolsOpened()) {
          webContents.closeDevTools();
          log.info('[tab:toggleDevTools] DevTools closed');
          return { success: true, isOpen: false };
        } else {
          webContents.openDevTools();
          log.info('[tab:toggleDevTools] DevTools opened');
          return { success: true, isOpen: true };
        }
      }
      return { success: false, error: 'No active tab' };
    } catch (error) {
      log.error('[tab:toggleDevTools] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Open DevTools for active tab
   * Channel: tab:openDevTools
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:openDevTools', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (activeTab && activeTab.browserView) {
        activeTab.browserView.webContents.openDevTools();
        log.info('[tab:openDevTools] DevTools opened');
        return { success: true };
      }
      return { success: false, error: 'No active tab' };
    } catch (error) {
      log.error('[tab:openDevTools] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Close DevTools for active tab
   * Channel: tab:closeDevTools
   * Returns: { success: boolean }
   */
  ipcMain.handle('tab:closeDevTools', async () => {
    try {
      const activeTab = tabManager.getActiveTab();
      if (activeTab && activeTab.browserView) {
        activeTab.browserView.webContents.closeDevTools();
        log.info('[tab:closeDevTools] DevTools closed');
        return { success: true };
      }
      return { success: false, error: 'No active tab' };
    } catch (error) {
      log.error('[tab:closeDevTools] Error:', error);
      return { success: false, error: String(error) };
    }
  });

  log.info('[TabHandlers] All tab IPC handlers registered');
}

/**
 * Unregister all tab IPC handlers
 */
export function unregisterTabHandlers(): void {
  const channels = [
    'tab:create',
    'tab:switch',
    'tab:close',
    'tab:getAll',
    'tab:getActive',
    'tab:updateBounds',
    'tab:setBarHeight',
    'tab:goBack',
    'tab:goForward',
    'tab:reload',
    'tab:loadURL',
    'tab:stop',
    'tab:toggleDevTools',
    'tab:openDevTools',
    'tab:closeDevTools',
  ];

  channels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });

  log.info('[TabHandlers] All tab IPC handlers unregistered');
}
