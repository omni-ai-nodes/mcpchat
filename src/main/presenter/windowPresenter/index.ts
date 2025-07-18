// src\main\presenter\windowPresenter\index.ts
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { presenter } from '@/presenter'
import { eventBus } from '@/eventbus'
import { WINDOW_EVENTS } from '@/events'
import { IWindowPresenter, ChatMessage } from '@shared/presenter'
import { DatabaseConfig } from '../databasePresenter'
import { join } from 'path'
import icon from '../../../../resources/icon.png?asset' // 应用图标 (macOS/Linux)
import iconWin from '../../../../resources/icon.ico?asset' // 应用图标 (Windows)
import { is } from '@electron-toolkit/utils' // Electron 工具库
import { ConfigPresenter } from '../configPresenter' // 配置 Presenter
import { CONFIG_EVENTS, SYSTEM_EVENTS } from '@/events' // 系统/窗口/配置 事件常量
import windowStateManager from 'electron-window-state' // 窗口状态管理器
import { SHORTCUT_EVENTS } from '@/events' // 快捷键事件常量

// 节点执行结果接口
interface NodeResult {
  output: string
  [key: string]: unknown
}

// 工作流执行函数
async function executeWorkflow(workflowData: WorkflowData) {
  const executionId = `exec_${Date.now()}`
  const startTime = new Date().toISOString()

  try {
    // 按拓扑顺序执行节点
    const executionOrder = getExecutionOrder(workflowData)
    const nodeResults = new Map<string, NodeResult>()

    for (const nodeId of executionOrder) {
      const node = workflowData.nodes.find((n) => n.id === nodeId)
      if (!node) continue

      console.log(`执行节点: ${node.name} (${node.type})`)

      // 获取输入数据
      const inputData = getNodeInputData(node, workflowData.connections, nodeResults)

      // 执行节点
      let result: NodeResult
      switch (node.type) {
        case 'text-input':
          result = await executeTextInputNode(node)
          break
        case 'file-input':
          result = await executeFileInputNode(node)
          break
        case 'model-service':
          result = await executeModelServiceNode(node, inputData)
          break
        case 'mcp-service':
          result = await executeMcpNode(node, inputData)
          break
        case 'api-input':
          result = await executeApiInputNode(node, inputData)
          break
        case 'database-input':
          result = await executeDatabaseInputNode(node)
          break
        case 'text-output':
          result = await executeTextOutputNode(node, inputData)
          break
        case 'nodejs-code':
          result = await executeNodejsCodeNode(node, inputData)
          break
        default:
          result = { output: (inputData.input as string) || '' }
      }

      nodeResults.set(nodeId, result)
      console.log(`节点 ${node.name} 执行完成:`, result)
    }

    return {
      success: true,
      executionId,
      startTime,
      endTime: new Date().toISOString(),
      status: 'completed',
      results: {
        processedNodes: executionOrder.length,
        processedConnections: workflowData.connections?.length || 0,
        nodeResults: Object.fromEntries(nodeResults)
      }
    }
  } catch (error) {
    console.error('工作流执行失败:', error)
    return {
      success: false,
      executionId,
      startTime,
      endTime: new Date().toISOString(),
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// 获取节点执行顺序（简单的拓扑排序）
function getExecutionOrder(workflowData: WorkflowData): string[] {
  const nodes = workflowData.nodes
  const connections = workflowData.connections || []
  const visited = new Set<string>()
  const order: string[] = []

  // 如果没有连接，返回空数组（不执行任何节点）
  if (connections.length === 0) {
    console.log('工作流中没有连接线，跳过执行')
    return []
  }

  // 构建邻接表（双向图）
  const adjacencyList = new Map<string, Set<string>>()
  nodes.forEach((node) => adjacencyList.set(node.id, new Set()))

  // 构建依赖图（用于拓扑排序）
  const dependencies = new Map<string, string[]>()
  nodes.forEach((node) => dependencies.set(node.id, []))

  connections.forEach((conn) => {
    // 添加到邻接表（双向）
    adjacencyList.get(conn.sourceNodeId)?.add(conn.targetNodeId)
    adjacencyList.get(conn.targetNodeId)?.add(conn.sourceNodeId)

    // 添加到依赖图（单向）
    const deps = dependencies.get(conn.targetNodeId) || []
    deps.push(conn.sourceNodeId)
    dependencies.set(conn.targetNodeId, deps)
  })

  // 找到所有连通组件
  const visitedForComponents = new Set<string>()
  const connectedComponents: string[][] = []

  function dfsComponent(nodeId: string, component: string[]) {
    if (visitedForComponents.has(nodeId)) return
    visitedForComponents.add(nodeId)
    component.push(nodeId)

    const neighbors = adjacencyList.get(nodeId) || new Set()
    neighbors.forEach((neighborId) => {
      if (nodes.find((n) => n.id === neighborId)) {
        dfsComponent(neighborId, component)
      }
    })
  }

  // 找到所有参与连接的节点
  const connectedNodes = new Set<string>()
  connections.forEach((conn) => {
    connectedNodes.add(conn.sourceNodeId)
    connectedNodes.add(conn.targetNodeId)
  })

  // 为每个连通组件进行DFS
  connectedNodes.forEach((nodeId) => {
    if (!visitedForComponents.has(nodeId) && nodes.find((n) => n.id === nodeId)) {
      const component: string[] = []
      dfsComponent(nodeId, component)
      if (component.length > 0) {
        connectedComponents.push(component)
      }
    }
  })

  // 如果有多个连通组件，只执行最大的那个
  if (connectedComponents.length === 0) {
    console.log('没有找到连通的节点组，跳过执行')
    return []
  }

  // 选择最大的连通组件
  const largestComponent = connectedComponents.reduce((largest, current) =>
    current.length > largest.length ? current : largest
  )

  console.log(
    `找到 ${connectedComponents.length} 个连通组件，执行最大的组件（${largestComponent.length} 个节点）`
  )

  // 对选中的连通组件进行拓扑排序
  const componentNodes = new Set(largestComponent)

  // DFS访问（拓扑排序）
  function visit(nodeId: string) {
    if (visited.has(nodeId) || !componentNodes.has(nodeId)) return
    visited.add(nodeId)

    const deps = dependencies.get(nodeId) || []
    deps.forEach((depId) => {
      if (componentNodes.has(depId)) {
        visit(depId)
      }
    })

    order.push(nodeId)
  }

  // 只访问选中连通组件中的节点
  largestComponent.forEach((nodeId) => {
    if (nodes.find((n) => n.id === nodeId)) {
      visit(nodeId)
    }
  })

  console.log(
    `工作流执行顺序: ${order.map((id) => nodes.find((n) => n.id === id)?.name || id).join(' -> ')}`
  )
  return order
}

// 获取节点输入数据
function getNodeInputData(
  node: WorkflowNode,
  connections: WorkflowConnection[],
  nodeResults: Map<string, NodeResult>
) {
  const inputData: Record<string, unknown> = {}

  // 查找连接到此节点的输入
  const inputConnections = connections.filter((conn) => conn.targetNodeId === node.id)

  inputConnections.forEach((conn) => {
    const sourceResult = nodeResults.get(conn.sourceNodeId)
    if (sourceResult && sourceResult.output !== undefined) {
      // 根据目标输入端口类型存储数据
      if (conn.targetInput === 'text-input') {
        inputData.textInput = sourceResult.output
      } else if (conn.targetInput === 'file-input') {
        inputData.fileInput = sourceResult.output
      } else {
        // 兼容旧的单一输入方式
        inputData[conn.targetInput] = sourceResult.output
      }
    }
  })

  return inputData
}

// 执行文本输入节点
async function executeTextInputNode(node: WorkflowNode): Promise<NodeResult> {
  const config = node.config || {}
  return {
    output:
      (config.textContent as string) || (config.text as string) || (config.content as string) || ''
  }
}

// 执行文件输入节点
async function executeFileInputNode(node: WorkflowNode): Promise<NodeResult> {
  const config = node.config || {}

  let imageData = (config.imageData as string) || ''
  const filePath = (config.filePath as string) || ''

  // 如果有文件路径且是图片文件，使用FilePresenter进行优化处理
  if (filePath && config.fileType && (config.fileType as string).startsWith('image/')) {
    try {
      // 获取FilePresenter实例
      const { presenter } = await import('@/presenter')
      const filePresenter = presenter.filePresenter

      if (filePresenter) {
        console.log(`使用FilePresenter优化处理图片: ${config.fileName}`)

        // 使用prepareFile方法处理图片，这会自动压缩和优化
        const preparedFile = await filePresenter.prepareFile(filePath, config.fileType as string)

        if (preparedFile && preparedFile.content) {
          imageData = preparedFile.content
          console.log(`图片已通过FilePresenter优化处理: ${config.fileName}`)
        }
      }
    } catch (error) {
      console.warn(`FilePresenter处理图片失败，使用原始数据: ${error}`)
      // 如果FilePresenter处理失败，继续使用原始的图片大小检查逻辑
      if (imageData && imageData.startsWith('data:image/')) {
        const imageSizeInBytes = Math.ceil(imageData.length * 0.75)
        const maxImageSize = 1 * 1024 * 1024 // 1MB限制

        if (imageSizeInBytes > maxImageSize) {
          console.warn(
            `文件输入节点 "${node.name}" 中的图片过大 (${Math.round(imageSizeInBytes / 1024 / 1024)}MB)，已清除图片数据`
          )
          imageData = ''
        }
      }
    }
  } else if (imageData && imageData.startsWith('data:image/')) {
    // 如果没有文件路径但有图片数据，进行大小检查
    const imageSizeInBytes = Math.ceil(imageData.length * 0.75)
    const maxImageSize = 1 * 1024 * 1024 // 1MB限制

    if (imageSizeInBytes > maxImageSize) {
      console.warn(
        `文件输入节点 "${node.name}" 中的图片过大 (${Math.round(imageSizeInBytes / 1024 / 1024)}MB)，已清除图片数据`
      )
      imageData = ''
    }
  }

  // 返回文件信息，包括路径、类型、内容等
  const fileInfo = {
    fileName: (config.fileName as string) || '',
    filePath: filePath,
    fileType: (config.fileType as string) || '',
    fileSize: (config.fileSize as number) || 0,
    imageData: imageData,
    fileContent: (config.fileContent as string) || ''
  }

  return {
    output: JSON.stringify(fileInfo)
  }
}

// 执行模型服务节点
async function executeModelServiceNode(
  node: WorkflowNode,
  inputData: Record<string, unknown>
): Promise<NodeResult> {
  const config = node.config || {}

  // 获取文本输入和文件输入
  const textInput = (inputData.textInput as string) || (inputData.input as string) || ''
  const fileInput = (inputData.fileInput as string) || ''

  // 解析文件输入（如果有）
  let fileInfo: {
    fileName?: string
    filePath?: string
    fileType?: string
    fileSize?: number
    imageData?: string
    fileContent?: string
  } | null = null
  if (fileInput) {
    try {
      fileInfo = JSON.parse(fileInput)
    } catch (error) {
      console.warn('解析文件输入失败:', error)
    }
  }

  // 检查是否有任何输入
  if (!textInput.trim() && !fileInfo) {
    throw new Error(`模型服务节点 "${node.name}" 没有接收到任何输入（文本或文件）`)
  }

  try {
    // 获取presenter实例
    const { presenter } = await import('@/presenter')
    const llmproviderPresenter = presenter.llmproviderPresenter
    const configPresenter = presenter.configPresenter

    if (!llmproviderPresenter || !configPresenter) {
      throw new Error('必要的服务未初始化')
    }

    console.log(
      `模型服务节点处理输入 - 文本: ${textInput.substring(0, 100)}${textInput.length > 100 ? '...' : ''}, 文件: ${fileInfo ? fileInfo.fileName || '未知文件' : '无'}`
    )

    // 获取节点配置的模型信息
    const selectedProviderId =
      (config.selectedProviderId as string) || (config.selectedProvider as string)
    const selectedModelId = (config.selectedModelId as string) || (config.selectedModel as string)
    const selectedPromptId = config.selectedPromptId as string

    // 获取当前LLM配置，优先使用节点配置的模型
    let currentProvider = selectedProviderId
      ? llmproviderPresenter.getProviders().find((p) => p.id === selectedProviderId)
      : llmproviderPresenter.getCurrentProvider()

    if (!currentProvider) {
      const availableProviders = llmproviderPresenter.getProviders().filter((p) => p.enable)
      if (availableProviders.length === 0) {
        throw new Error('没有可用的LLM提供者，请先配置并启用至少一个LLM提供者')
      }
      currentProvider = availableProviders[0]
      console.log(`自动选择LLM提供者: ${currentProvider.name}`)
    }

    // 获取模型列表
    const models = await llmproviderPresenter.getModelList(currentProvider.id)
    if (!models || models.length === 0) {
      throw new Error('未找到可用的模型')
    }

    // 选择模型
    let modelId = selectedModelId
    if (!modelId || !models.find((m) => m.id === modelId)) {
      modelId = models[0].id // 使用第一个可用模型
      console.log(`使用默认模型: ${modelId}`)
    } else {
      console.log(`使用配置的模型: ${modelId}`)
    }

    // 构建消息内容
    let messageContent = textInput

    // 如果有文件输入，添加文件信息到消息中
    if (fileInfo) {
      if (fileInfo.fileName) {
        messageContent += `\n\n[文件: ${fileInfo.fileName}]`
      }
      if (fileInfo.fileContent) {
        messageContent += `\n文件内容:\n${fileInfo.fileContent}`
      }
    }

    // 如果配置了prompt，则应用prompt
    if (selectedPromptId) {
      try {
        // 通过configPresenter获取prompt内容
        const prompts = await configPresenter.getCustomPrompts()
        const selectedPrompt = prompts.find((p) => p.id === selectedPromptId)

        if (selectedPrompt && selectedPrompt.content) {
          // 将prompt内容与输入文本结合
          messageContent = `${selectedPrompt.content}\n\n用户输入: ${messageContent}`
          console.log(`应用了prompt: ${selectedPrompt.name}`)
        } else {
          console.warn(`未找到指定的prompt: ${selectedPromptId}`)
        }
      } catch (error) {
        console.warn('获取prompt失败，使用原始输入:', error)
      }
    }

    // 构建消息 - 支持多模态输入
    const messages: Array<{
      role: 'user' | 'system' | 'assistant'
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
    }> = []

    if (fileInfo && fileInfo.imageData && fileInfo.imageData.startsWith('data:image/')) {
      let processedImageData = fileInfo.imageData

      // 如果有文件路径且是图片文件，尝试使用FilePresenter进行优化处理
      if (fileInfo.filePath && fileInfo.fileType && fileInfo.fileType.startsWith('image/')) {
        try {
          // 获取FilePresenter实例
          const { presenter } = await import('@/presenter')
          const filePresenter = presenter.filePresenter

          if (filePresenter) {
            console.log(`使用FilePresenter优化处理图片: ${fileInfo.fileName}`)

            // 使用prepareFile方法处理图片，这会自动压缩和优化
            const preparedFile = await filePresenter.prepareFile(
              fileInfo.filePath,
              fileInfo.fileType
            )

            if (preparedFile && preparedFile.content) {
              processedImageData = preparedFile.content
              console.log(`图片已通过FilePresenter优化处理: ${fileInfo.fileName}`)
            }
          }
        } catch (error) {
          console.warn(`FilePresenter处理图片失败，使用原始数据: ${error}`)
        }
      }

      // 检查处理后的图片大小
      const imageSizeInBytes = Math.ceil(processedImageData.length * 0.75) // base64编码大约增加33%大小
      const maxImageSize = 1 * 1024 * 1024 // 1MB限制

      if (imageSizeInBytes > maxImageSize) {
        console.warn(
          `图片过大 (${Math.round(imageSizeInBytes / 1024 / 1024)}MB)，跳过图片处理，仅发送文本内容`
        )
        // 仅发送文本消息，并提示图片过大
        const textWithWarning = `${messageContent}\n\n[注意：图片文件过大 (${Math.round(imageSizeInBytes / 1024 / 1024)}MB)，已跳过图片处理。建议使用较小的图片文件。]`
        messages.push({
          role: 'user' as const,
          content: textWithWarning
        })
      } else {
        // 如果图片大小合适，构建多模态消息
        messages.push({
          role: 'user' as const,
          content: [
            {
              type: 'text',
              text: messageContent || '请分析这张图片'
            },
            {
              type: 'image_url',
              image_url: {
                url: processedImageData
              }
            }
          ]
        })
      }
    } else {
      // 纯文本消息
      messages.push({
        role: 'user' as const,
        content: messageContent
      })
    }

    console.log(`调用模型 ${modelId} 处理消息`)

    // 调用模型 - 使用 generateCompletionStandalone 支持多模态消息
    const outputText = await llmproviderPresenter.generateCompletionStandalone(
      currentProvider.id,
      messages as ChatMessage[],
      modelId
    )

    if (!outputText || !outputText.trim()) {
      throw new Error('模型返回了空响应')
    }
    console.log(`模型响应: ${outputText.substring(0, 100)}${outputText.length > 100 ? '...' : ''}`)

    return {
      output: outputText
    }
  } catch (error) {
    console.error(`模型服务节点执行失败:`, error)
    throw new Error(
      `模型服务节点 "${node.name}" 执行失败: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// 执行MCP节点
async function executeMcpNode(
  node: WorkflowNode,
  inputData: Record<string, unknown>
): Promise<NodeResult> {
  // 获取文本输入和文件输入
  const textInput = (inputData.textInput as string) || (inputData.input as string) || ''
  const fileInput = (inputData.fileInput as string) || ''

  // 解析文件输入（如果有）
  let fileInfo: {
    fileName?: string
    filePath?: string
    fileType?: string
    fileSize?: number
    imageData?: string
    fileContent?: string
  } | null = null
  if (fileInput) {
    try {
      fileInfo = JSON.parse(fileInput)
    } catch (error) {
      console.warn('解析文件输入失败:', error)
    }
  }

  // 检查是否有任何输入
  if (!textInput.trim() && !fileInfo) {
    throw new Error(`MCP节点 "${node.name}" 没有接收到任何输入（文本或文件）`)
  }

  // 如果有图片文件，使用FilePresenter进行优化处理
  if (
    fileInfo &&
    fileInfo.imageData &&
    fileInfo.imageData.startsWith('data:image/') &&
    fileInfo.filePath &&
    fileInfo.fileType &&
    fileInfo.fileType.startsWith('image/')
  ) {
    try {
      // 获取FilePresenter实例
      const { presenter } = await import('@/presenter')
      const filePresenter = presenter.filePresenter

      if (filePresenter) {
        console.log(`MCP节点使用FilePresenter优化处理图片: ${fileInfo.fileName}`)

        // 使用prepareFile方法处理图片，这会自动压缩和优化
        const preparedFile = await filePresenter.prepareFile(fileInfo.filePath, fileInfo.fileType)

        if (preparedFile && preparedFile.content) {
          fileInfo.imageData = preparedFile.content
          console.log(`MCP节点图片已通过FilePresenter优化处理: ${fileInfo.fileName}`)
        }
      }
    } catch (error) {
      console.warn(`MCP节点FilePresenter处理图片失败，使用原始数据: ${error}`)
    }
  }

  // 构建完整的输入内容
  let fullInput = textInput
  if (fileInfo) {
    if (fileInfo.fileName) {
      fullInput += `\n\n[文件: ${fileInfo.fileName}]`
    }
    if (fileInfo.fileContent) {
      fullInput += `\n文件内容:\n${fileInfo.fileContent}`
    }
  }

  try {
    // 获取presenter实例
    const { presenter } = await import('@/presenter')
    const mcpPresenter = presenter.mcpPresenter
    const llmproviderPresenter = presenter.llmproviderPresenter
    const configPresenter = presenter.configPresenter

    if (!mcpPresenter || !llmproviderPresenter || !configPresenter) {
      throw new Error('必要的服务未初始化')
    }

    console.log(
      `MCP节点处理输入 - 文本: ${textInput.substring(0, 100)}${textInput.length > 100 ? '...' : ''}, 文件: ${fileInfo ? fileInfo.fileName || '未知文件' : '无'}`
    )

    // 获取当前LLM配置，如果没有当前提供者则自动选择第一个可用的
    let currentProvider = llmproviderPresenter.getCurrentProvider()
    if (!currentProvider) {
      const availableProviders = llmproviderPresenter.getProviders().filter((p) => p.enable)
      if (availableProviders.length === 0) {
        throw new Error('没有可用的LLM提供者，请先配置并启用至少一个LLM提供者')
      }
      currentProvider = availableProviders[0]
      console.log(`自动选择LLM提供者: ${currentProvider.name}`)
    }

    const models = await llmproviderPresenter.getModelList(currentProvider.id)
    if (!models || models.length === 0) {
      throw new Error('未找到可用的模型')
    }

    const modelId = models[0].id // 使用第一个可用模型

    // 检查MCP是否启用
    const mcpEnabled = await mcpPresenter.getMcpEnabled()
    if (!mcpEnabled) {
      console.log('MCP未启用，正在自动启用...')
      await mcpPresenter.setMcpEnabled(true)
    }

    // 获取所有可用的MCP工具
    let mcpTools = await mcpPresenter.getAllToolDefinitions()
    if (!mcpTools || mcpTools.length === 0) {
      // 检查是否有配置的MCP服务器
      const mcpServers = await mcpPresenter.getMcpServers()
      const enabledServers = Object.entries(mcpServers).filter(([, server]) => !server.disable)

      if (enabledServers.length === 0) {
        throw new Error('未找到可用的MCP工具：没有启用的MCP服务器，请先在设置中配置并启用MCP服务器')
      }

      // 尝试启动默认服务器
      console.log('未找到MCP工具，尝试启动默认服务器...')
      const defaultServers = await mcpPresenter.getMcpDefaultServers()
      const serversToStart = defaultServers.length > 0 ? defaultServers : [enabledServers[0][0]]

      for (const serverName of serversToStart) {
        if (enabledServers.find(([name]) => name === serverName)) {
          try {
            console.log(`正在启动MCP服务器: ${serverName}`)
            await mcpPresenter.startServer(serverName)
            console.log(`MCP服务器启动成功: ${serverName}`)
          } catch (error) {
            console.warn(`启动MCP服务器失败: ${serverName}`, error)
          }
        }
      }

      // 等待一段时间让服务器完全启动
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // 重新获取工具
      mcpTools = await mcpPresenter.getAllToolDefinitions()
      if (!mcpTools || mcpTools.length === 0) {
        throw new Error(
          '未找到可用的MCP工具：已尝试启动服务器但仍无法获取工具，请检查服务器配置和状态'
        )
      }
    }

    console.log(`找到 ${mcpTools.length} 个MCP工具`)

    // 构建消息
    const messages = [
      {
        role: 'system' as const,
        content:
          '你是一个智能助手，可以使用各种工具来帮助用户。请根据用户的输入选择合适的工具并调用它们。'
      },
      {
        role: 'user' as const,
        content: fullInput
      }
    ]

    // 生成唯一的事件ID
    const eventId = `workflow_${node.id}_${Date.now()}`

    // 启动流式生成
    const stream = llmproviderPresenter.startStreamCompletion(
      currentProvider.id,
      messages,
      modelId,
      eventId,
      0.7, // temperature
      4096 // maxTokens
    )

    let finalContent = ''
    const toolCallResults: string[] = []

    // 处理流式响应
    for await (const event of stream) {
      if (event.type === 'response') {
        const data = event.data

        // 收集文本内容
        if (data.content) {
          finalContent += data.content
        }

        // 处理工具调用结果
        if (data.tool_call === 'end' && data.tool_call_response) {
          const response =
            typeof data.tool_call_response === 'string'
              ? data.tool_call_response
              : JSON.stringify(data.tool_call_response)
          toolCallResults.push(response)
          console.log(`工具调用完成: ${data.tool_call_name}, 结果: ${response}`)
        }
      } else if (event.type === 'error') {
        throw new Error(`LLM生成错误: ${event.data.error}`)
      } else if (event.type === 'end') {
        console.log('LLM生成完成')
        break
      }
    }

    // 组合最终输出
    let output = finalContent
    if (toolCallResults.length > 0) {
      output += '\n\n工具调用结果:\n' + toolCallResults.join('\n')
    }

    console.log(`MCP节点执行完成，输出: ${output}`)

    return {
      output: output || fullInput
    }
  } catch (error) {
    console.error(`MCP节点执行失败:`, error)
    throw new Error(
      `MCP节点 "${node.name}" 执行失败: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// 执行文本输出节点
async function executeApiInputNode(
  node: WorkflowNode,
  inputData: Record<string, unknown>
): Promise<NodeResult> {
  const config = node.config || {}
  const apiUrl = config.apiUrl as string
  const method = (config.method as string) || 'GET'
  const jsonParams = (config.jsonParams as string) || ''

  if (!apiUrl) {
    throw new Error(`API输入节点 "${node.name}" 缺少API URL配置`)
  }

  console.log(
    `执行API输入节点: ${node.name || node.id}, URL: ${apiUrl}, Method: ${method}`,
    inputData
  )

  try {
    const requestOptions: RequestInit = {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    // 如果是POST或PUT请求且有JSON参数，添加到请求体
    if ((method === 'POST' || method === 'PUT') && jsonParams.trim()) {
      try {
        JSON.parse(jsonParams) // 验证JSON格式
        requestOptions.body = jsonParams
      } catch {
        throw new Error('JSON参数格式错误')
      }
    }

    const response = await fetch(apiUrl, requestOptions)
    const responseText = await response.text()

    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = responseText
    }

    if (!response.ok) {
      throw new Error(`API请求失败 (${response.status}): ${responseText}`)
    }

    console.log(`API输入节点 "${node.name}" 执行成功，状态码: ${response.status}`)

    // 返回API响应数据
    return {
      output: typeof responseData === 'string' ? responseData : JSON.stringify(responseData)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    console.error(`API输入节点 "${node.name}" 执行失败:`, errorMessage)
    throw new Error(`API输入节点 "${node.name}" 执行失败: ${errorMessage}`)
  }
}

async function executeTextOutputNode(
  node: WorkflowNode,
  inputData: Record<string, unknown>
): Promise<NodeResult> {
  console.log(`执行文本输出节点: ${node.name || node.id}`)
  return {
    output: (inputData.input as string) || ''
  }
}

// 执行 Node.js 代码节点
async function executeNodejsCodeNode(
  node: WorkflowNode,
  inputData: Record<string, unknown>
): Promise<NodeResult> {
  const config = node.config || {}
  const code = (config.code as string) || ''

  console.log(`执行Node.js代码节点: ${node.name || node.id}`)
  console.log('节点配置:', JSON.stringify(config, null, 2))
  console.log('代码内容:', code)

  if (!code.trim()) {
    throw new Error(`Node.js代码节点 "${node.name}" 没有代码内容`)
  }

  try {
    // 获取输入数据
    const textInput = (inputData.textInput as string) || (inputData.input as string) || ''
    const fileInput = (inputData.fileInput as string) || ''

    // 解析文件输入（如果有）
    let fileInfo: {
      fileName?: string
      filePath?: string
      fileType?: string
      fileSize?: number
      imageData?: string
      fileContent?: string
    } | null = null
    if (fileInput) {
      try {
        fileInfo = JSON.parse(fileInput)
      } catch (error) {
        console.warn('解析文件输入失败:', error)
      }
    }

    // 构建输入对象
    const input = {
      text: textInput,
      file: fileInfo,
      data: inputData
    }

    // 创建安全的执行环境
    const vm = await import('vm')
    const { Buffer } = await import('buffer')
    const context = {
      input,
      console: {
        log: (...args: unknown[]) => console.log('[Node.js代码]', ...args),
        error: (...args: unknown[]) => console.error('[Node.js代码]', ...args),
        warn: (...args: unknown[]) => console.warn('[Node.js代码]', ...args)
      },
      JSON,
      Math,
      Date,
      String,
      Number,
      Boolean,
      Array,
      Object,
      RegExp,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      Buffer
    }

    // 包装代码以捕获返回值
    const wrappedCode = `
      (function() {
        ${code}
      })()
    `

    // 执行代码
    const result = vm.runInNewContext(wrappedCode, context, {
      timeout: 30000, // 30秒超时
      displayErrors: true
    })

    // 处理返回值
    let output = ''
    if (result !== undefined && result !== null) {
      if (typeof result === 'string') {
        output = result
      } else {
        output = JSON.stringify(result, null, 2)
      }
    }

    console.log(`Node.js代码节点 ${node.name} 执行成功`)

    return {
      output,
      result
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Node.js代码节点 ${node.name} 执行失败:`, errorMessage)
    throw new Error(`Node.js代码执行失败: ${errorMessage}`)
  }
}

// 执行数据库输入节点
async function executeDatabaseInputNode(node: WorkflowNode): Promise<NodeResult> {
  const config = node.config || {}

  console.log(`执行数据库输入节点: ${node.name || node.id}`, config)

  // 构建数据库配置
  const dbType = (config.dbType as string) || 'mysql'
  const dbConfig = {
    dbType:
      dbType === 'mysql' || dbType === 'postgresql' ? dbType : ('mysql' as 'mysql' | 'postgresql'),
    host: config.host as string,
    port: config.port as number,
    database: config.database as string,
    username: config.username as string,
    password: config.password as string,
    sql: config.sql as string
  }

  // 验证必要参数
  if (!dbConfig.host || !dbConfig.port || !dbConfig.database || !dbConfig.username) {
    throw new Error(`数据库输入节点 "${node.name}" 缺少必要的数据库连接参数`)
  }

  if (!dbConfig.sql || !dbConfig.sql.trim()) {
    throw new Error(`数据库输入节点 "${node.name}" 缺少SQL查询语句`)
  }

  try {
    // 使用DatabasePresenter执行查询
    const databaseResult = await presenter.databasePresenter.testConnection(dbConfig)

    if (!databaseResult.success) {
      throw new Error(`数据库查询失败: ${databaseResult.message}`)
    }

    // 将查询结果转换为字符串输出
    let output = ''
    if (databaseResult.data) {
      if (Array.isArray(databaseResult.data)) {
        // 如果是数组，转换为JSON字符串
        output = JSON.stringify(databaseResult.data, null, 2)
      } else {
        // 如果是其他类型，也转换为JSON字符串
        output = JSON.stringify(databaseResult.data, null, 2)
      }
    }

    console.log(
      `数据库输入节点 ${node.name} 执行成功，返回 ${Array.isArray(databaseResult.data) ? databaseResult.data.length : 1} 条记录`
    )

    return {
      output,
      data: databaseResult.data
    }
  } catch (error) {
    console.error(`数据库输入节点 ${node.name} 执行失败:`, error)
    throw error
  }
}
// TrayPresenter 在 main/index.ts 中全局管理，本 Presenter 不负责其生命周期
import { TabPresenter } from '../tabPresenter' // TabPresenter 类型

// 工作流相关类型定义
interface WorkflowNode {
  id: string
  type: string
  name: string
  x: number
  y: number
  config: Record<string, unknown>
  inputs?: string[]
  outputs?: string[]
}

interface WorkflowConnection {
  id: string
  sourceNodeId: string
  targetNodeId: string
  sourceOutput: string
  targetInput: string
}

interface WorkflowData {
  name: string
  nodes: WorkflowNode[]
  connections: WorkflowConnection[]
  metadata?: Record<string, unknown>
  deploymentConfig?: Record<string, unknown>
}

/**
 * 窗口 Presenter，负责管理所有 BrowserWindow 实例及其生命周期。
 * 包括创建、销毁、最小化、最大化、隐藏、显示、焦点管理以及与标签页的交互。
 */
export class WindowPresenter implements IWindowPresenter {
  // 管理所有 BrowserWindow 实例的 Map，key 为窗口 ID
  windows: Map<number, BrowserWindow>
  private configPresenter: ConfigPresenter
  // 退出标志，表示应用是否正在关闭过程中 (由 'before-quit' 设置)
  private isQuitting: boolean = false
  // 当前获得焦点的窗口 ID (内部记录)
  private focusedWindowId: number | null = null

  constructor(configPresenter: ConfigPresenter) {
    this.windows = new Map()
    this.configPresenter = configPresenter

    // 注册 IPC 处理器，供 Renderer 调用以获取窗口和 WebContents ID
    ipcMain.on('get-window-id', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      event.returnValue = window ? window.id : null
    })

    ipcMain.on('get-web-contents-id', (event) => {
      event.returnValue = event.sender.id
    })

    // 保存上传的文件
    ipcMain.handle('save-uploaded-file', async (_event, fileName: string, fileData: string) => {
      if (!fileData) {
        console.error('文件数据为空')
        throw new Error('文件数据为空')
      }

      if (typeof fileData !== 'string') {
        console.error('文件数据类型错误，期望string，实际:', typeof fileData)
        throw new Error('文件数据类型错误')
      }

      // 检查文件大小（针对图片文件）
      if (fileData.startsWith('data:image/')) {
        const imageSizeInBytes = Math.ceil(fileData.length * 0.75) // base64编码大约增加33%大小
        const maxImageSize = 10 * 1024 * 1024 // 10MB限制

        if (imageSizeInBytes > maxImageSize) {
          const sizeMB = Math.round(imageSizeInBytes / 1024 / 1024)
          console.warn(`图片文件过大: ${sizeMB}MB，超过10MB限制`)
          throw new Error(`图片文件过大 (${sizeMB}MB)，请使用小于10MB的图片文件`)
        }
      }

      try {
        // 创建用户数据目录下的 APP/inputs 目录
        const userDataPath = app.getPath('userData')
        const inputsDir = path.join(userDataPath, 'APP', 'inputs')

        if (!fs.existsSync(inputsDir)) {
          fs.mkdirSync(inputsDir, { recursive: true })
        }

        // 生成唯一文件名（添加时间戳前缀）
        const timestamp = Date.now()
        const uniqueFileName = `${timestamp}_${fileName}`
        const filePath = path.join(inputsDir, uniqueFileName)

        // 解析 base64 数据并保存文件
        const base64Data = fileData.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        fs.writeFileSync(filePath, buffer)
        return { success: true, filePath, fileName: uniqueFileName }
      } catch (error) {
        console.error('保存文件失败:', error)
        throw error
      }
    })

    // 保存工作流
    ipcMain.handle('save-workflow', async (_event, workflowData: WorkflowData) => {
      try {
        const userDataPath = app.getPath('userData')
        const workflowsDir = path.join(userDataPath, 'McpWorkflow')

        if (!fs.existsSync(workflowsDir)) {
          fs.mkdirSync(workflowsDir, { recursive: true })
        }

        // 检查工作流名称
        if (!workflowData.name || workflowData.name.trim() === '') {
          return { success: false, error: 'MISSING_NAME', message: '请为工作流设置名称' }
        }

        // 生成工作流文件名
        const timestamp = Date.now()
        const workflowName = workflowData.name.trim()
        const fileName = `${workflowName}_${timestamp}.json`
        const filePath = path.join(workflowsDir, fileName)

        // 保存工作流数据
        const workflowContent = {
          ...workflowData,
          savedAt: new Date().toISOString(),
          version: '1.0'
        }

        fs.writeFileSync(filePath, JSON.stringify(workflowContent, null, 2), 'utf8')

        console.log('工作流已保存:', filePath)
        return { success: true, filePath, fileName }
      } catch (error) {
        console.error('保存工作流失败:', error)
        throw error
      }
    })

    // 更新工作流
    ipcMain.handle(
      'update-workflow',
      async (_event, filePath: string, workflowData: WorkflowData) => {
        try {
          // 检查文件是否存在
          if (!fs.existsSync(filePath)) {
            return { success: false, error: 'FILE_NOT_FOUND', message: '工作流文件不存在' }
          }

          // 检查工作流名称
          if (!workflowData.name || workflowData.name.trim() === '') {
            return { success: false, error: 'MISSING_NAME', message: '请为工作流设置名称' }
          }

          // 读取原有数据以保留创建时间等信息
          let originalData = {}
          try {
            const originalContent = fs.readFileSync(filePath, 'utf8')
            originalData = JSON.parse(originalContent)
          } catch (error) {
            console.warn('无法读取原有工作流数据，将创建新的:', error)
          }

          // 更新工作流数据
          const workflowContent = {
            ...originalData,
            ...workflowData,
            updatedAt: new Date().toISOString(),
            version: '1.0'
          }

          fs.writeFileSync(filePath, JSON.stringify(workflowContent, null, 2), 'utf8')

          const fileName = path.basename(filePath)
          console.log('工作流已更新:', filePath)
          return { success: true, filePath, fileName }
        } catch (error) {
          console.error('更新工作流失败:', error)
          throw error
        }
      }
    )

    // 获取已保存的工作流列表
    ipcMain.handle('get-workflows', async () => {
      try {
        const userDataPath = app.getPath('userData')
        const workflowsDir = path.join(userDataPath, 'McpWorkflow')

        if (!fs.existsSync(workflowsDir)) {
          return []
        }

        const files = fs.readdirSync(workflowsDir)
        const workflows = files
          .filter((file) => file.endsWith('.json'))
          .map((file) => {
            const filePath = path.join(workflowsDir, file)
            const content = fs.readFileSync(filePath, 'utf8')
            const workflowData = JSON.parse(content)
            return {
              fileName: file,
              filePath,
              ...workflowData
            }
          })
          .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())

        return workflows
      } catch (error) {
        console.error('获取工作流列表失败:', error)
        return []
      }
    })

    // 运行工作流
    ipcMain.handle('run-workflow', async (_event, workflowData: WorkflowData) => {
      try {
        console.log('开始运行工作流:', workflowData.name || '未命名工作流')

        // 验证工作流数据
        if (!workflowData.nodes || workflowData.nodes.length === 0) {
          throw new Error('工作流中没有节点')
        }

        // 验证MCP节点配置
        const mcpNodes = workflowData.nodes.filter((node) => node.type === 'mcp-service')
        for (const node of mcpNodes) {
          const config = node.config || {}
          const hasSelectedServer =
            config.selectedServerName ||
            (config.selectedServers &&
              Array.isArray(config.selectedServers) &&
              config.selectedServers.length > 0)

          if (!hasSelectedServer) {
            throw new Error(`MCP节点 "${node.name}" 未配置服务器`)
          }
        }

        // 执行工作流
        const executionResult = await executeWorkflow(workflowData)

        console.log('工作流执行完成:', executionResult)
        return executionResult
      } catch (error) {
        console.error('运行工作流失败:', error)
        throw error
      }
    })

    // 加载工作流
    ipcMain.handle('load-workflow', async (_event, filePath: string) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const workflowData = JSON.parse(content)
        console.log('工作流加载成功:', workflowData.name)
        return { success: true, workflowData }
      } catch (error) {
        console.error('加载工作流失败:', error)
        throw error
      }
    })

    // 部署工作流
    ipcMain.handle('deploy-workflow', async (_event, workflowData: WorkflowData) => {
      try {
        console.log('开始部署工作流:', workflowData.name || '未命名工作流')

        // 创建部署目录
        const userDataPath = app.getPath('userData')
        const deploymentsDir = path.join(userDataPath, 'APP', 'deployments')

        if (!fs.existsSync(deploymentsDir)) {
          fs.mkdirSync(deploymentsDir, { recursive: true })
        }

        // 生成部署配置
        const deploymentConfig = {
          ...workflowData,
          deployedAt: new Date().toISOString(),
          deploymentId: `deploy_${Date.now()}`,
          status: 'deployed',
          version: '1.0'
        }

        const deploymentFileName = `deployment_${deploymentConfig.deploymentId}.json`
        const deploymentPath = path.join(deploymentsDir, deploymentFileName)

        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentConfig, null, 2), 'utf8')

        console.log('工作流部署完成:', deploymentPath)
        return {
          success: true,
          deploymentId: deploymentConfig.deploymentId,
          deploymentPath,
          config: deploymentConfig
        }
      } catch (error) {
        console.error('部署工作流失败:', error)
        throw error
      }
    })

    // 获取已上传的文件列表
    ipcMain.handle('get-uploaded-files', async () => {
      try {
        const userDataPath = app.getPath('userData')
        const inputsDir = path.join(userDataPath, 'APP', 'inputs')

        console.log('检查上传文件目录:', inputsDir)

        if (!fs.existsSync(inputsDir)) {
          console.log('上传文件目录不存在')
          return []
        }

        const files = fs.readdirSync(inputsDir)
        console.log('目录中的所有文件:', files)

        const imageFiles = files.filter((file: string) => {
          const ext = path.extname(file).toLowerCase()
          return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext)
        })

        console.log('筛选出的图片文件:', imageFiles)

        return imageFiles.map((file: string) => {
          const filePath = path.join(inputsDir, file)
          const stats = fs.statSync(filePath)
          return {
            name: file,
            path: filePath,
            size: stats.size,
            modified: stats.mtime
          }
        })
      } catch (error) {
        console.error('Failed to get uploaded files:', error)
        return []
      }
    })

    // 读取已上传的文件
    ipcMain.handle('read-uploaded-file', async (_event, filePath: string) => {
      try {
        const fileBuffer = fs.readFileSync(filePath)
        const base64 = fileBuffer.toString('base64')
        const ext = path.extname(filePath).toLowerCase()
        const mimeType =
          ext === '.png'
            ? 'image/png'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.gif'
                ? 'image/gif'
                : ext === '.webp'
                  ? 'image/webp'
                  : 'image/png'
        return `data:${mimeType};base64,${base64}`
      } catch (error) {
        console.error('读取文件失败:', error)
        throw error
      }
    })

    // 获取LLM提供者列表
    ipcMain.handle('get-llm-providers', async () => {
      try {
        return await presenter.llmproviderPresenter.getProviders()
      } catch (error) {
        console.error('获取LLM提供者失败:', error)
        throw error
      }
    })

    // 获取指定提供者的模型列表
    ipcMain.handle('get-provider-models', async (_event, providerId: string) => {
      try {
        return await presenter.llmproviderPresenter.getModelList(providerId)
      } catch (error) {
        console.error('获取提供者模型失败:', error)
        throw error
      }
    })

    // 测试数据库连接
    ipcMain.handle('test-database-connection', async (_event, config: DatabaseConfig) => {
      try {
        return await presenter.databasePresenter.testConnection(config)
      } catch (error) {
        console.error('数据库连接测试失败:', error)
        throw error
      }
    })

    // 监听应用即将退出的事件，设置退出标志，避免窗口关闭时触发隐藏逻辑
    app.on('before-quit', () => {
      console.log('App is quitting, setting isQuitting flag.')
      this.isQuitting = true
    })

    // 监听快捷键事件：创建新窗口
    eventBus.on(SHORTCUT_EVENTS.CREATE_NEW_WINDOW, () => {
      console.log('Creating new shell window via shortcut.')
      this.createShellWindow({ initialTab: { url: 'local://chat' } })
    })

    // 监听快捷键事件：创建新标签页
    eventBus.on(SHORTCUT_EVENTS.CREATE_NEW_TAB, async (windowId: number) => {
      console.log(`Creating new tab via shortcut for window ${windowId}.`)
      const window = this.windows.get(windowId)
      if (window && !window.isDestroyed()) {
        await (presenter.tabPresenter as TabPresenter).createTab(windowId, 'local://chat', {
          active: true
        })
      } else {
        console.warn(
          `Cannot create new tab for window ${windowId}, window does not exist or is destroyed.`
        )
      }
    })

    // 监听快捷键事件：关闭当前标签页
    eventBus.on(SHORTCUT_EVENTS.CLOSE_CURRENT_TAB, async (windowId: number) => {
      console.log(`Received CLOSE_CURRENT_TAB for window ${windowId}.`)
      const window = this.windows.get(windowId)
      if (!window || window.isDestroyed()) {
        console.warn(
          `Cannot handle close tab request, window ${windowId} does not exist or is destroyed.`
        )
        return
      }

      const tabPresenterInstance = presenter.tabPresenter as TabPresenter
      const tabsData = await tabPresenterInstance.getWindowTabsData(windowId)
      const activeTab = tabsData.find((tab) => tab.isActive)

      if (activeTab) {
        if (tabsData.length === 1) {
          // 窗口内只有最后一个标签页
          const allWindows = this.getAllWindows()
          if (allWindows.length === 1) {
            // 是最后一个窗口的最后一个标签页，隐藏窗口
            console.log(`Window ${windowId} is the last window's last tab, hiding window.`)
            this.hide(windowId) // 调用 hide() 会触发 hide 逻辑
          } else {
            // 不是最后一个窗口的最后一个标签页，关闭窗口
            console.log(`Window ${windowId} has other windows, closing this window.`)
            this.close(windowId) // 调用 close() 会触发 'close' 事件处理器
          }
        } else {
          // 窗口内不止一个标签页，直接关闭当前标签页
          console.log(`Window ${windowId} has multiple tabs, closing active tab ${activeTab.id}.`)
          await tabPresenterInstance.closeTab(activeTab.id)
        }
      } else {
        console.warn(`No active tab found in window ${windowId} to close.`)
      }
    })

    // 监听系统主题更新事件，通知所有窗口 Renderer
    eventBus.on(SYSTEM_EVENTS.SYSTEM_THEME_UPDATED, (isDark: boolean) => {
      console.log('System theme updated, notifying all windows.')
      this.windows.forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send('system-theme-updated', isDark)
        } else {
          console.warn(`Skipping theme update for destroyed window ${window.id}.`)
        }
      })
    })

    // 监听强制退出应用事件 (例如：从菜单触发)，设置退出标志并调用 app.quit()
    eventBus.on(WINDOW_EVENTS.FORCE_QUIT_APP, () => {
      console.log('Force quitting application.')
      this.isQuitting = true // 设置退出标志
      app.quit() // 显式退出应用
    })

    // 监听内容保护设置变更事件，更新所有窗口并重启应用
    eventBus.on(CONFIG_EVENTS.CONTENT_PROTECTION_CHANGED, (enabled: boolean) => {
      console.log(`Content protection setting changed to ${enabled}, restarting application.`)
      this.windows.forEach((window) => {
        if (!window.isDestroyed()) {
          this.updateContentProtection(window, enabled)
        } else {
          console.warn(`Skipping content protection update for destroyed window ${window.id}.`)
        }
      })
      // 内容保护变更通常需要重启应用才能完全生效
      setTimeout(() => {
        presenter.devicePresenter.restartApp()
      }, 1000)
    })
  }

  /**
   * 获取当前主窗口 (优先返回焦点窗口，否则返回第一个有效窗口)。
   */
  get mainWindow(): BrowserWindow | undefined {
    const focused = this.getFocusedWindow()
    if (focused && !focused.isDestroyed()) {
      return focused
    }
    const allWindows = this.getAllWindows()
    return allWindows.length > 0 && !allWindows[0].isDestroyed() ? allWindows[0] : undefined
  }

  /**
   * 预览文件。macOS 使用 Quick Look，其他平台使用系统默认应用打开。
   * @param filePath 文件路径。
   */
  previewFile(filePath: string): void {
    const window = this.mainWindow
    if (window) {
      console.log(`Previewing file: ${filePath}`)
      if (process.platform === 'darwin') {
        window.previewFile(filePath)
      } else {
        shell.openPath(filePath) // 使用系统默认应用打开
      }
    } else {
      console.warn('Cannot preview file, no valid main window found.')
    }
  }

  /**
   * 最小化指定 ID 的窗口。
   * @param windowId 窗口 ID。
   */
  minimize(windowId: number): void {
    const window = this.windows.get(windowId)
    if (window && !window.isDestroyed()) {
      console.log(`Minimizing window ${windowId}.`)
      window.minimize()
    } else {
      console.warn(`Failed to minimize window ${windowId}, window does not exist or is destroyed.`)
    }
  }

  /**
   * 最大化/还原指定 ID 的窗口。
   * @param windowId 窗口 ID。
   */
  maximize(windowId: number): void {
    const window = this.windows.get(windowId)
    if (window && !window.isDestroyed()) {
      console.log(`Maximizing/unmaximizing window ${windowId}.`)
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
      // 触发恢复逻辑以确保活动标签页的 bounds 更新
      this.handleWindowRestore(windowId).catch((error) => {
        console.error(
          `Error handling restore logic after maximizing/unmaximizing window ${windowId}:`,
          error
        )
      })
    } else {
      console.warn(
        `Failed to maximize/unmaximize window ${windowId}, window does not exist or is destroyed.`
      )
    }
  }

  /**
   * 请求关闭指定 ID 的窗口。这将触发窗口的 'close' 事件。
   * 实际关闭或隐藏行为由 'close' 事件处理程序决定。
   * @param windowId 窗口 ID。
   */
  close(windowId: number): void {
    const window = this.windows.get(windowId)
    if (window && !window.isDestroyed()) {
      console.log(`Requesting to close window ${windowId}, calling window.close().`)
      window.close() // 触发 'close' 事件
    } else {
      console.warn(
        `Failed to request close for window ${windowId}, window does not exist or is destroyed.`
      )
    }
  }

  /**
   * 根据 IWindowPresenter 接口定义的关闭窗口方法。
   * 实际行为与 close(windowId) 相同，由 'close' 事件处理程序决定。
   * @param windowId 窗口 ID。
   * @param forceClose 是否强制关闭 (当前实现由 isQuitting 标志控制，此参数未直接使用)。
   */
  async closeWindow(windowId: number, forceClose: boolean = false): Promise<void> {
    console.log(`closeWindow(${windowId}, ${forceClose}) called.`)
    const window = this.windows.get(windowId)
    if (window && !window.isDestroyed()) {
      window.close() // 触发 'close' 事件
    } else {
      console.warn(
        `Failed to close window ${windowId} in closeWindow, window does not exist or is destroyed.`
      )
    }
    return Promise.resolve()
  }

  /**
   * 隐藏指定 ID 的窗口。在全屏模式下，会先退出全屏再隐藏。
   * @param windowId 窗口 ID。
   */
  hide(windowId: number): void {
    const window = this.windows.get(windowId)
    if (window && !window.isDestroyed()) {
      console.log(`Hiding window ${windowId}.`)
      // 处理全屏窗口隐藏时的黑屏问题
      if (window.isFullScreen()) {
        console.log(`Window ${windowId} is fullscreen, exiting fullscreen before hiding.`)
        // 退出全屏后监听 leave-full-screen 事件再隐藏
        window.once('leave-full-screen', () => {
          console.log(`Window ${windowId} left fullscreen, proceeding with hide.`)
          if (!window.isDestroyed()) {
            window.hide()
          } else {
            console.warn(`Window ${windowId} was destroyed after leaving fullscreen, cannot hide.`)
          }
        })
        window.setFullScreen(false) // 请求退出全屏
      } else {
        console.log(`Window ${windowId} is not fullscreen, hiding directly.`)
        window.hide() // 直接隐藏
      }
    } else {
      console.warn(`Failed to hide window ${windowId}, window does not exist or is destroyed.`)
    }
  }

  /**
   * 显示指定 ID 的窗口。如果未指定 ID，则显示焦点窗口或第一个窗口。
   * @param windowId 可选。要显示的窗口 ID。
   */
  show(windowId?: number): void {
    let targetWindow: BrowserWindow | undefined
    if (windowId === undefined) {
      // 未指定 ID，查找焦点窗口或第一个窗口
      targetWindow = this.getFocusedWindow() || this.getAllWindows()[0]
      if (targetWindow && !targetWindow.isDestroyed()) {
        console.log(`Showing default window ${targetWindow.id}.`)
      } else {
        console.warn('No window found to show.')
        return
      }
    } else {
      targetWindow = this.windows.get(windowId)
      if (targetWindow && !targetWindow.isDestroyed()) {
        console.log(`Showing window ${windowId}.`)
      } else {
        console.warn(`Failed to show window ${windowId}, window does not exist or is destroyed.`)
        return
      }
    }

    targetWindow.show()
    targetWindow.focus() // Bring to foreground
    // 触发恢复逻辑以确保活动标签页可见且位置正确
    this.handleWindowRestore(targetWindow.id).catch((error) => {
      console.error(`Error handling restore logic after showing window ${targetWindow!.id}:`, error)
    })
  }

  /**
   * 窗口恢复、显示或尺寸变更后的处理逻辑。
   * 主要确保当前活动标签页的 WebContentsView 可见且位置正确。
   * @param windowId 窗口 ID。
   */
  private async handleWindowRestore(windowId: number): Promise<void> {
    console.log(`Handling restore/show logic for window ${windowId}.`)
    const window = this.windows.get(windowId)
    if (!window || window.isDestroyed()) {
      console.warn(
        `Cannot handle restore/show logic for window ${windowId}, window does not exist or is destroyed.`
      )
      return
    }

    try {
      // 通过 TabPresenter 获取活动标签页 ID
      const tabPresenterInstance = presenter.tabPresenter as TabPresenter
      const activeTabId = await tabPresenterInstance.getActiveTabId(windowId)

      if (activeTabId) {
        console.log(`Window ${windowId} restored/shown: activating active tab ${activeTabId}.`)
        // 调用 switchTab 会确保视图被关联、可见并更新 bounds
        await tabPresenterInstance.switchTab(activeTabId)
      } else {
        console.warn(
          `Window ${windowId} restored/shown: no active tab found, ensuring all views are hidden.`
        )
        // 如果没有活动标签页，确保所有视图都隐藏
        const tabsInWindow = await tabPresenterInstance.getWindowTabsData(windowId)
        for (const tabData of tabsInWindow) {
          const tabView = await tabPresenterInstance.getTab(tabData.id)
          if (tabView && !tabView.webContents.isDestroyed()) {
            tabView.setVisible(false) // 显式隐藏所有标签页视图
          }
        }
      }
    } catch (error) {
      console.error(`Error handling restore/show logic for window ${windowId}:`, error)
    }
  }

  /**
   * 检查指定 ID 的窗口是否已最大化。
   * @param windowId 窗口 ID。
   * @returns 如果窗口存在、有效且已最大化，则返回 true，否则返回 false。
   */
  isMaximized(windowId: number): boolean {
    const window = this.windows.get(windowId)
    return window && !window.isDestroyed() ? window.isMaximized() : false
  }

  /**
   * 检查指定 ID 的窗口是否当前获得了焦点。
   * @param windowId 窗口 ID。
   * @returns 如果是焦点窗口，则返回 true，否则返回 false。
   */
  isMainWindowFocused(windowId: number): boolean {
    const focusedWindow = this.getFocusedWindow()
    return focusedWindow ? focusedWindow.id === windowId : false
  }

  /**
   * 向所有有效窗口的主 WebContents 和所有标签页的 WebContents 发送消息。
   * @param channel IPC 通道名。
   * @param args 消息参数。
   */
  async sendToAllWindows(channel: string, ...args: unknown[]): Promise<void> {
    // 遍历 Map 的值副本，避免迭代过程中 Map 被修改
    for (const window of Array.from(this.windows.values())) {
      if (!window.isDestroyed()) {
        // 向窗口主 WebContents 发送
        window.webContents.send(channel, ...args)

        // 向窗口内所有标签页的 WebContents 发送 (异步执行)
        try {
          const tabPresenterInstance = presenter.tabPresenter as TabPresenter
          const tabsData = await tabPresenterInstance.getWindowTabsData(window.id)
          if (tabsData && tabsData.length > 0) {
            for (const tabData of tabsData) {
              const tab = await tabPresenterInstance.getTab(tabData.id)
              if (tab && !tab.webContents.isDestroyed()) {
                tab.webContents.send(channel, ...args)
              }
            }
          }
        } catch (error) {
          console.error(`Error sending message "${channel}" to tabs of window ${window.id}:`, error)
        }
      } else {
        console.warn(`Skipping sending message "${channel}" to destroyed window ${window.id}.`)
      }
    }
  }

  /**
   * 向指定 ID 的窗口的主 WebContents 和其所有标签页的 WebContents 发送消息。
   * @param windowId 目标窗口 ID。
   * @param channel IPC 通道名。
   * @param args 消息参数。
   * @returns 如果消息已尝试发送，返回 true，否则返回 false。
   */
  sendToWindow(windowId: number, channel: string, ...args: unknown[]): boolean {
    console.log(`Sending message "${channel}" to window ${windowId}.`)
    const window = this.windows.get(windowId)
    if (window && !window.isDestroyed()) {
      // 向窗口主 WebContents 发送
      window.webContents.send(channel, ...args)

      // 向窗口内所有标签页的 WebContents 发送 (异步执行)
      const tabPresenterInstance = presenter.tabPresenter as TabPresenter
      tabPresenterInstance
        .getWindowTabsData(windowId)
        .then((tabsData) => {
          if (tabsData && tabsData.length > 0) {
            tabsData.forEach(async (tabData) => {
              const tab = await tabPresenterInstance.getTab(tabData.id)
              if (tab && !tab.webContents.isDestroyed()) {
                tab.webContents.send(channel, ...args)
              }
            })
          }
        })
        .catch((error) => {
          console.error(`Error sending message "${channel}" to tabs of window ${windowId}:`, error)
        })
      return true
    } else {
      console.warn(
        `Failed to send message "${channel}" to window ${windowId}, window does not exist or is destroyed.`
      )
    }
    return false
  }

  /**
   * 创建一个新的外壳窗口。
   * @param options 窗口配置选项，包括初始标签页或激活现有标签页。
   * @returns 创建的窗口 ID，如果创建失败则返回 null。
   */
  async createShellWindow(options?: {
    activateTabId?: number // 要关联并激活的现有标签页 ID
    initialTab?: {
      // 窗口创建时要创建的新标签页选项
      url: string
      icon?: string
    }
    x?: number // 初始 X 坐标
    y?: number // 初始 Y 坐标
  }): Promise<number | null> {
    console.log('Creating new shell window.')

    // 根据平台选择图标
    const iconFile = nativeImage.createFromPath(process.platform === 'win32' ? iconWin : icon)

    // 使用窗口状态管理器恢复位置和尺寸
    const shellWindowState = windowStateManager({
      defaultWidth: 800,
      defaultHeight: 620
    })

    // 计算初始位置，确保 Y 坐标不为负数
    const initialX = options?.x !== undefined ? options.x : shellWindowState.x
    let initialY = options?.y !== undefined ? options?.y : shellWindowState.y
    initialY = Math.max(0, initialY || 0)

    const shellWindow = new BrowserWindow({
      width: shellWindowState.width,
      height: shellWindowState.height,
      x: initialX,
      y: initialY,
      show: false, // 先隐藏窗口，等待 ready-to-show 以避免白屏
      autoHideMenuBar: true, // 隐藏菜单栏
      icon: iconFile, // 设置图标
      titleBarStyle: 'hiddenInset', // macOS 风格标题栏
      transparent: process.platform === 'darwin', // macOS 标题栏透明
      vibrancy: process.platform === 'darwin' ? 'under-window' : undefined, // macOS 磨砂效果
      backgroundColor: '#00000000', // 透明背景色
      maximizable: true, // 允许最大化
      frame: process.platform === 'darwin', // macOS 无边框
      hasShadow: true, // macOS 阴影
      trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 12 } : undefined, // macOS 红绿灯按钮位置
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'), // Preload 脚本路径
        sandbox: false, // 禁用沙箱，允许 preload 访问 Node.js API
        devTools: is.dev // 开发模式下启用 DevTools
      },
      roundedCorners: true // Windows 11 圆角
    })

    if (!shellWindow) {
      console.error('Failed to create shell window.')
      return null
    }

    const windowId = shellWindow.id
    this.windows.set(windowId, shellWindow) // 将窗口实例存入 Map

    shellWindowState.manage(shellWindow) // 管理窗口状态

    // 应用内容保护设置
    const contentProtectionEnabled = this.configPresenter.getContentProtectionEnabled()
    this.updateContentProtection(shellWindow, contentProtectionEnabled)

    // --- 窗口事件监听 ---

    // 窗口准备就绪时显示
    shellWindow.on('ready-to-show', () => {
      console.log(`Window ${windowId} is ready to show.`)
      if (!shellWindow.isDestroyed()) {
        shellWindow.show() // 显示窗口避免白屏
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_CREATED, windowId)
      } else {
        console.warn(`Window ${windowId} was destroyed before ready-to-show.`)
      }
    })

    // 窗口获得焦点
    shellWindow.on('focus', () => {
      console.log(`Window ${windowId} gained focus.`)
      this.focusedWindowId = windowId
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_FOCUSED, windowId)
      if (!shellWindow.isDestroyed()) {
        shellWindow.webContents.send('window-focused', windowId)
      }
    })

    // 窗口失去焦点
    shellWindow.on('blur', () => {
      console.log(`Window ${windowId} lost focus.`)
      if (this.focusedWindowId === windowId) {
        this.focusedWindowId = null // 仅当失去焦点的窗口是当前记录的焦点窗口时才清空
      }
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_BLURRED, windowId)
      if (!shellWindow.isDestroyed()) {
        shellWindow.webContents.send('window-blurred', windowId)
      }
    })

    // 窗口最大化
    shellWindow.on('maximize', () => {
      console.log(`Window ${windowId} maximized.`)
      if (!shellWindow.isDestroyed()) {
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_MAXIMIZED, windowId)
        // 触发恢复逻辑更新标签页 bounds
        this.handleWindowRestore(windowId).catch((error) => {
          console.error(`Error handling restore logic after maximizing window ${windowId}:`, error)
        })
      }
    })

    // 窗口取消最大化
    shellWindow.on('unmaximize', () => {
      console.log(`Window ${windowId} unmaximized.`)
      if (!shellWindow.isDestroyed()) {
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_UNMAXIMIZED, windowId)
        // 触发恢复逻辑更新标签页 bounds
        this.handleWindowRestore(windowId).catch((error) => {
          console.error(
            `Error handling restore logic after unmaximizing window ${windowId}:`,
            error
          )
        })
      }
    })

    // 窗口从最小化恢复 (或通过 show 显式显示)
    const handleRestore = async () => {
      console.log(`Window ${windowId} restored.`)
      this.handleWindowRestore(windowId).catch((error) => {
        console.error(`Error handling restore logic for window ${windowId}:`, error)
      })
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_RESTORED, windowId)
    }
    shellWindow.on('restore', handleRestore)

    // 窗口进入全屏
    shellWindow.on('enter-full-screen', () => {
      console.log(`Window ${windowId} entered fullscreen.`)
      if (!shellWindow.isDestroyed()) {
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_ENTER_FULL_SCREEN, windowId)
        // 触发恢复逻辑更新标签页 bounds
        this.handleWindowRestore(windowId).catch((error) => {
          console.error(
            `Error handling restore logic after entering fullscreen for window ${windowId}:`,
            error
          )
        })
      }
    })

    // 窗口退出全屏
    shellWindow.on('leave-full-screen', () => {
      console.log(`Window ${windowId} left fullscreen.`)
      if (!shellWindow.isDestroyed()) {
        eventBus.sendToMain(WINDOW_EVENTS.WINDOW_LEAVE_FULL_SCREEN, windowId)
        // 触发恢复逻辑更新标签页 bounds
        this.handleWindowRestore(windowId).catch((error) => {
          console.error(
            `Error handling restore logic after leaving fullscreen for window ${windowId}:`,
            error
          )
        })
      }
    })

    // 窗口尺寸改变，通知 TabPresenter 更新所有视图 bounds
    shellWindow.on('resize', () => {
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_RESIZE, windowId)
    })

    // 'close' 事件：用户尝试关闭窗口 (点击关闭按钮等)。
    // 此处理程序决定是隐藏窗口还是允许其关闭/销毁。
    shellWindow.on('close', (event) => {
      console.log(
        `Window ${windowId} close event. isQuitting: ${this.isQuitting}, Platform: ${process.platform}.`
      )

      // 如果应用不是正在退出过程中...
      if (!this.isQuitting) {
        // 实现隐藏到托盘逻辑：
        // 在非 macOS 平台，或在 macOS 上且未配置关闭时退出 (或还有其他窗口)，阻止默认关闭行为，仅隐藏窗口。
        const isLastWindow = this.windows.size === 1
        // 检查 macOS 配置：关闭时是否退出应用
        const shouldQuitOnClose =
          process.platform === 'darwin' ? this.configPresenter.getCloseToQuit() : false

        // 是否应该阻止默认关闭并隐藏：
        // - 非 macOS 平台总是阻止 (实现隐藏到托盘)。
        // - macOS 平台：如果不是最后一个窗口，或虽然是最后一个窗口但配置为不退出时，阻止。
        const shouldPreventDefault =
          process.platform !== 'darwin' ||
          (process.platform === 'darwin' && (!isLastWindow || !shouldQuitOnClose))

        if (shouldPreventDefault) {
          console.log(`Window ${windowId}: Preventing default close behavior, hiding instead.`)
          event.preventDefault() // 阻止默认窗口关闭行为

          // 处理全屏窗口隐藏时的黑屏问题 (同 hide 方法)
          if (shellWindow.isFullScreen()) {
            console.log(
              `Window ${windowId} is fullscreen, exiting fullscreen before hiding (close event).`
            )
            shellWindow.once('leave-full-screen', () => {
              console.log(`Window ${windowId} left fullscreen, proceeding with hide (close event).`)
              if (!shellWindow.isDestroyed()) {
                shellWindow.hide()
              } else {
                console.warn(
                  `Window ${windowId} was destroyed after leaving fullscreen, cannot hide (close event).`
                )
              }
            })
            shellWindow.setFullScreen(false)
          } else {
            console.log(`Window ${windowId} is not fullscreen, hiding directly (close event).`)
            shellWindow.hide()
          }
        } else {
          // 如果是 macOS，且是最后一个窗口，且配置为关闭时退出，或者 isQuitting 为 true
          // 允许默认关闭行为。这将触发 'closed' 事件。
          console.log(
            `Window ${windowId}: Allowing default close behavior (app is quitting or macOS last window configured to quit).`
          )
        }
      } else {
        // 如果 isQuitting 为 true，表示应用正在主动退出，允许窗口正常关闭
        console.log(`Window ${windowId}: isQuitting is true, allowing default close behavior.`)
      }
    })

    // 'closed' 事件：窗口实际关闭并销毁时触发 (在 'close' 事件之后，如果未阻止默认行为)
    shellWindow.on('closed', () => {
      console.log(
        `Window ${windowId} closed event triggered. isQuitting: ${this.isQuitting}, Map size BEFORE delete: ${this.windows.size}`
      )
      const windowIdBeingClosed = windowId // 捕获 ID

      // 移除 restore 事件监听器，防止内存泄漏 (其他事件的清理根据需要添加)
      shellWindow.removeListener('restore', handleRestore)

      this.windows.delete(windowIdBeingClosed) // 从 Map 中移除
      shellWindowState.unmanage() // 停止管理窗口状态
      eventBus.sendToMain(WINDOW_EVENTS.WINDOW_CLOSED, windowIdBeingClosed)
      console.log(
        `Window ${windowIdBeingClosed} closed event handled. Map size AFTER delete: ${this.windows.size}`
      )

      // 如果在非 macOS 平台，且关闭的是最后一个窗口，如果应用并非正在退出，则发出警告。
      // 在隐藏到托盘逻辑下，'closed' 事件仅应在 isQuitting 为 true 时触发。
      if (this.windows.size === 0 && process.platform !== 'darwin') {
        console.log(`Last window closed on non-macOS platform.`)
        if (!this.isQuitting) {
          console.warn(
            `Warning: Last window on non-macOS platform triggered closed event, but app is not marked as quitting. This might indicate window destruction instead of hiding.`
          )
        }
      }
    })

    // --- 加载 Renderer HTML 文件 ---
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      console.log(
        `Loading renderer URL in dev mode: ${process.env['ELECTRON_RENDERER_URL']}/shell/index.html`
      )
      shellWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/shell/index.html')
    } else {
      // 生产模式下加载打包后的 HTML 文件
      console.log(`Current __dirname: ${__dirname}`)
      console.log(`Process resourcesPath: ${process.resourcesPath}`)
      console.log(`App path: ${app.getAppPath()}`)
      
      // 在生产环境中，文件被打包到asar中，需要使用正确的路径
      const possiblePaths = [
        // 标准asar路径 - 从main目录到renderer/shell
        join(__dirname, '../renderer/shell/index.html'),
        // 如果在asar外部
        join(process.resourcesPath, 'app/out/renderer/shell/index.html'),
        // 备用路径 - 考虑不同的目录结构
        join(__dirname, '../../renderer/shell/index.html'),
        join(__dirname, '../../../out/renderer/shell/index.html'),
        // 从app根目录开始的路径
        join(app.getAppPath(), 'out/renderer/shell/index.html'),
        // 最后的备用方案
        join(__dirname, '../renderer/index.html')
      ]
      
      let loaded = false
      for (const htmlPath of possiblePaths) {
        console.log(`Trying to load: ${htmlPath}`)
        try {
          if (fs.existsSync(htmlPath)) {
            console.log(`Found shell page at: ${htmlPath}`)
            await shellWindow.loadFile(htmlPath)
            loaded = true
            break
          } else {
            console.log(`File not found at: ${htmlPath}`)
          }
        } catch (error) {
          console.error(`Failed to load ${htmlPath}:`, error)
        }
      }
      
      if (!loaded) {
        console.error('All shell page loading attempts failed')
        // 尝试加载一个基本的HTML页面作为错误页面
        const errorHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>McpChat - Error</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
              .error { color: red; margin: 20px 0; }
            </style>
          </head>
          <body>
            <h1>McpChat</h1>
            <div class="error">Failed to load application. Please check the installation.</div>
            <p>Current directory: ${__dirname}</p>
            <p>Resources path: ${process.resourcesPath}</p>
          </body>
          </html>
        `
        shellWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`)
      }
      
      // 监听页面加载失败
      shellWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('页面加载失败:', errorCode, errorDescription)
      })
      
      // 监听渲染器进程的控制台消息
      shellWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer Console ${level}] ${message} (${sourceId}:${line})`)
      })
      
      // 监听渲染器进程的错误
      shellWindow.webContents.on('render-process-gone', (event, details) => {
        console.error('渲染器进程崩溃:', details)
      })
      
      // 监听未捕获的异常
      shellWindow.webContents.on('unresponsive', () => {
        console.error('渲染器进程无响应')
      })
      
      // 监听 DOM 内容加载完成
      shellWindow.webContents.on('dom-ready', () => {
        console.log('DOM 内容加载完成')
        // 延迟执行调试代码，确保Vue应用有时间挂载
        setTimeout(() => {
          shellWindow.webContents.executeJavaScript(`
            console.log('=== DOM DEBUG START ===');
            console.log('Document title:', document.title);
            console.log('Body innerHTML length:', document.body.innerHTML.length);
            console.log('App element exists:', !!document.getElementById('app'));
            const appElement = document.getElementById('app');
            if (appElement) {
              console.log('App element innerHTML length:', appElement.innerHTML.length);
              console.log('App element children count:', appElement.children.length);
              console.log('App element computed style display:', window.getComputedStyle(appElement).display);
              console.log('App element computed style visibility:', window.getComputedStyle(appElement).visibility);
              console.log('App element computed style opacity:', window.getComputedStyle(appElement).opacity);
              console.log('App element computed style height:', window.getComputedStyle(appElement).height);
              console.log('App element computed style width:', window.getComputedStyle(appElement).width);
              if (appElement.children.length > 0) {
                console.log('First child element:', appElement.children[0].tagName);
                console.log('First child computed style display:', window.getComputedStyle(appElement.children[0]).display);
              }
              // 检查页面内容
              console.log('App element first 200 chars:', appElement.innerHTML.substring(0, 200));
              // 检查是否有Vue Router
              if (window.__VUE_ROUTER__) {
                console.log('Current route:', window.__VUE_ROUTER__.currentRoute.value.path);
              }
              // 检查是否有可见的内容元素
              const visibleElements = Array.from(appElement.querySelectorAll('*')).filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              });
              console.log('Visible elements count:', visibleElements.length);
              if (visibleElements.length > 0) {
                console.log('First visible element:', visibleElements[0].tagName, visibleElements[0].className);
              }
            }
            console.log('=== DOM DEBUG END ===');
          `).catch(err => {
            console.error('执行调试脚本失败:', err)
          })
        }, 2000)
      })
    }

    // --- 处理初始标签页创建或激活 ---

    // 如果提供了 options?.initialTab，等待窗口加载完成，然后创建新标签页
    if (options?.initialTab) {
      shellWindow.webContents.once('did-finish-load', async () => {
        console.log(`Window ${windowId} did-finish-load, checking for initial tab creation.`)
        if (shellWindow.isDestroyed()) {
          console.warn(
            `Window ${windowId} was destroyed before did-finish-load callback, cannot create initial tab.`
          )
          return
        }
        shellWindow.focus() // 窗口加载完成后聚焦
        try {
          console.log(`Creating initial tab, URL: ${options.initialTab!.url}`)
          const tabId = await (presenter.tabPresenter as TabPresenter).createTab(
            windowId,
            options.initialTab!.url,
            { active: true }
          )
          if (tabId === null) {
            console.error(`Failed to create initial tab in new window ${windowId}.`)
          } else {
            console.log(`Created initial tab ${tabId} in window ${windowId}.`)
          }
        } catch (error) {
          console.error(`Error creating initial tab:`, error)
        }
      })
    }

    // 如果提供了 activateTabId，表示一个现有标签页 (WebContentsView) 将被 TabPresenter 关联到此新窗口
    // 激活逻辑 (设置可见性、bounds) 在 tabPresenter.attachTab / switchTab 中处理
    if (options?.activateTabId !== undefined) {
      // 等待窗口加载完成，然后尝试激活指定标签页
      shellWindow.webContents.once('did-finish-load', async () => {
        console.log(
          `Window ${windowId} did-finish-load, attempting to activate tab ${options.activateTabId}.`
        )
        if (shellWindow.isDestroyed()) {
          console.warn(
            `Window ${windowId} was destroyed before did-finish-load callback, cannot activate tab ${options.activateTabId}.`
          )
          return
        }
        try {
          // 切换到指定标签页，这将处理视图的关联和显示
          await (presenter.tabPresenter as TabPresenter).switchTab(options.activateTabId as number)
          console.log(`Requested to switch to tab ${options.activateTabId}.`)
        } catch (error) {
          console.error(
            `Failed to activate tab ${options.activateTabId} after window ${windowId} load:`,
            error
          )
        }
      })
    }

    // 开发模式下可选开启 DevTools
    if (is.dev) {
      // shellWindow.webContents.openDevTools({ mode: 'detach' });
    }

    console.log(`Shell window ${windowId} created successfully.`)
    return windowId // 返回新创建窗口的 ID
  }

  /**
   * 更新指定窗口的内容保护设置。
   * @param window BrowserWindow 实例。
   * @param enabled 是否启用内容保护。
   */
  private updateContentProtection(window: BrowserWindow, enabled: boolean): void {
    if (window.isDestroyed()) {
      console.warn(`Attempted to update content protection settings on a destroyed window.`)
      return
    }
    console.log(`Updating content protection for window ${window.id}: ${enabled}`)

    // setContentProtection 阻止截图/屏幕录制
    window.setContentProtection(enabled)

    // setBackgroundThrottling 限制非活动窗口的帧率。
    // 启用内容保护时禁用节流，确保即使窗口非活动也能保持保护。
    window.webContents.setBackgroundThrottling(!enabled) // 启用保护时禁用节流
    window.webContents.setFrameRate(60) // 设置帧率
    window.setBackgroundColor('#00000000') // 设置背景色为透明

    // macOS 特定的隐藏功能 (用于内容保护)
    if (process.platform === 'darwin') {
      window.setHiddenInMissionControl(enabled) // 在 Mission Control 中隐藏
      window.setSkipTaskbar(enabled) // 在 Dock 和 Mission Control 切换器中隐藏
    }
  }

  /**
   * 获取当前获得焦点的 BrowserWindow 实例 (由 Electron 报告并经内部 Map 验证)。
   * @returns 获得焦点的 BrowserWindow 实例，如果无焦点窗口或窗口无效则返回 undefined。
   */
  getFocusedWindow(): BrowserWindow | undefined {
    const electronFocusedWindow = BrowserWindow.getFocusedWindow()

    if (electronFocusedWindow) {
      const windowId = electronFocusedWindow.id
      const ourWindow = this.windows.get(windowId)

      // 验证 Electron 报告的窗口是否在我们管理范围内且有效
      if (ourWindow && !ourWindow.isDestroyed()) {
        this.focusedWindowId = windowId // 更新内部记录
        return ourWindow
      } else {
        // Electron 报告的窗口不在 Map 中或已销毁
        console.warn(
          `Electron reported window ${windowId} focused, but it is not managed or is destroyed.`
        )
        this.focusedWindowId = null
        return undefined
      }
    } else {
      this.focusedWindowId = null // 清空内部记录
      return undefined
    }
  }

  /**
   * 获取所有有效 (未销毁) 的 BrowserWindow 实例数组。
   * @returns BrowserWindow 实例数组。
   */
  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values()).filter((window) => !window.isDestroyed())
  }

  /**
   * 获取指定窗口的活动标签页 ID。
   * @param windowId 窗口 ID。
   * @returns 活动标签页 ID，如果窗口无效或无活动标签页则返回 undefined。
   */
  async getActiveTabId(windowId: number): Promise<number | undefined> {
    const window = this.windows.get(windowId)
    if (!window || window.isDestroyed()) {
      console.warn(
        `Cannot get active tab ID for window ${windowId}, window does not exist or is destroyed.`
      )
      return undefined
    }
    const tabPresenterInstance = presenter.tabPresenter as TabPresenter
    const tabsData = await tabPresenterInstance.getWindowTabsData(windowId)
    const activeTab = tabsData.find((tab) => tab.isActive)
    return activeTab?.id
  }

  /**
   * 向指定窗口的活动标签页发送一个事件。
   * @param windowId 目标窗口 ID。
   * @param channel 事件通道。
   * @param args 事件参数。
   * @returns 如果事件已发送到有效活动标签页，返回 true，否则返回 false。
   */
  async sendToActiveTab(windowId: number, channel: string, ...args: unknown[]): Promise<boolean> {
    console.log(`Sending event "${channel}" to active tab of window ${windowId}.`)
    const tabPresenterInstance = presenter.tabPresenter as TabPresenter
    const activeTabId = await tabPresenterInstance.getActiveTabId(windowId)
    if (activeTabId) {
      const tab = await tabPresenterInstance.getTab(activeTabId)
      if (tab && !tab.webContents.isDestroyed()) {
        tab.webContents.send(channel, ...args)
        console.log(`  - Event sent to tab ${activeTabId}.`)
        return true
      } else {
        console.warn(
          `  - Active tab ${activeTabId} does not exist or is destroyed, cannot send event.`
        )
      }
    } else {
      console.warn(`No active tab found in window ${windowId}, cannot send event "${channel}".`)
    }
    return false
  }

  /**
   * 向"默认"标签页发送消息。
   * 优先级：焦点窗口的活动标签页 > 第一个窗口的活动标签页 > 第一个窗口的第一个标签页。
   * @param channel 消息通道。
   * @param switchToTarget 发送消息后是否切换到目标窗口和标签页。默认为 false。
   * @param args 消息参数。
   * @returns 如果消息已发送，返回 true，否则返回 false。
   */
  async sendTodefaultTab(
    channel: string,
    switchToTarget: boolean = false,
    ...args: unknown[]
  ): Promise<boolean> {
    console.log(`Sending message "${channel}" to default tab. Switch to target: ${switchToTarget}.`)
    try {
      // 优先使用当前获得焦点的窗口
      let targetWindow = this.getFocusedWindow()
      let windowId: number | undefined

      if (targetWindow) {
        windowId = targetWindow.id
        console.log(`  - Using focused window ${windowId}`)
      } else {
        // 如果没有焦点窗口，使用第一个有效窗口
        const windows = this.getAllWindows()
        if (windows.length === 0) {
          console.warn('No window found to send message to.')
          return false
        }
        targetWindow = windows[0]
        windowId = targetWindow.id
        console.log(`  - No focused window, using first window ${windowId}`)
      }

      // 获取目标窗口的所有标签页
      const tabPresenterInstance = presenter.tabPresenter as TabPresenter
      const tabsData = await tabPresenterInstance.getWindowTabsData(windowId)
      if (tabsData.length === 0) {
        console.warn(`Window ${windowId} has no tabs, cannot send message to default tab.`)
        return false
      }

      // 获取活动标签页，如果没有则取第一个标签页
      const targetTabData = tabsData.find((tab) => tab.isActive) || tabsData[0]
      const targetTab = await tabPresenterInstance.getTab(targetTabData.id)

      if (targetTab && !targetTab.webContents.isDestroyed()) {
        // 向目标标签页发送消息
        targetTab.webContents.send(channel, ...args)
        console.log(`  - Message sent to tab ${targetTabData.id} in window ${windowId}.`)

        // 如果需要，切换到目标窗口和标签页
        if (switchToTarget) {
          try {
            // 激活目标窗口
            if (targetWindow && !targetWindow.isDestroyed()) {
              console.log(`  - Switching to window ${windowId}`)
              targetWindow.show() // 确保窗口可见
              targetWindow.focus() // 将窗口带到前台
            }

            // 如果目标标签页不是活动标签页，则切换
            if (!targetTabData.isActive) {
              console.log(`  - Switching to tab ${targetTabData.id}`)
              await tabPresenterInstance.switchTab(targetTabData.id)
            }
          } catch (error) {
            console.error('Error switching to target window/tab:', error)
            // 继续，因为消息发送成功
          }
        }

        return true // 消息发送成功
      } else {
        console.warn(
          `Target tab ${targetTabData.id} in window ${windowId} is unavailable or destroyed.`
        )
        return false // 目标标签页无效
      }
    } catch (error) {
      console.error('Error sending message to default tab:', error)
      return false // 过程中发生错误
    }
  }
}
