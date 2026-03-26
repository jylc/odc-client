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

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { PlusOutlined, LeftOutlined, RightOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SortableTabItem from './SortableTabItem';
import styles from './styles.less';
import { TabInfo } from './types';

interface TabBarProps {
  tabs?: TabInfo[];
  activeTabId?: string | null;
  onTabSwitch?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onTabAdd?: () => void;
  onTabReorder?: (tabs: TabInfo[]) => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onReload?: () => void;
}

const TabBar: React.FC<TabBarProps> = ({
  tabs = [],
  activeTabId,
  onTabSwitch,
  onTabClose,
  onTabAdd,
  onTabReorder,
  onGoBack,
  onGoForward,
  onReload,
}) => {
  const [localTabs, setLocalTabs] = useState<TabInfo[]>(tabs);

  useEffect(() => {
    setLocalTabs(tabs);
  }, [tabs]);

  const activeTab = useMemo(() => {
    return localTabs.find((tab) => tab.id === activeTabId);
  }, [localTabs, activeTabId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = localTabs.findIndex((tab) => tab.id === active.id);
        const newIndex = localTabs.findIndex((tab) => tab.id === over.id);

        const newTabs = arrayMove(localTabs, oldIndex, newIndex);
        setLocalTabs(newTabs);
        onTabReorder?.(newTabs);
      }
    },
    [localTabs, onTabReorder],
  );

  const handleAddTab = useCallback(() => {
    onTabAdd?.();
  }, [onTabAdd]);

  const handleGoBack = useCallback(() => {
    onGoBack?.();
  }, [onGoBack]);

  const handleGoForward = useCallback(() => {
    onGoForward?.();
  }, [onGoForward]);

  const handleReload = useCallback(() => {
    onReload?.();
  }, [onReload]);

  return (
    <div className={styles.tabBar}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={localTabs.map((tab) => tab.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className={styles.tabList}>
            {localTabs.map((tab) => (
              <SortableTabItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onSwitch={onTabSwitch}
                onClose={onTabClose}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        className={styles.addButton}
        onClick={handleAddTab}
        aria-label="Add new tab"
        type="button"
        title="New Tab (Ctrl+T)"
      >
        <PlusOutlined />
      </button>

      <div className={styles.tabActions}>
        <button
          className={styles.actionButton}
          onClick={handleGoBack}
          disabled={!activeTab?.canGoBack}
          aria-label="Go back"
          type="button"
          title="Go Back (Ctrl+Left)"
        >
          <LeftOutlined />
        </button>
        <button
          className={styles.actionButton}
          onClick={handleGoForward}
          disabled={!activeTab?.canGoForward}
          aria-label="Go forward"
          type="button"
          title="Go Forward (Ctrl+Right)"
        >
          <RightOutlined />
        </button>
        <button
          className={styles.actionButton}
          onClick={handleReload}
          aria-label="Reload"
          type="button"
          title="Reload (Ctrl+R)"
        >
          <ReloadOutlined />
        </button>
      </div>
    </div>
  );
};

export default TabBar;
