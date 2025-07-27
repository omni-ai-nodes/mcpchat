import { app } from 'electron'
import { presenter } from '@/presenter'
import { IDeeplinkPresenter, MCPServerConfig } from '@shared/presenter'
import path from 'path'
import { DEEPLINK_EVENTS, MCP_EVENTS, WINDOW_EVENTS } from '@/events'
import { eventBus, SendTarget } from '@/eventbus'
import { GitDownloadManager } from '@/lib/gitDownloadManager'

interface MCPInstallConfig {
  mcpServers: Record<
    string,
    {
      command?: string
      args?: string[]
      env?: Record<string, string> | string
      descriptions?: string
      icons?: string
      autoApprove?: string[]
      disable?: boolean
      url?: string
      type?: 'sse' | 'stdio' | 'http'
      github?: string // GitHub仓库URL，用于node命令时下载代码
    }
  >
}

/**
 * DeepLink 处理器类
 * 负责处理 mcpchat:// 协议的链接
 * mcpchat://start 唤起应用，进入到默认的新会话界面
 * mcpchat://start?msg=你好 唤起应用，进入新会话界面，并且带上默认消息
 * mcpchat://start?msg=你好&model=deepseek-chat 唤起应用，进入新会话界面，并且带上默认消息，model先进行完全匹配，选中第一个命中的。没有命中的就进行模糊匹配，只要包含这个字段的第一个返回，如果都没有就忽略用默认
 * mcpchat://mcp/install?json=base64JSONData 通过json数据直接安装mcp
 */
export class DeeplinkPresenter implements IDeeplinkPresenter {
  private startupUrl: string | null = null
  private pendingMcpInstallUrl: string | null = null

  init(): void {
    // 注册协议处理器
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('mcpchat', process.execPath, [
          path.resolve(process.argv[1])
        ])
      }
    } else {
      app.setAsDefaultProtocolClient('mcpchat')
    }

    // 处理 macOS 上协议被调用的情况
    app.on('open-url', (event, url) => {
      event.preventDefault()
      if (!app.isReady()) {
        console.log('App not ready yet, saving URL:', url)
        this.startupUrl = url
      } else {
        console.log('App is ready, checking URL:', url)
        this.processDeepLink(url)
      }
    })

    // 监听窗口内容加载完成事件
    eventBus.once(WINDOW_EVENTS.FIRST_CONTENT_LOADED, () => {
      console.log('Window content loaded. Processing DeepLink if exists.')
      if (this.startupUrl) {
        console.log('Processing startup URL:', this.startupUrl)
        this.processDeepLink(this.startupUrl)
        this.startupUrl = null
      }
    })

    // 监听MCP初始化完成事件
    eventBus.on(MCP_EVENTS.INITIALIZED, () => {
      console.log('MCP initialized. Processing pending MCP install if exists.')
      if (this.pendingMcpInstallUrl) {
        console.log('Processing pending MCP install URL:', this.pendingMcpInstallUrl)
        this.handleDeepLink(this.pendingMcpInstallUrl)
        this.pendingMcpInstallUrl = null
      }
    })

    // 处理 Windows 上协议被调用的情况
    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {
      console.log('Another instance is already running, quitting this instance.')
      // 在开发模式下，给出更详细的信息而不是立即退出
      if (process.env.NODE_ENV === 'development') {
        console.warn('Development mode: Another instance detected. This might cause issues.')
        console.warn('If you are sure no other instance is running, try killing all node/electron processes.')
        // 延迟退出，给用户时间看到日志
        setTimeout(() => {
          app.quit()
        }, 2000)
      } else {
        app.quit()
      }
    } else {
      app.on('second-instance', (_event, commandLine) => {
        // 用户尝试运行第二个实例，我们应该聚焦到我们的窗口
        if (presenter.windowPresenter.mainWindow) {
          if (presenter.windowPresenter.mainWindow.isMinimized()) {
            presenter.windowPresenter.mainWindow.restore()
          }
          presenter.windowPresenter.mainWindow.show()
          presenter.windowPresenter.mainWindow.focus()
        }
        if (process.platform === 'win32') {
          // 在 Windows 上，命令行参数包含协议 URL
          const deepLinkUrl = commandLine.find((arg) => arg.startsWith('mcpchat://'))
          if (deepLinkUrl) {
            if (!app.isReady()) {
              console.log('Windows: App not ready yet, saving URL:', deepLinkUrl)
              this.startupUrl = deepLinkUrl
            } else {
              console.log('Windows: App is ready, checking URL:', deepLinkUrl)
              this.processDeepLink(deepLinkUrl)
            }
          }
        }
      })
    }
  }

  // 新增：处理DeepLink的方法，根据URL类型和系统状态决定如何处理
  private processDeepLink(url: string): void {
    try {
      const urlObj = new URL(url)
      const command = urlObj.hostname
      const subCommand = urlObj.pathname.slice(1)

      // 如果是MCP安装命令，需要等待MCP初始化完成
      if (command === 'mcp' && subCommand === 'install') {
        if (!presenter.mcpPresenter.isReady()) {
          console.log('MCP not ready yet, saving MCP install URL for later')
          this.pendingMcpInstallUrl = url
          return
        }
      }

      // 其他类型的DeepLink或MCP已初始化完成，直接处理
      this.handleDeepLink(url)
    } catch (error) {
      console.error('Error processing DeepLink:', error)
    }
  }

  async handleDeepLink(url: string): Promise<void> {
    console.log('Received DeepLink:', url)

    try {
      const urlObj = new URL(url)

      if (urlObj.protocol !== 'mcpchat:') {
        console.error('Unsupported protocol:', urlObj.protocol)
        return
      }

      // 从 hostname 获取命令
      const command = urlObj.hostname

      // 处理不同的命令
      if (command === 'start') {
        await this.handleStart(urlObj.searchParams)
      } else if (command === 'mcp') {
        // 处理 mcp/install 命令
        const subCommand = urlObj.pathname.slice(1) // 移除开头的斜杠
        if (subCommand === 'install') {
          await this.handleMcpInstall(urlObj.searchParams)
        } else {
          console.warn('Unknown MCP subcommand:', subCommand)
        }
      } else {
        console.warn('Unknown DeepLink command:', command)
      }
    } catch (error) {
      console.error('Error processing DeepLink:', error)
    }
  }

  async handleStart(params: URLSearchParams): Promise<void> {
    console.log('Processing start command, parameters:', Object.fromEntries(params.entries()))

    let msg = params.get('msg')
    if (!msg) {
      return
    }
    msg = decodeURIComponent(msg)
    // 如果有模型参数，尝试设置
    let modelId = params.get('model')
    if (modelId && modelId.trim() !== '') {
      modelId = decodeURIComponent(modelId)
    }
    let systemPrompt = params.get('system')
    if (systemPrompt && systemPrompt.trim() !== '') {
      systemPrompt = decodeURIComponent(systemPrompt)
    } else {
      systemPrompt = ''
    }
    // 如果用户增加了yolo=1或者yolo=true，则自动发送消息
    const yolo = params.get('yolo')
    const autoSend = yolo && yolo.trim() !== ''
    console.log('msg:', msg)
    console.log('modelId:', modelId)
    console.log('systemPrompt:', systemPrompt)
    console.log('autoSend:', autoSend)
    eventBus.sendToRenderer(DEEPLINK_EVENTS.START, SendTarget.DEFAULT_TAB, {
      msg,
      modelId,
      systemPrompt,
      autoSend
    })
  }

  async handleMcpInstall(params: URLSearchParams): Promise<void> {
    console.log('[DeeplinkPresenter] 开始处理MCP安装命令, parameters:', Object.fromEntries(params.entries()))
    console.log('[DeeplinkPresenter] 参数详情:', JSON.stringify(Object.fromEntries(params.entries()), null, 2))

    // 获取 JSON 数据
    const jsonBase64 = params.get('code')
    if (!jsonBase64) {
      console.error("Missing 'code' parameter")
      return
    }

    try {
      // 解码 Base64 并解析 JSON
      const jsonString = Buffer.from(jsonBase64, 'base64').toString('utf-8')

      const mcpConfig = JSON.parse(jsonString) as MCPInstallConfig

      // 检查 MCP 配置是否有效
      if (!mcpConfig || !mcpConfig.mcpServers) {
        console.error('Invalid MCP configuration: missing mcpServers field')
        return
      }

      // 遍历并安装所有 MCP 服务器
      for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
        let determinedType: 'sse' | 'stdio' | null = null
        const determinedCommand: string | undefined = serverConfig.command
        const determinedUrl: string | undefined = serverConfig.url

        // 1. Check explicit type
        if (serverConfig.type) {
          if (serverConfig.type === 'stdio' || serverConfig.type === 'sse') {
            determinedType = serverConfig.type
            // Validate required fields based on explicit type
            if (determinedType === 'stdio' && !determinedCommand) {
              console.error(
                `Server ${serverName} is type 'stdio' but missing required 'command' field`
              )
              continue
            }
            if (determinedType === 'sse' && !determinedUrl) {
              console.error(`Server ${serverName} is type 'sse' but missing required 'url' field`)
              continue
            }
          } else {
            console.error(
              `Server ${serverName} provided invalid 'type' value: ${serverConfig.type}, should be 'stdio' or 'sse'`
            )
            continue
          }
        } else {
          // 2. Infer type if not provided
          const hasCommand = !!determinedCommand && determinedCommand.trim() !== ''
          const hasUrl = !!determinedUrl && determinedUrl.trim() !== ''

          if (hasCommand && hasUrl) {
            console.error(
              `Server ${serverName} provides both 'command' and 'url' fields, but 'type' is not specified. Please explicitly set 'type' to 'stdio' or 'sse'.`
            )
            continue
          } else if (hasCommand) {
            determinedType = 'stdio'
          } else if (hasUrl) {
            determinedType = 'sse'
          } else {
            console.error(
              `Server ${serverName} must provide either 'command' (for stdio) or 'url' (for sse) field`
            )
            continue
          }
        }

        // Safeguard check (should not be reached if logic is correct)
        if (!determinedType) {
          console.error(`Cannot determine server ${serverName} type ('stdio' or 'sse')`)
          continue
        }

        // Set default values based on determined type
        const defaultConfig: Partial<MCPServerConfig> = {
          env: {},
          descriptions: `${serverName} MCP Service`,
          icons: determinedType === 'stdio' ? '🔌' : '🌐', // Different default icons
          autoApprove: ['all'],
          disable: false,
          args: [],
          baseUrl: '',
          command: '',
          type: determinedType
        }

        // 处理GitHub下载逻辑
        const processedCommand = determinedType === 'stdio' ? determinedCommand! : defaultConfig.command!
        let processedArgs = serverConfig.args || defaultConfig.args!
        
        console.log(`[DeeplinkPresenter] 开始处理GitHub下载逻辑，服务器: ${serverName}`)
        console.log(`[DeeplinkPresenter] 原始command: ${determinedCommand}`)
        console.log(`[DeeplinkPresenter] 原始args: ${JSON.stringify(processedArgs)}`)
        console.log(`[DeeplinkPresenter] GitHub字段: ${serverConfig.github}`)
        console.log(`[DeeplinkPresenter] 服务器类型: ${determinedType}`)
        
        // 如果配置中有github字段且command是Node.js相关命令，则下载GitHub仓库
        const isNodeCommand = determinedCommand && (
          determinedCommand === 'node' ||
          determinedCommand.includes('node') ||
          determinedCommand.includes('npm') ||
          determinedCommand.includes('npx') ||
          determinedCommand.endsWith('node') ||
          determinedCommand.endsWith('npm') ||
          determinedCommand.endsWith('npx')
        )
        console.log(`[DeeplinkPresenter] 是否为Node.js命令: ${isNodeCommand}`)
        
        if (serverConfig.github && determinedType === 'stdio' && isNodeCommand) {
          try {
            console.log(`[DeeplinkPresenter] 检测到GitHub字段，开始下载仓库: ${serverConfig.github}`)
            console.log(`[DeeplinkPresenter] 传递服务器名称作为目标名称: ${serverName}`)
            // 传递服务器名称作为目标名称以便重命名
            const gitDownloadManager = new GitDownloadManager(presenter.configPresenter)
            const downloadResult = await gitDownloadManager.downloadRepository(serverConfig.github, serverName, undefined, serverName)
            console.log(`[DeeplinkPresenter] GitHub仓库下载完成，路径: ${downloadResult.localPath}`)
            
            // 更新command和args以使用下载的代码
            // 假设主文件在仓库根目录，如果args中有相对路径，则转换为绝对路径
            console.log(`[DeeplinkPresenter] 开始更新args，原始args长度: ${processedArgs.length}`)
            if (processedArgs.length > 0) {
              // 将第一个参数（通常是主文件）转换为绝对路径
              const mainFile = processedArgs[0]
              console.log(`[DeeplinkPresenter] 主文件: ${mainFile}`)
              const absoluteMainFile = path.isAbsolute(mainFile) ? mainFile : path.join(downloadResult.localPath, mainFile)
              console.log(`[DeeplinkPresenter] 绝对路径主文件: ${absoluteMainFile}`)
              processedArgs = [absoluteMainFile, ...processedArgs.slice(1)]
              console.log(`[DeeplinkPresenter] 更新后的args: ${JSON.stringify(processedArgs)}`)
            } else {
              console.log(`[DeeplinkPresenter] args为空，跳过更新`)
            }
            
            console.log(`[DeeplinkPresenter] GitHub仓库下载完成，最终args: ${JSON.stringify(processedArgs)}`)
          } catch (error) {
            console.error(`[DeeplinkPresenter] 下载GitHub仓库失败: ${error}`)
            console.error(`[DeeplinkPresenter] 错误详情:`, error)
            throw new Error(`Failed to download GitHub repository: ${error}`)
          }
        } else {
          console.log(`[DeeplinkPresenter] 跳过GitHub下载，原因:`)
          console.log(`[DeeplinkPresenter] - 有GitHub字段: ${!!serverConfig.github}`)
          console.log(`[DeeplinkPresenter] - 是stdio类型: ${determinedType === 'stdio'}`)
          console.log(`[DeeplinkPresenter] - 是Node.js命令: ${isNodeCommand}`)
        }

        // Merge configuration
        const finalConfig: MCPServerConfig = {
          env: {
            ...(typeof defaultConfig.env === 'string'
              ? JSON.parse(defaultConfig.env)
              : defaultConfig.env),
            ...(typeof serverConfig.env === 'string'
              ? JSON.parse(serverConfig.env)
              : serverConfig.env)
          },
          // env: { ...defaultConfig.env, ...serverConfig.env },
          descriptions: serverConfig.descriptions || defaultConfig.descriptions!,
          icons: serverConfig.icons || defaultConfig.icons!,
          autoApprove: serverConfig.autoApprove || defaultConfig.autoApprove!,
          disable: serverConfig.disable ?? defaultConfig.disable!,
          args: processedArgs,
          type: determinedType, // Use the determined type
          // Set command or baseUrl based on type, prioritizing provided values
          command: processedCommand,
          baseUrl: determinedType === 'sse' ? determinedUrl! : defaultConfig.baseUrl!,
          Github: serverConfig.github // 保存github字段
        }

        // 安装 MCP 服务器
        console.log(
          `Preparing to install MCP server: ${serverName} (type: ${determinedType})`,
          finalConfig
        )
        const resultServerConfig = {
          mcpServers: {
            [serverName]: finalConfig
          }
        }
        
        console.log(`[DeeplinkPresenter] 准备保存MCP服务器配置:`)
        console.log(`[DeeplinkPresenter] 最终配置:`, JSON.stringify(resultServerConfig, null, 2))
        
        // 如果配置中指定了该服务器为默认服务器，则添加到默认服务器列表
        eventBus.sendToRenderer(DEEPLINK_EVENTS.MCP_INSTALL, SendTarget.DEFAULT_TAB, {
          mcpConfig: JSON.stringify(resultServerConfig)
        })
        
        console.log(`[DeeplinkPresenter] MCP服务器 "${serverName}" 安装完成`)
        console.log(`[DeeplinkPresenter] 安装过程结束`)
      }
      console.log('All MCP servers processing completed')
    } catch (error) {
      console.error('Error parsing or processing MCP configuration:', error)
    }
  }
}
