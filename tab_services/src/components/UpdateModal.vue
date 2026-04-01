<template>
  <a-modal
    :open="visible"
    :closable="false"
    :footer="null"
    :width="420"
    centered
    :mask-closable="false"
    class="update-modal"
  >
    <!-- State: Update Available -->
    <template v-if="state === 'available'">
      <div class="modal-body">
        <div class="modal-icon">
          <CloudUploadOutlined :style="{ fontSize: '40px', color: '#722ED1' }" />
        </div>
        <h3 class="modal-title">发现新版本 v{{ updateInfo.version }}</h3>
        <p class="modal-desc" v-if="updateInfo.releaseNotes">{{ updateInfo.releaseNotes }}</p>
        <p class="modal-desc" v-else>新版本已就绪，是否立即升级？</p>
        <div class="modal-actions">
          <a-button @click="onSkip">跳过</a-button>
          <a-button type="primary" @click="onStartDownload">升级</a-button>
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
        <p class="modal-desc">v{{ updateInfo.version }} 已下载完成，重启应用即可完成更新。</p>
        <div class="modal-actions">
          <a-button @click="onLater">稍后</a-button>
          <a-button type="primary" @click="onInstall">更新</a-button>
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
  </a-modal>
</template>

<script setup lang="ts">
import { Modal as AModal, Button as AButton, Progress as AProgress } from 'ant-design-vue'
import {
  CloudUploadOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons-vue'

const props = defineProps<{
  visible: boolean
  state: 'available' | 'downloading' | 'downloaded' | 'error'
  updateInfo: { version: string; releaseNotes?: string }
  progress: number
  errorMessage?: string
}>()

const emit = defineEmits<{
  skip: []
  download: []
  install: []
  later: []
  close: []
}>()

const onSkip = () => emit('skip')
const onStartDownload = () => emit('download')
const onInstall = () => emit('install')
const onLater = () => emit('later')
const onClose = () => emit('close')
</script>

<style scoped>
.modal-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0 8px;
  gap: 12px;
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
