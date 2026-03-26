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

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import log from '../utils/log';
import { ITabStore, TabInfo } from './types';

const TAB_STORE_FILE = 'tab-session.json';

export class TabStore implements ITabStore {
  private storePath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.storePath = path.join(userDataPath, TAB_STORE_FILE);
  }

  save(tabs: TabInfo[]): void {
    try {
      // Only save essential data, not runtime state
      const sessionData = tabs.map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
      }));

      fs.writeFileSync(this.storePath, JSON.stringify(sessionData, null, 2), 'utf-8');
      log.info(`[TabStore] Saved ${tabs.length} tabs to ${this.storePath}`);
    } catch (error) {
      log.error('[TabStore] Failed to save tabs:', error);
    }
  }

  load(): TabInfo[] {
    try {
      if (!fs.existsSync(this.storePath)) {
        return [];
      }

      const data = fs.readFileSync(this.storePath, 'utf-8');
      const sessionData = JSON.parse(data);

      // Restore with default state
      const tabs: TabInfo[] = sessionData.map((tab: any) => ({
        ...tab,
        isActive: false,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      }));

      log.info(`[TabStore] Loaded ${tabs.length} tabs from ${this.storePath}`);
      return tabs;
    } catch (error) {
      log.error('[TabStore] Failed to load tabs:', error);
      return [];
    }
  }

  clear(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        fs.unlinkSync(this.storePath);
        log.info(`[TabStore] Cleared tab store at ${this.storePath}`);
      }
    } catch (error) {
      log.error('[TabStore] Failed to clear tabs:', error);
    }
  }

  getStorePath(): string {
    return this.storePath;
  }
}
