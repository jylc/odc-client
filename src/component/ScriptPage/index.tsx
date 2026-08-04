import { formatMessage } from '@/util/intl';
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

import DropWrapper from '@/component/Dragable/component/DropWrapper';
import EditorToolBar from '@/component/EditorToolBar';
import GrammerHelpSider from '@/component/GrammerHelpSider';
import StatusBar from '@/component/StatusBar';
import { EDITOR_TOOLBAR_HEIGHT, SQL_PAGE_RESULT_HEIGHT } from '@/constant';
import { ConnectionMode, DbObjectType } from '@/d.ts/index';
import SessionSelect from '@/page/Workspace/components/SessionContextWrap/SessionSelect';
import { IDebugStackItem } from '@/store/debug/type';
import SessionStore from '@/store/sessionManager/session';
import { SettingStore } from '@/store/setting';
import { default as snippet, default as snippetStore } from '@/store/snippet';
import editorUtils from '@/util/editor';
import { getUnWrapedSnippetBody } from '@/util/snippet';
import { Layout, message } from 'antd';
import { inject, observer } from 'mobx-react';
import React, { PureComponent } from 'react';
import SplitPane from 'react-split-pane';
import CustomDragLayer from '../GrammerHelpSider/component/CustomDragLayer';
import MonacoEditor, { IEditor } from '../MonacoEditor';
import TemplateInsertModal, { CLOSE_INSERT_PROMPT_KEY, getCopyText } from '../TemplateInsertModal';
import styles from './index.less';

const { Content } = Layout;

interface IProps {
  settingStore?: SettingStore;
  ctx: any;
  style?: any;
  language: string;
  editor: any;
  toolbar?: any;
  stackbar?: {
    onClick: any;
    list: IDebugStackItem[] | null;
  };
  statusBar?: any;
  Result?: React.ReactNode;
  Others: any;
  session: SessionStore;
  sessionSelectReadonly?: boolean;
  dialectTypes?: ConnectionMode[];
  showSessionSelect?: boolean;
  handleChangeSplitPane?: (size: number) => void;
  /**
   * 编辑器左侧的对象树面板（当前仅 SQLPage 注入）。传入后会用垂直 SplitPane
   * 将其与编辑区拆分；未传入时保持原有单栏布局，向后兼容。
   */
  objectTreePanel?: React.ReactNode;
}

interface IPageState {
  // esultHeight: number;
  templateInsertModalVisible: boolean;
  templateName: string;
  offset: {
    line: number;
    column: number;
  };
  /**
   * 左侧对象树面板是否展开（默认展开）。仅在 objectTreePanel 存在时生效。
   */
  showObjectTree: boolean;
  /**
   * 左侧对象树面板宽度（px），用于 SplitPane 的受控尺寸。
   */
  objectTreeWidth: number;
  /**
   * 是否正处于折叠/展开切换的动画过程中。仅在切换时为 true，给 pane1 加上宽度过渡；
   * 拖拽分隔条时为 false，保证宽度立即跟随鼠标，不产生延迟。
   */
  treeAnimating: boolean;
}

@inject('settingStore')
@observer
export default class ScriptPage extends PureComponent<IProps> {
  public readonly state: IPageState = {
    templateInsertModalVisible: false,
    templateName: '',
    offset: null,
    /// resultHeight: RESULT_HEIGHT
    showObjectTree: true,
    objectTreeWidth: 240,
    treeAnimating: false,
  };

  componentDidMount() {
    if (this.props.editor?.enableSnippet) {
      snippet.registerEditor({ language: this.props.language });
      snippet.resetSnippets();
    }
  }
  getSession() {
    return this.props.session;
  }

  renderPanels = () => {
    const {
      ctx,
      language,
      toolbar,
      stackbar,
      editor,
      statusBar,
      settingStore,
      session,
      sessionSelectReadonly,
      dialectTypes,
      showSessionSelect = true,
      objectTreePanel,
    } = this.props;
    const { showObjectTree, objectTreeWidth, treeAnimating } = this.state;
    const isShowDebugStackBar = !!stackbar?.list?.length;
    /**
     * 左侧对象树面板是否存在且展开。为 true 时用垂直 SplitPane 把对象树与编辑区拆分，
     * 与截图一致；否则保持原有单栏布局，保证其它编辑器页面零影响。
     */
    /**
     * 是否存在内嵌对象树面板（无论展开/折叠）。存在时工具栏移入右侧 pane（仅覆盖编辑器
     * 宽度），对象树从会话行正下方开始；折叠时通过宽度过渡动画收起，仍保持该布局。
     */
    const hasObjectTreePane = !!objectTreePanel;
    /**
     * 编辑区顶部相对于 Content 的偏移。
     * - 有对象树面板时：工具栏移入右侧 pane（仅覆盖编辑器宽度），对象树从会话行正下方开始，
     *   故 editorHost 顶部只需让出会话行（+ 调试堆栈条）。
     * - 无对象树面板（含其它编辑器）：工具栏仍在顶部全宽，需让出会话行 + 工具栏（+ 堆栈条）。
     */
    const sessionSelectHeight = showSessionSelect ? 32 : 0;
    const debugStackHeight = isShowDebugStackBar ? 28 : 0;
    const editorHostTop = hasObjectTreePane
      ? sessionSelectHeight + debugStackHeight
      : EDITOR_TOOLBAR_HEIGHT + debugStackHeight + sessionSelectHeight;
    const editorHostBottom = statusBar && statusBar.status ? 32 : 0;
    const editorArea = (
      <DropWrapper
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        }}
        onHover={(item, monitor) => {
          ctx.editor?.focus();
          const clientOffset = monitor.getClientOffset();
          editorUtils.updateEditorCursorPositionByClientPosition(ctx.editor, {
            clientX: clientOffset.x,
            clientY: clientOffset.y,
          });
        }}
        onDrop={async (item, monitor) => {
          const snippetBody = snippetStore.snippetDragging?.body;
          if (!snippetBody) {
            return;
          }
          const snippetTemplate = getUnWrapedSnippetBody(snippetBody);
          if (snippetTemplate) {
            editorUtils.insertSnippetTemplate(ctx.editor, snippetTemplate);
          } else if (
            [DbObjectType.table, DbObjectType.view].includes(
              snippetStore.snippetDragging?.objType,
            )
          ) {
            const position = (ctx.editor as IEditor)?.getPosition();
            if (!position) {
              return;
            }
            if (snippetStore.snippetDragging.databaseId !== session.database.databaseId) {
              message.warn(
                formatMessage({
                  id: 'src.component.ScriptPage.D0B6C37B' /*'该对象不属于当前数据库'*/,
                  defaultMessage: '该对象不属于当前数据库',
                }),
              );
              return;
            }
            const CLOSE_INSERT_PROMPT = localStorage.getItem(CLOSE_INSERT_PROMPT_KEY);
            if (CLOSE_INSERT_PROMPT === 'true') {
              const name = snippetBody;
              const type = snippetStore.snippetDragging?.objType;
              const value =
                settingStore.configurations['odc.sqlexecute.default.objectDraggingOption'];
              const insertText = await getCopyText(name, type, value, true, session.sessionId);
              const editor = ctx.editor as IEditor;
              editor.focus();
              editorUtils.insertSnippetTemplate(ctx.editor, insertText);
            } else {
              this.setState({
                templateInsertModalVisible: true,
                templateName: snippetBody,
                offset: {
                  line: position.lineNumber,
                  column: position.column,
                },
              });
            }
          } else {
            editorUtils.insertTextToCurrectPosition(ctx.editor, snippetBody);
          }
        }}
      >
        <MonacoEditor {...editor} language={language} sessionStore={this.props.session} />
      </DropWrapper>
    );
    return (
      <Layout
        style={{
          minHeight: 'auto',
          height: '100%',
          background: 'var(--background-primary-color)',
        }}
      >
        <Content style={{ position: 'relative' }}>
          {showSessionSelect && (
            <SessionSelect
              dialectTypes={dialectTypes}
              readonly={sessionSelectReadonly}
              collapsible={!!objectTreePanel}
              collapsed={!!objectTreePanel && !showObjectTree}
              onToggleCollapse={() => {
                /**
                 * 切换时开启宽度过渡（滑动动画），动画结束后关闭；拖拽分隔条时 onChange 会
                 * 立即把 treeAnimating 置回 false，保证拖拽宽度立即跟随鼠标。
                 */
                this.setState({ showObjectTree: !showObjectTree, treeAnimating: true }, () => {
                  window.dispatchEvent(new Event('resize'));
                });
                window.setTimeout(() => this.setState({ treeAnimating: false }), 220);
              }}
            />
          )}

          {isShowDebugStackBar ? (
            <div className={styles.stackList}>
              {stackbar.list.map((stack) => {
                return (
                  <div
                    className="stack-item"
                    onClick={() => {
                      stackbar.onClick(stack);
                    }}
                    title={stack.plName}
                  >
                    {stack.plName} {stack.isActive && <i className="icon-active" />}
                  </div>
                );
              })}
            </div>
          ) : null}
          {objectTreePanel ? (
            <div
              className={styles.editorHost}
              style={{ top: editorHostTop, bottom: editorHostBottom, left: 0, right: 0 }}
            >
              <SplitPane
                split="vertical"
                minSize={showObjectTree ? 160 : 0}
                maxSize={520}
                size={showObjectTree ? objectTreeWidth : 0}
                allowResize={showObjectTree}
                onChange={(size) => {
                  /**
                   * 拖拽分隔条：立即更新宽度并关闭过渡，保证宽度立即跟随鼠标，不产生延迟。
                   */
                  this.setState({ objectTreeWidth: size, treeAnimating: false });
                  window.dispatchEvent(new Event('resize'));
                }}
                pane1Style={{
                  overflow: 'hidden',
                  /**
                   * 仅在折叠/展开切换时（treeAnimating）加宽度过渡，实现滑动动画；
                   * 拖拽时无过渡，分隔条立即跟随鼠标。
                   */
                  transition: treeAnimating ? 'width 0.2s ease' : 'none',
                }}
                pane2Style={{ position: 'relative', overflow: 'hidden' }}
                resizerStyle={{
                  display: showObjectTree ? 'block' : 'none',
                  background: 'transparent',
                  width: '4px',
                  cursor: 'col-resize',
                }}
              >
                <div className={styles.objectTreePane}>{objectTreePanel}</div>
                {/**
                 * 右侧面板：工具栏在编辑器正上方，仅覆盖编辑器宽度（与截图一致）。
                 */}
                <div className={styles.editorRightPane}>
                  {toolbar && <EditorToolBar {...toolbar} ctx={ctx} />}
                  <div className={styles.editorInputArea}>{editorArea}</div>
                </div>
              </SplitPane>
            </div>
          ) : (
            <>
              {toolbar && <EditorToolBar {...toolbar} ctx={ctx} />}
              <div
                className={styles.editorHost}
                style={{ top: editorHostTop, bottom: editorHostBottom, left: 0, right: 0 }}
              >
                {editorArea}
              </div>
            </>
          )}
          {this.props.Others}
        </Content>
        {editor?.enableSnippet && ctx.state.showGrammerHelpSider ? (
          <GrammerHelpSider
            collapsed={!ctx.state.showGrammerHelpSider}
            onCollapse={() => {
              ctx.setState({ showGrammerHelpSider: false });
            }}
          />
        ) : null}
      </Layout>
    );
  };

  render() {
    const { statusBar, style, Result, ctx, session } = this.props;
    const { templateInsertModalVisible, templateName, offset } = this.state;
    return (
      <Layout
        style={{
          ...{
            minHeight: 'auto',
            height: '100%',
            background: 'var(--background-primary-color)',
          },
          ...style,
        }}
      >
        {Result ? (
          <SplitPane
            split="horizontal"
            primary={'second'}
            minSize={statusBar?.status ? 66 : 32}
            maxSize={-100}
            defaultSize={SQL_PAGE_RESULT_HEIGHT}
            onChange={this.props.handleChangeSplitPane}
          >
            {this.renderPanels()}
            {Result}
          </SplitPane>
        ) : (
          this.renderPanels()
        )}

        <StatusBar statusBar={statusBar} />
        <TemplateInsertModal
          session={session}
          visible={templateInsertModalVisible}
          name={templateName}
          type={snippetStore.snippetDragging?.objType}
          onClose={() => {
            this.setState({
              templateInsertModalVisible: false,
              templateName: '',
              offset: null,
            });
          }}
          onOk={(insertText) => {
            const editor = ctx.editor as IEditor;
            editor.focus();
            // editor.setPosition({
            //   lineNumber: offset?.line,
            //   column: offset?.column
            // });
            this.setState(
              {
                templateInsertModalVisible: false,
                templateName: '',
                offset: null,
              },
              () => {
                editorUtils.insertSnippetTemplate(ctx.editor, insertText);
              },
            );
          }}
        />

        <CustomDragLayer />
      </Layout>
    );
  }
}
