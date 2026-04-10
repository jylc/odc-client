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

import * as Sentry from '@sentry/electron';
import { app, BrowserWindow, screen } from 'electron';
import os from 'os';
import pkg from '../../package.json';
import createMenu from './createMenu';
import { initRenderService } from './renderService';
import MainServer from './server/main';
import setAboutPanelOptions from './setAboutPanel';
import { PathnameStore } from './store';
import {
  getParamsFromODCSchema,
  getSetting,
  isODCSchemaUrl,
  isDBDCSchemaUrl,
  getUrlFromDBDCSchema,
  parseUrlParams,
  isSchemaUrl,
  getUrlFromSchema,
} from './utils';
import log from './utils/log';
import { injectTokenToLocalStorage } from './utils/token-injection';
import { openMainWebWindow } from './windows/mainWeb';
import startScreen from './windows/startScreen';
import { setupTabEvents } from './tabs/events';
import { TabManager } from './tabs/TabManager';
import path from 'path';

Sentry.init({
  dsn: 'https://859452cf23044aeda8677a8bdcc53081@obc-sentry.oceanbase.com/3',
});
/**
 * 注册render接口服务
 */
initRenderService();
/** end */

/**
 * 获取单实例锁
 */
const gotTheLock = app.requestSingleInstanceLock();
process.on('uncaughtException', (e) => {
  log.info('uncaughtException');
  log.info(e);
});
/**
 * 初始化浏览器参数
 */
const setting = getSetting();
if (setting && Object.keys(setting).includes('client.electron.params')) {
  let arr = setting['client.electron.params']?.split('\n').filter(Boolean);
  arr.forEach((item) => {
    app.commandLine.appendSwitch(item);
  });
} else {
  app.commandLine.appendSwitch('disable-http-cache');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}
/** end */

/**
 * 解析 Windows 协议参数
 *
 * Windows 下的协议 URL 参数格式：
 * - process.argv: ['electron.exe', 'main.js', 'dbdc://http://...']
 * - second-instance argv: ['electron.exe', 'dbdc://http://...']
 * - second-instance commandLine: 完整命令行字符串
 *
 * 需要从 argv 中找到 dbdc:// 协议 URL
 */
function resolveWinRemoteParams(
  argv,
  mainWindow = null,
): { resolved: boolean; fullUrl?: string; hash?: string } {
  if (!argv || argv.length === 0) {
    log.info('[resolveWinRemoteParams] No argv provided');
    return { resolved: false };
  }

  log.info('[resolveWinRemoteParams] argv:', argv);

  // 在 argv 中查找 dbdc:// 协议 URL
  const schemaUrl = argv.find((a) => {
    return isSchemaUrl(a);
  });

  if (schemaUrl) {
    log.info('[resolveWinRemoteParams] Found schema URL:', schemaUrl);

    try {
      const rawUrl = getUrlFromSchema(schemaUrl);
      const fullUrl = rawUrl;
      log.info('[resolveWinRemoteParams] Extracted full URL:', fullUrl);

      const params = parseUrlParams(fullUrl);
      log.info('[resolveWinRemoteParams] Parsed params:', params);

      // 如果有 token 参数，存储起来供后续注入使用
      if (params.token) {
        PathnameStore.setTokenParams(params.token, params.env);
        log.info('[resolveWinRemoteParams] Token params stored from schema URL');
      }

      // 解析完整 URL 并设置 pathname 和 hash
      try {
        const urlObj = new URL(fullUrl);
        // 设置 pathname（包含路径部分）
        PathnameStore.setPathname(urlObj.pathname);
        // 设置 hash（包含 # 及之后的内容）
        PathnameStore.setHash(urlObj.hash);
        log.info('[resolveWinRemoteParams] Set pathname:', urlObj.pathname);
        log.info('[resolveWinRemoteParams] Set hash:', urlObj.hash);
      } catch (e) {
        log.error('[resolveWinRemoteParams] Failed to parse URL:', e);
        // 如果解析失败，回退到原来的方式
        PathnameStore.addParams(fullUrl);
      }

      // 如果窗口已就绪，立即注入 token
      if (mainWindow && params.token) {
        injectTokenToLocalStorage(mainWindow, params.token);
      }

      return { resolved: true, fullUrl, hash: params.hash };
    } catch (error) {
      log.error('[resolveWinRemoteParams] Error processing schema URL:', error);
      return { resolved: false };
    }
  } else {
    log.info('[resolveWinRemoteParams] No schema URL found in argv');
    return { resolved: false };
  }
}

log.info('getLockFinished');

log.info('APP Start');
log.info('process.argv:', process.argv);
log.info(`Mem: \n${JSON.stringify(process.getSystemMemoryInfo(), null, 4)}`);
log.info(`OS: \n${os.type()}
platform: ${os.platform()}
arch: ${os.arch()}
os_release: ${os.release()}
uptime: ${os.uptime()}
mem: ${os.totalmem()}
cpu: ${JSON.stringify(os.cpus())}
version: ${pkg?.version}`);

if (app.isPackaged) {
  app.setAsDefaultProtocolClient('dbdc');
} else {
  log.info('APP Start (app.isPackaged):', process.execPath, path.resolve(process.argv[3]));
  app.setAsDefaultProtocolClient('dbdc-dev', process.execPath, [path.resolve(process.argv[3])]);
}

if (!gotTheLock) {
  log.info('app get lock fail');
  app.quit();
} else {
  log.info('app get lock success');
  initApp();
}
async function initApp() {
  // Windows second-instance 事件
  // event: IpcMainEvent
  // argv: string[] - 第二实例的命令行参数
  // workingDirectory: string - 第二实例的工作目录
  app.on('second-instance', (event, argv, workingDirectory) => {
    log.info('========== second-instance event fired ==========');
    log.info('[second-instance] argv:', argv);
    log.info('[second-instance] workingDirectory:', workingDirectory);
    log.info('[second-instance] platform:', process.platform);

    if (process.platform === 'win32') {
      // 获取当前活动窗口用于 token 注入
      const windows = BrowserWindow.getAllWindows();
      const activeWindow = windows.length > 0 ? windows[0] : null;

      log.info('[second-instance] Found windows:', windows.length);
      log.info('[second-instance] Active window:', activeWindow ? 'yes' : 'no');

      // Windows 下，点击 dbdc://xxx 链接会把 URL 作为参数传递
      // argv 格式: ['electron.exe路径', 'dbdc://http://...']
      const result = resolveWinRemoteParams(argv, activeWindow);

      if (result.resolved && activeWindow) {
        log.info('[second-instance] Protocol URL resolved, opening new tab');

        // 聚焦窗口
        if (activeWindow.isMinimized()) activeWindow.restore();
        activeWindow.focus();

        // 用解析到的 URL 创建新标签页并激活
        const tabManager = TabManager.getInstance();
        if (tabManager.mainWindow) {
          // 拼接最终要加载的 URL：协议提取后的完整地址
          const finalUrl = result.fullUrl || '';
          if (finalUrl) {
            log.info('[second-instance] Creating tab with URL:', finalUrl);
            tabManager.createTab(finalUrl, { isActive: true });
          }
        } else {
          log.info('[second-instance] TabManager not initialized yet');
        }
      } else if (!result.resolved) {
        log.info('[second-instance] No protocol URL found, ignoring');
      }
    }
  });

  /**
   * 开启错误日志收集
   */
  // crashReporter.start({
  //   companyName: 'oceanbase',
  //   productName: 'ODC',
  //   submitURL: ''
  // });

  /**
   * 初始化
   */
  async function createNewMainWeb() {
    log.info('create new main web');
    let mainWindow = startScreen();
    const mainServer = MainServer.getInstance();

    // 先打开窗口展示首页，不等待服务器启动
    mainWindow = openMainWebWindow(mainWindow);
    log.info('create new main web(window opened)');

    /**
     * 设置标签页事件
     * Note: TabManager initialization and IPC handlers registration
     * are now done in openMainWebWindow() before loadURL() to ensure
     * they are ready when the Vue app initializes.
     */
    setupTabEvents(mainWindow);
    log.info('create new main web(tab events set up)');

    // 后台启动服务器，不阻塞窗口展示
    mainServer
      .startServer()
      .then(() => {
        log.info('create new main web(server started in background)');
      })
      .catch((error) => {
        log.error('create new main web(server start failed):', error);
      });
  }

  /**
   * electron 主程序初始化完毕
   */
  app.on('ready', async () => {
    log.info('App Ready');
    log.info(
      `Screen: ${screen
        .getAllDisplays()
        .map((display) => `width: ${display.size.width}, height: ${display.size.height}`)
        .join(' | ')}`,
    );

    if (process.platform === 'darwin') {
      createMenu(app);
      setAboutPanelOptions(app);
      log.info('App Menu Ready');
    }

    // 处理启动时的参数（如果是通过 dbdc:// 协议启动的）
    const startResult = resolveWinRemoteParams(process.argv);
    createNewMainWeb();

    // 如果是通过协议首次启动，在窗口创建后再打开新标签页
    if (startResult.resolved && startResult.fullUrl) {
      const tabManager = TabManager.getInstance();
      if (tabManager.mainWindow) {
        log.info('[Ready] Opening tab for protocol URL:', startResult.fullUrl);
        tabManager.createTab(startResult.fullUrl, { isActive: true });
      }
    }
  });

  /**
   * 所有窗口都关闭了
   */
  app.on('window-all-closed', () => {
    log.info('windows all closed');
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // Track if we're in the process of quitting to prevent duplicate cleanup
  let isQuitting = false;

  app.on('will-quit', async (e) => {
    log.info('app will quit:', e);

    // Prevent duplicate quit handling
    if (isQuitting) {
      log.info('[Quit] Already quitting, skipping duplicate handler');
      return;
    }

    const mainServer = MainServer.getInstance();
    if (mainServer.isKilled) {
      log.info('[Quit] Java process already killed, proceeding with quit');
      return;
    }

    // Prevent immediate quit to allow cleanup
    e.preventDefault();
    isQuitting = true;

    try {
      log.info('[Quit] Starting cleanup process...');

      // Clean up TabManager (close all tabs and BrowserViews)
      const { TabManager } = await import('./tabs/TabManager');
      const tabManager = TabManager.getInstance();
      if (tabManager) {
        log.info('[Quit] Destroying TabManager...');
        tabManager.destroy();
      }

      // Stop the Java server with timeout protection
      log.info('[Quit] Stopping Java server...');
      const stopPromise = mainServer.stopServer(true);

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Stop server timeout')), 10000),
      );

      await Promise.race([stopPromise, timeoutPromise])
        .then(() => {
          log.info('[Quit] Java server stopped successfully');
        })
        .catch((err) => {
          log.error('[Quit] Error stopping Java server:', err);
          // Force quit even if stop fails
        });

      // Now allow the app to quit
      log.info('[Quit] Cleanup complete, proceeding with quit');
      app.quit();
    } catch (error) {
      log.error('[Quit] Error during cleanup:', error);
      // Force quit even if there's an error
      app.quit();
    }
  });

  /**
   * electron 主程序退出
   */
  app.on('quit', (e) => {
    log.info('app quit:', e, '\n\n');
  });

  /**
   * 主程序被激活
   */
  app.on('activate', () => {
    log.info('app activate');
    if (BrowserWindow.getAllWindows().length === 0) {
      log.info('windows length is 0, create new window');
      createNewMainWeb();
    }
  });

  /**
   * mac web唤起应用
   */
  app.on('open-url', async (event, urlStr) => {
    event.preventDefault(); // 阻止默认行为
    log.info('app open-url:', urlStr);

    let openUrl: string | undefined;

    if (urlStr && isSchemaUrl(urlStr)) {
      const rawUrl = getUrlFromSchema(urlStr);
      const fullUrl = rawUrl;
      const params = parseUrlParams(fullUrl);

      log.info('[open-url] fullUrl:', fullUrl);
      log.info('[open-url] params:', params);

      if (params.token) {
        PathnameStore.setTokenParams(params.token, params.env);
        log.info('[open-url] Token params stored from macOS open-url');
      }

      // 解析完整 URL 并设置 pathname 和 hash
      try {
        const urlObj = new URL(fullUrl);
        PathnameStore.setPathname(urlObj.pathname);
        PathnameStore.setHash(urlObj.hash);
        log.info('[open-url] Set pathname:', urlObj.pathname);
        log.info('[open-url] Set hash:', urlObj.hash);
      } catch (e) {
        log.error('[open-url] Failed to parse URL:', e);
        PathnameStore.addParams(fullUrl);
      }

      openUrl = fullUrl;
    }

    const instance = MainServer.getInstance();
    if (instance.status == 'ready') {
      const windows = BrowserWindow.getAllWindows();
      const activeWindow = windows.length > 0 ? windows[0] : null;

      if (activeWindow && openUrl) {
        // 聚焦窗口并在新标签页中打开 URL
        if (activeWindow.isMinimized()) activeWindow.restore();
        activeWindow.focus();

        const tabManager = TabManager.getInstance();
        if (tabManager.mainWindow) {
          log.info('[open-url] Creating tab with URL:', openUrl);
          tabManager.createTab(openUrl, { isActive: true });
        }
      } else {
        log.info('[open-url] No protocol URL, opening new window');
        createNewMainWeb();
      }
    }
  });
}
