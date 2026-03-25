import type { Component } from 'vue';

export interface SettingsMenuItem {
  id: string;
  label: string;
  icon?: Component;
  component: Component;
}
