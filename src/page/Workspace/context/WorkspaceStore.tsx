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

import { useCallback, useState } from 'react';
import { ActivityBarItemType } from '../ActivityBar/type';
import ActivityBarContext from './ActivityBarContext';
import ResourceTreeContext, { ResourceTreeTab } from './ResourceTreeContext';
import tracert from '@/util/tracert';
import { IDatasource } from '@/d.ts/datasource';
import { IProject } from '@/d.ts/project';
import login from '@/store/login';
import { useRequest } from 'ahooks';
import { getDataSourceGroupByProject } from '@/common/network/connection';
import { useParams } from '@umijs/max';
import { toInteger } from 'lodash';
import datasourceStatus from '@/store/datasourceStatus';
import { listDatabases } from '@/common/network/database';
import { IDatabase } from '@/d.ts/database';
import { DBObjectSyncStatus } from '@/d.ts/database';

export default function WorkspaceStore({ children }) {
  const [activityBarKey, setActivityBarKey] = useState(ActivityBarItemType.Database);
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const [selectTabKey, _setSelectTabKey] = useState<ResourceTreeTab>(ResourceTreeTab.datasource);
  const [currentDatabaseId, setCurrentDatabaseId] = useState<number>(null);
  const [locateRequestId, setLocateRequestId] = useState<number>(0);
  function setSelectTabKey(v: ResourceTreeTab) {
    tracert.click(
      v === ResourceTreeTab.datasource
        ? 'a3112.b41896.c330988.d367622'
        : 'a3112.b41896.c330988.d367621',
    );
    _setSelectTabKey(v);
  }

  const [selectProjectId, _setSelectProjectId] = useState<number>(null);
  const [selectDatasourceId, _setSelectDatasourceId] = useState<number>(
    datasourceId ? toInteger(datasourceId) : null,
  );
  const [datasourceList, setDatasourceList] = useState<IDatasource[]>([]);
  /**
   * 当前已进入的项目对象（display-only，仅用于展示项目名）。项目列表已改为服务端分页，
   * 由 SelectPanel/Project 本地拉取当前页，不再在 context 维护全量 projectList。
   */
  const [selectProject, setSelectProject] = useState<IProject>(null);
  const [databaseList, setDatabaseList] = useState<IDatabase[]>([]);
  /**
   * 从项目页"登录数据库"进入时设置，作为一次性信号通知 SelectPanel 自动进入该项目并
   * 保持 SelectPanel 打开（显示带返回箭头的项目内数据源视图）。进入后由 Project 组件清空。
   */
  const [autoEnterProjectId, setAutoEnterProjectId] = useState<number>(null);
  const [autoEnterRequestId, setAutoEnterRequestId] = useState<number>(0);

  function setSelectProjectId(v: number) {
    _setSelectProjectId(v);
    _setSelectDatasourceId(null);
  }

  function setSelectDatasourceId(v: number) {
    _setSelectProjectId(null);
    _setSelectDatasourceId(v);
  }

  const { loading: dsLoading, run: fetchDatasource } = useRequest(getDataSourceGroupByProject, {
    defaultParams: [login.isPrivateSpace()],
    manual: true,
  });

  const { run: fetchDatabases, loading: dbLoading } = useRequest(listDatabases, {
    manual: true,
  });

  const reloadDatasourceList = useCallback(async () => {
    const data = await fetchDatasource();
    setDatasourceList(data?.contents || []);
    datasourceStatus.asyncUpdateStatus(data?.contents?.map((a) => a.id));
  }, []);

  const reloadDatabaseList = useCallback(async () => {
    if (selectProjectId || selectDatasourceId) {
      const data = await fetchDatabases(
        selectProjectId,
        selectDatasourceId,
        1,
        99999,
        null,
        null,
        null,
        true,
        true,
      );
      setDatabaseList(data?.contents || []);
      return data?.contents;
    }
  }, [selectProjectId, selectDatasourceId]);

  const { run: pollingDatabase, cancel } = useRequest(
    async () => {
      const databaseList = await reloadDatabaseList();
      if (
        !databaseList?.find((item) =>
          [DBObjectSyncStatus.SYNCING, DBObjectSyncStatus.PENDING].includes(item.objectSyncStatus),
        )
      ) {
        cancel();
      }
    },
    {
      pollingInterval: 3000,
      pollingWhenHidden: false,
    },
  );

  return (
    <ResourceTreeContext.Provider
      value={{
        selectTabKey,
        setSelectTabKey,
        selectProjectId,
        selectDatasourceId,
        setSelectDatasourceId,
        setSelectProjectId,
        datasourceList,
        reloadDatasourceList,
        selectProject,
        setSelectProject,
        currentDatabaseId,
        setCurrentDatabaseId,
        locateRequestId,
        setLocateRequestId,
        databaseList,
        reloadDatabaseList,
        pollingDatabase,
        autoEnterProjectId,
        setAutoEnterProjectId,
        autoEnterRequestId,
        setAutoEnterRequestId,
      }}
    >
      <ActivityBarContext.Provider
        value={{
          activeKey: activityBarKey,
          setActiveKey: setActivityBarKey,
        }}
      >
        {children}
      </ActivityBarContext.Provider>
    </ResourceTreeContext.Provider>
  );
}
