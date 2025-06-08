import {
  LLM_PROVIDER,
  MODEL_META,
  LLMResponse,
  LLMCoreStreamEvent,
  ModelConfig,
  MCPToolDefinition,
  ChatMessage
} from '@shared/presenter'
import { BaseLLMProvider } from '../baseProvider'
import {
  GoogleGenAI,
  Part,
  Content,
  GenerationConfig,
  GenerateContentParameters,
  GenerateContentResponseUsageMetadata,
  HarmCategory,
  HarmBlockThreshold,
  SafetySetting,
  FunctionCallingConfigMode,
  Modality
} from '@google/genai'
import { ConfigPresenter } from '../../configPresenter'
import { presenter } from '@/presenter'

// Mapping from simple keys to API HarmCategory constants
const keyToHarmCategoryMap: Record<string, HarmCategory> = {
  harassment: HarmCategory.HARM_CATEGORY_HARASSMENT,
  hateSpeech: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  sexuallyExplicit: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  dangerousContent: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT
}

// Value mapping from config storage to API HarmBlockThreshold constants
// Assuming config stores 'BLOCK_NONE', 'BLOCK_LOW_AND_ABOVE', etc. directly
const valueToHarmBlockThresholdMap: Record<string, HarmBlockThreshold> = {
  BLOCK_NONE: HarmBlockThreshold.BLOCK_NONE,
  BLOCK_LOW_AND_ABOVE: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  BLOCK_MEDIUM_AND_ABOVE: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  BLOCK_ONLY_HIGH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  HARM_BLOCK_THRESHOLD_UNSPECIFIED: HarmBlockThreshold.HARM_BLOCK_THRESHOLD_UNSPECIFIED
}
const safetySettingKeys = Object.keys(keyToHarmCategoryMap)

export class GeminiProvider extends BaseLLMProvider {
  private genAI: GoogleGenAI

  // 定义静态的模型配置
  private static readonly GEMINI_MODELS: MODEL_META[] = [
    {
      id: 'models/gemini-2.5-flash-preview-05-20',
      name: 'Gemini 2.5 Flash Preview 0520',
      group: 'default',
      providerId: 'gemini',
      isCustom: false,
      contextLength: 1048576,
      maxTokens: 65536,
      vision: true,
      functionCall: true,
      reasoning: true,
      description: 'Gemini 2.5 Flash Preview 模型（支持文本、图片、视频、音频输入，预览版本 05-20）'
    },
    {
      id: 'gemini-2.5-pro-preview-06-05',
      name: 'Gemini 2.5 Pro Preview 06-05',
      group: 'default',
      providerId: 'gemini',
      isCustom: false,
      contextLength: 2048576,
      maxTokens: 8192,
      vision: true,
      functionCall: true,
      reasoning: false,
      description: 'Gemini 2.5 Pro Preview 05-06 模型（付费）'
    },
    {
      id: 'gemini-2.5-pro-exp-03-25',
      name: 'Gemini 2.5 Pro Exp 03-25',
      group: 'default',
      providerId: 'gemini',
      isCustom: false,
      contextLength: 2048576,
      maxTokens: 8192,
      vision: true,
      functionCall: true,
      reasoning: false,
      description: 'Gemini 2.5 Pro Exp 03-25 模型'
    },
    {
      id: 'models/gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      group: 'default',
      providerId: 'gemini',
      isCustom: false,
      contextLength: 1048576,
      maxTokens: 8192,
      vision: true,
      functionCall: true,
      reasoning: false,
      description: 'Gemini 2.0 Flash 模型'
    },
    {
      id: 'models/gemini-2.0-flash-lite',
      name: 'Gemini 2.0 Flash-Lite',
      group: 'default',
      providerId: 'gemini',
      isCustom: false,
      contextLength: 1048576,
      maxTokens: 8192,
      vision: true,
      functionCall: true,
      reasoning: false,
      description: 'Gemini 2.0 Flash-Lite 模型（更轻量级）'
    },
    {
      id: 'gemini-2.0-flash-exp-image-generation',
      name: 'Gemini 2.0 Flash Exp Image Generation',
      group: 'default',
      providerId: 'gemini',
      isCustom: false,
      contextLength: 1048576,
      maxTokens: 8192,
      vision: true,
      functionCall: true,
      reasoning: false
    }
  ]

  constructor(provider: LLM_PROVIDER, configPresenter: ConfigPresenter) {
    super(provider, configPresenter)
    this.genAI = new GoogleGenAI({ apiKey: this.provider.apiKey })
    this.init()
  }

  public onProxyResolved(): void {
    this.init()
  }

  // 实现BaseLLMProvider中的抽象方法fetchProviderModels
  protected async fetchProviderModels(): Promise<MODEL_META[]> {
    // 返回静态定义的模型列表，并设置正确的providerId
    return GeminiProvider.GEMINI_MODELS.map((model) => ({
      ...model,
      providerId: this.provider.id
    }))
  }

  // 实现BaseLLMProvider中的summaryTitles抽象方法
  public async summaryTitles(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    modelId: string
  ): Promise<string> {
    console.log('gemini ignore modelId', modelId)
    // 使用Gemini API生成对话标题
    try {
      const conversationText = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
      const prompt = `请为以下对话生成一个简洁的标题，不超过10个字，不使用标点符号或其他特殊符号，标题语言应该匹配对话的语言：\n\n${conversationText}`

      const result = await this.genAI.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: this.getGenerationConfig(0.4, undefined, modelId)
      })

      return result.text?.trim() || '新对话'
    } catch (error) {
      console.error('生成对话标题失败:', error)
      return '新对话'
    }
  }

  // 重载fetchModels方法，因为Gemini没有获取模型的API
  async fetchModels(): Promise<MODEL_META[]> {
    // Gemini没有获取模型的API，直接使用init方法中的硬编码模型列表
    return this.models
  }

  // 重载check方法，使用第一个默认模型进行测试
  async check(): Promise<{ isOk: boolean; errorMsg: string | null }> {
    try {
      if (!this.provider.apiKey) {
        return { isOk: false, errorMsg: '缺少API密钥' }
      }

      // 使用第一个模型进行简单测试
      const result = await this.genAI.models.generateContent({
        model: 'models/gemini-1.5-flash-8b',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
      })
      return { isOk: result && result.text ? true : false, errorMsg: null }
    } catch (error) {
      console.error('Provider check failed:', this.provider.name, error)
      return { isOk: false, errorMsg: error instanceof Error ? error.message : String(error) }
    }
  }

  protected async init() {
    if (this.provider.enable) {
      try {
        this.isInitialized = true
        // 使用静态定义的模型列表，并设置正确的providerId
        this.models = GeminiProvider.GEMINI_MODELS.map((model) => ({
          ...model,
          providerId: this.provider.id
        }))
        await this.autoEnableModelsIfNeeded()
        console.info('Provider initialized successfully:', this.provider.name)
      } catch (error) {
        console.warn('Provider initialization failed:', this.provider.name, error)
      }
    }
  }

  // Helper function to get and format safety settings
  private async getFormattedSafetySettings(): Promise<SafetySetting[] | undefined> {
    const safetySettings: SafetySetting[] = []

    for (const key of safetySettingKeys) {
      try {
        // Use configPresenter to get the setting value for the 'gemini' provider
        // Assuming getSetting returns the string value like 'BLOCK_MEDIUM_AND_ABOVE'
        const settingValue =
          (await this.configPresenter.getSetting<string>(
            `geminiSafety_${key}` // Match the key used in settings store
          )) || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED' // Default if not set

        const threshold = valueToHarmBlockThresholdMap[settingValue]
        const category = keyToHarmCategoryMap[key]

        // Only add if threshold is defined, category is defined, and threshold is not BLOCK_NONE
        if (
          threshold &&
          category &&
          threshold !== 'BLOCK_NONE' &&
          threshold !== 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'
        ) {
          safetySettings.push({ category, threshold })
        }
      } catch (error) {
        console.warn(`Failed to retrieve or map safety setting for ${key}:`, error)
      }
    }

    return safetySettings.length > 0 ? safetySettings : undefined
  }

  // 获取生成配置，不再创建模型实例
  private getGenerationConfig(
    temperature?: number,
    maxTokens?: number,
    modelId?: string
  ): GenerationConfig & { responseModalities?: string[] } {
    const generationConfig = {
      temperature,
      maxOutputTokens: maxTokens
    } as GenerationConfig & { responseModalities?: string[] }
    if (modelId === 'gemini-2.0-flash-exp-image-generation') {
      generationConfig.responseModalities = [Modality.TEXT, Modality.IMAGE]
    }
    return generationConfig
  }

  // 将 ChatMessage 转换为 Gemini 格式的消息
  private formatGeminiMessages(messages: ChatMessage[]): {
    systemInstruction: string
    contents: Content[]
  } {
    // 提取系统消息
    const systemMessages = messages.filter((msg) => msg.role === 'system')
    let systemContent = ''
    if (systemMessages.length > 0) {
      systemContent = systemMessages.map((msg) => msg.content).join('\n')
    }

    // 创建Gemini内容数组
    const formattedContents: Content[] = []

    // 处理非系统消息
    const nonSystemMessages = messages.filter((msg) => msg.role !== 'system')
    for (let i = 0; i < nonSystemMessages.length; i++) {
      const message = nonSystemMessages[i]

      // 检查是否是带有tool_calls的assistant消息
      if (message.role === 'assistant' && 'tool_calls' in message) {
        // 处理tool_calls消息
        for (const toolCall of message.tool_calls || []) {
          // 添加模型发出的函数调用
          formattedContents.push({
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: toolCall.function.name,
                  args: JSON.parse(toolCall.function.arguments || '{}')
                }
              }
            ]
          })

          // 查找对应的工具响应消息
          const nextMessage = i + 1 < nonSystemMessages.length ? nonSystemMessages[i + 1] : null
          if (
            nextMessage &&
            nextMessage.role === 'tool' &&
            'tool_call_id' in nextMessage &&
            nextMessage.tool_call_id === toolCall.id
          ) {
            // 添加用户角色的函数响应
            formattedContents.push({
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: toolCall.function.name,
                    response: {
                      result:
                        typeof nextMessage.content === 'string'
                          ? nextMessage.content
                          : JSON.stringify(nextMessage.content)
                    }
                  }
                }
              ]
            })

            // 跳过下一条消息，因为已经处理过了
            i++
          }
        }
        continue
      }

      // 为每条消息创建parts数组
      const parts: Part[] = []

      // 检查消息是否包含工具调用或工具响应
      if (message.role === 'tool' && Array.isArray(message.content)) {
        // 处理工具消息
        for (const part of message.content) {
          // @ts-ignore - 处理类型兼容性
          if (part.type === 'function_call' && part.function_call) {
            // 处理函数调用
            parts.push({
              // @ts-ignore - 处理类型兼容性
              functionCall: {
                // @ts-ignore - 处理类型兼容性
                name: part.function_call.name || '',
                // @ts-ignore - 处理类型兼容性
                args: part.function_call.arguments ? JSON.parse(part.function_call.arguments) : {}
              }
            })
            // @ts-ignore - 处理类型兼容性
          } else if (part.type === 'function_response') {
            // 处理函数响应
            // @ts-ignore - 处理类型兼容性
            parts.push({ text: part.function_response || '' })
          }
        }
      } else if (typeof message.content === 'string') {
        // 处理消息内容 - 可能是字符串或包含图片的数组
        // 处理纯文本消息
        // 只添加非空文本
        if (message.content.trim() !== '') {
          parts.push({ text: message.content })
        }
      } else if (Array.isArray(message.content)) {
        // 处理多模态消息（带图片等）
        for (const part of message.content) {
          if (part.type === 'text') {
            // 只添加非空文本
            if (part.text && part.text.trim() !== '') {
              parts.push({ text: part.text })
            }
          } else if (part.type === 'image_url' && part.image_url) {
            // 处理图片（假设是 base64 格式）
            const matches = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/)
            if (matches && matches.length === 3) {
              const mimeType = matches[1]
              const base64Data = matches[2]
              parts.push({
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              })
            }
          }
        }
      }

      // 只有当parts不为空时，才添加到formattedContents中
      if (parts.length > 0) {
        // 将消息角色转换为Gemini支持的角色
        let role: 'user' | 'model' = 'user'
        if (message.role === 'assistant') {
          role = 'model'
        } else if (message.role === 'tool') {
          // 工具消息作为用户消息处理
          role = 'user'
        }

        formattedContents.push({
          role: role,
          parts: parts
        })
      }
    }

    return { systemInstruction: systemContent, contents: formattedContents }
  }

  // 处理响应，提取思考内容
  private processResponse(text: string): LLMResponse {
    const resultResp: LLMResponse = {
      content: ''
    }

    // 处理 <think> 标签
    if (text) {
      const content = text.trimStart()
      if (content.includes('<think>')) {
        const thinkStart = content.indexOf('<think>')
        const thinkEnd = content.indexOf('</think>')

        if (thinkEnd > thinkStart) {
          // 提取 reasoning_content
          resultResp.reasoning_content = content.substring(thinkStart + 7, thinkEnd).trim()

          // 合并 <think> 前后的普通内容
          const beforeThink = content.substring(0, thinkStart).trim()
          const afterThink = content.substring(thinkEnd + 8).trim()
          resultResp.content = [beforeThink, afterThink].filter(Boolean).join('\n')
        } else {
          // 如果没有找到配对的结束标签，将所有内容作为普通内容
          resultResp.content = text
        }
      } else {
        // 没有 think 标签，所有内容作为普通内容
        resultResp.content = text
      }
    }

    return resultResp
  }

  // 实现抽象方法
  async completions(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMResponse> {
    try {
      if (!this.genAI) {
        throw new Error('Google Generative AI client is not initialized')
      }

      const { systemInstruction, contents } = this.formatGeminiMessages(messages)

      // 创建基本请求参数
      const generationConfig: GenerationConfig = {
        temperature: temperature || 0.7,
        maxOutputTokens: maxTokens
      }

      // 执行请求
      const requestParams: GenerateContentParameters = {
        model: modelId,
        contents,
        config: generationConfig
      }

      if (systemInstruction) {
        requestParams.config = {
          ...generationConfig,
          systemInstruction
        }
      }

      const result = await this.genAI.models.generateContent(requestParams)

      const resultResp: LLMResponse = {
        content: ''
      }

      // 尝试获取tokens信息 - 使用新SDK的usageMetadata结构
      try {
        if (result.usageMetadata) {
          const usage = result.usageMetadata
          resultResp.totalUsage = {
            prompt_tokens: usage.promptTokenCount || 0,
            completion_tokens: usage.candidatesTokenCount || 0,
            total_tokens: usage.totalTokenCount || 0
          }
        } else {
          // 估算token数量 - 简单方法，可以根据实际需要调整
          const promptText = messages.map((m) => m.content).join(' ')
          const responseText = result.text || ''

          // 简单估算: 英文约1个token/4个字符，中文约1个token/1.5个字符
          const estimateTokens = (text: string): number => {
            const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length
            const otherCharCount = text.length - chineseCharCount
            return Math.ceil(chineseCharCount / 1.5 + otherCharCount / 4)
          }

          const promptTokens = estimateTokens(promptText)
          const completionTokens = estimateTokens(responseText)

          resultResp.totalUsage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens
          }
        }
      } catch (e) {
        console.warn('Failed to estimate token count for Gemini response', e)
      }

      // 获取文本响应
      const text = result.text || ''

      // 处理<think>标签
      if (text.includes('<think>')) {
        const thinkStart = text.indexOf('<think>')
        const thinkEnd = text.indexOf('</think>')

        if (thinkEnd > thinkStart) {
          // 提取reasoning_content
          resultResp.reasoning_content = text.substring(thinkStart + 7, thinkEnd).trim()

          // 合并<think>前后的普通内容
          const beforeThink = text.substring(0, thinkStart).trim()
          const afterThink = text.substring(thinkEnd + 8).trim()
          resultResp.content = [beforeThink, afterThink].filter(Boolean).join('\n')
        } else {
          // 如果没有找到配对的结束标签，将所有内容作为普通内容
          resultResp.content = text
        }
      } else {
        // 没有think标签，所有内容作为普通内容
        resultResp.content = text
      }

      return resultResp
    } catch (error) {
      console.error('Gemini completions error:', error)
      throw error
    }
  }

  async summaries(
    text: string,
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMResponse> {
    if (!this.isInitialized) {
      throw new Error('Provider not initialized')
    }

    if (!modelId) {
      throw new Error('Model ID is required')
    }

    try {
      const prompt = `请为以下内容生成一个简洁的摘要：\n\n${text}`

      const result = await this.genAI.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: this.getGenerationConfig(temperature, maxTokens, modelId)
      })

      const response = result.text || ''
      return this.processResponse(response)
    } catch (error) {
      console.error('Gemini summaries error:', error)
      throw error
    }
  }

  async generateText(
    prompt: string,
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMResponse> {
    if (!this.isInitialized) {
      throw new Error('Provider not initialized')
    }

    if (!modelId) {
      throw new Error('Model ID is required')
    }

    try {
      const result = await this.genAI.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: this.getGenerationConfig(temperature, maxTokens, modelId)
      })

      const response = result.text || ''
      return this.processResponse(response)
    } catch (error) {
      console.error('Gemini generateText error:', error)
      throw error
    }
  }

  async suggestions(
    context: string,
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<string[]> {
    if (!this.isInitialized) {
      throw new Error('Provider not initialized')
    }

    if (!modelId) {
      throw new Error('Model ID is required')
    }

    try {
      const prompt = `根据以下上下文，请提供最多5个合理的建议选项，每个选项不超过100个字符。请以JSON数组格式返回，不要有其他说明：\n\n${context}`

      const result = await this.genAI.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: this.getGenerationConfig(temperature, maxTokens, modelId)
      })

      const responseText = result.text || ''

      // 尝试从响应中解析出JSON数组
      try {
        const cleanedText = responseText.replace(/```json|```/g, '').trim()
        const suggestions = JSON.parse(cleanedText)
        if (Array.isArray(suggestions)) {
          return suggestions.map((item) => item.toString())
        }
      } catch (parseError) {
        console.error('Gemini suggestions parseError:', parseError)
        // 如果解析失败，尝试分行处理
        const lines = responseText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('```') && !line.includes(':'))
          .map((line) => line.replace(/^[0-9]+\.\s*/, '').replace(/^-\s*/, ''))

        if (lines.length > 0) {
          return lines.slice(0, 5)
        }
      }

      // 如果都失败了，返回一个默认提示
      return ['无法生成建议']
    } catch (error) {
      console.error('Gemini suggestions error:', error)
      return ['发生错误，无法获取建议']
    }
  }
  /**
   * 核心流式处理方法
   * 实现BaseLLMProvider中的抽象方法
   */
  async *coreStream(
    messages: ChatMessage[],
    modelId: string,
    modelConfig: ModelConfig,
    temperature: number,
    maxTokens: number,
    mcpTools: MCPToolDefinition[]
  ): AsyncGenerator<LLMCoreStreamEvent> {
    if (!this.isInitialized) throw new Error('Provider not initialized')
    if (!modelId) throw new Error('Model ID is required')
    console.log('modelConfig', modelConfig, modelId)

    // 检查是否是图片生成模型
    const isImageGenerationModel = modelId === 'gemini-2.0-flash-exp-image-generation'

    // 如果是图片生成模型，使用特殊处理
    if (isImageGenerationModel) {
      yield* this.handleImageGenerationStream(messages, modelId, temperature, maxTokens)
      return
    }

    const safetySettings = await this.getFormattedSafetySettings()
    console.log('safetySettings', safetySettings)

    // 将MCP工具转换为Gemini格式的工具（所有Gemini模型都支持原生工具调用）
    const geminiTools =
      mcpTools.length > 0
        ? await presenter.mcpPresenter.mcpToolsToGeminiTools(mcpTools, this.provider.id)
        : undefined

    // 格式化消息为Gemini格式
    const formattedParts = this.formatGeminiMessages(messages)

    // 创建请求参数
    const requestParams: GenerateContentParameters = {
      model: modelId,
      contents: formattedParts.contents,
      config: this.getGenerationConfig(temperature, maxTokens, modelId)
    }

    if (formattedParts.systemInstruction) {
      requestParams.config = {
        ...requestParams.config,
        systemInstruction: formattedParts.systemInstruction
      }
    }

    // 添加工具配置
    if (geminiTools && geminiTools.length > 0) {
      requestParams.config = {
        ...requestParams.config,
        tools: geminiTools,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO // 允许模型自动决定是否调用工具
          }
        }
      }
    }

    // 添加安全设置
    if (safetySettings) {
      requestParams.config = {
        ...requestParams.config,
        safetySettings
      }
    }

    // 发送流式请求
    const result = await this.genAI.models.generateContentStream(requestParams)

    // 状态变量
    let buffer = ''
    let isInThinkTag = false
    let toolUseDetected = false
    let usageMetadata: GenerateContentResponseUsageMetadata | undefined

    // 流处理循环
    for await (const chunk of result) {
      // 处理用量统计
      if (chunk.usageMetadata) {
        usageMetadata = chunk.usageMetadata
      }

      // 检查是否包含函数调用
      if (chunk.candidates && chunk.candidates[0]?.content?.parts?.[0]?.functionCall) {
        const functionCall = chunk.candidates[0].content.parts[0].functionCall
        const functionName = functionCall.name
        const functionArgs = functionCall.args || {}
        const toolCallId = `gemini-tool-${Date.now()}`

        toolUseDetected = true

        // 发送工具调用开始事件
        yield {
          type: 'tool_call_start',
          tool_call_id: toolCallId,
          tool_call_name: functionName
        }

        // 发送工具调用参数
        const argsString = JSON.stringify(functionArgs)
        yield {
          type: 'tool_call_chunk',
          tool_call_id: toolCallId,
          tool_call_arguments_chunk: argsString
        }

        // 发送工具调用结束事件
        yield {
          type: 'tool_call_end',
          tool_call_id: toolCallId,
          tool_call_arguments_complete: argsString
        }

        // 设置停止原因为工具使用
        break
      }

      // 处理内容块
      let content = ''

      // 处理文本和图像内容
      if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
          if (part.text) {
            content += part.text
          } else if (part.inlineData && part.inlineData.data && part.inlineData.mimeType) {
            // 处理图像数据
            yield {
              type: 'image_data',
              image_data: {
                data: part.inlineData.data,
                mimeType: part.inlineData.mimeType
              }
            }
          }
        }
      } else {
        // 兼容处理
        content = chunk.text || ''
      }

      if (!content) continue

      buffer += content

      // 处理思考标签
      if (buffer.includes('<think>') && !isInThinkTag) {
        const thinkStart = buffer.indexOf('<think>')

        // 发送<think>标签前的文本
        if (thinkStart > 0) {
          yield {
            type: 'text',
            content: buffer.substring(0, thinkStart)
          }
        }

        buffer = buffer.substring(thinkStart + 7)
        isInThinkTag = true
        continue
      }

      // 处理思考标签结束
      if (isInThinkTag && buffer.includes('</think>')) {
        const thinkEnd = buffer.indexOf('</think>')
        const reasoningContent = buffer.substring(0, thinkEnd)

        // 发送推理内容
        if (reasoningContent) {
          yield {
            type: 'reasoning',
            reasoning_content: reasoningContent
          }
        }

        buffer = buffer.substring(thinkEnd + 8)
        isInThinkTag = false

        // 如果还有剩余内容，继续处理
        if (buffer) {
          yield {
            type: 'text',
            content: buffer
          }
          buffer = ''
        }

        continue
      }

      // 如果在思考标签内，不输出内容
      if (isInThinkTag) {
        continue
      }

      // 正常输出文本内容
      yield {
        type: 'text',
        content: content
      }

      // 内容已经发送，清空buffer避免重复
      buffer = ''
    }

    if (usageMetadata) {
      yield {
        type: 'usage',
        usage: {
          prompt_tokens: usageMetadata.promptTokenCount || 0,
          completion_tokens: usageMetadata.candidatesTokenCount || 0,
          total_tokens: usageMetadata.totalTokenCount || 0
        }
      }
    }

    // 处理剩余缓冲区内容
    if (buffer) {
      if (isInThinkTag) {
        yield {
          type: 'reasoning',
          reasoning_content: buffer
        }
      } else {
        yield {
          type: 'text',
          content: buffer
        }
      }
    }

    // 发送停止事件
    yield { type: 'stop', stop_reason: toolUseDetected ? 'tool_use' : 'complete' }
  }

  /**
   * 处理图片生成模型的流式输出
   */
  private async *handleImageGenerationStream(
    messages: ChatMessage[],
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): AsyncGenerator<LLMCoreStreamEvent> {
    try {
      // 提取用户提示词
      const userMessage = messages.findLast((msg) => msg.role === 'user')
      if (!userMessage) {
        throw new Error('No user message found for image generation')
      }

      const prompt =
        typeof userMessage.content === 'string'
          ? userMessage.content
          : userMessage.content && Array.isArray(userMessage.content)
            ? userMessage.content
              .filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('\n')
            : ''

      // 发送生成请求
      const result = await this.genAI.models.generateContentStream({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: this.getGenerationConfig(temperature, maxTokens, modelId)
      })

      // 处理流式响应
      for await (const chunk of result) {
        if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.text) {
              // 输出文本内容
              yield {
                type: 'text',
                content: part.text
              }
            } else if (part.inlineData) {
              // 输出图像数据
              yield {
                type: 'image_data',
                image_data: {
                  data: part.inlineData.data || '',
                  mimeType: part.inlineData.mimeType || ''
                }
              }
            }
          }
        }
      }

      // 发送停止事件
      yield { type: 'stop', stop_reason: 'complete' }
    } catch (error) {
      console.error('Image generation stream error:', error)
      yield {
        type: 'error',
        error_message: error instanceof Error ? error.message : '图像生成失败'
      }
      yield { type: 'stop', stop_reason: 'error' }
    }
  }
}
