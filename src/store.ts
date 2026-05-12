import { reactive, watch, computed } from 'vue'
import type { WordPressSite, PostQueue, AppSettings, AIProvider } from './types'
import { AI_PROVIDERS } from './types'

// ── RankMath sync module (correct payloads) ─────────────────────────────────
import { syncAllRankMath, syncRankMathSchemas, getFeaturedImageId as resolveWPImageId } from './rankmath'

// Kept locally for meta payload building in WP REST API body
const RM_SNIPPET_MAP: Record<string, string> = {
  'article': 'article',
  'faqpage': 'faq',
  'product': 'product',
  'review': 'review',
  'recipe': 'recipe',
  'videoobject': 'video',
  'howto': 'howto',
  'softwareapplication': 'software'
}

function getRmSnippetType(type?: string): string {
  if (!type) return 'article'
  const t = type.toLowerCase()
  return RM_SNIPPET_MAP[t] || t
}

// ─── Persistence helpers ─────────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    if (!v) return fallback
    const parsed = JSON.parse(v)
    if (typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)) {
      return { ...fallback, ...parsed }
    }
    return parsed
  } catch { return fallback }
}
function save(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { }
}

export function extractFAQs(html?: string): { question: string; answer: string }[] {
  if (!html) return []
  const faqs: { question: string; answer: string }[] = []

  // 1. Clean the HTML
  const cleanHtml = html.replace(/\r\n/g, '\n').replace(/\s+/g, ' ')

  // 2. Identify the search area (FAQ section or entire content)
  // We look for a header that contains "FAQ", "Frequently Asked", etc.
  const faqSectionMatch = cleanHtml.match(/<(h[2-6])[^>]*>(?:.*?FAQ.*?|.*?Frequently Asked.*?|.*?Questions.*?)<\/h\1>(.*?)(?=<h[1-6][^>]*>|$)/i)
  
  let searchIn: string = cleanHtml
  let isStrictSection = false

  if (faqSectionMatch && faqSectionMatch[2] && faqSectionMatch[2].length > 50) {
    searchIn = faqSectionMatch[2]
    isStrictSection = true
  }

  // 3. Strategy A: Tag-based question detection
  const qRegex = new RegExp(`<(h[2-6]|strong|b)[^>]*>(.*?)<\/(?:h[2-6]|strong|b)>`, 'gi')
  
  let match: RegExpExecArray | null
  const matches: { q: string, index: number, length: number }[] = []
  
  while (true) {
    match = qRegex.exec(searchIn)
    if (!match) break
    
    const tag = (match[1] || '').toLowerCase()
    const qRaw = (match[2] || '').replace(/<[^>]*>/g, '').trim()
    
    // BLACKLIST: Common headings that are NOT FAQs
    const blacklisted = /^(Note|Disclaimer|Warning|Verdict|Introduction|Conclusion|Summary|Pros|Cons|Advantages|Disadvantages|Table of Content|Author|Source|Reference|Featured|Related|Key Features|Core Strengths|Performance|Security|Reliability|Payment|Mobile Experience|Customer Support|Final Evaluation|Final Verdict|Quick Verdict)/i.test(qRaw)
    
    const endsWithQuestion = qRaw.endsWith('?')
    const isQuestiony = /^(What|How|Why|Can|Where|Who|When|Is|Are|Which|Does|Do|Should)/i.test(qRaw)
    
    if (qRaw && qRaw.length > 8 && qRaw.length < 200 && !blacklisted) {
      // If we are in a dedicated section, we are more lenient.
      // If searching the whole content, we REQUIRE it to look like a question.
      if (isStrictSection || endsWithQuestion || isQuestiony) {
        matches.push({ q: qRaw, index: match.index, length: match[0].length })
      }
    }
  }

  // 4. Extract answers between matches
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    if (!current) continue
    const next = matches[i + 1]
    const start = current.index + current.length
    const end = next ? next.index : searchIn.length
    
    let answerHtml = searchIn.substring(start, end).trim()
    let answerText = answerHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    
    // Filter out very short answers or answers that are just other tags
    if (answerText.length > 15 && answerText.length < 2000) {
      faqs.push({ 
        question: current.q.endsWith('?') ? current.q : current.q + '?', 
        answer: answerText 
      })
    }
  }

  // 5. Strategy B: Plain text fallback (only if no FAQs found)
  if (faqs.length === 0) {
    const text = searchIn.replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n')
    const fallbackRegex = /(?:^|\n)(?:Q|Question|Q\d+|\d+[\)\.])\s*:?\s*(.*?)(?:\?|\:|\n)\s*(?:A|Answer|Response|Ans)\s*:?\s*(.*?)(?=\n+(?:Q|Question|Q\d+|\d+[\)\.])|$)/gi
    while (true) {
      match = fallbackRegex.exec(text)
      if (!match) break
      const q = (match[1] || '').trim()
      const a = (match[2] || '').trim()
      if (q.length > 10 && a.length > 15) {
        faqs.push({ question: q.endsWith('?') ? q : q + '?', answer: a })
      }
    }
  }

  const seen = new Set<string>()
  return faqs.filter(f => {
    const key = f.question.toLowerCase().replace(/[^\w]/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 10) // Limit to 10 FAQs as per prompt
}

// ─── State ───────────────────────────────────────────────────────────────────
export const appStore = reactive({
  // Navigation
  activePage: 'dashboard' as string,
  sidebarOpen: false,

  // API Keys  (keyed by provider id)
  apiKeys: load<Record<string, string>>('ai_autopost_apikeys', {}),

  // Selected provider models (keyed by provider id)
  selectedModels: load<Record<string, string>>(
    'ai_autopost_models',
    Object.fromEntries(AI_PROVIDERS.map(p => [p.id, p.defaultModel]))
  ),

  // WordPress sites
  sites: load<WordPressSite[]>('ai_autopost_sites', []),

  // Post queue
  queue: load<PostQueue[]>('ai_autopost_queue', []),

  // Settings
  settings: load<AppSettings>('ai_autopost_settings', {
    defaultProvider: 'openai',
    defaultSiteId: '',
    defaultLanguage: 'en',
    defaultTone: 'Professional',
    defaultWordCount: 3500,
    autoSchedule: false,
    scheduleInterval: 60,
    unsplashApiKey: '',
    pexelsApiKey: '',
    defaultImageProvider: 'openai',
    defaultAuthorName: '',
    defaultAudience: 'General Audience',
    defaultIncludeOutline: true,
    defaultIncludeStats: true,
    defaultIncludeFaq: true,
    defaultIncludeQuotes: true,
    defaultIncludeTags: true,
    defaultSelectedSchemas: ['article', 'faqpage', 'breadcrumblist'],
    darkMode: false,
    customProviders: []
  }),

  // Toast notifications
  toasts: [] as Array<{ id: string; type: string; title: string; msg: string }>,

  // Generation state
  generating: false,
  generatedPost: null as null | { title: string; content: string; excerpt: string; tags: string[] },

  // Active queue item for preview
  previewPost: null as PostQueue | null,

  // Stats
  get stats() {
    return {
      total: this.queue.length,
      published: this.queue.filter(p => p.status === 'published' || p.wpPostId).length,
      scheduled: this.queue.filter(p => p.status === 'scheduled' && !p.wpPostId).length,
      draft: this.queue.filter(p => p.status === 'draft' && !p.wpPostId).length,
      failed: this.queue.filter(p => p.status === 'failed' && !p.wpPostId).length,
    }
  }
})

// ─── Persist watchers ─────────────────────────────────────────────────────────
watch(() => appStore.apiKeys, v => save('ai_autopost_apikeys', v), { deep: true })
watch(() => appStore.selectedModels, v => save('ai_autopost_models', v), { deep: true })
watch(() => appStore.sites, v => save('ai_autopost_sites', v), { deep: true })
watch(() => appStore.queue, v => save('ai_autopost_queue', v), { deep: true })
watch(() => appStore.settings, v => save('ai_autopost_settings', v), { deep: true })

watch(() => appStore.settings.darkMode, (isDark) => {
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}, { immediate: true })

export const allProviders = computed(() => {
  return [...AI_PROVIDERS, ...(appStore.settings.customProviders || [])]
})

// ─── Toast ────────────────────────────────────────────────────────────────────
export function showToast(type: 'success' | 'error' | 'info' | 'warning', title: string, msg = '') {
  const id = Math.random().toString(36).slice(2)
  appStore.toasts.push({ id, type, title, msg })
  setTimeout(() => {
    const i = appStore.toasts.findIndex(t => t.id === id)
    if (i !== -1) appStore.toasts.splice(i, 1)
  }, 4500)
}

// ─── Site actions ─────────────────────────────────────────────────────────────
export function addSite(site: Omit<WordPressSite, 'id' | 'connected'>) {
  const newSite: WordPressSite = { ...site, id: crypto.randomUUID(), connected: false }
  appStore.sites.push(newSite)
  return newSite
}

export function removeSite(id: string) {
  const i = appStore.sites.findIndex(s => s.id === id)
  if (i !== -1) appStore.sites.splice(i, 1)
}

export async function testSiteConnection(site: WordPressSite): Promise<boolean> {
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    
    // 1. Test basic connectivity & auth
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=1`, {
      headers: { Authorization: `Basic ${creds}` }
    })
    site.connected = res.ok
    site.lastChecked = new Date().toISOString()

    // 2. Try to discover site logo if not already set
    if (res.ok && !site.logoUrl) {
      try {
        // Try to get from site settings (requires permission)
        const settingsRes = await fetch(`${baseUrl}/wp-json/wp/v2/settings`, {
          headers: { Authorization: `Basic ${creds}` }
        })
        if (settingsRes.ok) {
          const settings = await settingsRes.json()
          if (settings.site_logo) {
            // site_logo is an ID, need to fetch media info
            const mediaRes = await fetch(`${baseUrl}/wp-json/wp/v2/media/${settings.site_logo}`, {
              headers: { Authorization: `Basic ${creds}` }
            })
            if (mediaRes.ok) {
              const media = await mediaRes.json()
              site.logoUrl = media.source_url
            }
          }
        }
        
        // Fallback: Scrape from home page (Link header or meta)
        if (!site.logoUrl) {
          const homeRes = await fetch(baseUrl)
          if (homeRes.ok) {
            const html = await homeRes.text()
            const iconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i) ||
                             html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            if (iconMatch) site.logoUrl = iconMatch[1]
          }
        }
      } catch (e) { console.warn('Logo discovery failed:', e) }
    }

    return res.ok
  } catch {
    site.connected = false
    site.lastChecked = new Date().toISOString()
    return false
  }
}

export async function getSiteAuthors(siteId: string): Promise<Array<{ id: number; name: string }>> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return []
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/users?per_page=100&context=edit`, {
      headers: { Authorization: `Basic ${creds}` }
    })
    if (res.ok) {
      const users: any[] = await res.json()
      return users.map(u => ({ id: u.id, name: u.name }))
    }
    return []
  } catch { return [] }
}

export async function getPublishedPosts(siteId: string, limit = 15): Promise<any[]> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return []
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts?status=publish&per_page=${limit}&_embed`, {
      headers: { Authorization: `Basic ${creds}` }
    })
    if (res.ok) {
      return await res.json()
    }
    return []
  } catch { return [] }
}

export async function getSiteCategories(siteId: string): Promise<{ id: number; name: string }[]> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return []
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/categories?per_page=100`, {
      headers: { Authorization: `Basic ${creds}` }
    })
    if (res.ok) {
      const cats: any[] = await res.json()
      return cats.map(c => ({ id: c.id, name: c.name }))
    }
    return []
  } catch { return [] }
}

export async function createSiteCategory(siteId: string, name: string, parent?: number): Promise<{ id: number; name: string } | null> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return null
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/categories`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent })
    })
    if (res.ok) {
      const cat = await res.json()
      return { id: cat.id, name: cat.name }
    }
    return null
  } catch { return null }
}

export async function uploadMediaToWordPress(siteId: string, file: File): Promise<{ id: number; url: string } | null> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return null
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', file.name)

    const res = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': file.type,
        'Content-Disposition': `attachment; filename="${file.name}"`
      },
      body: file // WordPress API prefers binary body for media
    })

    if (res.ok) {
      const media = await res.json()
      return { id: media.id, url: media.source_url }
    }
    return null
  } catch (e) {
    console.error('Media upload failed:', e)
    return null
  }
}

export async function getSiteMedia(siteId: string, limit = 15, page = 1): Promise<any[]> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return []
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')

    // Attempt 1: Full query with image filter
    let url = `${baseUrl}/wp-json/wp/v2/media?per_page=${limit}&page=${page}&order=desc&orderby=date&media_type=image`
    let res = await fetch(url, { headers: { Authorization: `Basic ${creds}` } })

    if (!res.ok) {
      console.warn(`Initial media fetch failed for ${site.url} (${res.status}), trying fallback 1...`)
      // Attempt 2: Minimal query with image filter
      url = `${baseUrl}/wp-json/wp/v2/media?per_page=${limit}&media_type=image`
      res = await fetch(url, { headers: { Authorization: `Basic ${creds}` } })
    }

    if (!res.ok) {
      console.warn(`Fallback 1 failed for ${site.url} (${res.status}), trying fallback 2 (all media)...`)
      // Attempt 3: Absolute minimal (all media types)
      url = `${baseUrl}/wp-json/wp/v2/media?per_page=${limit}`
      res = await fetch(url, { headers: { Authorization: `Basic ${creds}` } })
    }

    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) return data

      // If WP returns an error object instead of array
      if (data && typeof data === 'object' && data.message) {
        console.error(`WordPress API Error for ${site.url}:`, data.message)
      }
      return []
    } else {
      const errText = await res.text().catch(() => 'Unknown error')
      console.error(`Media fetch totally failed for ${site.url}: ${res.status} ${res.statusText}`, errText)
      return []
    }
  } catch (e) {
    console.error(`Exception during media fetch for ${site.id}:`, e)
    return []
  }
}

export async function deleteSiteMedia(siteId: string, mediaId: number): Promise<boolean> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return false
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}?force=true`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${creds}` }
    })
    return res.ok
  } catch { return false }
}

export async function updateSiteMediaAlt(siteId: string, mediaId: number, altText: string): Promise<boolean> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return false
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ alt_text: altText })
    })
    return res.ok
  } catch { return false }
}

export async function createSiteAuthor(
  siteId: string,
  data: { username: string; name: string; email: string; password: string; role?: string }
): Promise<{ id: number; name: string } | null> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) { showToast('error', 'No Site', 'Site not found.'); return null }
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/users`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: data.username,
        name: data.name,
        email: data.email,
        password: data.password,
        roles: [data.role || 'author']
      })
    })
    if (res.ok) {
      const user = await res.json()
      showToast('success', 'Author Created', `"${user.name}" added to WordPress.`)
      return { id: user.id, name: user.name }
    }
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}`)
  } catch (e: any) {
    showToast('error', 'Create Author Failed', e.message || 'Could not create author.')
    return null
  }
}

// ─── Queue actions ────────────────────────────────────────────────────────────
export function addToQueue(post: Omit<PostQueue, 'id' | 'createdAt'>) {
  const newPost: PostQueue = {
    ...post,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  }
  appStore.queue.unshift(newPost)
  return newPost
}

export function removeFromQueue(id: string) {
  const i = appStore.queue.findIndex(p => p.id === id)
  if (i !== -1) appStore.queue.splice(i, 1)
}

export async function deletePost(id: string) {
  const post = appStore.queue.find(p => p.id === id)
  if (!post) return

  // Delete from WP if synced
  if (post.wpPostId && post.siteId) {
    const site = appStore.sites.find(s => s.id === post.siteId)
    if (site) {
      try {
        const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
        const baseUrl = site.url.replace(/\/$/, '')
        const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${post.wpPostId}?force=true`, {
          method: 'DELETE',
          headers: { Authorization: `Basic ${creds}` }
        })

        if (res.ok) {
          showToast('success', 'WordPress Post Deleted', `The post has been removed from ${site.name}.`)
        } else if (res.status === 404) {
          // Already gone from WP, that's fine
          console.warn('Post already deleted from WordPress.')
        } else {
          const err = await res.json().catch(() => ({}))
          showToast('warning', 'WordPress Deletion Failed', err.message || `HTTP ${res.status}`)
        }
      } catch (e: any) {
        console.error('Failed to delete post from WordPress:', e)
        showToast('error', 'Connection Error', 'Could not reach WordPress to delete the post.')
      }
    }
  }

  // Remove locally
  removeFromQueue(id)
}

export async function deletePostFromWordPress(siteId: string, wpPostId: number): Promise<{ success: boolean; error?: string }> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return { success: false, error: 'Site not found.' }
  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${wpPostId}?force=true`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${creds}` }
    })
    
    if (res.ok) {
      return { success: true }
    } else {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.message || `HTTP ${res.status}` }
    }
  } catch (e: any) {
    console.error('Failed to delete post from WordPress:', e)
    return { success: false, error: e.message || 'Network error' }
  }
}

export function updateQueueItem(id: string, updates: Partial<PostQueue>) {
  const item = appStore.queue.find(p => p.id === id)
  if (item) Object.assign(item, updates)
}

// ─── Publish to WordPress ─────────────────────────────────────────────────────
export async function publishPost(queueId: string): Promise<boolean> {
  const post = appStore.queue.find(p => p.id === queueId)
  if (!post || post.status === 'published') return false

  // If already has a WP ID, update instead of create to avoid duplicates
  if (post.wpPostId) {
    return updateWordPressPost(queueId)
  }

  const site = appStore.sites.find(s => s.id === post.siteId)
  if (!post.siteId || post.siteId.trim() === '') {
    showToast('error', 'No Site Assigned', 'This post has no WordPress site assigned. Edit the post in the Queue and assign a site before publishing.')
    return false
  }
  if (!site) { showToast('error', 'Site Not Found', 'The target WordPress site was not found. It may have been removed from Settings.'); return false }

  updateQueueItem(queueId, { status: 'scheduled' })

  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')

    // 0. Duplication Check (By Slug)
    try {
      const slugToCheck = post.slug || post.title.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      const checkRes = await fetch(`${baseUrl}/wp-json/wp/v2/posts?slug=${slugToCheck}&status=publish,future,draft,pending,private`, {
        headers: { Authorization: `Basic ${creds}` }
      })
      if (checkRes.ok) {
        const existingPosts = await checkRes.json()
        if (Array.isArray(existingPosts) && existingPosts.length > 0) {
          showToast('warning', 'Duplicate Detected', 'A post with this slug already exists on the target WordPress site.')
          updateQueueItem(queueId, { status: 'failed', error: 'Duplicate slug found on site.' })
          return false
        }
      }
    } catch (e) { console.warn('Duplication check failed:', e) }

    // 0. Prepare Schema for fallback meta
    const schemasArray: any[] = []
    
    // If the AI generated schemas, we use ALL of them directly exactly as they appear in the preview result.
    if (post.schemas && Array.isArray(post.schemas) && post.schemas.length > 0) {
      post.schemas.forEach(schema => {
        const type = schema['@type'] || 'Article'
        const rmType = getRmSnippetType(type)
        const finalObj = {
          ...schema,
          metadata: { title: type, type: 'custom', shortcode: rmType }
        }
        schemasArray.push(finalObj)
      })
    } else if (post.selectedSchemas && post.selectedSchemas.length > 0) {
      // Fallback: if no schemas were generated, create empty ones based on UI selection
      post.selectedSchemas.forEach(type => {
        const rmType = getRmSnippetType(type)
        schemasArray.push({
          '@type': type,
          metadata: { title: type, type: 'custom', shortcode: rmType }
        })
      })
    }

    // 1. Process Content: Auto-sync Focus Keyword to Image Alt Text
    let processedContent = (post.content || '')
      .replace(/\u0000/g, '')
      .trim()

    if (post.focusKeyword) {
      // Simple regex to add/sync alt text in images within the content
      processedContent = processedContent.replace(/<img([^>]+)alt=["']([^"']*)["']([^>]*)\/?>/gi, (match, p1, p2, p3) => {
        if (!p2.trim()) {
          return `<img${p1}alt="${post.focusKeyword}"${p3}>`
        }
        return match
      })
      // Also catch images without alt attribute at all
      processedContent = processedContent.replace(/<img((?![^>]*\balt\b)[^>]+)\/?>/gi, `<img$1 alt="${post.focusKeyword}">`)
    }

    // 2. Resolve category IDs
    let categoryIds: number[] = []
    if (post.categories.length) {
      try {
        const catRes = await fetch(`${baseUrl}/wp-json/wp/v2/categories?per_page=100`, {
          headers: { Authorization: `Basic ${creds}` }
        })
        if (catRes.ok) {
          const cats: any[] = await catRes.json()
          categoryIds = post.categories
            .map(name => cats.find(c => c.name.toLowerCase() === name.toLowerCase())?.id)
            .filter(Boolean) as number[]
        }
      } catch (e) { console.error('Category resolution failed', e) }
    }

    // 3. Resolve/create tag IDs
    let tagIds: number[] = []
    if (post.tags.length) {
      for (const tagName of post.tags) {
        try {
          const searchRes = await fetch(`${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, {
            headers: { Authorization: `Basic ${creds}` }
          })
          if (searchRes.ok) {
            const tags: any[] = await searchRes.json()
            const existing = tags.find(t => t.name.toLowerCase() === tagName.toLowerCase())
            if (existing) { tagIds.push(existing.id); continue }
          }
          // Create new tag
          const createRes = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
            method: 'POST',
            headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: tagName })
          })
          if (createRes.ok) { const t = await createRes.json(); tagIds.push(t.id) }
        } catch (e) { console.error(`Tag resolution failed for ${tagName}`, e) }
      }
    }

    // 4. Handle Featured Image (Auto-detect first image if missing)
    let featuredMediaId: number | undefined
    let finalFeaturedUrl = post.featuredImageUrl

    if (!finalFeaturedUrl) {
      const firstImgMatch = post.content.match(/<img[^>]+src=["']([^"']+)["']/i)
      if (firstImgMatch) {
        finalFeaturedUrl = firstImgMatch[1]
        console.log(`[AutoFeatured] Detected first content image: ${finalFeaturedUrl}`)
      }
    }

    if (finalFeaturedUrl) {
      try {
        console.log(`[FeaturedImage] Resolving ID for: ${finalFeaturedUrl}`)
        const resolvedId = await resolveWPImageId(baseUrl, creds, finalFeaturedUrl)
        if (resolvedId) {
          featuredMediaId = resolvedId
          console.log(`[FeaturedImage] Resolved from WP media library, ID: ${featuredMediaId}`)
        }

        if (!featuredMediaId) {
          console.log('[FeaturedImage] Not in library, uploading...')
          const imgBlob = await fetch(finalFeaturedUrl).then(r => r.blob())
          let filename = finalFeaturedUrl.split('/').pop() || 'featured-image'
          if (!filename.toLowerCase().endsWith('.webp')) {
            filename = filename.replace(/\.[^/.]+$/, "") + ".webp"
          }
          const formData = new FormData()
          formData.append('file', imgBlob, filename)
          formData.append('title', post.title)
          formData.append('alt_text', post.focusKeyword || post.title)

          const uploadRes = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
            method: 'POST',
            headers: { Authorization: `Basic ${creds}` },
            body: formData
          })
          if (uploadRes.ok) {
            const media = await uploadRes.json()
            featuredMediaId = media.id
            console.log(`[FeaturedImage] Uploaded successfully, ID: ${featuredMediaId}`)
          } else {
            console.error('[FeaturedImage] Upload failed:', await uploadRes.text())
          }
        }
      } catch (e) { console.error('[FeaturedImage] Process failed:', e) }
    }

    // 5. Prepare Schema Payload
    const siteData = appStore.sites.find(s => s.id === post.siteId)
    const finalSchemaPayload: any[] = []
    
    // Determine which schemas to include
    const activeSchemaIds = post.selectedSchemas?.map(s => s.toLowerCase()) || []
    
    // Use schemasArray which already merged the AI-generated schemas (post.schemas)
    // with the basic schemaObj.
    schemasArray.forEach(schema => {
      const typeLabel = schema['@type'] || 'Article'
      const typeId = typeLabel.toLowerCase()
      
      // Clone the AI-generated or default schema
      const finalObj: any = { ...schema }
      
      // Inject standard fallbacks if missing
      if (!finalObj.name) finalObj.name = post.title
      if (!finalObj.headline) finalObj.headline = post.title
      if (!finalObj.description) finalObj.description = post.excerpt || ''
      
      // Inject global site data if available
      if (siteData?.globalSchemas && siteData.globalSchemas[typeLabel]) {
        try {
          const s = siteData.globalSchemas[typeLabel]
          const parsed = typeof s === 'string' ? JSON.parse(s) : s
          let content = JSON.stringify(parsed)
          content = content.replace(/\{\{title\}\}/g, post.title)
          content = content.replace(/\{\{excerpt\}\}/g, post.excerpt || '')
          content = content.replace(/\{\{authorName\}\}/g, post.authorName || 'Admin')
          const globalParsed = JSON.parse(content)
          delete globalParsed['@context']
          Object.assign(finalObj, globalParsed)
        } catch (e) { console.error('Global schema merge failed', e) }
      } else {
        // Apply sensible defaults based on schema type
        if (typeId === 'article' || typeId === 'newsarticle' || typeId === 'blogposting') {
          if (!finalObj.author) finalObj.author = { '@type': 'Person', name: post.authorName || 'Admin' }
          if (!finalObj.publisher) finalObj.publisher = { '@type': 'Organization', name: siteData?.name || 'Website' }
        }
        if (typeId === 'breadcrumblist') {
          if (!finalObj.itemListElement) {
            finalObj.itemListElement = [
              { '@type': 'ListItem', position: 1, name: 'Home', item: siteData?.url || '/' },
              { '@type': 'ListItem', position: 2, name: post.title },
            ]
          }
        }
      }

      // Always dynamically extract FAQs to ensure the schema matches the actual content
      // Even if the AI generated some FAQs, the extraction ensures exact match with the post text.
      if (typeId === 'faqpage') {
        const faqs = extractFAQs(post.content)
        // Only override if extraction found FAQs, else rely on AI generated ones
        if (faqs.length > 0) {
          finalObj.mainEntity = faqs.map(f => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer }
          }))
        }
      }

      finalSchemaPayload.push(finalObj)
    })

    const schemasObject: Record<string, any> = {}
    finalSchemaPayload.forEach((s) => {
      const type = s['@type'] || 'Schema'
      const id = type.toLowerCase()
      schemasObject[id] = {
        ...s,
        metadata: { title: type, type: 'template' }
      }
    })

    const payload: any = {
      title: post.title,
      content: processedContent,
      excerpt: post.excerpt,
      status: post.wpStatus || 'publish',
      meta: {
        rank_math_title:          post.title,
        _rank_math_title:         post.title,
        rank_math_description:    post.excerpt,
        _rank_math_description:   post.excerpt,
        rank_math_focus_keyword:  post.focusKeyword || '',
        _rank_math_focus_keyword: post.focusKeyword || '',
        rank_math_rich_snippet:   finalSchemaPayload.length > 0
          ? getRmSnippetType(finalSchemaPayload[0]?.['@type'])
          : getRmSnippetType(post.selectedSchemas?.[0]),
      }
    }
    // Only set featured_media when we have a valid ID — sending 0 clears it
    if (featuredMediaId) payload.featured_media = featuredMediaId

    if (categoryIds.length > 0) payload.categories = categoryIds
    if (tagIds.length > 0) payload.tags = tagIds
    if (post.slug) payload.slug = post.slug
    if (featuredMediaId) payload.featured_media = featuredMediaId
    if (post.authorId) payload.author = post.authorId

    if (post.scheduledAt) {
      payload.status = 'future'
      payload.date = new Date(post.scheduledAt).toISOString()
    }

    const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (res.ok) {
      const wpPost = await res.json()
      
      // ── RankMath REST API Sync ─────────────────────────────────────────────
      try {
        await syncAllRankMath({
          baseUrl,
          creds,
          wpPostId:     wpPost.id,
          postSlug:     post.slug || '',
          postUrl:      wpPost.link || '',
          title:        post.title,
          description:  post.excerpt || '',
          focusKeyword: post.focusKeyword || '',
          schemas:      finalSchemaPayload,
          featuredMediaId,
          featuredUrl:  finalFeaturedUrl,
        })
      } catch (rmErr) {
        console.warn('[RankMath] Sync partially failed (non-critical):', rmErr)
      }
      // ────────────────────────────────────────────────────────────────────────

      const finalStatus = post.scheduledAt ? 'scheduled' : 'published'
      const toastTitle = post.scheduledAt ? 'Post Scheduled!' : 'Post Published!'
      const toastMsg = post.scheduledAt ? `"${post.title}" is scheduled on ${site.name}` : `"${post.title}" is now live on ${site.name}`

      updateQueueItem(queueId, {
        status: finalStatus,
        publishedAt: post.scheduledAt ? undefined : new Date().toISOString(),
        wpPostId: wpPost.id
      })
      showToast('success', toastTitle, toastMsg)
      return true
    } else {
      const err = await res.json().catch(() => ({}))
      const msg = err.message || `HTTP ${res.status}: ${res.statusText}`
      updateQueueItem(queueId, { status: 'failed', error: msg })
      showToast('error', 'Publish Failed', msg)
      return false
    }
  } catch (e: any) {
    const msg = e.message || 'Connection failed or site unreachable. Check your WordPress settings.'
    updateQueueItem(queueId, { status: 'failed', error: msg })
    showToast('error', 'Publish Failed', msg)
    return false
  }
}

export async function syncPostSchema(siteId: string, wpPostId: number, schema: any): Promise<boolean> {
  const site = appStore.sites.find(s => s.id === siteId)
  if (!site) return false
  try {
    const creds   = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')
    const schemas = Array.isArray(schema) ? schema : [schema]
    return await syncRankMathSchemas({
      baseUrl, creds, wpPostId,
      postSlug: '', postUrl: '',
      title: '', description: '', focusKeyword: '',
      schemas,
    })
  } catch (e) {
    console.error('Failed to sync post schema:', e)
    return false
  }
}

export async function updateWordPressPost(queueId: string): Promise<boolean> {
  const post = appStore.queue.find(p => p.id === queueId)
  if (!post || !post.wpPostId) return false

  const site = appStore.sites.find(s => s.id === post.siteId)
  if (!site) { showToast('error', 'No site found', 'The target WordPress site was not found.'); return false }

  try {
    const creds = btoa(unescape(encodeURIComponent(`${site.username}:${site.appPassword}`)))
    const baseUrl = site.url.replace(/\/$/, '')

    // 1. Resolve Categories
    const categoryIds: number[] = []
    if (post.categories?.length) {
      for (const catName of post.categories) {
        try {
          const catRes = await fetch(`${baseUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(catName)}`, {
            headers: { Authorization: `Basic ${creds}` }
          })
          const cats = await catRes.json()
          const match = cats.find((c: any) => c.name.toLowerCase() === catName.toLowerCase())
          if (match) {
            categoryIds.push(match.id)
          } else {
            const createRes = await fetch(`${baseUrl}/wp-json/wp/v2/categories`, {
              method: 'POST',
              headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: catName })
            })
            if (createRes.ok) { const c = await createRes.json(); categoryIds.push(c.id) }
          }
        } catch (e) { console.error(`Category resolution failed for ${catName}`, e) }
      }
    }

    // 2. Resolve Tags
    const tagIds: number[] = []
    if (post.tags?.length) {
      for (const tagName of post.tags) {
        try {
          const tagRes = await fetch(`${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, {
            headers: { Authorization: `Basic ${creds}` }
          })
          const tags = await tagRes.json()
          const match = tags.find((t: any) => t.name.toLowerCase() === tagName.toLowerCase())
          if (match) {
            tagIds.push(match.id)
          } else {
            const createRes = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
              method: 'POST',
              headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: tagName })
            })
            if (createRes.ok) { const t = await createRes.json(); tagIds.push(t.id) }
          }
        } catch (e) { console.error(`Tag resolution failed for ${tagName}`, e) }
      }
    }

    // 3. Handle Featured Image
    let featuredMediaId: number | undefined
    let finalFeaturedUrl = post.featuredImageUrl

    // 4. Handle Featured Image (Auto-detect first image if missing)
    if (!finalFeaturedUrl) {
      const firstImgMatch = post.content.match(/<img[^>]+src=["']([^"']+)["']/i)
      if (firstImgMatch) {
        finalFeaturedUrl = firstImgMatch[1]
        console.log(`[AutoFeatured] Detected first content image for update: ${finalFeaturedUrl}`)
      }
    }

    if (finalFeaturedUrl) {
      try {
        console.log(`[FeaturedImage] Resolving ID for Update: ${finalFeaturedUrl}`)
        const resolvedId = await resolveWPImageId(baseUrl, creds, finalFeaturedUrl)
        if (resolvedId) {
          featuredMediaId = resolvedId
          console.log(`[FeaturedImage] Resolved from WP media library (update), ID: ${featuredMediaId}`)
        }

        // Fallback upload if ID not resolved
        if (!featuredMediaId && finalFeaturedUrl) {
          try {
            console.log('[FeaturedImage] Not resolved, uploading for update...')
            const imgBlob = await fetch(finalFeaturedUrl).then(r => r.blob())
            let filename = finalFeaturedUrl.split('/').pop() || 'updated-image'
            if (!filename.toLowerCase().endsWith('.webp')) {
              filename = filename.replace(/\.[^/.]+$/, "") + ".webp"
            }
            const formData = new FormData()
            formData.append('file', imgBlob, filename)
            formData.append('title', post.title)
            formData.append('alt_text', post.focusKeyword || post.title)

            const uploadRes = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
              method: 'POST',
              headers: { Authorization: `Basic ${creds}` },
              body: formData
            })
            if (uploadRes.ok) {
              const media = await uploadRes.json()
              featuredMediaId = media.id
              console.log(`[FeaturedImage] Uploaded for update, ID: ${featuredMediaId}`)
            }
          } catch (upErr) { console.warn('[FeaturedImage] Upload fallback failed', upErr) }
        }
      } catch (e) { console.error('[FeaturedImage] Resolution failed', e) }
    }

    const siteData = appStore.sites.find(s => s.id === post.siteId)
    const finalSchemaPayload: any[] = []
    
    const activeSchemaIds = post.selectedSchemas?.map(s => s.toLowerCase()) || []

    if (siteData?.globalSchemas) {
      Object.entries(siteData.globalSchemas).forEach(([key, s]) => {
        const typeId = key.toLowerCase()
        if (activeSchemaIds.length > 0 && !activeSchemaIds.includes(typeId)) return

        try {
          const parsed = typeof s === 'string' ? JSON.parse(s) : s
          const type = parsed['@type'] || 'Article'
          let content = JSON.stringify(parsed)
          content = content.replace(/\{\{title\}\}/g, post.title)
          content = content.replace(/\{\{excerpt\}\}/g, post.excerpt || '')
          content = content.replace(/\{\{authorName\}\}/g, post.authorName || 'Admin')
          const finalObj = JSON.parse(content)
          delete finalObj['@context']
          if (type.toLowerCase() === 'faqpage') {
            const faqs = extractFAQs(post.content)
            if (faqs.length > 0) {
              finalObj.mainEntity = faqs.map(f => ({
                "@type": "Question",
                "name": f.question,
                "acceptedAnswer": { "@type": "Answer", "text": f.answer }
              }))
            }
          }
          finalSchemaPayload.push(finalObj)
        } catch (e) { console.error('Schema prep failed', e) }
      })
    } else {
      // No globalSchemas configured — build defaults for each selected schema type
      activeSchemaIds.forEach(typeId => {
        const typeLabel = typeId === 'faqpage' ? 'FAQPage'
          : typeId === 'breadcrumblist' ? 'BreadcrumbList'
          : typeId === 'imageobject'    ? 'ImageObject'
          : typeId === 'howto'          ? 'HowTo'
          : typeId === 'webpage'        ? 'WebPage'
          : typeId === 'website'        ? 'WebSite'
          : typeId === 'newsarticle'    ? 'NewsArticle'
          : typeId.charAt(0).toUpperCase() + typeId.slice(1)

        const defaultObj: any = {
          '@type':     typeLabel,
          name:        post.title,
          headline:    post.title,
          description: post.excerpt || '',
        }
        if (typeId === 'article' || typeId === 'newsarticle' || typeId === 'blogposting') {
          defaultObj.author    = { '@type': 'Person', name: post.authorName || 'Admin' }
          defaultObj.publisher = { '@type': 'Organization', name: siteData?.name || 'Website' }
        }
        if (typeId === 'faqpage') {
          const faqs = extractFAQs(post.content)
          defaultObj.mainEntity = faqs.length > 0
            ? faqs.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } }))
            : []
        }
        if (typeId === 'breadcrumblist') {
          defaultObj.itemListElement = [
            { '@type': 'ListItem', position: 1, name: 'Home', item: siteData?.url || '/' },
            { '@type': 'ListItem', position: 2, name: post.title },
          ]
        }
        finalSchemaPayload.push(defaultObj)
      })
    }

    const schemasObject: Record<string, any> = {}
    finalSchemaPayload.forEach((s) => {
      const type = s['@type'] || 'Schema'
      const id = type.toLowerCase()
      schemasObject[id] = {
        ...s,
        metadata: { title: s['@type'], type: 'template' }
      }
    })

    const payload: any = {
      title: post.title,
      content: post.content,
      excerpt: post.excerpt,
      status: post.wpStatus || 'publish',
      meta: {
        rank_math_title:          post.title,
        _rank_math_title:         post.title,
        rank_math_description:    post.excerpt,
        _rank_math_description:   post.excerpt,
        rank_math_focus_keyword:  post.focusKeyword || '',
        _rank_math_focus_keyword: post.focusKeyword || '',
        rank_math_rich_snippet:   finalSchemaPayload.length > 0
          ? getRmSnippetType(finalSchemaPayload[0]?.['@type'])
          : getRmSnippetType(post.selectedSchemas?.[0]),
      }
    }
    // Only set featured_media when we have a valid ID — sending 0 clears it
    if (featuredMediaId) payload.featured_media = featuredMediaId

    if (categoryIds.length > 0) payload.categories = categoryIds
    if (tagIds.length > 0) payload.tags = tagIds
    if (post.authorId) payload.author = post.authorId
    if (post.slug) payload.slug = post.slug
    if (featuredMediaId) payload.featured_media = featuredMediaId

    if (post.scheduledAt) {
      payload.status = 'future'
      payload.date = new Date(post.scheduledAt).toISOString()
    }

    const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${post.wpPostId}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (res.ok) {

      // ── RankMath REST API Sync ─────────────────────────────────────────────
      try {
        await syncAllRankMath({
          baseUrl,
          creds,
          wpPostId:     post.wpPostId,
          postSlug:     post.slug || '',
          postUrl:      `${baseUrl}/${post.slug || ''}`,
          title:        post.title,
          description:  post.excerpt || '',
          focusKeyword: post.focusKeyword || '',
          schemas:      finalSchemaPayload,
          featuredMediaId,
          featuredUrl:  finalFeaturedUrl,
        })
      } catch (e) {
        console.error('[RankMath] Sync Failed (Update):', e)
      }

      showToast('success', 'Post Updated!', `"${post.title}" has been updated on ${site?.name}.`)
      return true
    } else {
      const msg = await res.text()
      console.error('WordPress update failed:', msg)
      showToast('error', 'Update Failed', msg)
      return false
    }
  } catch (e: any) {
    const msg = e.message || 'Connection failed.'
    showToast('error', 'Update Failed', msg)
    return false
  }
}

// ─── AI Content Generation ────────────────────────────────────────────────────
function buildPrompt(opts: {
  topic: string; tone: string; language: string; wordCount: number
  keywords: string[]; focusKeyword?: string; includeOutline: boolean; includeExcerpt: boolean
  includeTags: boolean; includeStats: boolean; includeFaq: boolean; includeQuotes: boolean; includeSchema: boolean
  customPrompt: string; authorName: string; targetAudience: string; affiliateLink: string
}): string {
  const kwStr = opts.keywords.length ? `\nTarget keywords: ${opts.keywords.join(', ')}` : ''
  const customStr = opts.customPrompt ? `\nAdditional instructions: ${opts.customPrompt}` : ''
  const authorStr = opts.authorName ? `\nWritten by: ${opts.authorName}` : ''
  const audienceStr = opts.targetAudience ? `\nTarget audience: ${opts.targetAudience}` : ''
  const affiliateStr = opts.affiliateLink ? `\nIMPORTANT: Naturally integrate this affiliate link: ${opts.affiliateLink}` : ''
  const focusKeyword = opts.focusKeyword || opts.keywords[0] || opts.topic

  return `UNIVERSAL SEO + AI OVERVIEW CONTENT PROMPT

CORE DIRECTIVE:
Generate me a premium content using this keyword: "${focusKeyword}". 
Make sure to add AI overview friendly keywords. I want to rank and show on ChatGPT, Gemini, Claude, Perplexity, and Co-pilot. 
Add an AI overview summary snippet. 
Follow EEAT guidelines and Google Guidelines to create useful, impactful, and knowledge-rich content for my readers. 
Semantically and topically arrange the content. 
Also, list all possible keywords to rank on AI overview, ChatGPT, Gemini, and Claude using my focus keyword.

Use this prompt for the topic: "${opts.topic}"
Focus Keyword: "${focusKeyword}"
Core optimization targets: AI overview, chatgpt, gemini, claude, perplexity, co-pilot, AI mode, and LSI keyword friendly structures to ensure the content is easily extractable by generative engines.
${kwStr}${audienceStr}${authorStr}${affiliateStr}${customStr}

WORD COUNT — NON-NEGOTIABLE:
- The bodyContent MUST contain a minimum of ${Math.max(opts.wordCount, 1500)} words of actual readable text (not counting HTML tags).
- Every section must be fully written out — do NOT summarize or skip. Prioritise depth over breadth.
- A bodyContent under 1,500 words is a FAILED response.

HUMANIZATION — WRITE LIKE A REAL EXPERT HUMAN:
- Mix sentence lengths: short punchy sentences (6-10 words) + medium ones (15-25 words) + occasional long nuanced ones
- Use first-person touches occasionally: "In my experience...", "What I found was...", "Honestly...", "To be fair..."
- Add hedging language: "might", "could", "generally", "tends to", "in most cases", "from what I've seen"
- Use contractions freely: "it's", "you'll", "they're", "I've", "don't", "isn't", "that's"
- Add transitional opinions: "And that matters more than you'd think.", "This is where things get interesting."
- Vary paragraph length: some 2-sentence paragraphs, some 4-sentence, occasional 1-sentence emphasis lines
- FORBIDDEN phrases: "It is worth noting that", "In conclusion, it is clear", "Delve into", "In the realm of", "As an AI language model"
- FORBIDDEN: em dashes (—), emojis, robotic fact-lists with no opinion

CONTENT REQUIREMENTS:
- Use natural, human tone — target under 20% AI feel on AI detectors
- Avoid em dashes (—), emojis, special separators
- Write in clear, structured paragraphs
- MANDATORY: DO NOT NUMBER SECTION HEADINGS (e.g., Use "Quick Verdict Summary" instead of "9. Quick Verdict Summary").
- Language: ${opts.language === 'id' ? 'Indonesian (Bahasa Indonesia)' : opts.language}
- Tone: ${opts.tone}
- Optimized for: Google rankings, AI Overview extraction, Featured snippets
- Use semantic SEO including related entities and user search phrases
- Avoid fluff and generic filler
- Provide real insights, not surface-level descriptions
- Format: Valid HTML for WordPress (Use <h2>, <h3>, <p>, <ul>, <ol>, <li>, <dfn>, <dl>, <dt>, <dd>, <strong>, <table>, <blockquote>). NO <h1>.
- MANDATORY: The "Focus Keyword" ("${focusKeyword}") MUST be naturally included in the "metaDescription" which MUST be exactly 155 characters long.
- MANDATORY: The "Focus Keyword" ("${focusKeyword}") MUST appear naturally within the very first sentence of the opening paragraph of the bodyContent. This is a strict SEO requirement.

CONTENT STRUCTURE:
- Introduction: Briefly introduce the topic, platform, or product and explain what the reader can expect to learn.
- Key Features: Outline the most important features or functionalities that define the product or service.
  - Main Advantages: Explain why this option stands out compared to alternatives in the market.
  - Core Strengths: Highlight the strongest selling points or unique value propositions.
- Performance & Efficiency: Discuss how well the product/service performs in real-world usage.
  - Speed and Processing: Explain responsiveness, speed, or turnaround times.
  - Available Options: Describe flexibility, variety, or customization options available.
- Security & Reliability: Cover safety measures, data protection, and overall trustworthiness.
- Premium Program / Membership: Explain any loyalty systems or premium access features.
  - Levels or Tiers: Describe how the system is structured or progresses.
  - Benefits and Rewards: Summarize perks, incentives, or exclusive advantages.
- Payment / Access Methods: Explain how users can access or use the service, including supported methods or systems.
- Product / Service Offerings: Provide an overview of what is available to users.
- Promotions & Incentives: Summarize available deals or incentives for users.
  - Welcome Offer: Describe introductory benefits for new users.
  - Ongoing Rewards: Explain recurring incentives or loyalty rewards.
  - Reload or Repeat Benefits: Cover incentives for continued use or repeat engagement.
  - Free Access Options: Mention any free trials or no-cost opportunities.
- Mobile Experience: Discuss usability on mobile devices, including performance and accessibility.
- Customer Support: Explain available support channels, response times, and overall service quality.
- Pros and Cons: Provide a balanced view of strengths and weaknesses.
  - Advantages: List the key positives.
  - Disadvantages: List potential drawbacks or limitations.
- Frequently Asked Questions: Answer exactly 10 common concerns or important questions users may have.
- Final Evaluation: Give an overall conclusion, including who the product/service is best suited for. Wrap up the article with a final summary and a decisive "Final Verdict".
- Disclaimer: Include legal, risk, or responsibility statements relevant to the topic. Include both Responsible Use and General Disclaimers.

OPTIMIZATION RULES:
- KEYWORD DENSITY: Use the Focus Keyword ("${focusKeyword}") with a density of 1.0%-1.5% — that means approximately ${Math.round(Math.max(opts.wordCount, 1500) * 0.012)} times for a ${Math.max(opts.wordCount, 1500)}-word article. NEVER use it more than once per paragraph. Use synonyms, pronouns, and related phrases between keyword uses. Density above 2.5% is keyword stuffing and will be penalised by Google.
- Include related terms and entities
- Write like a real reviewer or user
- Add pros and cons where relevant
- Keep sentences varied and human-like
- Avoid robotic phrasing
- MANDATORY: Include a detailed numbered Table of Contents (1., 2., 3...) with the title "Table of Content" as an <h2> heading, followed by EXACTLY 25 items (include sub-headings) and jump links immediately after the first section. This is non-negotiable.
- MANDATORY: Include exactly 10 Frequently Asked Questions (FAQs) with concise and direct answers.
- MANDATORY: Include a detailed Comparison Table (<table>) comparing the core features, performance, and key metrics of the topic. This table must be professional and data-rich.


OPTIONAL ADD-ONS FOR STRONGER RANKING (Include these if relevant):
- Pros and Cons section
- Quick verdict summary
- Who should use this and who should avoid it
- Real-world scenarios or use cases

Please respond ONLY with raw valid JSON — no markdown, no code fences, no extra text before or after:
{
  "metaTitle": "Focus keyword + benefit, max 55 characters",
  "metaDescription": "Action-oriented description with focus keyword — STRICTLY EXACTLY 155 characters including spaces",
  "aiOverview": "70-100 word AI-extractable summary snippet",
  "bodyContent": "Complete article HTML — MINIMUM ${Math.max(opts.wordCount, 1500)} words of readable text, fully developed sections",
  "tags": ["tag1", "tag2", "tag3"]
}`
}


async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 16000
    })
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `HTTP ${res.status}`) }
  const data = await res.json()
  return data.choices[0].message.content
}

async function callAnthropic(apiKey: string, model: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `HTTP ${res.status}`) }
  const data = await res.json()
  return data.content[0].text
}

async function callGemini(apiKey: string, model: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 16000 }
    })
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `HTTP ${res.status}`) }
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

async function callCohere(apiKey: string, model: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch('https://api.cohere.ai/v1/chat', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, message: prompt, temperature: 0.7, max_tokens: 4096 })
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || `HTTP ${res.status}`) }
  const data = await res.json()
  return data.text
}

export async function generateContent(opts: {
  topic: string; tone: string; language: string; wordCount: number
  keywords: string[]; focusKeyword?: string; includeOutline: boolean; includeExcerpt: boolean
  includeTags: boolean; includeStats: boolean; includeFaq: boolean; includeQuotes: boolean; includeSchema: boolean
  customPrompt: string; providerId: string; model: string; authorName: string; targetAudience: string; affiliateLink: string
  abortSignal?: AbortSignal
}): Promise<{ title: string; content: string; excerpt: string; tags: string[] }> {
  const apiKey = appStore.apiKeys[opts.providerId]
  if (!apiKey) throw new Error(`No API key set for ${opts.providerId}. Go to Settings → API Keys.`)

  const prompt = buildPrompt(opts)
  let rawText = ''

  switch (opts.providerId) {
    case 'anthropic': rawText = await callAnthropic(apiKey, opts.model, prompt, opts.abortSignal); break
    case 'google': rawText = await callGemini(apiKey, opts.model, prompt, opts.abortSignal); break
    case 'cohere': rawText = await callCohere(apiKey, opts.model, prompt, opts.abortSignal); break
    default: {
      const provider = allProviders.value.find((p: AIProvider) => p.id === opts.providerId)
      if (!provider) throw new Error('Provider not found')
      rawText = await callOpenAICompatible(provider.baseUrl, apiKey, opts.model, prompt, opts.abortSignal)
    }
  }

  // Strip markdown code fences if the AI wrapped its response (e.g. ```json ... ```)
  const strippedText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()

  // Greedy match from first { to last } to capture the full JSON object
  const firstBrace  = strippedText.indexOf('{')
  const lastBrace   = strippedText.lastIndexOf('}')
  const jsonString  = firstBrace !== -1 && lastBrace > firstBrace
    ? strippedText.slice(firstBrace, lastBrace + 1)
    : null

  if (!jsonString) throw new Error('The AI encountered a formatting error during generation. This is typically due to temporary API instability. Please attempt the generation again.')

  let parsed: any
  try {
    parsed = JSON.parse(jsonString)
  } catch (e) {
    throw new Error('Failed to parse AI response. The generated content was malformed.')
  }

  let content = ''

  if (parsed.aiOverview) {
    content += `<div class="ai-overview-box" style="background: #fefce8; border: 1px solid #fef08a; border-radius: 16px; padding: 24px; margin-bottom: 32px;">
      <div style="font-size:1.05rem; line-height:1.8; color:#2c3e50;">${parsed.aiOverview}</div>
    </div>\n\n`
  }

  let bodyContent = parsed.bodyContent || parsed.content
  if (!bodyContent) {
    // If we have a parsed object but no content field, try to find the longest string value
    const values = Object.values(parsed).filter(v => typeof v === 'string') as string[]
    bodyContent = values.sort((a, b) => b.length - a.length)[0] || rawText.substring(0, 500)
  }
  
  // Wrap Table of Contents for styling
  if (bodyContent.includes('<h2>Table of Content</h2>')) {
    bodyContent = bodyContent.replace(
      /<h2>Table of Content<\/h2>\s*(<(?:ol|ul)>[\s\S]*?<\/(?:ol|ul)>)/i,
      '<div class="toc-container"><h2>Table of Content</h2>$1</div>'
    )
  }

  // Wrap Tables for responsiveness
  if (bodyContent.includes('<table')) {
    bodyContent = bodyContent.replace(
      /(<table[\s\S]*?<\/table>)/gi,
      '<div class="table-responsive">$1</div>'
    )
  }

  content += bodyContent



  if (parsed.schema) {
    const schemaStr = typeof parsed.schema === 'string' ? parsed.schema : JSON.stringify(parsed.schema, null, 2)
    content += `\n\n${schemaStr}`
  }

  return {
    title: parsed.metaTitle || parsed.title || 'Untitled Post',
    content,
    excerpt: parsed.metaDescription || parsed.excerpt || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : []
  }
}

export async function regenerateMeta(opts: {
  providerId: string;
  model: string;
  topic: string;
  content: string;
  abortSignal?: AbortSignal;
}): Promise<{ metaTitle: string; metaDescription: string }> {
  const apiKey = appStore.apiKeys[opts.providerId]
  if (!apiKey) throw new Error(`No API key set for ${opts.providerId}.`)

  const prompt = `Based on the following article content and topic, generate a highly optimized SEO Meta Title (max 55 characters) and a compelling Meta Description (exactly 155 characters).
  
Topic: ${opts.topic}

Content Snippet:
${opts.content.substring(0, 3000)}...

Respond ONLY with valid JSON in this exact format:
{
  "metaTitle": "Your generated title here",
  "metaDescription": "Your generated description here"
}`

  let rawText = ''
  switch (opts.providerId) {
    case 'anthropic': rawText = await callAnthropic(apiKey, opts.model, prompt, opts.abortSignal); break
    case 'google': rawText = await callGemini(apiKey, opts.model, prompt, opts.abortSignal); break
    case 'cohere': rawText = await callCohere(apiKey, opts.model, prompt, opts.abortSignal); break
    default: {
      const provider = allProviders.value.find((p: AIProvider) => p.id === opts.providerId)
      if (!provider) throw new Error('Provider not found')
      rawText = await callOpenAICompatible(provider.baseUrl, apiKey, opts.model, prompt, opts.abortSignal)
    }
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned invalid format.')

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    throw new Error('Failed to parse AI response.')
  }

  return {
    metaTitle: parsed.metaTitle || '',
    metaDescription: parsed.metaDescription || ''
  }
}
