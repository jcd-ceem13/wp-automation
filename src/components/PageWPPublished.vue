<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { appStore, getPublishedPosts, deletePostFromWordPress, showToast } from '../store'
import ModalConfirm from './ModalConfirm.vue'

const sitePosts = ref<Record<string, any[]>>({})
const loading = ref<Record<string, boolean>>({})

// Modal State
const showDeleteModal = ref(false)
const deleteData = ref<{ siteId: string; post: any } | null>(null)

async function fetchAllPosts() {
  for (const site of appStore.sites) {
    loading.value[site.id] = true
    try {
      const posts = await getPublishedPosts(site.id)
      sitePosts.value[site.id] = posts
    } catch (err) {
      console.error('Failed to fetch posts:', err)
    } finally {
      loading.value[site.id] = false
    }
  }
}

async function handleDeletePost(siteId: string, post: any) {
  deleteData.value = { siteId, post }
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!deleteData.value) return
  const { siteId, post } = deleteData.value
  
  showDeleteModal.value = false
  const success = await deletePostFromWordPress(siteId, post.id)
  if (success) {
    showToast('success', 'Post Deleted', 'Successfully removed from WordPress.')
    sitePosts.value[siteId] = (sitePosts.value[siteId] || []).filter((p: any) => p.id !== post.id)
  } else {
    showToast('error', 'Delete Failed', 'Check your site connection and permissions.')
  }
  deleteData.value = null
}

function handleEditPost(site: any, post: any) {
  const editUrl = `${site.url}/wp-admin/post.php?post=${post.id}&action=edit`
  window.open(editUrl, '_blank')
}

function handleViewLive(url: string) {
  window.open(url, '_blank')
}

onMounted(fetchAllPosts)
</script>

<template>
  <div class="published-page">
    <div class="page-header">
      <div class="header-content">
        <h2 class="page-title">Published Posts</h2>
        <p class="page-subtitle">Manage your live content across all connected WordPress sites.</p>
      </div>
      <button class="btn btn-secondary btn-sm" style="display: flex; align-items: center; gap: 8px; font-weight: 700;" @click="fetchAllPosts">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
        Refresh All
      </button>
    </div>

    <div v-for="site in appStore.sites" :key="site.id" class="site-section">
      <div class="site-header">
        <div class="site-info">
          <div class="site-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          </div>
          <div class="site-text">
            <h3 class="site-name">{{ site.url.replace('https://', '') }}</h3>
            <span v-if="sitePosts[site.id]" class="post-count">{{ sitePosts[site.id]?.length }} Published Articles</span>
          </div>
        </div>
        <div class="site-actions-top">
          <div v-if="loading[site.id]" class="spinner" style="width:16px;height:16px;" />
          <button v-else class="btn btn-ghost btn-xs" @click="fetchAllPosts" title="Refresh Site Content">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Sync
          </button>
        </div>
      </div>

      <div class="post-grid">
        <div v-for="post in (sitePosts[site.id] || [])" :key="post.id" class="post-card">
          <!-- Status Accent Bar -->
          <div class="card-accent published" />

          <div class="post-content">
            <h4 class="post-title" v-html="post.title?.rendered || 'Untitled'"></h4>
            <div class="post-excerpt" v-html="post.excerpt?.rendered || ''"></div>
            
            <div class="post-meta">
              <span class="meta-item" title="Post ID">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                ID: {{ post.id }}
              </span>
              <span class="meta-item" title="Publish Date">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                {{ post.date ? new Date(post.date).toLocaleDateString() : '—' }}
              </span>
              <div class="spacer" />
              <span class="badge-mini">PUBLISHED</span>
            </div>
          </div>

          <div class="post-actions-hub">
            <div class="action-group">
              <button class="btn btn-ghost btn-xs" @click="handleViewLive(post.link)" title="View Live Post">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                View
              </button>
              <button class="btn btn-ghost btn-xs" @click="handleEditPost(site, post)" title="Edit in WordPress">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Edit
              </button>
            </div>
            <button class="btn btn-danger btn-xs btn-icon-only" @click="handleDeletePost(site.id, post)" title="Delete Post">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!loading[site.id] && (!sitePosts[site.id] || sitePosts[site.id]?.length === 0)" class="empty-state">
        <p>No published posts found for this site.</p>
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
.published-page { padding: 24px; }
.page-header { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; }
.page-title { font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin-bottom: 2px; }
.page-subtitle { color: var(--text-secondary); font-size: 0.95rem; }

.site-section { margin-bottom: 48px; border: none; background: transparent; box-shadow: none; }
.site-header { 
  padding: 0 0 15px 0; 
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid var(--border);
  margin-bottom: 24px;
}
.site-info { display: flex; align-items: center; gap: 14px; }
.site-icon {
  width: 40px; height: 40px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-xs);
}
.site-text { display: flex; flex-direction: column; }
.site-name { font-size: 1.15rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em; line-height: 1.2; }
.post-count { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; margin-top: 2px; }

.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.post-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 20px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}
.post-card:hover { 
  transform: translateY(-4px) translateX(2px); 
  box-shadow: var(--shadow-md);
  border-color: var(--purple);
}

.card-accent {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
}
.card-accent.published { background: var(--green); }

.post-title { 
  font-size: 1rem; 
  font-weight: 700; 
  color: var(--text-primary);
  line-height: 1.4;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 2.8em;
}

.post-excerpt {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 3em;
}

.post-meta { 
  display: flex; 
  align-items: center; 
  gap: 12px; 
  font-size: 0.75rem; 
  color: var(--text-muted);
  font-weight: 600;
  margin-top: auto;
}
.meta-item { display: flex; align-items: center; gap: 5px; }
.meta-item svg { opacity: 0.6; }
.spacer { flex: 1; }
.badge-mini {
  font-size: 0.6rem;
  font-weight: 800;
  color: var(--green);
  background: rgba(16, 185, 129, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.post-actions-hub {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 15px;
  border-top: 1px solid var(--border);
}
.action-group { display: flex; gap: 8px; }
.btn-icon-only { padding: 6px; }

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

.empty-state { 
  padding: 60px 20px; 
  text-align: center; 
  color: var(--text-muted);
  background: var(--bg-card);
  border-radius: 12px;
  border: 2px dashed var(--border);
}

@media (max-width: 1200px) {
  .post-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .post-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .page-header { flex-direction: column; align-items: flex-start; gap: 16px; }
  .published-page { padding: 14px; }
}
@media (max-width: 480px) {
  .post-grid { grid-template-columns: 1fr; }
}
</style>
