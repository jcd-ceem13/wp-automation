<script setup lang="ts">
import { ref } from 'vue'
import { appStore, addSite, removeSite, testSiteConnection, showToast } from '../store'
import type { WordPressSite } from '../types'
import ModalConfirm from './ModalConfirm.vue'

const showForm  = ref(false)
const testing   = ref<Record<string, boolean>>({})
const saving    = ref(false)

const form = ref({
  name: '',
  url: '',
  username: '',
  appPassword: '',
  logoUrl: ''
})

const showPassword = ref(false)

const editingSiteId = ref<string | null>(null)

// Modal State
const showDeleteModal = ref(false)
const deleteSiteId = ref<string | null>(null)

function resetForm() {
  form.value = { name: '', url: '', username: '', appPassword: '', logoUrl: '' }
  editingSiteId.value = null
  showForm.value = false
}

function handleEdit(site: WordPressSite) {
  editingSiteId.value = site.id
  form.value = {
    name: site.name,
    url: site.url,
    username: site.username,
    appPassword: site.appPassword,
    logoUrl: site.logoUrl || ''
  }
  showForm.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function handleAdd() {
  const { name, url, username, appPassword } = form.value
  if (!name || !url || !username || !appPassword) {
    showToast('warning', 'All fields required', 'Please fill in all site fields.')
    return
  }
  // Normalize URL
  let cleanUrl = url.trim()
  if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl
  cleanUrl = cleanUrl.replace(/\/$/, '')

  saving.value = true
  
  let site: WordPressSite
  if (editingSiteId.value) {
    site = appStore.sites.find(s => s.id === editingSiteId.value)!
    if (site) {
      site.name = name
      site.url = cleanUrl
      site.username = username
      site.appPassword = appPassword
      site.logoUrl = form.value.logoUrl
    }
  } else {
    site = addSite({ name, url: cleanUrl, username, appPassword, logoUrl: form.value.logoUrl })
  }

  await handleTest(site)
  saving.value = false
  resetForm()
}

async function handleTest(site: WordPressSite) {
  testing.value[site.id] = true
  const ok = await testSiteConnection(site)
  testing.value[site.id] = false
  if (ok) {
    showToast('success', 'Connected!', `${site.name} is responding correctly.`)
  } else {
    showToast('error', 'Connection Failed', 'Check the URL, username, and Application Password.')
  }
}

function handleDelete(id: string) {
  deleteSiteId.value = id
  showDeleteModal.value = true
}

function confirmDelete() {
  if (deleteSiteId.value) {
    removeSite(deleteSiteId.value)
    showToast('info', 'Site Removed', 'WordPress site has been removed.')
  }
  showDeleteModal.value = false
  deleteSiteId.value = null
}
</script>

<template>
  <div class="sites-page">
    <!-- Header action -->
    <div class="sites-header">
      <div>
        <h2 class="text-primary" style="font-size: 1rem; font-weight: 700;">Your WordPress Sites</h2>
        <p class="text-sm text-muted">Connect your WordPress sites using Application Passwords.</p>
      </div>
      <button class="btn btn-primary" @click="showForm = !showForm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        Add Site
      </button>
    </div>

    <!-- Add site form -->
    <div v-if="showForm" class="card add-site-form">
      <div class="card-header">
        <span class="card-title">{{ editingSiteId ? 'Edit WordPress Site' : 'New WordPress Site' }}</span>
        <button class="btn btn-ghost btn-sm" @click="resetForm">Cancel</button>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Site Name *</label>
          <input v-model="form.name" class="form-input" placeholder="My Blog" />
        </div>
        <div class="form-group">
          <label class="form-label">WordPress URL *</label>
          <input v-model="form.url" class="form-input" placeholder="https://myblog.com" />
        </div>
        <div class="form-group">
          <label class="form-label">Admin Username or Email *</label>
          <input v-model="form.username" class="form-input" placeholder="e.g. admin" />
        </div>
        <div class="form-group">
          <label class="form-label">Application Password *</label>
          <div class="key-input-wrap">
            <input v-model="form.appPassword" :type="showPassword ? 'text' : 'password'" class="form-input font-mono" placeholder="xxxx xxxx xxxx xxxx" />
            <button class="key-toggle-btn" @click="showPassword = !showPassword">
              <svg v-if="showPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
        <div class="form-group full-span">
          <label class="form-label">Site Logo URL (Optional - detected automatically on test)</label>
          <input v-model="form.logoUrl" class="form-input" placeholder="https://myblog.com/logo.png" />
        </div>
      </div>

      <div class="how-to-card">
        <div class="how-to-title">How to get an Application Password</div>
        <ol class="how-to-steps">
          <li>Go to your WordPress Admin → <strong>Users → Profile</strong></li>
          <li>Scroll to <strong>Application Passwords</strong></li>
          <li>Enter any name (e.g., "AI Autopost") and click <strong>Add New</strong></li>
          <li>Copy the generated password and paste it above</li>
        </ol>
      </div>

      <button class="btn btn-primary btn-full" :disabled="saving" @click="handleAdd" style="margin-top: 16px;">
        <span v-if="saving" class="spinner" />
        {{ saving ? 'Testing Connection...' : (editingSiteId ? 'Save Changes & Test' : 'Add & Test Connection') }}
      </button>
    </div>

    <!-- Sites list -->
    <div v-if="appStore.sites.length === 0 && !showForm" class="empty-sites">
      <h3>No sites connected</h3>
      <p>Add your first WordPress site to start publishing.</p>
      <button class="btn btn-primary mt-3" @click="showForm = true">Add WordPress Site</button>
    </div>

    <div class="sites-grid">
      <div v-for="site in appStore.sites" :key="site.id" class="site-card card">
        <!-- Status indicator -->
        <div class="site-card-header">
            <div class="site-status-row">
              <img v-if="site.logoUrl" :src="site.logoUrl" class="site-logo-mini" />
              <div v-else class="site-logo-placeholder">{{ site.name.charAt(0) }}</div>
              <div class="site-info-stack">
                <span class="site-name">{{ site.name }}</span>
                <span :class="['status-dot', site.connected ? 'status-green' : 'status-gray']" />
              </div>
            </div>
          <span :class="['badge', site.connected ? 'badge-green' : 'badge-red']">
            {{ site.connected ? 'Connected' : 'Offline' }}
          </span>
        </div>

        <div class="site-url">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          {{ site.url }}
        </div>

        <div class="site-meta">
          <span class="text-sm text-muted">👤 {{ site.username }}</span>
          <span v-if="site.lastChecked" class="text-xs text-muted">
            Last checked: {{ new Date(site.lastChecked).toLocaleString() }}
          </span>
        </div>

        <!-- Posts from this site -->
        <div class="site-stats">
          <div class="site-stat">
            <span class="site-stat-val">{{ appStore.queue.filter(p => p.siteId === site.id).length }}</span>
            <span class="site-stat-lbl">Total Posts</span>
          </div>
          <div class="site-stat">
            <span class="site-stat-val text-success">{{ appStore.queue.filter(p => p.siteId === site.id && p.status === 'published').length }}</span>
            <span class="site-stat-lbl">Published</span>
          </div>
          <div class="site-stat">
            <span class="site-stat-val text-warning">{{ appStore.queue.filter(p => p.siteId === site.id && p.status === 'scheduled').length }}</span>
            <span class="site-stat-lbl">Scheduled</span>
          </div>
        </div>

        <div class="site-actions-v2">
          <!-- Primary Action -->
          <button class="btn btn-primary btn-sm btn-full" @click="appStore.activePage = 'generate'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Post New Content
          </button>

          <!-- Utility Grid -->
          <div class="utility-grid">
            <button class="btn btn-ghost btn-xs" :disabled="testing[site.id]" @click="handleTest(site)">
              <span v-if="testing[site.id]" class="spinner" style="width:10px;height:10px;" />
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              Test
            </button>
            <a :href="site.url + '/wp-admin'" target="_blank" class="btn btn-ghost btn-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 22 3 22 10"></polyline><line x1="10" y1="14" x2="22" y2="2"></line></svg>
              Admin
            </a>
            <button class="btn btn-ghost btn-xs" @click="handleEdit(site)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Edit
            </button>
            <button 
              class="btn btn-ghost btn-xs" 
              @click="appStore.settings.defaultSiteId = site.id; showToast('success', 'Default Set', `${site.name} set as default.`)"
              :class="{ 'is-default': appStore.settings.defaultSiteId === site.id }"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" :fill="appStore.settings.defaultSiteId === site.id ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              {{ appStore.settings.defaultSiteId === site.id ? 'Default' : 'Set' }}
            </button>
          </div>

          <!-- Danger Area -->
          <div class="danger-row">
            <button class="btn-text-danger" @click="handleDelete(site.id)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Remove Site
            </button>
          </div>
        </div>
      </div>
    </div>

    <ModalConfirm
      :show="showDeleteModal"
      title="Remove Site?"
      message="Are you sure you want to remove this WordPress site? This will not delete any content on WordPress, but will remove it from this dashboard."
      confirmText="Yes, Remove"
      type="danger"
      @confirm="confirmDelete"
      @cancel="showDeleteModal = false"
    />
  </div>
</template>

<style scoped>
.sites-page { display: flex; flex-direction: column; gap: 20px; }

.sites-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  flex-wrap: wrap;
}

.form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 600px) { .form-grid-2 { grid-template-columns: 1fr; } }

.how-to-card {
  background: rgba(6,182,212,0.06);
  border: 1px solid rgba(6,182,212,0.2);
  border-radius: var(--radius-md);
  padding: 14px;
  margin-top: 14px;
}
.how-to-title { font-weight: 600; font-size: 0.85rem; color: var(--cyan); margin-bottom: 8px; }
.how-to-steps { padding-left: 18px; }
.how-to-steps li { font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 6px; }
.how-to-steps strong { color: var(--text-primary); }

/* Empty state */
.empty-sites {
  text-align: center; padding: 60px 20px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.empty-sites-icon { font-size: 3rem; margin-bottom: 8px; }

/* Sites grid */
.sites-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }

.site-card { padding: 18px; display: flex; flex-direction: column; gap: 12px; }

.site-card-header { display: flex; align-items: center; justify-content: space-between; }
.site-status-row  { display: flex; align-items: center; gap: 10px; }
.site-name { font-weight: 700; font-size: 0.95rem; }

.status-indicator { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.status-green { background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse-glow 2s ease-in-out infinite; }
.status-gray  { background: var(--text-muted); }
@keyframes pulse-glow { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

.site-url { font-size: 0.8rem; color: var(--purple); font-family: 'JetBrains Mono', monospace; word-break: break-all; display: flex; align-items: center; gap: 6px; }

.site-meta { display: flex; flex-direction: column; gap: 4px; }

.site-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.site-stat { text-align: center; padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm); }
.site-stat-val { display: block; font-size: 1.2rem; font-weight: 700; }
.site-stat-lbl { display: block; font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; margin-top: 2px; }

.site-actions-v2 {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.utility-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.utility-grid .btn {
  justify-content: center;
  font-size: 0.75rem;
  padding: 6px;
}
.danger-row {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}
.btn-text-danger {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: color 0.2s;
}
.btn-text-danger:hover {
  color: var(--red);
}
.btn.is-default {
  background: rgba(139,92,246,0.1);
  color: var(--purple);
  border-color: var(--purple);
}
.btn.is-default svg {
  fill: var(--purple);
}

.mt-3 { margin-top: 12px; }

/* Password visibility toggle */
.key-input-wrap { position: relative; width: 100%; }
.key-input-wrap .form-input { padding-right: 40px; }
.key-toggle-btn {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; font-size: 0.9rem; line-height: 1;
}
.site-logo-mini {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--bg-surface);
  border: 1px solid var(--border);
}
.site-logo-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--purple);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
}
.site-info-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
</style>
