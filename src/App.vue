<script setup lang="ts">
import { computed } from 'vue'
import AppSidebar  from './components/AppSidebar.vue'
import AppTopbar   from './components/AppTopbar.vue'
import AppToast    from './components/AppToast.vue'
import PageDashboard from './components/PageDashboard.vue'
import PageGenerate  from './components/PageGenerate.vue'
import PageQueue     from './components/PageQueue.vue'
import PageSites     from './components/PageSites.vue'
import PageSettings  from './components/PageSettings.vue'
import PageWPPublished from './components/PageWPPublished.vue'
import PageMedia from './components/PageMedia.vue'
import BottomNav from './components/BottomNav.vue'
import { appStore } from './store'

const pages: Record<string, any> = {
  dashboard: PageDashboard,
  generate:  PageGenerate,
  queue:     PageQueue,
  sites:     PageSites,
  settings:  PageSettings,
  published: PageWPPublished,
  media:     PageMedia,
}

const currentPage = computed(() => pages[appStore.activePage] || PageDashboard)
</script>

<template>
  <div class="app-shell">
    <!-- Sidebar -->
    <AppSidebar />

    <!-- Main area -->
    <div class="app-main">
      <AppTopbar />

      <!-- Page content -->
      <main class="app-content">
        <!-- Ambient background orbs -->
        <div class="bg-orb bg-orb-1" aria-hidden="true" />
        <div class="bg-orb bg-orb-2" aria-hidden="true" />

        <transition name="page-fade" mode="out-in">
          <component :is="currentPage" :key="appStore.activePage" />
        </transition>
      </main>
    </div>

    <!-- Toast notifications -->
    <AppToast />

    <!-- Bottom Nav for Mobile -->
    <BottomNav />
  </div>
</template>

<style>
/* ─── App Shell Layout ─────────────────────────────── */
.app-shell {
  display: flex;
  min-height: 100dvh;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* Push content right of sidebar on desktop */
  margin-left: var(--sidebar-w);
  transition: margin var(--transition-slow);
}

@media (max-width: 768px) {
  .app-main { margin-left: 0; }
}

.app-content {
  flex: 1;
  padding: calc(var(--topbar-h) + 24px) 24px 32px;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

@media (max-width: 640px) {
  .app-content { 
    padding: calc(var(--topbar-h) + 16px) 14px 100px; 
  }
}

/* ─── Background ambient orbs ─── */
.bg-orb {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
  filter: blur(80px);
  opacity: 0.35;
}
.bg-orb-1 {
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%);
  top: -150px; right: -150px;
  animation: drift 12s ease-in-out infinite;
}
.bg-orb-2 {
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 70%);
  bottom: -100px; left: 100px;
  animation: drift 16s ease-in-out infinite reverse;
}
@keyframes drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%       { transform: translate(30px, -20px) scale(1.05); }
  66%       { transform: translate(-20px, 30px) scale(0.95); }
}

/* ─── Page transition ─── */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
