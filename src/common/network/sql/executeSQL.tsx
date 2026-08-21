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

import { ISQLLintReuslt } from '@/component/SQLLintResult/type';
import type { ISqlExecuteResult } from '@/d.ts';
import { EStatus, ISqlExecuteResultStatus } from '@/d.ts';
import type { DatabasePermissionType, IUnauthorizedDatabase } from '@/d.ts/database';
import type { IDatasource } from '@/d.ts/datasource';
import type { IProject } from '@/d.ts/project';
import { IRule } from '@/d.ts/rule';
import modal from '@/store/modal';
import sessionManager from '@/store/sessionManager';
import request from '@/util/request';
import { generateDatabaseSid } from '../pathUtil';

export interface IExecuteSQLParams {
  sql: string;
  queryLimit?: number;
  showTableColumnInfo?: boolean;
  continueExecutionOnError?: boolean;
  fullLinkTraceEnabled?: boolean;
  tag?: string;
  /**
   * 是否拆分执行，传空的话像等于true
   */
  split?: boolean;
  addROWID?: boolean;
}
export interface ISQLExecuteTaskSQL {
  sqlTuple: {
    sqlId: string;
    originalSql: string;
    executedSql: string;
  };
  violatedRules: IRule[];
}
/**
 * /sqls/streamExecute 响应中的未授权库/表资源（扁平结构），见后端 UnauthorizedDBResource。
 */
export interface IUnauthorizedDBResource {
  type?: string;
  dialectType?: string;
  dataSourceId?: number;
  dataSourceName?: string;
  databaseId?: number;
  databaseName?: string;
  tableId?: number;
  tableName?: string;
  applicable?: boolean;
  unauthorizedPermissionTypes?: DatabasePermissionType[];
  projectId?: number;
}
export interface ISQLExecuteTask {
  requestId: string;
  sqls: ISQLExecuteTaskSQL[];
  violatedRules: IRule[];
  unauthorizedDBResources?: IUnauthorizedDBResource[];
  /**
   * 是否逻辑库 SQL
   */
  logicalSql?: boolean;
  /**
   * 是否需要走审批流
   */
  approvalRequired?: boolean;
}
/**
 * /sqls/getMoreResults 的响应（流式分批）：results 为本批增量结果，finished 表示全部返回。
 */
interface IAsyncExecuteResultResp {
  results?: ISqlExecuteResult[];
  traceId?: string;
  sqlId?: string;
  total?: number;
  count?: number;
  finished?: boolean;
  sql?: string;
}

/**
 * 包含拦截信息和执行结果
 */
export interface IExecuteTaskResult {
  hasLintResults?: boolean;
  invalid: boolean;
  executeSuccess: boolean;
  violatedRules: IRule[];
  executeResult: ISqlExecuteResult[];
  lintResultSet?: ISQLLintReuslt[];
  status?: EStatus;
  unauthorizedDatabases?: IUnauthorizedDatabase[];
  unauthorizedSql?: string;
}
class Task {
  public result: ISqlExecuteResult[] = [];
  public isFinish: boolean;
  public taskLoopInterval = 200;
  private timer = null;
  private isStop = false;
  /**
   * 已累积的增量结果：getMoreResults 每批只返回新增部分，需累积到 finished。
   */
  private accumulatedResults: ISqlExecuteResult[] = [];
  constructor(
    public requestId: string,
    public sessionId: string,
    /**
     * 与 streamExecute 一致的 database sid，保证有状态路由命中同一节点。
     */
    private dbSid: string,
  ) {}
  private fetchData = async () => {
    const res = await request.get(`/api/v2/datasource/sessions/${this.dbSid}/sqls/getMoreResults`, {
      params: {
        requestId: this.requestId,
      },
    });
    if (res?.isError) {
      throw new Error(res?.errMsg);
    }
    return res?.data as IAsyncExecuteResultResp;
  };
  public getResult = async (): Promise<ISqlExecuteResult[]> => {
    return new Promise((resolve, reject) => {
      this._getResult(resolve);
    });
  };
  private _getResult = async (callback) => {
    if (this.isStop) {
      callback(null);
      return;
    }
    try {
      const data = await this.fetchData();
      if (data?.results?.length) {
        this.accumulatedResults = this.accumulatedResults.concat(data.results);
      }
      if (data?.finished) {
        callback(this.accumulatedResults);
      } else {
        this.timer = setTimeout(() => {
          this.taskLoopInterval = Math.min(3000, this.taskLoopInterval + 500);
          this._getResult(callback);
        }, this.taskLoopInterval);
      }
    } catch (e) {
      console.trace('get execute result fail', e);
      callback(null);
    }
  };
  public stopTask = () => {
    clearTimeout(this.timer);
    this.isStop = true;
  };
}
class TaskManager {
  public tasks: Task[] = [];
  public async stopAllTask() {
    this.tasks.forEach((task) => {
      task.stopTask();
    });
    this.tasks = [];
  }
  public async stopTask(sessionId: string) {
    this.tasks.forEach((task, index) => {
      if (task.sessionId === sessionId) {
        task.stopTask();
        this.tasks[index] = null;
      }
    });
    this.tasks = this.tasks.filter(Boolean);
  }
  public async addAndWaitTask(
    requestId: string,
    sessionId: string,
    dbSid: string,
  ): Promise<ISqlExecuteResult[]> {
    const task = new Task(requestId, sessionId, dbSid);
    this.tasks.push(task);
    try {
      const result = await task.getResult();
      this.tasks = this.tasks.filter((_task) => _task !== task);
      return result;
    } catch (e) {
      console.trace('sql task error', e);
    }
  }
}
export const executeTaskManager = new TaskManager();
/**
 *
 * @param params 要执行的SQL内容，可能为string或IExecuteSQLParams类型
 * @param sessionId 会话ID
 * @param dbName 数据库名称
 * @param needModal SQL确认弹窗，默认需要弹出
 * @returns
 */
export default async function executeSQL(
  params: IExecuteSQLParams | string,
  sessionId: string,
  dbName: string,
  needModal: boolean = true,
): Promise<IExecuteTaskResult> {
  const sid = generateDatabaseSid(dbName, sessionId);
  /**
   * v2 契约（ConnectSessionController）：sessionId 携带在路径上，请求体 SqlAsyncExecuteReq
   * 不含 sid 字段。
   */
  const serverParams =
    typeof params === 'string'
      ? {
          sql: params,
        }
      : {
          ...params,
        };
  const res = await request.post(`/api/v2/datasource/sessions/${sid}/sqls/streamExecute`, {
    data: serverParams,
  });
  const taskInfo: ISQLExecuteTask = res?.data;
  const rootViolatedRules = taskInfo?.violatedRules?.reduce((pre, cur) => {
    if (cur?.violation) {
      return pre.concat({
        sqlTuple: {
          executedSql: cur?.violation?.text,
          offset: cur?.violation?.offset,
          originalSql: cur?.violation?.text,
        },
        violatedRules: [cur],
      });
    }
    return pre;
  }, []);
  /**
   * 新契约返回扁平的 unauthorizedDBResources，这里适配为页面仍在使用的
   * IUnauthorizedDatabase 结构（DBPermissionTable 需要 name/dataSource.name/
   * unauthorizedPermissionTypes/applicable/project.id/id）。
   */
  const unauthorizedDatabases: IUnauthorizedDatabase[] = (
    taskInfo?.unauthorizedDBResources || []
  ).map((item) => ({
    id: item?.databaseId,
    name: item?.databaseName,
    applicable: item?.applicable,
    unauthorizedPermissionTypes: item?.unauthorizedPermissionTypes || [],
    project: (item?.projectId != null ? { id: item.projectId } : null) as IProject,
    dataSource: (item?.dataSourceId != null
      ? { id: item.dataSourceId, name: item.dataSourceName }
      : null) as IDatasource,
  }));
  const violatedRules = rootViolatedRules.concat(taskInfo?.sqls);
  if (unauthorizedDatabases?.length) {
    // 无权限库
    return {
      invalid: true,
      executeSuccess: false,
      executeResult: [],
      violatedRules: [],
      unauthorizedDatabases,
      unauthorizedSql: (params as IExecuteSQLParams)?.sql || (params as string),
    };
  }
  const lintResultSet = violatedRules?.reduce((pre, cur) => {
    if (Array.isArray(cur?.violatedRules) && cur?.violatedRules?.length > 0) {
      return pre.concat({
        sql: cur?.sqlTuple?.executedSql,
        violations: cur?.violatedRules?.map((item) => item?.violation),
      });
    } else {
      return pre;
    }
  }, []);
  /**
   * lintResultSet为空数组时，返回的status默认为submit
   */
  const status = getStatus(lintResultSet);
  // 没有requestId，即是被拦截了
  if (!taskInfo?.requestId) {
    // 一些场景下不需要弹出SQL确认弹窗
    if (!needModal) {
      return {
        hasLintResults: lintResultSet?.length > 0,
        invalid: true,
        executeSuccess: false,
        executeResult: [],
        violatedRules,
        lintResultSet,
        status,
      };
    }
    // 当status不为submit时
    if (status !== EStatus.SUBMIT) {
      modal.updateWorkSpaceExecuteSQLModalProps({
        sql: (params as IExecuteSQLParams)?.sql || (params as string),
        visible: true,
        sessionId,
        lintResultSet,
        status,
        onSave: () => {
          // 关闭SQL确认窗口打开新建数据库变更抽屉
          modal.updateWorkSpaceExecuteSQLModalProps();
          modal.changeCreateAsyncTaskModal(true, {
            sql: (params as IExecuteSQLParams)?.sql || (params as string),
            databaseId: sessionManager.sessionMap.get(sessionId).odcDatabase?.id,
            rules: lintResultSet,
          });
        },
        // 关闭SQL确认弹窗
        onCancel: () =>
          modal.updateWorkSpaceExecuteSQLModalProps({
            visible: false,
          }),
      });
    }
  }
  const requestId = taskInfo?.requestId;
  const sqls = taskInfo?.sqls;
  if (!requestId || !sqls?.length) {
    return null;
  }
  let results = await executeTaskManager.addAndWaitTask(requestId, sessionId, sid);
  results = results?.map((result) => {
    if (!result.requestId) {
      result.requestId = requestId;
    }
    return result;
  });
  return {
    invalid: false,
    executeSuccess:
      !!results && !results?.find((result) => result.status !== ISqlExecuteResultStatus.SUCCESS),
    executeResult: results || [],
    violatedRules: [],
    lintResultSet,
    hasLintResults: lintResultSet?.length > 0,
    status,
  };
}

function getStatus(lintResultSet: ISQLLintReuslt[]) {
  if (Array.isArray(lintResultSet) && lintResultSet?.length) {
    const violations = lintResultSet.reduce((pre, cur) => {
      if (cur?.violations?.length === 0) {
        return pre;
      }
      return pre.concat(...cur?.violations);
    }, []);
    // 含有必须改进， 中断后续操作，禁止执行
    if (violations?.some((violation) => violation?.level === 2)) {
      return EStatus.DISABLED;
      //  全为无需改进，继续原有的后续操作
    } else if (violations?.every((violation) => violation?.level === 0)) {
      return EStatus.SUBMIT;
    } else {
      // 既不含必须改进，又不全是无需改进，需要发起审批
      return EStatus.APPROVAL;
    }
  }
  // 默认返回submit，不中断后续操作
  return EStatus.SUBMIT;
}
