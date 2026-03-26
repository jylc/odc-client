<template>
  <div
    class="tab-item"
    :class="{ active: isActive }"
    @click="onSelect"
  >
    <span class="tab-title">{{ tab.title }}</span>
    <div class="close-button" @click.stop="onClose">
      <CloseOutlined :style="{ fontSize: '12px' }" />
    </div>
    <LoadingOutlined v-if="tab.loading" class="tab-loading" />
  </div>
</template>

<script setup lang="ts">
import { CloseOutlined, LoadingOutlined } from '@ant-design/icons-vue'

interface Tab {
  id: string
  title: string
  url: string
  loading?: boolean
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
  padding: 0 12px;
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

.tab-item.active .tab-loading {
  color: #722ED1;
}

.tab-title {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin-right: 8px;
}

.tab-loading {
  margin-left: 8px;
  flex-shrink: 0;
  color: #722ED1;
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
