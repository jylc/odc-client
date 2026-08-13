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

import StatusIcon from '@/component/StatusIcon/DataSourceIcon';
import { IDatasource } from '@/d.ts/datasource';
import { formatMessage } from '@/util/intl';
import {
  ResourceNodeType,
  TreeDataNode as ResourceTreeDataNode,
} from '@/page/Workspace/SideBar/ResourceTree/type';

/**
 * 嵌套树分批加载的每页条数与"加载更多"哨兵节点 key 前缀。
 * - 项目内数据源列表：每页 50；
 * - 数据源下库列表：每页 100；
 * 哨兵节点 isLeaf=true，不会被 rc-tree 的 loadData 触发，仅通过 titleRender 点击拉取下一页。
 *
 * 由 SelectPanel/Project 与 DatabaseTree（主资源树懒加载模式）共用。
 */
export const PROJECT_DS_PAGE_SIZE = 50;
export const DS_DB_PAGE_SIZE = 100;
export const LM_PROJECT_PREFIX = 'lm-project-';
export const LM_DS_PREFIX = 'lm-ds-';

export function makeLoadMoreNode(key: string): ResourceTreeDataNode {
  return {
    key,
    title: formatMessage({
      id: 'odc.ResourceTree.LoadMore',
      defaultMessage: '加载更多',
    }),
    type: ResourceNodeType.LoadMore,
    isLeaf: true,
    selectable: false,
  };
}

export function datasourceToNode(item: IDatasource): ResourceTreeDataNode {
  return {
    title: item.name,
    key: `ds-${item.id}`,
    icon: <StatusIcon item={item} />,
    isLeaf: false,
    type: ResourceNodeType.Datasource,
    data: item,
  };
}
