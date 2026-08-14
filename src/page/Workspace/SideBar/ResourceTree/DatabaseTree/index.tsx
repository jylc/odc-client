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

import React, { useContext } from 'react';
import ResourceTree from '..';
import ResourceTreeContext from '@/page/Workspace/context/ResourceTreeContext';
import TreeTitle from './Title';

interface IProps {
  openSelectPanel?: () => void;
}

/**
 * 选中项目/数据源后显示的主资源树。
 *
 * 已改为懒加载：传入 `lazy`，由 ResourceTree 内部先分页拉数据源、展开数据源再分页懒加载库
 * （数据源模式则直接分页懒加载该数据源库），不再走"一次性全量 listDatabases(99999) 再分组"。
 * 故此处不再消费 context.databaseList / reloadDatabaseList。
 */
const DatabaseTree: React.FC<IProps> = function ({ openSelectPanel }) {
  const {
    selectDatasourceId,
    selectProjectId,
    selectProject,
    selectDatasource,
    setCurrentDatabaseId,
    pollingDatabase,
  } = useContext(ResourceTreeContext);

  function onTitleClick() {
    openSelectPanel();
    setCurrentDatabaseId(null);
  }

  function ProjectRender() {
    return (
      <ResourceTree
        lazy
        stateId={'project-' + selectProjectId}
        reloadDatabase={() => Promise.resolve()}
        databaseFrom={'project'}
        title={<TreeTitle project={selectProject} />}
        onTitleClick={onTitleClick}
        enableFilter
        showTip
        pollingDatabase={pollingDatabase}
      />
    );
  }
  function DatasourceRender() {
    return (
      <ResourceTree
        lazy
        stateId={'datasource-' + selectDatasourceId}
        reloadDatabase={() => Promise.resolve()}
        databaseFrom={'datasource'}
        title={<TreeTitle datasource={selectDatasource} />}
        onTitleClick={onTitleClick}
        pollingDatabase={pollingDatabase}
      />
    );
  }
  return selectDatasourceId ? DatasourceRender() : ProjectRender();
};

export default DatabaseTree;
