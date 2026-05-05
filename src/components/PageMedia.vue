<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { appStore, getSiteMedia, deleteSiteMedia, updateSiteMediaAlt, showToast, getPublishedPosts, deletePostFromWordPress } from '../store'
import ModalConfirm from './ModalConfirm.vue'

const siteMedia = ref<Record<string, any[]>>({})
const sitePosts = ref<Record<string, any[]>>({})
const loading = ref<Record<string, boolean>>({})
const loadingPosts = ref<Record<string, boolean>>({})
const deletingId = ref<number | null>(null)
const updatingId = ref<number | null>(null)
const activeTab = ref<'media' | 'posts'>('media')

// Modal state
const showEditModal = ref(false)
const editData = ref<{ siteId: string; item: any; newAlt: string } | null>(null)

function openEditModal(siteId: string, item: any) {
  editData.value = { siteId, item, newAlt: item.alt_text || '' }
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  editData.value = null
}

const showDeleteModal = ref(false)
const deleteData = ref<{ type: 'media' | 'post'; siteId: string; id: number; title?: string } | null>(null)

function openDeleteModal(siteId: string, mediaId: number) {
  deleteData.value = { type: 'media', siteId, id: mediaId }
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
  deleteData.value = null
}

async function handleConfirmDelete() {
  if (!deleteData.value) return
  const { type, siteId, id } = deleteData.value
  
  showDeleteModal.value = false
  
  if (type === 'media') {
    deletingId.value = id
    const success = await deleteSiteMedia(siteId, id)
    if (success) {
      showToast('success', 'Deleted', 'Image removed from WordPress media library.')
      siteMedia.value[siteId] = (siteMedia.value[siteId] || []).filter(m => m.id !== id)
    } else {
      showToast('error', 'Delete Failed', 'Could not delete the image.')
    }
    deletingId.value = null
  } else {
    const success = await deletePostFromWordPress(siteId, id)
    if (success) {
      showToast('success', 'Post Deleted', 'Successfully removed from WordPress.')
      sitePosts.value[siteId] = (sitePosts.value[siteId] || []).filter(p => p.id !== id)
    } else {
      showToast('error', 'Delete Failed', 'Check your site connection and permissions.')
    }
  }
  
  deleteData.value = null
}

async function handleUpdateAlt() {
  if (!editData.value) return
  const { siteId, item, newAlt } = editData.value
  
  updatingId.value = item.id
  const success = await updateSiteMediaAlt(siteId, item.id, newAlt)
  
  if (success) {
    showToast('success', 'Alt Text Updated', 'Synced to WordPress.')
    item.alt_text = newAlt
    closeEditModal()
  } else {
    showToast('error', 'Update Failed', 'Could not update alt text.')
  }
  updatingId.value = null
}

async function fetchSiteMedia(siteId: string) {
  loading.value[siteId] = true
  const media = await getSiteMedia(siteId, 20, 1)
  siteMedia.value[siteId] = media
  loading.value[siteId] = false
}

async function fetchSitePosts(siteId: string) {
  loadingPosts.value[siteId] = true
  try {
    const posts = await getPublishedPosts(siteId)
    sitePosts.value[siteId] = posts
  } catch (err) {
    console.error('Failed to fetch posts:', err)
  } finally {
    loadingPosts.value[siteId] = false
  }
}

async function fetchAllData() {
  for (const site of appStore.sites) {
    fetchSiteMedia(site.id)
    fetchSitePosts(site.id)
  }
}

async function handleDeletePost(siteId: string, post: any) {
  deleteData.value = { type: 'post', siteId, id: post.id, title: post.title.rendered }
  showDeleteModal.value = true
}

function handleEditPost(site: any, post: any) {
  const editUrl = `${site.url}/wp-admin/post.php?post=${post.id}&action=edit`
  window.open(editUrl, '_blank')
}

function handleViewLive(url: string) {
  window.open(url, '_blank')
}

onMounted(fetchAllData)
</script>

<template>
  <div class="media-page">
    <div class="page-header hub-page-header">
      <div class="header-content">
        <h2 class="page-title">WP Hub</h2>
        <p class="page-subtitle">
          {{ activeTab === 'media' ? 'Showing the 20 most recent images from each site.' : 'Manage your live content across all connected WordPress sites.' }}
        </p>
      </div>
      <div class="hub-tabs">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'media' }"
          @click="activeTab = 'media'"
        >
          Images
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'posts' }"
          @click="activeTab = 'posts'"
        >
          Published Posts
        </button>
      </div>
    </div>

    <div v-for="site in appStore.sites" :key="site.id" class="site-section">
      <div class="site-header">
        <div class="site-info">
          <div class="site-icon">
            <img v-if="site.logoUrl" :src="site.logoUrl" class="site-logo-img" :alt="site.name" />
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          </div>
          <div class="site-text">
            <h3 class="site-name">{{ site.url.replace('https://', '') }}</h3>
            <span v-if="activeTab === 'media' && siteMedia[site.id]" class="post-count">{{ siteMedia[site.id]?.length }} Media Assets</span>
            <span v-if="activeTab === 'posts' && sitePosts[site.id]" class="post-count">{{ sitePosts[site.id]?.length }} Published Articles</span>
          </div>
        </div>
        <div class="site-actions-top">
          <div v-if="(activeTab === 'media' && loading[site.id]) || (activeTab === 'posts' && loadingPosts[site.id])" class="spinner" style="width:16px;height:16px;" />
          <button v-else class="btn btn-ghost btn-xs" @click="activeTab === 'media' ? fetchSiteMedia(site.id) : fetchSitePosts(site.id)" title="Sync Site Hub">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
        </div>
      </div>
      
      <!-- Media Tab -->
      <div v-if="activeTab === 'media'" class="media-grid-v2">
        <div v-for="item in (siteMedia[site.id] || [])" :key="item.id" class="media-card-v2">
          <div class="media-preview-v2">
            <img :src="item.source_url" :alt="item.alt_text" loading="lazy" />
            <div class="media-overlay-v2">
              <button 
                class="btn-action-round delete" 
                :disabled="deletingId === item.id"
                @click.stop="openDeleteModal(site.id, item.id)"
                title="Delete from WordPress"
              >
                <span v-if="deletingId === item.id" class="spinner" style="width:16px;height:16px;border-width:2px;border-top-color:white;" />
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
              <button 
                class="btn-action-round edit" 
                @click.stop="openEditModal(site.id, item)"
                title="Edit Alt Text"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
            </div>
          </div>
          <div class="media-info-v2">
            <div class="media-alt-text" :title="item.alt_text">
              {{ item.alt_text || 'Untitled Asset' }}
            </div>
            <div class="media-meta-v2">
              <div class="meta-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                <span>{{ item.media_details?.width }}×{{ item.media_details?.height }}</span>
              </div>
              <div class="meta-tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                <span>{{ item.mime_type?.split('/')[1].toUpperCase() }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Posts Tab -->
      <div v-if="activeTab === 'posts'" class="post-grid">
        <div v-for="post in (sitePosts[site.id] || [])" :key="post.id" class="post-card">
          <div class="post-content">
            <h4 class="post-title" v-html="post.title?.rendered || 'Untitled'"></h4>
            <div class="post-excerpt" v-html="post.excerpt?.rendered || ''"></div>
            <div class="post-meta-row">
              <div class="meta-left">
                <div class="meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span>ID: {{ post.id }}</span>
                </div>
                <div class="meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>{{ post.date ? new Date(post.date).toLocaleDateString() : '—' }}</span>
                </div>
              </div>
              <span class="status-badge-v2">{{ (post.status || 'unknown').toUpperCase() }}</span>
            </div>
          </div>
          <div class="post-actions-v2">
            <div class="actions-main">
              <button class="btn-action-v2" @click="handleViewLive(post.link)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                View
              </button>
              <button class="btn-action-v2" @click="handleEditPost(site, post)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
            </div>
            <button class="btn-trash-v2" @click="handleDeletePost(site.id, post)" title="Delete Post">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Empty states -->
      <div v-if="activeTab === 'media' && !loading[site.id] && (!siteMedia[site.id] || siteMedia[site.id]?.length === 0)" class="empty-state">
        <p>No images found for this site.</p>
      </div>
      <div v-if="activeTab === 'posts' && !loadingPosts[site.id] && (!sitePosts[site.id] || sitePosts[site.id]?.length === 0)" class="empty-state">
        <p>No published posts found for this site.</p>
      </div>
    </div>

    <!-- Edit Alt Modal -->
    <Teleport to="body">
      <div v-if="showEditModal" class="modal-overlay" @click.self="closeEditModal">
        <div class="modal-content card">
          <div class="modal-header">
            <h3>Edit Alternative Text</h3>
            <button class="btn-close" @click="closeEditModal">✕</button>
          </div>
          <div class="modal-body">
            <div class="media-preview-sm mb-4">
              <img :src="editData?.item.source_url" />
            </div>
            <div class="form-group">
              <label>Alternative Text</label>
              <textarea 
                v-model="editData!.newAlt" 
                rows="2" 
                placeholder="add alternative text here..."
                class="form-control"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="closeEditModal">Cancel</button>
            <button class="btn btn-primary" :disabled="updatingId === editData?.item.id" @click="handleUpdateAlt">
              <span v-if="updatingId === editData?.item.id" class="spinner" style="width:14px;height:14px;margin-right:8px;" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation Modal -->
    <ModalConfirm
      :show="showDeleteModal"
      :title="deleteData?.type === 'media' ? 'Delete Image?' : 'Delete Post?'"
      :message="deleteData?.type === 'media' 
        ? 'This will permanently remove the image from your WordPress media library. This action cannot be undone.' 
        : 'This will permanently remove the image from your WordPress media library. This action cannot be undone.'
      "
      confirmText="Yes, Delete"
      type="warning"
      @confirm="handleConfirmDelete"
      @cancel="closeDeleteModal"
    />
  </div>
</template>

<style scoped>
.media-page { padding: 24px; }
.page-header { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; }
.page-title { font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin-bottom: 2px; }
.page-subtitle { color: var(--text-secondary); font-size: 0.95rem; }

/* Hub Tabs */
.hub-tabs {
  display: flex;
  background: var(--bg-card);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xs);
}
.tab-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-muted);
  transition: all 0.2s;
}
.tab-btn.active {
  background: var(--purple);
  color: white;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
}
.tab-btn:hover:not(.active) {
  color: var(--text-primary);
  background: var(--bg-base);
}

.site-section { margin-bottom: 40px; border: none; background: transparent; box-shadow: none; }
.site-header { 
  padding: 0 0 15px 0; 
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  border-bottom: 1.5px solid var(--border);
  margin-bottom: 20px;
}
.site-name { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
.media-count { font-size: 0.85rem; color: var(--text-muted); margin-left: 12px; font-weight: 500; }
.site-actions { display: flex; align-items: center; gap: 12px; }
.site-info { display: flex; align-items: center; gap: 12px; }
.site-icon { 
  width: 38px; 
  height: 38px; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  background: var(--bg-card);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}
.site-logo-img { width: 100%; height: 100%; object-fit: cover; }

/* Unused styles cleaned up */

/* Post Grid Styles */
.post-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
}

@media (max-width: 1024px) {
  .post-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  .post-grid { 
    grid-template-columns: 1fr; 
    gap: 12px;
  }
  .post-card {
    padding: 16px 16px 16px 20px !important;
  }
}

.post-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 20px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}
.post-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; bottom: 0; width: 4px;
  background: #10b981; /* Green accent as in screenshot */
  opacity: 1;
}
.post-card:hover { 
  transform: translateY(-4px); 
  box-shadow: var(--shadow-lg);
  border-color: var(--border);
}

.post-title { 
  font-size: 1rem; 
  font-weight: 800; 
  color: var(--text-primary);
  line-height: 1.4;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.8em; /* Force 2-line height consistency */
}

.post-excerpt {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 3.2em; /* Force 2-line height consistency */
}

.post-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  min-height: 32px;
}

.meta-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}
.meta-item svg { color: var(--text-muted); opacity: 0.7; }

.status-badge-v2 {
  background: rgba(16, 185, 129, 0.08);
  color: #10b981;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  border: 1px solid rgba(16, 185, 129, 0.12);
  line-height: 1;
}

.post-actions-v2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.actions-main {
  display: flex;
  gap: 10px;
}

.btn-action-v2 {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
}
.btn-action-v2:hover {
  background: var(--bg-deep);
  border-color: var(--text-primary);
}

.btn-trash-v2 {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(225, 29, 72, 0.08); /* Translucent red */
  border: 1.5px solid rgba(225, 29, 72, 0.2);
  border-radius: 10px;
  color: #e11d48;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-trash-v2:hover {
  background: #e11d48;
  color: white;
  border-color: #e11d48;
}

.btn-action {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.btn-view {
  background: #f0fdf4;
  color: #16a34a;
  border-color: #bbf7d0;
}
.btn-view:hover { background: #16a34a; color: white; border-color: #16a34a; transform: scale(1.02); }

.btn-edit {
  background: #f5f3ff;
  color: #7c3aed;
  border-color: #ddd6fe;
}
.btn-edit:hover { background: #7c3aed; color: white; border-color: #7c3aed; transform: scale(1.02); }

.btn-delete {
  background: #fff1f2;
  color: #e11d48;
  border-color: #fecdd3;
}
.btn-delete:hover { background: #e11d48; color: white; border-color: #e11d48; transform: scale(1.02); }

.media-grid-v2 {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 20px;
}

.media-card-v2 {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-sm);
}
.media-card-v2:hover { 
  transform: translateY(-6px); 
  box-shadow: var(--shadow-lg); 
  border-color: var(--purple); 
}

.media-preview-v2 {
  aspect-ratio: 16/10;
  background: var(--bg-deep);
  position: relative;
  overflow: hidden;
  margin: 8px;
  border-radius: 12px;
}
.media-preview-v2 img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s; }
.media-card-v2:hover .media-preview-v2 img { transform: scale(1.1); }

.media-overlay-v2 {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  opacity: 0;
  transition: all 0.3s ease;
}
.media-preview-v2:hover .media-overlay-v2 { opacity: 1; }

.btn-action-round {
  width: 42px; height: 42px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  border: none;
  color: white;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
.btn-action-round.delete { background: #ef4444; }
.btn-action-round.edit { background: var(--purple); }
.btn-action-round:hover { transform: scale(1.15) rotate(5deg); }
.btn-action-round:active { transform: scale(0.95); }

.media-info-v2 { padding: 0 16px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
.media-alt-text { 
  font-size: 0.9rem; 
  font-weight: 700; 
  color: var(--text-primary); 
  white-space: nowrap; 
  overflow: hidden; 
  text-overflow: ellipsis;
}

.media-meta-v2 { 
  display: flex; 
  align-items: center; 
  gap: 10px; 
}
.meta-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-deep);
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.meta-tag span { font-weight: 700; }

.empty-state { 
  padding: 60px 20px; 
  text-align: center; 
  color: var(--text-muted);
  background: var(--bg-card);
  border-radius: 12px;
  border: 2px dashed var(--border);
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content { width: 100%; max-width: 500px; padding: 0; overflow: hidden; border-radius: 16px; border: 1px solid var(--border); }
.modal-header { 
  padding: 20px 24px; 
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card);
}
.modal-header h3 { font-size: 1.1rem; font-weight: 800; }
.modal-body { padding: 24px; background: var(--bg-card); }
.modal-footer { 
  padding: 20px 24px; 
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: center;
  gap: 12px;
  background: var(--bg-card);
}

.media-preview-sm { height: 160px; display: flex; align-items: center; justify-content: center; background: #000; border-radius: 12px; overflow: hidden; box-shadow: inset 0 0 20px rgba(0,0,0,0.5); }
.media-preview-sm img { max-width: 100%; max-height: 100%; object-fit: contain; }

.form-group textarea {
  text-align: center;
  padding: 15px;
  border-radius: 8px;
  font-size: 0.9rem;
  width: 100%;
  border: 1.5px solid var(--border);
  background: var(--bg-input);
  color: var(--text-primary);
  resize: none;
  height: 80px;
  transition: all 0.2s;
}
.form-group textarea:focus {
  border-color: var(--primary-color);
  background: var(--bg-surface);
  box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.1);
  outline: none;
}

.delete-modal { max-width: 420px; }
.delete-icon { font-size: 3.5rem; margin-bottom: 20px; display: block; filter: drop-shadow(0 4px 12px rgba(239, 68, 68, 0.3)); }
.btn-danger { background: #e11d48; color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
.btn-danger:hover { background: #be123c; transform: scale(1.02); }

@media (max-width: 1400px) {
  .media-grid-v2 { grid-template-columns: repeat(4, 1fr); }
}

@media (max-width: 1100px) {
  .media-grid-v2 { grid-template-columns: repeat(3, 1fr); gap: 15px; }
  .post-grid { grid-template-columns: repeat(3, 1fr); gap: 15px; }
}

@media (max-width: 768px) {
  .media-page { padding: 16px; }
  .page-header { flex-direction: column; align-items: stretch; gap: 16px; }
  .hub-tabs { width: 100%; display: grid; grid-template-columns: 1fr 1fr; }
  .site-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .media-grid-v2 { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .post-grid { grid-template-columns: 1fr; gap: 15px; }
}

@media (max-width: 480px) {
  .media-page { padding: 12px; }
  .media-grid-v2 { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .media-card-v2 { border-radius: 12px; }
  .hub-tabs button { font-size: 0.75rem; padding: 10px; }
  .post-grid { grid-template-columns: 1fr; gap: 12px; }
  .media-preview-v2 { margin: 4px; border-radius: 8px; }
  .media-info-v2 { padding: 0 10px 10px 10px; gap: 6px; }
  .media-alt-text { font-size: 0.8rem; }
  .meta-tag { padding: 2px 6px; font-size: 0.6rem; border-radius: 6px; }
  .btn-action-round { width: 36px; height: 36px; }
}

@media (max-width: 360px) {
  .media-grid-v2 { grid-template-columns: 1fr; }
}
</style>
