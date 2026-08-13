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

import { UserStore } from '@/store/login';
import { inject, observer } from 'mobx-react';
import { useContext, useEffect, useRef, useState } from 'react';
import ResourceTreeContext from '../../context/ResourceTreeContext';
import tracert from '@/util/tracert';
import SelectPanel from './SelectPanel';
import { Spin } from 'antd';
import DatabaseTree from './DatabaseTree';
import TreeStateStore, { ITreeStateCache } from './TreeStateStore';
import { useParams } from '@umijs/max';
import { ModalStore } from '@/store/modal';

export default inject(
  'userStore',
  'modalStore',
)(
  observer(function ResourceTreeContainer({
    userStore,
    modalStore,
  }: {
    userStore: UserStore;
    modalStore: ModalStore;
  }) {
    const { tabKey, datasourceId } = useParams<{ tabKey: string; datasourceId: string }>();
    const [selectPanelOpen, setSelectPanelOpen] = useState<boolean>(!tabKey);
    const resourcetreeContext = useContext(ResourceTreeContext);
    const { selectProjectId, selectDatasourceId, currentDatabaseId, autoEnterProjectId } =
      resourcetreeContext;

    const cacheRef = useRef<ITreeStateCache>({});

    const [loading, setLoading] = useState(true);

    async function initData() {
      await resourcetreeContext.reloadDatasourceList();
      /**
       * 项目列表已改为服务端分页，由 SelectPanel/Project 挂载时按页拉取，不再在此全量加载。
       */
      setLoading(false);
    }

    const setSelectPanel = (open) => {
      setSelectPanelOpen(open);
      modalStore.changeDatabaseSearchModalVisible(false);
      modalStore.changeDatabaseSearchModalData(!open);
    };

    useEffect(() => {
      initData();
      tracert.expo('a3112.b41896.c330988');
    }, []);

    useEffect(() => {
      if (!selectDatasourceId && !selectProjectId) {
        setSelectPanel(true);
      } else {
        setSelectPanel(false);
      }
    }, [selectProjectId, selectDatasourceId]);

    useEffect(() => {
      /**
       * currentDatabaseId 有值时关闭 SelectPanel 切到主资源树；但当 autoEnterProjectId
       * 存在（从项目页"登录数据库"进入）时，需保持 SelectPanel 打开以显示项目内数据源视图，
       * 此时由 Project 树内部根据 currentDatabaseId 自动定位数据库。
       */
      if (currentDatabaseId && !autoEnterProjectId) {
        setSelectPanel(false);
      }
    }, [currentDatabaseId, autoEnterProjectId]);

    if (loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 20 }}>
          <Spin />
        </div>
      );
    }
    return (
      <TreeStateStore.Provider
        value={{
          cache: cacheRef?.current,
        }}
      >
        {selectPanelOpen ? (
          <SelectPanel onClose={() => setSelectPanel(false)} />
        ) : (
          <DatabaseTree openSelectPanel={() => setSelectPanel(true)} />
        )}
      </TreeStateStore.Provider>
    );
  }),
);
