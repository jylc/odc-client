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

import { TreeProps } from 'antd';
import { useContext, useState } from 'react';
import TreeStateStore from './TreeStateStore';
import { TreeDataNode } from './type';
import { EventDataNode } from 'antd/lib/tree';
import sessionManager from '@/store/sessionManager';
import ResourceTreeContext from '../../context/ResourceTreeContext';

interface IUseTreeStateOptions {
  /**
   * 展开节点时是否同步当前数据库 id。
   * 主资源树需要它来高亮/联动数据库；SelectPanel 内渲染的树应禁用，避免展开数据库
   * 节点时关闭面板/跳走。
   */
  setCurrentDatabaseOnExpand?: boolean;
}

export default function useTreeState(id: string, options?: IUseTreeStateOptions) {
  const { cache } = useContext(TreeStateStore);
  const treeContext = useContext(ResourceTreeContext);
  const { setCurrentDatabaseOnExpand = true } = options || {};
  let state: {
    sessionIds: Record<number, string>;
    expandedKeys: (string | number)[];
    loadedKeys: (string | number)[];
  } = cache[id];
  if (!state) {
    cache[id] = state = {
      expandedKeys: [],
      loadedKeys: [],
      sessionIds: {},
    };
  }
  const [expandedKeys, setExpandedKeys] = useState<(string | number)[]>(state.expandedKeys);
  const [loadedKeys, setLoadedKeys] = useState<(string | number)[]>(state.loadedKeys);
  /**
   * 同一组件实例可能在不同 id 间切换（如 SelectPanel 的 ProjectTree 实例在用户进入不同
   * 项目时复用）。useState 只初始化一次，因此当 id 变化时需把本地 keys 重置为新 id 的缓存，
   * 否则上一个 id 残留的 expanded/loaded keys 会泄漏进新树，导致点击节点不触发 loadData。
   */
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    const nextState = cache[id] || (cache[id] = {
      expandedKeys: [],
      loadedKeys: [],
      sessionIds: {},
    });
    setExpandedKeys(nextState.expandedKeys);
    setLoadedKeys(nextState.loadedKeys);
  }
  const onExpand: TreeProps['onExpand'] = function (expandedKeys, { expanded, node }) {
    const { sessionId, cid } = node as TreeDataNode & EventDataNode<any>;
    if (setCurrentDatabaseOnExpand) {
      if (sessionId) {
        const session = sessionManager.sessionMap.get(sessionId);
        if (session) {
          treeContext.setCurrentDatabaseId(session?.odcDatabase?.id);
        }
      } else if (cid) {
        treeContext.setCurrentDatabaseId(cid);
      }
    }
    if (expanded && !node.children?.length && !loadedKeys?.includes(node.key)) {
      /**
       * 只允许在onload内部修改expandedKeys
       * 触发onload可以保证node是加载成功的，并且在loadedkeys中，避免请求失败无限循环
       * 已有子节点的节点（非懒加载，如项目模式下按数据源分组的数据源节点）可以直接展开。
       */
      return;
    }
    cache[id] = Object.assign({}, cache[id], { expandedKeys: [...expandedKeys] });
    setExpandedKeys(expandedKeys);
  };
  const onLoad: TreeProps['onLoad'] = function (loadedKeys, { event, node }) {
    const newExpandedKeys = [...expandedKeys, node.key];
    cache[id] = Object.assign({}, cache[id], {
      loadedKeys: [...loadedKeys],
      expandedKeys: newExpandedKeys,
    });
    setLoadedKeys(loadedKeys);
    setExpandedKeys(newExpandedKeys);
  };

  return {
    onExpand,
    onLoad,
    expandedKeys: [...expandedKeys],
    loadedKeys,
    sessionIds: cache[id].sessionIds,
    setSessionId: (dbId: number, sessionId: string) => {
      cache[id].sessionIds[dbId] = sessionId;
    },
    setExpandedKeys,
  };
}
