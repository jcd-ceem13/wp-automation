<script setup lang="ts">
import { appStore } from '../store'

const navItems = [
  { id: 'dashboard',  label: 'Dashboard',    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>' },
  { id: 'generate',   label: 'Generate Content',     icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' },
  { id: 'queue',      label: 'Manage Queue',   icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>' },
  { id: 'published',  label: 'WordPress Published', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
  { id: 'sites',      label: 'WordPress Sites',     icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>' },
  { id: 'media',     label: 'WP Hub Library', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>' },
  { id: 'settings',   label: 'Settings',     icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>' },
]

function navigate(id: string) {
  appStore.activePage = id
  appStore.sidebarOpen = false
}
</script>

<template>
  <!-- Mobile Overlay -->
  <div
    v-if="appStore.sidebarOpen"
    class="sidebar-overlay"
    @click="appStore.sidebarOpen = false"
  />

  <!-- Sidebar -->
  <aside :class="['sidebar', { open: appStore.sidebarOpen }]">
    <!-- Logo -->
    <div class="sidebar-logo">
      <div class="logo-icon">
        <svg width="24" height="24" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:white;stop-opacity:1" />
              <stop offset="100%" style="stop-color:white;stop-opacity:0.8" />
            </linearGradient>
          </defs>
          <path fill="url(#logoGrad)" d="M50 5 L56 5 L59 22 A32 32 0 0 1 68 26 L82 15 L86 19 L75 33 A32 32 0 0 1 79 42 L95 45 L95 55 L79 58 A32 32 0 0 1 75 67 L86 81 L82 85 L68 74 A32 32 0 0 1 59 78 L56 95 L44 95 L41 78 A32 32 0 0 1 32 74 L18 85 L14 81 L25 67 A32 32 0 0 1 21 58 L5 55 L5 45 L21 42 A32 32 0 0 1 25 33 L14 19 L18 15 L32 26 A32 32 0 0 1 41 22 Z" />
          <circle cx="50" cy="52" r="24" fill="var(--purple)" />
          <circle cx="42" cy="48" r="4" fill="white" />
          <circle cx="58" cy="48" r="4" fill="white" />
          <path d="M38 60 Q50 72 62 60" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" />
        </svg>
      </div>
      <div class="logo-text">
        <span class="logo-name">WP Automation</span>
        <span class="logo-tag">WordPress Automation</span>
      </div>
    </div>

    <div class="divider" style="margin: 0 16px 12px;" />

    <!-- Navigation -->
    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.id"
        :class="['nav-item', { active: appStore.activePage === item.id }]"
        @click="navigate(item.id)"
      >
        <span class="nav-icon" v-html="item.icon" />
        <span class="nav-label">{{ item.label }}</span>
        <span v-if="item.id === 'queue' && appStore.stats.scheduled > 0" class="nav-badge">
          {{ appStore.stats.scheduled }}
        </span>
      </button>
    </nav>

    <!-- Footer stats -->
    <div class="sidebar-footer">
      <div class="sidebar-stats">
        <div class="stat-chip">
          <span class="stat-chip-val text-success">{{ appStore.stats.published }}</span>
          <span class="stat-chip-label">Published</span>
        </div>
        <div class="stat-chip">
          <span class="stat-chip-val text-warning">{{ appStore.stats.scheduled }}</span>
          <span class="stat-chip-label">Scheduled</span>
        </div>
        <div class="stat-chip">
          <span class="stat-chip-val text-accent">{{ appStore.sites.length }}</span>
          <span class="stat-chip-label">Sites</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 200;
  backdrop-filter: blur(2px);
}

.sidebar {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  width: var(--sidebar-w);
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 210;
  transition: transform var(--transition-slow);
}

/* Mobile: hidden by default */
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 16px;
}
.logo-icon {
  width: 40px; height: 40px;
  background: var(--grad-primary);
  border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
}
.logo-name { display: block; font-weight: 800; font-size: 0.95rem; color: var(--text-primary); }
.logo-tag  { display: block; font-size: 0.68rem; color: var(--text-muted); }

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 10px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all var(--transition);
  text-align: left;
  position: relative;
  width: 100%;
}
.nav-item:hover { background: rgba(139,92,246,0.08); color: var(--text-primary); }
.nav-item.active {
  background: rgba(139,92,246,0.15);
  color: var(--purple);
  font-weight: 600;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0; top: 20%; bottom: 20%;
  width: 3px;
  background: var(--grad-primary);
  border-radius: 0 2px 2px 0;
}
.nav-icon { font-size: 1.1rem; width: 22px; text-align: center; }
.nav-label { flex: 1; }
.nav-badge {
  background: var(--purple);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: var(--radius-full);
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border);
}
.sidebar-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.stat-chip {
  display: flex; flex-direction: column; align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 4px;
  gap: 2px;
}
.stat-chip-val   { font-size: 1rem; font-weight: 700; }
.stat-chip-label { font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; }
</style>
