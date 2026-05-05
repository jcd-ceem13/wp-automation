<script setup lang="ts">
import { appStore } from '../store'

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  generate:  'Generate Content',
  queue:     'Manage Queue',
  media:     'WP Hub Library',
  sites:     'WordPress Sites',
  settings:  'Settings',
  published: 'WordPress Published'
}
</script>

<template>
  <header class="topbar">
    <!-- Mobile menu button -->
    <button class="menu-btn hide-desktop btn btn-icon btn-ghost" @click="appStore.sidebarOpen = true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>

    <!-- Page title -->
    <h1 class="topbar-title">{{ pageTitles[appStore.activePage] || appStore.activePage }}</h1>

    <!-- Right actions -->
    <div class="topbar-right">
      <button class="btn btn-icon btn-ghost" @click="appStore.settings.darkMode = !appStore.settings.darkMode" title="Toggle Theme">
        <span v-if="appStore.settings.darkMode">☀️</span>
        <span v-else>🌙</span>
      </button>

      <button
        class="btn btn-primary btn-sm hide-mobile"
        @click="appStore.activePage = 'generate'"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        New Post
      </button>

      <!-- Status dot -->
      <div class="status-dot">
        <span :class="['dot', appStore.sites.some(s => s.connected) ? 'dot-green' : 'dot-gray']" />
        <span class="hide-mobile text-sm text-muted">
          {{ appStore.sites.filter(s => s.connected).length }} site(s) connected
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: fixed;
  top: 0; right: 0; left: 0;
  height: var(--topbar-h);
  background: var(--bg-card);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  z-index: 100;
}

@media (min-width: 769px) {
  .topbar { left: var(--sidebar-w); }
}

.topbar-title {
  font-size: 1.05rem;
  font-weight: 700;
  flex: 1;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-dot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.dot-green { background: var(--green); box-shadow: 0 0 6px var(--green); animation: pulse 2s infinite; }
.dot-gray  { background: var(--text-muted); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
