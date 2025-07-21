import { IConfigPresenter } from '@shared/presenter'
import { McpClient } from './mcpClient'
import { LocalPackageManager } from './localPackageManager'
import axios from 'axios'
import { proxyConfig } from '@/presenter/proxyConfig'
import { eventBus, SendTarget } from '@/eventbus'
import { NOTIFICATION_EVENTS } from '@/events'
import { MCP_EVENTS } from '@/events'
import { getErrorMessageLabels } from '@shared/i18n'

const NPM_REGISTRY_LIST = [
  'https://registry.npmjs.org/',
  'https://r.cnpmjs.org/',
  'https://registry.npmmirror.com/'
]

export class ServerManager {
  private clients: Map<string, McpClient> = new Map()
  private configPresenter: IConfigPresenter
  private npmRegistry: string | null = null
  private localPackageManager: LocalPackageManager

  constructor(configPresenter: IConfigPresenter) {
    this.configPresenter = configPresenter
    this.localPackageManager = new LocalPackageManager()
  }

  // 测试npm registry速度并返回最佳选择
  async testNpmRegistrySpeed(): Promise<string> {
    const timeout = 5000
    const testPackage = 'tiny-runtime-injector'

    // 获取代理配置
    const proxyUrl = proxyConfig.getProxyUrl()
    const proxyOptions = proxyUrl
      ? { proxy: { host: new URL(proxyUrl).hostname, port: parseInt(new URL(proxyUrl).port) } }
      : {}

    const results = await Promise.all(
      NPM_REGISTRY_LIST.map(async (registry) => {
        const start = Date.now()
        let success = false
        let isTimeout = false
        let time = 0

        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)

          const response = await axios.get(`${registry}${testPackage}`, {
            ...proxyOptions,
            signal: controller.signal
          })

          clearTimeout(timeoutId)
          success = response.status >= 200 && response.status < 300
          time = Date.now() - start
        } catch (error) {
          time = Date.now() - start
          isTimeout = (error instanceof Error && error.name === 'AbortError') || time >= timeout
        }

        return {
          registry,
          success,
          time,
          isTimeout
        }
      })
    )

    // 过滤出成功的请求，并按响应时间排序
    const successfulResults = results
      .filter((result) => result.success)
      .sort((a, b) => a.time - b.time)
    console.log('npm registry check results', successfulResults)

    // 如果所有请求都失败，返回默认的registry
    if (successfulResults.length === 0) {
      console.log('All npm registry tests failed, using default registry')
      return NPM_REGISTRY_LIST[0]
    }

    // 返回响应最快的registry
    this.npmRegistry = successfulResults[0].registry
    return this.npmRegistry
  }

  // 获取npm registry
  getNpmRegistry(): string | null {
    return this.npmRegistry
  }

  // 获取本地包管理器
  getLocalPackageManager(): LocalPackageManager {
    return this.localPackageManager
  }

  // 清理本地包缓存
  async clearLocalCache(): Promise<void> {
    return this.localPackageManager.clearCache()
  }

  // 获取缓存统计信息
  getCacheStats(): { totalPackages: number; totalSize: number } {
    return this.localPackageManager.getCacheStats()
  }

  // 获取默认服务器名称列表
  async getDefaultServerNames(): Promise<string[]> {
    return this.configPresenter.getMcpDefaultServers()
  }

  // 获取默认服务器名称（兼容旧版本，返回第一个默认服务器）
  async getDefaultServerName(): Promise<string | null> {
    const defaultServers = await this.configPresenter.getMcpDefaultServers()
    const servers = await this.configPresenter.getMcpServers()

    // 如果没有默认服务器或者默认服务器不存在，返回 null
    if (defaultServers.length === 0 || !servers[defaultServers[0]]) {
      return null
    }

    return defaultServers[0]
  }

  // 获取默认客户端（不自动启动服务，仅返回第一个默认服务器客户端）
  async getDefaultClient(): Promise<McpClient | null> {
    const defaultServerName = await this.getDefaultServerName()

    if (!defaultServerName) {
      return null
    }

    // 返回已存在的客户端实例，无论是否运行
    return this.getClient(defaultServerName) || null
  }

  // 获取所有默认客户端
  async getDefaultClients(): Promise<McpClient[]> {
    const defaultServerNames = await this.getDefaultServerNames()
    const clients: McpClient[] = []

    for (const serverName of defaultServerNames) {
      const client = this.getClient(serverName)
      if (client) {
        clients.push(client)
      }
    }

    return clients
  }

  // 获取正在运行的客户端
  async getRunningClients(): Promise<McpClient[]> {
    const clients: McpClient[] = []
    for (const [name, client] of this.clients.entries()) {
      if (this.isServerRunning(name)) {
        clients.push(client)
      }
    }
    return clients
  }

  async startServer(name: string): Promise<void> {
    // 如果服务器已经在运行，则不需要再次启动
    if (this.clients.has(name)) {
      if (this.isServerRunning(name)) {
        console.info(`MCP server ${name} is already running`)
      } else {
        console.info(`MCP server ${name} is starting...`)
      }
      return
    }

    const servers = await this.configPresenter.getMcpServers()
    const serverConfig = servers[name]

    if (!serverConfig) {
      throw new Error(`MCP server ${name} not found`)
    }

    try {
      console.info(`Starting MCP server ${name}...`)
      const npmRegistry = serverConfig.customNpmRegistry || this.npmRegistry
      
      // 预安装npx包（如果需要）- 完全异步执行，不阻塞启动
      // 使用 setImmediate 确保完全异步
      setImmediate(() => {
        this.preInstallPackageIfNeeded(serverConfig, npmRegistry)
      })
      
      // 创建并保存客户端实例，传入npm registry
      const client = new McpClient(
        name,
        serverConfig as unknown as Record<string, unknown>,
        npmRegistry
      )
      this.clients.set(name, client)

      // 连接到服务器，这将启动服务
      await client.connect()
    } catch (error) {
      console.error(`Failed to start MCP server ${name}:`, error)

      // 移除客户端引用
      this.clients.delete(name)

      // 发送全局错误通知
      this.sendMcpConnectionError(name, error)

      throw error
    } finally {
      eventBus.send(MCP_EVENTS.CLIENT_LIST_UPDATED, SendTarget.ALL_WINDOWS)
    }
  }

  /**
   * 预安装npx包（如果需要）- 异步执行，不阻塞服务器启动
   */
  private preInstallPackageIfNeeded(serverConfig: any, npmRegistry?: string | null): void {
    const command = serverConfig.command as string
    let packageName: string | undefined
  
    if (command === 'npx') {
      // 对于 command === 'npx'，从 args 中提取包名（假设 args[0] 是 -y，args[1] 是包名）
      if (serverConfig.args && serverConfig.args.length >= 2 && serverConfig.args[0] === '-y') {
        packageName = serverConfig.args[1]
      }
    } else if (command.startsWith('npx ')) {
      packageName = command.split(' ')[1]
    }
  
    if (!packageName) {
      return
    }
  
    // 异步执行预安装，不阻塞服务器启动
    (async () => {
      try {
        console.info(`预检查包 ${packageName}...`);
        
        // 检查包是否已缓存
        if (this.localPackageManager.isPackageCached(packageName)) {
          console.info(`包 ${packageName} 已在本地缓存中`);
          return;
        }
  
        // 尝试安装到本地缓存
        console.info(`正在预安装包 ${packageName} 到本地缓存...`);
        await this.localPackageManager.installPackageToCache(packageName, npmRegistry || undefined);
        console.info(`包 ${packageName} 预安装完成`);
      } catch (error) {
        console.warn(`预安装包 ${packageName} 失败，将在运行时尝试:`, error);
        // 不抛出错误，允许继续启动服务器
      }
    })();
  }

  // 处理并发送MCP连接错误通知
  private sendMcpConnectionError(serverName: string, error: unknown): void {
    // 引入所需模块

    try {
      // 获取当前语言
      const locale = this.configPresenter.getLanguage?.() || 'zh-CN'
      const errorMessages = getErrorMessageLabels(locale)

      // 格式化错误信息
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      const formattedMessage = `${serverName}: ${errorMsg}`

      // 发送全局错误通知
      eventBus.sendToRenderer(NOTIFICATION_EVENTS.SHOW_ERROR, SendTarget.ALL_WINDOWS, {
        title: errorMessages.mcpConnectionErrorTitle,
        message: formattedMessage,
        id: `mcp-error-${serverName}-${Date.now()}`, // 添加时间戳和服务器名称确保每个错误有唯一ID
        type: 'error'
      })
    } catch (notifyError) {
      console.error('Failed to send MCP error notification:', notifyError)
    }
  }

  async stopServer(name: string): Promise<void> {
    const client = this.clients.get(name)

    if (!client) {
      return
    }

    try {
      // 断开连接，这将停止服务
      await client.disconnect()

      // 从客户端列表中移除
      this.clients.delete(name)

      console.info(`MCP server ${name} has been stopped`)
      eventBus.send(MCP_EVENTS.CLIENT_LIST_UPDATED, SendTarget.ALL_WINDOWS)
    } catch (error) {
      console.error(`Failed to stop MCP server ${name}:`, error)
      throw error
    }
  }

  isServerRunning(name: string): boolean {
    const client = this.clients.get(name)
    if (!client) {
      return false
    }
    return client.isServerRunning()
  }

  /**
   * 获取客户端实例
   */
  getClient(name: string): McpClient | undefined {
    return this.clients.get(name)
  }
}
