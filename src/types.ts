// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIProvider {
  id: string
  name: string
  icon: string
  color: string
  models: string[]
  defaultModel: string
  apiKeyName: string
  baseUrl: string
}

export interface WordPressSite {
  id: string
  name: string
  url: string
  username: string
  appPassword: string
  connected: boolean
  lastChecked?: string
  logoUrl?: string
  schemaTemplate?: string
  globalSchemas?: Record<string, string>
}

export interface PostQueue {
  id: string
  title: string
  content: string
  excerpt: string
  tags: string[]
  categories: string[]
  siteId: string
  aiProvider: string
  aiModel: string
  status: 'draft' | 'scheduled' | 'published' | 'failed'
  scheduledAt?: string
  publishedAt?: string
  error?: string
  createdAt: string
  wordCount: number
  featuredImageUrl?: string
  featuredImageAlt?: string
  geoScore?: number
  wpStatus?: 'publish' | 'draft' | 'pending' | 'future'
  wpPostId?: number
  slug?: string
  focusKeyword?: string
  authorName?: string
  authorId?: number
  affiliateLink?: string
  selectedSchemas?: string[]
}

export interface GenerateOptions {
  topic: string
  tone: string
  language: string
  wordCount: number
  keywords: string[]
  includeOutline: boolean
  includeExcerpt: boolean
  includeTags: boolean
  includeStats: boolean
  includeFaq: boolean
  includeQuotes: boolean
  customPrompt: string
  providerId: string
  model: string
  authorName: string
  authorId?: number
  targetAudience: string
  affiliateLink: string
}

export interface AppSettings {
  defaultProvider: string
  defaultSiteId: string
  defaultLanguage: string
  defaultTone: string
  defaultWordCount: number
  autoSchedule: boolean
  scheduleInterval: number
  unsplashApiKey: string
  pexelsApiKey: string
  defaultImageProvider: string
  defaultAuthorId?: number
  defaultAuthorName: string
  defaultAudience: string
  defaultIncludeOutline: boolean
  defaultIncludeStats: boolean
  defaultIncludeFaq: boolean
  defaultIncludeQuotes: boolean
  defaultIncludeTags: boolean
  defaultIncludeSchema?: boolean
  defaultSelectedSchemas?: string[]
  darkMode: boolean
  customProviders: AIProvider[]
}

// ─── AI Provider Definitions ──────────────────────────────────────────────────

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'openai',
    name: 'ChatGPT',
    icon: '🤖',
    color: '#10a37f',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    apiKeyName: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1'
  },
  {
    id: 'anthropic',
    name: 'Claude',
    icon: '🔮',
    color: '#c96442',
    models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'],
    defaultModel: 'claude-haiku-3-5',
    apiKeyName: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1'
  },
  {
    id: 'google',
    name: 'Gemini',
    icon: '✨',
    color: '#4285f4',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    defaultModel: 'gemini-2.0-flash',
    apiKeyName: 'GOOGLE_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    icon: '🔍',
    color: '#20808d',
    models: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online', 'llama-3.1-sonar-huge-128k-online'],
    defaultModel: 'llama-3.1-sonar-small-128k-online',
    apiKeyName: 'PERPLEXITY_API_KEY',
    baseUrl: 'https://api.perplexity.ai'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🌊',
    color: '#536af5',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    apiKeyName: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1'
  }
]

export const TONES = [
  'Professional', 'Conversational', 'Educational', 'Authoritative',
  'Inspirational', 'Technical', 'Casual', 'Persuasive', 'Empathetic', 'Analytical'
]

export const LANGUAGES = [
  { code: 'en',    name: 'English' },
  { code: 'id',    name: 'Indonesian (Bahasa)' },
  { code: 'es',    name: 'Spanish' },
  { code: 'fr',    name: 'French' },
  { code: 'de',    name: 'German' },
  { code: 'pt',    name: 'Portuguese' },
  { code: 'it',    name: 'Italian' },
  { code: 'ja',    name: 'Japanese' },
  { code: 'ko',    name: 'Korean' },
  { code: 'zh',    name: 'Chinese (Simplified)' },
  { code: 'ar',    name: 'Arabic' },
  { code: 'hi',    name: 'Hindi' },
  { code: 'ru',    name: 'Russian' },
  { code: 'nl',    name: 'Dutch' },
  { code: 'tr',    name: 'Turkish' },
]

export const TARGET_AUDIENCES = [
  'General Audience', 'Beginners', 'Intermediate Users', 'Experts / Professionals',
  'Business Owners', 'Students', 'Developers', 'Marketers', 'Healthcare Professionals',
  'Parents', 'Entrepreneurs', 'Researchers'
]
