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

import { BrowserView, BrowserWindow } from 'electron';

export interface TabOptions {
  id?: string;
  url: string;
  title?: string;
  favicon?: string;
  isActive?: boolean;
  tag?: string; // Optional tag to identify special tabs (e.g., 'home', 'help')
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isActive: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  tag?: string; // Optional tag to identify special tabs (e.g., 'home', 'help')
}

export interface TabBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ITabContainer {
  id: string;
  browserView: BrowserView;
  url: string;
  title: string;
  favicon?: string;
  isActive: boolean;
  isLoading: boolean;
  tag?: string; // Optional tag to identify special tabs (e.g., 'home', 'help')

  loadURL(url: string): Promise<void>;
  setActive(active: boolean, bounds?: TabBounds): void;
  updateBounds(bounds: TabBounds): void;
  destroy(): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  getTabInfo(): TabInfo;
  openDevTools(): void;
  closeDevTools(): void;
  isDevToolsOpened(): boolean;
}

export interface ITabManager {
  mainWindow: BrowserWindow | null;
  tabs: Map<string, ITabContainer>;
  activeTabId: string | null;

  initialize(mainWindow: BrowserWindow): void;
  createTab(url: string, options?: Partial<TabOptions>): ITabContainer;
  switchTab(tabId: string): void;
  closeTab(tabId: string): void;
  getActiveTab(): ITabContainer | null;
  getAllTabs(): ITabContainer[];
  getTabInfo(tabId: string): TabInfo | null;
  getAllTabInfo(): TabInfo[];
  updateTabBounds(bounds: TabBounds): void;
  destroy(): void;
}

export interface ITabStore {
  save(tabs: TabInfo[]): void;
  load(): TabInfo[];
  clear(): void;
}

export const TAB_EVENTS = {
  TAB_CREATED: 'tab:created',
  TAB_UPDATED: 'tab:updated',
  TAB_ACTIVATED: 'tab:activated',
  TAB_CLOSED: 'tab:closed',
  TAB_LOADING: 'tab:loading',
  TAB_LOADED: 'tab:loaded',
  TAB_TITLE_UPDATED: 'tab:title-updated',
  TAB_FAVICON_UPDATED: 'tab:favicon-updated',
} as const;
