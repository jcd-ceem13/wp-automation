<script setup lang="ts">
import { computed, ref } from 'vue'
import { appStore, allProviders, removeFromQueue, showToast } from '../store'
import type { AIProvider, PostQueue } from '../types'
import ModalConfirm from './ModalConfirm.vue'

function siteNameById(id: string) {
  return appStore.sites.find(s => s.id === id)?.url || 'Unknown Site'
}

const recentPosts = () => appStore.queue.slice(0, 5)

const previewId = ref<string | null>(null)

// Modal State
const showDeleteModal = ref(false)
const deletePostId = ref<string | null>(null)

function statusBadgeClass(status: string) {
  return {
    published: 'badge-green',
    scheduled: 'badge-orange',
    draft:     'badge-purple',
    failed:    'badge-red'
  }[status] || 'badge-purple'
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatDateTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function providerByPost(post: PostQueue) {
  return allProviders.value.find((p: AIProvider) => p.id === post.aiProvider)
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  showToast('info', 'Copied!', 'Content copied to clipboard.')
}

function handleDelete(id: string) {
  deletePostId.value = id
  showDeleteModal.value = true
}

function confirmDelete() {
  if (deletePostId.value) {
    removeFromQueue(deletePostId.value)
    showToast('info', 'Deleted', 'Post removed from queue.')
  }
  showDeleteModal.value = false
  deletePostId.value = null
}

function togglePreview(id: string) {
  previewId.value = previewId.value === id ? null : id
}

const connectedProviders = computed(() => allProviders.value.filter((p: AIProvider) => appStore.apiKeys[p.id]))
</script>

<template>
  <div class="dashboard">
    <!-- Welcome Banner -->
    <div class="welcome-banner">
      <div class="welcome-content">
        <h2 class="welcome-title">Welcome back!</h2>
        <p class="welcome-sub">Your AI-powered WordPress automation hub is ready.</p>
        <div class="welcome-actions">
          <button class="btn btn-primary" @click="appStore.activePage = 'generate'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Generate Post
          </button>
          <button class="btn btn-ghost" @click="appStore.activePage = 'queue'">
            Manage Queue
          </button>
        </div>
      </div>
      <div class="welcome-graphic">
        <div class="orb orb-1" />
        <div class="orb orb-2" />
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card stat-card--total">
        <div class="stat-icon-wrapper">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <div class="stat-info">
          <div class="stat-val">{{ appStore.stats.total }}</div>
          <div class="stat-lbl">Total Posts</div>
        </div>
      </div>
      <div class="stat-card stat-card--published">
        <div class="stat-icon-wrapper text-success">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div class="stat-info">
          <div class="stat-val text-success">{{ appStore.stats.published }}</div>
          <div class="stat-lbl">Published</div>
        </div>
      </div>
      <div class="stat-card stat-card--queued">
        <div class="stat-icon-wrapper text-warning">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        </div>
        <div class="stat-info">
          <div class="stat-val text-warning">{{ appStore.stats.scheduled }}</div>
          <div class="stat-lbl">Scheduled</div>
        </div>
      </div>
      <div class="stat-card stat-card--draft">
        <div class="stat-icon-wrapper text-accent">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </div>
        <div class="stat-info">
          <div class="stat-val text-accent">{{ appStore.stats.draft }}</div>
          <div class="stat-lbl">Pending</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Recent Posts -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Recent Posts</span>
          <button class="btn btn-ghost btn-sm" @click="appStore.activePage = 'queue'">View All</button>
        </div>
        <div v-if="recentPosts().length === 0" class="empty-state">
          <p>No posts yet. Generate your first post!</p>
          <button class="btn btn-primary btn-sm mt-2" @click="appStore.activePage = 'generate'">Get Started</button>
        </div>
        <div v-else class="post-list">
          <div v-for="post in recentPosts()" :key="post.id" class="post-item">
            <!-- Header row -->
            <div class="post-item-header">
              <div class="post-item-left">
                <div class="post-ai-icon-bg" :style="{ color: providerByPost(post)?.color }">
                  {{ providerByPost(post)?.icon || '🤖' }}
                </div>
                <div class="post-item-info">
                  <div class="post-item-title">{{ post.title }}</div>
                  <div class="post-item-pills">
                    <span v-if="post.authorName" class="pill pill-muted">{{ post.authorName }}</span>
                    <span class="pill pill-muted">{{ post.wordCount.toLocaleString() }} words</span>
                    <span class="pill pill-muted">{{ timeAgo(post.createdAt) }}</span>
                    <span v-if="post.aiModel" class="pill pill-accent font-mono">{{ post.aiModel }}</span>
                    <span v-if="post.siteId" class="pill pill-site">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                      {{ siteNameById(post.siteId) }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2" style="flex-shrink:0">
                <span v-if="post.status === 'published' || post.wpPostId" class="badge-v2 badge-v2--success">PUBLISHED</span>
                <span v-else-if="post.status === 'scheduled'" class="badge-v2 badge-v2--warning">SCHEDULED</span>
                <span v-else-if="post.status === 'failed'" class="badge-v2 badge-v2--danger">FAILED</span>
                <span v-else :class="['badge-v2', post.wpStatus === 'publish' ? 'badge-v2--primary' : 'badge-v2--muted']">
                  {{ post.wpStatus === 'publish' ? 'PENDING' : (post.wpStatus ? post.wpStatus.toUpperCase() : 'DRAFT') }}
                </span>
              </div>
            </div>

            <!-- Excerpt -->
            <div v-if="post.excerpt" class="post-item-excerpt">
              {{ post.excerpt }}
            </div>



            <!-- Dates -->
            <div v-if="post.scheduledAt || post.publishedAt" class="post-dates">
              <span v-if="post.scheduledAt && post.status !== 'published'" class="date-info">Scheduled: {{ formatDateTime(post.scheduledAt) }}</span>
              <span v-if="post.publishedAt" class="date-info text-success">Published: {{ formatDateTime(post.publishedAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right column -->
      <div class="dashboard-right">
        <!-- WordPress Sites -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">WP Sites</span>
            <button class="btn btn-ghost btn-sm" @click="appStore.activePage = 'sites'">Manage</button>
          </div>
          <div v-if="appStore.sites.length === 0" class="empty-state-sm">
            <p class="text-sm text-muted">No sites connected yet.</p>
            <button class="btn btn-ghost btn-sm mt-2" @click="appStore.activePage = 'sites'">+ Add Site</button>
          </div>
          <div v-else class="site-list">
            <div v-for="site in appStore.sites" :key="site.id" class="site-card-sm">
              <div class="site-info-sm">
                <img v-if="site.logoUrl" :src="site.logoUrl" class="site-logo-xs" />
                <div v-else class="site-logo-placeholder-xs">{{ site.name.charAt(0) }}</div>
                <span class="site-name-sm truncate">{{ site.name }}</span>
              </div>
              <div class="site-status-sm" :class="site.connected ? 'status-green' : 'status-gray'" />
            </div>
          </div>
        </div>

        <!-- Quick Generate -->
        <div class="card mt-3 quick-gen">
          <div class="card-header" style="padding: 0 0 12px 0; border-bottom: 1px solid var(--border); margin-bottom: 12px;">
            <span class="card-title">Quick Actions</span>
          </div>
          <div class="quick-actions-grid">
            <button class="btn btn-primary btn-full" @click="appStore.activePage = 'generate'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              New Post
            </button>
            <button class="btn btn-ghost btn-full" @click="appStore.activePage = 'queue'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
              Manage Queue
            </button>
            <button class="btn btn-ghost btn-full" @click="appStore.activePage = 'settings'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              API Keys
            </button>
          </div>
        </div>
      </div>
    </div>

    <ModalConfirm
      :show="showDeleteModal"
      title="Delete Post?"
      message="Are you sure you want to remove this post from the queue?"
      confirmText="Yes, Delete"
      type="danger"
      @confirm="confirmDelete"
      @cancel="showDeleteModal = false"
    />
  </div>
</template>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 20px; }

/* Welcome Banner */
.welcome-banner {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  position: relative;
  background: linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(6,182,212,0.05) 100%);
  border-color: rgba(139,92,246,0.2);
}
@media (max-width: 640px) {
  .welcome-banner { padding: 20px; flex-direction: column; align-items: flex-start; text-align: left; }
  .welcome-title { font-size: 24px !important; }
  .welcome-sub { font-size: 0.85rem; margin-bottom: 16px; }
  .welcome-actions { width: 100%; }
  .welcome-actions .btn { flex: 1; }
}
.welcome-title { font-size: 35px; margin-bottom: 6px; background: var(--grad-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.welcome-sub   { color: var(--text-secondary); margin-bottom: 20px; }
.welcome-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.welcome-graphic {
  position: relative;
  width: 100px; height: 100px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.rocket { font-size: 2.5rem; z-index: 1; animation: float 3s ease-in-out infinite; }
.rocket { font-size: 2.5rem; z-index: 1; animation: float 3s ease-in-out infinite; }
.orb { position: absolute; border-radius: 50%; filter: blur(30px); }
.orb-1 { width: 120px; height: 120px; background: rgba(139,92,246,0.25); top: -20px; right: -20px; animation: float 6s ease-in-out infinite; }
.orb-2 { width: 100px; height: 100px; background: rgba(6,182,212,0.2); bottom: -30px; left: 40%; animation: float 8s ease-in-out infinite reverse; }
@keyframes float { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-15px) scale(1.05); } }
@keyframes pulse-orb { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.2); opacity: 1; } }
@media (max-width: 480px) { 
  .welcome-title { font-size: 28px; }
  .welcome-graphic { display: none; } 
}

/* Stats Grid */
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 640px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.stat-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); border-color: var(--purple); }
.stat-icon-wrapper { 
  width: 48px; height: 48px; 
  display: flex; align-items: center; justify-content: center; 
  background: var(--bg-deep); border-radius: 12px;
  color: var(--text-muted);
}
.stat-val  { font-size: 1.8rem; font-weight: 800; line-height: 1; margin-bottom: 2px; }
.stat-lbl  { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }

/* Dashboard Grid */
.dashboard-grid { display: grid; grid-template-columns: 1fr 340px; gap: 16px; align-items: start; }
@media (max-width: 960px) { .dashboard-grid { grid-template-columns: 1fr; } }

/* Post List */
.empty-state { text-align: center; padding: 30px 0; color: var(--text-muted); }
.empty-state .empty-icon { font-size: 2.5rem; margin-bottom: 8px; }
.empty-state-sm { padding: 8px 0; }

.post-item-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.post-item-left  { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
.post-ai-icon-bg { 
  width: 36px; height: 36px; 
  display: flex; align-items: center; justify-content: center; 
  background: var(--bg-deep); border-radius: 10px;
  font-size: 1.2rem; flex-shrink: 0;
}
.post-item-title { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; line-height: 1.4; }
.post-item-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.pill { 
  font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 6px; 
  display: flex; align-items: center; gap: 4px;
}
.pill-muted { background: var(--bg-deep); color: var(--text-muted); }
.pill-accent { background: rgba(139,92,246,0.08); color: var(--purple); border: 1px solid rgba(139,92,246,0.1); }
.pill-site { background: rgba(6,182,212,0.08); color: var(--cyan); border: 1px solid rgba(6,182,212,0.1); }

.badge-v2 { font-size: 0.65rem; font-weight: 800; padding: 4px 10px; border-radius: 8px; letter-spacing: 0.02em; }
.badge-v2--success { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
.badge-v2--warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); }
.badge-v2--danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
.badge-v2--primary { background: rgba(139, 92, 246, 0.1); color: var(--purple); border: 1px solid rgba(139, 92, 246, 0.2); }
.badge-v2--muted { background: var(--bg-deep); color: var(--text-muted); border: 1px solid var(--border); }

.post-item-excerpt { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-top: 12px; padding-left: 50px; }
.post-dates { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; padding-left: 50px; }
.date-info { font-size: 0.72rem; color: var(--text-muted); font-weight: 500; }
.post-item-actions {
  display: flex; gap: 8px; flex-wrap: wrap;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--border);
}
.content-preview-mini {
  margin-top: 10px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.7;
}
.content-preview-mini :deep(h2) { font-size: 1rem; color: var(--purple); margin: 10px 0 5px; }
.content-preview-mini :deep(h3) { font-size: 0.9rem; color: var(--cyan); margin: 8px 0 4px; }
.content-preview-mini :deep(p)  { margin-bottom: 8px; }

.tag-chip {
  padding: 2px 8px;
  background: rgba(139,92,246,0.1);
  border: 1px solid rgba(139,92,246,0.2);
  border-radius: var(--radius-full);
  font-size: 0.65rem;
  color: var(--purple);
}

/* Provider chips */
.providers-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.provider-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.72rem;
  color: var(--text-muted);
  transition: all var(--transition);
}
.provider-chip.active { border-color: rgba(16,185,129,0.3); color: var(--text-primary); }
.provider-chip-icon { font-size: 0.9rem; }
.provider-chip-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-chip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

/* Site list */
.post-list { display: flex; flex-direction: column; gap: 12px; }
.post-item {
  display: flex; flex-direction: column; padding: 14px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: all var(--transition);
}
.post-item:hover { border-color: rgba(139,92,246,0.3); background: var(--bg-card-hover); }
.post-ai-icon { font-size: 1.4rem; flex-shrink: 0; margin-top: 2px; }
/* Site chips/cards */
.site-list { display: flex; flex-direction: column; gap: 8px; }
.site-card-sm {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px; background: var(--bg-deep); border: 1px solid var(--border);
  border-radius: 10px; transition: all 0.2s;
}
.site-card-sm:hover { border-color: var(--purple); background: var(--bg-input); }
.site-info-sm { display: flex; align-items: center; gap: 10px; min-width: 0; }
.site-logo-xs { width: 22px; height: 22px; border-radius: 4px; object-fit: cover; }
.site-logo-placeholder-xs { 
  width: 22px; height: 22px; border-radius: 4px; 
  background: var(--purple); color: white; 
  display: flex; align-items: center; justify-content: center; 
  font-size: 0.7rem; font-weight: 800;
}
.site-name-sm { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); }
.site-status-sm { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.status-green { background: var(--green); box-shadow: 0 0 6px var(--green); }
.status-gray  { background: var(--text-muted); }

/* Quick Actions */
.quick-actions-grid { display: flex; flex-direction: column; gap: 8px; }
.quick-actions-grid .btn { justify-content: flex-start; gap: 10px; padding: 10px 14px; }

.mt-3 { margin-top: 12px; }
.mb-3 { margin-bottom: 12px; }

@media (max-width: 640px) {
  .post-item-excerpt, .post-dates { padding-left: 0; }
  .post-item-header { flex-direction: column; align-items: flex-start; }
  .post-item-header .flex { margin-top: 8px; }
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .stat-card { padding: 12px; gap: 10px; }
  .stat-icon-wrapper { width: 36px; height: 36px; border-radius: 8px; }
  .stat-val { font-size: 1.4rem; }
  .stat-lbl { font-size: 0.65rem; }
}

@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr; }
}
</style>
