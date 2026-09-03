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
import { DbObjectType } from '@/d.ts';
import Icon, { CloseCircleFilled, SearchOutlined } from '@ant-design/icons';
import { Input, Space } from 'antd';
import React, { useState } from 'react';
import styles from './index.less';
import { isMac } from '@/util/env';
import { SettingStore } from '@/store/setting';
import { inject, observer } from 'mobx-react';

interface IProps {
  onChange: (type: DbObjectType, value: string) => void;
  settingStore?: SettingStore;
}
const DatabaseSearch: React.FC<IProps> = function ({ onChange, settingStore }) {
  const [inputValue, setInputValue] = useState<string>(null);
  const getShortcut = () => {
    if (settingStore.configurations['odc.database.default.enableGlobalObjectSearch'] === 'false')
      return;
    let str = '';
    if (isMac()) {
      str = '⌘ + J';
    } else {
      str = 'Ctrl + J';
    }
    return <span style={{ color: 'var(--text-color-placeholder)', paddingRight: 4 }}>{str}</span>;
  };

  /**
   * 不再提供对象类型下拉选择：输入即直接在表、视图、函数等全部对象类型中筛选
   * （type 传 null，由 DataBaseTreeData 对所有类型子节点统一过滤），清空即恢复。
   */
  const handleInputChange = (value: string) => {
    setInputValue(value);
    onChange(null, value || null);
  };

  return (
    <Input
      style={{
        width: '100%',
        height: '28px',
      }}
      value={inputValue ?? ''}
      onChange={(e) => handleInputChange(e.target.value)}
      suffix={
        <Space size={4}>
          {inputValue ? (
            <Icon
              className={styles.closeIcon}
              component={CloseCircleFilled}
              onClick={(e) => {
                handleInputChange('');
                e.stopPropagation();
              }}
            />
          ) : null}
          {getShortcut()}
          <SearchOutlined />
        </Space>
      }
      size="small"
      placeholder={formatMessage({
        id: 'src.page.Workspace.SideBar.ResourceTree.DatabaseSearch.86200ED0',
        defaultMessage: '搜索',
      })}
    />
  );
};
export default inject('settingStore')(observer(DatabaseSearch));
