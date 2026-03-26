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

import { useCallback, useEffect, useState } from 'react';
import { TabInfo } from './types';

/**
 * Hook for interacting with the Electron tab system
 * This hook provides methods to create, switch, close, and manage tabs
 */
export const useTabSystem = () => {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Check if we're in Electron environment
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.tab;

  // Load all tabs
  const loadTabs = useCallback(async () => {
    if (!isElectron) {
      return;
    }

    try {
      const allTabs = await (window as any).electron?.tab?.getAll();
      setTabs(allTabs || []);
    } catch (error) {
      console.error('[useTabSystem] Failed to load tabs:', error);
    }
  }, [isElectron]);

  // Load active tab
  const loadActiveTab = useCallback(async () => {
    if (!isElectron) {
      return;
    }

    try {
      const activeTab = await (window as any).electron?.tab?.getActive();
      setActiveTabId(activeTab?.id || null);
    } catch (error) {
      console.error('[useTabSystem] Failed to load active tab:', error);
    }
  }, [isElectron]);

  // Create a new tab
  const createTab = useCallback(
    async (url: string, options?: { title?: string; favicon?: string }) => {
      if (!isElectron) {
        console.warn('[useTabSystem] Not in Electron environment');
        return null;
      }

      try {
        const newTab = await (window as any).electron?.tab?.create(url, options);
        if (newTab) {
          await loadTabs();
          await loadActiveTab();
        }
        return newTab;
      } catch (error) {
        console.error('[useTabSystem] Failed to create tab:', error);
        return null;
      }
    },
    [isElectron, loadTabs, loadActiveTab],
  );

  // Switch to a tab
  const switchTab = useCallback(
    async (tabId: string) => {
      if (!isElectron) {
        return;
      }

      try {
        await (window as any).electron?.tab?.switch(tabId);
        setActiveTabId(tabId);
        setTabs((prev) => prev.map((tab) => ({ ...tab, isActive: tab.id === tabId })));
      } catch (error) {
        console.error('[useTabSystem] Failed to switch tab:', error);
      }
    },
    [isElectron],
  );

  // Close a tab
  const closeTab = useCallback(
    async (tabId: string) => {
      if (!isElectron) {
        return;
      }

      try {
        await (window as any).electron?.tab?.close(tabId);
        await loadTabs();
        await loadActiveTab();
      } catch (error) {
        console.error('[useTabSystem] Failed to close tab:', error);
      }
    },
    [isElectron, loadTabs, loadActiveTab],
  );

  // Go back in active tab
  const goBack = useCallback(async () => {
    if (!isElectron) {
      return;
    }

    try {
      await (window as any).electron?.tab?.goBack();
    } catch (error) {
      console.error('[useTabSystem] Failed to go back:', error);
    }
  }, [isElectron]);

  // Go forward in active tab
  const goForward = useCallback(async () => {
    if (!isElectron) {
      return;
    }

    try {
      await (window as any).electron?.tab?.goForward();
    } catch (error) {
      console.error('[useTabSystem] Failed to go forward:', error);
    }
  }, [isElectron]);

  // Reload active tab
  const reload = useCallback(async () => {
    if (!isElectron) {
      return;
    }

    try {
      await (window as any).electron?.tab?.reload();
    } catch (error) {
      console.error('[useTabSystem] Failed to reload:', error);
    }
  }, [isElectron]);

  // Initialize
  useEffect(() => {
    if (isElectron && !isReady) {
      loadTabs();
      loadActiveTab();
      setIsReady(true);
    }
  }, [isElectron, isReady, loadTabs, loadActiveTab]);

  return {
    tabs,
    activeTabId,
    isReady: isElectron && isReady,
    createTab,
    switchTab,
    closeTab,
    goBack,
    goForward,
    reload,
  };
};
