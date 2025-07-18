import { eventBus, SendTarget } from '@/eventbus'
import { MCPServerConfig } from '@shared/presenter'
import { MCP_EVENTS } from '@/events'
import ElectronStore from 'electron-store'
import { app } from 'electron'
import { compare } from 'compare-versions'

// MCP设置的接口
interface IMcpSettings {
  mcpServers: Record<string, MCPServerConfig>
  defaultServer?: string // 保留旧字段以支持版本兼容
  defaultServers: string[] // 新增：多个默认服务器数组
  mcpEnabled: boolean // 添加MCP启用状态字段
  [key: string]: unknown // 允许任意键
}
export type MCPServerType = 'stdio' | 'sse' | 'inmemory' | 'http'
// const filesystemPath = path.join(app.getAppPath(), 'resources', 'mcp', 'filesystem.mjs')

// 抽取inmemory类型的服务为常量
// 使用函数来延迟app.getPath调用，避免同步阻塞
function getDefaultInMemoryServers(): Record<string, MCPServerConfig> {
  return {
    buildInFileSystem: {
      args: [app.getPath('home')],
      descriptions: 'McpChat内置文件系统mcp服务',
      icons: '📁',
      autoApprove: ['read'],
      type: 'inmemory' as MCPServerType,
      command: 'filesystem',
      env: {},
      disable: true
    },
    Artifacts: {
      args: [],
      descriptions: 'McpChat内置 artifacts mcp服务',
      icons: '🎨',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'artifacts',
      env: {},
      disable: true
    },
    bochaSearch: {
      args: [],
      descriptions: 'McpChat内置博查搜索服务',
      icons: '🔍',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'bochaSearch',
      env: {
        apiKey: 'YOUR_BOCHA_API_KEY' // 需要用户提供实际的API Key
      },
      disable: false
    },
    braveSearch: {
      args: [],
      descriptions: 'McpChat内置Brave搜索服务',
      icons: '🦁',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'braveSearch',
      env: {
        apiKey: 'YOUR_BRAVE_API_KEY' // 需要用户提供实际的API Key
      },
      disable: false
    },
    difyKnowledge: {
      args: [],
      descriptions: 'McpChat内置Dify知识库检索服务',
      icons: '📚',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'difyKnowledge',
      env: {
        configs: [
          {
            description: 'this is a description for the current knowledge base',
            apiKey: 'YOUR_DIFY_API_KEY',
            datasetId: 'YOUR_DATASET_ID',
            endpoint: 'http://localhost:3000/v1'
          }
        ]
      },
      disable: false
    },
    imageServer: {
      args: [],
      descriptions: 'Image processing MCP service',
      icons: '🖼️',
      autoApprove: ['read_image_base64', 'read_multiple_images_base64'], // Auto-approve reading, require confirmation for uploads
      type: 'inmemory' as MCPServerType,
      command: 'image', // We need to map this command to the ImageServer class later
      env: {},
      disable: false
    },
    powerpack: {
      args: [],
      descriptions: 'McpChat内置增强工具包',
      icons: '🛠️',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'powerpack',
      env: {},
      disable: false
    },
    ragflowKnowledge: {
      args: [],
      descriptions: 'McpChat内置RAGFlow知识库检索服务',
      icons: '📚',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'ragflowKnowledge',
      env: {
        configs: [
          {
            description: '默认RAGFlow知识库',
            apiKey: 'YOUR_RAGFLOW_API_KEY',
            datasetIds: ['YOUR_DATASET_ID'],
            endpoint: 'http://localhost:8000'
          }
        ]
      },
      disable: false
    },
    fastGptKnowledge: {
      args: [],
      descriptions: 'McpChat内置FastGPT知识库检索服务',
      icons: '📚',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'fastGptKnowledge',
      env: {
        configs: [
          {
            description: 'this is a description for the current knowledge base',
            apiKey: 'YOUR_FastGPT_API_KEY',
            datasetId: 'YOUR_DATASET_ID',
            endpoint: 'http://localhost:3000/api'
          }
        ]
      },
      disable: false
    },
    'mcpchat-inmemory/deep-research-server': {
      args: [],
      descriptions:
        'McpChat内置深度研究服务，使用博查搜索(注意该服务需要较长的上下文模型，请勿在短上下文的模型中使用)',
      icons: '🔬',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'mcpchat-inmemory/deep-research-server',
      env: {
        BOCHA_API_KEY: 'YOUR_BOCHA_API_KEY'
      },
      disable: false
    },
    'mcpchat-inmemory/auto-prompting-server': {
      args: [],
      descriptions: 'McpChat内置自动模板提示词服务',
      icons: '📜',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'mcpchat-inmemory/auto-prompting-server',
      env: {},
      disable: false
    },
    'mcpchat-inmemory/conversation-search-server': {
      args: [],
      descriptions: 'McpChat built-in conversation history search service',
      icons: '🔍',
      autoApprove: ['all'],
      type: 'inmemory' as MCPServerType,
      command: 'mcpchat-inmemory/conversation-search-server',
      env: {},
      disable: false
    }
  }
}

function getDefaultMcpServers() {
  return {
    mcpServers: {
      // 先定义内置MCP服务器
      ...getDefaultInMemoryServers(),
      // 之后是默认的三方MCP服务器
      memory: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        env: {},
        descriptions: '内存存储服务',
        icons: '🧠',
        autoApprove: ['all'],
        disable: true,
        type: 'stdio' as MCPServerType
      }
    },
    defaultServers: [], // 默认服务器列表 - 默认不启用任何服务器
    mcpEnabled: false // 默认关闭MCP功能
  }
}

const DEFAULT_MCP_SERVERS = getDefaultMcpServers()
// 这部分mcp有系统逻辑判断是否启用，不受用户配置控制，受软件环境控制
export const SYSTEM_INMEM_MCP_SERVERS: Record<string, MCPServerConfig> = {
  'mcpchat-inmemory/custom-prompts-server': {
    command: 'mcpchat-inmemory/custom-prompts-server',
    args: [],
    env: {},
    descriptions: 'McpChat内置自定义提示词服务',
    icons: '📝',
    autoApprove: ['all'],
    type: 'inmemory' as MCPServerType,
    disable: true // 默认禁用自定义提示词服务
  }
}

export class McpConfHelper {
  private mcpStore: ElectronStore<IMcpSettings> | null = null

  constructor() {
    // 延迟初始化ElectronStore，避免同步阻塞
  }

  private initializeStore(): ElectronStore<IMcpSettings> {
    if (!this.mcpStore) {
      // 使用setImmediate确保异步初始化
      this.mcpStore = new ElectronStore<IMcpSettings>({
        name: 'mcp-settings',
        defaults: {
          mcpServers: DEFAULT_MCP_SERVERS.mcpServers,
          defaultServers: DEFAULT_MCP_SERVERS.defaultServers,
          mcpEnabled: DEFAULT_MCP_SERVERS.mcpEnabled
        }
      })
    }
    return this.mcpStore
  }

  // 获取MCP服务器配置
  getMcpServers(): Promise<Record<string, MCPServerConfig>> {
    // 使用 setImmediate 确保异步执行，避免阻塞
    return new Promise<Record<string, MCPServerConfig>>((resolve) => {
      setImmediate(() => {
        try {
          const mcpStore = this.initializeStore()
          const storedServers = mcpStore.get('mcpServers') || DEFAULT_MCP_SERVERS.mcpServers

          // 检查并补充缺少的inmemory服务
          const updatedServers = { ...storedServers }
          let hasChanges = false

          // 遍历所有默认的inmemory服务，确保它们都存在并更新默认配置
          for (const [serverName, serverConfig] of Object.entries(getDefaultInMemoryServers())) {
            if (!updatedServers[serverName]) {
              console.log(`添加缺少的inmemory服务: ${serverName}`)
              updatedServers[serverName] = serverConfig
              hasChanges = true
            } else {
              // 更新已存在服务的默认配置（如disable状态）
              if (updatedServers[serverName].disable !== serverConfig.disable) {
                console.log(`更新inmemory服务 ${serverName} 的disable状态: ${updatedServers[serverName].disable} -> ${serverConfig.disable}`)
                updatedServers[serverName] = {
                  ...updatedServers[serverName],
                  disable: serverConfig.disable
                }
                hasChanges = true
              }
            }
          }

          // 遍历所有系统内存服务，确保它们都存在并更新默认配置
          for (const [serverName, serverConfig] of Object.entries(SYSTEM_INMEM_MCP_SERVERS)) {
            if (!updatedServers[serverName]) {
              console.log(`添加缺少的系统内存服务: ${serverName}`)
              updatedServers[serverName] = serverConfig
              hasChanges = true
            } else {
              // 更新已存在服务的默认配置（如disable状态）
              if (updatedServers[serverName].disable !== serverConfig.disable) {
                console.log(`更新系统内存服务 ${serverName} 的disable状态: ${updatedServers[serverName].disable} -> ${serverConfig.disable}`)
                updatedServers[serverName] = {
                  ...updatedServers[serverName],
                  disable: serverConfig.disable
                }
                hasChanges = true
              }
            }
          }

          // 如果有变化，更新存储
          if (hasChanges) {
            mcpStore.set('mcpServers', updatedServers)
          }

          resolve(updatedServers)
        } catch (error) {
          console.error('Failed to get MCP servers:', error)
          resolve(DEFAULT_MCP_SERVERS.mcpServers)
        }
      })
    })
  }

  // 设置MCP服务器配置
  async setMcpServers(servers: Record<string, MCPServerConfig>): Promise<void> {
    const mcpStore = this.initializeStore()
    mcpStore.set('mcpServers', servers)
    eventBus.emit(MCP_EVENTS.CONFIG_CHANGED, {
      mcpServers: servers,
      defaultServers: mcpStore.get('defaultServers') || [],
      mcpEnabled: mcpStore.get('mcpEnabled')
    })
  }

  // 获取默认服务器列表
  getMcpDefaultServers(): Promise<string[]> {
    // 使用 setImmediate 确保异步执行，避免阻塞
    return new Promise<string[]>((resolve) => {
      setImmediate(() => {
        try {
          const mcpStore = this.initializeStore()
          const defaultServers = mcpStore.get('defaultServers') || []
          resolve(defaultServers)
        } catch (error) {
          console.error('Failed to get MCP default servers:', error)
          resolve([])
        }
      })
    })
  }

  // 添加默认服务器
  async addMcpDefaultServer(serverName: string): Promise<void> {
    const mcpStore = this.initializeStore()
    const defaultServers = mcpStore.get('defaultServers') || []
    const mcpServers = mcpStore.get('mcpServers') || {}

    // 检测并清理失效的服务器
    const validDefaultServers = defaultServers.filter((server) => {
      const exists = mcpServers[server] !== undefined
      if (!exists) {
        console.log(`检测到失效的MCP服务器: ${server}，已从默认列表中移除`)
      }
      return exists
    })

    // 添加新服务器（如果不在列表中）
    if (!validDefaultServers.includes(serverName)) {
      validDefaultServers.push(serverName)
    }

    // 如果有变化则更新存储并发送事件
    if (
      validDefaultServers.length !== defaultServers.length ||
      !defaultServers.includes(serverName)
    ) {
      mcpStore.set('defaultServers', validDefaultServers)
      eventBus.send(MCP_EVENTS.CONFIG_CHANGED, SendTarget.ALL_WINDOWS, {
        mcpServers: mcpServers,
        defaultServers: validDefaultServers,
        mcpEnabled: mcpStore.get('mcpEnabled')
      })
    }
  }

  // 移除默认服务器
  async removeMcpDefaultServer(serverName: string): Promise<void> {
    const mcpStore = this.initializeStore()
    const defaultServers = mcpStore.get('defaultServers') || []
    const updatedServers = defaultServers.filter((name) => name !== serverName)
    mcpStore.set('defaultServers', updatedServers)
    eventBus.send(MCP_EVENTS.CONFIG_CHANGED, SendTarget.ALL_WINDOWS, {
      mcpServers: mcpStore.get('mcpServers'),
      defaultServers: updatedServers,
      mcpEnabled: mcpStore.get('mcpEnabled')
    })
  }

  // 切换服务器的默认状态
  async toggleMcpDefaultServer(serverName: string): Promise<void> {
    const mcpStore = this.initializeStore()
    const defaultServers = mcpStore.get('defaultServers') || []
    if (defaultServers.includes(serverName)) {
      await this.removeMcpDefaultServer(serverName)
    } else {
      await this.addMcpDefaultServer(serverName)
    }
  }

  // 设置MCP启用状态
  async setMcpEnabled(enabled: boolean): Promise<void> {
    const mcpStore = this.initializeStore()
    mcpStore.set('mcpEnabled', enabled)
    eventBus.send(MCP_EVENTS.CONFIG_CHANGED, SendTarget.ALL_WINDOWS, {
      mcpServers: mcpStore.get('mcpServers'),
      defaultServers: mcpStore.get('defaultServers'),
      mcpEnabled: enabled
    })
  }

  // 获取MCP启用状态
  getMcpEnabled(): Promise<boolean> {
    const mcpStore = this.initializeStore()
    return Promise.resolve(mcpStore.get('mcpEnabled') ?? getDefaultMcpServers().mcpEnabled)
  }

  // 添加MCP服务器
  async addMcpServer(name: string, config: MCPServerConfig): Promise<boolean> {
    const mcpServers = await this.getMcpServers()
    mcpServers[name] = config
    await this.setMcpServers(mcpServers)
    return true
  }

  // 移除MCP服务器
  async removeMcpServer(name: string): Promise<void> {
    const mcpServers = await this.getMcpServers()
    delete mcpServers[name]
    await this.setMcpServers(mcpServers)

    // 如果删除的服务器在默认服务器列表中，则从列表中移除
    const defaultServers = await this.getMcpDefaultServers()
    if (defaultServers.includes(name)) {
      await this.removeMcpDefaultServer(name)
    }
  }

  // 更新MCP服务器配置
  async updateMcpServer(name: string, config: Partial<MCPServerConfig>): Promise<void> {
    const mcpServers = await this.getMcpServers()
    if (!mcpServers[name]) {
      throw new Error(`MCP server ${name} not found`)
    }
    mcpServers[name] = {
      ...mcpServers[name],
      ...config
    }
    await this.setMcpServers(mcpServers)
  }

  // 恢复默认服务器配置
  async resetToDefaultServers(): Promise<void> {
    const currentServers = await this.getMcpServers()
    const updatedServers = { ...currentServers }

    // 删除所有类型为inmemory的服务
    for (const [serverName, serverConfig] of Object.entries(updatedServers)) {
      if (serverConfig.type === 'inmemory') {
        delete updatedServers[serverName]
      }
    }

    // 遍历所有默认服务，有则覆盖，无则新增
    for (const [serverName, serverConfig] of Object.entries(DEFAULT_MCP_SERVERS.mcpServers)) {
      updatedServers[serverName] = serverConfig
    }

    // 更新服务器配置
    await this.setMcpServers(updatedServers)

    // 确保默认服务器存在
    const mcpStore = this.initializeStore()
    mcpStore.set('defaultServers', getDefaultMcpServers().defaultServers)
    eventBus.send(MCP_EVENTS.CONFIG_CHANGED, SendTarget.ALL_WINDOWS, {
      mcpServers: updatedServers,
      defaultServers: getDefaultMcpServers().defaultServers,
      mcpEnabled: mcpStore.get('mcpEnabled')
    })
  }

  public onUpgrade(oldVersion: string | undefined): void {
    console.log('onUpgrade', oldVersion)
    if (oldVersion && compare(oldVersion, '0.0.12', '<=')) {
      // 将旧版本的defaultServer迁移到新版本的defaultServers
      const mcpStore = this.initializeStore()
      const oldDefaultServer = mcpStore.get('defaultServer') as string | undefined
      if (oldDefaultServer) {
        console.log(`迁移旧版本defaultServer: ${oldDefaultServer}到defaultServers`)
        const defaultServers = mcpStore.get('defaultServers') || []
        if (!defaultServers.includes(oldDefaultServer)) {
          defaultServers.push(oldDefaultServer)
          mcpStore.set('defaultServers', defaultServers)
        }
        // 删除旧的defaultServer字段，防止重复迁移
        mcpStore.delete('defaultServer')
      }

      // 迁移 filesystem 服务器到 buildInFileSystem
        try {
          const mcpServers = mcpStore.get('mcpServers') || {}
        // console.log('mcpServers', mcpServers)
        if (mcpServers.filesystem) {
          console.log('检测到旧版本的 filesystem MCP 服务器，开始迁移到 buildInFileSystem')

          // 检查 buildInFileSystem 是否已存在
          if (!mcpServers.buildInFileSystem) {
            // 创建 buildInFileSystem 配置
            mcpServers.buildInFileSystem = {
              args: [app.getPath('home')], // 默认值
              descriptions: '内置文件系统mcp服务',
              icons: '💾',
              autoApprove: ['read'],
              type: 'inmemory' as MCPServerType,
              command: 'filesystem',
              env: {},
              disable: false
            }
          }

          // 如果 filesystem 的 args 长度大于 2，将第三个参数及以后的参数迁移
          if (mcpServers.filesystem.args && mcpServers.filesystem.args.length > 2) {
            mcpServers.buildInFileSystem.args = mcpServers.filesystem.args.slice(2)
          }

          // 迁移 autoApprove 设置
          if (mcpServers.filesystem.autoApprove) {
            mcpServers.buildInFileSystem.autoApprove = [...mcpServers.filesystem.autoApprove]
          }

          delete mcpServers.filesystem
          // 更新 mcpServers
          mcpStore.set('mcpServers', mcpServers)

          // 如果 filesystem 是默认服务器，将 buildInFileSystem 添加到默认服务器列表
          const defaultServers = mcpStore.get('defaultServers') || []
          if (
            defaultServers.includes('filesystem') &&
            !defaultServers.includes('buildInFileSystem')
          ) {
            defaultServers.push('buildInFileSystem')
            mcpStore.set('defaultServers', defaultServers)
          }

          console.log('迁移 filesystem 到 buildInFileSystem 完成')
        }
      } catch (error) {
        console.error('迁移 filesystem 服务器时出错:', error)
      }
    }
  }
}
