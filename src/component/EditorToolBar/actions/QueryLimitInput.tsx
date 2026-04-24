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

import InputBigNumber from '@/component/InputBigNumber';
import SQLConfigContext from '@/component/SQLConfig/SQLConfigContext';
import { formatMessage } from '@/util/intl';
import { Tooltip } from 'antd';
import React, { useContext, useEffect, useState } from 'react';

const QueryLimitInput: React.FC = () => {
  const { session } = useContext(SQLConfigContext);
  const [queryLimitValue, setQueryLimitValue] = useState<number>(undefined);

  const queryLimit = session?.params?.queryLimit;

  useEffect(() => {
    setQueryLimitValue(queryLimit);
  }, [queryLimit]);

  if (!session) {
    return null;
  }

  const handleBlur = async () => {
    const maxQueryLimit = session?.params?.maxQueryLimit;
    if (maxQueryLimit !== Number.MAX_SAFE_INTEGER && !queryLimitValue) {
      setQueryLimitValue(session?.params.queryLimit);
      return;
    }
    if (queryLimitValue > maxQueryLimit) {
      setQueryLimitValue(session?.params.queryLimit);
    } else {
      await session.setQueryLimit(queryLimitValue);
    }
  };

  return (
    <Tooltip
      title={formatMessage({
        id: 'odc.component.SQLConfig.QueryResultLimits',
        defaultMessage: '查询结果限制',
      })}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginLeft: 8,
          padding: '5px',
          color: 'var(--text-color-primary)',
          fontSize: 12,
        }}
      >
        <InputBigNumber
          value={queryLimitValue}
          min="1"
          style={{
            width: 80,
            height: 24,
          }}
          placeholder={formatMessage({
            id: 'odc.component.SQLConfig.Unlimited',
            defaultMessage: '无限制',
          })}
          onChange={(v) => {
            setQueryLimitValue(parseInt(v) || undefined);
          }}
          onBlur={handleBlur}
        />
      </div>
    </Tooltip>
  );
};

export default QueryLimitInput;
