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
  Popover,
  Spin,
  Tree,
  TreeDataNode,
} from 'antd';
import classNames from 'classnames';
import { EventDataNode } from 'antd/lib/tree';
import { inject, observer } from 'mobx-react';
import { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ResourceLayout from '../../Layout';
import styles from './index.less';
import { ReactComponent as ProjectSvg } from '@/svgr/project_space.svg';

type View = 'projectList' | 'datasourceList';

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
        projectList,
        autoEnterProjectId,
        setAutoEnterProjectId,
        currentDatabaseId,
        setCurrentDatabaseId,
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

      const selectKeys = [context.selectProjectId].filter(Boolean);

      /**
       * 数据源树保存在 React state 中，使不可变更新能触发 antd Tree 重新处理 field 数据。
       * 这规避了 rc-tree 5.x 中传给 loadData 的 treeNode 是浅拷贝、直接修改它对真实
       * treeData 无效的问题。每次加载后从 session store 重建受影响子树（与主 ResourceTree
       * 每次渲染 IIFE 重建一致）。
       */
      const [treeData, setTreeData] = useState<ResourceTreeDataNode[]>([]);

      /**
       * 每项目独立 stateId，避免两个项目共享数据源/数据库 id 时 expandedKeys/loadedKeys 串。
       * entrySeq 后缀使每次访问（及每次刷新）都从全新的展开/加载状态开始——否则上次访问缓存的
       * loadedKeys 仍含数据源 key，rc-tree 在再次点击数据源时会跳过 loadData。
       */
      const stateId = selectedProject
        ? `project-ds-tree-${selectedProject.id}-${entrySeq}`
        : 'project-ds-tree';
      const { expandedKeys, loadedKeys, onExpand, onLoad, setExpandedKeys } = useTreeState(stateId, {
        setCurrentDatabaseOnExpand: false,
      });

      /**
       * 数据库自动定位用的 ref：treeRef 用于 scrollTo，locatedDatabaseIdRef 避免重复定位。
       */
      const treeRef = useRef(null);
      const locatedDatabaseIdRef = useRef<number>(null);

      useImperativeHandle(
        ref,
        () => {
          return {
            reload() {
              if (view === 'datasourceList' && selectedProject?.id) {
                return loadProjectDatasources(selectedProject.id);
              }
              return context.reloadProjectList();
            },
          };
        },
        [view, selectedProject, context],
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
          const data = await getConnectionList({ projectId, page: 1, size: 99999 });
          const contents = data?.contents || [];
          setDatasources(contents);
          dataSourceStatusStore?.asyncUpdateStatus(contents?.map((a) => a.id));
          setTreeData(
            contents.map((item) => ({
              title: item.name,
              key: `ds-${item.id}`,
              icon: <StatusIcon item={item} />,
              isLeaf: false,
              type: ResourceNodeType.Datasource,
              data: item,
            })),
          );
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

      function enterProject(project: IProject) {
        setSelectedProject(project);
        setDatasources([]);
        setTreeData([]);
        setView('datasourceList');
        loadProjectDatasources(project.id);
      }

      function backToProjectList() {
        setView('projectList');
        setSelectedProject(null);
        setDatasources([]);
        setTreeData([]);
        locatedDatabaseIdRef.current = null;
        /**
         * 返回项目列表时清掉一次性信号与定位标记，避免残留。
         */
        setAutoEnterProjectId?.(null);
        setCurrentDatabaseId?.(null);
      }

      /**
       * 从项目页"登录数据库"进入时（autoEnterProjectId 被设置），自动进入该项目的数据源
       * 列表视图（带返回箭头），与直接访问后手动点进项目的表现一致。
       *
       * 注意：进入后**不清空** autoEnterProjectId。Container 依赖它保持 SelectPanel 打开
       * （不因 currentDatabaseId 切到主资源树）。仅在 backToProjectList 时才清空。
       * 重复触发由 view !== 'projectList' 守卫避免。
       */
      useEffect(() => {
        if (!autoEnterProjectId || view !== 'projectList' || !projectList?.length) {
          return;
        }
        const project = projectList.find((p) => p.id === autoEnterProjectId);
        if (project) {
          enterProject(project);
        }
      }, [autoEnterProjectId, projectList, view]);

      /**
       * 自动定位数据库：从项目页"登录数据库"进入时，currentDatabaseId 被设置。
       * 在数据源列表加载后，找到目标数据库所属的数据源节点（含该 databaseId 子节点），
       * 展开该数据源（触发 loadData 加载数据库列表），待子节点出现后高亮并滚动定位。
       */
      useEffect(() => {
        if (!currentDatabaseId || view !== 'datasourceList' || !treeData?.length) {
          return;
        }
        if (locatedDatabaseIdRef.current === currentDatabaseId) {
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
           * 数据库子节点已加载：展开数据源（确保可见）并高亮目标数据库。
           */
          locatedDatabaseIdRef.current = currentDatabaseId;
          const keys = [...expandedKeys];
          if (!keys.includes(datasourceNode.key)) {
            keys.push(datasourceNode.key);
          }
          setExpandedKeys(keys);
          setTimeout(() => {
            treeRef?.current?.scrollTo({ key: currentDatabaseId });
          }, 0);
        } else {
          /**
           * 数据库子节点尚未加载：展开可能包含该库的数据源节点，触发 loadData。
           * 这里展开所有尚未加载的数据源（数据源数量通常很少），让 rc-tree 触发 loadData
           * 加载数据库列表，下一次 treeData 更新时本 effect 会重新执行并定位。
           */
          const keys = [...expandedKeys];
          let changed = false;
          treeData.forEach((node) => {
            if (
              node.type === ResourceNodeType.Datasource &&
              !node.children?.length &&
              !keys.includes(node.key)
            ) {
              keys.push(node.key);
              changed = true;
            }
          });
          if (changed) {
            setExpandedKeys(keys);
          }
        }
      }, [currentDatabaseId, treeData, view, expandedKeys]);

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

      const projects: TreeDataNode[] = useMemo(() => {
        return projectList
          ?.map((item) => {
            if (
              view === 'projectList' &&
              searchKey &&
              !item.name?.toLowerCase()?.includes(searchKey?.toLowerCase())
            ) {
              return null;
            }
            return {
              title: item.name,
              key: item.id,
              icon: <Icon component={ProjectSvg} />,
            };
          })
          .filter(Boolean);
      }, [projectList, searchKey, view]);

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
              const res = await listDatabases(
                null,
                datasourceId,
                1,
                99999,
                null,
                null,
                null,
                true,
                true,
              );
              const databases = (res?.contents || []).filter((db) => db.existed);
              updateNode(key, (n) => ({
                ...n,
                children: databases.map((database: IDatabase) =>
                  DataBaseTreeData(undefined, database, database?.id, true, null),
                ),
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
                          onClick={() =>
                            deleteDataSource(node.title as string, dataSource.id)
                          }
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
                      setSearchKey(v);
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
                        const project = projectList?.find((p) => p.id === projectId);
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
                </div>
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
