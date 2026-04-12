<template>
  <div class="about-panel">
    <PanelHeader title="关于 DBDC" />

    <!-- Hero Section: App Icon + Name + Version + Buttons -->
    <div class="hero">
      <div class="hero-top">
        <div class="app-icon">
          <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="iconGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#B37FEB"/>
                <stop offset="100%" stop-color="#722ED1"/>
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="14" fill="url(#iconGrad)"/>
            <text x="32" y="42" text-anchor="middle" fill="white" font-size="24" font-weight="bold">D</text>
          </svg>
        </div>
        <div class="app-text">
          <h2 class="app-name">DBDC {{ version }}</h2>
          <p class="app-version">当前版本 {{ version }}</p>
        </div>
      </div>
      <div class="hero-actions">
        <a-button
          type="primary"
          class="btn-primary"
          :class="{ 'btn-update-ready': downloadState === 'downloaded' }"
          :loading="downloadState === 'checking' || downloadState === 'downloading'"
          @click="handleUpdateButton"
        >
          <template #icon>
            <CheckCircleFilled v-if="downloadState === 'downloaded'" />
            <ReloadOutlined v-else />
          </template>
          {{ buttonLabel }}
        </a-button>
        <a-button class="btn-outline" @click="toggleChangelog">
          查看更新日志
        </a-button>
      </div>

      <!-- Update status message -->
      <p v-if="updateMessage" class="update-message" :class="{ 'update-message--success': updateAvailable, 'update-message--error': downloadState === 'error' }">
        <CheckCircleFilled v-if="updateAvailable" class="update-icon--success" />
        {{ updateMessage }}
      </p>

      <!-- Download progress bar -->
      <div v-if="downloadState === 'downloading'" class="progress-container">
        <a-progress :percent="downloadProgress" :show-info="true" size="small" stroke-color="#967ADC" />
      </div>
    </div>

    <!-- Divider -->
    <div class="divider"></div>

    <!-- Software Update Section -->
    <div class="section">
      <h3 class="section-title">软件更新</h3>
      <div class="update-option">
        <a-checkbox v-model:checked="autoUpdate">
          新版本发布时提醒我
        </a-checkbox>
      </div>
    </div>

    <!-- Divider -->
    <div v-if="showChangelog" class="divider"></div>

    <!-- Changelog Section -->
    <div v-if="showChangelog" class="section changelog-section">
      <h3 class="section-title">更新日志</h3>
      <div v-if="changelogVersion" class="changelog-version">v{{ changelogVersion }}</div>
      <div v-if="changelogItems.length" class="changelog-list">
        <div v-for="(item, index) in changelogItems" :key="index" class="changelog-item">
          <span class="changelog-bullet"></span>
          <span class="changelog-text" v-html="item"></span>
        </div>
      </div>
      <div v-else class="changelog-empty">暂无更新日志</div>
    </div>

    <!-- Divider -->
    <div class="divider"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Checkbox as ACheckbox, Button as AButton, Progress as AProgress } from 'ant-design-vue'
import { ReloadOutlined, CheckCircleFilled } from '@ant-design/icons-vue'
import PanelHeader from './PanelHeader.vue'
import { updateService, UPDATE_EVENTS } from '../services/updateService'

const version = ref('1.0.0')
const autoUpdate = ref(true)

// Download state machine: idle → checking → downloading → downloaded → (install/restart)
// Or idle → checking → idle (no update)
// Or any → error → idle
type DownloadState = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error'
const downloadState = ref<DownloadState>('idle')
const downloadProgress = ref(0)
const updateMessage = ref('')
const updateAvailable = ref(false)
const updateType = ref<'major' | 'minor' | null>(null)
const newVersion = ref('')

// Changelog state
const showChangelog = ref(false)
const changelogNotes = ref('')
const changelogVersion = ref('')
const changelogItems = computed(() => {
  if (!changelogNotes.value) return []
  return changelogNotes.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\d+\.\s*)(.+)$/)
      if (match) {
        return `<strong>${match[1]}</strong>${match[2]}`
      }
      return line
    })
})

// Unsubscribe functions
const unsubscribers: (() => void)[] = []

onMounted(async () => {
  // Fetch actual version
  if (updateService.isAvailable()) {
    const v = await updateService.getVersion()
    version.value = v
  }

  // Subscribe to download progress events
  setupEventListeners()
})

onUnmounted(() => {
  unsubscribers.forEach((unsub) => unsub())
})

function setupEventListeners() {
  // Major update download progress
  const unsubProgress = updateService.subscribe(
    UPDATE_EVENTS.UPDATE_PROGRESS,
    (data: { progress: number }) => {
      if (updateType.value === 'major') {
        downloadProgress.value = data.progress
        if (downloadState.value !== 'downloading') {
          downloadState.value = 'downloading'
        }
      }
    },
  )
  unsubscribers.push(unsubProgress)

  // Major update downloaded
  const unsubDownloaded = updateService.subscribe(
    UPDATE_EVENTS.UPDATE_DOWNLOADED,
    () => {
      if (updateType.value === 'major') {
        downloadState.value = 'downloaded'
        updateMessage.value = `下载完成，点击"立即更新"安装 v${newVersion.value}`
      }
    },
  )
  unsubscribers.push(unsubDownloaded)

  // Minor update (hotfix) progress
  const unsubHotfix = updateService.subscribe(
    UPDATE_EVENTS.UPDATE_HOTFIX_PROGRESS,
    (data: { status: string; version: string; progress?: number; error?: string }) => {
      // Update the version info if not set yet (e.g. background check)
      if (data.version && !newVersion.value) {
        newVersion.value = data.version
        updateType.value = 'minor'
        updateAvailable.value = true
      }

      if (data.status === 'downloading') {
        if (downloadState.value === 'idle' || downloadState.value === 'checking') {
          downloadState.value = 'downloading'
        }
        if (data.progress !== undefined) {
          downloadProgress.value = data.progress
        }
      } else if (data.status === 'extracting') {
        updateMessage.value = `正在解压更新文件 v${data.version}...`
        downloadProgress.value = 100
      } else if (data.status === 'pending-restart') {
        downloadState.value = 'downloaded'
        updateMessage.value = `热更新准备就绪，点击"立即更新"重启应用 v${data.version}`
      } else if (data.status === 'error') {
        downloadState.value = 'error'
        updateMessage.value = `热更新失败: ${data.error || '未知错误'}`
      }
    },
  )
  unsubscribers.push(unsubHotfix)

  // Error events
  const unsubError = updateService.subscribe(
    UPDATE_EVENTS.UPDATE_ERROR,
    (data: { message: string }) => {
      downloadState.value = 'error'
      updateMessage.value = `更新失败: ${data.message}`
    },
  )
  unsubscribers.push(unsubError)
}

const buttonLabel = computed(() => {
  switch (downloadState.value) {
    case 'checking':
      return '正在检查...'
    case 'downloading':
      return '正在下载...'
    case 'downloaded':
      return '立即更新'
    case 'error':
      return '检查更新'
    default:
      return '检查更新'
  }
})

const handleUpdateButton = async () => {
  switch (downloadState.value) {
    case 'idle':
    case 'error':
      await checkUpdate()
      break
    case 'downloaded':
      await applyUpdate()
      break
  }
}

const checkUpdate = async () => {
  downloadState.value = 'checking'
  updateAvailable.value = false
  updateMessage.value = '正在检查更新...'
  downloadProgress.value = 0

  try {
    // First check if an update is already downloaded in main process
    if (updateService.isAvailable()) {
      const status = await updateService.downloadStatus()

      // Minor: hotfix already downloaded, pending restart
      if (status.state === 'downloaded' && status.updateType === 'minor') {
        updateAvailable.value = true
        updateType.value = 'minor'
        newVersion.value = status.version || ''
        downloadState.value = 'downloaded'
        updateMessage.value = `热更新已就绪，点击"立即更新"重启应用 v${status.version || ''}`
        return
      }

      // Major: installer already downloaded, ready to install
      if (status.state === 'downloaded' && status.updateType === 'major') {
        updateAvailable.value = true
        updateType.value = 'major'
        newVersion.value = status.version || ''
        downloadState.value = 'downloaded'
        updateMessage.value = `安装包已下载完成，点击"立即更新"安装 v${status.version || ''}`
        return
      }

      // Major: download in progress
      if (status.state === 'downloading' && status.updateType === 'major') {
        updateAvailable.value = true
        updateType.value = 'major'
        newVersion.value = status.version || ''
        downloadState.value = 'downloading'
        downloadProgress.value = 0
        updateMessage.value = `正在下载 v${status.version || ''} 安装包...`
        return
      }
    }

    const result = await updateService.check()

    if (!result.hasUpdate) {
      downloadState.value = 'idle'
      updateMessage.value = '当前已是最新版本'
      return
    }

    // Update found — show version info and auto-start download
    updateAvailable.value = true
    updateType.value = result.updateType || null
    newVersion.value = result.version || ''
    updateMessage.value = `检测到最新版本：${result.version}`
    downloadState.value = 'downloading'
    downloadProgress.value = 0

    if (result.updateType === 'major') {
      // Major: explicitly trigger download
      updateMessage.value = `正在下载 v${result.version} 安装包...`
      await updateService.download()
    } else {
      // Minor: checkForUpdate() already triggered hotfix download in main process
      // Just wait for update:hotfix-progress events
      updateMessage.value = `正在下载 v${result.version} 热更新...`
    }
  } catch (error) {
    downloadState.value = 'error'
    updateMessage.value = `检查失败: ${error}`
  }
}

const applyUpdate = async () => {
  if (updateType.value === 'major') {
    await updateService.install()
  } else {
    await updateService.restartApp()
  }
}

const toggleChangelog = async () => {
  if (showChangelog.value) {
    showChangelog.value = false
    return
  }

  // Read releaseNotes: prefer remote result, fallback to local
  if (newVersion.value && changelogNotes.value) {
    // Already loaded
  } else if (updateService.isAvailable()) {
    const result = await updateService.getReleaseNotes()
    changelogNotes.value = result.releaseNotes || ''
    changelogVersion.value = result.version || ''
  }

  showChangelog.value = true
}
</script>

<style scoped>
.about-panel {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* Hero Section */
.hero {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 24px;
}

.hero-top {
  display: flex;
  align-items: center;
  gap: 20px;
}

.app-icon {
  flex-shrink: 0;
}

.app-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-name {
  font-size: 20px;
  font-weight: 600;
  color: #262626;
  margin: 0;
  line-height: 1.4;
}

.app-version {
  font-size: 12px;
  color: #8c8c8c;
  margin: 0;
  line-height: 1;
}

.hero-actions {
  display: flex;
  gap: 12px;
}

/* Buttons */
.btn-primary {
  background: #967ADC !important;
  border-color: #967ADC !important;
  border-radius: 6px;
  font-size: 14px;
  height: 32px;
  min-width: 120px;
}

.btn-primary:hover {
  background: #722ED1 !important;
  border-color: #722ED1 !important;
}

.btn-update-ready {
  background: #52c41a !important;
  border-color: #52c41a !important;
  animation: pulse 1.5s ease-in-out infinite;
}

.btn-update-ready:hover {
  background: #389e0d !important;
  border-color: #389e0d !important;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(82, 196, 26, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(82, 196, 26, 0); }
}

.btn-outline {
  border: 1px solid #e5e7eb;
  color: #262626;
  border-radius: 6px;
  font-size: 14px;
  height: 32px;
}

.btn-outline:hover {
  border-color: #967ADC !important;
  color: #967ADC !important;
}

/* Dividers */
.divider {
  height: 1px;
  background: #f0f0f0;
}

/* Update message */
.update-message {
  font-size: 13px;
  color: #8c8c8c;
  margin: 0;
}

.update-message--success {
  color: #52c41a;
}

.update-message--error {
  color: #ff4d4f;
}

.update-icon--success {
  color: #52c41a;
  margin-right: 4px;
}

/* Progress bar */
.progress-container {
  margin-top: 4px;
}

/* Sections */
.section {
  padding: 16px 0 24px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #8c8c8c;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Changelog Section */
.changelog-section {
  animation: fadeIn 0.2s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.changelog-version {
  font-size: 14px;
  font-weight: 600;
  color: #262626;
  margin-bottom: 10px;
}

.changelog-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.changelog-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: #595959;
}

.changelog-bullet {
  display: inline-block;
  width: 6px;
  height: 6px;
  min-width: 6px;
  border-radius: 50%;
  background: #967ADC;
  margin-top: 7px;
}

.changelog-text :deep(strong) {
  color: #262626;
  font-weight: 600;
}

.changelog-empty {
  font-size: 13px;
  color: #bfbfbf;
}
</style>
