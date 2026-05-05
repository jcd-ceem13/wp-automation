<script setup lang="ts">
import { ref, watch } from 'vue'
import { appStore, showToast, getPublishedPosts, extractFAQs, syncPostSchema } from '../store'

const schemas = [
  { id: 'article', name: 'Article', icon: '📄' },
  { id: 'faqpage', name: 'FAQPage', icon: '💬' },
  { id: 'itemlist', name: 'ItemList', icon: '📋' },
  { id: 'breadcrumblist', name: 'BreadcrumbList', icon: '🛤️' },
  { id: 'imageobject', name: 'ImageObject', icon: '🖼️' },
  { id: 'webpage', name: 'WebPage', icon: '🌐' },
  { id: 'website', name: 'WebSite', icon: '💻' },
  { id: 'organization', name: 'Organization', icon: '🏢' },
  { id: 'person', name: 'Person', icon: '👤' },
  { id: 'howto', name: 'HowTo', icon: '🛠️' },
]

const searchQuery = ref('')
const activeTab = ref('catalog')
const activeSchema = ref<any>(null)
const schemaContent = ref('')
const selectedSite = ref('')
const selectedPostId = ref('')
const posts = ref<any[]>([])
const loadingPosts = ref(false)

watch(selectedSite, async (newSiteId) => {
  selectedPostId.value = ''
  posts.value = []
  if (newSiteId) {
    loadingPosts.value = true
    posts.value = await getPublishedPosts(newSiteId, 20)
    loadingPosts.value = false
  }
})

const filteredSchemas = () => {
  if (!searchQuery.value) return schemas
  return schemas.filter(s => s.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
}

function openSchemaEditor(schema: any) {
  activeSchema.value = schema
  schemaContent.value = `{\n  "@context": "https://schema.org",\n  "@type": "${schema.name}",\n  "name": "{{title}}",\n  "description": "{{excerpt}}"\n}`
}

function handleSaveSchema() {
  if (!selectedSite.value) {
    showToast('error', 'Missing Target Site', 'Please select a Target Site before saving the schema.')
    return
  }
  const site = appStore.sites.find(s => s.id === selectedSite.value)
  if (site && activeSchema.value) {
    const isGlobalSync = !selectedPostId.value

    if (isGlobalSync) {
      if (!site.globalSchemas) site.globalSchemas = {}
      site.globalSchemas[activeSchema.value.id] = schemaContent.value
      site.schemaTemplate = schemaContent.value
      showToast('success', 'Global Template Saved!', `${activeSchema.value.name} template synchronized globally for ${site.name}.`)
    } else {
      // Sync to specific post
      try {
        const parsed = JSON.parse(schemaContent.value)
        syncPostSchema(selectedSite.value, parseInt(selectedPostId.value), parsed).then(success => {
          if (success) showToast('success', 'Post Schema Synced!', `Schema updated for selected post on ${site.name}.`)
          else showToast('error', 'Sync Failed', 'Check site connection and RankMath settings.')
        })
      } catch (e) {
        showToast('error', 'Invalid JSON', 'The schema content is not valid JSON.')
      }
    }
  }
  activeSchema.value = null
}

function handleGenerateFromPost() {
  const post = posts.value.find(p => p.id.toString() === selectedPostId.value)
  if (!post) {
    showToast('warning', 'Select a Post', 'Please select a target post first.')
    return
  }

  let content = schemaContent.value
  content = content.replace(/\{\{title\}\}/g, post.title.rendered)
  content = content.replace(/\{\{excerpt\}\}/g, post.excerpt.rendered.replace(/<[^>]*>/g, '').trim())
  
  if (activeSchema.value.id === 'faqpage') {
    try {
      const parsed = JSON.parse(content)
      const faqs = extractFAQs(post.content.rendered)
      if (faqs.length > 0) {
        parsed.mainEntity = faqs.map(f => ({
          "@type": "Question",
          "name": f.question,
          "acceptedAnswer": { "@type": "Answer", "text": f.answer }
        }))
        content = JSON.stringify(parsed, null, 2)
      } else {
        showToast('info', 'No FAQs Found', 'Could not find any FAQ-style content in this post.')
      }
    } catch (e) { console.error('FAQ Generation failed', e) }
  } else if (activeSchema.value.id === 'imageobject') {
     try {
       const parsed = JSON.parse(content)
       const imgMatch = post.content.rendered.match(/<img[^>]+src=["']([^"']+)["']/i)
       if (imgMatch) {
         parsed.contentUrl = imgMatch[1]
         content = JSON.stringify(parsed, null, 2)
       }
     } catch (e) { }
  }

  schemaContent.value = content
  showToast('success', 'Generated!', 'Schema populated with post data.')
}
</script>

<template>
  <div class="schema-page">
    <div class="card">
      <div class="card-header">
        <span class="card-title">Schema Generator</span>
        <div class="header-actions">
          <span class="sync-badge">Auto-sync: RankMath</span>
        </div>
      </div>

      <div class="schema-toolbar">
        <div class="schema-tabs" style="display: flex; align-items: center; gap: 16px; flex-wrap: nowrap;">
          <label class="radio-label" style="white-space: nowrap;">
            <input type="radio" v-model="activeTab" value="catalog" />
            <span>Schema Catalog</span>
          </label>
          <label class="radio-label" style="white-space: nowrap;">
            <input type="radio" v-model="activeTab" value="templates" />
            <span>Your Templates</span>
          </label>
          <div style="width: 1px; height: 20px; background: var(--border); margin: 0 4px;"></div>
          <select v-model="selectedSite" class="form-select" style="min-width: 150px; max-width: 180px; padding: 4px 8px; font-size: 0.8rem; height: 28px;">
            <option value="">— Target Site —</option>
            <option v-for="s in appStore.sites" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <select v-if="selectedSite" v-model="selectedPostId" class="form-select" style="min-width: 180px; max-width: 250px; padding: 4px 8px; font-size: 0.8rem; height: 28px;">
            <option value="">— {{ loadingPosts ? 'Loading...' : 'Select Target Post (Optional)' }} —</option>
            <option v-for="p in posts" :key="p.id" :value="p.id.toString()">{{ p.title.rendered.replace(/&#\d+;/g, '') }}</option>
          </select>
        </div>
        <div class="schema-search" v-if="!activeSchema" style="display: flex; gap: 10px; align-items: center;">
          <input v-model="searchQuery" type="text" class="form-input" placeholder="Search schemas..." />
          <button class="btn btn-primary btn-sm" @click="activeSchema = { name: 'CustomSchema', icon: '✨' }; schemaContent = '{\n  \'@context\': \'https://schema.org\',\n  \'@type\': \'CustomType\'\n}'">
            + Add Custom Schema
          </button>
        </div>
      </div>

      <div v-if="!activeSchema" class="schema-grid">
        <div v-for="schema in filteredSchemas()" :key="schema.id" class="schema-item">
          <div class="schema-item-left">
            <span class="schema-icon">{{ schema.icon }}</span>
            <span class="schema-name">{{ schema.name }}</span>
          </div>
          <button class="btn btn-ghost btn-sm schema-use-btn" @click="openSchemaEditor(schema)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
            Use
          </button>
        </div>
      </div>

      <div v-else class="schema-editor" style="padding: 24px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; align-items: center;">
          <h3 style="margin:0; font-size: 1.1rem; color: var(--post-title-color);">Configure Global Template: {{ activeSchema.name }}</h3>
          <button class="btn btn-ghost btn-sm" @click="activeSchema = null">Back to Catalog</button>
        </div>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">
          This schema template will be automatically synced and embedded into every post published to your connected WordPress sites. You can use variables like <code v-pre>{{title}}</code>, <code v-pre>{{excerpt}}</code>, or <code v-pre>{{authorName}}</code>.
        </p>
        <div class="form-group">
          <textarea v-model="schemaContent" class="form-textarea" rows="12" style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; background: var(--bg-deep);"></textarea>
        </div>
        <div style="margin-top: 20px; display: flex; gap: 12px; align-items: center;">
          <button class="btn btn-primary" @click="handleSaveSchema">
            {{ selectedPostId ? 'Sync to Selected Post' : 'Save Global Template' }}
          </button>
          <button v-if="selectedPostId" class="btn btn-secondary" style="border: 1px solid var(--purple);" @click="handleGenerateFromPost">
            ✨ Generate from Post
          </button>
          <button class="btn btn-ghost" @click="activeSchema = null">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.schema-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sync-badge {
  background: rgba(16, 185, 129, 0.1);
  color: var(--green);
  border: 1px solid rgba(16, 185, 129, 0.2);
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
}

.schema-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  gap: 16px;
  flex-wrap: wrap;
}

.schema-tabs {
  display: flex;
  gap: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.radio-label input {
  accent-color: var(--purple);
  width: 16px;
  height: 16px;
}

.schema-search {
  min-width: 200px;
}

.schema-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  padding: 24px;
}

@media (max-width: 768px) {
  .schema-grid {
    grid-template-columns: 1fr;
  }
}

.schema-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  transition: all var(--transition);
}

.schema-item:hover {
  border-color: rgba(139, 92, 246, 0.4);
  background: var(--bg-card-hover);
}

.schema-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.schema-icon {
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: rgba(139, 92, 246, 0.1);
  border-radius: var(--radius-md);
  transition: all var(--transition);
}

.schema-item:hover .schema-icon {
  transform: scale(1.1) rotate(-3deg);
  background: rgba(139, 92, 246, 0.2);
}

.schema-name {
  font-weight: 500;
  color: var(--text-secondary);
}

.schema-use-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}

.schema-use-btn:hover {
  color: var(--purple);
}
</style>
