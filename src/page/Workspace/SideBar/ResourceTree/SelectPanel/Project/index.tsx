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
import { forwardRef, useContext, useImperativeHandle, useMemo, useState } from 'react';
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
 * Recursively rebuild a node's subtree from the latest session data. This mirrors how the
 * main ResourceTree recomputes its whole treeData each render via an IIFE — without it,
 * children fetched by loadNode (e.g. table list) would never be reflected in the panel tree.
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
      const { projectList } = context;

      const [view, setView] = useState<View>('projectList');
      const [selectedProject, setSelectedProject] = useState<IProject>(null);
      const [datasources, setDatasources] = useState<IDatasource[]>([]);
      const [dsLoading, setDsLoading] = useState(false);
      /**
       * Bumped on every datasource list load (enter project / reload) so the tree state
       * (expandedKeys/loadedKeys) never leaks from a previous visit of the same project.
       */
      const [entrySeq, setEntrySeq] = useState(0);
      const [editDatasourceId, setEditDatasourceId] = useState(null);
      const [copyDatasourceId, setCopyDatasourceId] = useState<number>(null);
      const [addDSVisiable, setAddDSVisiable] = useState(false);

      const selectKeys = [context.selectProjectId].filter(Boolean);

      /**
       * The datasource tree is held in React state so that immutable updates trigger antd
       * Tree to re-process the field data. This avoids the rc-tree 5.x issue where the
       * `treeNode` passed to loadData is a shallow copy — mutating it has no effect on the
       * real treeData. After each load we rebuild the affected subtree from the session
       * store (same as the main ResourceTree's per-render IIFE rebuild).
       */
      const [treeData, setTreeData] = useState<ResourceTreeDataNode[]>([]);

      /**
       * Per-project stateId so expandedKeys/loadedKeys don't leak across projects when two
       * projects share datasource/database ids. The entrySeq suffix makes every visit (and
       * every reload) start from a fresh expanded/loaded state — otherwise the cached
       * loadedKeys from the previous visit still contains the datasource key and rc-tree
       * would skip loadData when the datasource is clicked again.
       */
      const stateId = selectedProject
        ? `project-ds-tree-${selectedProject.id}-${entrySeq}`
        : 'project-ds-tree';
      const { expandedKeys, loadedKeys, onExpand, onLoad } = useTreeState(stateId, {
        setCurrentDatabaseOnExpand: false,
      });

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
      }

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
       * The datasource list filtered by searchKey (for the datasource list view).
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
       * Update a single node (matched by key) within treeData immutably and rebuild its
       * subtree. Then rebuild the whole tree from the session store (same as the main
       * ResourceTree's per-render IIFE) so that children fetched by loadNode — e.g. the
       * table list under a TableRoot, or columns under a Table — are reflected, not only
       * children of Database nodes.
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
       * Lazy loader for the in-project datasource tree.
       * - Datasource node: fetch databases and attach them as children.
       * - Database node: create/reuse a session, then rebuild children (tables/views/...).
       * - Other nodes: delegate to the shared loadNode helper, then rebuild the affected node.
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
               * loadNode stores fetched data into the session store. Rebuild the node (and
               * its subtree) from the latest session data so the new children appear.
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
         * Datasource rows reuse the same rendering as the Datasource SelectPanel so the
         * two panels look consistent: connection popover, env badge and row actions.
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
                          }), //'克隆'
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
                          //编辑
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
                          //删除
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
                          {
                            formatMessage({
                              id: 'odc.src.page.Workspace.SideBar.ResourceTree.SelectPanel.Datasource.Clone.1',
                              defaultMessage:
                                '\n                                  克隆\n                                ',
                            }) /* 
                            克隆
                            */
                          }
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
       * Project list view
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
                    })} /*搜索项目名称*/
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
       * In-project datasource list view.
       * Each datasource expands inline to show its databases and database objects.
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
                  })} /*搜索数据源*/
                  style={{ width: '100%' }}
                  size="small"
                />
              </div>
              <div className={styles.list}>
                <Spin spinning={dsLoading}>
                  {filteredTreeData?.length ? (
                    <Tree
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
