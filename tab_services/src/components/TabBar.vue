<template>
  <div class="tab-bar" @dblclick="onDoubleClickBar">
    <div class="tabs-container">
        <TabItem
          v-for="tab in tabs"
          :key="tab.id"
          :tab="tab"
          :is-active="activeTabId === tab.id"
          @select="onTabSelect(tab.id)"
          @close="onTabClose(tab.id)"
        />
    </div>
    <div class="tab-actions">
      <a-tooltip title="新建标签页">
        <div class="tab-new" @click="onNewTab">
          <PlusOutlined :style="{ fontSize: '18px' }" />
        </div>
      </a-tooltip>
      <a-tooltip title="主页">
        <div class="tab-new" @click="onGoHome">
          <HomeOutlined :style="{ fontSize: '18px' }" />
        </div>
      </a-tooltip>
    </div>
    <!-- Refresh button -->
    <div class="tab-refresh">
      <a-tooltip :title="isLoading ? '停止加载' : '刷新当前页面'">
        <button class="refresh-btn" @click="onRefresh" :disabled="isLoading">
          <ReloadOutlined v-if="!isLoading" :style="{ fontSize: '18px' }" />
          <LoadingOutlined v-else :style="{ fontSize: '18px' }" :spin="true" />
        </button>
      </a-tooltip>
    </div>
    <!-- Help button -->
    <div class="tab-help">
      <a-tooltip title="帮助">
        <button class="help-btn" @click="onHelp">
          <QuestionCircleOutlined :style="{ fontSize: '18px' }" />
        </button>
      </a-tooltip>
    </div>
    <!-- Settings button -->
    <div class="tab-settings">
      <a-tooltip title="设置">
        <button class="settings-btn" @click="openSettings">
          <SettingOutlined :style="{ fontSize: '18px' }" />
        </button>
      </a-tooltip>
    </div>
    <div class="window-controls">
      <a-tooltip title="最小化">
        <button class="window-btn minimize-btn" @click="onMinimize">
          <MinusOutlined :style="{ fontSize: '12px' }" />
        </button>
      </a-tooltip>

      <a-tooltip :title="isMaximized ? '还原' : '最大化'">
        <button class="window-btn maximize-btn" @click="onToggleMaximize">
          <BorderOutlined v-if="!isMaximized" :style="{ fontSize: '12px' }" />
          <CopyOutlined v-else :style="{ fontSize: '12px' }" />
        </button>
      </a-tooltip>

      <a-tooltip title="关闭">
        <button class="window-btn close-btn" @click="onClose">
          <CloseOutlined :style="{ fontSize: '12px' }" />
        </button>
      </a-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Tooltip as ATooltip } from 'ant-design-vue'
import {
  PlusOutlined,
  ReloadOutlined,
  LoadingOutlined,
  SettingOutlined,
  MinusOutlined,
  BorderOutlined,
  CopyOutlined,
  CloseOutlined,
  HomeOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons-vue'
import TabItem from './TabItem.vue'

interface Tab {
  id: string
  title: string
  url: string
  loading?: boolean
  favicon?: string
}

const props = defineProps<{
  tabs: Tab[]
  activeTabId: string
  isLoading?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  close: [id: string]
  new: []
  goHome: []
  help: []
}>()

// Window maximized state
const isMaximized = ref(false)

const onTabSelect = (id: string) => {
  emit('select', id)
}

const onTabClose = (id: string) => {
  emit('close', id)
}

const onNewTab = () => {
  console.log('[TabBar] onNewTab clicked')
  emit('new')
}

const onGoHome = () => {
  console.log('[TabBar] onGoHome clicked')
  emit('goHome')
}

const onHelp = () => {
  console.log('[TabBar] onHelp clicked')
  emit('help')
}

/**
 * Open settings window via IPC
 */
const openSettings = () => {
  console.log('[TabBar] openSettings clicked')
  if (window.electron?.windowControl) {
    window.electron.windowControl.openSettings()
  } else {
    console.warn('[TabBar] window.electron.windowControl not available')
  }
}

/**
 * Check window maximize state and subscribe to changes
 */
async function checkMaximizeState() {
  console.log('[TabBar] checkMaximizeState, window.electron?.windowControl:', !!window.electron?.windowControl)
  if (!window.electron?.windowControl) {
    console.warn('[TabBar] window.electron.windowControl not available')
    return
  }

  const result = await window.electron.windowControl.isMaximized()
  console.log('[TabBar] isMaximized result:', result)
  if (result?.success) {
    isMaximized.value = result.isMaximized
  }
}

/**
 * Handle double-click on tab bar to toggle maximize
 */
const onDoubleClickBar = (event: MouseEvent) => {
  // Check if click is on the tab bar itself or tabs container
  const target = event.target as HTMLElement
  const isOnTabBar = target.classList.contains('tab-bar')
  const isOnTabsContainer = target.closest('.tabs-container')

  // Allow double-click maximize from tab bar and tabs container area
  if (isOnTabBar || isOnTabsContainer) {
    onToggleMaximize()
  }
}

/**
 * Handle window minimize
 */
async function onMinimize() {
  console.log('[TabBar] onMinimize clicked')
  if (window.electron?.windowControl) {
    console.log('[TabBar] Calling window.electron.windowControl.minimize()')
    await window.electron.windowControl.minimize()
  } else {
    console.warn('[TabBar] window.electron.windowControl not available')
  }
}

/**
 * Handle window maximize/restore toggle
 */
async function onToggleMaximize() {
  console.log('[TabBar] onToggleMaximize clicked, current isMaximized:', isMaximized.value)
  if (!window.electron?.windowControl) {
    console.warn('[TabBar] window.electron.windowControl not available')
    return
  }

  if (isMaximized.value) {
    console.log('[TabBar] Calling window.electron.windowControl.unmaximize()')
    await window.electron.windowControl.unmaximize()
  } else {
    console.log('[TabBar] Calling window.electron.windowControl.maximize()')
    await window.electron.windowControl.maximize()
  }

  // Update state after a short delay
  setTimeout(() => {
    checkMaximizeState()
  }, 100)
}

/**
 * Handle refresh button click
 */
async function onRefresh() {
  console.log('[TabBar] onRefresh clicked, isLoading:', props.isLoading)
  console.log('[TabBar] window.electron?.tab:', !!window.electron?.tab)
  if (window.electron?.tab) {
    console.log('[TabBar] Calling window.electron.tab.reload()')
    await window.electron.tab.reload()
  } else {
    console.warn('[TabBar] window.electron.tab not available')
  }
}

/**
 * Handle window close
 */
async function onClose() {
  console.log('[TabBar] onClose clicked')
  if (window.electron?.windowControl) {
    console.log('[TabBar] Calling window.electron.windowControl.close()')
    await window.electron.windowControl.close()
  } else {
    console.warn('[TabBar] window.electron.windowControl not available')
  }
}

onMounted(() => {
  console.log('[TabBar] Component mounted')
  console.log('[TabBar] window.electron:', !!window.electron)
  console.log('[TabBar] window.electron?.tab:', !!window.electron?.tab)
  console.log('[TabBar] window.electron?.windowControl:', !!window.electron?.windowControl)
  checkMaximizeState()
})
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 44px;
  background: #f0f0f0;
  border-bottom: 1px solid #e0e0e0;
  -webkit-app-region: drag;
  user-select: none;
  padding-left: 8px;
}

.tabs-container {
  display: flex;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  align-items: center;
  padding: 4px 0;
}

.tab-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 2px;
  -webkit-app-region: no-drag;
}

.tab-new {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: #666666;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.tab-new:hover {
  background: #e0e0e0;
  color: #333333;
}

.tab-new:active {
  background: #d0d0d0;
}

/* Refresh button */
.tab-refresh {
  display: flex;
  align-items: center;
  padding: 0 2px;
  -webkit-app-region: no-drag;
}

/* Help button */
.tab-help {
  display: flex;
  align-items: center;
  padding: 0 2px;
  -webkit-app-region: no-drag;
}

.refresh-btn,
.help-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  color: #666666;
}

.refresh-btn:hover,
.help-btn:hover {
  background: #e0e0e0;
  color: #333333;
}

.refresh-btn:active,
.help-btn:active {
  background: #d0d0d0;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Settings button */
.tab-settings {
  display: flex;
  align-items: center;
  padding: 0 2px;
  -webkit-app-region: no-drag;
}

.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  color: #666666;
}

.settings-btn:hover {
  background: #e0e0e0;
  color: #333333;
}

.settings-btn:active {
  background: #d0d0d0;
}

/* Window Controls */
.window-controls {
  display: flex;
  align-items: center;
  padding: 0 4px;
  border-left: 1px solid #e0e0e0;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.window-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  color: #666666;
}

.window-btn:hover {
  background: #e0e0e0;
  color: #333333;
}

.window-btn:active {
  background: #d0d0d0;
}

.close-btn:hover {
  background: #e81123;
  color: white;
}

.close-btn:active {
  background: #c90016;
}

.tabs-container::-webkit-scrollbar {
  height: 3px;
}

.tabs-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

.tabs-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}
</style>
