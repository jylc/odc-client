import { formatMessage } from '@/util/intl';
import { Button, Spin } from 'antd';
import styles from '../index.less';
import DataBaseStatusIcon from '@/component/StatusIcon/DatabaseIcon';
import ResourceTreeContext from '@/page/Workspace/context/ResourceTreeContext';
import React, { useState, useContext, useEffect, useRef } from 'react';
import { IDatabase, IDatabaseObject } from '@/d.ts/database';
import { ModalStore } from '@/store/modal';
import { openNewSQLPage } from '@/store/helper/page';
import { listDatabases } from '@/common/network/database';
import { useDebounceFn } from 'ahooks';

/**
 * 全局数据库搜索（Ctrl+J）每页拉取条数。改为服务端按 name 搜索 + 分页，不再依赖内存全量
 * databaseList。
 */
const SEARCH_PAGE_SIZE = 50;

interface Iprops {
  database: IDatabase;
  setDatabase: React.Dispatch<React.SetStateAction<IDatabase>>;
  objectlist: IDatabaseObject;
  setSelectDatabaseState: React.Dispatch<React.SetStateAction<boolean>>;
  searchKey: string;
  setSearchKey: React.Dispatch<React.SetStateAction<string>>;
  isSelectAll: boolean;
  setSelectAllState: React.Dispatch<React.SetStateAction<boolean>>;
  modalStore: ModalStore;
}

const DatabaseList = ({
  database,
  setDatabase,
  setSelectDatabaseState,
  searchKey,
  setSearchKey,
  isSelectAll,
  setSelectAllState,
  modalStore,
  objectlist,
}: Iprops) => {
  const { selectProjectId, selectDatasourceId } = useContext(ResourceTreeContext);
  const [activeDatabase, setActiveDatabase] = useState<IDatabase>();
  const [options, setOptions] = useState<IDatabase[]>([]);
  const [pageInfo, setPageInfo] = useState<{ page: number; totalPages: number }>({
    page: 1,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  const fetchPage = async (page: number, name: string, replace: boolean) => {
    setLoading(true);
    const myId = ++reqIdRef.current;
    try {
      const res = await listDatabases(
        selectProjectId,
        selectDatasourceId,
        page,
        SEARCH_PAGE_SIZE,
        name || null,
        null,
        null,
        true,
        true,
      );
      if (myId !== reqIdRef.current) {
        return;
      }
      const contents = res?.contents || [];
      const totalPages = res?.page?.totalPages ?? (contents.length ? 1 : 0);
      setPageInfo({ page, totalPages });
      setOptions((prev) => (replace ? contents : [...prev, ...contents]));
    } finally {
      if (myId === reqIdRef.current) {
        setLoading(false);
      }
    }
  };

  const { run: debouncedSearch } = useDebounceFn((name: string) => fetchPage(1, name, true), {
    wait: 300,
  });

  useEffect(() => {
    debouncedSearch(searchKey);
  }, [searchKey, debouncedSearch]);

  const loadMore = () => {
    if (pageInfo.page < pageInfo.totalPages) {
      fetchPage(pageInfo.page + 1, searchKey, false);
    }
  };

  const getOptions = (): IDatabase[] => {
    if (objectlist) {
      return objectlist.databases || [];
    }
    return options;
  };
  const listOptions = getOptions();

  const changeDatabase = (item) => {
    setDatabase(item);
    setSelectDatabaseState(true);
    setSearchKey('');
    setSelectAllState(false);
  };

  const selectAll = () => {
    setDatabase(null);
    setSelectDatabaseState(false);
    setSearchKey('');
    setSelectAllState(true);
  };

  const openSql = (e, db) => {
    e.stopPropagation();
    modalStore?.databaseSearchsSetExpandedKeysFunction?.(db.id);
    modalStore?.changeDatabaseSearchModalVisible(false);
    db.id && openNewSQLPage(db.id, selectProjectId ? 'project' : 'datasource');
  };

  const applyPermission = (e, db: IDatabase) => {
    e.stopPropagation();
    modalStore.changeApplyDatabasePermissionModal(true, {
      projectId: db?.project?.id,
      databaseId: db?.id,
    });
    modalStore.changeDatabaseSearchModalVisible(false);
  };

  const getPositioninButton = (db: IDatabase) => {
    if (activeDatabase?.id !== db.id) return null;
    if (!!db?.authorizedPermissionTypes?.length) {
      return (
        <Button type="link" style={{ padding: 0 }} onClick={(e) => openSql(e, db)}>
          {formatMessage({
            id: 'src.page.Workspace.SideBar.ResourceTree.DatabaseSearchModal.components.D7B63CB7',
            defaultMessage: '打开 SQL 窗口',
          })}
        </Button>
      );
    }
    return (
      <Button type="link" style={{ padding: 0 }} onClick={(e) => applyPermission(e, db)}>
        {formatMessage({
          id: 'src.page.Workspace.SideBar.ResourceTree.DatabaseSearchModal.components.DC41DDB8',
          defaultMessage: '权限库申请',
        })}
      </Button>
    );
  };

  return (
    <div className={styles.content}>
      <div
        className={isSelectAll ? styles.databaseItemActive : styles.databaseItem}
        onClick={selectAll}
      >
        {formatMessage({
          id: 'src.page.Workspace.SideBar.ResourceTree.DatabaseSearchModal.components.69106FDA',
          defaultMessage: '全部数据库',
        })}
      </div>
      <Spin spinning={loading}>
        {listOptions?.length
          ? listOptions.map((db) => {
              return (
                <>
                  <div
                    key={db.id}
                    onClick={() => changeDatabase(db)}
                    className={
                      database?.id === db?.id ? styles.databaseItemActive : styles.databaseItem
                    }
                    onMouseEnter={() => setActiveDatabase(db)}
                    onMouseLeave={() => setActiveDatabase(null)}
                  >
                    <div
                      style={{
                        display: 'flex',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 410,
                      }}
                    >
                      <DataBaseStatusIcon item={db} />
                      <div style={{ padding: '0 4px' }}>{db?.name}</div>
                      <div className={styles.subInfo}>
                        {selectProjectId ? db?.dataSource?.name : null}
                      </div>
                    </div>
                    {getPositioninButton(db)}
                  </div>
                </>
              );
            })
          : null}
        {!objectlist && pageInfo.page < pageInfo.totalPages ? (
          <div className={styles.loadMore} onClick={loadMore}>
            {formatMessage({
              id: 'odc.ResourceTree.LoadMore',
              defaultMessage: '加载更多',
            })}
          </div>
        ) : null}
      </Spin>
    </div>
  );
};

export default DatabaseList;
