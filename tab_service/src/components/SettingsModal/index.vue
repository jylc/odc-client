<template>
  <a-modal
    v-model:open="visible"
    :footer="null"
    :width="640"
    :style="{ maxWidth: '90vw' }"
  >
    <div class="settings-modal">
      <div class="settings-sidebar">
        <div
          v-for="item in menuItems"
          :key="item.id"
          class="menu-item"
          :class="{ active: activeMenu === item.id }"
          @click="activeMenu = item.id"
        >
          <component :is="item.icon" v-if="item.icon" class="menu-icon" />
          <span class="menu-label">{{ item.label }}</span>
        </div>
      </div>
      <div class="settings-content">
        <component :is="currentPanel" />
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef } from 'vue'
import { Modal as AModal } from 'ant-design-vue'
import { InfoCircleOutlined } from '@ant-design/icons-vue'
import AboutPanel from './panels/AboutPanel.vue'
import type { SettingsMenuItem } from '../../types/settings'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const visible = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

const activeMenu = ref('about')

// Menu items configuration - easily extensible
const menuItems = shallowRef<SettingsMenuItem[]>([
  {
    id: 'about',
    label: '关于DBDC',
    icon: InfoCircleOutlined,
    component: AboutPanel
  }
  // Add more menu items here in the future:
  // { id: 'general', label: '常规设置', icon: SettingOutlined, component: GeneralPanel },
  // { id: 'shortcuts', label: '快捷键', icon: KeyboardOutlined, component: ShortcutsPanel },
])

const currentPanel = computed(() => {
  const item = menuItems.value.find(m => m.id === activeMenu.value)
  return item?.component || AboutPanel
})
</script>

<style scoped>
.settings-modal {
  display: flex;
  min-height: 400px;
  max-height: 80vh;
  margin: -20px;
}

.settings-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #fafafa;
  border-right: 1px solid #e8e8e8;
  padding: 12px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
  color: #595959;
}

.menu-item:hover {
  background: #f0f0f0;
}

.menu-item.active {
  background: #f7f0ff;
  color: #722ED1;
}

.menu-icon {
  width: 20px;
  height: 20px;
  margin-right: 12px;
}

.menu-label {
  font-size: 14px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  background: #ffffff;
}
</style>
