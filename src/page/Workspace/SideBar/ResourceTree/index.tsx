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
import { Input, Space, Tree, message } from 'antd';
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
import { listDatabases } from '@/common/network/database';
import { getConnectionList } from '@/common/network/connection';
import { formatMessage } from '@/util/intl';
import {
  DS_DB_PAGE_SIZE,
  LM_DS_PREFIX,
  LM_PROJECT_PREFIX,
  PROJECT_DS_PAGE_SIZE,
  datasourceToNode,
  makeLoadMoreNode,
} from './lazyTreeHelpers';

interface IProps {
  sessionManagerStore?: SessionManagerStore;
  modalStore?: ModalStore;
  settingStore?: SettingStore;
  /**
   * 非懒加载模式下用于构建树的全量库列表（ObjectTreePanel 仍用此路径）。
   * 懒加载模式(lazy=true)下忽略，改由组件内部按数据源分页懒加载。
   */
  databases?: IDatabase[];
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
  /**
   * 懒加载模式：主资源树(DatabaseTree)启用后，不再用全量 databases 分组，而是先分页拉数据源、
   * 展开数据源再分页懒加载库（数据源模式则直接分页懒加载该数据源库）。
   */
  lazy?: boolean;
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
  lazy = false,
}) {
  const { expandedKeys, loadedKeys, sessionIds, setSessionId, onExpand, onLoad, setExpandedKeys } =
    useTreeState(stateId);
  const treeContext = useContext(ResourceTreeContext);
  const { tabKey } = useParams<{ tabKey: string }>();
  const update = useUpdate();
  const [wrapperHeight, setWrapperHeight] = useState(0);
  /**
   * 搜索词。type 为空表示不限定对象类型——输入即直接在表、视图、函数等全部类型中
   * 筛选（对象类型下拉选择已移除）；value 为空表示未在搜索。
   */
  const [searchValue, setSearchValue] = useState<{
    type?: DbObjectType;
    value?: string;
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

  /**
   * ===== 懒加载模式（lazy=true）=====
   * 主资源树启用后：项目模式先分页拉数据源、展开数据源再分页懒加载库；
   * 数据源模式直接分页懒加载该数据源库。用"加载更多"哨兵节点追加。
   * 与 SelectPanel/Project 同一模型，helper 见 lazyTreeHelpers.tsx。
   * 非懒加载路径（ObjectTreePanel）完全不受影响。
   */
  const [lazyTreeData, setLazyTreeData] = useState<TreeDataNode[]>([]);
  const dsListPageInfoRef = useRef<{
    projectId: number;
    page: number;
    size: number;
    totalPages: number;
  }>(null);
  const dsDbPageInfoRef = useRef<Map<number, { page: number; size: number; totalPages: number }>>(
    new Map(),
  );
  const [loadMoreLoadingKeys, setLoadMoreLoadingKeys] = useState<Set<string>>(new Set());
  const lazyLocateLocatingRef = useRef<number>(null);
  const lazyProjectId = treeContext.selectProjectId;
  const lazyDatasourceId = treeContext.selectDatasourceId;

  const buildDbChildNodes = (list: IDatabase[]) =>
    list.map((database) => DataBaseTreeData(undefined, database, database?.id, true, null));

  const lazyLoadProjectDatasources = useCallback(async (projectId: number) => {
    try {
      const data = await getConnectionList({
        projectId,
        page: 1,
        size: PROJECT_DS_PAGE_SIZE,
      });
      const contents = data?.contents || [];
      const totalPages = data?.page?.totalPages ?? (contents.length ? 1 : 0);
      dsListPageInfoRef.current = {
        projectId,
        page: 1,
        size: PROJECT_DS_PAGE_SIZE,
        totalPages,
      };
      const nodes = contents.map(datasourceToNode);
      if (1 < totalPages) {
        nodes.push(makeLoadMoreNode(LM_PROJECT_PREFIX + projectId));
      }
      setLazyTreeData(nodes);
    } catch (e) {
      message.error(
        formatMessage({
          id: 'odc.ResourceTree.Datasource.FailedToLoad',
          defaultMessage: '加载数据源失败',
        }),
      );
    }
  }, []);

  const lazyLoadDatasourceDatabases = useCallback(async (datasourceId: number, page = 1) => {
    try {
      const res = await listDatabases(
        null,
        datasourceId,
        page,
        DS_DB_PAGE_SIZE,
        null,
        null,
        null,
        true,
        true,
      );
      const dbs = (res?.contents || []).filter((db) => db.existed);
      const totalPages = res?.page?.totalPages ?? (res?.contents?.length ? 1 : 0);
      dsDbPageInfoRef.current.set(datasourceId, {
        page,
        size: DS_DB_PAGE_SIZE,
        totalPages,
      });
      const nodes: TreeDataNode[] = buildDbChildNodes(dbs);
      if (page < totalPages) {
        nodes.push(makeLoadMoreNode(LM_DS_PREFIX + datasourceId));
      }
      setLazyTreeData((prev) => {
        if (page === 1) {
          return nodes;
        }
        const withoutLm = prev.filter((n) => n.key !== LM_DS_PREFIX + datasourceId);
        return [...withoutLm, ...nodes];
      });
      return dbs;
    } catch (e) {
      message.error(
        formatMessage({
          id: 'odc.ResourceTree.Datasource.FailedToLoad',
          defaultMessage: '加载失败',
        }),
      );
    }
  }, []);

  const lazyLoadMoreProjectDatasources = useCallback(async () => {
    const info = dsListPageInfoRef.current;
    if (!info) {
      return;
    }
    const lmKey = LM_PROJECT_PREFIX + info.projectId;
    if (loadMoreLoadingKeys.has(lmKey)) {
      return;
    }
    setLoadMoreLoadingKeys((prev) => new Set(prev).add(lmKey));
    try {
      const nextPage = info.page + 1;
      const data = await getConnectionList({
        projectId: info.projectId,
        page: nextPage,
        size: info.size,
      });
      const contents = data?.contents || [];
      dsListPageInfoRef.current = { ...info, page: nextPage };
      const newNodes = contents.map(datasourceToNode);
      setLazyTreeData((prev) => {
        const withoutLm = prev.filter((n) => n.key !== lmKey);
        const merged = [...withoutLm, ...newNodes];
        if (nextPage < info.totalPages) {
          merged.push(makeLoadMoreNode(lmKey));
        }
        return merged;
      });
    } catch (e) {
      // ignore
    } finally {
      setLoadMoreLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(lmKey);
        return next;
      });
    }
  }, [loadMoreLoadingKeys]);

  const lazyLoadMoreDatasourceDatabases = useCallback(
    async (datasourceId: number) => {
      const info = dsDbPageInfoRef.current.get(datasourceId);
      if (!info) {
        return;
      }
      const lmKey = LM_DS_PREFIX + datasourceId;
      if (loadMoreLoadingKeys.has(lmKey)) {
        return;
      }
      setLoadMoreLoadingKeys((prev) => new Set(prev).add(lmKey));
      try {
        const nextPage = info.page + 1;
        const res = await listDatabases(
          null,
          datasourceId,
          nextPage,
          info.size,
          null,
          null,
          null,
          true,
          true,
        );
        const dbs = (res?.contents || []).filter((db) => db.existed);
        dsDbPageInfoRef.current.set(datasourceId, { ...info, page: nextPage });
        const newChildren = buildDbChildNodes(dbs);
        const dsKey = `ds-${datasourceId}`;
        setLazyTreeData((prev) => {
          const hasDsNode = prev.some((n) => n.key === dsKey);
          if (hasDsNode) {
            return prev.map((n) => {
              if (n.key !== dsKey) {
                return n;
              }
              const existing = ((n.children || []) as TreeDataNode[]).filter(
                (c) => c.key !== lmKey,
              );
              const merged: TreeDataNode[] = [...existing, ...newChildren];
              if (nextPage < info.totalPages) {
                merged.push(makeLoadMoreNode(lmKey));
              }
              return { ...n, children: merged };
            });
          }
          const withoutLm = prev.filter((n) => n.key !== lmKey);
          const merged: TreeDataNode[] = [...withoutLm, ...newChildren];
          if (nextPage < info.totalPages) {
            merged.push(makeLoadMoreNode(lmKey));
          }
          return merged;
        });
      } catch (e) {
        // ignore
      } finally {
        setLoadMoreLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(lmKey);
          return next;
        });
      }
    },
    [loadMoreLoadingKeys],
  );

  const lazyHandleLoadMore = useCallback(
    (key: string) => {
      if (key.startsWith(LM_PROJECT_PREFIX)) {
        lazyLoadMoreProjectDatasources();
      } else if (key.startsWith(LM_DS_PREFIX)) {
        const dsId = Number(key.replace(LM_DS_PREFIX, ''));
        if (!Number.isNaN(dsId)) {
          lazyLoadMoreDatasourceDatabases(dsId);
        }
      }
    },
    [lazyLoadMoreProjectDatasources, lazyLoadMoreDatasourceDatabases],
  );

  /**
   * 进入项目/数据源时拉首页。
   */
  useEffect(() => {
    if (!lazy) {
      return;
    }
    setLazyTreeData([]);
    if (databaseFrom === 'project' && lazyProjectId) {
      lazyLoadProjectDatasources(lazyProjectId);
    } else if (databaseFrom === 'datasource' && lazyDatasourceId) {
      lazyLoadDatasourceDatabases(lazyDatasourceId, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lazy, databaseFrom, lazyProjectId, lazyDatasourceId]);

  const lazyReload = useCallback(() => {
    if (databaseFrom === 'project' && lazyProjectId) {
      return lazyLoadProjectDatasources(lazyProjectId);
    } else if (databaseFrom === 'datasource' && lazyDatasourceId) {
      return lazyLoadDatasourceDatabases(lazyDatasourceId, 1);
    }
  }, [
    databaseFrom,
    lazyProjectId,
    lazyDatasourceId,
    lazyLoadProjectDatasources,
    lazyLoadDatasourceDatabases,
  ]);

  const treeData: TreeDataNode[] = (() => {
    if (lazy) {
      /**
       * 懒加载模式：直接用 lazyTreeData。内联搜索仅过滤"已加载"节点（降级，Ctrl+J 全局搜索走服务端）。
       */
      if (searchValue?.value) {
        const kw = searchValue.value.toLowerCase();
        const filterNodes = (nodes: TreeDataNode[]): TreeDataNode[] =>
          nodes
            .map((n) => {
              if (n.type === ResourceNodeType.LoadMore) {
                return null;
              }
              if (n.type === ResourceNodeType.Datasource) {
                const children = n.children ? filterNodes(n.children as TreeDataNode[]) : [];
                if (children.length) {
                  return { ...n, children };
                }
                return null;
              }
              const db = n.data as IDatabase;
              return db?.name?.toLowerCase()?.includes(kw) ? n : null;
            })
            .filter(Boolean) as TreeDataNode[];
        return filterNodes(lazyTreeData);
      }
      return lazyTreeData;
    }
    const filteredDatabases =
      databases?.filter((db) => {
        if (
          /**
           * 按库名过滤仅用于多库列表（侧边栏）；SQL 编辑器内嵌树（flattenDatabase）
           * 只绑定单个库，按对象关键词过滤库名会把唯一的库过滤掉导致树被清空。
           */
          !flattenDatabase &&
          searchValue?.value &&
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

  /**
   * 输入搜索词后自动展开数据库与对象类型根节点（表/视图/函数…）：折叠状态的子节点不
   * 渲染，筛选结果不可见；展开未加载的类型根还会触发 rc-tree 的懒加载，加载完成后
   * treeData 重建会对新载入的子节点再次过滤。仅在搜索时追加 keys，不收起用户已展开
   * 的其它节点。flattenDatabase（编辑器内嵌树）顶层即对象类型根，只展开第一层，避免
   * 把所有表/视图节点全部展开。
   */
  useEffect(() => {
    if (searchValue?.value) {
      const keys = [
        ...treeData.map((node) => node.key),
        ...(flattenDatabase
          ? []
          : treeData.reduce<(string | number)[]>(
              (acc, node) => acc.concat((node.children || []).map((child) => child.key)),
              [],
            )),
      ];
      setExpandedKeys((prev: (string | number)[]) => Array.from(new Set([...prev, ...keys])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

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
    if (lazy) {
      /**
       * 懒加载模式由下方专用 effect 处理定位（含未加载时的全量兜底）。
       */
      return;
    }
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

  /**
   * 懒加载模式定位：目标库若已在已加载数据源中，直接展开+滚动；否则用一次全量
   * listDatabases(projectId) 找到归属数据源，把该数据源库填入并展开（与 SelectPanel/Project
   * 定位逻辑一致；该全量查询为定位功能性必需，不参与常规分页）。
   */
  useEffect(() => {
    if (!lazy || !treeContext.currentDatabaseId || !lazyTreeData.length) {
      return;
    }
    const databaseId = treeContext.currentDatabaseId;
    let group = null;
    for (const node of lazyTreeData) {
      if (
        node.type === ResourceNodeType.Datasource &&
        node.children?.some((c) => c.key === databaseId)
      ) {
        group = node;
        break;
      }
    }
    const existsFlat = lazyTreeData.some((n) => n.key === databaseId);
    const scrollToSelected = () => {
      setTimeout(() => {
        const nodeEl = treeWrapperRef.current?.querySelector?.('.ant-tree-treenode-selected');
        if (nodeEl && typeof nodeEl.scrollIntoView === 'function') {
          nodeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 0);
    };
    if (group || existsFlat) {
      if (group) {
        const keys = [...expandedKeys];
        if (!keys.includes(group.key)) {
          setExpandedKeys([...keys, group.key]);
        }
      }
      scrollToSelected();
      return;
    }
    if (databaseFrom !== 'project' || !lazyProjectId) {
      return;
    }
    if (lazyLocateLocatingRef.current === databaseId) {
      return;
    }
    lazyLocateLocatingRef.current = databaseId;
    (async () => {
      try {
        const res = await listDatabases(
          lazyProjectId,
          null,
          1,
          99999,
          null,
          null,
          null,
          true,
          true,
        );
        const all = (res?.contents || []).filter((db) => db.existed);
        const targetDb = all.find((db) => db.id === databaseId);
        const targetDsId = targetDb?.dataSource?.id;
        if (targetDsId == null) {
          return;
        }
        const groupByDs = new Map<number, IDatabase[]>();
        all.forEach((db) => {
          const dsId = db.dataSource?.id;
          if (dsId == null) {
            return;
          }
          const arr = groupByDs.get(dsId) || [];
          arr.push(db);
          groupByDs.set(dsId, arr);
        });
        setLazyTreeData((prev) =>
          prev.map((n) => {
            if (n.type !== ResourceNodeType.Datasource || n.children?.length) {
              return n;
            }
            const dsId = (n.data as IDatasource)?.id;
            const dbs = dsId != null ? groupByDs.get(dsId) : undefined;
            if (!dbs?.length) {
              return n;
            }
            return { ...n, children: buildDbChildNodes(dbs) };
          }),
        );
        const targetKey = `ds-${targetDsId}`;
        const cur = [...expandedKeys];
        if (!cur.includes(targetKey)) {
          setExpandedKeys([...cur, targetKey]);
        }
        scrollToSelected();
      } catch (e) {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lazy, treeContext.currentDatabaseId, treeContext.locateRequestId, lazyTreeData]);

  const loadData = useCallback(
    async (treeNode: EventDataNode<any> & TreeDataNode) => {
      const { type, data, key } = treeNode;
      switch (type) {
        case ResourceNodeType.Datasource: {
          if (lazy) {
            /**
             * 懒加载：展开数据源时按页拉取其下库，挂为子节点（含"加载更多"哨兵）。
             */
            const datasourceId = (data as IDatasource)?.id;
            const res = await listDatabases(
              null,
              datasourceId,
              1,
              DS_DB_PAGE_SIZE,
              null,
              null,
              null,
              true,
              true,
            );
            const dbs = (res?.contents || []).filter((db) => db.existed);
            const totalPages = res?.page?.totalPages ?? (res?.contents?.length ? 1 : 0);
            dsDbPageInfoRef.current.set(datasourceId, {
              page: 1,
              size: DS_DB_PAGE_SIZE,
              totalPages,
            });
            const children: TreeDataNode[] = buildDbChildNodes(dbs);
            if (1 < totalPages) {
              children.push(makeLoadMoreNode(LM_DS_PREFIX + datasourceId));
            }
            setLazyTreeData((prev) => prev.map((n) => (n.key === key ? { ...n, children } : n)));
          }
          /**
           * 非懒加载：项目模式下数据源节点由已拉取的数据库列表分组而来，无需懒加载。
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
    [sessionIds, lazy],
  );

  const renderNode = useCallback(
    (node: TreeDataNode): React.ReactNode => {
      const { type, sessionId, key } = node;
      if (type === ResourceNodeType.LoadMore) {
        const lmKey = String(key);
        const loading = loadMoreLoadingKeys.has(lmKey);
        return (
          <span
            className={styles.loadMore}
            onClick={(e) => {
              e.stopPropagation();
              lazyHandleLoadMore(lmKey);
            }}
          >
            {loading
              ? formatMessage({
                  id: 'odc.ResourceTree.Loading',
                  defaultMessage: '加载中...',
                })
              : formatMessage({
                  id: 'odc.ResourceTree.LoadMore',
                  defaultMessage: '加载更多',
                })}
          </span>
        );
      }
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
    [sessionIds, loadMoreLoadingKeys, lazyHandleLoadMore],
  );

  /**
   * 懒加载模式下，已加载到树中的库（供 SyncMetadata 聚合同步状态用；降级——仅含已展开
   * 数据源下的库，未展开的不参与，用户已知悉）。
   */
  const loadedDatabases = useMemo(() => {
    if (!lazy) {
      return databases || [];
    }
    const result: IDatabase[] = [];
    const walk = (nodes: TreeDataNode[]) => {
      nodes.forEach((n) => {
        if (n.type === ResourceNodeType.Database && n.data) {
          result.push(n.data as IDatabase);
        }
        if (n.children?.length) {
          walk(n.children as TreeDataNode[]);
        }
      });
    };
    walk(lazyTreeData);
    return result;
  }, [lazy, lazyTreeData, databases]);

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
                  reloadDatabase={lazy ? lazyReload : reloadDatabase}
                  databaseList={loadedDatabases}
                />
              ) : null}
              <Reload
                key="ResourceTreeReload"
                onClick={() => {
                  return lazy ? lazyReload() : reloadDatabase();
                }}
                style={{ display: 'flex' }}
              />
            </Space>
          </span>
        </div>
      )}
      <div className={styles.search}>
        <DatabaseSearch
          onChange={(_, value) => {
            setSearchValue(value ? { type: null, value } : null);
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
