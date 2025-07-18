import { eventBus, SendTarget } from '@/eventbus'
import {
  IConfigPresenter,
  LLM_PROVIDER,
  MODEL_META,
  ModelConfig,
  RENDERER_MODEL_META,
  MCPServerConfig,
  Prompt
} from '@shared/presenter'
import { SearchEngineTemplate } from '@shared/chat'
import ElectronStore from 'electron-store'
import { DEFAULT_PROVIDERS } from './providers'
import path from 'path'
import { app, nativeTheme, shell } from 'electron'
import fs from 'fs'
import { CONFIG_EVENTS, SYSTEM_EVENTS } from '@/events'
import { McpConfHelper, SYSTEM_INMEM_MCP_SERVERS } from './mcpConfHelper'
import { presenter } from '@/presenter'
import { compare } from 'compare-versions'
import { defaultShortcutKey, ShortcutKeySetting } from './shortcutKeySettings'
import { defaultModelsSettings } from './modelDefaultSettings'
import { getProviderSpecificModelConfig } from './providerModelSettings'

// 定义应用设置的接口
interface IAppSettings {
  // 在这里定义你的配置项，例如：
  language: string
  providers: LLM_PROVIDER[]
  closeToQuit: boolean // 是否点击关闭按钮时退出程序
  appVersion?: string // 用于版本检查和数据迁移
  proxyMode?: string // 代理模式：system, none, custom
  customProxyUrl?: string // 自定义代理地址
  customShortKey?: ShortcutKeySetting // 自定义快捷键
  artifactsEffectEnabled?: boolean // artifacts动画效果是否启用
  searchPreviewEnabled?: boolean // 搜索预览是否启用
  contentProtectionEnabled?: boolean // 投屏保护是否启用
  syncEnabled?: boolean // 是否启用同步功能
  syncFolderPath?: string // 同步文件夹路径
  lastSyncTime?: number // 上次同步时间
  customSearchEngines?: string // 自定义搜索引擎JSON字符串
  soundEnabled?: boolean // 音效是否启用
  copyWithCotEnabled?: boolean
  loggingEnabled?: boolean // 日志记录是否启用
  default_system_prompt?: string // 默认系统提示词
  [key: string]: unknown // 允许任意键，使用unknown类型替代any
}

// 为模型存储创建接口
interface IModelStore {
  models: MODEL_META[]
  custom_models: MODEL_META[]
}

const defaultProviders = DEFAULT_PROVIDERS.map((provider) => ({
  id: provider.id,
  name: provider.name,
  apiType: provider.apiType,
  apiKey: provider.apiKey,
  baseUrl: provider.baseUrl,
  enable: provider.enable,
  websites: provider.websites
}))

// 定义 storeKey 常量
const PROVIDERS_STORE_KEY = 'providers'

const PROVIDER_MODELS_DIR = 'provider_models'
// 模型状态键前缀
const MODEL_STATUS_KEY_PREFIX = 'model_status_'

export class ConfigPresenter implements IConfigPresenter {
  private store: ElectronStore<IAppSettings>
  private providersModelStores: Map<string, ElectronStore<IModelStore>> = new Map()
  private customPromptsStore: ElectronStore<{ prompts: Prompt[] }>
  private userDataPath: string
  private currentAppVersion: string
  private mcpConfHelper: McpConfHelper // 使用MCP配置助手

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.currentAppVersion = app.getVersion()
    // 初始化应用设置存储
    this.store = new ElectronStore<IAppSettings>({
      name: 'app-settings',
      defaults: {
        language: 'en-US',
        providers: defaultProviders,
        closeToQuit: false,
        customShortKey: defaultShortcutKey,
        proxyMode: 'system',
        customProxyUrl: '',
        artifactsEffectEnabled: true,
        searchPreviewEnabled: true,
        contentProtectionEnabled: false,
        syncEnabled: false,
        syncFolderPath: path.join(this.userDataPath, 'sync'),
        lastSyncTime: 0,
        soundEnabled: false,
        copyWithCotEnabled: true,
        loggingEnabled: false,
        default_system_prompt: '',
        appVersion: this.currentAppVersion
      }
    })

    this.initTheme()

    // 初始化 custom prompts 存储
    this.customPromptsStore = new ElectronStore<{ prompts: Prompt[] }>({
      name: 'custom_prompts',
      defaults: {
        prompts: []
      }
    })

    // 初始化MCP配置助手
    this.mcpConfHelper = new McpConfHelper()

    // 初始化provider models目录
    this.initProviderModelsDir()

    // 如果应用版本更新了，更新appVersion
    if (this.store.get('appVersion') !== this.currentAppVersion) {
      const oldVersion = this.store.get('appVersion')
      this.store.set('appVersion', this.currentAppVersion)
      // 迁移数据
      this.migrateModelData(oldVersion)
      this.mcpConfHelper.onUpgrade(oldVersion)
    }

    const existingProviders = this.getSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY) || []
    const newProviders = defaultProviders.filter(
      (defaultProvider) =>
        !existingProviders.some((existingProvider) => existingProvider.id === defaultProvider.id)
    )

    if (newProviders.length > 0) {
      this.setProviders([...existingProviders, ...newProviders])
    }
  }

  private initProviderModelsDir(): void {
    const modelsDir = path.join(this.userDataPath, PROVIDER_MODELS_DIR)
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true })
    }
  }

  private getProviderModelStore(providerId: string): ElectronStore<IModelStore> {
    if (!this.providersModelStores.has(providerId)) {
      const store = new ElectronStore<IModelStore>({
        name: `models_${providerId}`,
        cwd: path.join(this.userDataPath, PROVIDER_MODELS_DIR),
        defaults: {
          models: [],
          custom_models: []
        }
      })
      this.providersModelStores.set(providerId, store)
    }
    return this.providersModelStores.get(providerId)!
  }

  private migrateModelData(oldVersion: string | undefined): void {
    // 0.0.10 版本之前，模型数据存储在app-settings.json中
    if (oldVersion && compare(oldVersion, '0.0.10', '<')) {
      // 迁移旧的模型数据
      const providers = this.getProviders()

      for (const provider of providers) {
        // 检查并修正 ollama 的 baseUrl
        if (provider.id === 'ollama' && provider.baseUrl) {
          if (provider.baseUrl.endsWith('/v1')) {
            provider.baseUrl = provider.baseUrl.replace(/\/v1$/, '')
            // 保存修改后的提供者
            this.setProviderById('ollama', provider)
          }
        }

        // 迁移provider模型
        const oldProviderModelsKey = `${provider.id}_models`
        const oldModels =
          this.getSetting<(MODEL_META & { enabled: boolean })[]>(oldProviderModelsKey)

        if (oldModels && oldModels.length > 0) {
          const store = this.getProviderModelStore(provider.id)
          // 遍历旧模型，保存启用状态
          oldModels.forEach((model) => {
            if (model.enabled) {
              this.setModelStatus(provider.id, model.id, true)
            }
            // @ts-ignore - 需要删除enabled属性以便独立存储状态
            delete model.enabled
          })
          // 保存模型列表到新存储
          store.set('models', oldModels)
          // 清除旧存储
          this.store.delete(oldProviderModelsKey)
        }

        // 迁移custom模型
        const oldCustomModelsKey = `custom_models_${provider.id}`
        const oldCustomModels =
          this.getSetting<(MODEL_META & { enabled: boolean })[]>(oldCustomModelsKey)

        if (oldCustomModels && oldCustomModels.length > 0) {
          const store = this.getProviderModelStore(provider.id)
          // 遍历旧的自定义模型，保存启用状态
          oldCustomModels.forEach((model) => {
            if (model.enabled) {
              this.setModelStatus(provider.id, model.id, true)
            }
            // @ts-ignore - 需要删除enabled属性以便独立存储状态
            delete model.enabled
          })
          // 保存自定义模型列表到新存储
          store.set('custom_models', oldCustomModels)
          // 清除旧存储
          this.store.delete(oldCustomModelsKey)
        }
      }
    }

    // 0.0.17 版本之前，需要移除 qwenlm 提供商
    if (oldVersion && compare(oldVersion, '0.0.17', '<')) {
      // 获取当前所有提供商
      const providers = this.getProviders()

      // 过滤掉 qwenlm 提供商
      const filteredProviders = providers.filter((provider) => provider.id !== 'qwenlm')

      // 如果过滤后数量不同，说明有移除操作，需要保存更新后的提供商列表
      if (filteredProviders.length !== providers.length) {
        this.setProviders(filteredProviders)
      }
    }
  }

  getSetting<T>(key: string): T | undefined {
    try {
      return this.store.get(key) as T
    } catch (error) {
      console.error(`[Config] Failed to get setting ${key}:`, error)
      return undefined
    }
  }

  setSetting<T>(key: string, value: T): void {
    try {
      this.store.set(key, value)
      // 触发设置变更事件（仅主进程内部使用）
      eventBus.sendToMain(CONFIG_EVENTS.SETTING_CHANGED, key, value)
    } catch (error) {
      console.error(`[Config] Failed to set setting ${key}:`, error)
    }
  }

  getProviders(): LLM_PROVIDER[] {
    const providers = this.getSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY)
    if (Array.isArray(providers) && providers.length > 0) {
      return providers
    } else {
      this.setSetting(PROVIDERS_STORE_KEY, defaultProviders)
      return defaultProviders
    }
  }

  setProviders(providers: LLM_PROVIDER[]): void {
    this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, providers)
    // 触发新事件（需要通知所有标签页）
    eventBus.send(CONFIG_EVENTS.PROVIDER_CHANGED, SendTarget.ALL_WINDOWS)
  }

  getProviderById(id: string): LLM_PROVIDER | undefined {
    const providers = this.getProviders()
    return providers.find((provider) => provider.id === id)
  }

  setProviderById(id: string, provider: LLM_PROVIDER): void {
    const providers = this.getProviders()
    const index = providers.findIndex((p) => p.id === id)
    if (index !== -1) {
      providers[index] = provider
      this.setProviders(providers)
    } else {
      console.error(`[Config] Provider ${id} not found`)
    }
  }

  // 构造模型状态的存储键
  private getModelStatusKey(providerId: string, modelId: string): string {
    // 将 modelId 中的点号替换为连字符
    const formattedModelId = modelId.replace(/\./g, '-')
    return `${MODEL_STATUS_KEY_PREFIX}${providerId}_${formattedModelId}`
  }

  // 获取模型启用状态
  getModelStatus(providerId: string, modelId: string): boolean {
    const statusKey = this.getModelStatusKey(providerId, modelId)
    const status = this.getSetting<boolean>(statusKey)
    // 如果状态不是布尔值，则返回 true
    return typeof status === 'boolean' ? status : true
  }

  // 设置模型启用状态
  setModelStatus(providerId: string, modelId: string, enabled: boolean): void {
    const statusKey = this.getModelStatusKey(providerId, modelId)
    this.setSetting(statusKey, enabled)
    // 触发模型状态变更事件（需要通知所有标签页）
    eventBus.sendToRenderer(CONFIG_EVENTS.MODEL_STATUS_CHANGED, SendTarget.ALL_WINDOWS, providerId, modelId, enabled)
  }

  // 启用模型
  enableModel(providerId: string, modelId: string): void {
    this.setModelStatus(providerId, modelId, true)
  }

  // 禁用模型
  disableModel(providerId: string, modelId: string): void {
    this.setModelStatus(providerId, modelId, false)
  }

  // 批量设置模型状态
  batchSetModelStatus(providerId: string, modelStatusMap: Record<string, boolean>): void {
    for (const [modelId, enabled] of Object.entries(modelStatusMap)) {
      this.setModelStatus(providerId, modelId, enabled)
    }
  }

  getProviderModels(providerId: string): MODEL_META[] {
    const store = this.getProviderModelStore(providerId)
    let models = store.get('models') || []

    models = models.map((model) => {
      const config = this.getModelConfig(model.id, providerId)
      if (config) {
        model.maxTokens = config.maxTokens
        model.contextLength = config.contextLength
        // 如果模型中已经有这些属性则保留，否则使用配置中的值或默认为false
        model.vision = model.vision !== undefined ? model.vision : config.vision || false
        model.functionCall =
          model.functionCall !== undefined ? model.functionCall : config.functionCall || false
        model.reasoning =
          model.reasoning !== undefined ? model.reasoning : config.reasoning || false
      } else {
        // 确保模型具有这些属性，如果没有配置，默认为false
        model.vision = model.vision || false
        model.functionCall = model.functionCall || false
        model.reasoning = model.reasoning || false
      }
      return model
    })
    return models
  }

  getModelDefaultConfig(modelId: string, providerId?: string): ModelConfig {
    const model = this.getModelConfig(modelId, providerId)
    if (model) {
      return model
    }
    return {
      maxTokens: 4096,
      contextLength: 4096,
      temperature: 0.7,
      vision: false,
      functionCall: false,
      reasoning: false
    }
  }

  setProviderModels(providerId: string, models: MODEL_META[]): void {
    const store = this.getProviderModelStore(providerId)
    store.set('models', models)
  }

  getEnabledProviders(): LLM_PROVIDER[] {
    const providers = this.getProviders()
    return providers.filter((provider) => provider.enable)
  }

  getAllEnabledModels(): Promise<{ providerId: string; models: RENDERER_MODEL_META[] }[]> {
    const enabledProviders = this.getEnabledProviders()
    return Promise.all(
      enabledProviders.map(async (provider) => {
        const providerId = provider.id
        const allModels = [
          ...this.getProviderModels(providerId),
          ...this.getCustomModels(providerId)
        ]

        // 根据单独存储的状态过滤启用的模型
        const enabledModels = allModels
          .filter((model) => this.getModelStatus(providerId, model.id))
          .map((model) => ({
            ...model,
            enabled: true,
            // 确保能力属性被复制
            vision: model.vision || false,
            functionCall: model.functionCall || false,
            reasoning: model.reasoning || false
          }))

        return {
          providerId,
          models: enabledModels
        }
      })
    )
  }

  getCustomModels(providerId: string): MODEL_META[] {
    const store = this.getProviderModelStore(providerId)
    let customModels = store.get('custom_models') || []

    // 确保自定义模型也有能力属性
    customModels = customModels.map((model) => {
      // 如果模型已经有这些属性，保留它们，否则默认为false
      model.vision = model.vision !== undefined ? model.vision : false
      model.functionCall = model.functionCall !== undefined ? model.functionCall : false
      model.reasoning = model.reasoning !== undefined ? model.reasoning : false
      return model
    })

    return customModels
  }

  setCustomModels(providerId: string, models: MODEL_META[]): void {
    const store = this.getProviderModelStore(providerId)
    store.set('custom_models', models)
  }

  addCustomModel(providerId: string, model: MODEL_META): void {
    const models = this.getCustomModels(providerId)
    const existingIndex = models.findIndex((m) => m.id === model.id)

    // 创建不包含enabled属性的模型副本
    const modelWithoutStatus: MODEL_META = { ...model }
    // @ts-ignore - 需要删除enabled属性以便独立存储状态
    delete modelWithoutStatus.enabled

    if (existingIndex !== -1) {
      models[existingIndex] = modelWithoutStatus as MODEL_META
    } else {
      models.push(modelWithoutStatus as MODEL_META)
    }

    this.setCustomModels(providerId, models)
    // 单独设置模型状态
    this.setModelStatus(providerId, model.id, true)
    // 触发模型列表变更事件（需要通知所有标签页）
    eventBus.sendToRenderer(CONFIG_EVENTS.MODEL_LIST_CHANGED, SendTarget.ALL_WINDOWS, providerId)
  }

  removeCustomModel(providerId: string, modelId: string): void {
    const models = this.getCustomModels(providerId)
    const filteredModels = models.filter((model) => model.id !== modelId)
    this.setCustomModels(providerId, filteredModels)

    // 删除模型状态
    const statusKey = this.getModelStatusKey(providerId, modelId)
    this.store.delete(statusKey)

    // 触发模型列表变更事件（需要通知所有标签页）
    eventBus.sendToRenderer(CONFIG_EVENTS.MODEL_LIST_CHANGED, SendTarget.ALL_WINDOWS, providerId)
  }

  updateCustomModel(providerId: string, modelId: string, updates: Partial<MODEL_META>): void {
    const models = this.getCustomModels(providerId)
    const index = models.findIndex((model) => model.id === modelId)

    if (index !== -1) {
      Object.assign(models[index], updates)
      this.setCustomModels(providerId, models)
      eventBus.sendToRenderer(CONFIG_EVENTS.MODEL_LIST_CHANGED, SendTarget.ALL_WINDOWS, providerId)
    }
  }

  getCloseToQuit(): boolean {
    return this.getSetting<boolean>('closeToQuit') ?? false
  }

  setCloseToQuit(value: boolean): void {
    this.setSetting('closeToQuit', value)
  }

  // 获取应用当前语言，考虑系统语言设置
  getLanguage(): string {
    const language = this.getSetting<string>('language') || 'system'

    if (language !== 'system') {
      return language
    }

    return this.getSystemLanguage()
  }

  // 设置应用语言
  setLanguage(language: string): void {
    this.setSetting('language', language)
    // 触发语言变更事件（需要通知所有标签页）
    eventBus.sendToRenderer(CONFIG_EVENTS.LANGUAGE_CHANGED, SendTarget.ALL_WINDOWS, language)
  }

  // 获取系统语言并匹配支持的语言列表
  private getSystemLanguage(): string {
    const systemLang = app.getLocale()
    const supportedLanguages = [
      'zh-CN',
      'zh-TW',
      'en-US',
      'zh-HK',
      'ko-KR',
      'ru-RU',
      'ja-JP',
      'fr-FR'
    ]

    // 完全匹配
    if (supportedLanguages.includes(systemLang)) {
      return systemLang
    }

    // 部分匹配（只匹配语言代码）
    const langCode = systemLang.split('-')[0]
    const matchedLang = supportedLanguages.find((lang) => lang.startsWith(langCode))
    if (matchedLang) {
      return matchedLang
    }

    // 默认返回英文
    return 'en-US'
  }

  public getDefaultProviders(): LLM_PROVIDER[] {
    return DEFAULT_PROVIDERS
  }

  // 获取代理模式
  getProxyMode(): string {
    return this.getSetting<string>('proxyMode') || 'system'
  }

  // 设置代理模式
  setProxyMode(mode: string): void {
    this.setSetting('proxyMode', mode)
    eventBus.sendToMain(CONFIG_EVENTS.PROXY_MODE_CHANGED, mode)
  }

  // 获取自定义代理地址
  getCustomProxyUrl(): string {
    return this.getSetting<string>('customProxyUrl') || ''
  }

  // 设置自定义代理地址
  setCustomProxyUrl(url: string): void {
    this.setSetting('customProxyUrl', url)
    eventBus.sendToMain(CONFIG_EVENTS.CUSTOM_PROXY_URL_CHANGED, url)
  }

  // 获取同步功能状态
  getSyncEnabled(): boolean {
    return this.getSetting<boolean>('syncEnabled') || false
  }

  // 获取日志文件夹路径
  getLoggingFolderPath(): string {
    return path.join(this.userDataPath, 'logs')
  }

  // 打开日志文件夹
  async openLoggingFolder(): Promise<void> {
    const loggingFolderPath = this.getLoggingFolderPath()

    // 如果文件夹不存在，先创建它
    if (!fs.existsSync(loggingFolderPath)) {
      fs.mkdirSync(loggingFolderPath, { recursive: true })
    }

    // 打开文件夹
    await shell.openPath(loggingFolderPath)
  }

  // 设置同步功能状态
  setSyncEnabled(enabled: boolean): void {
    console.log('setSyncEnabled', enabled)
    this.setSetting('syncEnabled', enabled)
    eventBus.send(CONFIG_EVENTS.SYNC_SETTINGS_CHANGED, SendTarget.ALL_WINDOWS, { enabled })
  }

  // 获取同步文件夹路径
  getSyncFolderPath(): string {
    return (
      this.getSetting<string>('syncFolderPath') || path.join(app.getPath('home'), 'DeepchatSync')
    )
  }

  // 设置同步文件夹路径
  setSyncFolderPath(folderPath: string): void {
    this.setSetting('syncFolderPath', folderPath)
    eventBus.send(CONFIG_EVENTS.SYNC_SETTINGS_CHANGED, SendTarget.ALL_WINDOWS, { folderPath })
  }

  // 获取上次同步时间
  getLastSyncTime(): number {
    return this.getSetting<number>('lastSyncTime') || 0
  }

  // 设置上次同步时间
  setLastSyncTime(time: number): void {
    this.setSetting('lastSyncTime', time)
  }

  // 获取自定义搜索引擎
  async getCustomSearchEngines(): Promise<SearchEngineTemplate[]> {
    try {
      const customEnginesJson = this.store.get('customSearchEngines')
      if (customEnginesJson) {
        return JSON.parse(customEnginesJson as string)
      }
      return []
    } catch (error) {
      console.error('获取自定义搜索引擎失败:', error)
      return []
    }
  }

  // 设置自定义搜索引擎
  async setCustomSearchEngines(engines: SearchEngineTemplate[]): Promise<void> {
    try {
      this.store.set('customSearchEngines', JSON.stringify(engines))
      // 发送事件通知搜索引擎更新（需要通知所有标签页）
      eventBus.send(CONFIG_EVENTS.SEARCH_ENGINES_UPDATED, SendTarget.ALL_WINDOWS, engines)
    } catch (error) {
      console.error('设置自定义搜索引擎失败:', error)
      throw error
    }
  }

  // 获取搜索预览设置状态
  getSearchPreviewEnabled(): Promise<boolean> {
    const value = this.getSetting<boolean>('searchPreviewEnabled')
    // 默认关闭搜索预览
    return Promise.resolve(value === undefined || value === null ? false : value)
  }

  // 设置搜索预览状态
  setSearchPreviewEnabled(enabled: boolean): void {
    console.log('ConfigPresenter.setSearchPreviewEnabled:', enabled, typeof enabled)

    // 确保传入的是布尔值
    const boolValue = Boolean(enabled)

    this.setSetting('searchPreviewEnabled', boolValue)
  }

  // 获取投屏保护设置状态
  getContentProtectionEnabled(): boolean {
    const value = this.getSetting<boolean>('contentProtectionEnabled')
    // 默认投屏保护关闭
    return value === undefined || value === null ? false : value
  }

  // 设置投屏保护状态
  setContentProtectionEnabled(enabled: boolean): void {
    this.setSetting('contentProtectionEnabled', enabled)
    eventBus.send(CONFIG_EVENTS.CONTENT_PROTECTION_CHANGED, SendTarget.ALL_WINDOWS, enabled)
  }

  getLoggingEnabled(): boolean {
    return this.getSetting<boolean>('loggingEnabled') ?? false
  }

  setLoggingEnabled(enabled: boolean): void {
    this.setSetting('loggingEnabled', enabled)
    setTimeout(() => {
      presenter.devicePresenter.restartApp()
    }, 1000)
  }

  // 获取音效开关状态
  getSoundEnabled(): boolean {
    const value = this.getSetting<boolean>('soundEnabled') ?? false
    return value === undefined || value === null ? false : value
  }

  // 设置音效开关状态
  setSoundEnabled(enabled: boolean): void {
    this.setSetting('soundEnabled', enabled)
    eventBus.sendToRenderer(CONFIG_EVENTS.SOUND_ENABLED_CHANGED, SendTarget.ALL_WINDOWS, enabled)
  }

  getCopyWithCotEnabled(): boolean {
    const value = this.getSetting<boolean>('copyWithCotEnabled') ?? true
    return value === undefined || value === null ? false : value
  }

  setCopyWithCotEnabled(enabled: boolean): void {
    this.setSetting('copyWithCotEnabled', enabled)
    eventBus.sendToRenderer(CONFIG_EVENTS.COPY_WITH_COT_CHANGED, SendTarget.ALL_WINDOWS, enabled)
  }

  // ===================== MCP配置相关方法 =====================

  // 获取MCP服务器配置
  async getMcpServers(): Promise<Record<string, MCPServerConfig>> {
    const servers = await this.mcpConfHelper.getMcpServers()

    // 检查是否有自定义提示词，如果有则添加 custom-prompts-server
    try {
      const customPrompts = await this.getCustomPrompts()
      if (customPrompts && customPrompts.length > 0) {
        const customPromptsServerName = 'mcpchat-inmemory/custom-prompts-server'
        const systemServers = SYSTEM_INMEM_MCP_SERVERS[customPromptsServerName]

        if (systemServers && !servers[customPromptsServerName]) {
          servers[customPromptsServerName] = systemServers
          servers[customPromptsServerName].disable = false
          servers[customPromptsServerName].autoApprove = ['all']
        }
      }
    } catch {
      // 检查自定义提示词时出错
    }

    return servers
  }

  // 设置MCP服务器配置
  async setMcpServers(servers: Record<string, MCPServerConfig>): Promise<void> {
    return this.mcpConfHelper.setMcpServers(servers)
  }

  // 获取默认MCP服务器
  getMcpDefaultServers(): Promise<string[]> {
    return this.mcpConfHelper.getMcpDefaultServers()
  }

  // 设置默认MCP服务器
  async addMcpDefaultServer(serverName: string): Promise<void> {
    return this.mcpConfHelper.addMcpDefaultServer(serverName)
  }

  async removeMcpDefaultServer(serverName: string): Promise<void> {
    return this.mcpConfHelper.removeMcpDefaultServer(serverName)
  }

  async toggleMcpDefaultServer(serverName: string): Promise<void> {
    return this.mcpConfHelper.toggleMcpDefaultServer(serverName)
  }

  // 获取MCP启用状态
  getMcpEnabled(): Promise<boolean> {
    return this.mcpConfHelper.getMcpEnabled()
  }

  // 设置MCP启用状态
  async setMcpEnabled(enabled: boolean): Promise<void> {
    return this.mcpConfHelper.setMcpEnabled(enabled)
  }

  // 添加MCP服务器
  async addMcpServer(name: string, config: MCPServerConfig): Promise<boolean> {
    return this.mcpConfHelper.addMcpServer(name, config)
  }

  // 移除MCP服务器
  async removeMcpServer(name: string): Promise<void> {
    return this.mcpConfHelper.removeMcpServer(name)
  }

  // 更新MCP服务器配置
  async updateMcpServer(name: string, config: Partial<MCPServerConfig>): Promise<void> {
    await this.mcpConfHelper.updateMcpServer(name, config)
  }

  // 提供getMcpConfHelper方法，用于获取MCP配置助手
  getMcpConfHelper(): McpConfHelper {
    return this.mcpConfHelper
  }

  /**
   * 获取指定provider和model的推荐配置
   * @param modelId 模型ID
   * @param providerId 可选的提供商ID，如果提供则优先查找该提供商的特定配置
   * @returns ModelConfig 模型配置
   */
  getModelConfig(modelId: string, providerId?: string): ModelConfig {
    // 如果提供了providerId，先尝试查找特定提供商的配置
    if (providerId) {
      const providerConfig = getProviderSpecificModelConfig(providerId, modelId)
      if (providerConfig) {
        // console.log('providerConfig Matched', providerId, modelId)
        return providerConfig
      }
    }

    // 如果没有找到特定提供商的配置，或者没有提供providerId，则查找通用配置
    // 将modelId转为小写以进行不区分大小写的匹配
    const lowerModelId = modelId.toLowerCase()

    // 检查是否有任何匹配条件符合
    for (const config of defaultModelsSettings) {
      if (config.match.some((matchStr) => lowerModelId.includes(matchStr.toLowerCase()))) {
        return {
          maxTokens: config.maxTokens,
          contextLength: config.contextLength,
          temperature: config.temperature,
          vision: config.vision,
          functionCall: config.functionCall || false,
          reasoning: config.reasoning || false
        }
      }
    }

    // 如果没有找到匹配的配置，返回默认的安全配置
    return {
      maxTokens: 4096,
      contextLength: 8192,
      temperature: 0.6,
      vision: false,
      functionCall: false,
      reasoning: false
    }
  }

  getNotificationsEnabled(): boolean {
    const value = this.getSetting<boolean>('notificationsEnabled')
    if (value === undefined) {
      return true
    } else {
      return value
    }
  }

  setNotificationsEnabled(enabled: boolean): void {
    this.setSetting('notificationsEnabled', enabled)
  }

  async initTheme() {
    const theme = this.getSetting<string>('appTheme')
    if (theme) {
      nativeTheme.themeSource = theme as 'dark' | 'light'
    }
    // 监听系统主题变化
    nativeTheme.on('updated', () => {
      // 只有当主题设置为 system 时，才需要通知渲染进程
      if (nativeTheme.themeSource === 'system') {
        eventBus.sendToMain(SYSTEM_EVENTS.SYSTEM_THEME_UPDATED, nativeTheme.shouldUseDarkColors)
      }
    })
  }

  async toggleTheme(theme: 'dark' | 'light' | 'system'): Promise<boolean> {
    nativeTheme.themeSource = theme
    this.setSetting('appTheme', theme)
    return nativeTheme.shouldUseDarkColors
  }

  async getTheme(): Promise<string> {
    return this.getSetting<string>('appTheme') || 'system'
  }

  async getSystemTheme(): Promise<'dark' | 'light'> {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }

  // 获取所有自定义 prompts
  async getCustomPrompts(): Promise<Prompt[]> {
    try {
      // 使用 setImmediate 确保异步执行，避免阻塞
      return await new Promise<Prompt[]>((resolve) => {
        setImmediate(() => {
          try {
            const prompts = this.customPromptsStore.get('prompts') || []
            resolve(prompts)
          } catch {
            resolve([])
          }
        })
      })
    } catch {
      return []
    }
  }

  // 保存自定义 prompts
  async setCustomPrompts(prompts: Prompt[]): Promise<void> {
    // 使用 setImmediate 确保异步执行，避免阻塞
    return new Promise<void>((resolve) => {
      setImmediate(() => {
        try {
          this.customPromptsStore.set('prompts', prompts)
          // 通知MCP系统检查并启动/停止自定义提示词服务器（仅主进程内部）
          eventBus.sendToMain(CONFIG_EVENTS.CUSTOM_PROMPTS_SERVER_CHECK_REQUIRED)
          resolve()
        } catch (error) {
          console.error('Failed to set custom prompts:', error)
          resolve()
        }
      })
    })
  }

  // 添加单个 prompt
  async addCustomPrompt(prompt: Prompt): Promise<void> {
    const prompts = await this.getCustomPrompts()
    prompts.push(prompt)
    await this.setCustomPrompts(prompts)
    // 事件会在 setCustomPrompts 中触发
  }

  // 更新单个 prompt
  async updateCustomPrompt(promptId: string, updates: Partial<Prompt>): Promise<void> {
    const prompts = await this.getCustomPrompts()
    const index = prompts.findIndex((p) => p.id === promptId)
    if (index !== -1) {
      prompts[index] = { ...prompts[index], ...updates }
      await this.setCustomPrompts(prompts)
      // 事件会在 setCustomPrompts 中触发
    }
  }

  // 删除单个 prompt
  async deleteCustomPrompt(promptId: string): Promise<void> {
    const prompts = await this.getCustomPrompts()
    const filteredPrompts = prompts.filter((p) => p.id !== promptId)
    await this.setCustomPrompts(filteredPrompts)
    // 事件会在 setCustomPrompts 中触发
  }

  // 获取默认系统提示词
  async getDefaultSystemPrompt(): Promise<string> {
    return this.getSetting<string>('default_system_prompt') || ''
  }

  // 设置默认系统提示词
  async setDefaultSystemPrompt(prompt: string): Promise<void> {
    this.setSetting('default_system_prompt', prompt)
  }

  // 获取默认快捷键
  getDefaultShortcutKey(): ShortcutKeySetting {
    return {
      ...defaultShortcutKey
    }
  }

  // 获取快捷键
  getShortcutKey(): ShortcutKeySetting {
    return (
      this.getSetting<ShortcutKeySetting>('shortcutKey') || {
        ...defaultShortcutKey
      }
    )
  }

  // 设置快捷键
  setShortcutKey(customShortcutKey: ShortcutKeySetting) {
    this.setSetting('shortcutKey', customShortcutKey)
  }

  // 重置快捷键
  resetShortcutKeys() {
    this.setSetting('shortcutKey', { ...defaultShortcutKey })
  }
}

// 导出配置相关内容，方便其他组件使用
export { defaultModelsSettings } from './modelDefaultSettings'
export { providerModelSettings } from './providerModelSettings'
export { defaultShortcutKey } from './shortcutKeySettings'
