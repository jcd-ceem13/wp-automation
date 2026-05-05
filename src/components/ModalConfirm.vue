<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}>()

const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="modal-overlay" @click.self="emit('cancel')">
        <div class="modal-content card confirm-modal">
          <div class="modal-body text-center">
            <div class="confirm-icon-wrap" :class="type || 'warning'">
              <span v-if="type === 'info'" class="confirm-icon">ℹ</span>
              <span v-else class="confirm-icon">⚠️</span>
            </div>
            <h3>{{ title }}</h3>
            <p>{{ message }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="emit('cancel')">
              {{ cancelText || 'Cancel' }}
            </button>
            <button 
              class="btn" 
              :class="type === 'info' ? 'btn-primary' : 'btn-danger'" 
              @click="emit('confirm')"
            >
              {{ confirmText || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.confirm-modal {
  width: 100%;
  max-width: 400px;
  padding: 0;
  overflow: hidden;
  border-radius: 20px;
  transform-origin: center;
}

.modal-body {
  padding: 32px 24px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.confirm-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  font-size: 2rem;
}

.confirm-icon-wrap.warning {
  background: #fffbeb;
  color: #f59e0b;
}

.confirm-icon-wrap.danger {
  background: #fef2f2;
  color: #ef4444;
}

.confirm-icon-wrap.info {
  background: #eff6ff;
  color: #3b82f6;
}

.modal-body h3 {
  font-size: 1.25rem;
  font-weight: 800;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.modal-body p {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.modal-footer {
  padding: 16px 24px 24px;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
}

.modal-footer button {
  justify-content: center;
  text-align: center;
}

.btn-danger {
  background: white;
  color: #ef4444;
  border: 1px solid #fecdd3;
  transition: all 0.2s;
}

.btn-danger:hover {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
}

/* Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .confirm-modal {
  transform: scale(0.9) translateY(20px);
}

.modal-fade-leave-to .confirm-modal {
  transform: scale(0.95);
}
</style>
