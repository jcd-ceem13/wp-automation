<script setup lang="ts">
import { appStore } from '../store'

const icons: Record<string, string> = {
  success: '✅',
  error:   '❌',
  info:    'ℹ️',
  warning: '⚠️'
}
</script>

<template>
  <div class="toast-container">
    <transition-group name="toast-anim">
      <div
        v-for="toast in appStore.toasts"
        :key="toast.id"
        :class="['toast', `toast-${toast.type}`]"
      >
        <span class="toast-icon">{{ icons[toast.type] }}</span>
        <div class="toast-body">
          <div class="toast-title">{{ toast.title }}</div>
          <div v-if="toast.msg" class="toast-msg">{{ toast.msg }}</div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-anim-enter-active { transition: all 0.3s ease; }
.toast-anim-leave-active { transition: all 0.25s ease; }
.toast-anim-enter-from  { opacity: 0; transform: translateX(30px); }
.toast-anim-leave-to    { opacity: 0; transform: translateX(30px); }
</style>
