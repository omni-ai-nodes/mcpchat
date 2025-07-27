import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { eventBus, SendTarget } from '@/eventbus'
import { MCP_EVENTS } from '@/events'
import path from 'path'
import { presenter } from '@/presenter'
import { app } from 'electron'
import fs from 'fs'
// import { NO_PROXY, proxyConfig } from '@/presenter/proxyConfig'
import { getInMemoryServer } from './inMemoryServers/builder'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  PromptListEntry,
  ToolCallResult,
  Tool,
  Prompt,
  ResourceListEntry,
  Resource
} from '@shared/presenter'
// TODO: resources 和 prompts 的类型,Notifactions 的类型 https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/examples/client/simpleStreamableHttp.ts
// 简单的 OAuth 提供者，用于处理 Bearer Token
class SimpleOAuthProvider {
  private token: string | null = null

  constructor(authHeader: string | undefined) {
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      this.token = authHeader.substring(7) // 移除 'Bearer ' 前缀
    }
  }

  async tokens(): Promise<{ access_token: string } | null> {
    if (this.token) {
      return { access_token: this.token }
    }
    return null
  }
}

// 确保 TypeScript 能够识别 SERVER_STATUS_CHANGED 属性
type MCPEventsType = typeof MCP_EVENTS & {
  SERVER_STATUS_CHANGED: string
}

// Session management related types
interface SessionError extends Error {
  httpStatus?: number
  isSessionExpired?: boolean
}

// Helper function to check if error is session-related
function isSessionError(error: unknown): error is SessionError {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    // Check for specific MCP Streamable HTTP session error patterns
    const sessionErrorPatterns = [
      'no valid session',
      'session expired',
      'session not found',
      'invalid session',
      'session id',
      'mcp-session-id'
    ]

    const httpErrorPatterns = ['http 400', 'http 404', 'bad request', 'not found']

    // Check for session-specific errors first (high confidence)
    const hasSessionPattern = sessionErrorPatterns.some((pattern) => message.includes(pattern))
    if (hasSessionPattern) {
      return true
    }

    // Check for HTTP errors that might be session-related (lower confidence)
    // Only treat as session error if it's an HTTP transport
    const hasHttpPattern = httpErrorPatterns.some((pattern) => message.includes(pattern))
    if (hasHttpPattern && (message.includes('posting') || message.includes('endpoint'))) {
      return true
    }
  }
  return false
}

// MCP 客户端类
export class McpClient {
  private client: Client | null = null
  private transport: Transport | null = null
  public serverName: string
  public serverConfig: Record<string, unknown>
  private isConnected: boolean = false
  private connectionTimeout: NodeJS.Timeout | null = null
  private bunRuntimePath: string | null = null
  private nodeRuntimePath: string | null = null
  private uvRuntimePath: string | null = null
  private npmRegistry: string | null = null
  private uvRegistry: string | null = null
  private configPresenter?: IConfigPresenter

  // Session management
  private isRecovering: boolean = false
  private hasRestarted: boolean = false

  // 缓存
  private cachedTools: Tool[] | null = null
  private cachedPrompts: PromptListEntry[] | null = null
  private cachedResources: ResourceListEntry[] | null = null

  // 处理PATH环境变量的函数
  private normalizePathEnv(paths: string[]): { key: string; value: string } {
    const isWindows = process.platform === 'win32'
    const separator = isWindows ? ';' : ':'
    const pathKey = isWindows ? 'Path' : 'PATH'

    // 合并所有路径
    const pathValue = paths.filter(Boolean).join(separator)

    return { key: pathKey, value: pathValue }
  }

  // 展开路径中的各种符号和变量
  private expandPath(inputPath: string): string {
    let expandedPath = inputPath

    // 处理 ~ 符号 (用户主目录)
    if (expandedPath.startsWith('~/') || expandedPath === '~') {
      const homeDir = app.getPath('home')
      expandedPath = expandedPath.replace('~', homeDir)
    }

    // 处理环境变量展开
    expandedPath = expandedPath.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match
    })

    // 处理简单的 $VAR 格式 (不含花括号)
    expandedPath = expandedPath.replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, varName) => {
      return process.env[varName] || match
    })

    return expandedPath
  }

  // 替换命令为 runtime 版本
  private replaceWithRuntimeCommand(command: string): string {
    // 获取命令的基本名称（去掉路径）
    const basename = path.basename(command)
    console.log(`[McpClient] 尝试替换命令: ${command} (basename: ${basename})`)

    // 根据命令类型选择对应的 runtime 路径
    if (process.platform === 'win32') {
      // Windows平台只替换Node.js相关命令，bun命令让系统自动处理
      if (this.nodeRuntimePath) {
        if (basename === 'node') {
          const runtimeCommand = path.join(this.nodeRuntimePath, 'node.exe')
          console.log(`[McpClient] 替换 node 命令: ${command} -> ${runtimeCommand}`)
          return runtimeCommand
        } else if (basename === 'npm') {
          // Windows 下 npm 通常是 .cmd 文件
          const npmCmd = path.join(this.nodeRuntimePath, 'npm.cmd')
          if (fs.existsSync(npmCmd)) {
            console.log(`[McpClient] 替换 npm 命令: ${command} -> ${npmCmd}`)
            return npmCmd
          }
          // 如果不存在，尝试系统 npm
          console.log(`[McpClient] Runtime npm.cmd 不存在，回退到系统 npm: ${command}`)
          return 'npm'
        } else if (basename === 'npx') {
          // Windows 下 npx 通常是 .cmd 文件
          const npxCmd = path.join(this.nodeRuntimePath, 'npx.cmd')
          if (fs.existsSync(npxCmd)) {
            console.log(`[McpClient] 替换 npx 命令: ${command} -> ${npxCmd}`)
            return npxCmd
          }
          // 如果不存在，尝试系统 npx
          console.log(`[McpClient] Runtime npx.cmd 不存在，回退到系统 npx: ${command}`)
          return 'npx'
        }
      } else {
        // 如果没有 nodeRuntimePath，对于 node/npm/npx 命令回退到系统版本
        if (['node', 'npm', 'npx'].includes(basename)) {
          console.log(`[McpClient] 没有 nodeRuntimePath，回退到系统命令: ${basename}`)
          return basename
        }
      }
    } else {
      // 非Windows平台处理所有命令
      if (['node', 'npm', 'npx', 'bun'].includes(basename)) {
        // 优先使用 Bun，如果不可用则使用 Node.js
        if (this.bunRuntimePath) {
          // 对于 node/npm/npx，统一替换为 bun
          const targetCommand = 'bun'
          const runtimeCommand = path.join(this.bunRuntimePath, targetCommand)
          console.log(`[McpClient] 使用 Bun 替换命令: ${command} -> ${runtimeCommand}`)
          return runtimeCommand
        } else if (this.nodeRuntimePath) {
          // 使用 Node.js 运行时
          let targetCommand: string
          if (basename === 'node') {
            targetCommand = 'node'
          } else if (basename === 'npm') {
            targetCommand = 'npm'
          } else if (basename === 'npx') {
            targetCommand = 'npx'
          } else if (basename === 'bun') {
            targetCommand = 'node' // 将 bun 命令映射到 node
          } else {
            targetCommand = basename
          }
          const runtimeCommand = path.join(this.nodeRuntimePath, 'bin', targetCommand)
          if (fs.existsSync(runtimeCommand)) {
            console.log(`[McpClient] 使用 Node.js 替换命令: ${command} -> ${runtimeCommand}`)
            return runtimeCommand
          } else {
            console.log(`[McpClient] Runtime 命令不存在: ${runtimeCommand}，回退到系统命令: ${basename}`)
            return basename
          }
        } else {
          // 如果没有运行时，回退到系统命令
          console.log(`[McpClient] 没有可用的运行时，回退到系统命令: ${basename}`)
          return basename
        }
      }
    }

    // UV命令处理（所有平台）
    if (['uv', 'uvx'].includes(basename)) {
      if (!this.uvRuntimePath) {
        console.log(`[McpClient] 没有 uvRuntimePath，保持原命令: ${command}`)
        return command
      }

      // uv 和 uvx 都使用对应的命令
      const targetCommand = basename === 'uvx' ? 'uvx' : 'uv'

      if (process.platform === 'win32') {
        const runtimeCommand = path.join(this.uvRuntimePath, `${targetCommand}.exe`)
        console.log(`[McpClient] 替换 UV 命令: ${command} -> ${runtimeCommand}`)
        return runtimeCommand
      } else {
        const runtimeCommand = path.join(this.uvRuntimePath, targetCommand)
        console.log(`[McpClient] 替换 UV 命令: ${command} -> ${runtimeCommand}`)
        return runtimeCommand
      }
    }

    console.log(`[McpClient] 保持原命令不变: ${command}`)
    return command
  }

  // 检查参数是否为可执行命令（而非文件路径或其他参数）
  private isExecutableCommand(arg: string): boolean {
    // 如果参数包含路径分隔符，很可能是文件路径而非命令
    if (arg.includes('/') || arg.includes('\\')) {
      return false
    }
    
    // 如果参数以 - 开头，是命令行选项
    if (arg.startsWith('-')) {
      return false
    }
    
    // 如果参数包含 = 号，是环境变量或配置
    if (arg.includes('=')) {
      return false
    }
    
    // 如果参数包含文件扩展名，很可能是文件
    if (arg.includes('.') && (arg.endsWith('.js') || arg.endsWith('.py') || arg.endsWith('.ts') || arg.endsWith('.json'))) {
      return false
    }
    
    // 检查是否为已知的可执行命令
    const knownCommands = ['node', 'npm', 'npx', 'bun', 'python', 'python3', 'pip', 'pip3', 'uv', 'uvx']
    const basename = path.basename(arg)
    return knownCommands.includes(basename)
  }

  // 处理特殊参数替换（如 npx -> bun x）
  private processCommandWithArgs(
    command: string,
    args: string[]
  ): { command: string; args: string[] } {
    const basename = path.basename(command)
    console.log(`[McpClient] 处理命令和参数: ${command} ${args.join(' ')}`)

    // 处理 npx 命令
    if (basename === 'npx' || command.includes('npx')) {
      console.log(`[McpClient] 检测到 npx 命令，平台: ${process.platform}`)
      
      if (process.platform === 'win32') {
        // Windows 平台使用 Node.js 的 npx，只替换命令，保持参数不变
        const replacedCommand = this.replaceWithRuntimeCommand(command)
        console.log(`[McpClient] Windows 平台 npx 处理: ${command} -> ${replacedCommand}`)
        return {
          command: replacedCommand,
          args: args // 保持参数不变
        }
      } else {
        // 非Windows平台优先使用 Bun，需要在参数前添加 'x'
        if (this.bunRuntimePath) {
          const bunCommand = this.replaceWithRuntimeCommand('bun')
          console.log(`[McpClient] 使用 Bun 替换 npx: ${command} -> ${bunCommand} x ${args.join(' ')}`)
          return {
            command: bunCommand,
            args: ['x', ...args] // 保持原参数不变
          }
        } else if (this.nodeRuntimePath) {
          // 如果没有Bun，使用Node.js，保持原有参数
          const replacedCommand = this.replaceWithRuntimeCommand(command)
          console.log(`[McpClient] 使用 Node.js 替换 npx: ${command} -> ${replacedCommand}`)
          return {
            command: replacedCommand,
            args: args // 保持参数不变
          }
        } else {
          // 如果没有运行时，回退到系统 npx
          console.log(`[McpClient] 没有可用运行时，回退到系统 npx`)
          return {
            command: 'npx',
            args: args
          }
        }
      }
    }

    const replacedCommand = this.replaceWithRuntimeCommand(command)
    console.log(`[McpClient] 常规命令处理: ${command} -> ${replacedCommand}`)
    
    // 只对确实是可执行命令的参数进行替换，其他参数保持不变
    const processedArgs = args.map((arg) => {
      if (this.isExecutableCommand(arg)) {
        const replacedArg = this.replaceWithRuntimeCommand(arg)
        console.log(`[McpClient] 替换参数中的命令: ${arg} -> ${replacedArg}`)
        return replacedArg
      } else {
        console.log(`[McpClient] 保持参数不变: ${arg}`)
        return arg
      }
    })
    
    return {
      command: replacedCommand,
      args: processedArgs
    }
  }

  // 获取系统特定的默认路径
  private getDefaultPaths(homeDir: string): string[] {
    if (process.platform === 'darwin') {
      return [
        '/bin',
        '/usr/bin',
        '/usr/local/bin',
        '/usr/local/sbin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        '/usr/local/opt/node/bin',
        '/opt/local/bin',
        `${homeDir}/.cargo/bin`
      ]
    } else if (process.platform === 'linux') {
      return ['/bin', '/usr/bin', '/usr/local/bin', `${homeDir}/.cargo/bin`]
    } else {
      // Windows
      return [`${homeDir}\\.cargo\\bin`, `${homeDir}\\.local\\bin`]
    }
  }

  constructor(
    serverName: string,
    serverConfig: Record<string, unknown>,
    npmRegistry: string | null = null,
    uvRegistry: string | null = null,
    configPresenter?: IConfigPresenter
  ) {
    this.serverName = serverName
    this.serverConfig = serverConfig
    this.npmRegistry = npmRegistry
    this.uvRegistry = uvRegistry
    this.configPresenter = configPresenter

    const runtimeBasePath = path
      .join(app.getAppPath(), 'runtime')
      .replace('app.asar', 'app.asar.unpacked')
    console.info('runtimeBasePath', runtimeBasePath)

    // 检查 bun 运行时文件是否存在
    const bunRuntimePath = path.join(runtimeBasePath, 'bun')
    if (process.platform === 'win32') {
      const bunExe = path.join(bunRuntimePath, 'bun.exe')
      if (fs.existsSync(bunExe)) {
        this.bunRuntimePath = bunRuntimePath
      } else {
        this.bunRuntimePath = null
      }
    } else {
      const bunBin = path.join(bunRuntimePath, 'bun')
      if (fs.existsSync(bunBin)) {
        this.bunRuntimePath = bunRuntimePath
      } else {
        this.bunRuntimePath = null
      }
    }

    // 检查 node 运行时文件是否存在
    const nodeRuntimePath = path.join(runtimeBasePath, 'node')
    if (process.platform === 'win32') {
      const nodeExe = path.join(nodeRuntimePath, 'node.exe')
      if (fs.existsSync(nodeExe)) {
        this.nodeRuntimePath = nodeRuntimePath
      } else {
        this.nodeRuntimePath = null
      }
    } else {
      const nodeBin = path.join(nodeRuntimePath, 'bin', 'node')
      if (fs.existsSync(nodeBin)) {
        this.nodeRuntimePath = nodeRuntimePath
      } else {
        this.nodeRuntimePath = null
      }
    }

    // 检查 uv 运行时文件是否存在
    const uvRuntimePath = path.join(runtimeBasePath, 'uv')
    if (process.platform === 'win32') {
      const uvExe = path.join(uvRuntimePath, 'uv.exe')
      const uvxExe = path.join(uvRuntimePath, 'uvx.exe')
      if (fs.existsSync(uvExe) && fs.existsSync(uvxExe)) {
        this.uvRuntimePath = uvRuntimePath
      } else {
        this.uvRuntimePath = null
      }
    } else {
      const uvBin = path.join(uvRuntimePath, 'uv')
      const uvxBin = path.join(uvRuntimePath, 'uvx')
      if (fs.existsSync(uvBin) && fs.existsSync(uvxBin)) {
        this.uvRuntimePath = uvRuntimePath
      } else {
        this.uvRuntimePath = null
      }
    }
  }

  // 连接到 MCP 服务器
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      console.info(`MCP server ${this.serverName} is already running`)
      return
    }

    try {
      console.info(`Starting MCP server ${this.serverName}...`, this.serverConfig)

      // 处理 customHeaders 和 AuthProvider
      let authProvider: SimpleOAuthProvider | null = null
      const customHeaders = this.serverConfig.customHeaders
        ? { ...(this.serverConfig.customHeaders as Record<string, string>) } // 创建副本以进行修改
        : {}

      if (customHeaders.Authorization) {
        authProvider = new SimpleOAuthProvider(customHeaders.Authorization)
        delete customHeaders.Authorization // 从 headers 中移除，因为它将由 AuthProvider 处理
      }

      if (this.serverConfig.type === 'inmemory') {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        const _args = Array.isArray(this.serverConfig.args) ? this.serverConfig.args : []
        const _env = this.serverConfig.env ? (this.serverConfig.env as Record<string, string>) : {}
        const _server = getInMemoryServer(this.serverName, _args, _env)
        _server.startServer(serverTransport)
        this.transport = clientTransport
      } else if (this.serverConfig.type === 'stdio') {
        // 创建合适的transport
        let command = this.serverConfig.command as string
        let args = this.serverConfig.args as string[]

        // 处理路径展开 (包括 ~ 和环境变量)
        command = this.expandPath(command)
        args = args.map((arg) => this.expandPath(arg))

        const HOME_DIR = app.getPath('home')

        // 定义允许的环境变量白名单
        const allowedEnvVars = [
          'PATH',
          'path',
          'Path',
          'npm_config_registry',
          'npm_config_cache',
          'npm_config_prefix',
          'npm_config_tmp',
          'NPM_CONFIG_REGISTRY',
          'NPM_CONFIG_CACHE',
          'NPM_CONFIG_PREFIX',
          'NPM_CONFIG_TMP',
          'OPENAI_API_KEY'
          // 'GRPC_PROXY',
          // 'grpc_proxy'
        ]

        // 修复env类型问题
        const env: Record<string, string> = {}

        // 处理命令和参数替换
        const processedCommand = this.processCommandWithArgs(command, args)
        command = processedCommand.command
        args = processedCommand.args
        
        // 规范化args，合并可能的路径片段
        args = this.normalizeArgs(command, args)

        // 判断是否是 Node.js/Bun/UV 相关命令
        const isNodeCommand = ['node', 'npm', 'npx', 'bun', 'uv', 'uvx'].some(
          (cmd) => command.includes(cmd) || args.some((arg) => arg.includes(cmd))
        )

        if (isNodeCommand) {
          // Node.js/Bun/UV 命令使用白名单处理
          if (process.env) {
            const existingPaths: string[] = []

            // 收集所有PATH相关的值
            Object.entries(process.env).forEach(([key, value]) => {
              if (value !== undefined) {
                if (['PATH', 'Path', 'path'].includes(key)) {
                  existingPaths.push(value)
                } else if (
                  allowedEnvVars.includes(key) &&
                  !['PATH', 'Path', 'path'].includes(key)
                ) {
                  env[key] = value
                }
              }
            })

            // 获取默认路径
            const defaultPaths = this.getDefaultPaths(HOME_DIR)

            // 合并所有路径
            const allPaths = [...existingPaths, ...defaultPaths]
            // 添加运行时路径
            if (process.platform === 'win32') {
              // Windows平台只添加 node 和 uv 路径
              if (this.uvRuntimePath) {
                allPaths.unshift(this.uvRuntimePath)
              }
              if (this.nodeRuntimePath) {
                allPaths.unshift(this.nodeRuntimePath)
              }
            } else {
              // 其他平台优先级：bun > node > uv
              if (this.uvRuntimePath) {
                allPaths.unshift(this.uvRuntimePath)
              }
              if (this.nodeRuntimePath) {
                allPaths.unshift(path.join(this.nodeRuntimePath, 'bin'))
              }
              if (this.bunRuntimePath) {
                allPaths.unshift(this.bunRuntimePath)
              }
            }

            // 规范化并设置PATH
            const { key, value } = this.normalizePathEnv(allPaths)
            env[key] = value
          }
        } else {
          // 非 Node.js/Bun/UV 命令，保留所有系统环境变量，只补充 PATH
          Object.entries(process.env).forEach(([key, value]) => {
            if (value !== undefined) {
              env[key] = value
            }
          })

          // 补充 PATH
          const existingPaths: string[] = []
          if (env.PATH) {
            existingPaths.push(env.PATH)
          }
          if (env.Path) {
            existingPaths.push(env.Path)
          }

          // 获取默认路径
          const defaultPaths = this.getDefaultPaths(HOME_DIR)

          // 合并所有路径
          const allPaths = [...existingPaths, ...defaultPaths]
          // 添加运行时路径
          if (process.platform === 'win32') {
            // Windows平台只添加 node 和 uv 路径
            if (this.uvRuntimePath) {
              allPaths.unshift(this.uvRuntimePath)
            }
            if (this.nodeRuntimePath) {
              allPaths.unshift(this.nodeRuntimePath)
            }
          } else {
            // 其他平台优先级：bun > node > uv
            if (this.uvRuntimePath) {
              allPaths.unshift(this.uvRuntimePath)
            }
            if (this.nodeRuntimePath) {
              allPaths.unshift(path.join(this.nodeRuntimePath, 'bin'))
            }
            if (this.bunRuntimePath) {
              allPaths.unshift(this.bunRuntimePath)
            }
          }

          // 规范化并设置PATH
          const { key, value } = this.normalizePathEnv(allPaths)
          env[key] = value
        }

        // 添加自定义环境变量
        if (this.serverConfig.env) {
          Object.entries(this.serverConfig.env as Record<string, string>).forEach(
            ([key, value]) => {
              if (value !== undefined) {
                // 如果是PATH相关变量，合并到主PATH中
                if (['PATH', 'Path', 'path'].includes(key)) {
                  const currentPathKey = process.platform === 'win32' ? 'Path' : 'PATH'
                  const separator = process.platform === 'win32' ? ';' : ':'
                  env[currentPathKey] = env[currentPathKey]
                    ? `${value}${separator}${env[currentPathKey]}`
                    : value
                } else {
                  env[key] = value
                }
              }
            }
          )
        }

        // 如果是Node.js相关命令，从配置中添加OPENAI_API_KEY
        if (isNodeCommand && this.configPresenter) {
          const openaiProvider = this.configPresenter.getProviderById('openai')
          if (openaiProvider && openaiProvider.apiKey) {
            env['OPENAI_API_KEY'] = openaiProvider.apiKey
            console.log(`[McpClient] 已添加 OPENAI_API_KEY 到环境变量`)
          }
        }

        if (this.npmRegistry) {
          env.npm_config_registry = this.npmRegistry
        }

        if (this.uvRegistry) {
          env.UV_DEFAULT_INDEX = this.uvRegistry
          env.PIP_INDEX_URL = this.uvRegistry
        }

        // console.log('mcp env', command, env, args)
        this.transport = new StdioClientTransport({
          command,
          args,
          env,
          stderr: 'pipe'
        })
        ;(this.transport as StdioClientTransport).stderr?.on('data', (data) => {
          console.info('mcp StdioClientTransport error', this.serverName, data.toString())
        })
      } else if (this.serverConfig.baseUrl && this.serverConfig.type === 'sse') {
        this.transport = new SSEClientTransport(new URL(this.serverConfig.baseUrl as string), {
          requestInit: { headers: customHeaders },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          authProvider: (authProvider ?? undefined) as any
        })
      } else if (this.serverConfig.baseUrl && this.serverConfig.type === 'http') {
        this.transport = new StreamableHTTPClientTransport(
          new URL(this.serverConfig.baseUrl as string),
          {
            requestInit: { headers: customHeaders },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            authProvider: (authProvider ?? undefined) as any
          }
        )
      } else {
        throw new Error(`不支持的传输类型: ${this.serverConfig.type}`)
      }

      // 创建 MCP 客户端
      this.client = new Client(
        { name: 'DeepChat', version: app.getVersion() },
        {
          capabilities: {
            resources: {},
            tools: {},
            prompts: {}
          }
        }
      )

      // 设置连接超时
      const timeoutPromise = new Promise<void>((_, reject) => {
        this.connectionTimeout = setTimeout(
          () => {
            console.error(`Connection to MCP server ${this.serverName} timed out`)
            reject(new Error(`Connection to MCP server ${this.serverName} timed out`))
          },
          5 * 60 * 1000
        ) // 5分钟
      })

      // 连接到服务器
      const connectPromise = this.client
        .connect(this.transport)
        .then(() => {
          // 清除超时
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout)
            this.connectionTimeout = null
          }

          this.isConnected = true
          console.info(`MCP server ${this.serverName} connected successfully`)

          // 触发服务器状态变更事件
          eventBus.send(
            (MCP_EVENTS as MCPEventsType).SERVER_STATUS_CHANGED,
            SendTarget.ALL_WINDOWS,
            {
              name: this.serverName,
              status: 'running'
            }
          )
        })
        .catch((error) => {
          console.error(`Failed to connect to MCP server ${this.serverName}:`, error)
          throw error
        })

      // 等待连接完成或超时
      await Promise.race([connectPromise, timeoutPromise])
    } catch (error) {
      // 清除超时
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout)
        this.connectionTimeout = null
      }

      // 清理资源
      this.cleanupResources()

      console.error(`Failed to connect to MCP server ${this.serverName}:`, error)

      // 触发服务器状态变更事件
      eventBus.send((MCP_EVENTS as MCPEventsType).SERVER_STATUS_CHANGED, SendTarget.ALL_WINDOWS, {
        name: this.serverName,
        status: 'stopped'
      })

      throw error
    }
  }

  // 断开与 MCP 服务器的连接
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.client) {
      return
    }

    try {
      // Use internal disconnect method for normal disconnection
      await this.internalDisconnect()
    } catch (error) {
      console.error(`Failed to disconnect from MCP server ${this.serverName}:`, error)
      throw error
    }
  }

  private normalizeArgs(command: string, args: string[]): string[] {
    const basename = path.basename(command);
    if (!['node', 'bun', 'python', 'python3'].includes(basename)) {
      return args;
    }
    
    // 如果args为空或只有一个参数，直接返回
    if (args.length <= 1) {
      return args;
    }
    
    // 检查第一个参数是否是有效的文件路径
    const firstArg = args[0];
    if (fs.existsSync(firstArg)) {
      console.log(`[McpClient] 第一个参数是有效路径: ${firstArg}`);
      return args;
    }
    
    // 尝试合并前几个参数来重建可能被分割的路径
    // 但是要更智能地处理，避免错误合并
    for (let i = 1; i < Math.min(args.length, 4); i++) { // 最多尝试合并前4个参数
      const potentialPath = args.slice(0, i + 1).join(' ');
      
      if (fs.existsSync(potentialPath)) {
        const newArgs = [potentialPath, ...args.slice(i + 1)];
        console.log(`[McpClient] 合并路径成功: ${potentialPath}`);
        return newArgs;
      }
    }
    
    // 如果没有找到有效文件，返回原args
    console.warn(`[McpClient] 未找到有效脚本路径，返回原args: ${args.join(' ')}`);
    return args;
  }
  
  // 清理资源
  private cleanupResources(): void {
    // 清除超时定时器
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }

    // 关闭transport
    if (this.transport) {
      try {
        this.transport.close()
      } catch (error) {
        console.error(`Failed to close MCP transport:`, error)
      }
    }

    // 重置状态
    this.client = null
    this.transport = null
    this.isConnected = false

    // 清空缓存
    this.cachedTools = null
    this.cachedPrompts = null
    this.cachedResources = null
  }

  // 检查服务器是否正在运行
  isServerRunning(): boolean {
    return this.isConnected && !!this.client
  }

  // Check and handle session errors by restarting the service
  private async checkAndHandleSessionError(error: unknown): Promise<void> {
    if (isSessionError(error) && !this.isRecovering) {
      // If already restarted once and still getting session errors, stop the service
      if (this.hasRestarted) {
        console.error(
          `Session error persists after restart for server ${this.serverName}, stopping service...`,
          error
        )
        await this.stopService()
        throw new Error(`MCP服务 ${this.serverName} 重启后仍然出现session错误，已停止服务`)
      }

      console.warn(
        `Session error detected for server ${this.serverName}, restarting service...`,
        error
      )

      this.isRecovering = true

      try {
        // Clean up current connection
        this.cleanupResources()

        // Clear all caches to ensure fresh data after reconnection
        this.cachedTools = null
        this.cachedPrompts = null
        this.cachedResources = null

        // Mark as restarted
        this.hasRestarted = true

        console.info(`Service ${this.serverName} restarted due to session error`)
      } catch (restartError) {
        console.error(`Failed to restart service ${this.serverName}:`, restartError)
      } finally {
        this.isRecovering = false
      }
    }
  }

  // Stop the service completely due to persistent session errors
  private async stopService(): Promise<void> {
    try {
      // Use the same disconnect logic but with different reason
      await this.internalDisconnect('persistent session errors')
    } catch (error) {
      console.error(`Failed to stop service ${this.serverName}:`, error)
    }
  }

  // Internal disconnect with custom reason
  private async internalDisconnect(reason?: string): Promise<void> {
    // Clean up all resources
    this.cleanupResources()

    const logMessage = reason
      ? `MCP service ${this.serverName} has been stopped due to ${reason}`
      : `Disconnected from MCP server: ${this.serverName}`

    console.log(logMessage)

    // Trigger server status changed event to notify the system
    eventBus.send((MCP_EVENTS as MCPEventsType).SERVER_STATUS_CHANGED, SendTarget.ALL_WINDOWS, {
      name: this.serverName,
      status: 'stopped'
    })
  }

  // 调用 MCP 工具
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      if (!this.isConnected) {
        await this.connect()
      }

      if (!this.client) {
        throw new Error(`MCP客户端 ${this.serverName} 未初始化`)
      }

      // 调用工具
      const result = (await this.client.callTool({
        name: toolName,
        arguments: args
      })) as ToolCallResult

      // 成功调用后重置重启标志
      this.hasRestarted = false

      // 检查结果
      if (result.isError) {
        const errorText = result.content && result.content[0] ? result.content[0].text : '未知错误'
        // 如果调用失败，清空工具缓存，以便下次重新获取
        this.cachedTools = null
        return {
          isError: true,
          content: [{ type: 'error', text: errorText }]
        }
      }
      return result
    } catch (error) {
      // 检查并处理session错误
      await this.checkAndHandleSessionError(error)

      console.error(`Failed to call MCP tool ${toolName}:`, error)
      // 调用失败，清空工具缓存
      this.cachedTools = null
      throw error
    }
  }

  // 列出可用工具
  async listTools(): Promise<Tool[]> {
    // 检查缓存
    if (this.cachedTools !== null) {
      return this.cachedTools
    }

    try {
      if (!this.isConnected) {
        await this.connect()
      }

      if (!this.client) {
        throw new Error(`MCP客户端 ${this.serverName} 未初始化`)
      }

      const response = await this.client.listTools()

      // 成功调用后重置重启标志
      this.hasRestarted = false

      // 检查响应格式
      if (response && typeof response === 'object' && 'tools' in response) {
        const toolsArray = response.tools
        if (Array.isArray(toolsArray)) {
          // 缓存结果
          this.cachedTools = toolsArray as Tool[]
          return this.cachedTools
        }
      }
      throw new Error('无效的工具响应格式')
    } catch (error) {
      // 检查并处理session错误
      await this.checkAndHandleSessionError(error)

      // 尝试从错误对象中提取更多信息
      const errorMessage = error instanceof Error ? error.message : String(error)
      // 如果错误表明不支持，则缓存空数组
      if (errorMessage.includes('Method not found') || errorMessage.includes('not supported')) {
        console.warn(`Server ${this.serverName} does not support listTools`)
        this.cachedTools = []
        return this.cachedTools
      } else {
        console.error(`Failed to list MCP tools:`, error)
        // 发生其他错误，不清空缓存（保持null），以便下次重试
        throw error
      }
    }
  }

  // 列出可用提示
  async listPrompts(): Promise<PromptListEntry[]> {
    // 检查缓存
    if (this.cachedPrompts !== null) {
      return this.cachedPrompts
    }

    try {
      if (!this.isConnected) {
        await this.connect()
      }

      if (!this.client) {
        throw new Error(`MCP客户端 ${this.serverName} 未初始化`)
      }

      // SDK可能没有 listPrompts 方法，需要使用通用的 request
      const response = await this.client.listPrompts()

      // 成功调用后重置重启标志
      this.hasRestarted = false

      // 检查响应格式
      if (response && typeof response === 'object' && 'prompts' in response) {
        const promptsArray = (response as { prompts: unknown }).prompts
        // console.log('promptsArray', JSON.stringify(promptsArray, null, 2))
        if (Array.isArray(promptsArray)) {
          // 需要确保每个元素都符合 Prompt 接口
          const validPrompts = promptsArray.map((p) => ({
            name: typeof p === 'object' && p !== null && 'name' in p ? String(p.name) : 'unknown',
            description:
              typeof p === 'object' && p !== null && 'description' in p
                ? String(p.description)
                : undefined,
            arguments:
              typeof p === 'object' && p !== null && 'arguments' in p ? p.arguments : undefined,
            files: typeof p === 'object' && p !== null && 'files' in p ? p.files : undefined
          })) as PromptListEntry[]
          // 缓存结果
          this.cachedPrompts = validPrompts
          return this.cachedPrompts
        }
      }
      throw new Error('无效的提示响应格式')
    } catch (error) {
      // 检查并处理session错误
      await this.checkAndHandleSessionError(error)

      // 尝试从错误对象中提取更多信息
      const errorMessage = error instanceof Error ? error.message : String(error)
      // 如果错误表明不支持，则缓存空数组
      if (errorMessage.includes('Method not found') || errorMessage.includes('not supported')) {
        console.warn(`Server ${this.serverName} does not support listPrompts`)
        this.cachedPrompts = []
        return this.cachedPrompts
      } else {
        console.error(`Failed to list MCP prompts:`, error)
        // 发生其他错误，不清空缓存（保持null），以便下次重试
        throw error
      }
    }
  }

  // 获取指定提示
  async getPrompt(name: string, args?: Record<string, unknown>): Promise<Prompt> {
    try {
      if (!this.isConnected) {
        await this.connect()
      }

      if (!this.client) {
        throw new Error(`MCP客户端 ${this.serverName} 未初始化`)
      }

      const response = await this.client.getPrompt({
        name,
        arguments: (args as Record<string, string>) || {}
      })

      // 成功调用后重置重启标志
      this.hasRestarted = false

      // 检查响应格式并转换为 Prompt 类型
      if (
        response &&
        typeof response === 'object' &&
        'messages' in response &&
        Array.isArray(response.messages)
      ) {
        return {
          id: name,
          name: name, // 从请求参数中获取 name
          description: response.description || '',
          messages: response.messages as Array<{ role: string; content: { text: string } }>
        }
      }
      throw new Error('无效的获取提示响应格式')
    } catch (error) {
      // 检查并处理session错误
      await this.checkAndHandleSessionError(error)

      console.error(`Failed to get MCP prompt ${name}:`, error)
      // 获取失败，清空提示缓存
      this.cachedPrompts = null
      throw error
    }
  }

  // 列出可用资源
  async listResources(): Promise<ResourceListEntry[]> {
    // 检查缓存
    if (this.cachedResources !== null) {
      return this.cachedResources
    }

    try {
      if (!this.isConnected) {
        await this.connect()
      }

      if (!this.client) {
        throw new Error(`MCP客户端 ${this.serverName} 未初始化`)
      }

      // SDK可能没有 listResources 方法，需要使用通用的 request
      const response = await this.client.listResources()

      // 成功调用后重置重启标志
      this.hasRestarted = false

      // 检查响应格式
      if (response && typeof response === 'object' && 'resources' in response) {
        const resourcesArray = (response as { resources: unknown }).resources
        if (Array.isArray(resourcesArray)) {
          // 需要确保每个元素都符合 ResourceListEntry 接口
          const validResources = resourcesArray.map((r) => ({
            uri: typeof r === 'object' && r !== null && 'uri' in r ? String(r.uri) : 'unknown',
            name: typeof r === 'object' && r !== null && 'name' in r ? String(r.name) : undefined
          })) as ResourceListEntry[]
          // 缓存结果
          this.cachedResources = validResources
          return this.cachedResources
        }
      }
      throw new Error('无效的资源列表响应格式')
    } catch (error) {
      // 检查并处理session错误
      await this.checkAndHandleSessionError(error)

      // 尝试从错误对象中提取更多信息
      const errorMessage = error instanceof Error ? error.message : String(error)
      // 如果错误表明不支持，则缓存空数组
      if (errorMessage.includes('Method not found') || errorMessage.includes('not supported')) {
        console.warn(`Server ${this.serverName} does not support listResources`)
        this.cachedResources = []
        return this.cachedResources
      } else {
        console.error(`Failed to list MCP resources:`, error)
        // 发生其他错误，不清空缓存（保持null），以便下次重试
        throw error
      }
    }
  }

  // 读取资源
  async readResource(resourceUri: string): Promise<Resource> {
    try {
      if (!this.isConnected) {
        await this.connect()
      }

      if (!this.client) {
        throw new Error(`MCP客户端 ${this.serverName} 未初始化`)
      }

      // 使用 unknown 作为中间类型进行转换
      const rawResource = await this.client.readResource({ uri: resourceUri })

      // 成功调用后重置重启标志
      this.hasRestarted = false

      // 手动构造 Resource 对象
      const resource: Resource = {
        uri: resourceUri,
        text:
          typeof rawResource === 'object' && rawResource !== null && 'text' in rawResource
            ? String(rawResource['text'])
            : JSON.stringify(rawResource)
      }

      return resource
    } catch (error) {
      // 检查并处理session错误
      await this.checkAndHandleSessionError(error)

      console.error(`Failed to read MCP resource ${resourceUri}:`, error)
      // 读取失败，清空资源缓存
      this.cachedResources = null
      throw error
    }
  }
}

// 工厂函数，用于创建 MCP 客户端
export async function createMcpClient(serverName: string): Promise<McpClient> {
  // 从configPresenter获取MCP服务器配置
  const servers = await presenter.configPresenter.getMcpServers()

  // 获取服务器配置
  const serverConfig = servers[serverName]
  if (!serverConfig) {
    throw new Error(`MCP server ${serverName} not found in configuration`)
  }

  // 创建并返回 MCP 客户端，传入null作为npmRegistry
  // 注意：这个函数应该只用于直接创建客户端实例的情况
  // 正常情况下应该通过ServerManager创建，以便使用测试后的npm registry
  return new McpClient(serverName, serverConfig as unknown as Record<string, unknown>, null)
}
