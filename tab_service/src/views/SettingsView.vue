<template>
  <div class="settings-view">
    <div class="settings-body">
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef } from 'vue'
import { InfoCircleOutlined } from '@ant-design/icons-vue'
import AboutPanel from '../components/AboutPanel.vue'
import type { SettingsMenuItem } from '../types/settings'

const activeMenu = ref('about')

const menuItems = shallowRef<SettingsMenuItem[]>([
  {
    id: 'about',
    label: '关于DBDC',
    icon: InfoCircleOutlined,
    component: AboutPanel,
  },
])

const currentPanel = computed(() => {
  const item = menuItems.value.find(m => m.id === activeMenu.value)
  return item?.component || AboutPanel
})

</script>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #ffffff;
  -webkit-app-region: drag;
}

.settings-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-sidebar {
  width: 180px;
  flex-shrink: 0;
  background: #fafafa;
  border-right: 1px solid #e8e8e8;
  padding: 8px 0;
  overflow-y: auto;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.2s;
  color: #595959;
  -webkit-app-region: no-drag;
}

.menu-item:hover {
  background: #f0f0f0;
}

.menu-item.active {
  background: #f7f0ff;
  color: #722ED1;
}

.menu-icon {
  width: 18px;
  height: 18px;
  margin-right: 10px;
}

.menu-label {
  font-size: 14px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  background: #ffffff;
  -webkit-app-region: no-drag;
}
</style>
