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
import log from './log';

/**
 * 将 token 注入到 localStorage
 * 只有当现有 token 为 null、undefined 或 "null" 时才注入
 *
 * @param mainWindow - 目标浏览器窗口
 * @param newToken - 要注入的新 token
 */
export async function injectTokenToLocalStorage(
  mainWindow: BrowserWindow | null,
  newToken: string,
): Promise<void> {
  if (!mainWindow || !newToken) {
    log.info('[Token Injection] Skipped: no window or token');
    return;
  }

  // Check if window is still valid
  if (mainWindow.isDestroyed()) {
    log.warn('[Token Injection] Skipped: window is destroyed');
    return;
  }

  // Check if webContents is still valid
  if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    log.warn('[Token Injection] Skipped: webContents is destroyed');
    return;
  }

  try {
    log.info('[Token Injection] Checking existing token...');

    // 读取现有的 token 和 userInfoSession
    const existingToken = await mainWindow.webContents.executeJavaScript(
      `localStorage.getItem("token")`,
    );
    const userInfoSession = await mainWindow.webContents.executeJavaScript(
      `localStorage.getItem("userInfoSession")`,
    );

    log.info('[Token Injection] Existing token:', existingToken?.substring(0, 10) + '...');
    log.info('[Token Injection] UserInfo session:', userInfoSession?.substring(0, 10) + '...');

    // 判断是否需要注入：现有值为 null、undefined 或 "null"
    const shouldInject = !existingToken || existingToken === 'null' || existingToken === null;

    if (shouldInject) {
      log.info('[Token Injection] Injecting new token...');
      await mainWindow.webContents.executeJavaScript(
        `localStorage.setItem("token", "${newToken}")`,
      );
      log.info('[Token Injection] Token injected successfully');
    } else {
      log.info('[Token Injection] Skipping injection - existing token is valid');
    }
  } catch (error) {
    // Ignore "Render frame was disposed" errors during navigation/close
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Render frame was disposed')) {
      log.warn('[Token Injection] Frame was disposed, skipping injection');
    } else {
      log.error('[Token Injection] Failed:', error);
    }
  }
}
