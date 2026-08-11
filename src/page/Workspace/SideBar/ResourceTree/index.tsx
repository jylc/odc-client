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

import { IDatabase } from '@/d.ts/database';
import { SessionManagerStore } from '@/store/sessionManager';
import { Input, Space, Tree } from 'antd';
import { DataNode } from 'antd/lib/tree';
import { EventDataNode } from 'antd/lib/tree';
import { throttle } from 'lodash';
import { inject, observer } from 'mobx-react';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadNode } from './helper';
import styles from './index.less';
import { DataBaseTreeData } from './Nodes/database';
import StatusIcon from '@/component/StatusIcon/DataSourceIcon';
import TreeNodeMenu from './TreeNodeMenu';
import { ResourceNodeType, TreeDataNode } from './type';
import tracert from '@/util/tracert';
import { useUpdate } from 'ahooks';
import Icon, { SwapOutlined } from '@ant-design/icons';
import Reload from '@/component/Button/Reload';
import DatasourceFilter from './DatasourceFilter';
import { ConnectType, DbObjectType } from '@/d.ts';
import { IDatasource } from '@/d.ts/datasource';
import useTreeState from './useTreeState';
import DatabaseSearch from './DatabaseSearch';
import { useParams } from '@umijs/max';
import ResourceTreeContext from '../../context/ResourceTreeContext';
import SyncMetadata from '@/component/Button/SyncMetadata';
import { IManagerResourceType } from '@/d.ts';
import { ModalStore } from '@/store/modal';
import type { SettingStore } from '@/store/setting';

interface IProps {
  sessionManagerStore?: SessionManagerStore;
  modalStore?: ModalStore;
  settingStore?: SettingStore;
  databases: IDatabase[];
  reloadDatabase: () => void;
  pollingDatabase: () => void;
  title: React.ReactNode;
  databaseFrom: 'datasource' | 'project';
  showTip?: boolean;
  enableFilter?: boolean;
  stateId?: string;
  onTitleClick?: () => void;
  /**
   * 展平数据库层级：把库的子节点（表/视图/函数/存储过程等对象类型根）直接作为顶层节点，
   * 不再显示库本身。用于 SQL 编辑器内嵌的对象树（只关心当前库的对象，无需库这一层）。
   */
  flattenDatabase?: boolean;
}

const ResourceTree: React.FC<IProps> = function ({
  sessionManagerStore,
  modalStore,
  settingStore,
  databases,
  title,
  databaseFrom,
  onTitleClick,
  reloadDatabase,
  pollingDatabase,
  flattenDatabase,
  showTip = false,
  enableFilter,
  stateId,
}) {
  const { expandedKeys, loadedKeys, sessionIds, setSessionId, onExpand, onLoad, setExpandedKeys } =
    useTreeState(stateId);
  const treeContext = useContext(ResourceTreeContext);
  const { tabKey } = useParams<{ tabKey: string }>();
  const update = useUpdate();
  const [wrapperHeight, setWrapperHeight] = useState(0);
  const [searchValue, setSearchValue] = useState<{
    type: DbObjectType;
    value: string;
  }>(null);

  const [envs, setEnvs] = useState<number[]>([]);
  const [connectTypes, setConnectTypes] = useState<ConnectType[]>([]);
  const treeWrapperRef = useRef<HTMLDivElement>();
  const treeRef = useRef(null);

  useEffect(() => {
    tracert.expo('a3112.b41896.c330992');
  }, []);
  useEffect(() => {
    const resizeHeight = throttle(() => {
      setWrapperHeight(treeWrapperRef?.current?.offsetHeight);
    }, 500);
    setWrapperHeight(treeWrapperRef.current?.clientHeight);
    window.addEventListener('resize', resizeHeight);
    return () => {
      window.removeEventListener('resize', resizeHeight);
    };
  }, []);

  const treeData: TreeDataNode[] = (() => {
    const filteredDatabases =
      databases?.filter((db) => {
        if (
          searchValue?.type === DbObjectType.database &&
          !db.name.toLowerCase()?.includes(searchValue?.value?.toLowerCase())
        ) {
          /**
           * search filter
           */
          return false;
        }
        return (
          db.existed &&
          !(envs?.length && !envs.includes(db.environment?.id)) &&
          !(connectTypes?.length && !connectTypes.includes(db.dataSource?.type))
        );
      }) || [];

    const buildDatabaseNodes = (list: IDatabase[]) =>
      list.map((database) => {
        const dbId = database.id;
        const dbSessionId = sessionIds[dbId];
        const dbSession = sessionManagerStore.sessionMap.get(dbSessionId);
        return DataBaseTreeData(dbSession, database, database?.id, true, searchValue);
      });

    if (flattenDatabase && filteredDatabases.length) {
      /**
       * 展平数据库层级：把当前库的对象类型根（表/视图/函数/存储过程…）直接作为顶层节点，
       * 不显示库本身。用于 SQL 编辑器内嵌对象树。
       */
      const databaseNodes = buildDatabaseNodes(filteredDatabases);
      const children = [].concat(...databaseNodes.map((node) => node.children || []));
      return children;
    }

    if (databaseFrom === 'project') {
      /**
       * Project mode groups databases by datasource so the tree shows
       * 项目 → 数据源 → 库, matching the SelectPanel's project tree.
       */
      const groups = new Map<number, { dataSource: IDatasource; databases: IDatabase[] }>();
      filteredDatabases.forEach((database) => {
        const dataSource = database.dataSource;
        if (!dataSource) {
          return;
        }
        const group = groups.get(dataSource.id) || { dataSource, databases: [] };
        group.databases.push(database);
        groups.set(dataSource.id, group);
      });
      return [...groups.values()].map(({ dataSource, databases }) => ({
        title: dataSource.name,
        key: `ds-${dataSource.id}`,
        type: ResourceNodeType.Datasource,
        data: dataSource,
        icon: <StatusIcon item={dataSource} />,
        isLeaf: false,
        children: buildDatabaseNodes(databases),
      }));
    }

    return buildDatabaseNodes(filteredDatabases);
  })();

  const setDatabaseSelected = (key) => {
    const group = treeData.find((node) => node.children?.some((child) => child.key === key));
    setExpandedKeys(group ? [group.key, key] : [key]);
    treeContext.setCurrentDatabaseId(key);
    setTimeout(() => {
      /**
       * 同 locate effect：rc-tree 的 scrollTo 在非 virtual 下无法滚动外层容器，改用原生
       * scrollIntoView 定位。selectedKeys 即将更新为 [key]，但此处直接按即将高亮的节点
       * 滚动，避免等下一帧渲染。先用当前已展开节点定位，若未命中则等 selectedKeys 更新后
       * 由 locate effect 兜底。
       */
      const nodeEl = treeWrapperRef.current?.querySelector?.('.ant-tree-treenode-selected');
      if (nodeEl && typeof nodeEl.scrollIntoView === 'function') {
        nodeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 0);
  };

  useEffect(() => {
    modalStore.changeDatabaseSearchModalData(true, setDatabaseSelected);
  }, [databases]);

  /**
   * 当 currentDatabaseId 变化（如经"登录数据库"打开 SQL 页，或在搜索弹窗选中库）或再次
   * 点击定位（locateRequestId 自增）时，在树中定位它：展开所属数据源分组并滚动到视图内。
   * 该 effect 是幂等的——每次运行都确保目标分组已展开并滚动，不再用永久 ref 阻断，这样
   * "展开后收起再点定位"也能重新展开。
   */
  useEffect(() => {
    const databaseId = treeContext.currentDatabaseId;
    if (!databaseId) {
      return;
    }
    const group = treeData.find((node) => node.children?.some((child) => child.key === databaseId));
    const exists = group || treeData.some((node) => node.key === databaseId);
    if (!exists) {
      /**
       * 数据库列表可能尚未加载完成；下次 treeData 变化时重试。
       */
      return;
    }
    if (group) {
      const keys = [...expandedKeys];
      if (!keys.includes(group.key)) {
        keys.push(group.key);
        setExpandedKeys(keys);
      }
    }
    setTimeout(() => {
      /**
       * 本树未开启 virtual（未设 height/itemHeight），rc-tree 的 scrollTo 设置的是内部
       * holder 的 scrollTop，而实际滚动容器是外层（overflow:auto），scrollTo 无法把视口外
       * 的节点滚进可视区。selectedKeys 已设为 [currentDatabaseId]，故带
       * ant-tree-treenode-selected 的节点即目标库节点，改用原生 scrollIntoView 定位。
       */
      const nodeEl = treeWrapperRef.current?.querySelector?.('.ant-tree-treenode-selected');
      if (nodeEl && typeof nodeEl.scrollIntoView === 'function') {
        nodeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 0);
  }, [treeContext.currentDatabaseId, treeContext.locateRequestId, treeData]);

  const loadData = useCallback(
    async (treeNode: EventDataNode<any> & TreeDataNode) => {
      const { type, data } = treeNode;
      switch (type) {
        case ResourceNodeType.Datasource: {
          /**
           * 项目模式下数据源节点由已拉取的数据库列表分组而来，无需懒加载。
           */
          break;
        }
        case ResourceNodeType.Database: {
          const dbId = (data as IDatabase).id;
          const dbSession =
            sessionManagerStore.sessionMap.get(sessionIds[dbId]) ||
            (await sessionManagerStore.createSession(null, data?.id, true));
          if (dbSession && dbSession !== 'NotFound') {
            setSessionId(dbId, dbSession?.sessionId);
            update();
          } else {
            throw new Error("load database's session failed");
            return;
          }
          break;
        }
        default: {
          await loadNode(sessionManagerStore, treeNode);
        }
      }
    },
    [sessionIds],
  );

  const renderNode = useCallback(
    (node: TreeDataNode): React.ReactNode => {
      const { type, sessionId, key, dbObjectType } = node;
      const dbSession = sessionManagerStore.sessionMap.get(sessionId);

      return (
        <TreeNodeMenu
          showTip={showTip}
          node={node}
          dbSession={dbSession}
          type={type}
          databaseFrom={databaseFrom}
          pollingDatabase={pollingDatabase}
        />
      );
    },
    [sessionIds],
  );

  return (
    <div className={styles.resourceTree}>
      {flattenDatabase ? null : (
        <div className={styles.title}>
          {tabKey ? (
            <Space size={2} className={styles.label}>
              {title}
            </Space>
          ) : (
            <Space size={4} onClick={() => onTitleClick?.()} className={styles.label}>
              {title}
              <Icon style={{ verticalAlign: 'middle' }} component={SwapOutlined} />
            </Space>
          )}
          <span className={styles.titleAction}>
          <Space size={8} style={{ lineHeight: 1.5 }}>
            {enableFilter ? (
              <DatasourceFilter
                key="ResourceTreeDatasourceFilter"
                envs={envs}
                types={connectTypes}
                onClear={() => {
                  setEnvs([]);
                  setConnectTypes([]);
                }}
                onEnvsChange={(v) => {
                  setEnvs(v);
                }}
                onTypesChange={(v) => {
                  setConnectTypes(v);
                }}
              />
            ) : null}
            {settingStore.configurations['odc.database.default.enableGlobalObjectSearch'] ===
            'true' ? (
              <SyncMetadata
                resourceType={
                  databaseFrom === 'project'
                    ? IManagerResourceType.project
                    : IManagerResourceType.resource
                }
                resourceId={Number(stateId?.split('-')?.[1])}
                reloadDatabase={reloadDatabase}
                databaseList={databases}
              />
            ) : null}
            <Reload
              key="ResourceTreeReload"
              onClick={() => {
                return reloadDatabase();
              }}
              style={{ display: 'flex' }}
            />
          </Space>
        </span>
        </div>
      )}
      <div className={styles.search}>
        <DatabaseSearch
          onChange={(type, value) => {
            !type
              ? setSearchValue(null)
              : setSearchValue({
                  type,
                  value,
                });
          }}
        />
      </div>
      <div ref={treeWrapperRef} className={styles.tree}>
        <Tree
          ref={treeRef}
          expandAction="click"
          showIcon
          onExpand={(_, info) => {
            onExpand(_, info);
            //@ts-ignore
            tracert.click('a3112.b41896.c330992.d367628', { resourceType: info?.node?.type });
          }}
          treeData={treeData}
          titleRender={renderNode}
          loadData={loadData}
          expandedKeys={expandedKeys}
          loadedKeys={loadedKeys}
          onLoad={onLoad}
          height={wrapperHeight}
          selectable={true}
          selectedKeys={[treeContext.currentDatabaseId].filter(Boolean)}
        />
      </div>
    </div>
  );
};

export default inject('sessionManagerStore', 'modalStore', 'settingStore')(observer(ResourceTree));
