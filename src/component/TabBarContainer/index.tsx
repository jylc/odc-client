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

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import TabBar from '@/page/TabBar';
import { isClient } from '@/util/env';
import { TabInfo } from '@/page/TabBar/types';
import { useNavigate } from '@umijs/max';

const TabBarContainer: React.FC = () => {
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Initialize with a default tab
  useEffect(() => {
    if (tabs.length === 0) {
      const initialTab: TabInfo = {
        id: 'tab-main',
        url: window.location.href,
        title: 'ODC',
        isActive: true,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      };
      setTabs([initialTab]);
      setActiveTabId('tab-main');
    }
  }, []);

  const handleSwitchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    setTabs((prev) =>
      prev.map((tab) => ({
        ...tab,
        isActive: tab.id === tabId,
      })),
    );
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      // Don't close the last tab
      if (tabs.length <= 1) {
        return;
      }

      setTabs((prev) => {
        const newTabs = prev.filter((tab) => tab.id !== tabId);
        // If we closed the active tab, activate another
        if (tabId === activeTabId && newTabs.length > 0) {
          const newActiveId = newTabs[0].id;
          setActiveTabId(newActiveId);
          return newTabs.map((tab) => ({
            ...tab,
            isActive: tab.id === newActiveId,
          }));
        }
        return newTabs;
      });
    },
    [tabs.length, activeTabId],
  );

  const handleAddTab = useCallback(() => {
    const newTab: TabInfo = {
      id: `tab-${Date.now()}`,
      url: window.location.href,
      title: 'New Tab',
      isActive: true,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    };

    setTabs((prev) =>
      prev.map((tab) => ({
        ...tab,
        isActive: false,
      })),
    );
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    navigate('/project');
  }, [navigate]);

  const handleGoBack = useCallback(() => {
    // Use browser history
    window.history.back();
  }, []);

  const handleGoForward = useCallback(() => {
    // Use browser history
    window.history.forward();
  }, []);

  const handleReload = useCallback(() => {
    // Reload current page
    window.location.reload();
  }, []);

  const activeTab = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTabId) || null;
  }, [tabs, activeTabId]);

  if (!isClient()) {
    return null;
  }

  return (
    <TabBar
      tabs={tabs}
      activeTabId={activeTabId}
      onTabSwitch={handleSwitchTab}
      onTabClose={handleCloseTab}
      onTabAdd={handleAddTab}
      onGoBack={handleGoBack}
      onGoForward={handleGoForward}
      onReload={handleReload}
    />
  );
};

export default TabBarContainer;
export { TabBarContainer };
