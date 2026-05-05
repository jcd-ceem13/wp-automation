<script setup lang="ts">
import { ref, computed } from 'vue'
import { appStore, generateContent, addToQueue, showToast, publishPost, allProviders, getSiteCategories, createSiteCategory, uploadMediaToWordPress, updateSiteMediaAlt, extractFAQs } from '../store'
import { TONES, LANGUAGES, TARGET_AUDIENCES, type PostQueue } from '../types'

// Form state
const topic          = ref('')
const tone           = ref(appStore.settings.defaultTone)
const language       = ref(appStore.settings.defaultLanguage)
const wordCount      = ref(appStore.settings.defaultWordCount)
const keywords       = ref('')
const customPrompt   = ref('')
const authorName     = ref(appStore.settings.defaultAuthorName)
const authorId       = ref<number | null>(appStore.settings.defaultAuthorId || null)
const targetAudience = ref(appStore.settings.defaultAudience || 'General Audience')
const affiliateLink   = ref('')
const focusKeyword    = ref('')
const slug            = ref('')
const imageDescription = ref('')

const fetchedCategories = ref<{ id: number; name: string }[]>([])
const loadingCats      = ref(false)
const showNewCatForm   = ref(false)
const newCatName       = ref('')
const newCatParent     = ref<number | undefined>(undefined)
const creatingCat      = ref(false)
const uploadingMedia   = ref<Record<number, boolean>>({})

// Toggles
const includeOutline = ref(appStore.settings.defaultIncludeOutline ?? true)
const includeExcerpt = ref(true)
const includeTags    = ref(appStore.settings.defaultIncludeTags ?? true)
const includeStats   = ref(appStore.settings.defaultIncludeStats ?? true)
const includeFaq     = ref(appStore.settings.defaultIncludeFaq ?? true)
const includeQuotes  = ref(appStore.settings.defaultIncludeQuotes ?? false)
const includeSchema  = ref(appStore.settings.defaultIncludeSchema ?? false)
const publishStatus  = ref<'publish' | 'draft' | 'pending'>('publish')
const selectedSiteId   = ref(appStore.settings.defaultSiteId || '')
const selectedSchemas  = ref<string[]>([...(appStore.settings.defaultSelectedSchemas || ['article', 'faqpage', 'breadcrumblist'])])

function toggleSchema(id: string) {
  const i = selectedSchemas.value.indexOf(id.toLowerCase())
  if (i === -1) selectedSchemas.value.push(id.toLowerCase())
  else selectedSchemas.value.splice(i, 1)
}


const selectedProvider = ref(appStore.settings.defaultProvider)
const categories       = ref('')

const imageUrls = ref(['', '', ''])
const imageAlts = ref(['', '', ''])
const imageIds  = ref<(number | null)[]>([null, null, null])

// Post state
const generating  = ref(false)
const abortController = ref<AbortController | null>(null)
const generatedPost = ref<any>(null)
const generatingImg = ref<number | null>(null)

const activeProvider = computed(() => allProviders.value.find(p => p.id === selectedProvider.value))
const activeSite     = computed(() => appStore.sites.find(s => s.id === selectedSiteId.value))

const activeSchemasList = computed(() => {
  const site = activeSite.value
  const availableTypes = ['article', 'faqpage', 'itemlist', 'breadcrumblist', 'imageobject', 'webpage', 'website', 'organization', 'person', 'howto']
  
  // If site has custom schemas, we should include those too
  const siteSchemaKeys = site?.globalSchemas ? Object.keys(site.globalSchemas).map(k => k.toLowerCase()) : []
  const allPossible = Array.from(new Set([...availableTypes, ...siteSchemaKeys]))

  return allPossible.map(id => ({
    id: id.toUpperCase(),
    active: selectedSchemas.value.includes(id.toLowerCase())
  }))
})

const resolvedGraphJson = computed(() => {
  const site = activeSite.value
  if (!site || !site.globalSchemas || Object.keys(site.globalSchemas).length === 0) {
    return JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Article", "headline": generatedPost.value?.title || "...", "description": generatedPost.value?.excerpt || "..." },
        { "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home" }] },
        { "@type": "FAQPage", "mainEntity": [] }
      ]
    }, null, 2)
  }

  const graph = Object.entries(site.globalSchemas)
    .filter(([key]) => selectedSchemas.value.includes(key.toLowerCase()))
    .map(([_, template]) => {
      let t = template
      if (generatedPost.value) {
        t = t.replace(/\{\{title\}\}/g, generatedPost.value.title)
        t = t.replace(/\{\{excerpt\}\}/g, generatedPost.value.excerpt)
        t = t.replace(/\{\{authorName\}\}/g, generatedPost.value.authorName || 'WP Admin')
      }
      try {
        const parsed = JSON.parse(t); 
        delete parsed['@context']; 
        
        if (parsed['@type'] === 'FAQPage' || parsed['@type'] === 'faqpage') {
          const faqs = extractFAQs(generatedPost.value?.content || '')
          if (faqs.length > 0) {
            parsed.mainEntity = faqs.map(f => ({
              "@type": "Question",
              "name": f.question,
              "acceptedAnswer": { "@type": "Answer", "text": f.answer }
            }))
          }
        }
        
        return parsed
      } catch { return { error: "Malformed Template", raw: t } }
    })

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2)
})

const separatedSchemaBlocks = computed(() => {
  const site = activeSite.value
  const post = generatedPost.value
  const types = ['Article', 'ItemList', 'ImageObject', 'WebSite', 'Person', 'FAQPage', 'BreadcrumbList', 'WebPage', 'Organization', 'HowTo']
  
  return types
    .filter(type => selectedSchemas.value.includes(type.toLowerCase()))
    .map(type => {
      const id = type.toLowerCase()
      let content = site?.globalSchemas?.[id]
      
      if (!content) {
        // High-quality default templates for each type
        const defaults: Record<string, any> = {
          'Article': { headline: "{{title}}", description: "{{excerpt}}", author: { "@type": "Person", name: "{{authorName}}" } },
          'ItemList': { itemListElement: [{ "@type": "ListItem", position: 1, name: "Key Feature 1" }, { "@type": "ListItem", position: 2, name: "Key Feature 2" }] },
          'ImageObject': { contentUrl: post?.featuredImageUrl || "https://example.com/image.jpg", caption: "{{title}}" },
          'WebSite': { name: site?.name || "My Website", potentialAction: { "@type": "SearchAction", target: `${site?.url || ''}?s={search_term_string}` } },
          'Person': { name: "{{authorName}}", jobTitle: "Content Expert" },
          'FAQPage': { mainEntity: [] },
          'BreadcrumbList': { itemListElement: [{ "@type": "ListItem", position: 1, name: "Home" }, { "@type": "ListItem", position: 2, name: "{{title}}" }] },
          'WebPage': { name: "{{title}}", description: "{{excerpt}}" },
          'Organization': { name: site?.name || "My Organization", logo: { "@type": "ImageObject", url: site?.logoUrl || `${site?.url}/favicon.ico` } },
          'HowTo': { name: "How to use {{title}}", step: [{ "@type": "HowToStep", text: "Register an account." }, { "@type": "HowToStep", text: "Start playing." }] }
        }
        content = JSON.stringify({ "@context": "https://schema.org", "@type": type, ...defaults[type] }, null, 2)
      }
      
      if (post) {
        content = content.replace(/\{\{title\}\}/g, post.title)
        content = content.replace(/\{\{excerpt\}\}/g, post.excerpt)
        content = content.replace(/\{\{authorName\}\}/g, post.authorName || 'WP Admin')

        // Dynamic FAQ Injection for Preview
        if (type.toLowerCase() === 'faqpage') {
          try {
            const parsed = JSON.parse(content)
            const faqs = extractFAQs(post.content)
            if (faqs.length > 0) {
              parsed.mainEntity = faqs.map(f => ({
                "@type": "Question",
                "name": f.question,
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": f.answer
                }
              }))
              content = JSON.stringify(parsed, null, 2)
            }
          } catch (e) { console.error('FAQ Preview Sync failed', e) }
        }
      }
      return { 
        type: type.toUpperCase(), 
        icon: '•',
        content, 
        active: !!site?.globalSchemas?.[id] 
      }
    })
})

function formatSlug(val: string) {
  return val.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
}

function onSlugInput(e: Event) {
  const input = e.target as HTMLInputElement
  slug.value = formatSlug(input.value)
}

async function onProviderChange() {
  const p = activeProvider.value
  if (p && !appStore.selectedModels[p.id]) {
    appStore.selectedModels[p.id] = p.defaultModel
  }
}

async function fetchCategories() {
  if (!selectedSiteId.value) {
    showToast('warning', 'Select Site', 'Please select a WordPress site first.')
    return
  }
  loadingCats.value = true
  fetchedCategories.value = await getSiteCategories(selectedSiteId.value)
  loadingCats.value = false
  if (fetchedCategories.value.length === 0) {
    showToast('info', 'No Categories', 'No categories found on the selected site.')
  }
}

function toggleCategory(catName: string) {
  const cats = categories.value.split(',').map(c => c.trim()).filter(Boolean)
  const index = cats.indexOf(catName)
  if (index === -1) {
    cats.push(catName)
  } else {
    cats.splice(index, 1)
  }
  categories.value = cats.join(', ')
}

async function generateImage(index: number) {
  if (!topic.value.trim()) {
    showToast('warning', 'Missing Topic', 'Please enter a topic to generate an image.')
    return
  }
  
  const providerId = appStore.settings.defaultImageProvider || 'openai'
  const apiKey = appStore.apiKeys[providerId]
  
  if (!apiKey) {
    const providerName = providerId === 'openai' ? 'ChatGPT (OpenAI)' : 'Gemini (Google)'
    showToast('error', 'API Key Required', `Please enter your ${providerName} API key in Settings > Defaults > Media & Image APIs.`)
    return
  }

  generatingImg.value = index
  try {
    const stylePrompt = imageDescription.value.trim() ? `Style: ${imageDescription.value.trim()}. ` : 'Style: modern, clean, high resolution, professional photography. '
    const prompt = `${stylePrompt} Professional square blog post image for: ${topic.value}. Centered composition.`
    
    let url = ''
    if (providerId === 'openai') {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: "1024x1024"
        })
      })

      const data = await response.json()
      if (data.error) throw new Error(data.error.message)
      const rawUrl = data.data[0].url

      // --- Convert to WebP ---
      showToast('info', 'Optimizing', 'Converting image to WebP format...')
      const img = new Image()
      img.crossOrigin = "anonymous"
      
      const convertedUrl = await new Promise<string>((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 700
          canvas.height = 700
          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(rawUrl)
          ctx.drawImage(img, 0, 0)
          canvas.toBlob((blob) => {
            if (blob) resolve(URL.createObjectURL(blob))
            else resolve(rawUrl)
          }, 'image/webp', 0.85)
        }
        img.onerror = () => {
          console.warn('WebP conversion failed, falling back to original URL')
          resolve(rawUrl)
        }
        img.src = rawUrl
      })

      url = convertedUrl
    } else {
      throw new Error(`Image generation via ${providerId} is currently being implemented. Please use OpenAI/ChatGPT for now.`)
    }
    
    imageUrls.value[index] = url
    showToast('success', 'Image Ready', 'AI image generated and converted to WebP!')
  } catch (err: any) {
    console.error('Image Gen Error:', err)
    showToast('error', 'Generation Failed', err.message || 'Could not connect to AI service.')
  } finally {
    generatingImg.value = null
  }
}

async function handleAddCategory() {
  if (!selectedSiteId.value) { showToast('warning', 'Select Site', 'Select a site first.'); return }
  if (!newCatName.value.trim()) { showToast('warning', 'Enter Name', 'Enter a category name.'); return }
  
  creatingCat.value = true
  const created = await createSiteCategory(selectedSiteId.value, newCatName.value.trim(), newCatParent.value)
  creatingCat.value = false
  
  if (created) {
    showToast('success', 'Category Created', `"${created.name}" added to WordPress.`)
    fetchedCategories.value.push(created)
    toggleCategory(created.name)
    newCatName.value = ''
    newCatParent.value = undefined
    showNewCatForm.value = false
  } else {
    showToast('error', 'Failed', 'Could not create category. It may already exist.')
  }
}

async function handleFileUpload(index: number, event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  if (!selectedSiteId.value) {
    showToast('warning', 'Select Site', 'Please select a WordPress site first.')
    return
  }

  uploadingMedia.value[index] = true
  
  try {
    // --- Convert Upload to WebP ---
    const img = new Image()
    const convertedFile: File = await new Promise((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(file) // Fallback to original
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((blob) => {
          if (blob) {
            const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' })
            resolve(newFile)
          } else {
            resolve(file)
          }
        }, 'image/webp', 0.85)
      }
      img.onerror = () => resolve(file)
      img.src = URL.createObjectURL(file)
    })

    const result = await uploadMediaToWordPress(selectedSiteId.value, convertedFile)
    uploadingMedia.value[index] = false
    
    if (result) {
      imageUrls.value[index] = result.url
      imageIds.value[index] = result.id
      
      // If alt text already typed, sync it now
      if (imageAlts.value[index]) {
        await updateSiteMediaAlt(selectedSiteId.value, result.id, imageAlts.value[index])
      }
      
      showToast('success', 'Image Ready', 'Image converted to WebP and synced to WordPress.')
    } else {
      showToast('error', 'Upload Failed', 'Check your site connection and permissions.')
    }
  } catch (err) {
    uploadingMedia.value[index] = false
    showToast('error', 'Upload Failed', 'Could not process image.')
  }
}

async function syncImageAlt(index: number) {
  const siteId = selectedSiteId.value
  const mediaId = imageIds.value[index]
  const altText = imageAlts.value[index]
  
  if (siteId && mediaId && altText) {
    const success = await updateSiteMediaAlt(siteId, mediaId, altText)
    if (success) {
      showToast('success', 'Alt Text Synced', 'Image metadata updated on WordPress.')
    }
  }
}

function siteNameById(id: string) {
  return appStore.sites.find(s => s.id === id)?.url || 'Site'
}

async function handleGenerate() {
  if (!topic.value.trim()) { showToast('warning', 'Enter a topic', 'Please enter a topic to generate content.'); return }
  if (!customPrompt.value.trim()) { showToast('warning', 'Enter a description', 'Please enter a detailed topic description to guide the AI.'); return }
  const apiKey = appStore.apiKeys[selectedProvider.value]
  if (!apiKey) { showToast('error', 'API Key Missing', `Add your ${activeProvider.value?.name} API key in Settings.`); return }

  generating.value = true
  abortController.value = new AbortController()

  try {
    const result = await generateContent({
      topic:          topic.value,
      tone:           tone.value,
      language:       language.value,
      wordCount:      wordCount.value,
      keywords:       keywords.value.split(',').map(k => k.trim()).filter(Boolean),
      focusKeyword:   imageAlts.value[0] || focusKeyword.value, // Use Featured Alt as Focus Keyword if present
      includeOutline: includeOutline.value,
      includeExcerpt: includeExcerpt.value,
      includeTags:    includeTags.value,
      includeStats:   includeStats.value,
      includeFaq:     includeFaq.value,
      includeQuotes:  includeQuotes.value,
      includeSchema:  includeSchema.value,
      customPrompt:   customPrompt.value,
      authorName:     authorName.value,
      targetAudience: targetAudience.value,
      affiliateLink:  affiliateLink.value,
      providerId:     selectedProvider.value,
      model:          appStore.selectedModels[selectedProvider.value] || activeProvider.value?.defaultModel || '',
      abortSignal:    abortController.value?.signal
    })
    
    // Inject images into content randomly
    const activeFocusKeyword = focusKeyword.value || keywords.value.split(',')[0]?.trim() || topic.value
    let finalContent = result.content || ''
    
    // Wrap first occurrence of focus keyword in <dfn> (Content Body)
    if (activeFocusKeyword) {
      const escapedKW = activeFocusKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const kwRegex = new RegExp(`(${escapedKW})`, 'i')
      finalContent = finalContent.replace(kwRegex, '<dfn>$1</dfn>')
    }
    
    const validImages = imageUrls.value.filter(url => url.trim() !== '')
    if (validImages.length > 0) {
      const parts = finalContent.split('</p>')
      if (parts.length > 1) {
        let availableIndices = Array.from({length: parts.length - 1}, (_, i) => i)
        // Shuffle indices
        for (let i = availableIndices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = availableIndices[i] as number;
          availableIndices[i] = availableIndices[j] as number;
          availableIndices[j] = temp;
        }
        
        let newParts = []
        let imgUsedCounter = 0
        
        // Find TOC end index or first paragraph end
        let tocEndIndex = -1
        if (includeOutline.value) {
          // Look for common TOC markers
          const markers = ['</div>', '</ul>', '</nav>']
          for (const m of markers) {
            const idx = parts.findIndex(p => p.includes(m))
            if (idx !== -1) { tocEndIndex = idx; break }
          }
        }
        // Fallback to first paragraph if no TOC markers found
        const firstImgIndex = tocEndIndex !== -1 ? tocEndIndex : 0
 
        // Filter out the firstImgIndex from random pool
        let otherIndices = availableIndices.filter(idx => idx !== firstImgIndex)
        const randomIndices = otherIndices.slice(0, validImages.length - 1)
        const finalInsertIndices = [firstImgIndex, ...randomIndices]
 
        for (let i = 0; i < parts.length; i++) {
          newParts.push(parts[i])
          if (i < parts.length - 1) {
            newParts.push('</p>')
            
            if (finalInsertIndices.includes(i) && imgUsedCounter < validImages.length) {
              const imgUrl = validImages[imgUsedCounter]
              // Find index of this URL to get corresponding Alt text
              const originalIndex = imageUrls.value.indexOf(imgUrl as string)
              const altText = imageAlts.value[originalIndex] || focusKeyword.value || keywords.value.split(',')[0]?.trim() || topic.value
              
              let imgTag = `<img src="${imgUrl}" alt="${altText}" style="max-width:100%; border-radius:8px;" />`
              if (affiliateLink.value) {
                imgTag = `<a href="${affiliateLink.value}" target="_blank" rel="nofollow sponsored">${imgTag}</a>`
              }
              newParts.push(`\n\n<figure class="wp-block-image" style="text-align:center; margin: 25px 0;">${imgTag}</figure>\n\n`)
              imgUsedCounter++
            }
          }
        }
        finalContent = newParts.join('')
      } else {
        // Fallback: just put them at the top
        validImages.forEach((url, vIdx) => {
          const originalIndex = imageUrls.value.indexOf(url)
          const altText = imageAlts.value[originalIndex] || focusKeyword.value || keywords.value.split(',')[0]?.trim() || topic.value
          
          let imgTag = `<img src="${url}" alt="${altText}" style="max-width:100%; border-radius:8px;" />`
          if (affiliateLink.value) {
            imgTag = `<a href="${affiliateLink.value}" target="_blank" rel="nofollow sponsored">${imgTag}</a>`
          }
          finalContent = `<figure class="wp-block-image" style="text-align:center; margin: 25px 0;">${imgTag}</figure>\n\n` + finalContent
        })
      }
    }

    const wc = wordCountEstimate(finalContent)
    // Detect first image with Focus Keyword as Alt Text for Featured Image
    let finalFeaturedUrl = validImages.length > 0 ? validImages[0] : undefined
    let finalFeaturedAlt = imageAlts.value[0] || activeFocusKeyword

    // Scan content for an image matching the focus keyword
    const allImages = finalContent.match(/<img[^>]+>/gi) || []
    for (const imgTag of allImages) {
      const srcMatch = imgTag.match(/src=["']([^"']+)["']/i)
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i)
      
      if (srcMatch?.[1] !== undefined && altMatch?.[1] !== undefined) {
        const src = srcMatch[1]
        const alt = altMatch[1]
        if (alt.toLowerCase().trim() === activeFocusKeyword.toLowerCase().trim()) {
          finalFeaturedUrl = src
          finalFeaturedAlt = alt
          break
        }
      }
    }

    const newPostData: Omit<PostQueue, 'id' | 'createdAt'> = {
      title:      result.title,
      content:    finalContent,
      excerpt:    result.excerpt,
      tags:       result.tags,
      categories: categories.value.split(',').map(c => c.trim()).filter(Boolean),
      siteId:     selectedSiteId.value,
      aiProvider: selectedProvider.value,
      aiModel:    appStore.selectedModels[selectedProvider.value] || '',
      status:     'draft',
      wpStatus:   publishStatus.value,
      scheduledAt: undefined,
      wordCount:   wc,
      featuredImageUrl: finalFeaturedUrl,
      featuredImageAlt: finalFeaturedAlt,
      focusKeyword: activeFocusKeyword,
      slug: slug.value.trim() || undefined,
      authorName: authorName.value || undefined,
      authorId: authorId.value || undefined,
      affiliateLink: affiliateLink.value || undefined,
      selectedSchemas: [...selectedSchemas.value]
    }

    const finalPost = addToQueue(newPostData)
    generatedPost.value = finalPost

    if (selectedSiteId.value) {
      showToast('success', 'Content & Schema Generated!', `"${result.title}" and its Global Schema were added to the queue.`)
    } else {
      showToast('success', 'Content Generated!', `"${result.title}" added to queue.`)
    }
    // We no longer auto-redirect so the user can see the preview at the bottom
    // appStore.activePage = 'queue'
    // resetForm()
  } catch (e: any) {
    if (e.name === 'AbortError') {
      showToast('info', 'Cancelled', 'Content generation was cancelled.')
    } else {
      showToast('error', 'Generation Failed', e.message || String(e))
    }
  } finally {
    generating.value = false
    abortController.value = null
  }
}

function wordCountEstimate(html: string | undefined) {
  if (!html) return 0
  return html.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length
}

function resetForm() {
  topic.value = ''
  keywords.value = ''
  focusKeyword.value = ''
  slug.value = ''
  customPrompt.value = ''
  affiliateLink.value = ''
  imageUrls.value = ['', '', '']
  imageAlts.value = ['', '', '']
  
  includeOutline.value = appStore.settings.defaultIncludeOutline ?? true
  includeTags.value    = appStore.settings.defaultIncludeTags ?? true
  includeStats.value   = appStore.settings.defaultIncludeStats ?? true
  includeFaq.value     = appStore.settings.defaultIncludeFaq ?? true
  includeQuotes.value  = appStore.settings.defaultIncludeQuotes ?? false
  includeSchema.value  = appStore.settings.defaultIncludeSchema ?? false
}
const isPublishingNow = ref(false)
async function handlePublishNow() {
  if (!generatedPost.value) return
  isPublishingNow.value = true
  
  const success = await publishPost(generatedPost.value.id)
  
  isPublishingNow.value = false
  if (success) {
    generatedPost.value = null // Close the preview upon success
    appStore.activePage = 'queue' // Send them to queue/published list to see it
  }
}
</script>

<template>
  <div class="generate-page">
    <div class="gen-form card">
      <div class="card-header">
        <span class="card-title">Content Generator</span>
        <div v-if="activeProvider" class="provider-badge" :style="{ color: activeProvider.color }">
          {{ activeProvider.icon }} {{ activeProvider.name }}
        </div>
      </div>

      <div class="form-grid">
        <!-- Section: Content & Topic -->
        <div class="form-section full-span">
          <div class="section-header">
            <div class="section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </div>
            <div class="section-title-group">
              <div class="section-label">Content & Topic</div>
              <div class="section-desc">Define the main subject and guiding description for your post.</div>
            </div>
          </div>
          <div class="form-group mb-3">
            <label class="form-label">Topic / Title *</label>
            <input v-model="topic" class="form-input" placeholder="e.g. 10 Tips for Remote Work Productivity in 2025" @keyup.enter="handleGenerate" />
          </div>
          <div class="form-group">
            <label class="form-label">Detailed Description *</label>
            <textarea v-model="customPrompt" class="form-textarea" rows="4" placeholder="Describe what the article should be about in detail..." />
          </div>
        </div>

        <!-- Section: AI Intelligence -->
        <div class="form-section">
          <div class="section-header">
            <div class="section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            <div class="section-title-group">
              <div class="section-label">AI Intelligence</div>
              <div class="section-desc">Choose your engine and personality.</div>
            </div>
          </div>
          <div class="form-group mb-3">
            <label class="form-label">AI Provider</label>
            <select v-model="selectedProvider" class="form-select" @change="onProviderChange">
              <option v-for="p in allProviders" :key="p.id" :value="p.id">
                {{ p.name }} {{ appStore.apiKeys[p.id] ? '✓' : '(no key)' }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Model Selection</label>
            <select v-if="activeProvider" v-model="appStore.selectedModels[selectedProvider]" class="form-select">
              <option v-for="m in activeProvider.models" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
        </div>

        <!-- Section: Content Strategy -->
        <div class="form-section">
          <div class="section-header">
            <div class="section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <div class="section-title-group">
              <div class="section-label">Content Strategy</div>
              <div class="section-desc">Targeting and length controls.</div>
            </div>
          </div>
          <div class="form-grid-inner">
            <div class="form-group">
              <label class="form-label">Target Audience</label>
              <select v-model="targetAudience" class="form-select">
                <option v-for="a in TARGET_AUDIENCES" :key="a" :value="a">{{ a }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Writing Tone</label>
              <select v-model="tone" class="form-select">
                <option v-for="t in TONES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>
          <div class="form-grid-inner mt-3">
            <div class="form-group">
              <label class="form-label">Language</label>
              <select v-model="language" class="form-select">
                <option v-for="l in LANGUAGES" :key="l.code" :value="l.code">{{ l.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Word Count: <span class="text-purple">{{ wordCount }}</span></label>
              <div class="slider-control">
                <input type="range" v-model.number="wordCount" min="200" max="3500" step="100" class="form-range" />
              </div>
            </div>
          </div>
        </div>

        <!-- Section: SEO & Connectivity -->
        <div class="form-section full-span">
          <div class="section-header">
            <div class="section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
            <div class="section-title-group">
              <div class="section-label">SEO & Optimization</div>
              <div class="section-desc">Keywords, slugs, and monetization.</div>
            </div>
          </div>
          <div class="form-grid-3">
            <div class="form-group">
              <label class="form-label">Focus Keyword *</label>
              <input v-model="focusKeyword" class="form-input" placeholder="e.g. Remote Work" />
            </div>
            <div class="form-group">
              <label class="form-label">Secondary Keywords</label>
              <input v-model="keywords" class="form-input" placeholder="SEO, productivity..." />
            </div>
            <div class="form-group">
              <label class="form-label">URL Slug</label>
              <input v-model="slug" class="form-input" placeholder="post-slug-here" @input="onSlugInput" />
            </div>
          </div>
          <div class="form-grid-inner mt-3">
            <div class="form-group">
              <label class="form-label">Author Name</label>
              <input v-model="authorName" class="form-input" placeholder="Shame Cee" />
            </div>
            <div class="form-group">
              <label class="form-label">Affiliate Link</label>
              <input v-model="affiliateLink" class="form-input" placeholder="https://example.com/ref/123" />
            </div>
          </div>
        </div>

        <!-- Section: Media & Images -->
        <div class="form-section full-span mt-3">
          <div class="section-header">
            <div class="section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            </div>
            <div class="section-title-group">
              <div class="section-label">Media & Image Assets</div>
              <div class="section-desc">Generate or upload images to be embedded in your content.</div>
            </div>
          </div>
          
          <div class="form-group mb-4">
            <label class="form-label">Image Generation Style (Optional)</label>
            <input v-model="imageDescription" class="form-input" placeholder="e.g. Minimalist 3D render, dark aesthetic, professional photography..." />
          </div>
          
          <div class="form-grid-3">
            <div v-for="i in [0,1,2]" :key="i" class="img-input-group">
              <div class="img-featured-indicator" :style="{ opacity: i === 0 ? 1 : 0 }">
                ★ FEATURED IMAGE
              </div>
              <label class="img-upload-label" :class="{ 'uploading': uploadingMedia[i], 'has-img': imageUrls[i] }">
                <input type="file" accept="image/*" class="hide-input" @change="handleFileUpload(i, $event)" />
                <div v-if="uploadingMedia[i]" class="upload-status">
                  <span class="spinner" />
                  <span class="text-xs">Processing...</span>
                </div>
                <template v-else>
                  <img v-if="imageUrls[i]" :src="imageUrls[i]" class="preview-img" />
                  <div v-else class="img-placeholder">
                    <span class="icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    </span>
                    <span class="text-xs font-bold">{{ i === 0 ? 'FEATURED' : 'CONTENT' }}</span>
                    <span class="text-xs">Click to Upload</span>
                  </div>
                </template>
                <div v-if="imageUrls[i]" class="img-actions">
                  <button class="btn-clear" @click.stop.prevent="imageUrls[i] = ''; imageAlts[i] = ''; imageIds[i] = null">✕ Remove</button>
                </div>
              </label>
              
              <div class="img-controls mt-2">
                <button v-if="!imageUrls[i]" class="btn-gen-img" @click.stop.prevent="generateImage(i)" :disabled="generatingImg === i">
                  <span v-if="generatingImg === i" class="spinner-tiny" />
                  {{ generatingImg === i ? 'Generating...' : 'AI Generate' }}
                </button>
                <input v-model="imageAlts[i]" class="form-input-sm w-full" placeholder="SEO Alt Text..." @change="syncImageAlt(i)" />
              </div>
            </div>
          </div>
        </div>

        <!-- Section: Optimization Toggles -->
        <div class="form-section full-span mt-3">
          <div class="section-header">
            <div class="section-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </div>
            <div class="section-title-group">
              <div class="section-label">SEO Optimization Toggles</div>
              <div class="section-desc">Enable advanced features and structure for your post.</div>
            </div>
          </div>
          <div class="options-grid">
            <label class="toggle-pill" :class="{ active: includeOutline }">
              <input type="checkbox" v-model="includeOutline" class="hide-input" />
              <div class="pill-switch"><div class="switch-knob"></div></div>
              Table of Contents
            </label>
            <label class="toggle-pill" :class="{ active: includeStats }">
              <input type="checkbox" v-model="includeStats" class="hide-input" />
              <div class="pill-switch"><div class="switch-knob"></div></div>
              Statistics
            </label>
            <label class="toggle-pill" :class="{ active: includeFaq }">
              <input type="checkbox" v-model="includeFaq" class="hide-input" />
              <div class="pill-switch"><div class="switch-knob"></div></div>
              FAQ Section
            </label>
            <label class="toggle-pill" :class="{ active: includeQuotes }">
              <input type="checkbox" v-model="includeQuotes" class="hide-input" />
              <div class="pill-switch"><div class="switch-knob"></div></div>
              Expert Quotes
            </label>
            <label class="toggle-pill" :class="{ active: includeTags }">
              <input type="checkbox" v-model="includeTags" class="hide-input" />
              <div class="pill-switch"><div class="switch-knob"></div></div>
              Auto Tags
            </label>
            <label class="toggle-pill" :class="{ active: includeSchema }">
              <input type="checkbox" v-model="includeSchema" class="hide-input" />
              <div class="pill-switch"><div class="switch-knob"></div></div>
              Generate Schema
            </label>
          </div>

          <!-- Active Post Schemas -->
          <div v-if="includeSchema" class="mt-4 fade-in">
            <div class="flex justify-between items-center mb-2">
              <span class="text-xs font-bold text-muted uppercase tracking-wider">Active Post Schemas</span>
              <span class="text-xs font-semibold text-purple opacity-70">AI-Optimized for this content</span>
            </div>
            <div class="schema-chip-list">
              <span v-for="s in activeSchemasList" :key="s.id" 
                @click="toggleSchema(s.id)"
                :class="['schema-chip', { active: s.active }]"
                :style="{
                  fontSize: '0.65rem',
                  background: s.active ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-card)',
                  color: s.active ? 'var(--purple)' : 'var(--text-muted)',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  border: s.active ? '1px solid var(--purple)' : '1px solid var(--border)',
                  fontWeight: '700',
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }"
              >
                <span>{{ s.id }}</span>
                <span v-if="s.active">✓</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Site Selection -->
        <div class="form-group">
          <label class="form-label">Target WordPress Site</label>
          <select v-model="selectedSiteId" class="form-select">
            <option value="">— Select Site —</option>
            <option v-for="s in appStore.sites" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <div v-if="selectedSiteId" style="margin-top: 8px; display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--green); font-weight: 500;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Selected Schema will automatically generate and sync upon publishing.
          </div>
        </div>

        <div class="form-group">
          <div class="flex justify-between items-center">
            <label class="form-label">Categories (comma separated)</label>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-xs" @click="showNewCatForm = !showNewCatForm" :title="showNewCatForm ? 'Cancel' : 'Add New Category'">
                <svg v-if="showNewCatForm" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <button class="btn btn-ghost btn-xs" :disabled="loadingCats || !selectedSiteId" @click="fetchCategories" title="Refresh categories">
                <span v-if="loadingCats" class="spinner" style="width:10px;height:10px;border-width:1.5px;" />
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              </button>
            </div>
          </div>

          <div v-if="showNewCatForm" class="new-cat-inline mb-2 fade-in">
            <div class="flex flex-col gap-3">
              <div class="flex gap-2">
                <input v-model="newCatName" class="form-input form-input-sm" style="flex:1;" placeholder="New category name..." @keyup.enter="handleAddCategory" />
                <button class="btn btn-primary btn-sm" :disabled="creatingCat" @click="handleAddCategory">
                  <span v-if="creatingCat" class="spinner spinner-white" style="width:12px;height:12px;" />
                  {{ creatingCat ? '' : 'Create' }}
                </button>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold text-muted">Parent Category (Optional)</label>
                <select v-model="newCatParent" class="form-select form-select-sm">
                  <option :value="undefined">— None —</option>
                  <option v-for="cat in fetchedCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
                </select>
              </div>
            </div>
          </div>

          <div class="flex gap-2">
            <input v-model="categories" class="form-input" placeholder="Tech, Productivity" />
          </div>
          
          <!-- Category Chips -->
          <div v-if="fetchedCategories.length" class="cat-chip-list mt-2">
            <button
              v-for="cat in fetchedCategories"
              :key="cat.id"
              :class="['cat-chip', { active: categories.includes(cat.name) }]"
              @click="toggleCategory(cat.name)"
            >
              <span v-if="categories.includes(cat.name)" style="margin-right: 4px;">✓</span>
              {{ cat.name }}
            </button>
          </div>
        </div>
      </div>

      <div class="generate-btn-row">
        <button class="btn btn-primary btn-lg btn-full" :disabled="generating || !topic.trim()" @click="handleGenerate">
          <span v-if="generating" class="spinner spinner-white" />
          {{ generating ? 'Generating Content...' : 'Generate with AI' }}
        </button>
      </div>

      <div v-if="generatedPost && !generating" class="success-banner-inline mt-3">
        <div class="banner-icon">🎯</div>
        <div class="banner-content">
          <div class="banner-title">Post Sent to Queue!</div>
          <div class="banner-desc">Your content is ready for review in the <strong>Manage Posts</strong> tab.</div>
        </div>
        <button class="btn btn-primary btn-sm" @click="appStore.activePage = 'queue'">View in Queue</button>
      </div>
    </div>

    <!-- Result Preview Section -->
    <div v-if="generatedPost" class="card mt-4 result-preview">
      <div class="card-header">
        <span class="card-title">✨ Result Preview</span>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button class="btn btn-secondary btn-sm" style="background: var(--bg-card-hover); color: var(--text-primary); border: 1px solid var(--purple);" :disabled="isPublishingNow" @click="handlePublishNow">
            <span v-if="isPublishingNow" class="spinner" style="width: 12px; height: 12px; border-width: 1.5px; margin-right: 6px;"></span>
            {{ isPublishingNow ? 'Publishing...' : 'Publish Now & Sync' }}
          </button>
          <button class="btn btn-primary btn-sm" @click="appStore.activePage = 'queue'">Manage in Queue</button>
          <button class="btn btn-ghost btn-sm" @click="generatedPost = null">Close Preview</button>
        </div>
      </div>
      <div class="preview-body">
        <h2 class="preview-title">{{ generatedPost.title }}</h2>
        <div class="preview-meta">
          <span class="meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            {{ generatedPost.wordCount }} words
          </span>
          <span class="meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
            {{ generatedPost.tags.join(', ') }}
          </span>
        </div>
        <div class="preview-content-box" v-html="generatedPost.content"></div>

        <!-- Auto-Generated Schema Preview -->
        <div v-if="selectedSiteId" class="schema-preview-box" style="margin-top: 32px; background: var(--bg-deep); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <h3 style="margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; color: var(--text-primary);">
              <span style="color: var(--purple);">✨</span> AI-Generated Post Schemas
            </h3>
            <span style="background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; border: 1px solid rgba(16, 185, 129, 0.2);">
              Ready to Sync
            </span>
          </div>
          
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">
            <span v-for="block in separatedSchemaBlocks" :key="block.type" 
              :style="{
                fontSize: '0.65rem', 
                background: block.active ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255,255,255,0.05)', 
                color: block.active ? 'var(--purple)' : 'var(--text-muted)', 
                padding: '2px 8px', 
                borderRadius: '10px', 
                border: block.active ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid rgba(255,255,255,0.1)', 
                fontWeight: '600',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }">
              <span>{{ block.icon }}</span>
              <span>{{ block.type }}</span>
            </span>
          </div>

          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">The following JSON-LD schemas are separated by type for individual review.</p>
          
          <div class="no-scrollbar schema-grid">
            <div v-for="block in separatedSchemaBlocks" :key="block.type"
              style="background: #1e1e1e; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
              <div style="background: rgba(255,255,255,0.03); padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span>{{ block.icon }}</span>
                  <span style="font-size: 0.6rem; font-weight: bold; color: var(--purple);">{{ block.type }}</span>
                </div>
                <span v-if="block.active" style="font-size: 0.55rem; color: #10b981;">• Active Template</span>
              </div>
              <pre class="no-scrollbar" style="padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; overflow: auto; color: #d4d4d4; margin: 0; line-height: 1.4; max-height: 220px;">{{ block.content }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Generating Modal Overlay -->
    <div v-if="generating" class="modal-overlay">
      <div class="modal-content loading-modal">
        <div class="premium-loader">
          <div class="loader-ring"></div>
          <div class="loader-ring"></div>
          <div class="loader-ring"></div>
          <div class="loader-icon">✨</div>
        </div>
        
        <div class="loading-text-wrap">
          <h3 class="loading-title">Crafting Your Masterpiece...</h3>
          <p class="loading-desc">Our AI is semantically arranging your content for maximum impact and SEO performance. This usually takes 30-60 seconds.</p>
        </div>

        <div class="loading-status">
          <div class="loading-bar">
            <div class="loading-bar-fill"></div>
          </div>
          <span class="status-label">Researching & Writing...</span>
        </div>

        <button class="btn-cancel-minimal" @click="abortController?.abort()">
          <span>Cancel Generation</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.generate-page { display: flex; flex-direction: column; gap: 24px; padding-bottom: 40px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.form-grid-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.full-span  { grid-column: 1 / -1; }

.form-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: var(--shadow-sm);
}
.img-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-input-sm {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-deep);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 0.75rem;
  color: var(--text-primary);
  transition: all 0.2s;
}
.form-input-sm:focus {
  border-color: var(--purple);
  background: var(--bg-card);
  outline: none;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}
.form-input-sm::placeholder { color: var(--text-muted); opacity: 0.6; }

.section-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}
.section-icon {
  width: 38px;
  height: 38px;
  background: rgba(139, 92, 246, 0.1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
  color: var(--purple);
}
.section-title-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.section-label { font-size: 1rem; font-weight: 800; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.section-desc { font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; }

.gen-form.card {
  padding: 32px;
}

@media (max-width: 768px) {
  .gen-form.card { padding: 20px 16px; }
  .section-label { white-space: normal; }
}


.options-grid {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none; /* Hide scrollbar Firefox */
}
.options-grid::-webkit-scrollbar { display: none; } /* Hide scrollbar Chrome/Safari */

.toggle-pill {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1.5px solid var(--border);
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  white-space: nowrap;
}
.toggle-pill.active {
  border-color: var(--purple);
  color: var(--purple);
  background: rgba(139, 92, 246, 0.04);
}
.toggle-pill:hover { border-color: var(--purple); }

.pill-switch {
  width: 32px;
  height: 18px;
  background: var(--border);
  border-radius: 20px;
  position: relative;
  transition: all 0.3s;
  flex-shrink: 0;
}
.switch-knob {
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle-pill.active .pill-switch { background: var(--purple); }
.toggle-pill.active .switch-knob { left: 16px; }

.img-featured-indicator {
  height: 20px;
  font-size: 0.65rem;
  font-weight: 900;
  color: var(--purple);
  margin-bottom: 8px;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
}

.btn-gen-img {
  width: 100%;
  padding: 8px 14px;
  background: var(--purple);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}
.btn-gen-img:hover { opacity: 0.9; }
.btn-gen-img:disabled { opacity: 0.6; cursor: not-allowed; }

.form-range {
  width: 100%;
  accent-color: var(--purple);
  cursor: pointer;
  height: 6px;
  background: var(--bg-deep);
  border-radius: 10px;
  appearance: none;
}
.form-range::-webkit-slider-runnable-track { height: 6px; border-radius: 10px; }
.form-range::-webkit-slider-thumb { margin-top: -5px; } /* Adjust thumb position if needed */

.slider-control {
  height: 44px; /* Exact match for .form-select height */
  display: flex;
  align-items: center;
  padding: 0 4px;
}

.img-upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 140px;
  background: var(--bg-deep);
  border: 2px dashed var(--border);
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.2s;
}
.img-upload-label:hover { border-color: var(--purple); background: var(--bg-surface); }
.img-upload-label.has-img { border-style: solid; border-color: var(--purple); }
.preview-img { width: 100%; height: 100%; object-fit: cover; }

.hide-input { display: none !important; }

.img-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  opacity: 0.7;
}

.img-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0,0,0,0.6);
  padding: 4px 8px;
  border-radius: 4px;
  color: white;
  font-size: 0.65rem;
  font-weight: bold;
  cursor: pointer;
  z-index: 5;
}

.generate-btn-row { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border); }

@media (max-width: 1024px) {
  .form-grid { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .generate-page { padding: 0 0 40px; }
  .app-content { padding-left: 10px !important; padding-right: 10px !important; }
  .gen-form.card { padding: 16px 12px; margin: 0; width: 100%; box-sizing: border-box; }
  .form-section { padding: 16px 14px; border-radius: 12px; width: 100%; box-sizing: border-box; }
  .form-grid-3 { grid-template-columns: 1fr; gap: 12px; width: 100%; }
  .form-grid-inner { grid-template-columns: 1fr; gap: 12px; width: 100%; }
  .section-header { margin-bottom: 12px; gap: 10px; width: 100%; }
  .section-icon { width: 32px; height: 32px; border-radius: 8px; font-size: 1rem; }
  .section-icon svg { width: 16px; height: 16px; }
  .section-label { font-size: 0.9rem; }
  .section-desc { font-size: 0.75rem; line-height: 1.3; }
  .generate-btn-row { padding: 16px 0 0; margin-top: 16px; width: 100%; }
  .btn-full { width: 100% !important; margin: 0; }
}

@media (max-width: 480px) {
  .app-content { padding-left: 8px !important; padding-right: 8px !important; }
  .gen-form.card { padding: 12px 10px; }
  .form-section { padding: 14px 10px; }
  .section-header { gap: 8px; }
  .section-icon { width: 28px; height: 28px; }
  .section-label { font-size: 0.85rem; }
  .img-upload-label { height: 120px; }
  .toggle-pill { padding: 6px 10px; font-size: 0.75rem; gap: 8px; }
  .pill-switch { width: 28px; height: 16px; }
  .switch-knob { width: 12px; height: 12px; }
  .toggle-pill.active .switch-knob { left: 14px; }
  .form-input, .form-select, .form-textarea { padding: 8px 10px; font-size: 0.85rem; }
  .card-header { gap: 8px; padding-bottom: 12px; }
  .card-title { font-size: 0.9rem; }
}




.text-purple { color: var(--purple); font-weight: 800; }

.schema-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px;
  background: var(--bg-deep);
  border-radius: 12px;
  border: 1px solid var(--border);
}

/* Category Chips */
.cat-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}

.cat-chip {
  padding: 6px 14px;
  background: var(--bg-surface);
  border: 1.5px solid var(--border);
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.cat-chip:hover {
  border-color: var(--purple);
  background: rgba(139, 92, 246, 0.03);
  transform: translateY(-1px);
}

.cat-chip.active {
  background: var(--grad-primary);
  border-color: transparent;
  color: white;
  box-shadow: 0 4px 10px rgba(139, 92, 246, 0.25);
}

/* Result Preview Improvements */
.result-preview {
  border: 2px solid var(--purple);
}

.preview-body {
  padding: 32px;
  background: var(--bg-surface);
  color: var(--text-primary);
}

.preview-title {
  font-size: 2rem;
  font-weight: 800;
  margin-bottom: 12px;
  line-height: 1.2;
}

.preview-meta {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 32px;
  background: var(--bg-deep);
  padding: 8px 16px;
  border-radius: 10px;
  width: fit-content;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.preview-content-box {
  font-size: 1.05rem;
  line-height: 1.8;
}

.preview-content-box h2 {
  font-size: 1.5rem;
  margin-top: 2rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--bg-deep);
  padding-bottom: 8px;
}

.preview-content-box h3 {
  font-size: 1.25rem;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.preview-content-box p {
  margin-bottom: 1.5rem;
}

/* Table of Contents Styling */
.preview-content-box .toc-container {
  background: var(--bg-deep);
  padding: 32px;
  border-radius: 20px;
  border: 1.5px solid var(--border);
  margin: 40px 0;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
}

.preview-content-box .toc-container h2 {
  margin-top: 0;
  border-bottom: 2px solid rgba(139, 92, 246, 0.1);
  color: var(--purple);
  font-size: 1.4rem;
  padding-bottom: 12px;
}

.preview-content-box .toc-container ol, 
.preview-content-box .toc-container ul {
  margin-bottom: 0;
  padding-left: 1.2rem;
}

.preview-content-box .toc-container li {
  margin-bottom: 8px;
  font-weight: 500;
}

.preview-content-box .toc-container li a {
  color: var(--text-primary);
  text-decoration: none;
  transition: all 0.2s;
}

.preview-content-box .toc-container li a:hover {
  color: var(--purple);
  padding-left: 4px;
}

.preview-content-box ol, .preview-content-box ul {
  margin-bottom: 1.5rem;
  padding-left: 1.5rem;
}

.preview-content-box li {
  margin-bottom: 0.5rem;
}

.preview-content-box .ai-overview-box {
  background: linear-gradient(135deg, #fdfcfb 0%, #f5f7fa 100%);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-left: 6px solid var(--purple);
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 40px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.03);
}

.preview-content-box .ai-overview-box::before {
  content: "✨ AI SUMMARY";
  position: absolute;
  top: 12px;
  right: 16px;
  font-size: 0.65rem;
  font-weight: 900;
  color: var(--purple);
  opacity: 0.6;
  letter-spacing: 0.05em;
}

.preview-content-box .ai-overview-box div {
  font-size: 1.1rem !important;
  color: #2c3e50 !important;
  line-height: 1.8 !important;
  font-style: italic;
}

.ai-overview-box {
  animation: fadeIn 0.5s ease-out;
}

/* Responsive Table Styling */
.preview-content-box .table-responsive {
  width: 100%;
  overflow-x: auto;
  margin: 32px 0;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  -webkit-overflow-scrolling: touch;
}

.preview-content-box table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px; /* Force scroll on mobile */
  font-size: 0.9rem;
}

.preview-content-box th, 
.preview-content-box td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.preview-content-box th {
  background: var(--bg-deep);
  color: var(--purple);
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.preview-content-box tr:last-child td {
  border-bottom: none;
}

.preview-content-box tr:hover td {
  background: rgba(139, 92, 246, 0.02);
}

@media (max-width: 768px) {
  .preview-content-box table {
    min-width: 500px;
    font-size: 0.8rem;
  }
  .preview-content-box th, 
  .preview-content-box td {
    padding: 10px;
  }
}



.new-cat-inline {
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-top: 8px;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Premium Loading Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
  animation: fadeInModal 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-content {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.modal-content::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0; height: 6px;
  background: var(--grad-primary);
}

.modal-content.loading-modal {
  padding: 48px 40px;
  max-width: 440px;
}

/* Premium Loader */
.premium-loader {
  position: relative;
  width: 100px;
  height: 100px;
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loader-ring {
  position: absolute;
  inset: 0;
  border: 3px solid transparent;
  border-top-color: var(--purple);
  border-radius: 50%;
  animation: ring-spin 2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}

.loader-ring:nth-child(2) {
  inset: 10px;
  border-top-color: var(--cyan);
  animation-duration: 1.5s;
  animation-direction: reverse;
}

.loader-ring:nth-child(3) {
  inset: 20px;
  border-top-color: var(--violet);
  animation-duration: 1s;
}

.loader-icon {
  font-size: 2rem;
  animation: pulse-icon 2s ease-in-out infinite;
}

@keyframes ring-spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse-icon {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(139, 92, 246, 0.4)); }
  50% { transform: scale(1.1); filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.6)); }
}

.loading-text-wrap {
  margin-bottom: 32px;
}

.loading-title {
  background: var(--grad-primary);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-size: 1.6rem !important;
  font-weight: 900 !important;
  letter-spacing: -0.02em;
}

.loading-desc {
  font-size: 0.95rem !important;
  color: var(--text-muted) !important;
  margin: 0 !important;
}

.loading-status {
  width: 100%;
  margin-bottom: 32px;
}

.loading-bar {
  height: 6px;
  background: var(--bg-deep);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 12px;
}

.loading-bar-fill {
  height: 100%;
  width: 30%;
  background: var(--grad-primary);
  border-radius: 10px;
  animation: progress-move 2s infinite ease-in-out;
}

@keyframes progress-move {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}

.status-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--purple);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.btn-cancel-minimal {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 10px 24px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel-minimal:hover {
  background: #fff1f1;
  color: var(--red);
  border-color: #fecaca;
}


@keyframes fadeInModal {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* Result Preview Mobile Fixes */
@media (max-width: 768px) {
  .result-preview .card-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  
  .result-preview .card-header div {
    display: grid !important;
    grid-template-columns: 1fr;
    gap: 8px !important;
  }
  
  .preview-body {
    padding: 20px;
  }
  
  .preview-title {
    font-size: 1.5rem;
  }
  
  .preview-meta {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
  }
}

/* Schema Preview Responsive */
.schema-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

@media (max-width: 640px) {
  .schema-preview-box {
    padding: 12px !important;
  }
  
  .schema-grid {
    grid-template-columns: 1fr !important;
  }
}




</style>

