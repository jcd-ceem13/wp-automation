/**
 * RankMath REST API Integration
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all communication with the RankMath plugin REST endpoints.
 * Endpoints are internal to RankMath (not officially documented) but are
 * used by the Gutenberg editor sidebar.
 *
 * Key facts (from RankMath plugin source inspection):
 *  - updateMeta   : flat meta key/value pairs, NO underscore prefix
 *  - updateSchemas: schemas keyed by unique IDs like "schema-XXXXX", each
 *                   with a `metadata` block { type, title, shortcode }
 *  - updateRedirection: creates a redirect rule (source → destination)
 *  - getFeaturedImageId: NOT a real RankMath endpoint — use WP media API
 *  - getHead      : returns rendered <head> for a given URL/postID
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export interface RankMathSyncOptions {
  baseUrl:        string   // WordPress site base URL (no trailing slash)
  creds:          string   // Basic auth base64 string
  wpPostId:       number   // WP post ID
  postSlug:       string   // post slug
  postUrl:        string   // full post URL from WP response
  title:          string
  description:    string   // meta description / excerpt
  focusKeyword:   string
  schemas:        any[]    // array of schema objects with @type
  featuredMediaId?: number
  featuredUrl?:   string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map @type values to RankMath snippet type slugs */
const RM_SNIPPET_MAP: Record<string, string> = {
  'article':              'article',
  'newsarticle':          'news-article',
  'blogposting':          'article',
  'faqpage':              'faq',
  'howto':                'howto',
  'product':              'product',
  'review':               'review',
  'recipe':               'recipe',
  'videoobject':          'video',
  'event':                'event',
  'person':               'person',
  'organization':         'organization',
  'localbusiness':        'local-business',
  'course':               'course',
  'softwareapplication':  'software',
  'webpage':              'webpage',
  'website':              'website',
  'breadcrumblist':       'breadcrumb',
  'imageobject':          'image',
  'itemlist':             'item-list',
}

function getRmSnippetType(type?: string): string {
  if (!type) return 'article'
  return RM_SNIPPET_MAP[type.toLowerCase()] ?? type.toLowerCase()
}

/** Generate a RankMath-style schema unique key */
function makeSchemaId(): string {
  return 'schema-' + Math.random().toString(36).slice(2, 9).toUpperCase()
}

/** Delay helper */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** POST with retry + full error logging */
async function rmPost(
  label: string,
  url: string,
  creds: string,
  body: Record<string, unknown>
): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[RankMath][${label}] Attempt ${attempt} → ${url}`)
      console.log(`[RankMath][${label}] Payload:`, JSON.stringify(body, null, 2))

      const res = await fetch(url, {
        method:  'POST',
        headers: {
          Authorization:  `Basic ${creds}`,
          'Content-Type': 'application/json',
          Accept:         'application/json',
        },
        body: JSON.stringify(body),
      })

      const responseText = await res.text()
      console.log(`[RankMath][${label}] Response ${res.status}:`, responseText)

      if (res.ok) {
        console.log(`[RankMath][${label}] ✅ Success`)
        return true
      }

      // 404 = endpoint doesn't exist, no point retrying
      if (res.status === 404) {
        console.warn(`[RankMath][${label}] ❌ 404 — endpoint not found. Is RankMath active?`)
        return false
      }

      // 401/403 = auth problem, no point retrying
      if (res.status === 401 || res.status === 403) {
        console.warn(`[RankMath][${label}] ❌ Auth error ${res.status}. Check Application Password permissions.`)
        return false
      }

      console.warn(`[RankMath][${label}] HTTP ${res.status}, retrying in ${attempt * 2}s...`)
      await sleep(attempt * 2000)
    } catch (e) {
      console.error(`[RankMath][${label}] Exception:`, e)
      if (attempt < 3) await sleep(attempt * 2000)
    }
  }
  return false
}

// ─── 1. updateMeta ───────────────────────────────────────────────────────────
/**
 * Syncs SEO metadata via RankMath's updateMeta endpoint.
 *
 * RankMath expects:
 *   { objectType, objectID, meta: { rank_math_title, rank_math_description,
 *     rank_math_focus_keyword, rank_math_robots, rank_math_advanced_robots } }
 *
 * Important: Do NOT send underscore-prefixed keys (_rank_math_*) — those are
 * WP internal postmeta that RankMath manages internally. Sending both causes
 * duplication and the plugin may ignore external writes.
 */
export async function syncRankMathMeta(opts: RankMathSyncOptions): Promise<boolean> {
  const primarySnippet = getRmSnippetType(
    opts.schemas.find(s => s['@type'])?.['@type']
  )

  const meta: Record<string, unknown> = {
    rank_math_title:          opts.title,
    rank_math_description:    opts.description,
    rank_math_focus_keyword:  opts.focusKeyword || '',
    rank_math_robots:         ['index', 'follow'],
    rank_math_advanced_robots: {},
    rank_math_rich_snippet:   primarySnippet,
  }

  // ─── Ultimate Connectivity Fallback: Inject Schemas into Meta ──────────
  // RankMath saves schemas directly in post meta. By injecting them into updateMeta,
  // we guarantee they are saved even if the updateSchemas endpoint fails or is ignored.
  if (opts.schemas && opts.schemas.length > 0) {
    let isPrimary = true
    for (const schema of opts.schemas) {
      const type = schema['@type'] || 'Article'
      const rmType = getRmSnippetType(type)
      const schemaId = 'schema-' + Math.random().toString(36).slice(2, 9).toUpperCase()

      // Format schema exactly as RankMath Schema Generator stores it
      const { '@context': _ctx, ...schemaProps } = schema
      let schemaStr = JSON.stringify(schemaProps)
      schemaStr = schemaStr
        .replace(/\{\{title\}\}/g,      opts.title)
        .replace(/\{\{excerpt\}\}/g,    opts.description)
        .replace(/\{\{authorName\}\}/g, 'Admin')

      let parsedSchema: any;
      try { parsedSchema = JSON.parse(schemaStr) } 
      catch { parsedSchema = schemaProps }

      // Ensure the schema type is properly formatted (e.g. "Article" instead of "article")
      const formattedType = type.charAt(0).toUpperCase() + type.slice(1)

      const finalSchemaObj = {
        ...parsedSchema,
        metadata: {
          type: 'template',
          title: formattedType,
          shortcode: rmType,
          isPrimary: isPrimary
        }
      }

      // RankMath reads this meta key. We only inject once to avoid double schemas.
      meta[`rank_math_schema_${formattedType}`] = finalSchemaObj
      
      isPrimary = false
    }
  }

  // Featured image social meta
  if (opts.featuredUrl) {
    meta.rank_math_facebook_image     = opts.featuredUrl
    meta.rank_math_twitter_image      = opts.featuredUrl
    meta.rank_math_facebook_enable_image = 1
    meta.rank_math_twitter_enable_image  = 1
  }
  if (opts.featuredMediaId) {
    meta.rank_math_facebook_image_id  = opts.featuredMediaId
    meta.rank_math_twitter_image_id   = opts.featuredMediaId
    meta.rank_math_featured_image_id  = opts.featuredMediaId
  }

  return rmPost('updateMeta', `${opts.baseUrl}/wp-json/rankmath/v1/updateMeta`, opts.creds, {
    objectType: 'post',
    objectID:   opts.wpPostId,
    meta,
  })
}

// ─── 2. updateSchemas ────────────────────────────────────────────────────────
/**
 * Syncs structured data via RankMath's updateSchemas endpoint.
 *
 * RankMath expects schemas as an OBJECT keyed by unique IDs:
 * {
 *   "schema-ABC1234": {
 *     "@type": "Article",
 *     "metadata": { "type": "template", "title": "Article", "shortcode": "article", "isPrimary": true },
 *     ... other schema properties
 *   },
 *   "schema-DEF5678": { ... }
 * }
 *
 * The top-level request body:
 * { objectType, objectID, schemas: { ... keyed object } }
 */
export async function syncRankMathSchemas(opts: RankMathSyncOptions): Promise<boolean> {
  if (!opts.schemas || opts.schemas.length === 0) {
    console.log('[RankMath][updateSchemas] No schemas to sync, skipping.')
    return true
  }

  const schemasObj: Record<string, unknown> = {}
  let isPrimary = true

  for (const schema of opts.schemas) {
    const type      = schema['@type'] || 'Article'
    const rmType    = getRmSnippetType(type)
    const schemaId  = makeSchemaId()

    // Clone, remove @context (RankMath adds it), inject metadata
    const { '@context': _ctx, ...schemaProps } = schema

    // Inject dynamic values from post
    let schemaStr = JSON.stringify(schemaProps)
    schemaStr = schemaStr
      .replace(/\{\{title\}\}/g,      opts.title)
      .replace(/\{\{excerpt\}\}/g,    opts.description)
      .replace(/\{\{authorName\}\}/g, 'Admin')

    let finalProps: Record<string, unknown>
    try {
      finalProps = JSON.parse(schemaStr)
    } catch {
      finalProps = schemaProps
    }

    schemasObj[schemaId] = {
      ...finalProps,
      metadata: {
        type:       'template',
        title:      type,
        shortcode:  rmType,
        isPrimary:  isPrimary,
      },
    }

    isPrimary = false // Only first schema is primary
  }

  return rmPost('updateSchemas', `${opts.baseUrl}/wp-json/rankmath/v1/updateSchemas`, opts.creds, {
    objectType: 'post',
    objectID:   opts.wpPostId,
    schemas:    schemasObj,
  })
}

// ─── 3. updateRedirection ────────────────────────────────────────────────────
/**
 * Creates a redirect rule via RankMath Redirections module.
 *
 * This should only be called if you need to redirect an OLD slug to the NEW one.
 * For new posts, skip this unless there's a slug change.
 *
 * Payload: { sources: [{ pattern, comparison }], destination, type, status }
 */
export async function syncRankMathRedirection(
  opts: RankMathSyncOptions,
  oldSlug?: string
): Promise<boolean> {
  // Only create a redirect if there's an old slug different from the current one
  if (!oldSlug || oldSlug === opts.postSlug) {
    console.log('[RankMath][updateRedirection] No old slug provided — skipping redirection.')
    return true
  }

  const sourcePattern = `/${oldSlug}/`
  const destination   = opts.postUrl || `${opts.baseUrl}/${opts.postSlug}/`

  return rmPost('updateRedirection', `${opts.baseUrl}/wp-json/rankmath/v1/updateRedirection`, opts.creds, {
    sources: [
      { pattern: sourcePattern, comparison: 'exact' }
    ],
    destination,
    type:   301,
    status: 'active',
  })
}

// ─── 4. getFeaturedImageId (via standard WP API) ─────────────────────────────
/**
 * RankMath does NOT have a getFeaturedImageId endpoint.
 * The correct approach is to query the WP Media library by attachment URL.
 */
export async function getFeaturedImageId(
  baseUrl: string,
  creds:   string,
  imageUrl: string
): Promise<number | null> {
  // Skip blob/data URLs — they can't exist in WP media library
  if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
    console.log('[WP Media] Blob/data URL — skipping library search, will upload directly')
    return null
  }

  try {
    // Extract clean filename without query string for text search
    const rawFilename  = imageUrl.split('/').pop()?.split('?')[0] || ''
    const nameNoExt    = rawFilename.replace(/\.[^/.]+$/, '') // strip extension
    const searchTerm   = nameNoExt.replace(/[-_]/g, ' ')      // normalise separators

    // Strategy 1: search by filename slug
    if (searchTerm) {
      const searchUrl = `${baseUrl}/wp-json/wp/v2/media?search=${encodeURIComponent(searchTerm)}&media_type=image&per_page=20`
      console.log(`[WP Media] Searching by filename: "${searchTerm}"`)
      const res = await fetch(searchUrl, { headers: { Authorization: `Basic ${creds}` } })

      if (res.ok) {
        const items: any[] = await res.json()
        // Match by exact source_url first, then by slug/filename fragment
        const exact = items.find((m: any) =>
          m.source_url === imageUrl || m.guid?.rendered === imageUrl
        )
        if (exact?.id) {
          console.log(`[WP Media] ✅ Exact URL match — ID: ${exact.id}`)
          return exact.id
        }
        // Fallback: match by filename fragment
        const partial = items.find((m: any) =>
          m.source_url?.includes(rawFilename) || m.slug?.includes(nameNoExt.toLowerCase())
        )
        if (partial?.id) {
          console.log(`[WP Media] ✅ Filename match — ID: ${partial.id} (${partial.source_url})`)
          return partial.id
        }
      }
    }

    // Strategy 2: query by recent uploads (last 50) and match source_url exactly
    console.log('[WP Media] Trying recent uploads list...')
    const recentRes = await fetch(
      `${baseUrl}/wp-json/wp/v2/media?media_type=image&per_page=50&orderby=date&order=desc`,
      { headers: { Authorization: `Basic ${creds}` } }
    )
    if (recentRes.ok) {
      const recents: any[] = await recentRes.json()
      const found = recents.find((m: any) =>
        m.source_url === imageUrl ||
        m.guid?.rendered === imageUrl ||
        m.source_url?.endsWith(rawFilename)
      )
      if (found?.id) {
        console.log(`[WP Media] ✅ Found in recent uploads — ID: ${found.id}`)
        return found.id
      }
    }

    console.log('[WP Media] Image not found in library — will upload instead')
    return null
  } catch (e) {
    console.error('[WP Media] getFeaturedImageId error:', e)
    return null
  }
}

// ─── 5. getHead (cache warm / verify) ────────────────────────────────────────
/**
 * Calls getHead to warm RankMath's schema/meta cache for this post.
 * Not strictly required but ensures RankMath processes the new data.
 */
export async function warmRankMathHead(
  baseUrl: string,
  creds:   string,
  wpPostId: number
): Promise<void> {
  try {
    const url = `${baseUrl}/wp-json/rankmath/v1/getHead?objectID=${wpPostId}&objectType=post&_=${Date.now()}`
    console.log(`[RankMath][getHead] Warming cache for post ${wpPostId}`)
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${creds}`, Accept: 'application/json' }
    })
    const text = await res.text()
    console.log(`[RankMath][getHead] Response ${res.status}:`, text.substring(0, 200))
  } catch (e) {
    console.warn('[RankMath][getHead] Failed (non-critical):', e)
  }
}

// ─── Master sync function ─────────────────────────────────────────────────────
/**
 * Run the complete RankMath sync sequence for a published post.
 * Call this after the WP post has been created/updated and you have the wpPostId.
 */
export async function syncAllRankMath(opts: RankMathSyncOptions): Promise<{
  meta: boolean;
  schemas: boolean;
}> {
  console.log(`[RankMath] ══════════ Starting full sync for Post ID ${opts.wpPostId} ══════════`)

  // Give WP a moment to commit the post to DB
  await sleep(2000)

  const metaOk    = await syncRankMathMeta(opts)
  const schemasOk = await syncRankMathSchemas(opts)

  // Warm the head cache last
  await warmRankMathHead(opts.baseUrl, opts.creds, opts.wpPostId)

  console.log(`[RankMath] ══════════ Sync complete — meta:${metaOk} schemas:${schemasOk} ══════════`)

  return { meta: metaOk, schemas: schemasOk }
}
