<template>
  <div class="update-modal-view">
    <!-- State: Update Available -->
    <template v-if="state === 'available'">
      <div class="modal-body">
        <div class="modal-icon">
          <CloudUploadOutlined :style="{ fontSize: '40px', color: '#722ED1' }" />
        </div>
        <h3 class="modal-title">发现新版本 v{{ version }}</h3>
        <div class="modal-changelog" v-if="releaseNotes">
          <p class="changelog-title">更新内容：</p>
          <div class="changelog-content">{{ releaseNotes }}</div>
        </div>
        <p class="modal-desc" v-else>新版本已就绪，是否立即升级？</p>
        <div class="modal-actions">
          <a-button @click="onLater">稍后更新</a-button>
          <a-button type="primary" @click="onStartDownload">立即下载</a-button>
        </div>
      </div>
    </template>

    <!-- State: Downloading -->
    <template v-else-if="state === 'downloading'">
      <div class="modal-body">
        <div class="modal-icon">
          <LoadingOutlined :style="{ fontSize: '40px', color: '#722ED1' }" :spin="true" />
        </div>
        <h3 class="modal-title">正在下载更新...</h3>
        <a-progress :percent="progress" :stroke-color="'#722ED1'" :show-info="true" />
      </div>
    </template>

    <!-- State: Downloaded -->
    <template v-else-if="state === 'downloaded'">
      <div class="modal-body">
        <div class="modal-icon">
          <CheckCircleOutlined :style="{ fontSize: '40px', color: '#52c41a' }" />
        </div>
        <h3 class="modal-title">更新已就绪</h3>
        <p class="modal-desc">v{{ version }} 已下载完成，重启应用即可完成更新。</p>
        <div class="modal-actions">
          <a-button @click="onLater">稍后</a-button>
          <a-button type="primary" @click="onInstall">安装并重启</a-button>
        </div>
      </div>
    </template>

    <!-- State: Error -->
    <template v-else-if="state === 'error'">
      <div class="modal-body">
        <div class="modal-icon">
          <ExclamationCircleOutlined :style="{ fontSize: '40px', color: '#faad14' }" />
        </div>
        <h3 class="modal-title">更新失败</h3>
        <p class="modal-desc">{{ errorMessage }}</p>
        <div class="modal-actions">
          <a-button type="primary" @click="onClose">确定</a-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Button as AButton, Progress as AProgress } from 'ant-design-vue'
import {
  CloudUploadOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons-vue'
import { updateService, UPDATE_EVENTS } from '../services/updateService'

const state = ref<'available' | 'downloading' | 'downloaded' | 'error'>('available')
const version = ref('')
const releaseNotes = ref('')
const progress = ref(0)
const errorMessage = ref('')

const unsubscribers: (() => void)[] = []

onMounted(() => {
  // Read update info passed via query params (from main process URL)
  const hash = window.location.hash
  const params = new URLSearchParams(hash.split('?')[1] || '')
  version.value = params.get('version') || ''
  releaseNotes.value = params.get('releaseNotes') ? decodeURIComponent(params.get('releaseNotes')!) : ''

  // Subscribe to download progress events
  const unsubProgress = updateService.subscribe(
    UPDATE_EVENTS.UPDATE_PROGRESS,
    (data: { progress: number }) => {
      progress.value = data.progress
    },
  )
  unsubscribers.push(unsubProgress)

  const unsubDownloaded = updateService.subscribe(
    UPDATE_EVENTS.UPDATE_DOWNLOADED,
    () => {
      state.value = 'downloaded'
    },
  )
  unsubscribers.push(unsubDownloaded)

  const unsubError = updateService.subscribe(
    UPDATE_EVENTS.UPDATE_ERROR,
    (data: { message: string }) => {
      state.value = 'error'
      errorMessage.value = data.message
    },
  )
  unsubscribers.push(unsubError)
})

onUnmounted(() => {
  unsubscribers.forEach((unsub) => unsub())
})

const onStartDownload = async () => {
  state.value = 'downloading'
  progress.value = 0
  await updateService.download()
}

const onInstall = async () => {
  await updateService.install()
}

const onLater = () => {
  window.close()
}

const onClose = () => {
  window.close()
}
</script>

<style scoped>
.update-modal-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  user-select: none;
}

.modal-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 24px;
  gap: 12px;
  max-width: 400px;
  width: 100%;
}

.modal-icon {
  margin-bottom: 4px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: #262626;
  margin: 0;
}

.modal-desc {
  font-size: 14px;
  color: #8c8c8c;
  margin: 0;
  text-align: center;
  max-width: 340px;
  word-break: break-word;
}

.modal-changelog {
  width: 100%;
  max-width: 360px;
  text-align: left;
  background: #fafafa;
  border-radius: 8px;
  padding: 12px 16px;
}

.changelog-title {
  font-size: 13px;
  font-weight: 600;
  color: #595959;
  margin: 0 0 6px 0;
}

.changelog-content {
  font-size: 13px;
  color: #8c8c8c;
  white-space: pre-line;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.modal-actions .ant-btn-primary {
  background: #722ED1 !important;
  border-color: #722ED1 !important;
}

.modal-actions .ant-btn-primary:hover {
  background: #9254de !important;
  border-color: #9254de !important;
}
</style>
