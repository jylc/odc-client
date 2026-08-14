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

import React, { useContext, useEffect, useRef, useState } from 'react';
import SideTabs, { ITab } from '../../components/SideTabs';
import ResourceTreeContext from '@/page/Workspace/context/ResourceTreeContext';
import { formatMessage } from '@/util/intl';
import DataSourceTree from './Datasource';
import ProjectTree from './Project';
import { inject, observer } from 'mobx-react';
import Icon, { CloseOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { UserStore } from '@/store/login';
import styles from './index.less';
import classNames from 'classnames';
import DatasourceFilter from '../DatasourceFilter';
import { ConnectType } from '@/d.ts';
import Reload from '@/component/Button/Reload';
import { Tooltip } from 'antd';
interface IProps {
  userStore?: UserStore;
  onClose: () => void;
}
enum PanelType {
  DataSource = 'datasource',
  Project = 'project',
}
const SelectPanel: React.FC<IProps> = function ({ userStore, onClose }) {
  const resourcetreeContext = useContext(ResourceTreeContext);
  const { selectProjectId, selectDatasourceId } = resourcetreeContext;
  const isPersonal = userStore?.isPrivateSpace();
  /**
   * 团队空间已隐藏"数据源"页签（其数据源目录接口 /stats 无分页、只能全量拉取），SelectPanel
   * 仅保留"项目"页签，数据源一律经项目内列表（分页懒加载）访问；个人空间仅有"数据源"页签。
   */
  const [selectPanel, setSelectPanel] = useState<PanelType>(
    isPersonal ? PanelType.DataSource : PanelType.Project,
  );
  const [envs, setEnvs] = useState<number[]>([]);
  const [connectTypes, setConnectTypes] = useState<ConnectType[]>([]);
  const sourceRef = useRef<any>();
  const projectRef = useRef<any>();
  const datasource: ITab = {
    title: formatMessage({
      id: 'odc.SideBar.ResourceTree.Container.DataSource',
    }),
    //数据源
    key: PanelType.DataSource,
    render() {
      return (
        <DataSourceTree
          closeSelectPanel={onClose}
          filters={{
            envs,
            connectTypes,
          }}
          ref={sourceRef}
        />
      );
    },
    groupSize: 3,
    actions: [
      {
        render() {
          return (
            <DatasourceFilter
              key="SelectPanelDatasourceFilter"
              iconStyle={{
                verticalAlign: 'text-top',
              }}
              onClear={() => {
                setEnvs([]);
                setConnectTypes([]);
              }}
              onEnvsChange={(v) => setEnvs(v)}
              onTypesChange={(v) => setConnectTypes(v)}
              envs={envs}
              types={connectTypes}
            />
          );
        },
      },
      {
        render() {
          return (
            <Reload
              key="DataSourceReload"
              onClick={async () => {
                return await sourceRef.current?.reload?.();
              }}
            />
          );
        },
      },
    ].filter(Boolean),
  };
  const project: ITab = {
    title: formatMessage({
      id: 'odc.SideBar.ResourceTree.Container.Project',
    }),
    //项目
    key: PanelType.Project,
    render() {
      return <ProjectTree closeSelectPanel={onClose} ref={projectRef} />;
    },
    actions: [
      {
        render() {
          return (
            <Reload
              key="ProjectReload"
              onClick={async () => {
                return await projectRef.current?.reload?.();
              }}
            />
          );
        },
      },
    ],
  };
  useEffect(() => {
    setSelectPanel(isPersonal ? PanelType.DataSource : PanelType.Project);
  }, [isPersonal]);
  const isSelected = selectDatasourceId || selectProjectId;
  return (
    <>
      <SideTabs
        key="SelectPanelSideTabs"
        selectTabKey={selectPanel}
        setSelectTabKey={(v) => {
          setSelectPanel(v as PanelType);
        }}
        tabs={isPersonal ? [datasource] : [project]}
        leftAction={
          !isSelected ? null : (
            <Icon
              component={CloseOutlined}
              className={classNames(styles.closeBtn, {
                [styles.closeBtnDisable]: !isSelected,
              })}
              onClick={!isSelected ? null : () => onClose()}
            />
          )
        }
      />
    </>
  );
};
export default inject('userStore')(observer(SelectPanel));
