<script setup lang="ts">
import { ref } from 'vue'
import { appStore, showToast, allProviders, getSiteAuthors, createSiteAuthor } from '../store'
import ModalConfirm from './ModalConfirm.vue'
import { TONES, LANGUAGES, TARGET_AUDIENCES } from '../types'

function getKeyUrl(id: string): string {
  const urls: Record<string, string> = {
    openai:     'https://platform.openai.com/api-keys',
    anthropic:  'https://console.anthropic.com/account/keys',
    google:     'https://aistudio.google.com/app/apikey',
    perplexity: 'https://www.perplexity.ai/settings/api',
    deepseek:   'https://platform.deepseek.com/api_keys'
  }
  return urls[id] || ''
}

const showKeys = ref<Record<string, boolean>>({})
const activeTab = ref<'apikeys' | 'defaults' | 'advanced'>('apikeys')

// ── Author management (Manual only) ──────────────────────────────────────────

// Custom Provider State
const showCustomForm = ref(false)
const cpName = ref('')
const cpUrl = ref('')
const cpIcon = ref('🤖')
const cpModels = ref('')

// Modal States
const showDeleteCPModal = ref(false)
const cpToDeleteId = ref<string | null>(null)

const showClearAllModal = ref(false)

const PROVIDER_PRESETS = [
  { name: 'ChatGPT', icon: '🤖', url: 'https://api.openai.com/v1', models: 'gpt-4o, gpt-4o-mini' },
  { name: 'Claude', icon: '🔮', url: 'https://api.anthropic.com/v1', models: 'claude-3-5-sonnet-20240620' },
  { name: 'Gemini', icon: '✨', url: 'https://generativelanguage.googleapis.com/v1beta', models: 'gemini-1.5-pro, gemini-1.5-flash' },
  { name: 'Perplexity', icon: '🔍', url: 'https://api.perplexity.ai', models: 'llama-3.1-sonar-large-128k-online' },
  { name: 'DeepSeek', icon: '🌊', url: 'https://api.deepseek.com/v1', models: 'deepseek-chat, deepseek-reasoner' }
]

function applyPreset(preset: typeof PROVIDER_PRESETS[0]) {
  cpName.value = preset.name
  cpIcon.value = preset.icon
  cpUrl.value = preset.url
  cpModels.value = preset.models
}

function toggleKey(id: string) {
  showKeys.value[id] = !showKeys.value[id]
}


function saveKey(id: string, val: string) {
  appStore.apiKeys[id] = val.trim()
  showToast('success', 'API Key Saved', `${allProviders.value.find(p=>p.id===id)?.name} key saved locally.`)
}

function removeKey(id: string) {
  delete appStore.apiKeys[id]
  showToast('info', 'Key Removed', 'API key has been removed.')
}

function addCustomProvider() {
  if (!cpName.value.trim() || !cpUrl.value.trim() || !cpModels.value.trim()) {
    showToast('warning', 'Missing Fields', 'Please fill out all required custom provider fields.')
    return
  }

  const id = 'custom_' + Date.now()
  const modelsList = cpModels.value.split(',').map(m => m.trim()).filter(Boolean)

  appStore.settings.customProviders.push({
    id,
    name: cpName.value.trim(),
    icon: cpIcon.value,
    color: '#6366f1',
    models: modelsList,
    defaultModel: modelsList[0] || '',
    apiKeyName: 'CUSTOM_API_KEY',
    baseUrl: cpUrl.value.trim().replace(/\/$/, '')
  })

  showToast('success', 'Custom Provider Added', `${cpName.value} is now available.`)
  showCustomForm.value = false
  cpName.value = ''
  cpUrl.value = ''
  cpModels.value = ''
}

function removeCustomProvider(id: string) {
  cpToDeleteId.value = id
  showDeleteCPModal.value = true
}

function confirmDeleteCP() {
  if (cpToDeleteId.value) {
    const id = cpToDeleteId.value
    const idx = appStore.settings.customProviders.findIndex(p => p.id === id)
    if (idx !== -1) {
      appStore.settings.customProviders.splice(idx, 1)
      delete appStore.apiKeys[id]
      showToast('info', 'Provider Deleted', 'Custom provider removed.')
    }
  }
  showDeleteCPModal.value = false
  cpToDeleteId.value = null
}

function saveSettings() {
  showToast('success', 'Settings Saved', 'Your preferences have been updated.')
}

function clearAllData() {
  showClearAllModal.value = true
}

function confirmClearAll() {
  localStorage.clear()
  location.reload()
}

function copySnippet() {
  const code = `add_action( 'rest_api_init', function () {
    $keys = ['rank_math_title', 'rank_math_description', 'rank_math_focus_keyword'];
    foreach ( $keys as $key ) {
        register_meta( 'post', $key, [
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => function() {
                return current_user_can( 'edit_posts' );
            }
        ]);
    }
});`;
  navigator.clipboard.writeText(code);
  showToast('success', 'Snippet Copied!', 'Add this to your theme functions.php file.')
}

function exportData() {
  const data = {
    sites: appStore.sites,
    queue: appStore.queue,
    settings: appStore.settings,
    exportedAt: new Date().toISOString()
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'ai-autopost-backup.json'; a.click()
  URL.revokeObjectURL(url)
  showToast('success', 'Exported!', 'Data exported as JSON.')
}

function importData(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target!.result as string)
      if (data.sites)    appStore.sites    = data.sites
      if (data.queue)    appStore.queue    = data.queue
      if (data.settings) Object.assign(appStore.settings, data.settings)
      showToast('success', 'Imported!', 'Data successfully restored.')
    } catch {
      showToast('error', 'Import Failed', 'Invalid backup file.')
    }
  }
  reader.readAsText(file)
}
function toggleDefaultSchema(type: string) {
  if (!appStore.settings.defaultSelectedSchemas) {
    appStore.settings.defaultSelectedSchemas = []
  }
  const i = appStore.settings.defaultSelectedSchemas.indexOf(type)
  if (i === -1) appStore.settings.defaultSelectedSchemas.push(type)
  else appStore.settings.defaultSelectedSchemas.splice(i, 1)
}
</script>

<template>
  <div class="settings-page">
    <!-- Tabs -->
    <div class="settings-tabs">
      <button :class="['tab-btn', { active: activeTab === 'apikeys' }]" @click="activeTab = 'apikeys'">API Keys</button>
      <button :class="['tab-btn', { active: activeTab === 'defaults' }]" @click="activeTab = 'defaults'">Defaults</button>
      <button :class="['tab-btn', { active: activeTab === 'advanced' }]" @click="activeTab = 'advanced'">Advanced</button>
    </div>

    <!-- API Keys Tab -->
    <div v-if="activeTab === 'apikeys'" class="settings-section">
      <div class="section-header">
        <h2>AI Provider API Keys</h2>
        <p>All keys are stored locally in your browser. Add your built-in provider keys or create a custom one.</p>
      </div>

      <div class="api-key-list">
        <div v-for="provider in allProviders" :key="provider.id" class="api-key-card card">
          <div class="api-key-header">
            <div class="api-key-info">
              <div class="provider-row">
                <span class="provider-icon-lg">{{ provider.icon }}</span>
                <div>
                  <div class="provider-name-lg">
                    {{ provider.name }}
                    <span v-if="provider.id.startsWith('custom_')" class="badge badge-purple" style="margin-left: 8px;">Custom</span>
                  </div>
                  <div class="provider-url text-xs font-mono text-muted">{{ provider.baseUrl }}</div>
                </div>
              </div>
            </div>
            <div class="api-key-status flex gap-2 items-center">
              <span :class="['badge', appStore.apiKeys[provider.id] ? 'badge-green' : 'badge-red']">
                {{ appStore.apiKeys[provider.id] ? '✓ Configured' : 'Not Set' }}
              </span>
            </div>
          </div>

          <div class="api-key-input-row">
            <div class="key-input-wrap">
              <input
                :type="showKeys[provider.id] ? 'text' : 'password'"
                :value="appStore.apiKeys[provider.id] || ''"
                class="form-input font-mono"
                :placeholder="`Enter your ${provider.name} API key...`"
                @input="appStore.apiKeys[provider.id] = ($event.target as HTMLInputElement).value"
              />
              <button class="key-toggle-btn" @click="toggleKey(provider.id)" :title="showKeys[provider.id] ? 'Hide' : 'Show'">
                <svg v-if="showKeys[provider.id]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
              </button>
            </div>
            <button
              class="btn btn-primary btn-sm"
              :disabled="!appStore.apiKeys[provider.id]"
              @click="saveKey(provider.id, appStore.apiKeys[provider.id] || '')"
            >
              Save
            </button>
            <button
              class="btn btn-danger btn-sm"
              @click="removeKey(provider.id)"
            >
              Delete
            </button>
            <button
              v-if="provider.id.startsWith('custom_')"
              class="btn btn-danger btn-sm"
              @click="removeCustomProvider(provider.id)"
            >
              Delete Provider
            </button>
          </div>

          <!-- Model selector -->
          <div class="form-group" style="margin-top: 10px;">
            <label class="form-label">Default Model</label>
            <select v-model="appStore.selectedModels[provider.id]" class="form-select">
              <option v-for="m in provider.models" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>

          <!-- Get key link -->
          <div v-if="getKeyUrl(provider.id)" class="get-key-links">
            <a :href="getKeyUrl(provider.id)" target="_blank" class="text-xs text-accent">
              Get {{ provider.name }} API Key →
            </a>
          </div>
        </div>

        <!-- Add Custom Provider Section -->
        <div class="mt-4">
          <button v-if="!showCustomForm" class="btn btn-secondary btn-full" @click="showCustomForm = true">
            Add Custom Provider
          </button>
          
          <div v-if="showCustomForm" class="card fade-in">
            <h3 class="mb-3 text-sm font-bold">New Custom AI Provider</h3>
            
            <div class="mb-4">
              <label class="form-label text-xs">Quick Presets</label>
              <div class="preset-grid">
                <button 
                  v-for="p in PROVIDER_PRESETS" 
                  :key="p.name" 
                  class="preset-btn"
                  @click="applyPreset(p)"
                >
                  <span>{{ p.icon }}</span>
                  <span>{{ p.name }}</span>
                </button>
              </div>
            </div>

            <p class="text-xs text-muted mb-4">Add any OpenAI-compatible API endpoint (like Ollama, LMStudio, etc.)</p>
            
            <div class="form-grid-2">
              <div class="form-group">
                <label class="form-label">Provider Name *</label>
                <input v-model="cpName" class="form-input" placeholder="e.g. Local Ollama" />
              </div>
              <div class="form-group">
                <label class="form-label">Icon (Emoji)</label>
                <input v-model="cpIcon" class="form-input" placeholder="🦙" />
              </div>
              <div class="form-group full-span">
                <label class="form-label">Base URL * (Must end in /v1 for OpenAI compat)</label>
                <input v-model="cpUrl" class="form-input" placeholder="http://localhost:11434/v1" />
              </div>
              <div class="form-group full-span">
                <label class="form-label">Available Models * (comma separated)</label>
                <input v-model="cpModels" class="form-input" placeholder="llama-3.1-8b, mistral-nemo" />
              </div>
            </div>
            
            <div class="flex justify-between mt-4">
              <button class="btn btn-ghost" @click="showCustomForm = false">Cancel</button>
              <button class="btn btn-primary" @click="addCustomProvider">Add Provider</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Defaults Tab -->
    <div v-if="activeTab === 'defaults'" class="settings-section">
      <div class="section-header">
        <h2>Default Generation Settings</h2>
        <p>These defaults will pre-fill the Generate form for faster workflow.</p>
      </div>

      <div class="card defaults-form">
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Default AI Provider</label>
            <select v-model="appStore.settings.defaultProvider" class="form-select">
              <option v-for="p in allProviders" :key="p.id" :value="p.id">{{ p.icon }} {{ p.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Default Tone</label>
            <select v-model="appStore.settings.defaultTone" class="form-select">
              <option v-for="t in TONES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Default Language</label>
            <select v-model="appStore.settings.defaultLanguage" class="form-select">
              <option v-for="l in LANGUAGES" :key="l.code" :value="l.code">{{ l.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Default Audience</label>
            <select v-model="appStore.settings.defaultAudience" class="form-select">
              <option v-for="a in TARGET_AUDIENCES" :key="a" :value="a">{{ a }}</option>
            </select>
          </div>

          <!-- ── Author Management ─────────────────────────────── -->
          <div class="form-group full-span">
            <label class="form-label">Default Author</label>

            <!-- Site picker + Fetch row -->
            <!-- Current default -->

            <!-- Current default -->
            <div v-if="appStore.settings.defaultAuthorName" class="current-author">
              <span class="text-muted text-xs">Current default:</span>
              <span class="font-semibold text-sm">{{ appStore.settings.defaultAuthorName }}</span>
              <span v-if="appStore.settings.defaultAuthorId" class="badge badge-purple" style="font-size:0.65rem;">ID {{ appStore.settings.defaultAuthorId }}</span>
            </div>

            <!-- Manual name override -->
            <input
              v-model="appStore.settings.defaultAuthorName"
              class="form-input mt-2"
              placeholder="Or type author name manually…"
            />

          </div>
          <div class="form-group full-span">
            <label class="form-label">Default Word Count: {{ appStore.settings.defaultWordCount }}</label>
            <input
              type="range"
              v-model.number="appStore.settings.defaultWordCount"
              min="200" max="3000" step="100"
              class="form-range"
            />
            <div class="range-labels"><span>200</span><span>3000</span></div>
          </div>

          <!-- GEO Optimization Defaults -->
          <div class="form-group full-span">
            <label class="form-label">Default Geo Optimization Toggles</label>
            <div class="flex items-center gap-4 flex-wrap mt-2">
              <label class="toggle-wrapper">
                <div class="toggle">
                  <input type="checkbox" v-model="appStore.settings.defaultIncludeOutline" />
                  <span class="toggle-slider"></span>
                </div>
                <span class="text-sm">Table of Contents</span>
              </label>

              <label class="toggle-wrapper">
                <div class="toggle">
                  <input type="checkbox" v-model="appStore.settings.defaultIncludeStats" />
                  <span class="toggle-slider"></span>
                </div>
                <span class="text-sm">Include Statistics</span>
              </label>

              <label class="toggle-wrapper">
                <div class="toggle">
                  <input type="checkbox" v-model="appStore.settings.defaultIncludeFaq" />
                  <span class="toggle-slider"></span>
                </div>
                <span class="text-sm">FAQ Section</span>
              </label>

              <label class="toggle-wrapper">
                <div class="toggle">
                  <input type="checkbox" v-model="appStore.settings.defaultIncludeQuotes" />
                  <span class="toggle-slider"></span>
                </div>
                <span class="text-sm">Expert Quotes</span>
              </label>

              <label class="toggle-wrapper">
                <div class="toggle">
                  <input type="checkbox" v-model="appStore.settings.defaultIncludeTags" />
                  <span class="toggle-slider"></span>
                </div>
                <span class="text-sm">Auto Tags</span>
              </label>

              <label class="toggle-wrapper">
                <div class="toggle">
                  <input type="checkbox" v-model="appStore.settings.defaultIncludeSchema" />
                  <span class="toggle-slider"></span>
                </div>
                <span class="text-sm">Generate Schema</span>
              </label>
            </div>
          </div>
        </div>
      </div>


          <!-- Image Search APIs -->
          <div class="card mt-4">
            <h3 class="section-title">Media & Image APIs</h3>
            <p class="text-sm text-secondary mb-3">Configure your <strong>gpt-image-1.5</strong> provider for automated image generation.</p>
            <div class="form-grid">
              <div class="form-group full-span">
                <label class="form-label">Image Generation Provider</label>
                <div class="flex gap-2 mb-2">
                  <button 
                    v-for="p in allProviders.filter(p => ['openai', 'google'].includes(p.id))" 
                    :key="p.id"
                    :class="['btn btn-sm', appStore.settings.defaultImageProvider === p.id ? 'btn-primary' : 'btn-ghost']"
                    @click="appStore.settings.defaultImageProvider = p.id"
                  >
                    {{ p.icon }} {{ p.name }}
                  </button>
                </div>
                <div v-if="!appStore.apiKeys[appStore.settings.defaultImageProvider || 'openai']" class="alert alert-warning py-2 px-3 text-xs mb-3">
                  ⚠️ Your current image provider ({{ allProviders.find(p => p.id === (appStore.settings.defaultImageProvider || 'openai'))?.name }}) has no API key. Please add it in the <strong>API Keys</strong> tab.
                </div>
                <p class="text-xxs text-muted mb-3">The system will use the API key configured in your "API Keys" tab for the selected provider.</p>
                
                <div class="form-group">
                  <label class="form-label">{{ allProviders.find(p => p.id === (appStore.settings.defaultImageProvider || 'openai'))?.name }} API Key</label>
                  <div class="api-input-wrapper">
                    <input 
                      :type="showKeys[appStore.settings.defaultImageProvider || 'openai'] ? 'text' : 'password'" 
                      v-model="appStore.apiKeys[appStore.settings.defaultImageProvider || 'openai']" 
                      class="form-input font-mono" 
                      placeholder="sk-..." 
                    />
                    <button class="eye-btn" @click="toggleKey(appStore.settings.defaultImageProvider || 'openai')">
                      {{ showKeys[appStore.settings.defaultImageProvider || 'openai'] ? '👁️' : '🔒' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        

          <!-- Default Selected Schemas -->
          <div v-if="appStore.settings.defaultIncludeSchema" class="mt-4 fade-in" style="background: var(--bg-deep); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border);">
            <label class="form-label mb-3" style="display: flex; align-items: center; justify-content: space-between;">
              <span>Default Selected Schemas</span>
              <span class="text-xs text-accent">Applied to new post generations</span>
            </label>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between;">
              <span v-for="type in ['article', 'faqpage', 'itemlist', 'breadcrumblist', 'imageobject', 'webpage', 'website', 'organization', 'person', 'howto']" 
                :key="type"
                @click="toggleDefaultSchema(type)"
                :style="{
                  fontSize: '0.72rem',
                  background: (appStore.settings.defaultSelectedSchemas || []).includes(type) ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-card)',
                  color: (appStore.settings.defaultSelectedSchemas || []).includes(type) ? 'var(--purple)' : 'var(--text-muted)',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: (appStore.settings.defaultSelectedSchemas || []).includes(type) ? '1px solid var(--purple)' : '1px solid var(--border)',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }"
              >
                <span>{{ type.toUpperCase() }}</span>
                <span v-if="(appStore.settings.defaultSelectedSchemas || []).includes(type)" style="font-size: 0.85em;">✓</span>
              </span>
            </div>
          </div>

      <button class="btn btn-primary mt-4" @click="saveSettings">Save Defaults</button>
    </div>

    <!-- Advanced Tab -->
    <div v-if="activeTab === 'advanced'" class="settings-section">
      <div class="section-header">
        <h2>Advanced</h2>
        <p>Data management, backup and restore.</p>
      </div>

      <div class="card">
        <h3 class="adv-section-title">Data Backup</h3>
        <p class="text-sm text-secondary mt-1">Export your sites, queue and settings as a JSON backup file.</p>
        <button class="btn btn-secondary mt-3" @click="exportData">Export Data</button>

        <div class="divider"></div>

        <h3 class="adv-section-title">Restore from Backup</h3>
        <p class="text-sm text-secondary mt-1">Import a previously exported JSON backup.</p>
        <label class="btn btn-secondary mt-3" style="cursor: pointer;">
          Choose File
          <input type="file" accept=".json" class="hidden-file" @change="importData" />
        </label>

        <div class="divider"></div>

        <h3 class="adv-section-title text-danger">Danger Zone</h3>
        <p class="text-sm text-secondary mt-1">Permanently delete all local data including API keys, sites, and posts.</p>
        <button class="btn btn-danger mt-3" @click="clearAllData">Clear All Data</button>
      </div>

      <!-- RankMath Sync Helper -->
      <div class="card mt-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">:</span>
          <h3 class="adv-section-title">Rankmath SEO sync helper</h3>
        </div>
        <p class="text-sm text-secondary">
          By default, Wordpress blocks external apps from updating Rankmath SEO data. 
          To enable synchronization of <strong>SEO Titles</strong>, <strong>Meta Descriptions</strong>, and <strong>Focus Keywords</strong>, 
          add the following snippet to your theme's <code>functions.php </code> file: or install "CODE SNIPPETS" plugins
        </p>
        
        <div class="code-block-wrapper mt-3">
          <pre class="code-block"><code>add_action( 'rest_api_init', function () {
    $keys = ['rank_math_title', 'rank_math_description', 'rank_math_focus_keyword'];
    foreach ( $keys as $key ) {
        register_meta( 'post', $key, [
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => function() {
                return current_user_can( 'edit_posts' );
            }
        ]);
    }
});</code></pre>
          <button class="btn-copy-code" @click="copySnippet">Copy Snippet</button>
        </div>
        
        <p class="text-xs text-muted mt-3">
          ⚠️ <strong>Note:</strong> After adding this code, SEO details will automatically sync whenever you publish or update a post from this dashboard.
        </p>
      </div>

      <!-- Storage info -->
      <div class="card mt-4">
        <h3 class="adv-section-title">Storage Info</h3>
        <div class="storage-grid mt-3">
          <div class="storage-item">
            <span class="storage-val">{{ appStore.sites.length }}</span>
            <span class="storage-lbl">Sites</span>
          </div>
          <div class="storage-item">
            <span class="storage-val">{{ appStore.queue.length }}</span>
            <span class="storage-lbl">Posts in Queue</span>
          </div>
          <div class="storage-item">
            <span class="storage-val">{{ Object.keys(appStore.apiKeys).length }}</span>
            <span class="storage-lbl">API Keys</span>
          </div>
          <div class="storage-item">
            <span class="storage-val text-success">{{ appStore.stats.published }}</span>
            <span class="storage-lbl">Published</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <ModalConfirm
      :show="showDeleteCPModal"
      title="Delete Provider?"
      message="Are you sure you want to delete this custom provider? This will also remove any saved API key for it."
      confirmText="Yes, Delete"
      type="danger"
      @confirm="confirmDeleteCP"
      @cancel="showDeleteCPModal = false"
    />

    <ModalConfirm
      :show="showClearAllModal"
      title="Clear All Data?"
      message="This will permanently delete ALL data including API keys, connected sites, and your entire post queue. This action cannot be undone."
      confirmText="Yes, Clear Everything"
      type="danger"
      @confirm="confirmClearAll"
      @cancel="showClearAllModal = false"
    />
  </div>
</template>



<style scoped>
.settings-page { display: flex; flex-direction: column; gap: 20px; }

/* Tabs */
.settings-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tab-btn {
  padding: 9px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 0.875rem; font-weight: 500;
  cursor: pointer; font-family: inherit;
  transition: all var(--transition);
}
.tab-btn.active, .tab-btn:hover {
  background: rgba(139,92,246,0.15);
  border-color: rgba(139,92,246,0.5);
  color: var(--purple);
}

/* Section header */
.section-header { margin-bottom: 16px; }
.section-header h2 { font-size: 1rem; margin-bottom: 4px; }
.section-header p  { font-size: 0.82rem; color: var(--text-muted); }

/* API Key list */
.api-key-list { display: flex; flex-direction: column; gap: 12px; }

.api-key-card { padding: 16px; }
.api-key-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; gap: 12px; }

.provider-row  { display: flex; align-items: center; gap: 12px; }
.provider-icon-lg { font-size: 1.6rem; }
.provider-name-lg { font-weight: 700; font-size: 0.95rem; }
.provider-url { margin-top: 2px; }

.api-key-input-row { display: flex; gap: 8px; align-items: center; }
.key-input-wrap { position: relative; flex: 1; }
.key-input-wrap .form-input { padding-right: 40px; }
.key-toggle-btn {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  transition: color 0.2s;
}
.key-toggle-btn:hover { color: var(--purple); }

.get-key-links { margin-top: 10px; }

@media (max-width: 600px) {
  .api-key-header { flex-direction: column; align-items: flex-start; }
  .api-key-status { width: 100%; justify-content: flex-start; }
  .api-key-input-row { flex-direction: column; align-items: stretch; gap: 10px; }
  .api-key-input-row .btn { width: 100%; }
  .settings-tabs { display: grid; grid-template-columns: 1fr 1fr 1fr; }
  .tab-btn { padding: 8px 4px; font-size: 0.75rem; text-align: center; }
}

/* Defaults form */
.form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.full-span    { grid-column: 1 / -1; }
@media (max-width: 600px) { .form-grid-2 { grid-template-columns: 1fr; } }
.form-range { width: 100%; accent-color: var(--purple); cursor: pointer; }
.range-labels { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 4px; }

/* Author management */
.author-fetch-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.author-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.author-chip {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 6px 12px; border-radius: var(--radius-full);
  border: 1px solid var(--border); background: var(--bg-input);
  font-size: 0.8rem; font-weight: 500; cursor: pointer;
  color: var(--text-secondary); font-family: inherit;
  transition: all var(--transition);
}
.author-chip:hover { border-color: rgba(139,92,246,0.5); color: var(--purple); background: rgba(139,92,246,0.06); }
.author-chip.active { border-color: var(--purple); background: rgba(139,92,246,0.12); color: var(--purple); }
.author-avatar {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--grad-primary); color: #fff;
  font-size: 0.65rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.author-check { font-size: 0.7rem; color: var(--green); font-weight: 700; }
.current-author { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.new-author-form {
  margin-top: 12px; padding: 14px;
  background: rgba(99,102,241,0.04);
  border: 1px dashed rgba(99,102,241,0.3);
  border-radius: var(--radius-md);
}
.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 12px; }

/* Advanced */
.adv-section-title { font-size: 0.9rem; font-weight: 700; }
.hidden-file { display: none; }

.storage-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
@media (max-width: 480px) { .storage-grid { grid-template-columns: repeat(2, 1fr); } }
.storage-item { text-align: center; padding: 12px; background: var(--bg-input); border-radius: var(--radius-md); }
.storage-val  { display: block; font-size: 1.5rem; font-weight: 800; color: var(--text-primary); }
.storage-lbl  { display: block; font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; margin-top: 4px; }
.code-block-wrapper { position: relative; }
.code-block {
  background: var(--bg-deep);
  color: var(--text-primary);
  padding: 16px;
  border-radius: var(--radius-md);
  font-family: 'Fira Code', monospace;
  font-size: 0.8rem;
  overflow-x: auto;
  border: 1px solid var(--border);
}
.btn-copy-code {
  position: absolute;
  top: 10px;
  right: 10px;
  background: var(--purple);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-copy-code:hover { opacity: 0.9; }


.fade-in { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

.mt-1 { margin-top: 4px; }
.mt-3 { margin-top: 12px; }
.mt-4 { margin-top: 16px; }

.preset-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.preset-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border: 1px solid var(--border);
  border-radius: var(--radius-md); background: var(--bg-input);
  font-size: 0.75rem; font-weight: 600; cursor: pointer;
  transition: all var(--transition);
  color: var(--text-primary);
}
.preset-btn:hover { border-color: var(--purple); color: var(--purple); background: rgba(139,92,246,0.05); }
</style>
