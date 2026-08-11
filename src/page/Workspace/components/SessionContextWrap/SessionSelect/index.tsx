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

import { formatMessage } from '@/util/intl';
import React, { useContext, useEffect } from 'react';
import SessionContext from '../context';

import ConnectionPopover from '@/component/ConnectionPopover';
import Icon, {
  AimOutlined,
  DownOutlined,
  LoadingOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from '@ant-design/icons';
import { Divider, Popover, Space, Spin } from 'antd';
import styles from './index.less';

import { ConnectionMode } from '@/d.ts';
import classNames from 'classnames';
import tracert from '@/util/tracert';
import { getDataSourceStyleByConnectType } from '@/common/datasource';
import SessionDropdown from './SessionDropdown';
import RiskLevelLabel from '@/component/RiskLevelLabel';
import { EnvColorMap } from '@/constant';
import login from '@/store/login';
import ResourceTreeContext, { ResourceTreeTab } from '@/page/Workspace/context/ResourceTreeContext';
import ActivityBarContext from '@/page/Workspace/context/ActivityBarContext';
import { ActivityBarItemType } from '@/page/Workspace/ActivityBar/type';
import { IDataSourceModeConfig } from '@/common/datasource/interface';

export default function SessionSelect({
  readonly,
  feature,
  collapsible,
  collapsed,
  onToggleCollapse,
}: {
  readonly?: boolean;
  dialectTypes?: ConnectionMode[];
  feature?: keyof IDataSourceModeConfig['features'];
  /**
   * 是否显示折叠图标（左侧）。仅在有内嵌对象树的编辑器（如 SQL 窗口）启用。
   */
  collapsible?: boolean;
  /**
   * 当前是否折叠（对象树隐藏）。true 时显示右箭头，false 时显示左箭头。
   */
  collapsed?: boolean;
  /**
   * 点击折叠图标时的回调。
   */
  onToggleCollapse?: () => void;
}) {
  const context = useContext(SessionContext);
  const resourceTreeContext = useContext(ResourceTreeContext);
  const activityContext = useContext(ActivityBarContext);
  useEffect(() => {
    tracert.expo('a3112.b41896.c330994');
  }, []);

  function focusDataBase(e: React.MouseEvent) {
    const datasourceId = context?.session?.odcDatabase?.dataSource?.id;
    const databaseId = context?.session?.odcDatabase?.id;
    const projectId = context?.session?.odcDatabase?.project?.id;
    const fromDataSource = context.datasourceMode;
    activityContext.setActiveKey(ActivityBarItemType.Database);
    /**
     * 项目模式（非独立数据源模式）且数据库归属某个项目时，在"项目"页签的项目内数据源
     * 视图中定位数据库；否则在"数据源"页签的独立数据源目录下定位。
     * autoEnterProjectId 作为一次性信号通知 SelectPanel 的 Project 组件进入该项目并保持
     * SelectPanel 打开，由其内部根据 currentDatabaseId 定位数据库。
     */
    if (!fromDataSource && projectId) {
      resourceTreeContext.setSelectTabKey?.(ResourceTreeTab.project);
      /**
       * 清掉残留的数据源/项目选择，确保 Container 重新打开 SelectPanel（autoEnterProjectId
       * 保持其打开），避免之前进入过数据源目录导致面板被关闭。
       */
      resourceTreeContext.setSelectDatasourceId?.(null);
      resourceTreeContext.setSelectProjectId?.(null);
      resourceTreeContext.setAutoEnterProjectId?.(projectId);
    } else {
      resourceTreeContext.setSelectDatasourceId(datasourceId);
    }
    resourceTreeContext.setCurrentDatabaseId(databaseId);
    /**
     * 每次点击定位都自增请求序号。即使定位同一个库（currentDatabaseId 不变、各 setter
     * 因同值短路），该序号也会变化，驱动定位 effect 重新执行——这样"展开后收起再点定位"
     * 才能重新展开目标数据源。
     */
    resourceTreeContext.setLocateRequestId?.(
      (resourceTreeContext.locateRequestId || 0) + 1,
    );
    e.stopPropagation();
    e.preventDefault();
  }

  function renderEnv() {
    if (!context?.session?.odcDatabase?.environment?.name) {
      return null;
    }
    return (
      <div className={styles.tag}>
        <RiskLevelLabel
          color={context?.session?.odcDatabase?.environment?.style}
          content={context?.session?.odcDatabase?.environment?.name}
        />
      </div>
    );
  }
  function renderSessionInfo() {
    const fromDataSource = context.datasourceMode;

    const dsStyle = getDataSourceStyleByConnectType(context?.session?.connection?.type);
    const databaseItem = (
      <Popover
        overlayClassName={styles.pop}
        placement="bottomLeft"
        content={<ConnectionPopover connection={context?.session?.connection} />}
      >
        {fromDataSource ? (
          <Space style={{ lineHeight: '22px' }} className={styles.link} size={4}>
            <Icon
              component={dsStyle?.icon?.component}
              style={{ fontSize: 16, verticalAlign: 'middle', color: dsStyle?.icon?.color }}
            />

            <span style={{ lineHeight: 1 }}>{context?.session?.connection?.name}</span>
            <DownOutlined />
          </Space>
        ) : (
          <Space style={{ lineHeight: '22px' }} className={styles.link} size={4}>
            <Icon
              component={dsStyle?.dbIcon?.component}
              style={{ fontSize: 16, verticalAlign: 'middle' }}
            />

            <span style={{ lineHeight: 1 }}>{context?.session?.odcDatabase?.name}</span>
            <DownOutlined />
          </Space>
        )}
      </Popover>
    );
    const aimItem = <AimOutlined className={styles.aim} onClick={focusDataBase} />;
    const datasourceAndProjectItem = !fromDataSource ? (
      <Space
        size={1}
        split={<Divider type="vertical" />}
        style={{ color: 'var(--text-color-hint)' }}
      >
        {login.isPrivateSpace() ? null : (
          <span>
            {formatMessage({
              id: 'src.page.Workspace.components.SessionContextWrap.SessionSelect.38EA55F4' /*项目：*/,
            })}
            {context?.session?.odcDatabase?.project?.name}
          </span>
        )}

        <span>
          {formatMessage({
            id: 'src.page.Workspace.components.SessionContextWrap.SessionSelect.CD007EC1' /*数据源：*/,
          })}
          {context?.session?.odcDatabase?.dataSource?.name}
        </span>
      </Space>
    ) : null;

    if (readonly) {
      return (
        <>
          {renderEnv()}
          <div className={classNames(styles.readonly)}>
            {databaseItem}
            {datasourceAndProjectItem}
          </div>
        </>
      );
    }
    return (
      <div className={styles.content}>
        {collapsible ? (
          <span
            className={styles.collapseIcon}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.();
            }}
            title={formatMessage({
              id: 'odc.component.SessionSelect.collapseObjectTree',
              defaultMessage: collapsed ? '显示对象树' : '隐藏对象树',
            })}
          >
            {collapsed ? <StepForwardOutlined /> : <StepBackwardOutlined />}
          </span>
        ) : null}
        {renderEnv()}
        <SessionDropdown filters={{ feature }}>
          <div>{databaseItem}</div>
        </SessionDropdown>
        <div>{aimItem}</div>
        <div>{datasourceAndProjectItem}</div>
      </div>
    );
  }

  return (
    <>
      {!context?.databaseId && !context?.datasourceId ? (
        <div
          style={{
            background:
              EnvColorMap[context?.session?.odcDatabase?.environment?.style]?.lineBackground,
          }}
          className={styles.line}
        >
          <SessionDropdown>
            <a>
              {
                formatMessage({
                  id: 'odc.SessionContextWrap.SessionSelect.SelectADatabase',
                }) /*请选择数据库*/
              }
            </a>
          </SessionDropdown>
        </div>
      ) : (
        <div
          style={{
            background:
              EnvColorMap[context?.session?.odcDatabase?.environment?.style]?.lineBackground,
          }}
          className={styles.line}
        >
          {context?.session ? (
            renderSessionInfo()
          ) : (
            <Spin
              style={{ marginLeft: 20 }}
              spinning={true}
              indicator={<LoadingOutlined style={{ fontSize: 18 }} spin />}
            />
          )}
        </div>
      )}
    </>
  );
}
