<template>
  <div class="tab-bar-container">
    <TabBar
      :tabs="displayTabs"
      :active-tab-id="activeTabId"
      :is-loading="currentTab?.isLoading || false"
      @select="onTabSelect"
      @close="onTabClose"
      @new="onNewTab"
      @go-home="onGoHome"
      @help="onHelp"
    />
    <UrlBar
      :url="currentTab?.url || ''"
      :can-go-back="currentTab?.canGoBack || false"
      :can-go-forward="currentTab?.canGoForward || false"
      :is-loading="currentTab?.isLoading || false"
      @navigate="onNavigate"
      @back="onGoBack"
      @forward="onGoForward"
      @reload="onReload"
      @stop="onStop"
    />
    <UpdateModal
      :visible="updateModalVisible"
      :state="updateModalState"
      :update-info="updateModalInfo"
      :progress="updateProgress"
      :error-message="updateError"
      @skip="onUpdateSkip"
      @download="onUpdateDownload"
      @install="onUpdateInstall"
      @later="onUpdateLater"
      @close="onUpdateClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import TabBar from '../components/TabBar.vue'
import UrlBar from '../components/UrlBar.vue'
import UpdateModal from '../components/UpdateModal.vue'
import { tabService, TAB_EVENTS } from '../services/tabService'
import { updateService, UPDATE_EVENTS } from '../services/updateService'
import { appLinks } from '../config/links'
import type { TabInfo } from '../types/tab'

// Tab state - synced with main process via IPC
const tabs = ref<TabInfo[]>([])
const activeTabId = ref<string>('')

// Unsubscribe functions for cleanup
const unsubscribers: (() => void)[] = []

// Computed property for current tab
const currentTab = computed(() => {
  return tabs.value.find((tab) => tab.id === activeTabId.value) || null
})

// Display tabs for TabBar component
const displayTabs = computed(() => {
  return tabs.value.map((tab) => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
    loading: tab.isLoading,
    favicon: tab.favicon,
  }))
})

// Update modal state
const updateModalVisible = ref(false)
const updateModalState = ref<'available' | 'downloading' | 'downloaded' | 'error'>('available')
const updateModalInfo = ref<{ version: string; releaseNotes?: string }>({ version: '' })
const updateProgress = ref(0)
const updateError = ref('')

// Tab bar height constant
const TAB_BAR_HEIGHT = 84 // 44px TabBar + 40px UrlBar (both border-box)

/**
 * Initialize tab service and sync with main process
 */
async function initializeTabs(): Promise<void> {
  console.log('[TabBarView] initializeTabs called')
  console.log('[TabBarView] tabService.isAvailable():', tabService.isAvailable())

  if (!tabService.isAvailable()) {
    console.warn('[TabService] Running in standalone mode - Electron API not available')
    // Create a mock tab for development
    const mockTab: TabInfo = {
      id: 'mock-tab',
      url: 'https://example.com',
      title: 'Example',
      isActive: true,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    }
    tabs.value = [mockTab]
    activeTabId.value = mockTab.id
    return
  }

  try {
    console.log('[TabBarView] Getting existing tabs from main process')
    // Get existing tabs from main process
    const allTabs = await tabService.getAllTabs()
    const activeTab = await tabService.getActiveTab()

    console.log('[TabBarView] Received', allTabs.length, 'tabs from main process')
    console.log('[TabBarView] Active tab:', activeTab)

    tabs.value = allTabs
    activeTabId.value = activeTab?.id || ''

    // Notify main process about tab bar height
    console.log('[TabBarView] Setting tab bar height:', TAB_BAR_HEIGHT)
    await tabService.setBarHeight(TAB_BAR_HEIGHT)

    // Subscribe to tab events
    setupEventListeners()

    console.log('[TabService] Initialized with', allTabs.length, 'tabs')
  } catch (error) {
    console.error('[TabService] Failed to initialize:', error)
  }
}

/**
 * Set up IPC event listeners
 */
function setupEventListeners(): void {
  // Tab created
  const unsubCreated = tabService.subscribe(TAB_EVENTS.TAB_CREATED, (data: TabInfo) => {
    console.log('[TabService] Tab created:', data.id)
    const existingIndex = tabs.value.findIndex((t) => t.id === data.id)
    if (existingIndex === -1) {
      tabs.value.push(data)
    } else {
      tabs.value[existingIndex] = data
    }
    if (data.isActive) {
      activeTabId.value = data.id
    }
  })
  unsubscribers.push(unsubCreated)

  // Tab activated
  const unsubActivated = tabService.subscribe(TAB_EVENTS.TAB_ACTIVATED, (data: TabInfo) => {
    console.log('[TabService] Tab activated:', data.id)
    activeTabId.value = data.id
    // Update isActive flag for all tabs
    tabs.value = tabs.value.map((tab) => ({
      ...tab,
      isActive: tab.id === data.id,
    }))
  })
  unsubscribers.push(unsubActivated)

  // Tab closed
  const unsubClosed = tabService.subscribe(TAB_EVENTS.TAB_CLOSED, (data: { tabId: string }) => {
    console.log('[TabService] Tab closed:', data.tabId)
    const index = tabs.value.findIndex((t) => t.id === data.tabId)
    if (index !== -1) {
      tabs.value.splice(index, 1)
    }
  })
  unsubscribers.push(unsubClosed)

  // Tab updated (URL, title, etc.)
  const unsubUpdated = tabService.subscribe(TAB_EVENTS.TAB_UPDATED, (data: { tabId: string; updates: Partial<TabInfo> }) => {
    console.log('[TabService] Tab updated:', data.tabId, data.updates)
    const index = tabs.value.findIndex((t) => t.id === data.tabId)
    if (index !== -1) {
      tabs.value[index] = { ...tabs.value[index], ...data.updates }
    }
  })
  unsubscribers.push(unsubUpdated)

  // Tab title updated
  const unsubTitle = tabService.subscribe(TAB_EVENTS.TAB_TITLE_UPDATED, (data: { tabId: string; title: string }) => {
    const index = tabs.value.findIndex((t) => t.id === data.tabId)
    if (index !== -1) {
      tabs.value[index] = { ...tabs.value[index], title: data.title }
    }
  })
  unsubscribers.push(unsubTitle)

  // Tab favicon updated
  const unsubFavicon = tabService.subscribe(TAB_EVENTS.TAB_FAVICON_UPDATED, (data: { tabId: string; favicon: string }) => {
    const index = tabs.value.findIndex((t) => t.id === data.tabId)
    if (index !== -1) {
      tabs.value[index] = { ...tabs.value[index], favicon: data.favicon }
    }
  })
  unsubscribers.push(unsubFavicon)

  // Tab loading state
  const unsubLoading = tabService.subscribe(TAB_EVENTS.TAB_LOADING, (data: { tabId: string; isLoading: boolean }) => {
    const index = tabs.value.findIndex((t) => t.id === data.tabId)
    if (index !== -1) {
      tabs.value[index] = { ...tabs.value[index], isLoading: true }
    }
  })
  unsubscribers.push(unsubLoading)

  // Tab loaded
  const unsubLoaded = tabService.subscribe(TAB_EVENTS.TAB_LOADED, (data: { tabId: string; isLoading?: boolean; url?: string; title?: string }) => {
    const index = tabs.value.findIndex((t) => t.id === data.tabId)
    if (index !== -1) {
      const updates: Partial<TabInfo> = { isLoading: false }
      if (data.url) updates.url = data.url
      if (data.title) updates.title = data.title
      tabs.value[index] = { ...tabs.value[index], ...updates }
    }
  })
  unsubscribers.push(unsubLoaded)

  // Update events
  const unsubUpdateAvailable = updateService.subscribe(UPDATE_EVENTS.UPDATE_AVAILABLE, (data: { version: string; releaseNotes?: string }) => {
    console.log('[TabBarView] Update available:', data.version)
    updateModalInfo.value = { version: data.version, releaseNotes: data.releaseNotes }
    updateModalState.value = 'available'
    updateModalVisible.value = true
  })
  unsubscribers.push(unsubUpdateAvailable)

  const unsubUpdateProgress = updateService.subscribe(UPDATE_EVENTS.UPDATE_PROGRESS, (data: { progress: number }) => {
    updateProgress.value = data.progress
  })
  unsubscribers.push(unsubUpdateProgress)

  const unsubUpdateDownloaded = updateService.subscribe(UPDATE_EVENTS.UPDATE_DOWNLOADED, () => {
    updateModalState.value = 'downloaded'
  })
  unsubscribers.push(unsubUpdateDownloaded)

  const unsubUpdateError = updateService.subscribe(UPDATE_EVENTS.UPDATE_ERROR, (data: { message: string }) => {
    updateError.value = data.message
    updateModalState.value = 'error'
  })
  unsubscribers.push(unsubUpdateError)
}

/**
 * Handle tab selection
 */
async function onTabSelect(id: string): Promise<void> {
  if (id === activeTabId.value) return

  activeTabId.value = id
  if (tabService.isAvailable()) {
    await tabService.switchTab(id)
  }
}

/**
 * Handle tab close
 */
async function onTabClose(id: string): Promise<void> {
  if (tabService.isAvailable()) {
    await tabService.closeTab(id)
  } else {
    // Local state update for standalone mode
    const index = tabs.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      tabs.value.splice(index, 1)
      if (activeTabId.value === id) {
        activeTabId.value = tabs.value.length > 0 ? tabs.value[0].id : ''
      }
    }
  }
}

/**
 * Handle new tab creation
 */
async function onNewTab(): Promise<void> {
  console.log('[TabBarView] onNewTab called')

  if (tabService.isAvailable()) {
    try {
      console.log('[TabBarView] Creating tab via tabService.createTab')
      const newTab = await tabService.createTab('about:blank')
      console.log('[TabBarView] Tab created:', newTab)
      activeTabId.value = newTab.id
    } catch (error) {
      console.error('[TabBarView] Failed to create tab:', error)
    }
  } else {
    console.warn('[TabBarView] tabService not available, using mock')
    // Local state update for standalone mode
    const newTab: TabInfo = {
      id: `tab-${Date.now()}`,
      url: 'about:blank',
      title: '新标签页',
      isActive: true,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    }
    tabs.value.push(newTab)
    activeTabId.value = newTab.id
  }
}

/**
 * Handle go home - open new tab with configured home URL
 */
async function onGoHome(): Promise<void> {
  console.log('[TabBarView] onGoHome called, URL:', appLinks.home)

  if (tabService.isAvailable()) {
    try {
      const newTab = await tabService.createTab(appLinks.home)
      activeTabId.value = newTab.id
    } catch (error) {
      console.error('[TabBarView] Failed to go home:', error)
    }
  }
}

/**
 * Handle help - open new tab with configured help URL
 */
async function onHelp(): Promise<void> {
  console.log('[TabBarView] onHelp called, URL:', appLinks.help)

  if (tabService.isAvailable()) {
    try {
      const newTab = await tabService.createTab(appLinks.help)
      activeTabId.value = newTab.id
    } catch (error) {
      console.error('[TabBarView] Failed to open help:', error)
    }
  }
}

/**
 * Handle URL navigation
 */
async function onNavigate(url: string): Promise<void> {
  const tab = tabs.value.find((t) => t.id === activeTabId.value)
  if (tab) {
    tab.url = url
    tab.isLoading = true
    tab.title = '加载中...'

    if (tabService.isAvailable()) {
      console.log('[TabService] Navigate to:', url)
      await tabService.loadURL(url)
    }
  }
}

/**
 * Handle go back
 */
async function onGoBack(): Promise<void> {
  if (tabService.isAvailable()) {
    await tabService.goBack()
  }
}

/**
 * Handle go forward
 */
async function onGoForward(): Promise<void> {
  if (tabService.isAvailable()) {
    await tabService.goForward()
  }
}

/**
 * Handle reload
 */
async function onReload(): Promise<void> {
  if (tabService.isAvailable()) {
    await tabService.reload()
  }
}

/**
 * Handle stop loading
 */
async function onStop(): Promise<void> {
  if (tabService.isAvailable()) {
    await tabService.stop()
  }
}

/**
 * Update modal handlers
 */
function onUpdateSkip() {
  updateModalVisible.value = false
}

async function onUpdateDownload() {
  updateModalState.value = 'downloading'
  updateProgress.value = 0
  await updateService.download()
}

async function onUpdateInstall() {
  await updateService.install()
}

function onUpdateLater() {
  updateModalVisible.value = false
}

function onUpdateClose() {
  updateModalVisible.value = false
}

// Lifecycle hooks
onMounted(() => {
  console.log('[TabBarView] Component mounted')
  console.log('[TabBarView] window.electron:', !!window.electron)
  initializeTabs()
})

onUnmounted(() => {
  // Clean up event listeners
  unsubscribers.forEach((unsub) => unsub())
})
</script>

<style scoped>
.tab-bar-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 84px; /* 44px TabBar + 40px UrlBar (both border-box) */
  overflow: hidden;
  user-select: none;
}
</style>
