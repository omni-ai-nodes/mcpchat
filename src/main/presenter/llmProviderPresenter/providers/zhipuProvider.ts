import { LLM_PROVIDER, LLMResponse, MODEL_META, ChatMessage } from '@shared/presenter'
import { OpenAICompatibleProvider } from './openAICompatibleProvider'
import { ConfigPresenter } from '../../configPresenter'

export class ZhipuProvider extends OpenAICompatibleProvider {
  constructor(provider: LLM_PROVIDER, configPresenter: ConfigPresenter) {
    // 初始化智谱AI模型配置
    super(provider, configPresenter)
  }

  protected async fetchOpenAIModels(): Promise<MODEL_META[]> {
    return [
      // 语言模型
      {
        id: 'glm-4-plus',
        name: 'GLM-4-Plus',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 128000,
        maxTokens: 4096
      },
      {
        id: 'glm-4-air-250414',
        name: 'GLM-4-Air-250414',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 128000,
        maxTokens: 16000
      },
      {
        id: 'glm-4-long',
        name: 'GLM-4-Long',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 1000000,
        maxTokens: 4096
      },
      {
        id: 'glm-4-airx',
        name: 'GLM-4-AirX',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 8000,
        maxTokens: 4096
      },
      {
        id: 'glm-4-flashx',
        name: 'GLM-4-FlashX',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 128000,
        maxTokens: 4096
      },
      {
        id: 'glm-4-flash-250414',
        name: 'GLM-4-Flash-250414',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 128000,
        maxTokens: 16000
      },
      // 推理模型
      {
        id: 'glm-z1-air',
        name: 'GLM-Z1-Air',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 32000,
        maxTokens: 32000
      },
      {
        id: 'glm-z1-airx',
        name: 'GLM-Z1-AirX',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 32000,
        maxTokens: 30000
      },
      {
        id: 'glm-z1-flash',
        name: 'GLM-Z1-Flash',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 32000,
        maxTokens: 32000
      },
      // 多模态模型
      {
        id: 'glm-4v-plus-0111',
        name: 'GLM-4V-Plus-0111',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 16000,
        maxTokens: 4096
      },
      {
        id: 'glm-4v',
        name: 'GLM-4V',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 4000,
        maxTokens: 4096
      },
      {
        id: 'glm-4v-flash',
        name: 'GLM-4V-Flash',
        group: 'zhipu',
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 4000,
        maxTokens: 4096
      }
    ]
  }

  async completions(
    messages: ChatMessage[],
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMResponse> {
    return this.openAICompletion(messages, modelId, temperature, maxTokens)
  }

  async summaries(
    text: string,
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMResponse> {
    return this.openAICompletion(
      [
        {
          role: 'user',
          content: `You need to summarize the user's conversation into a title of no more than 10 words, with the title language matching the user's primary language, without using punctuation or other special symbols：\n${text}`
        }
      ],
      modelId,
      temperature,
      maxTokens
    )
  }

  async generateText(
    prompt: string,
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMResponse> {
    return this.openAICompletion(
      [
        {
          role: 'user',
          content: prompt
        }
      ],
      modelId,
      temperature,
      maxTokens
    )
  }
}
