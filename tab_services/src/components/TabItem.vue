<template>
  <div
    class="tab-item"
    :class="{ active: isActive }"
    @click="onSelect"
  >
    <div class="tab-icon">
      <LoadingOutlined v-if="tab.loading" class="tab-loading-icon" :spin="true" />
      <img v-else-if="tab.favicon" :src="tab.favicon" class="tab-favicon" />
      <GlobalOutlined v-else class="tab-default-icon" />
    </div>
    <span class="tab-title">{{ tab.title }}</span>
    <div class="close-button" @click.stop="onClose">
      <CloseOutlined :style="{ fontSize: '12px' }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CloseOutlined, LoadingOutlined, GlobalOutlined } from '@ant-design/icons-vue'

interface Tab {
  id: string
  title: string
  url: string
  loading?: boolean
  favicon?: string
}

defineProps<{
  tab: Tab
  isActive: boolean
}>()

const emit = defineEmits<{
  select: []
  close: []
}>()

const onSelect = () => {
  emit('select')
}

const onClose = () => {
  emit('close')
}
</script>

<style scoped>
.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 34px;
  padding: 0 8px;
  margin-right: 2px;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
  max-width: 200px;
  flex-shrink: 0;
  color: #666666;
  font-size: 14px;
  -webkit-app-region: no-drag;
  gap: 6px;
}

.tab-item:hover {
  background: #e8e8e8;
  color: #333333;
}

.tab-item.active {
  background: #ffffff;
  color: #333333;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
}

.tab-item.active .close-button {
  color: #666666;
}

.tab-item.active .close-button:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #333333;
}

.tab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.tab-loading-icon {
  font-size: 14px;
  color: #722ED1;
}

.tab-favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.tab-default-icon {
  font-size: 14px;
  color: #999;
}

.tab-title {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  opacity: 0;
  border-radius: 3px;
  transition: opacity 0.2s, background 0.2s;
  color: #999999;
  flex-shrink: 0;
}

.tab-item:hover .close-button,
.tab-item.active .close-button {
  opacity: 1;
}

.close-button:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #333333;
}
</style>
