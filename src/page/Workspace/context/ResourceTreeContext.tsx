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
  projectList: IProject[];
  reloadProjectList?: () => void;
  currentDatabaseId?: number;
  setCurrentDatabaseId?: (v: number) => void;
  /**
   * 每次点击定位按钮时自增的请求序号。即使定位同一个库（currentDatabaseId 不变），
   * 该序号也会变化，从而驱动定位 effect 重新执行，实现"再次点击定位"时重新展开数据源
   * 并滚动到目标库。
   */
  locateRequestId?: number;
  setLocateRequestId?: (v: number) => void;
  databaseList: IDatabase[];
  reloadDatabaseList?: () => void;
  pollingDatabase?: () => void;
  /**
   * 一次性信号：从项目页"登录数据库"进入 SQL 窗口时设置，通知 SelectPanel 的 Project
   * 子组件自动进入该项目的数据源列表视图（带返回箭头），并让 Container 保持 SelectPanel
   * 打开。进入后由 Project 组件消费，返回项目列表时清空，避免重复触发。
   */
  autoEnterProjectId?: number;
  setAutoEnterProjectId?: (v: number) => void;
}

const ResourceTreeContext = React.createContext<IResourceTreeContext>({
  selectTabKey: ResourceTreeTab.datasource,
  selectProjectId: null,
  selectDatasourceId: null,
  datasourceList: [],
  projectList: [],
  databaseList: [],
});
export default ResourceTreeContext;
