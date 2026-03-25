<template>
  <StyledTabItem :class="{ active: isActive, dragging: isDragging }" @click="onSelect">
    <span class="tab-title">{{ tab.title }}</span>
    <StyledCloseButton @click.stop="onClose">
      <CloseOutlined :style="{ fontSize: '12px' }" />
    </StyledCloseButton>
    <LoadingOutlined v-if="tab.loading" class="tab-loading" />
  </StyledTabItem>
</template>

<script setup lang="ts">
import styled from 'styled-components'
import { CloseOutlined, LoadingOutlined } from '@ant-design/icons-vue'

interface Tab {
  id: string
  title: string
  url: string
  loading?: boolean
}

const props = defineProps<{
  tab: Tab
  isActive: boolean
  isDragging?: boolean
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

const StyledTabItem = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  height: 34px;
  padding: 0 12px;
  margin-right: 2px;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
  max-width: 200px;
  flex-shrink: 0;
  color: #888888;
  font-size: 14px;
  -webkit-app-region: no-drag;

  &:hover {
    background: #252525;
    color: #ffffff;
  }

  &.active {
    background: #252525;
    color: #ffffff;
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
`

const StyledCloseButton = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  opacity: 0;
  border-radius: 3px;
  transition: opacity 0.2s, background 0.2s;
  color: #666666;
  flex-shrink: 0;

  ${StyledTabItem}:hover &, ${StyledTabItem}.active & {
    opacity: 1;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }
`
</script>
