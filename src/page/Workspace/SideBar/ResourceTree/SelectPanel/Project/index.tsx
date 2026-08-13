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

import { listDatabases } from '@/common/network/database';
import { deleteConnection, getConnectionList } from '@/common/network/connection';
import { getProject, listProjects } from '@/common/network/project';
import Action from '@/component/Action';
import ConnectionPopover from '@/component/ConnectionPopover';
import StatusIcon from '@/component/StatusIcon/DataSourceIcon';
import { EnvColorMap } from '@/constant';
import { IDatabase } from '@/d.ts/database';
import { IDatasource } from '@/d.ts/datasource';
import { IProject } from '@/d.ts/project';
import NewDatasourceDrawer from '@/page/Datasource/Datasource/NewDatasourceDrawer';
import ResourceTreeContext from '@/page/Workspace/context/ResourceTreeContext';
import { loadNode } from '@/page/Workspace/SideBar/ResourceTree/helper';
import { DataBaseTreeData } from '@/page/Workspace/SideBar/ResourceTree/Nodes/database';
import TreeNodeMenu from '@/page/Workspace/SideBar/ResourceTree/TreeNodeMenu';
import TreeStateStore from '@/page/Workspace/SideBar/ResourceTree/TreeStateStore';
import useTreeState from '@/page/Workspace/SideBar/ResourceTree/useTreeState';
import {
  ResourceNodeType,
  TreeDataNode as ResourceTreeDataNode,
} from '@/page/Workspace/SideBar/ResourceTree/type';
import { DataSourceStatusStore } from '@/store/datasourceStatus';
import login from '@/store/login';
import { SessionManagerStore } from '@/store/sessionManager';
import { formatMessage } from '@/util/intl';
import Icon, { LeftOutlined } from '@ant-design/icons';
import {
  Badge,
  Dropdown,
  Empty,
  Input,
  message,
  Modal,
  Pagination,
  Popover,
  Spin,
  Tree,
  TreeDataNode,
} from 'antd';
import classNames from 'classnames';
import { EventDataNode } from 'antd/lib/tree';
import { inject, observer } from 'mobx-react';
import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import ResourceLayout from '../../Layout';
import styles from './index.less';
import { ReactComponent as ProjectSvg } from '@/svgr/project_space.svg';

type View = 'projectList' | 'datasourceList';

/**
 * 嵌套树分批加载的每页条数与"加载更多"哨兵节点 key 前缀。
 * - 项目内数据源列表：每页 50；
 * - 数据源下库列表：每页 100；
 * 哨兵节点 isLeaf=true，不会被 rc-tree 的 loadData 触发，仅通过 titleRender 点击拉取下一页。
 */
const PROJECT_DS_PAGE_SIZE = 50;
const DS_DB_PAGE_SIZE = 100;
const LM_PROJECT_PREFIX = 'lm-project-';
const LM_DS_PREFIX = 'lm-ds-';

function makeLoadMoreNode(key: string): ResourceTreeDataNode {
  return {
    key,
    title: formatMessage({
      id: 'odc.ResourceTree.LoadMore',
      defaultMessage: '加载更多',
    }),
    type: ResourceNodeType.LoadMore,
    isLeaf: true,
    selectable: false,
  };
}

function datasourceToNode(item: IDatasource): ResourceTreeDataNode {
  return {
    title: item.name,
    key: `ds-${item.id}`,
    icon: <StatusIcon item={item} />,
    isLeaf: false,
    type: ResourceNodeType.Datasource,
    data: item,
  };
}

interface IProps {
  closeSelectPanel: () => void;
  dataSourceStatusStore?: DataSourceStatusStore;
  sessionManagerStore?: SessionManagerStore;
}

/**
 * 递归地用最新的 session 数据重建节点子树。这与主 ResourceTree 每次渲染时通过 IIFE 重建
 * 整棵 treeData 的做法一致——若不重建，loadNode 拉取的子节点（如表列表）将永远无法反映到
 * 面板树中。
 */
function rebuildNode(
  node: ResourceTreeDataNode,
  sessionManagerStore: SessionManagerStore,
): ResourceTreeDataNode {
  if (node.type === ResourceNodeType.Database) {
    const dbSession = sessionManagerStore.sessionMap.get(node.sessionId);
    if (dbSession) {
      const rebuilt = DataBaseTreeData(dbSession, node.data, node.cid, true, null);
      return {
        ...node,
        ...rebuilt,
        children: (rebuilt.children || []).map((child) =>
          rebuildNode(child as ResourceTreeDataNode, sessionManagerStore),
        ),
      };
    }
  }
  if (node.children?.length) {
    return {
      ...node,
      children: node.children.map((c) =>
        rebuildNode(c as ResourceTreeDataNode, sessionManagerStore),
      ),
    };
  }
  return node;
}

export default inject(
  'dataSourceStatusStore',
  'sessionManagerStore',
)(
  observer(
    forwardRef(function ProjectTree(
      { closeSelectPanel, dataSourceStatusStore, sessionManagerStore }: IProps,
      ref,
    ) {
      const [searchKey, setSearchKey] = useState('');
      const context = useContext(ResourceTreeContext);
      const { cache: treeStateStoreCache } = useContext(TreeStateStore);
      const {
        autoEnterProjectId,
        setAutoEnterProjectId,
        currentDatabaseId,
        setCurrentDatabaseId,
        locateRequestId,
        autoEnterRequestId,
        setSelectProject,
        reloadDatasourceList,
      } = context;

      const [view, setView] = useState<View>('projectList');
      const [selectedProject, setSelectedProject] = useState<IProject>(null);
      const [datasources, setDatasources] = useState<IDatasource[]>([]);
      const [dsLoading, setDsLoading] = useState(false);
      /**
       * 每次加载数据源列表（进入项目 / 刷新）时自增，使树状态（expandedKeys/loadedKeys）
       * 不会从上一次访问同一项目时残留。
       */
      const [entrySeq, setEntrySeq] = useState(0);
      const [editDatasourceId, setEditDatasourceId] = useState(null);
      const [copyDatasourceId, setCopyDatasourceId] = useState<number>(null);
      const [addDSVisiable, setAddDSVisiable] = useState(false);

      /**
       * 项目列表改为服务端分页：不再从 context 读取全量 projectList，而是本地按页拉取。
       * current 为 1-based（与 listProjects 的 page 入参、antd Pagination 的 current 一致）。
       */
      const PROJECT_DEFAULT_PAGE_SIZE = 20;
      const [projPage, setProjPage] = useState<IProject[]>([]);
      const [projPageInfo, setProjPageInfo] = useState<{
        current: number;
        size: number;
        total: number;
      }>({ current: 1, size: PROJECT_DEFAULT_PAGE_SIZE, total: 0 });
      const [projLoading, setProjLoading] = useState(false);
      async function fetchProjects(
        current: number = 1,
        size: number = PROJECT_DEFAULT_PAGE_SIZE,
        name: string = searchKey,
      ) {
        setProjLoading(true);
        try {
          const res = await listProjects(name || null, current, size, false);
          setProjPage(res?.contents || []);
          setProjPageInfo({
            current,
            size,
            total: res?.page?.totalElements ?? 0,
          });
        } catch (e) {
          console.error(e);
        } finally {
          setProjLoading(false);
        }
      }

      const selectKeys = [context.selectProjectId].filter(Boolean);

      /**
       * 数据源树保存在 React state 中，使不可变更新能触发 antd Tree 重新处理 field 数据。
       * 这规避了 rc-tree 5.x 中传给 loadData 的 treeNode 是浅拷贝、直接修改它对真实
       * treeData 无效的问题。每次加载后从 session store 重建受影响子树（与主 ResourceTree
       * 每次渲染 IIFE 重建一致）。
       */
      const [treeData, setTreeData] = useState<ResourceTreeDataNode[]>([]);

      /**
       * 嵌套树分批加载状态：
       * - dsListPageInfoRef：当前项目数据源列表已加载到的 (page, totalPages)；
       * - dsDbPageInfoRef：每个数据源下库列表已加载到的 (page, totalPages)，按 datasourceId 索引；
       * - loadMoreLoadingKeys：正在加载中的哨兵节点 key 集合，用于渲染 loading 态并防重复点击。
       */
      const dsListPageInfoRef = useRef<{
        projectId: number;
        page: number;
        size: number;
        totalPages: number;
      }>(null);
      const dsDbPageInfoRef = useRef<
        Map<number, { page: number; size: number; totalPages: number }>
      >(new Map());
      const [loadMoreLoadingKeys, setLoadMoreLoadingKeys] = useState<Set<string>>(new Set());

      /**
       * 每项目独立 stateId，避免两个项目共享数据源/数据库 id 时 expandedKeys/loadedKeys 串。
       * entrySeq 后缀使每次访问（及每次刷新）都从全新的展开/加载状态开始——否则上次访问缓存的
       * loadedKeys 仍含数据源 key，rc-tree 在再次点击数据源时会跳过 loadData。
       */
      const stateId = selectedProject
        ? `project-ds-tree-${selectedProject.id}-${entrySeq}`
        : 'project-ds-tree';
      /**
       * 数据库自动定位用的 ref：treeRef 用于 scrollTo，treeContainerRef 指向树外层 DOM
       * 节点，用于在不依赖 rc-tree virtual 的情况下把目标 treenode 滚进可视区；
       * locateLocatingRef 标记异步定位进行中，避免重复发起全量库请求；
       * expandedKeysRef / loadedKeysRef 镜像最新的 expandedKeys / loadedKeys，供定位 effect
       * 在不把它们加入依赖数组的情况下读取最新值（避免用户收起数据源即被 effect 重新展开）。
       */
      const treeRef = useRef(null);
      const treeContainerRef = useRef<HTMLDivElement>(null);
      const locateLocatingRef = useRef<number>(null);
      const expandedKeysRef = useRef<(string | number)[]>([]);
      const loadedKeysRef = useRef<(string | number)[]>([]);
      /**
       * 记录上次 autoEnterProjectId effect 已处理过的 (目标项目 id, 进入请求序号)，
       * 避免依赖变化时重复触发"全部刷新"。backToProjectList 时清空，再次进入仍会刷新。
       */
      const autoEnterDoneRef = useRef<{ projectId: number; requestId: number }>(null);
      const { expandedKeys, loadedKeys, onExpand, onLoad, setExpandedKeys } = useTreeState(
        stateId,
        {
          setCurrentDatabaseOnExpand: false,
        },
      );
      /**
       * 镜像 expandedKeys / loadedKeys 到 ref，供定位 effect 读取最新值而不把它们加入
       * 依赖数组（否则用户收起数据源会触发 effect 立即重新展开）。
       */
      expandedKeysRef.current = expandedKeys;
      loadedKeysRef.current = loadedKeys;

      /**
       * 挂载时拉取项目列表第一页（服务端分页，取代原先的全量 projectList）。
       */
      useEffect(() => {
        fetchProjects(1, PROJECT_DEFAULT_PAGE_SIZE, '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      useImperativeHandle(
        ref,
        () => {
          return {
            reload() {
              if (view === 'datasourceList' && selectedProject?.id) {
                return loadProjectDatasources(selectedProject.id);
              }
              return fetchProjects(projPageInfo.current, projPageInfo.size, searchKey);
            },
          };
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [view, selectedProject, projPageInfo, searchKey],
      );

      async function loadProjectDatasources(projectId: number) {
        setDsLoading(true);
        setEntrySeq((s) => s + 1);
        /**
         * 进入（或刷新）项目时，丢弃该项目所有历史 stateId 的树状态缓存（expandedKeys/
         * loadedKeys）。rc-tree 的 loadData 仅在 key 不在 loadedKeys 时触发；若上一次访问
         * 残留的 loadedKeys（如 ds-<datasourceId>）被复用，再次展开数据源将不会重新拉取
         * 数据库，表现为"数据源展开后不显示数据库"。这里在加载新数据源列表前清掉所有
         * 以 `project-ds-tree-${projectId}-` 为前缀的缓存，配合 entrySeq 生成的新 stateId，
         * 确保本次进入使用全新（空）的展开/加载状态。
         */
        const cacheStore = treeStateStoreCache;
        if (cacheStore) {
          Object.keys(cacheStore).forEach((k) => {
            if (k.startsWith(`project-ds-tree-${projectId}-`)) {
              delete cacheStore[k];
            }
          });
        }
        try {
          /**
           * 改为分批加载：首页只拉 PROJECT_DS_PAGE_SIZE 条；若还有更多页，在末尾插入
           * "加载更多"哨兵节点，点击后拉取下一页并追加（见 loadMoreProjectDatasources）。
           */
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
          setDatasources(contents);
          dataSourceStatusStore?.asyncUpdateStatus(contents?.map((a) => a.id));
          const nodes = contents.map(datasourceToNode);
          if (1 < totalPages) {
            nodes.push(makeLoadMoreNode(LM_PROJECT_PREFIX + projectId));
          }
          setTreeData(nodes);
        } catch (e) {
          message.error(
            formatMessage({
              id: 'odc.ResourceTree.Datasource.FailedToLoad',
              defaultMessage: '加载数据源失败',
            }),
          );
        } finally {
          setDsLoading(false);
        }
      }

      /**
       * 点击"项目数据源加载更多"哨兵：拉取下一页并追加到数据源列表，按需重新挂回哨兵。
       */
      async function loadMoreProjectDatasources() {
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
          setDatasources((prev) => [...prev, ...contents]);
          dataSourceStatusStore?.asyncUpdateStatus(contents?.map((a) => a.id));
          const newNodes = contents.map(datasourceToNode);
          setTreeData((prev) => {
            const withoutLm = prev.filter((n) => n.key !== lmKey);
            const merged = [...withoutLm, ...newNodes];
            if (nextPage < info.totalPages) {
              merged.push(makeLoadMoreNode(lmKey));
            }
            return merged;
          });
        } catch (e) {
          message.error(
            formatMessage({
              id: 'odc.ResourceTree.Datasource.FailedToLoad',
              defaultMessage: '加载数据源失败',
            }),
          );
        } finally {
          setLoadMoreLoadingKeys((prev) => {
            const next = new Set(prev);
            next.delete(lmKey);
            return next;
          });
        }
      }

      /**
       * 点击"数据源下库加载更多"哨兵：拉取该数据源下一页库并追加为其子节点。
       */
      async function loadMoreDatasourceDatabases(datasourceId: number) {
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
          const databases = (res?.contents || []).filter((db) => db.existed);
          dsDbPageInfoRef.current.set(datasourceId, { ...info, page: nextPage });
          const newChildren: ResourceTreeDataNode[] = databases.map((database: IDatabase) =>
            DataBaseTreeData(undefined, database, database?.id, true, null),
          );
          const dsKey = `ds-${datasourceId}`;
          updateNode(dsKey, (n) => {
            const existing = (n.children || []).filter((c) => c.key !== lmKey);
            const merged: ResourceTreeDataNode[] = [
              ...(existing as ResourceTreeDataNode[]),
              ...newChildren,
            ];
            if (nextPage < info.totalPages) {
              merged.push(makeLoadMoreNode(lmKey));
            }
            return { ...n, children: merged };
          });
        } catch (e) {
          message.error(
            formatMessage({
              id: 'odc.ResourceTree.Datasource.FailedToLoad',
              defaultMessage: '加载失败',
            }),
          );
        } finally {
          setLoadMoreLoadingKeys((prev) => {
            const next = new Set(prev);
            next.delete(lmKey);
            return next;
          });
        }
      }

      /**
       * "加载更多"哨兵点击分发：按 key 前缀决定拉取项目数据源下一页还是某数据源下库下一页。
       */
      function handleLoadMore(key: string) {
        if (key.startsWith(LM_PROJECT_PREFIX)) {
          loadMoreProjectDatasources();
        } else if (key.startsWith(LM_DS_PREFIX)) {
          const datasourceId = Number(key.replace(LM_DS_PREFIX, ''));
          if (!Number.isNaN(datasourceId)) {
            loadMoreDatasourceDatabases(datasourceId);
          }
        }
      }

      function enterProject(project: IProject) {
        setSelectedProject(project);
        setSelectProject?.(project);
        setDatasources([]);
        setTreeData([]);
        setView('datasourceList');
        loadProjectDatasources(project.id);
      }

      function backToProjectList() {
        setView('projectList');
        setSelectedProject(null);
        setSelectProject?.(null);
        setDatasources([]);
        setTreeData([]);
        autoEnterDoneRef.current = null;
        /**
         * 返回项目列表时清掉一次性信号，避免残留。
         */
        setAutoEnterProjectId?.(null);
        setCurrentDatabaseId?.(null);
        /**
         * 返回项目列表时刷新当前页，展示最新项目。
         */
        fetchProjects(projPageInfo.current, projPageInfo.size, searchKey);
      }

      /**
       * 从项目页"登录数据库"进入时（autoEnterProjectId 被设置），自动进入该项目的数据源
       * 列表视图（带返回箭头），与直接访问后手动点进项目的表现一致。
       *
       * 进入时一并刷新项目列表（本地分页 fetchProjects）与数据源目录（reloadDatasourceList），
       * 加上 enterProject → loadProjectDatasources 刷新项目内数据源——即"全部刷新一遍"，
       * 避免外链首次进入时后端项目↔数据源关联尚未完全同步导致项目下数据源列表不完整、
       * 需手动刷新的问题。
       *
       * 即便已在该项目页签下（autoEnterProjectId 同值、setAutoEnterProjectId 短路），每次
       * 带 projectId 深链进入都会自增 autoEnterRequestId，本 effect 据此重新刷新，从而能
       * 显示新增的数据源。
       *
       * 注意：进入后**不清空** autoEnterProjectId。Container 依赖它保持 SelectPanel 打开
       * （不因 currentDatabaseId 切到主资源树）。仅在 backToProjectList 时才清空。
       * 用 autoEnterDoneRef 记录上次处理过的 (autoEnterProjectId, autoEnterRequestId)，
       * 避免重复刷新；只有当目标项目或请求序号真正变化时才刷新。
       */
      useEffect(() => {
        if (!autoEnterProjectId) {
          return;
        }
        /**
         * 仅当目标项目或进入请求序号变化时才处理，避免重复刷新。
         */
        if (
          autoEnterDoneRef.current?.projectId === autoEnterProjectId &&
          autoEnterDoneRef.current?.requestId === autoEnterRequestId
        ) {
          return;
        }
        /**
         * 项目列表已改为服务端分页，目标项目不一定在当前页，故用 getProject 单条查询
         * 取代原先的 projectList.find，避免深链目标项目不在首页时自动进入失败。
         */
        let cancelled = false;
        (async () => {
          const project = await getProject(autoEnterProjectId);
          if (cancelled || !project) {
            return;
          }
          /**
           * 全部刷新一遍：项目列表（本地分页）+ 数据源目录 +（enterProject 内）项目内数据源。
           */
          fetchProjects(projPageInfo.current, projPageInfo.size, searchKey);
          reloadDatasourceList?.();
          enterProject(project);
          autoEnterDoneRef.current = {
            projectId: autoEnterProjectId,
            requestId: autoEnterRequestId,
          };
        })();
        return () => {
          cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [autoEnterProjectId, autoEnterRequestId]);

      /**
       * 自动定位数据库：currentDatabaseId 被设置（或再次点击定位时 locateRequestId 自增）。
       * 找到目标数据库所属数据源节点，展开它，待子节点出现后高亮并滚动定位。
       * 仅由 currentDatabaseId / locateRequestId / treeData / view / selectedProject / loadedKeys
       * 驱动——**不依赖 expandedKeys**，否则用户手动收起数据源（expandedKeys 变化）会立刻被
       * 本 effect 重新展开，导致"收不起来"。收起后想重新展开，再次点击定位即可（locateRequestId
       * 自增驱动 effect 重跑）。
       */
      useEffect(() => {
        if (!currentDatabaseId || view !== 'datasourceList' || !treeData?.length) {
          return;
        }
        if (locateLocatingRef.current === currentDatabaseId) {
          /**
           * 该目标库正在异步定位中（已发起单次全量库请求），避免重复请求。
           */
          return;
        }
        /**
         * 在 treeData 中查找：哪个数据源节点下已有目标数据库子节点（loadData 已完成）。
         */
        let datasourceNode = null;
        for (const node of treeData) {
          if (node.children?.some((child) => child.key === currentDatabaseId)) {
            datasourceNode = node;
            break;
          }
        }
        if (datasourceNode) {
          /**
           * 数据库子节点已加载：确保数据源展开（收起后再次定位时重新展开）并滚动到目标库。
           * 通过 expandedKeysRef 读最新值（不把 expandedKeys 放进依赖，避免收起即被重展开）。
           */
          const keys = [...expandedKeysRef.current];
          if (!keys.includes(datasourceNode.key)) {
            keys.push(datasourceNode.key);
            setExpandedKeys(keys);
          }
          setTimeout(() => {
            /**
             * 本树未开启 virtual（未设 height/itemHeight），rc-tree 的 scrollTo 设置的是
             * 内部 holder 的 scrollTop，而实际滚动容器是外层 .list（overflow:auto），因此
             * scrollTo 无法把视口外的节点滚进可视区。这里改用原生 scrollIntoView 直接定位
             * 到目标 treenode DOM。selectedKeys 已设为 [currentDatabaseId]，故带
             * ant-tree-treenode-selected 的节点即目标库节点。
             */
            const nodeEl = treeContainerRef.current?.querySelector?.('.ant-tree-treenode-selected');
            if (nodeEl && typeof nodeEl.scrollIntoView === 'function') {
              nodeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
          }, 0);
        } else if (selectedProject?.id) {
          /**
           * 数据库子节点尚未加载：不再展开所有数据源（会对每个数据源发一次
           * /api/v2/database/databases 请求，N 个数据源就是 N 次扇出），而是用一次
           * listDatabases(projectId) 拉取整个项目的全部库，找到目标库所属数据源后只把
           * 该数据源的子节点填入并展开，把 N 次请求降为 1 次。
           *
           * 跨项目定位时（autoEnterProjectId 指向另一个项目），必须等 enterProject 把
           * selectedProject 切换到目标项目后再拉取——否则会用旧项目的 id 拉取，目标库不在
           * 其中，且 locateLocatingRef 会被错误地置位、阻塞后续重跑，表现为"要点两次定位"。
           * 这里通过校验 selectedProject.id 与目标项目一致才继续，不一致则直接 return（不置
           * locateLocatingRef），让 selectedProject 变化后 effect 自然重跑。
           */
          const targetProjectId = autoEnterProjectId || selectedProject.id;
          if (autoEnterProjectId && selectedProject.id !== autoEnterProjectId) {
            return;
          }
          locateLocatingRef.current = currentDatabaseId;
          (async () => {
            try {
              const res = await listDatabases(
                targetProjectId,
                null,
                1,
                99999,
                null,
                null,
                null,
                true,
                true,
              );
              const allDatabases = (res?.contents || []).filter((db) => db.existed);
              /**
               * 按数据源 id 分组，与 loadData 的 Datasource 分支构建子节点方式一致。
               */
              const groupByDatasource = new Map<number, IDatabase[]>();
              allDatabases.forEach((db) => {
                const dsId = db?.dataSource?.id;
                if (dsId == null) {
                  return;
                }
                const arr = groupByDatasource.get(dsId) || [];
                arr.push(db);
                groupByDatasource.set(dsId, arr);
              });
              const targetDb = allDatabases.find((db) => db.id === currentDatabaseId);
              const targetDsId = targetDb?.dataSource?.id;
              setTreeData((prev) =>
                prev.map((node) => {
                  if (node.type !== ResourceNodeType.Datasource || node.children?.length) {
                    return node;
                  }
                  const dsId = (node.data as IDatasource)?.id;
                  const dbs = dsId != null ? groupByDatasource.get(dsId) : undefined;
                  if (!dbs?.length) {
                    return node;
                  }
                  return {
                    ...node,
                    children: dbs.map((database: IDatabase) =>
                      DataBaseTreeData(undefined, database, database?.id, true, null),
                    ),
                  };
                }),
              );
              /**
               * 把已填好子节点的数据源标记为 loaded（避免再次展开时 rc-tree 重复触发
               * loadData），并展开目标数据源。直接用 setExpandedKeys 显式展开目标，不依赖
               * onLoad 间接设置（onLoad 内部用的 expandedKeys 闭包值在 entrySeq 变化后可能
               * 不准），确保首次定位即展开。
               */
              const newLoadedKeys = [
                ...loadedKeysRef.current,
                ...Array.from(groupByDatasource.keys()).map((dsId) => `ds-${dsId}`),
              ].filter((v, i, arr) => arr.indexOf(v) === i);
              const targetKey = targetDsId != null ? `ds-${targetDsId}` : null;
              if (targetKey) {
                const curKeys = [...expandedKeysRef.current];
                if (!curKeys.includes(targetKey)) {
                  curKeys.push(targetKey);
                }
                setExpandedKeys(curKeys);
              }
              onLoad?.(newLoadedKeys, {
                event: 'load',
                node: { key: targetKey } as any,
              });
            } catch (e) {
              /**
               * 单次全量拉取失败时降级：清空定位标记，让用户可手动展开数据源。
               */
            } finally {
              locateLocatingRef.current = null;
            }
          })();
        }
        /**
         * locateRequestId 让"再次点击定位同一个库"也能重新触发本 effect（此时各同值 setter
         * 都会短路，仅该序号变化）。
         */
      }, [currentDatabaseId, locateRequestId, treeData, view, selectedProject, autoEnterProjectId]);

      function deleteDataSource(name: string, id: number) {
        Modal.confirm({
          title: formatMessage(
            {
              id: 'odc.ResourceTree.Datasource.AreYouSureYouWant',
              defaultMessage: '确认删除数据源 {name}?',
            },
            { name },
          ),
          async onOk() {
            const isSuccess = await deleteConnection(id as any);
            if (isSuccess) {
              message.success(
                formatMessage({
                  id: 'odc.ResourceTree.Datasource.DeletedSuccessfully',
                  defaultMessage: '删除成功',
                }), //删除成功
              );
              if (context.selectDatasourceId === id) {
                context.setSelectDatasourceId(null);
              }
              context?.reloadDatasourceList();
              if (selectedProject?.id) {
                loadProjectDatasources(selectedProject.id);
              }
            }
          },
        });
      }

      /**
       * 项目列表直接映射当前页（projPage）。搜索已改为服务端（fetchProjects 带 name），
       * 这里不再做客户端过滤。
       */
      const projects: TreeDataNode[] = useMemo(() => {
        return projPage.map((item) => ({
          title: item.name,
          key: item.id,
          icon: <Icon component={ProjectSvg} />,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [projPage]);

      /**
       * 数据源列表视图下按 searchKey 过滤。
       */
      const filteredTreeData = useMemo(() => {
        if (view !== 'datasourceList' || !searchKey) {
          return treeData;
        }
        return treeData.filter((node) =>
          String(node.title ?? '')
            .toLowerCase()
            .includes(searchKey.toLowerCase()),
        );
      }, [treeData, searchKey, view]);

      /**
       * 不可变地更新 treeData 中单个节点（按 key 匹配）并重建其子树。
       * 然后从 session store 重建整棵树（与主 ResourceTree 每次渲染 IIFE 重建一致），
       * 使 loadNode 拉取的子节点（如 TableRoot 下的表列表、Table 下的列）也能反映，
       * 而不仅是 Database 节点的子节点。
       */
      function updateNode(
        key: string | number,
        updater: (node: ResourceTreeDataNode) => ResourceTreeDataNode,
      ) {
        setTreeData((prev) =>
          prev
            .map((node) => updateNodeRecursive(node, key, updater))
            .map((node) => rebuildNode(node, sessionManagerStore)),
        );
      }

      function updateNodeRecursive(
        node: ResourceTreeDataNode,
        key: string | number,
        updater: (node: ResourceTreeDataNode) => ResourceTreeDataNode,
      ): ResourceTreeDataNode {
        if (node.key === key) {
          return updater(node);
        }
        if (node.children?.length) {
          return {
            ...node,
            children: node.children.map((c) =>
              updateNodeRecursive(c as ResourceTreeDataNode, key, updater),
            ),
          };
        }
        return node;
      }

      /**
       * 项目内数据源树的懒加载器。
       * - 数据源节点：拉取数据库并作为子节点挂上。
       * - 数据库节点：创建/复用 session，然后重建子节点（表/视图/…）。
       * - 其它节点：委托共享的 loadNode helper，然后重建受影响节点。
       */
      async function loadData(treeNode: EventDataNode<any> & ResourceTreeDataNode) {
        const { type, data, key } = treeNode;
        try {
          switch (type) {
            case ResourceNodeType.Datasource: {
              const datasourceId = (data as IDatasource)?.id;
              /**
               * 改为分批加载：首页只拉 DS_DB_PAGE_SIZE 条；若还有更多页，在子节点末尾插入
               * "加载更多"哨兵，点击后追加下一页（见 loadMoreDatasourceDatabases）。
               */
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
              const databases = (res?.contents || []).filter((db) => db.existed);
              const totalPages = res?.page?.totalPages ?? (res?.contents?.length ? 1 : 0);
              dsDbPageInfoRef.current.set(datasourceId, {
                page: 1,
                size: DS_DB_PAGE_SIZE,
                totalPages,
              });
              const children: ResourceTreeDataNode[] = databases.map((database: IDatabase) =>
                DataBaseTreeData(undefined, database, database?.id, true, null),
              );
              if (1 < totalPages) {
                children.push(makeLoadMoreNode(LM_DS_PREFIX + datasourceId));
              }
              updateNode(key, (n) => ({
                ...n,
                children,
              }));
              break;
            }
            case ResourceNodeType.Database: {
              const dbId = (data as IDatabase).id;
              const dbSession =
                sessionManagerStore.sessionMap.get(treeNode.sessionId) ||
                (await sessionManagerStore.createSession(null, data?.id, true));
              if (!dbSession || dbSession === 'NotFound') {
                throw new Error("load database's session failed");
              }
              updateNode(key, (n) => ({
                ...n,
                sessionId: dbSession.sessionId,
                ...DataBaseTreeData(dbSession, data, dbId, true, null),
              }));
              break;
            }
            default: {
              await loadNode(sessionManagerStore, treeNode);
              /**
               * loadNode 将拉取的数据存入 session store。从最新 session 数据重建节点
               * （及其子树），使新子节点出现。
               */
              updateNode(key, (n) => ({ ...n }));
            }
          }
        } catch (e) {
          message.error(
            formatMessage({
              id: 'odc.ResourceTree.Datasource.FailedToLoad',
              defaultMessage: '加载失败',
            }),
          );
          throw e;
        }
      }

      const renderNode = (node: ResourceTreeDataNode): React.ReactNode => {
        const { type, sessionId } = node;
        if (type === ResourceNodeType.LoadMore) {
          const lmKey = String(node.key);
          const loading = loadMoreLoadingKeys.has(lmKey);
          return (
            <span
              className={styles.loadMore}
              onClick={(e) => {
                e.stopPropagation();
                handleLoadMore(lmKey);
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
        /**
         * 数据源行复用与数据源 SelectPanel 一致的渲染：连接 popover、环境徽标与行操作，
         * 使两个面板外观一致。
         */
        if (type === ResourceNodeType.Datasource) {
          const dataSource = node.data as IDatasource;
          return (
            <>
              <Popover
                showArrow={false}
                overlayClassName={styles.connectionPopover}
                placement="right"
                content={<ConnectionPopover connection={dataSource} />}
              >
                <div
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <Dropdown
                    trigger={login.isPrivateSpace() ? ['contextMenu'] : []}
                    menu={{
                      items: [
                        {
                          label: formatMessage({
                            id: 'odc.src.page.Workspace.SideBar.ResourceTree.SelectPanel.Datasource.Clone',
                            defaultMessage: '克隆',
                          }),
                          key: 'clone',
                          onClick: (e) => {
                            e.domEvent?.stopPropagation();
                            setCopyDatasourceId(dataSource.id);
                          },
                        },
                        {
                          label: formatMessage({
                            id: 'odc.ResourceTree.Datasource.Edit',
                            defaultMessage: '编辑',
                          }),
                          key: 'edit',
                          onClick: (e) => {
                            e.domEvent?.stopPropagation();
                            setEditDatasourceId(dataSource.id);
                            setAddDSVisiable(true);
                          },
                        },
                        {
                          label: formatMessage({
                            id: 'odc.ResourceTree.Datasource.Delete',
                            defaultMessage: '删除',
                          }),
                          key: 'delete',
                          onClick: (e) => {
                            e.domEvent?.stopPropagation();
                            deleteDataSource(node.title as string, dataSource.id);
                          },
                        },
                      ],
                    }}
                  >
                    <span className={styles.fullWidthTitle}>{node.title}</span>
                  </Dropdown>
                  <div
                    className={classNames(styles.envTip, {
                      [styles.envTipPersonal]: login.isPrivateSpace(),
                    })}
                  >
                    <Badge
                      color={EnvColorMap[dataSource?.environmentStyle?.toUpperCase()]?.tipColor}
                    />
                  </div>
                  {login.isPrivateSpace() && (
                    <div className={styles.actions}>
                      <Action.Group ellipsisIcon="vertical" size={0}>
                        <Action.Link
                          onClick={() => {
                            setCopyDatasourceId(dataSource.id);
                          }}
                          key={'clone'}
                        >
                          {formatMessage({
                            id: 'odc.src.page.Workspace.SideBar.ResourceTree.SelectPanel.Datasource.Clone.1',
                            defaultMessage: '克隆',
                          })}
                        </Action.Link>
                        <Action.Link
                          onClick={() => {
                            setEditDatasourceId(dataSource.id);
                            setAddDSVisiable(true);
                          }}
                          key={'edit'}
                        >
                          {formatMessage({
                            id: 'odc.ResourceTree.Datasource.Edit',
                            defaultMessage: '编辑',
                          })}
                        </Action.Link>
                        <Action.Link
                          onClick={() => deleteDataSource(node.title as string, dataSource.id)}
                          key={'delete'}
                        >
                          {formatMessage({
                            id: 'odc.ResourceTree.Datasource.Delete',
                            defaultMessage: '删除',
                          })}
                        </Action.Link>
                      </Action.Group>
                    </div>
                  )}
                </div>
              </Popover>
            </>
          );
        }
        const dbSession = sessionManagerStore.sessionMap.get(sessionId);
        return (
          <TreeNodeMenu
            showTip={false}
            node={node}
            dbSession={dbSession}
            type={type}
            databaseFrom={'project'}
            pollingDatabase={context.pollingDatabase}
          />
        );
      };

      /**
       * 项目列表视图
       */
      if (view === 'projectList') {
        return (
          <ResourceLayout
            top={
              <div className={styles.container}>
                <div className={styles.search}>
                  <Input.Search
                    allowClear
                    onSearch={(v) => {
                      /**
                       * 搜索改为服务端：重置到第一页并带 name 重新拉取。
                       */
                      setSearchKey(v);
                      fetchProjects(1, projPageInfo.size, v);
                    }}
                    placeholder={formatMessage({
                      id: 'odc.ResourceTree.Project.SearchForProjectName',
                      defaultMessage: '搜索项目名称',
                    })}
                    style={{ width: '100%' }}
                    size="small"
                  />
                </div>
                <div className={styles.list}>
                  <Spin spinning={projLoading}>
                    {projects?.length ? (
                      <Tree
                        showIcon
                        selectedKeys={selectKeys}
                        onSelect={(keys, info) => {
                          if (!info.selected) {
                            /**
                             * disable unselect
                             */
                            closeSelectPanel();
                            return;
                          }
                          const projectId = keys?.[0];
                          const project = projPage?.find((p) => p.id === projectId);
                          if (project) {
                            enterProject(project);
                          }
                        }}
                        selectable
                        multiple={false}
                        treeData={projects}
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Spin>
                </div>
                {projPageInfo.total > 0 && (
                  <div className={styles.pagination}>
                    <Pagination
                      size="small"
                      current={projPageInfo.current}
                      total={projPageInfo.total}
                      pageSize={projPageInfo.size}
                      showSizeChanger
                      pageSizeOptions={[10, 20, 50]}
                      onChange={(page, pageSize) => fetchProjects(page, pageSize, searchKey)}
                    />
                  </div>
                )}
              </div>
            }
            bottomLoading={false}
            bottom={null}
          />
        );
      }

      /**
       * 项目内数据源列表视图。
       * 每个数据源可展开显示其数据库与数据库对象。
       */
      return (
        <ResourceLayout
          top={
            <div className={styles.container}>
              <div className={styles.backTitle} onClick={backToProjectList}>
                <Icon component={LeftOutlined} className={styles.backIcon} />
                <span className={styles.backTitleText}>{selectedProject?.name}</span>
              </div>
              <div className={styles.search}>
                <Input.Search
                  allowClear
                  onSearch={(v) => {
                    setSearchKey(v);
                  }}
                  placeholder={formatMessage({
                    id: 'odc.ResourceTree.Datasource.SearchForDataSources',
                    defaultMessage: '搜索数据源',
                  })}
                  style={{ width: '100%' }}
                  size="small"
                />
              </div>
              <div className={styles.list}>
                <Spin spinning={dsLoading}>
                  {filteredTreeData?.length ? (
                    <div ref={treeContainerRef}>
                      <Tree
                        ref={treeRef}
                        className={styles.tree}
                        showIcon
                        expandAction="click"
                        treeData={filteredTreeData}
                        titleRender={renderNode}
                        loadData={loadData}
                        expandedKeys={expandedKeys}
                        loadedKeys={loadedKeys}
                        onExpand={onExpand}
                        onLoad={onLoad}
                        selectedKeys={currentDatabaseId ? [currentDatabaseId] : []}
                      />
                    </div>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Spin>
              </div>
              <NewDatasourceDrawer
                isEdit={!!editDatasourceId}
                visible={addDSVisiable}
                id={editDatasourceId}
                close={() => {
                  setEditDatasourceId(null);
                  setAddDSVisiable(false);
                }}
                onSuccess={() => {
                  context?.reloadDatasourceList();
                  if (selectedProject?.id) {
                    loadProjectDatasources(selectedProject.id);
                  }
                }}
              />

              <NewDatasourceDrawer
                isEdit={false}
                isCopy={true}
                id={copyDatasourceId}
                visible={!!copyDatasourceId}
                close={() => {
                  setCopyDatasourceId(null);
                }}
                onSuccess={() => {
                  context?.reloadDatasourceList();
                  if (selectedProject?.id) {
                    loadProjectDatasources(selectedProject.id);
                  }
                }}
              />
            </div>
          }
          bottomLoading={false}
          bottom={null}
        />
      );
    }),
  ),
);
