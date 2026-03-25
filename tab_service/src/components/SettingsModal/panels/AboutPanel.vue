<template>
  <div class="about-panel">
    <div class="app-info">
      <div class="app-icon">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="12" fill="#722ED1"/>
          <text x="32" y="42" text-anchor="middle" fill="white" font-size="24" font-weight="bold">D</text>
        </svg>
      </div>
      <h2 class="app-name">DBDC</h2>
      <p class="app-version">版本 {{ version }}</p>
    </div>

    <div class="section">
      <h3 class="section-title">软件更新</h3>
      <div class="update-option">
        <a-checkbox v-model:checked="autoUpdate">
          自动检查更新
        </a-checkbox>
      </div>
      <div class="update-actions">
        <a-button type="primary" @click="checkUpdate">
          检查更新
        </a-button>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">其他信息</h3>
      <div class="info-links">
        <a href="#" class="info-link" @click.prevent="openLink('website')">官方网站</a>
        <a href="#" class="info-link" @click.prevent="openLink('changelog')">更新日志</a>
        <a href="#" class="info-link" @click.prevent="openLink('feedback')">问题反馈</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Checkbox as ACheckbox, Button as AButton } from 'ant-design-vue'

const version = ref('1.0.0')
const autoUpdate = ref(true)

const checkUpdate = () => {
  // TODO: Implement update check logic
  console.log('Checking for updates...')
}

const openLink = (type: string) => {
  // TODO: Implement link opening logic
  console.log('Opening link:', type)
}
</script>

<style scoped>
.about-panel {
  padding: 24px;
}

.app-info {
  text-align: center;
  margin-bottom: 32px;
}

.app-icon {
  margin-bottom: 16px;
}

.app-name {
  font-size: 24px;
  font-weight: 600;
  color: #262626;
  margin: 0 0 8px 0;
}

.app-version {
  font-size: 14px;
  color: #595959;
  margin: 0;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 500;
  color: #262626;
  margin: 0 0 16px 0;
}

.update-option {
  margin-bottom: 16px;
}

.update-actions {
  display: flex;
  gap: 12px;
}

.info-links {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-link {
  color: #722ED1;
  text-decoration: none;
  font-size: 14px;
}

.info-link:hover {
  text-decoration: underline;
}
</style>
