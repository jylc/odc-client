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

import React, { memo, useCallback, useMemo } from 'react';
import { CloseOutlined, LoadingOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import styles from './styles.less';

export interface TabItemProps {
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
  onClose: (tabId: string, e: React.MouseEvent) => void;
  onSwitch: (tabId: string) => void;
}

const TabItem: React.FC<TabItemProps> = ({ tab, onClose, onSwitch }) => {
  const handleClick = useCallback(() => {
    onSwitch(tab.id);
  }, [tab.id, onSwitch]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose(tab.id, e);
    },
    [tab.id, onClose],
  );

  const faviconIcon = useMemo(() => {
    if (tab.favicon) {
      return <img src={tab.favicon} alt="" className={styles.favicon} />;
    }
    return null;
  }, [tab.favicon]);

  const loadingIcon = useMemo(() => {
    if (tab.isLoading) {
      return <LoadingOutlined className={styles.loading} spin />;
    }
    return null;
  }, [tab.isLoading]);

  return (
    <div
      className={`${styles.tabItem} ${tab.isActive ? styles.active : ''}`}
      onClick={handleClick}
      role="tab"
      aria-selected={tab.isActive}
      tabIndex={0}
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
};

export default memo(TabItem);
