<template>
  <div class="panel-header">
    <span class="panel-title">{{ title }}</span>
    <button class="panel-close" @click="onClose">
      <CloseOutlined :style="{ fontSize: '12px' }" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { CloseOutlined } from '@ant-design/icons-vue'

defineProps<{
  title: string
}>()

const onClose = () => {
  window.close()
}
</script>

<style scoped>
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #262626;
}

.panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  color: #8c8c8c;
}

.panel-close:hover {
  background: #f5f5f5;
  color: #262626;
}
</style>
