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

import { getMetaStoreInstance } from '@/common/metaStore';
import { executeTaskManager } from '@/common/network/sql/executeSQL';
import ExecuteSQLModal from '@/component/ExecuteSQLModal';
import WindowManager from '@/component/WindowManager';
import WorkspaceSideTip from '@/component/WorkspaceSideTip';
import type { IPage } from '@/d.ts';
import odc from '@/plugins/odc';
import { movePagePostion, openNewSQLPage } from '@/store/helper/page';
import type { UserStore } from '@/store/login';
import type { ModalStore } from '@/store/modal';
import type { PageStore } from '@/store/page';
import type { SessionManagerStore } from '@/store/sessionManager';
import sessionManager from '@/store/sessionManager';
import type { SettingStore } from '@/store/setting';
import type { SQLStore } from '@/store/sql';
import type { TaskStore } from '@/store/task';
import { formatMessage } from '@/util/intl';
import tracert from '@/util/tracert';
import { history, useLocation, useParams, useSearchParams } from '@umijs/max';
import { message, Modal } from 'antd';
import { toInteger } from 'lodash';
import { inject, observer } from 'mobx-react';
import React, { useContext, useEffect, useRef, useState } from 'react';
import ActivityBar from './ActivityBar/ index';
import ResourceTreeContext, { ResourceTreeTab } from './context/ResourceTreeContext';
import WorkspaceStore from './context/WorkspaceStore';
import GlobalModals from './GlobalModals';
import WorkBenchLayout from './Layout';
import SideBar from './SideBar';

let _closeMsg = '';
export function changeCloseMsg(t: any) {
  _closeMsg = t;
}

interface WorkspaceProps {
  pageStore: PageStore;
  settingStore: SettingStore;
  userStore: UserStore;
  sqlStore: SQLStore;
  modalStore?: ModalStore;
  taskStore?: TaskStore;
  sessionManagerStore?: SessionManagerStore;
}

const Workspace: React.FC<WorkspaceProps> = (props: WorkspaceProps) => {
  const { pageStore, settingStore, sqlStore, modalStore, taskStore, sessionManagerStore } = props;
  const { pages = [], activePageKey } = pageStore;
  const { serverSystemInfo } = settingStore;
  const location = useLocation();
  const [params] = useSearchParams(location.hash);
  const resourceTreeContext = useContext(ResourceTreeContext);

  const [isReady, setIsReady] = useState<boolean>(false);
  const { tabKey } = useParams<{ tabKey: string }>();

  /**
   * 首次挂载时 Container.initData() 已加载过数据源/项目列表。带参深链"首次打开页面"
   * 时 resolveParams 也会跑一次（isReady 翻 true 触发），此时不需要再 reload（与 initData
   * 并发重复调用同一个 useRequest 的 run，会导致数据源列表一直处于加载态）。仅在"再次
   * 带参进入"（非首次）时才刷新。用 ref 标记是否已执行过一次 resolveParams。
   */
  const hasResolvedRef = useRef(false);
  function resolveParams() {
    const projectId = toInteger(params.get('projectId'));
    const databaseId = toInteger(params.get('databaseId'));
    const datasourceId = toInteger(params.get('datasourceId'));
    const isFirstResolve = !hasResolvedRef.current;
    hasResolvedRef.current = true;
    if (projectId) {
      /**
       * 从项目页"登录数据库"进入时，侧边栏应停留在 SelectPanel 的项目内数据源视图
       * （带返回箭头），与直接访问 SQL 控制台后手动进入项目的表现一致。
       *
       * 设置 autoEnterProjectId（由 SelectPanel 的 Project 子组件消费后清空）让它保持
       * SelectPanel 打开；设置 currentDatabaseId 让 Project 树自动定位/高亮目标数据库。
       * Container 的 effect 在 autoEnterProjectId 存在时不会因 currentDatabaseId 关闭面板。
       *
       * 仅在"再次带参进入"（非首次挂载）时刷新数据源目录；项目列表为服务端分页，由
       * SelectPanel/Project 的 autoEnter effect 刷新；项目内数据源由 autoEnterProjectId →
       * enterProject → loadProjectDatasources 刷新。
       */
      if (!isFirstResolve) {
        /**
         * 项目列表已改为服务端分页本地拉取：刷新由 SelectPanel/Project 的 autoEnter effect
         * 接管（fetchProjects + getProject），此处仅刷新数据源目录。
         */
        resourceTreeContext?.reloadDatasourceList?.();
      }
      resourceTreeContext?.setSelectTabKey(ResourceTreeTab.project);
      resourceTreeContext?.setAutoEnterProjectId?.(projectId);
      /**
       * 自增进入项目请求序号。即便目标项目 id 不变（已在该项目页签下、setAutoEnterProjectId
       * 同值短路），该序号也会变化，驱动 Project 组件重新刷新项目内数据源，从而显示新增的数据源。
       */
      resourceTreeContext?.setAutoEnterRequestId?.(
        (resourceTreeContext.autoEnterRequestId || 0) + 1,
      );
      databaseId && resourceTreeContext?.setCurrentDatabaseId(databaseId);
      databaseId && openNewSQLPage(databaseId, 'project');
    } else if (datasourceId) {
      /**
       * 仅在"再次带参进入"时刷新数据源列表（首次由 Container.initData 加载）。
       */
      if (!isFirstResolve) {
        resourceTreeContext?.reloadDatasourceList?.();
      }
      resourceTreeContext?.setSelectTabKey(ResourceTreeTab.datasource);
      resourceTreeContext?.setSelectDatasourceId(datasourceId);
      databaseId && resourceTreeContext?.setCurrentDatabaseId(databaseId);
      databaseId && openNewSQLPage(databaseId, 'datasource');
    } else {
      return;
    }
    console.log('openPage', projectId, datasourceId, databaseId);
    history.replace('/sqlworkspace');
  }
  useEffect(() => {
    if (!isReady) {
      return;
    }
    resolveParams();
  }, [params, isReady]);

  const handleActivatePage = (activeKey: string) => {
    pageStore.setActivePageKeyAndPushUrl(activeKey);
  };

  const handleOpenPage = async () => {
    const db = resourceTreeContext.currentDatabaseId;
    openNewSQLPage(db);
  };

  const openPageAfterTargetPage = async (targetPage: IPage) => {
    await handleOpenPage();
    const { pages } = pageStore;

    if (pages.length < 3) {
      /**
       * 少于3个，没必要再排序
       */
      return;
    }

    const newPage = pages[pages.length - 1];
    const targetPageIndex = pages.findIndex((page) => {
      return page.key == targetPage.key;
    });

    if (newPage) {
      movePagePostion(newPage.key, pages[targetPageIndex + 1].key);
    }
  };

  const handleClosePage = (targetPageKey: string) => {
    const { runningPageKey } = sqlStore;

    if (runningPageKey.has(targetPageKey)) {
      Modal.confirm({
        title: formatMessage({ id: 'odc.page.Workspace.ConfirmCloseWindow' }), // 确认关闭窗口？
        content: formatMessage({
          id: 'odc.page.Workspace.WhenTheOperationIsRunning',
        }),

        // 操作执行中，关闭窗口将终止窗口操作，确认关闭吗？
        onOk: async () => {
          pageStore.close(targetPageKey);
        },
      });
    } else {
      pageStore.close(targetPageKey);
    }
  };

  const checkPagesSaved = (pages: IPage[], callback) => {
    let isSaved = true;
    let dockedPage = null;
    pages.forEach((page) => {
      if (!page.isSaved) {
        isSaved = false;
      }
      if (page?.params?.isDocked) {
        dockedPage = page;
      }
    });
    if (dockedPage) {
      message.warning(
        formatMessage(
          {
            id: 'odc.page.Workspace.DockedpagetitleIsBeingDebuggedAnd',
          },

          { dockedPageTitle: dockedPage.title },
        ),

        // `${dockedPage.title}正在调试，无法关闭`
      );
    } else if (isSaved) {
      callback();
    } else {
      Modal.confirm({
        title: formatMessage({
          id: 'odc.page.Workspace.TheTaskIsNotSaved',
        }),

        content: formatMessage({
          id: 'odc.page.Workspace.UnsavedContentWillDisappearAfter',
        }),

        okText: formatMessage({
          id: 'odc.page.Workspace.Closed',
        }),

        okType: 'danger',
        onOk: callback,
      });
    }
  };

  const handleCloseOtherPage = (targetPageKey: string) => {
    const willClosePages = pageStore.pages.filter((page) => {
      return page.key !== targetPageKey;
    });
    checkPagesSaved(willClosePages, () => {
      pageStore.setActivePageKeyAndPushUrl(targetPageKey);
      pageStore.updatePages(async (oldPages) => {
        return oldPages.filter((page) => {
          return page.key == targetPageKey;
        });
      });
    });
  };

  const handleCloseAllPage = () => {
    checkPagesSaved(pageStore.pages, () => {
      pageStore.clear();
    });
  };

  const handleSavePage = (targetPageKey: string) => {
    pageStore.save(targetPageKey);
  };

  const handleStartSavingPage = (targetPageKey: string) => {
    pageStore.startSaving(targetPageKey);
  };

  const handelUnsavedChangePage = (targetPageKey: string) => {
    pageStore.setPageUnsaved(targetPageKey);
  };

  const onCopySQLPage = (page: IPage) => {
    openNewSQLPage(page?.params?.cid, page?.params?.databaseFrom);
  };
  useEffect(() => {
    // clear expired tab data
    const key = 'tabKey-time' + tabKey;
    async function clearExpriedTabKey() {
      const store = await getMetaStoreInstance();
      const expriedKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) {
          break;
        }
        if (key.indexOf('tabKey-time') === 0) {
          const time = parseInt(localStorage.getItem(key) || '0');
          if (new Date().getTime() - time > 1000 * 60 * 60 * 24 * 3) {
            expriedKeys.push(key);
            localStorage.removeItem(key);
          }
        }
      }
      const items = await store.getAllItem();
      items.forEach(async ([itemKey, value]) => {
        const expriedKey = expriedKeys.find((key) => {
          return itemKey.includes(key.replace('tabKey-time', ''));
        });
        if (!expriedKey) {
          return;
        }
        store.removeItem(itemKey);
      });
    }
    clearExpriedTabKey();
    window.localStorage.removeItem(key);
    return () => {
      // add tab close time
      if (tabKey) {
        window.localStorage.setItem(key, new Date().getTime().toString());
      }
    };
  }, []);
  useEffect(() => {
    tracert.expo('a3112.b41896.c330993');
    async function asyncEffect() {
      // settingStore.hideHeader(); // 隐藏阿里云导航头
      odc.appConfig.workspace.preMount();
      await pageStore.initStore();
      // if (localLoginHistoy.isNewVersion()) {
      //   localLoginHistoy.updateVersion();
      //   settingStore.enableVersionTip && openNewVersionTip();
      // }
      setIsReady(true);
      /**
       * TODO
       * 初始化项目列表，数据源列表
       */
    }
    asyncEffect();
    return () => {
      odc.appConfig.workspace.unMount?.();
      sqlStore.reset();
      modalStore.clear();
      taskStore.clear();
      executeTaskManager.stopAllTask();
      sessionManagerStore.destoryStore(true);
    };
  }, []);

  useEffect(() => {
    if (settingStore.configurations['odc.database.default.enableGlobalObjectSearch'] === 'false')
      return;
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && ['J', 'j'].includes(event.key)) {
        modalStore.changeDatabaseSearchModalVisible(!modalStore.databaseSearchModalVisible);
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingStore.configurations['odc.database.default.enableGlobalObjectSearch']]);

  return (
    <>
      <WorkBenchLayout
        activityBar={<ActivityBar />}
        sideBar={<SideBar />}
        editorGroup={
          isReady ? (
            <WindowManager
              pages={pages}
              activeKey={activePageKey}
              onActivatePage={handleActivatePage}
              onOpenPage={handleOpenPage}
              onOpenPageAfterTarget={openPageAfterTargetPage}
              onClosePage={handleClosePage}
              onCloseOtherPage={handleCloseOtherPage}
              onCloseAllPage={handleCloseAllPage}
              onSavePage={handleSavePage}
              onStartSavingPage={handleStartSavingPage}
              onUnsavedChangePage={handelUnsavedChangePage}
              onCopySQLPage={onCopySQLPage}
            />
          ) : null
        }
      />
      {isReady && (
        <>
          {!!serverSystemInfo?.tutorialEnabled && <WorkspaceSideTip />}
          <GlobalModals />
        </>
      )}
      <WrapWorkSpaceExecuteSQLModal modalStore={modalStore} />
    </>
  );
};

const WorkspaceMobxWrap = inject(
  'pageStore',
  'settingStore',
  'userStore',
  'sqlStore',
  'modalStore',
  'taskStore',
  'sessionManagerStore',
)(observer(Workspace));

export default inject('userStore')(
  observer(function WorkSpaceWrap(props: WorkspaceProps) {
    const { tabKey } = useParams<{ tabKey: string }>();
    useEffect(() => {
      if (tabKey) {
        return;
      }
      window.name = 'sqlworkspace' + '%' + props.userStore?.organizationId;
      return () => {
        window.name = null;
      };
    }, [props.userStore?.organizationId, tabKey]);
    return (
      <WorkspaceStore key={props.userStore?.organizationId}>
        <WorkspaceMobxWrap {...props} />
      </WorkspaceStore>
    );
  }),
);

const WorkSpaceExecuteSQLModal: React.FC<{
  modalStore: ModalStore;
}> = ({ modalStore }) => {
  const { workSpaceExecuteSQLModalProps = {} } = modalStore;
  const {
    tip,
    sql = '',
    visible = false,
    sessionId = null,
    onCancel,
    onSave,
    status = null,
    lintResultSet = null,
  } = workSpaceExecuteSQLModalProps;
  return (
    <ExecuteSQLModal
      tip={tip}
      sessionStore={sessionManager?.sessionMap?.get(sessionId)}
      readonly={true}
      lintResultSet={lintResultSet}
      status={status}
      sql={sql}
      onSave={onSave}
      visible={visible}
      onCancel={onCancel}
    />
  );
};

const WrapWorkSpaceExecuteSQLModal = inject('modalStore')(observer(WorkSpaceExecuteSQLModal));
