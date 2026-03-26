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

import React, { memo, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import styles from './styles.less';

export interface SortableTabItemProps {
  tab: {
    id: string;
    title: string;
    url: string;
    favicon?: string;
    isActive: boolean;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
  };
  isActive: boolean;
  onSwitch?: (tabId: string) => void;
  onClose?: (tabId: string) => void;
}

const SortableTabItem: React.FC<SortableTabItemProps> = memo(
  ({ tab, isActive, onSwitch, onClose }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: tab.id,
    });

    const handleClick = useCallback(() => {
      onSwitch?.(tab.id);
    }, [tab.id, onSwitch]);

    const handleClose = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onClose?.(tab.id);
      },
      [tab.id, onClose],
    );

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const faviconIcon = tab.favicon ? (
      <img src={tab.favicon} alt="" className={styles.favicon} />
    ) : null;

    const loadingIcon = tab.isLoading ? <LoadingOutlined className={styles.loading} spin /> : null;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`${styles.tabItem} ${isActive ? styles.active : ''}`}
        onClick={handleClick}
        role="tab"
        aria-selected={isActive}
        tabIndex={0}
        {...attributes}
        {...listeners}
      >
        <div className={styles.tabContent}>
          {faviconIcon}
          <span className={styles.tabTitle}>{tab.title}</span>
          {loadingIcon}
        </div>
        <button
          className={styles.closeButton}
          onClick={handleClose}
          aria-label="Close tab"
          type="button"
        >
          <CloseOutlined />
        </button>
      </div>
    );
  },
);

SortableTabItem.displayName = 'SortableTabItem';

export default SortableTabItem;
