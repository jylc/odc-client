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

import ResourceTreeContext, { ResourceTreeTab } from '@/page/Workspace/context/ResourceTreeContext';
import ResourceTree from '@/page/Workspace/SideBar/ResourceTree';
import TreeStateStore, { ITreeStateCache } from '@/page/Workspace/SideBar/ResourceTree/TreeStateStore';
import SessionStore from '@/store/sessionManager/session';
import { Space } from 'antd';
import React, { useEffect, useMemo, useRef } from 'react';
import styles from './index.less';

interface IProps {
  /**
   * 编辑器当前会话，对象树绑定到该会话的数据库。
   * 为空时不渲染面板（例如会话尚未建立时）。
   */
  session: SessionStore;
  /**
   * 数据库轮询回调，透传给 ResourceTree 用于数据库节点状态刷新。
   */
  pollingDatabase?: () => void;
  /**
   * 对象树数据就绪回调：session 与数据库信息齐备、即将渲染树时触发一次。
   * ScriptPage 用它在"加载完成后展开"，实现打开时先折叠、加载完再展开的效果。
   */
  onReady?: () => void;
}

/**
 * SQL 编辑器左侧对象树面板。
 *
 * 复用侧边栏的 `ResourceTree` 组件，将其绑定到编辑器当前会话的单个数据库，
 * 并通过预填 TreeStateStore 的 sessionIds 缓存，让 ResourceTree 的懒加载逻辑
 * 命中编辑器已有的会话，从而避免为同一数据库创建第二个后端连接。
 */
const ObjectTreePanel: React.FC<IProps> = function ({ session, pollingDatabase, onReady }) {
  const noop = () => {};
  const odcDatabase = session?.odcDatabase;
  const dbId = odcDatabase?.id;
  const sessionId = session?.sessionId;
  const ready = !!(odcDatabase && dbId && sessionId);

  /**
   * 每个面板实例使用独立的缓存，避免不同 SQL 页签之间互相污染展开/加载状态。
   */
  const cacheRef = useRef<ITreeStateCache>({});
  const stateId = useMemo(() => `editor-objtree-${dbId ?? 'empty'}`, [dbId]);

  /**
   * 预填缓存：把当前数据库 id 直接映射到编辑器已有的 sessionId。
   * 这里在渲染期间同步写入（useTreeState 也在渲染期间读取同一缓存），保证 ResourceTree
   * 首屏构建 treeData 时 dbSession 就能命中，从而对象类型根节点（表/视图/…）的 sessionId
   * 被正确打上，后续懒加载（loadNode）可直接复用编辑器会话，零新增后端连接。
   */
  if (dbId && sessionId) {
    const cache = cacheRef.current;
    const entry =
      cache[stateId] || (cache[stateId] = { sessionIds: {}, expandedKeys: [], loadedKeys: [] });
    entry.sessionIds[dbId] = sessionId;
  }

  /**
   * 数据就绪（session + 库信息齐备）后通知父组件，使其从"初始折叠"切换到"展开"，
   * 实现"打开 SQL 窗口先折叠、加载完成再展开"的效果。
   */
  useEffect(() => {
    if (ready) {
      onReady?.();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const datasourceName = odcDatabase.dataSource?.name || odcDatabase.name;

  return (
    <TreeStateStore.Provider value={{ cache: cacheRef.current }}>
      <ResourceTreeContext.Provider
        value={{
          selectTabKey: ResourceTreeTab.datasource,
          selectProjectId: null,
          selectDatasourceId: null,
          datasourceList: [],
          projectList: [],
          databaseList: [odcDatabase],
          /**
           * 编辑器内对象树不需要联动侧边栏的当前数据库高亮，这里给空实现避免
           * useTreeState/onExpand 调用时报错（context 默认值缺少该字段）。
           */
          setCurrentDatabaseId: () => {},
          currentDatabaseId: dbId,
          reloadDatabaseList: () => Promise.resolve(),
          pollingDatabase,
        }}
      >
        <div className={styles.objectTreePanel}>
          <ResourceTree
            stateId={stateId}
            reloadDatabase={() => Promise.resolve()}
            pollingDatabase={pollingDatabase || noop}
            databaseFrom="datasource"
            title={
              <Space size={4} style={{ fontWeight: 600 }}>
                {datasourceName}
              </Space>
            }
            databases={[odcDatabase]}
            showTip={false}
            flattenDatabase
          />
        </div>
      </ResourceTreeContext.Provider>
    </TreeStateStore.Provider>
  );
};

export default ObjectTreePanel;
