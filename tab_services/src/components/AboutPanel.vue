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
        <a-button type="primary" class="btn-primary" :loading="isChecking" @click="checkUpdate">
          <template #icon><ReloadOutlined /></template>
          检查更新
        </a-button>
        <a-button class="btn-outline" @click="openLink('changelog')">
          查看更新日志
        </a-button>
      </div>
      <p v-if="updateMessage" class="update-message">{{ updateMessage }}</p>
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
    <div class="divider"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Checkbox as ACheckbox, Button as AButton } from 'ant-design-vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import PanelHeader from './PanelHeader.vue'
import { updateService, UPDATE_EVENTS } from '../services/updateService'
import { appLinks } from '../config/links'

const version = ref('1.0.0')
const autoUpdate = ref(true)
const isChecking = ref(false)
const updateMessage = ref('')

const unsubscribers: (() => void)[] = []

onMounted(async () => {
  // Fetch actual version
  if (updateService.isAvailable()) {
    const v = await updateService.getVersion()
    version.value = v
  }

  // Subscribe to update events for the settings window
  const unsubAvailable = updateService.subscribe(UPDATE_EVENTS.UPDATE_AVAILABLE, () => {
    updateMessage.value = '发现新版本，请在主窗口查看更新提示'
    isChecking.value = false
  })
  unsubscribers.push(unsubAvailable)

  const unsubNotAvailable = updateService.subscribe(UPDATE_EVENTS.UPDATE_NOT_AVAILABLE, () => {
    updateMessage.value = '当前已是最新版本'
    isChecking.value = false
  })
  unsubscribers.push(unsubNotAvailable)

  const unsubError = updateService.subscribe(UPDATE_EVENTS.UPDATE_ERROR, (data: { message: string }) => {
    updateMessage.value = `检查失败: ${data.message}`
    isChecking.value = false
  })
  unsubscribers.push(unsubError)
})

const checkUpdate = async () => {
  if (isChecking.value) return
  isChecking.value = true
  updateMessage.value = '正在检查更新...'
  await updateService.check()
}

const openLink = (type: string) => {
  console.log('Opening link:', type)

  let url = ''
  switch (type) {
    case 'changelog':
      url = appLinks.home
      break
    case 'update':
      url = appLinks.update
      break
    case 'help':
      url = appLinks.help
      break
    default:
      return
  }

  // Open in external browser
  if (window.electron?.shell) {
    window.electron.shell.openExternal(url)
  } else {
    // Fallback: open in new tab
    window.open(url, '_blank')
  }
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
  gap: 20px;
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
}

.btn-primary:hover {
  background: #722ED1 !important;
  border-color: #722ED1 !important;
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
  margin: 4px 0 0 0;
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

/* Info Items */
.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.info-icon--green {
  color: #52c41a;
}

.info-text {
  font-size: 13px;
  color: #595959;
}

.inline-link {
  color: #967ADC;
  text-decoration: none;
  font-size: 13px;
}

.inline-link:hover {
  text-decoration: underline;
}

/* Info Links */
.info-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-link {
  color: #967ADC;
  text-decoration: none;
  font-size: 14px;
  line-height: 2.2;
}

.info-link:hover {
  text-decoration: underline;
}
</style>
