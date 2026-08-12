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

import { IConnection, IConnectionStatus } from '@/d.ts';
import { Tooltip } from 'antd';
import Icon, { Loading3QuartersOutlined, MinusCircleFilled } from '@ant-design/icons';
import { formatMessage } from '@/util/intl';

import { getDataSourceStyleByConnectType } from '@/common/datasource';
import datasourceStatus from '@/store/datasourceStatus';
import { observer } from 'mobx-react';

/**
 * 用 observer 包裹：StatusIcon 直接读取 datasourceStatus.statusMap（MobX observable）。
 * 若不是 observer，元素创建后即便 statusMap 异步更新（如 batchTest 完成把状态从
 * INACTIVE/未知 变为 ACTIVE），本组件也不会重渲染，图标会一直停留在创建时的灰色态，
 * 直到父组件因别的原因重渲染并重建本元素。observer 让它在 statusMap 变化时自动刷新。
 */
const StatusIcon = observer(function StatusIcon({ item }: { item: IConnection }) {
  const statusInfo = datasourceStatus.statusMap.get(item.id) || item.status;
  let status = statusInfo?.status;
  const icon = getDataSourceStyleByConnectType(item.type)?.icon;
  switch (status) {
    case IConnectionStatus.TESTING: {
      return (
        <Tooltip
          placement="top"
          title={formatMessage({
            id: 'odc.components.ConnectionCardList.StatusSynchronizationInProgress',
          })}
        >
          <Loading3QuartersOutlined
            spin
            style={{
              color: '#1890FF',
            }}
          />
        </Tooltip>
      );
    }
    case IConnectionStatus.ACTIVE: {
      return (
        <Tooltip
          placement="top"
          title={formatMessage({
            id: 'odc.components.ConnectionCardList.ValidConnection',
          })}
        >
          <Icon component={icon.component} style={{ fontSize: 16, color: icon?.color }} />
        </Tooltip>
      );
    }
    case IConnectionStatus.NOPASSWORD: {
      return (
        <Tooltip
          placement="top"
          title={
            formatMessage({
              id: 'odc.components.ConnectionCardList.TheConnectionPasswordIsNot',
            })

            // 连接密码未保存，无法获取状态
          }
        >
          <MinusCircleFilled />
        </Tooltip>
      );
    }
    case IConnectionStatus.DISABLED: {
      return (
        <Tooltip
          placement="top"
          title={formatMessage({
            id: 'odc.page.ConnectionList.columns.TheConnectionIsDisabled',
          })}

          /* 连接已停用 */
        >
          <MinusCircleFilled />
        </Tooltip>
      );
    }
    case IConnectionStatus.INACTIVE:
    default: {
      return (
        <Tooltip title={statusInfo?.errorMessage} placement="top">
          <Icon
            component={icon?.component}
            style={{ fontSize: 16, filter: 'grayscale(1)', color: icon?.color }}
          />
        </Tooltip>
      );
    }
  }
});

export default StatusIcon;
