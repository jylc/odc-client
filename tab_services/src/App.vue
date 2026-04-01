<template>
  <a-config-provider>
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import { ConfigProvider as AConfigProvider } from 'ant-design-vue'
</script>
