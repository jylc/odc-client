<template>
  <div class="url-bar">
    <!-- Navigation buttons -->
    <div class="nav-buttons">
      <a-tooltip title="后退">
        <button
          class="nav-btn"
          :disabled="!canGoBack"
          @click="emit('back')"
        >
          <LeftOutlined :style="{ fontSize: '16px' }" />
        </button>
      </a-tooltip>

      <a-tooltip title="前进">
        <button
          class="nav-btn"
          :disabled="!canGoForward"
          @click="emit('forward')"
        >
          <RightOutlined :style="{ fontSize: '16px' }" />
        </button>
      </a-tooltip>

      <a-tooltip :title="isLoading ? '停止' : '刷新'">
        <button
          class="nav-btn reload-btn"
          :class="{ loading: isLoading }"
          @click="isLoading ? emit('stop') : emit('reload')"
        >
          <ReloadOutlined v-if="!isLoading" :style="{ fontSize: '16px' }" />
          <CloseOutlined v-else :style="{ fontSize: '16px' }" />
        </button>
      </a-tooltip>
    </div>

    <!-- URL input -->
    <div class="url-input-container">
      <a-input
        :value="url"
        placeholder="输入网址或搜索内容"
        @update:value="onUrlChange"
        @keydown.enter="onNavigate"
      >
        <template #prefix>
          <EnvironmentOutlined :style="{ fontSize: '16px', color: '#999' }" />
        </template>
        <template #suffix>
          <a-button type="text" size="small" @click="onNavigate">
            <template #icon>
              <ArrowRightOutlined :style="{ fontSize: '16px', color: '#999' }" />
            </template>
          </a-button>
        </template>
      </a-input>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Input as AInput, Button as AButton, Tooltip as ATooltip } from 'ant-design-vue'
import {
  LeftOutlined,
  RightOutlined,
  ReloadOutlined,
  CloseOutlined,
  EnvironmentOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons-vue'

const props = defineProps<{
  url: string
  canGoBack?: boolean
  canGoForward?: boolean
  isLoading?: boolean
}>()

const emit = defineEmits<{
  navigate: [url: string]
  back: []
  forward: []
  reload: []
  stop: []
}>()

let currentUrl = props.url

const onUrlChange = (value: string) => {
  currentUrl = value
}

const onNavigate = () => {
  let url = (currentUrl || props.url).trim()

  // Add protocol if not present
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    // Check if it looks like a domain
    if (url.includes('.') && !url.includes(' ')) {
      url = 'https://' + url
    } else {
      // Treat as search query
      url = 'https://www.google.com/search?q=' + encodeURIComponent(url)
    }
  }

  if (url) {
    emit('navigate', url)
  }
}
</script>

<style scoped>
.url-bar {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  background: #ffffff;
  border-bottom: 1px solid #e0e0e0;
  gap: 8px;
}

.nav-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #666;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.08);
  color: #333;
}

.nav-btn:active:not(:disabled) {
  background: rgba(0, 0, 0, 0.12);
}

.nav-btn:disabled {
  color: #ccc;
  cursor: not-allowed;
}

.reload-btn.loading svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.url-input-container {
  flex: 1;
  max-width: 800px;
}

.url-input-container :deep(.ant-input) {
  border-radius: 20px;
}
</style>
