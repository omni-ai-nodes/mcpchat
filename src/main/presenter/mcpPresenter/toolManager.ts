import { eventBus, SendTarget } from '@/eventbus'
import { MCP_EVENTS, NOTIFICATION_EVENTS } from '@/events'
import {
  MCPToolCall,
  MCPToolDefinition,
  MCPToolResponse,
  MCPContentItem,
  MCPTextContent,
  IConfigPresenter,
  Resource
} from '@shared/presenter'
import { ServerManager } from './serverManager'
import { McpClient } from './mcpClient'
import { jsonrepair } from 'jsonrepair'
import { getErrorMessageLabels } from '@shared/i18n'

export class ToolManager {
  private configPresenter: IConfigPresenter
  private serverManager: ServerManager
  private cachedToolDefinitions: MCPToolDefinition[] | null = null
  private toolNameToTargetMap: Map<string, { client: McpClient; originalName: string }> | null =
    null

  constructor(configPresenter: IConfigPresenter, serverManager: ServerManager) {
    this.configPresenter = configPresenter
    this.serverManager = serverManager
    eventBus.on(MCP_EVENTS.CLIENT_LIST_UPDATED, this.handleServerListUpdate)
  }

  private handleServerListUpdate = (): void => {
    console.info('MCP client list updated, clearing tool definitions cache and target map.')
    this.cachedToolDefinitions = null
    this.toolNameToTargetMap = null
  }

  public async getRunningClients(): Promise<McpClient[]> {
    return this.serverManager.getRunningClients()
  }

  // 获取所有工具定义
  public async getAllToolDefinitions(): Promise<MCPToolDefinition[]> {
    if (this.cachedToolDefinitions !== null && this.cachedToolDefinitions.length > 0) {
      return this.cachedToolDefinitions
    }

    // console.info('Fetching/refreshing tool definitions and target map...')
    const clients = await this.serverManager.getRunningClients()
    const results: MCPToolDefinition[] = []
    // Initialize/clear the map before processing
    if (this.toolNameToTargetMap) {
      this.toolNameToTargetMap.clear() // Clear existing map
    } else {
      this.toolNameToTargetMap = new Map() // Initialize if null
    }

    if (!clients || clients.length === 0) {
      // console.warn('No running MCP clients found.')
      this.cachedToolDefinitions = []
      // Map is already cleared or initialized as empty
      return this.cachedToolDefinitions
    }

    const toolNameToServerMap: Map<string, string> = new Map()
    const toolsToRename: Map<string, Set<string>> = new Map()

    // Pass 1: Detect conflicts
    for (const client of clients) {
      try {
        const clientTools = await client.listTools()
        if (!clientTools) continue

        const currentServerRenames: Set<string> = toolsToRename.get(client.serverName) || new Set()

        for (const tool of clientTools) {
          if (toolNameToServerMap.has(tool.name)) {
            const originalServerName = toolNameToServerMap.get(tool.name)!
            if (originalServerName !== client.serverName) {
              console.warn(
                `Conflict detected for tool '${tool.name}' between server '${originalServerName}' and '${client.serverName}'. Marking for rename.`
              )
              // Mark original tool for rename
              const originalServerRenames = toolsToRename.get(originalServerName) || new Set()
              originalServerRenames.add(tool.name)
              toolsToRename.set(originalServerName, originalServerRenames)
              // Mark current tool for rename
              currentServerRenames.add(tool.name)
            }
          } else {
            toolNameToServerMap.set(tool.name, client.serverName)
          }
        }
        if (currentServerRenames.size > 0) {
          toolsToRename.set(client.serverName, currentServerRenames)
        }
      } catch (error: unknown) {
        // Log error and notify, but continue conflict detection with other clients
        const errorMessage = error instanceof Error ? error.message : String(error)
        const serverName = client.serverName || 'Unknown server'
        console.error(
          `Pass 1 Error: Failed to get tool list from server '${serverName}':`,
          errorMessage
        )
        // Send notification (existing logic from previous commit)
        const locale = this.configPresenter.getLanguage?.() || 'zh-CN'
        const errorMessages = getErrorMessageLabels(locale)
        const formattedMessage =
          errorMessages.getMcpToolListErrorMessage
            ?.replace('{serverName}', serverName)
            .replace('{errorMessage}', errorMessage) ||
          `无法从服务器 '${serverName}' 获取工具列表: ${errorMessage}`
        eventBus.sendToRenderer(NOTIFICATION_EVENTS.SHOW_ERROR, SendTarget.ALL_WINDOWS, {
          title: errorMessages.getMcpToolListErrorTitle || '获取工具定义失败',
          message: formattedMessage,
          id: `mcp-error-pass1-${serverName}-${Date.now()}`,
          type: 'error'
        })
        continue // Continue to next client
      }
    }

    // Pass 2: Build results with renaming AND populate the target map
    for (const client of clients) {
      try {
        const clientTools = await client.listTools()
        if (!clientTools) continue

        const renamesForThisServer = toolsToRename.get(client.serverName) || new Set()

        for (const tool of clientTools) {
          let finalName = tool.name
          let finalDescription = tool.description
          const originalName = tool.name

          if (renamesForThisServer.has(originalName)) {
            finalName = `${client.serverName}_${originalName}`
            finalDescription = `[${client.serverName}] ${tool.description}`
          }

          // Validate the final name against the allowed pattern
          const namePattern = /^[a-zA-Z0-9_-]+$/
          if (!namePattern.test(finalName)) {
            console.error(
              `Generated tool name '${finalName}' is invalid. Skipping tool '${originalName}' from server '${client.serverName}'.`
            )
            continue // Skip adding this tool
          }

          const properties = tool.inputSchema.properties || {}
          const toolProperties = { ...properties }
          for (const key in toolProperties) {
            if (!toolProperties[key].description) {
              toolProperties[key].description = 'Params of ' + key
            }
          }

          results.push({
            type: 'function',
            function: {
              name: finalName,
              description: finalDescription,
              parameters: {
                type: 'object',
                properties: toolProperties,
                required: Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : []
              }
            },
            server: {
              name: client.serverName,
              icons: client.serverConfig.icons as string,
              description: client.serverConfig.descriptions as string
            }
          })

          // Populate the target map
          if (this.toolNameToTargetMap) {
            this.toolNameToTargetMap.set(finalName, { client: client, originalName: originalName })
          }
        }
      } catch (error: unknown) {
        // Log error but continue building results from other clients
        const errorMessage = error instanceof Error ? error.message : String(error)
        const serverName = client.serverName || 'Unknown server'
        console.error(
          `Pass 2 Error: Error processing tools from server '${serverName}':`,
          errorMessage
        )
        // Maybe skip adding tools from this client if listTools fails here again,
        // though it succeeded in Pass 1. Or rely on the notification from Pass 1.
        continue // Continue to next client
      }
    }

    // 缓存结果并返回
    this.cachedToolDefinitions = results
    console.info(`Cached ${results.length} final tool definitions and populated target map.`)
    return this.cachedToolDefinitions
  }

  // 检查工具调用权限
  private checkToolPermission(
    originalToolName: string,
    serverName: string,
    autoApprove: string[]
  ): boolean {
    console.log('checkToolPermission', originalToolName, serverName, autoApprove)
    // 如果有 'all' 权限，则允许所有操作
    if (autoApprove.includes('all')) {
      return true
    }
    if (
      originalToolName.includes('read') ||
      originalToolName.includes('list') ||
      originalToolName.includes('get')
    ) {
      return autoApprove.includes('read')
    }
    if (
      originalToolName.includes('write') ||
      originalToolName.includes('create') ||
      originalToolName.includes('update') ||
      originalToolName.includes('delete')
    ) {
      return autoApprove.includes('write')
    }
    return true
  }

  async callTool(toolCall: MCPToolCall): Promise<MCPToolResponse> {
    try {
      const finalName = toolCall.function.name
      const argsString = toolCall.function.arguments

      // Ensure definitions and map are loaded/cached
      await this.getAllToolDefinitions()

      if (!this.toolNameToTargetMap) {
        console.error('Tool target map is not available.')
        return {
          toolCallId: toolCall.id,
          content: `Error: Internal error - tool information not available.`,
          isError: true
        }
      }

      const targetInfo = this.toolNameToTargetMap.get(finalName)

      if (!targetInfo) {
        console.error(`Tool '${finalName}' not found in the target map.`)
        return {
          toolCallId: toolCall.id,
          content: `Error: Tool '${finalName}' not found or server not running.`,
          isError: true
        }
      }

      const { client: targetClient, originalName } = targetInfo
      const toolServerName = targetClient.serverName

      // Log the call details including original name
      console.info('[MCP] ToolManager calling tool', {
        requestedName: finalName,
        originalName: originalName,
        serverName: toolServerName,
        rawArguments: argsString
      })

      // Parse arguments
      let args: Record<string, unknown> | null = null
      try {
        args = JSON.parse(argsString)
      } catch (error: unknown) {
        console.warn(
          'Error parsing tool call arguments with JSON.parse, trying jsonrepair:',
          error instanceof Error ? error.message : String(error)
        )
        try {
          args = JSON.parse(jsonrepair(argsString))
        } catch (e: unknown) {
          console.error('Error parsing tool call arguments even after jsonrepair:', argsString, e)
          // Decide how to handle: return error or proceed with empty args?
          // Let's proceed with empty args for now, mirroring previous behavior.
          args = {}
        }
      }

      // Get server configuration
      const servers = await this.configPresenter.getMcpServers()
      const serverConfig = servers[toolServerName]
      if (!serverConfig) {
        console.error(`Configuration for server '${toolServerName}' not found.`)
        return {
          toolCallId: toolCall.id,
          content: `Error: Configuration missing for server '${toolServerName}'.`,
          isError: true
        }
      }
      const autoApprove = serverConfig?.autoApprove || []
      console.log(
        `Checking permissions for tool '${originalName}' on server '${toolServerName}' with autoApprove:`,
        autoApprove
      )
      // Use originalName and toolServerName for permission check
      const hasPermission = this.checkToolPermission(originalName, toolServerName, autoApprove)

      if (!hasPermission) {
        console.warn(`Permission denied for tool '${originalName}' on server '${toolServerName}'.`)
        return {
          toolCallId: toolCall.id,
          content: `Error: Operation not permitted. The '${originalName}' operation on server '${toolServerName}' requires appropriate permissions.`,
          isError: true // Indicate error
        }
      }

      // Call the tool on the target client using the ORIGINAL name
      const result = await targetClient.callTool(originalName, args || {})

      // Format response
      let formattedContent: string | MCPContentItem[] = ''
      if (typeof result.content === 'string') {
        formattedContent = result.content
      } else if (Array.isArray(result.content)) {
        formattedContent = result.content.map((item): MCPContentItem => {
          if (typeof item === 'string') {
            return { type: 'text', text: item } as MCPTextContent
          }
          if (item.type === 'text' || item.type === 'image' || item.type === 'resource') {
            return item as MCPContentItem
          }
          if (item.type && item.text) {
            return { type: 'text', text: item.text } as MCPTextContent
          }
          return { type: 'text', text: JSON.stringify(item) } as MCPTextContent
        })
      } else if (result.content) {
        formattedContent = JSON.stringify(result.content)
      }

      const response: MCPToolResponse = {
        toolCallId: toolCall.id,
        content: formattedContent,
        isError: result.isError
      }

      // Trigger event
      eventBus.send(MCP_EVENTS.TOOL_CALL_RESULT, SendTarget.ALL_WINDOWS, response)

      return response
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Unhandled error during tool call:', error)
      return {
        toolCallId: toolCall.id,
        content: `Error: Failed to execute tool '${toolCall.function.name}': ${errorMessage}`,
        isError: true
      }
    }
  }

  // 根据客户端名称获取提示模板内容
  async getPromptByClient(
    clientName: string,
    promptName: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    try {
      const clients = await this.getRunningClients()

      // 查找指定的客户端
      const client = clients.find((c) => c.serverName === clientName)
      if (!client) {
        throw new Error(`未找到MCP客户端: ${clientName}`)
      }

      if (typeof client.getPrompt !== 'function') {
        throw new Error(`MCP客户端 ${clientName} 不支持获取提示模板`)
      }

      return await client.getPrompt(promptName, params)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Failed to get prompt template:', errorMessage)
      throw new Error(`获取提示模板失败: ${errorMessage}`)
    }
  }

  // 根据客户端名称读取资源内容
  async readResourceByClient(clientName: string, resourceUri: string): Promise<Resource> {
    try {
      const clients = await this.getRunningClients()

      // 查找指定的客户端
      const client = clients.find((c) => c.serverName === clientName)
      if (!client) {
        throw new Error(`未找到MCP客户端: ${clientName}`)
      }

      if (typeof client.readResource !== 'function') {
        throw new Error(`MCP客户端 ${clientName} 不支持读取资源`)
      }

      return await client.readResource(resourceUri)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Failed to read resource:', errorMessage)
      throw new Error(`读取资源失败: ${errorMessage}`)
    }
  }

  public destroy(): void {
    eventBus.off(MCP_EVENTS.CLIENT_LIST_UPDATED, this.handleServerListUpdate)
  }
}
