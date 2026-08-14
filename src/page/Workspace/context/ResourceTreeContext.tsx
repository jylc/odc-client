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

import { IDatasource } from '@/d.ts/datasource';
import { IProject } from '@/d.ts/project';
import React from 'react';

export enum ResourceTreeTab {
  datasource = 'datasource',
  project = 'project',
}
interface IResourceTreeContext {
  selectTabKey: ResourceTreeTab;
  setSelectTabKey?: (v: ResourceTreeTab) => void;
  selectProjectId: number;
  setSelectProjectId?: (v: number) => void;
  selectDatasourceId: number;
  setSelectDatasourceId?: (v: number) => void;
  datasourceList: IDatasource[];
  reloadDatasourceList?: () => void;
  /**
   * 当前已进入的项目对象（仅用于展示项目名，display-only，不影响 selectProjectId / 面板开合）。
   * 项目列表已改为服务端分页本地拉取，不再在 context 维护全量 projectList，因此需要进入
   * 项目时由调用方把项目对象传入，供 DatabaseTree 标题、DatabaseSearchModal 等展示项目名。
   */
  selectProject?: IProject;
  setSelectProject?: (v: IProject | null) => void;
  /**
   * 当前已进入的数据源对象（display-only，仅供 DatabaseTree 标题、DatabaseSearchModal
   * 展示数据源名等）。优先取自 datasourceList；团队空间已隐藏数据源页签、不再全量拉取
   * 列表，列表缺失时由 WorkspaceStore 按 id 单条查询兜底（getConnectionDetail）。
   */
  selectDatasource?: IDatasource;
  currentDatabaseId?: number;
  setCurrentDatabaseId?: (v: number) => void;
  /**
   * 每次点击定位按钮时自增的请求序号。即使定位同一个库（currentDatabaseId 不变），
   * 该序号也会变化，从而驱动定位 effect 重新执行，实现"再次点击定位"时重新展开数据源
   * 并滚动到目标库。
   */
  locateRequestId?: number;
  setLocateRequestId?: (v: number) => void;
  /**
   * 主资源树已改为按数据源懒加载分页，不再在 context 维护全量 databaseList/reloadDatabaseList。
   * 各树自行按页拉取；同步状态由 SyncMetadata 按已加载库聚合（降级）。
   */
  pollingDatabase?: () => void;
  /**
   * 一次性信号：从项目页"登录数据库"进入 SQL 窗口时设置，通知 SelectPanel 的 Project
   * 子组件自动进入该项目的数据源列表视图（带返回箭头），并让 Container 保持 SelectPanel
   * 打开。进入后由 Project 组件消费，返回项目列表时清空，避免重复触发。
   */
  autoEnterProjectId?: number;
  setAutoEnterProjectId?: (v: number) => void;
  /**
   * 每次带 projectId 深链进入时自增的请求序号。即便目标项目 id 不变（已在该项目页签下、
   * setAutoEnterProjectId 同值短路），该序号也会变化，驱动 Project 组件的 autoEnterProjectId
   * effect 重新执行并刷新项目内数据源，保证"已打开项目页签下也能刷新出新增数据源"。
   */
  autoEnterRequestId?: number;
  setAutoEnterRequestId?: (v: number) => void;
}

const ResourceTreeContext = React.createContext<IResourceTreeContext>({
  selectTabKey: ResourceTreeTab.datasource,
  selectProjectId: null,
  selectDatasourceId: null,
  datasourceList: [],
  selectProject: null,
  selectDatasource: null,
});
export default ResourceTreeContext;
