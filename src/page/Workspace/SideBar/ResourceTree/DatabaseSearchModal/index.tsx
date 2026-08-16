import { useState, useContext, useEffect } from 'react';
import { Modal } from 'antd';
import { inject, observer } from 'mobx-react';
import { ModalStore } from '@/store/modal';
import type { PageStore } from '@/store/page';
import { PageType } from '@/d.ts';
import Search from './components/Search';
import styles from './index.less';
import ResourceTreeContext from '@/page/Workspace/context/ResourceTreeContext';
import { getDatabase, getDatabaseObject } from '@/common/network/database';
import { SearchTypeMap, SEARCH_OBJECT_FROM_ALL_DATABASE } from './constant';
import ObjectList from './components/ObjectList';
import DatabaseList from './components/DatabaseList';
import { IDatabase, IDatabaseObject } from '@/d.ts/database';
import classNames from 'classnames';

interface IProps {
  modalStore?: ModalStore;
  pageStore?: PageStore;
}

const DatabaseSearchModal = ({ modalStore, pageStore }: IProps) => {
  const [database, setDatabase] = useState<IDatabase>();
  const [searchKey, setSearchKey] = useState<string>('');
  const [isSelectDatabase, setSelectDatabaseState] = useState(false);
  const [isSelectAll, setSelectAllState] = useState(true);
  const [objectlist, setObjectlist] = useState<IDatabaseObject>();
  const [activeKey, setActiveKey] = useState(SEARCH_OBJECT_FROM_ALL_DATABASE);
  const [loading, setLoading] = useState<boolean>(false);
  /**
   * 弹窗打开且无任何侧边栏范围时，从当前激活 SQL 窗口的库推导出的库对象（含归属
   * 项目/数据源），仅用于搜索范围兜底与标题展示，不改变弹窗"全部数据库"选中态。
   */
  const [sessionDatabase, setSessionDatabase] = useState<IDatabase>(null);

  const { selectDatasourceId, selectProjectId, selectProject, selectDatasource } =
    useContext(ResourceTreeContext);

  /**
   * 搜索范围（projectId/datasourceId 后端必填其一，且二者互斥）。侧边栏项目页签的
   * "项目内数据源视图"不设置 selectProjectId（仅 display-only 的 selectProject）；返回
   * 项目列表后连 selectProject 也为空，但弹窗可能仍保留已选数据库——其自带
   * project/dataSource 归属（IDatabase.project / IDatabase.dataSource）。按 项目优先
   * （侧边栏 → display-only → 已选库归属 → 激活 SQL 窗口库归属）归一为单一范围，
   * 避免两参同传。
   */
  const getSearchScope = () => {
    const projectId =
      selectProjectId ??
      selectProject?.id ??
      database?.project?.id ??
      sessionDatabase?.project?.id ??
      null;
    if (projectId) {
      return { projectId, datasourceId: null };
    }
    const datasourceId =
      selectDatasourceId ??
      selectDatasource?.id ??
      database?.dataSource?.id ??
      sessionDatabase?.dataSource?.id ??
      null;
    return { projectId: null, datasourceId };
  };

  const handleCancel = () => {
    modalStore.changeDatabaseSearchModalVisible(false);
  };

  useEffect(() => {
    getObjectListData(searchKey);
  }, [activeKey]);

  useEffect(() => {
    setActiveKey(SEARCH_OBJECT_FROM_ALL_DATABASE);
  }, [database]);

  const modalVisible =
    modalStore.databaseSearchModalVisible && modalStore.canDatabaseSearchModalOpen;

  useEffect(() => {
    if (!modalVisible) {
      setSessionDatabase(null);
      return;
    }
    /**
     * 打开弹窗时若无任何侧边栏范围且未选库，则从当前激活 SQL 窗口的库（SQLPage 的
     * pageParams.cid）拉取库详情，用其归属项目/数据源作为搜索范围兜底，使对象搜索
     * 在"未进入项目/数据源"状态下也可用，并在标题中定位显示对应数据源名。
     */
    const hasScope = !!(
      selectProjectId ||
      selectProject?.id ||
      selectDatasourceId ||
      selectDatasource?.id ||
      database
    );
    if (hasScope) {
      return;
    }
    const activePage = pageStore?.pages?.find((p) => p.key === pageStore?.activePageKey);
    const cid = activePage?.type === PageType.SQL ? activePage?.params?.cid : null;
    if (!cid) {
      return;
    }
    let cancelled = false;
    getDatabase(cid)
      .then((res) => {
        if (!cancelled && res?.data) {
          setSessionDatabase(res.data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modalVisible,
    selectProjectId,
    selectProject,
    selectDatasourceId,
    selectDatasource,
    database,
    pageStore?.activePageKey,
  ]);

  const getType = () => {
    if (isSelectDatabase && !database) return 'SCHEMA';
    if (activeKey === SEARCH_OBJECT_FROM_ALL_DATABASE) return null;
    return activeKey;
  };

  const getObjectListData = async (value) => {
    const databaseIds = isSelectAll ? null : database?.id;
    const type = getType();
    const { projectId, datasourceId } = getSearchScope();
    if (!projectId && !datasourceId) {
      /**
       * 无任何范围（未进入项目/数据源且弹窗未选库）时不发请求，后端必填
       * projectId/datasourceId 之一，直接调用会报 BadRequest。
       */
      setObjectlist(undefined);
      return;
    }
    setLoading(true);
    const res = await getDatabaseObject(projectId, datasourceId, databaseIds, type, value);
    setObjectlist(res?.data);
    setLoading(false);
  };

  const onChangeInput = async (type: SearchTypeMap, value: string) => {
    setSearchKey(value);
    const { projectId, datasourceId } = getSearchScope();
    /**
     * 无范围（未进入项目/数据源且弹窗未选库）时对象搜索接口不可用（projectId/
     * datasourceId 后端必填其一），输入关键字时退化为按名称搜索数据库：切到库列表
     * 模式展示匹配结果，选中某个库后即获得范围，自动回到对象搜索。库搜索接口
     * （/database/databases）不要求范围。
     */
    if (type === SearchTypeMap.OBJECT && value && !projectId && !datasourceId) {
      setObjectlist(undefined);
      setSelectDatabaseState(true);
      return;
    }
    getObjectListData(value);
    switch (type) {
      case SearchTypeMap.OBJECT: {
        setSelectDatabaseState(false);
        break;
      }
      case SearchTypeMap.DATABASE: {
        setSelectDatabaseState(true);
      }
    }
  };

  const contentRender = () => {
    if (isSelectAll && !searchKey) {
      return null;
    }
    if (isSelectDatabase) {
      return (
        <DatabaseList
          database={database}
          setDatabase={setDatabase}
          setSelectDatabaseState={setSelectDatabaseState}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          isSelectAll={isSelectAll}
          setSelectAllState={setSelectAllState}
          modalStore={modalStore}
          objectlist={objectlist}
          scopeProjectId={getSearchScope().projectId}
          scopeDatasourceId={getSearchScope().datasourceId}
        />
      );
    }
    return (
      <ObjectList
        database={database}
        objectlist={objectlist}
        activeKey={activeKey}
        setActiveKey={setActiveKey}
        modalStore={modalStore}
        loading={loading}
      />
    );
  };

  return (
    <Modal
      closeIcon={null}
      width={540}
      title={
        <Search
          database={database}
          visible={modalVisible}
          scopeDatasourceName={sessionDatabase?.dataSource?.name}
          onChangeInput={onChangeInput}
          isSelectDatabase={isSelectDatabase}
          searchKey={searchKey}
          isSelectAll={isSelectAll}
          setSelectAllState={setSelectAllState}
          loading={loading}
          setDatabase={setDatabase}
        />
      }
      open={modalVisible}
      onOk={handleCancel}
      onCancel={handleCancel}
      maskClosable={true}
      closable={false}
      className={classNames(styles.databaseSearchModal, {
        [styles.withPanel]: !isSelectAll || searchKey,
      })}
      destroyOnClose={true}
      footer={null}
    >
      {contentRender()}
    </Modal>
  );
};

export default inject('modalStore', 'pageStore')(observer(DatabaseSearchModal));
