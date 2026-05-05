<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { appStore, removeFromQueue, deletePost, updateQueueItem, publishPost, showToast, allProviders, updateWordPressPost, getSiteAuthors, createSiteAuthor, getSiteCategories, createSiteCategory, regenerateMeta } from '../store'
import ModalConfirm from './ModalConfirm.vue'

const regeneratingMeta = ref(false)
import type { PostQueue } from '../types'

const filterStatus = ref<string>('all')
const searchQuery  = ref('')
const publishing   = ref<Record<string, boolean>>({})
const expandedId   = ref<string | null>(null)
const previewId    = ref<string | null>(null)

const editingPostId = ref<string | null>(null)

// Modal State
const showDeleteModal = ref(false)
const deletePostId = ref<string | null>(null)
const editForm = reactive({
  title: '',
  content: '',
  excerpt: '',
  tags: '',
  wpStatus: 'publish' as 'publish' | 'draft' | 'pending' | 'future',
  siteId: '',
  authorId: null as number | null,
  authorName: '',
  categories: '',
  featuredImageUrl: '',
  scheduledAt: '',
  affiliateLink: '',
  slug: '',
  focusKeyword: ''
})

const editingPreview = ref(false)

const queueAuthors    = ref<{ id: number; name: string }[]>([])
const loadingAuthors  = ref(false)

const queueCategories    = ref<{ id: number; name: string }[]>([])
const loadingCats        = ref(false)
const showNewCatForm     = ref(false)
const newCatName         = ref('')
const newCatParent       = ref<number | undefined>(undefined)
const creatingCat        = ref(false)

async function fetchQueueAuthors(siteId: string) {
  if (!siteId) return
  loadingAuthors.value = true
  queueAuthors.value = await getSiteAuthors(siteId)
  loadingAuthors.value = false
}

function selectQueueAuthor(a: { id: number; name: string }) {
  editForm.authorId   = a.id
  editForm.authorName = a.name
}

async function fetchQueueCategories(siteId: string) {
  if (!siteId) return
  loadingCats.value = true
  queueCategories.value = await getSiteCategories(siteId)
  loadingCats.value = false
}

function toggleQueueCategory(catName: string) {
  const cats = editForm.categories?.split(',').map(c => c.trim()).filter(Boolean) || []
  const index = cats.indexOf(catName)
  if (index === -1) {
    cats.push(catName)
  } else {
    cats.splice(index, 1)
  }
  editForm.categories = cats.join(', ')
}

async function handleAddQueueCategory() {
  if (!editForm.siteId) { showToast('warning', 'Select Site', 'Select a site first.'); return }
  if (!newCatName.value.trim()) { showToast('warning', 'Enter Name', 'Enter a category name.'); return }
  
  creatingCat.value = true
  const created = await createSiteCategory(editForm.siteId, newCatName.value.trim(), newCatParent.value)
  creatingCat.value = false
  
  if (created) {
    showToast('success', 'Category Created', `"${created.name}" added to WordPress.`)
    queueCategories.value.push(created)
    toggleQueueCategory(created.name)
    newCatName.value = ''
    newCatParent.value = undefined
    showNewCatForm.value = false
  } else {
    showToast('error', 'Failed', 'Could not create category.')
  }
}

const statusOptions = ['all', 'draft', 'scheduled', 'published', 'failed']

const filteredQueue = computed(() => {
  return appStore.queue.filter(p => {
    const matchStatus = filterStatus.value === 'all' ||
      (filterStatus.value === 'published' ? (p.status === 'published' || !!p.wpPostId) :
      filterStatus.value === 'draft'     ? (p.status === 'draft' && !p.wpPostId) :
      p.status === filterStatus.value)
    const matchSearch = !searchQuery.value ||
      p.title.toLowerCase().includes(searchQuery.value.toLowerCase())
    return matchStatus && matchSearch
  })
})

function statusBadgeClass(status: string) {
  return { published: 'badge-green', scheduled: 'badge-orange', draft: 'badge-purple', failed: 'badge-red' }[status] || 'badge-purple'
}

function siteNameById(id: string) {
  return appStore.sites.find(s => s.id === id)?.url || 'Unknown Site'
}

function providerByPost(post: PostQueue) {
  return allProviders.value.find(p => p.id === post.aiProvider)
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatDateTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

async function handlePublish(id: string) {
  publishing.value[id] = true
  await publishPost(id)
  publishing.value[id] = false
}

async function handleDelete(id: string) {
  deletePostId.value = id
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!deletePostId.value) return
  const id = deletePostId.value
  
  showDeleteModal.value = false
  publishing.value[id] = true
  await deletePost(id)
  publishing.value[id] = false
  showToast('info', 'Deleted', 'Post removed completely.')
  deletePostId.value = null
}

function handleEdit(post: PostQueue) {
  editingPostId.value = post.id
  editForm.title = post.title
  editForm.content = post.content
  editForm.excerpt = post.excerpt
  editForm.tags = post.tags.join(', ')
  editForm.wpStatus = post.wpStatus || 'publish'
  if (post.status === 'scheduled') editForm.wpStatus = 'future'
  editForm.siteId = post.siteId
  editForm.authorId = post.authorId || null
  editForm.authorName = post.authorName || ''
  editForm.categories = post.categories?.join(', ') || ''
  editForm.featuredImageUrl = post.featuredImageUrl || ''
  editForm.scheduledAt = post.scheduledAt ? (post.scheduledAt.split('T')[0] ?? '') : ''
  editForm.affiliateLink = post.affiliateLink || ''
  editForm.slug = post.slug || ''
  editForm.focusKeyword = post.focusKeyword || ''
  editingPreview.value = false
  // Reset & auto-fetch authors/categories for this post's site
  queueAuthors.value = []
  queueCategories.value = []
  if (post.siteId) {
    fetchQueueAuthors(post.siteId)
    fetchQueueCategories(post.siteId)
  }
}

async function handleRegenerateMeta() {
  if (!editingPostId.value) return
  const post = appStore.queue.find(p => p.id === editingPostId.value)
  if (!post) return

  regeneratingMeta.value = true
  try {
    const meta = await regenerateMeta({
      providerId: post.aiProvider,
      model: post.aiModel || appStore.selectedModels[post.aiProvider] || '',
      topic: editForm.focusKeyword || post.title,
      content: editForm.content,
    })
    
    if (meta.metaTitle) editForm.title = meta.metaTitle
    if (meta.metaDescription) editForm.excerpt = meta.metaDescription
    
    showToast('success', 'Meta Regenerated', 'Title and excerpt have been updated. Save the post to keep changes.')
  } catch (err: any) {
    showToast('error', 'Regeneration Failed', err.message || String(err))
  } finally {
    regeneratingMeta.value = false
  }
}

async function handleSave(id: string, syncToWp = false) {
  const tagsList = editForm.tags.split(',').map(t => t.trim()).filter(Boolean)
  const catsList = editForm.categories.split(',').map(c => c.trim()).filter(Boolean)
  
  // If we are actively scheduling via the button, enforce wpStatus future
  const isScheduling = syncToWp && editForm.scheduledAt
  const newWpStatus = isScheduling ? 'future' : (editForm.wpStatus === 'future' && !editForm.scheduledAt ? 'publish' : editForm.wpStatus)

  updateQueueItem(id, {
    title: editForm.title,
    content: editForm.content,
    excerpt: editForm.excerpt,
    tags: tagsList,
    categories: catsList,
    wpStatus: newWpStatus,
    siteId: editForm.siteId,
    authorId: editForm.authorId || undefined,
    authorName: editForm.authorName || undefined,
    featuredImageUrl: editForm.featuredImageUrl || undefined,
    scheduledAt: editForm.scheduledAt ? `${editForm.scheduledAt}T09:00:00` : undefined,
    affiliateLink: editForm.affiliateLink || undefined,
    slug: editForm.slug || undefined,
    focusKeyword: editForm.focusKeyword || undefined,
    status: (newWpStatus === 'future' || editForm.scheduledAt) ? 'scheduled' : 'draft',
    error: undefined
  })
  
  const post = appStore.queue.find(p => p.id === id)
  if (!post) return
  
  if (syncToWp && post.siteId) {
    // User explicitly clicked Schedule Post / Auto Sync / Update WP
    publishing.value[id] = true
    if (post.wpPostId) {
      await updateWordPressPost(id)
    } else {
      await publishPost(id)
    }
    publishing.value[id] = false
  } else {
    // Just a local save
    showToast('success', 'Post Updated', 'Changes have been saved locally.')
  }

  editingPostId.value = null
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function togglePreview(id: string) {
  previewId.value = previewId.value === id ? null : id
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  showToast('info', 'Copied!', 'Content copied to clipboard.')
}

function formatSlug(val: string) {
  return val.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
}

function onSlugInput(e: Event) {
  const input = e.target as HTMLInputElement
  editForm.slug = formatSlug(input.value)
}
</script>

<template>
  <div class="queue-page">
    <!-- Toolbar -->
    <div class="queue-toolbar">
      <div class="queue-search">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input v-model="searchQuery" class="search-input" placeholder="Search posts..." />
      </div>
      <div class="queue-filters">
        <button
          v-for="s in statusOptions"
          :key="s"
          :class="['filter-btn', { active: filterStatus === s }]"
          @click="filterStatus = s"
        >
          {{ s === 'all' ? `All (${appStore.queue.length})` : (s === 'draft' ? 'Pending' : s) }}
        </button>
      </div>
    </div>

    <div v-if="filteredQueue.length === 0" class="empty-queue">
      <h3>Queue is empty</h3>
      <p>{{ filterStatus !== 'all' ? `No ${filterStatus === 'draft' ? 'pending' : filterStatus} posts.` : 'Generate your first AI post to get started.' }}</p>
      <button class="btn btn-primary mt-3" @click="appStore.activePage = 'generate'">
        Generate Post
      </button>
    </div>

    <!-- Queue List -->
    <div v-else class="queue-list">
      <div v-for="post in filteredQueue" :key="post.id" class="queue-card card">
        <!-- Edit Mode -->
          <div v-if="editingPostId === post.id" class="edit-mode-form">
            <div class="flex justify-between items-center mb-3">
              <h3 class="text-sm font-bold">Edit Post</h3>
              <div class="flex gap-2">
                <button class="btn btn-primary btn-sm" :disabled="regeneratingMeta" @click="handleRegenerateMeta">
                  <span v-if="regeneratingMeta" class="spinner spinner-white" style="width:12px;height:12px;border-width:1.5px;" />
                  {{ regeneratingMeta ? 'Regenerating...' : 'RE-Generate Meta' }}
                </button>
              </div>
            </div>

            <div class="form-group mb-2">
              <label class="form-label">
                Title
                <span :class="{'text-danger': editForm.title.length > 58}" style="float: right; font-size: 0.75rem; font-weight: 500;">{{ editForm.title.length }} / 58</span>
              </label>
              <input v-model="editForm.title" class="form-input" />
            </div>

            <div class="form-group mb-2">
              <label class="form-label">
                Excerpt
                <span :class="{'text-danger': editForm.excerpt.length > 158}" style="float: right; font-size: 0.75rem; font-weight: 500;">{{ editForm.excerpt.length }} / 158</span>
              </label>
              <textarea v-model="editForm.excerpt" class="form-input" rows="2"></textarea>
            </div>

            <div class="form-group mb-2">
              <div class="flex justify-between items-center mb-1">
                <label class="form-label mb-0" style="margin-bottom: 0;">{{ editingPreview ? 'Content Preview' : 'Content (HTML)' }}</label>
                <button class="btn btn-ghost btn-sm" @click="editingPreview = !editingPreview">
                  {{ editingPreview ? 'Edit Content' : 'Preview' }}
                </button>
              </div>
              <div v-if="editingPreview" class="content-preview-mini mt-1" v-html="editForm.content" style="max-height: 400px; background: white;"></div>
              <textarea v-else v-model="editForm.content" class="form-textarea font-mono mt-1" rows="12" style="font-size: 0.75rem;"></textarea>
            </div>


            <div class="form-group mb-2">
              <label class="form-label">Target WordPress Site</label>
              <select v-model="editForm.siteId" class="form-select">
                <option value="">— Select Site —</option>
                <option v-for="s in appStore.sites" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>

            <div class="form-grid-2 mb-2">
              <div class="form-group">
                <label class="form-label">Focus Keyword</label>
                <input v-model="editForm.focusKeyword" class="form-input" placeholder="e.g. Remote Work" />
              </div>
              <div class="form-group">
                <label class="form-label">Slug</label>
                <input :value="editForm.slug" @input="onSlugInput" class="form-input" placeholder="post-slug-here" />
              </div>
            </div>

            <div class="form-group mb-2">
              <label class="form-label">WordPress Post Status</label>
              <select v-model="editForm.wpStatus" class="form-select">
                <option value="publish">Publish</option>
                <option value="future">Schedule</option>
                <option value="pending">Pending</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            <div class="form-group mb-3">
              <label class="form-label">Author</label>

              <!-- Manual name input -->

              <!-- Manual name input -->
              <input v-model="editForm.authorName" class="form-input" placeholder="Author name (manual or auto-selected)" />
            </div>

            <div class="form-group mb-3">
              <div class="flex justify-between items-center">
                <label class="form-label">Categories (comma separated)</label>
                <div class="flex gap-2">
                  <button class="btn btn-ghost btn-xs" @click="showNewCatForm = !showNewCatForm" :title="showNewCatForm ? 'Cancel' : 'Add New Category'">
                    {{ showNewCatForm ? '✕' : '➕' }}
                  </button>
                  <button class="btn btn-ghost btn-xs" :disabled="loadingCats || !editForm.siteId" @click="fetchQueueCategories(editForm.siteId)" title="Fetch categories">
                    <span v-if="loadingCats" class="spinner" style="width:10px;height:10px;border-width:1.5px;" />
                    {{ loadingCats ? '' : '🔄' }}
                  </button>
                </div>
              </div>

              <div v-if="showNewCatForm" class="new-cat-inline mb-2 fade-in">
                <div class="flex flex-col gap-3">
                  <div class="flex gap-2">
                    <input v-model="newCatName" class="form-input form-input-sm" style="flex:1;" placeholder="New category name..." @keyup.enter="handleAddQueueCategory" />
                    <button class="btn btn-primary btn-sm" :disabled="creatingCat" @click="handleAddQueueCategory">
                      <span v-if="creatingCat" class="spinner spinner-white" style="width:12px;height:12px;" />
                      {{ creatingCat ? '' : 'Create' }}
                    </button>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs font-semibold text-muted">Parent Category (Optional)</label>
                    <select v-model="newCatParent" class="form-select form-select-sm">
                      <option :value="undefined">— None —</option>
                      <option v-for="cat in queueCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="flex gap-2">
                <input v-model="editForm.categories" class="form-input" placeholder="Tech, Productivity" />
              </div>
              <!-- Category Chips -->
              <div v-if="queueCategories.length" class="cat-chip-list mt-2">
                <button
                  v-for="cat in queueCategories"
                  :key="cat.id"
                  :class="['cat-chip', { active: editForm.categories?.includes(cat.name) }]"
                  @click="toggleQueueCategory(cat.name)"
                >
                  {{ cat.name }}
                </button>
              </div>
            </div>

            <div class="form-group mb-3">
              <label class="form-label">Tags (comma separated)</label>
              <input v-model="editForm.tags" class="form-input" />
            </div>

            <!-- Featured Image Preview -->
            <div class="form-group mb-3">
              <label class="form-label">Featured Image URL</label>
              <div class="flex gap-3 items-start">
                <div class="img-preview-box mini" :class="{ 'has-img': editForm.featuredImageUrl }" style="width: 80px; height: 80px; flex-shrink: 0;">
                  <img v-if="editForm.featuredImageUrl" :src="editForm.featuredImageUrl" @error="editForm.featuredImageUrl = ''" />
                  <div v-else class="img-placeholder" style="font-size: 1.2rem;">🖼️</div>
                </div>
                <input v-model="editForm.featuredImageUrl" class="form-input" placeholder="https://..." />
              </div>

              <div class="form-group mb-3">
                <label class="form-label">Affiliate Link</label>
                <input v-model="editForm.affiliateLink" class="form-input" placeholder="https://example.com/ref/123" />
              </div>
            </div>

            <!-- Schedule Setting -->
            <div class="form-group mb-3">
              <label class="form-label">Schedule Date (optional)</label>
              <input type="date" v-model="editForm.scheduledAt" class="form-input" />
            </div>

            <div class="queue-actions">
              <button 
                class="btn btn-primary btn-sm" 
                :disabled="publishing[post.id]"
                @click="handleSave(post.id, true)"
              >
                <span v-if="publishing[post.id]" class="spinner" style="width:12px;height:12px;border-width:1.5px;" />
                {{ post.wpPostId ? 'Update on WordPress' : 'Schedule & Sync to WP' }}
              </button>
              <button class="btn btn-ghost btn-sm" @click="editingPostId = null">Cancel</button>
            </div>
        </div>

        <!-- Read Mode -->
        <template v-else>
          <!-- Status Vertical Accent Bar -->
          <div :class="['card-accent', post.status || 'draft']" />

          <!-- Header row -->
          <div class="queue-card-header">
            <div class="queue-card-left">
              <div class="queue-provider-icon">
                {{ providerByPost(post)?.icon || '🤖' }}
              </div>
                <div class="queue-card-info">
                  <div class="queue-card-title">{{ post.title }}</div>
                  <div class="queue-card-pills">
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
            <div class="queue-card-right flex items-center gap-2">
                <span v-if="post.status === 'published' || post.wpPostId" class="badge-v2 badge-v2--success">PUBLISHED</span>
                <span v-else-if="post.status === 'scheduled'" class="badge-v2 badge-v2--warning">SCHEDULED</span>
                <span v-else-if="post.status === 'failed'" class="badge-v2 badge-v2--danger">FAILED</span>
                <span v-else :class="['badge-v2', post.wpStatus === 'publish' ? 'badge-v2--primary' : 'badge-v2--muted']">
                  {{ post.wpStatus === 'publish' ? 'PENDING' : (post.wpStatus ? post.wpStatus.toUpperCase() : 'DRAFT') }}
                </span>
            </div>
          </div>

          <!-- Excerpt -->
          <div v-if="post.excerpt" class="queue-card-excerpt">
            {{ post.excerpt }}
          </div>

          <!-- Tags -->
          <div v-if="post.tags.length" class="queue-tags">
            <span v-for="tag in post.tags.slice(0, 5)" :key="tag" class="tag-chip">#{{ tag }}</span>
          </div>

          <!-- Scheduled / Published info -->
          <div v-if="post.scheduledAt || post.publishedAt || post.error" class="queue-dates">
            <span v-if="post.scheduledAt && post.status !== 'published'" class="date-info">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Scheduled: {{ formatDateTime(post.scheduledAt) }}
            </span>
            <span v-if="post.publishedAt" class="date-info text-success">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Published: {{ formatDateTime(post.publishedAt) }}
            </span>
            <span v-if="post.error" class="date-info text-danger">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Error: {{ post.error }}
            </span>
          </div>

          <!-- Expandable content preview -->
          <div v-if="previewId === post.id" class="content-preview-mini" v-html="post.content" />

          <!-- Actions -->
          <div class="queue-actions">
            <div class="action-group-left">
              <button class="btn btn-ghost btn-xs" @click="togglePreview(post.id)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                {{ previewId === post.id ? 'Hide' : 'Preview' }}
              </button>
              <button class="btn btn-ghost btn-xs" @click="copyToClipboard(post.content)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy
              </button>
              <button class="btn btn-ghost btn-xs" @click="handleEdit(post)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Edit
              </button>
            </div>
            
            <div class="action-group-right">
              <button
                v-if="post.status !== 'published' && post.status !== 'scheduled' && !post.wpPostId"
                class="btn btn-primary btn-xs"
                :disabled="!post.siteId || publishing[post.id]"
                @click="handlePublish(post.id)"
              >
                <span v-if="publishing[post.id]" class="spinner" style="width:12px;height:12px;border-width:1.5px;" />
                <template v-else>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path><polyline points="16 16 12 12 8 16"></polyline></svg>
                  {{ post.scheduledAt ? 'Schedule' : 'Publish' }}
                </template>
              </button>
              <button
                class="btn btn-danger btn-xs"
                :disabled="publishing[post.id]"
                @click="handleDelete(post.id)"
              >
                <svg v-if="!publishing[post.id]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span v-else class="spinner spinner-white" style="width:12px;height:12px;border-width:1.5px;" />
                Delete
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <ModalConfirm
      :show="showDeleteModal"
      title="Delete Post?"
      message="This will permanently remove the image from your WordPress media library. This action cannot be undone."
      confirmText="Yes, Delete"
      type="warning"
      @confirm="confirmDelete"
      @cancel="showDeleteModal = false"
    />
  </div>
</template>

<style scoped>
.queue-page { display: flex; flex-direction: column; gap: 16px; }

/* Toolbar */
.queue-toolbar {
  display: flex; gap: 12px;
  flex-wrap: wrap; align-items: center;
}
.queue-search {
  position: relative; flex: 1; min-width: 200px;
}
.search-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted);
}
.search-input {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  padding: 9px 12px 9px 34px;
  width: 100%;
  outline: none;
  transition: all var(--transition);
}
.search-input:focus { border-color: var(--border-active); }

.queue-filters { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-btn {
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 0.8rem; font-weight: 500;
  cursor: pointer; font-family: inherit;
  transition: all var(--transition);
  text-transform: capitalize;
}
.filter-btn:hover, .filter-btn.active {
  background: rgba(139,92,246,0.15);
  border-color: rgba(139,92,246,0.5);
  color: var(--purple);
}

/* Empty state */
.empty-queue {
  text-align: center; padding: 60px 20px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.empty-queue-icon { font-size: 3rem; margin-bottom: 8px; }
.empty-queue h3  { color: var(--text-primary); }
.empty-queue p   { color: var(--text-muted); }

/* Queue list */
.queue-list { display: flex; flex-direction: column; gap: 15px; }

.queue-card { padding: 16px; }
.queue-card:hover { border-color: rgba(139,92,246,0.2); }

.queue-card-header {
  display: flex; align-items: flex-start;
  justify-content: space-between; gap: 12px;
}
.queue-card-left { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.queue-provider-icon { 
  width: 36px; height: 36px; 
  display: flex; align-items: center; justify-content: center; 
  background: var(--bg-deep); border-radius: 10px;
  font-size: 1.2rem; flex-shrink: 0;
}
.queue-card-title { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; line-height: 1.4; }
.queue-card-pills { display: flex; flex-wrap: wrap; gap: 6px; }
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

.queue-card-excerpt {
  font-size: 0.8rem;
  color: var(--post-excerpt-color);
  margin: 10px 0;
  overflow: hidden;
  line-height: 1.5;
  display: -webkit-box;
  /* stylelint-disable-next-line */
  -webkit-line-clamp: 2;
  line-clamp: 2;
  /* stylelint-disable-next-line */
  -webkit-box-orient: vertical;
}

.queue-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.tag-chip {
  padding: 3px 8px;
  background: rgba(139,92,246,0.1);
  border: 1px solid rgba(139,92,246,0.2);
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  color: var(--purple);
}

.queue-dates { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; }
.date-info { font-size: 0.75rem; color: var(--text-muted); }

.content-preview-mini {
  margin-top: 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
  max-height: 250px;
  overflow-y: auto;
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.7;
}
.content-preview-mini :deep(h2) { font-size: 1.05rem; color: var(--purple); margin: 12px 0 6px; }
.content-preview-mini :deep(h3) { font-size: 0.95rem; color: var(--cyan); margin: 10px 0 5px; }
.content-preview-mini :deep(p)  { margin-bottom: 8px; }

.queue-actions {
  display: flex; gap: 8px; flex-wrap: wrap;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--border);
}

.mb-2 { margin-bottom: 8px; }
.mb-3 { margin-bottom: 12px; }

.mt-3 { margin-top: 12px; }
.mt-2 { margin-top: 8px; }

/* Author management in edit form */
.author-chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
.author-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: var(--radius-full);
  border: 1px solid var(--border); background: var(--bg-input);
  font-size: 0.78rem; font-weight: 500; cursor: pointer;
  color: var(--text-secondary); font-family: inherit;
  transition: all var(--transition);
}
.author-chip:hover { border-color: rgba(139,92,246,0.5); color: var(--purple); }
.author-chip.active { border-color: var(--purple); background: rgba(139,92,246,0.12); color: var(--purple); }
.author-avatar {
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--grad-primary); color: #fff;
  font-size: 0.6rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.author-check { font-size: 0.65rem; color: var(--green); font-weight: 700; }

.cat-chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
.cat-chip {
  padding: 4px 10px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition);
}
.cat-chip:hover { border-color: var(--purple); color: var(--purple); }
.cat-chip.active { background: rgba(139,92,246,0.1); border-color: var(--purple); color: var(--purple); }

.new-cat-inline { background: var(--bg-deep); padding: 10px; border-radius: var(--radius-md); border: 1px solid var(--border); }
.btn-xs { padding: 4px 8px; font-size: 0.7rem; }
.form-input-sm, .form-select-sm { padding: 6px 10px; font-size: 0.8rem; }

.img-preview-box { background: var(--bg-deep); border: 2px dashed var(--border); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; overflow: hidden; transition: all var(--transition); }
.img-preview-box.has-img { border-style: solid; border-color: var(--purple); background: white; }
.img-preview-box img { width: 100%; height: 100%; object-fit: cover; }
.img-placeholder { display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: 0.5; }
</style>
