import { LLM_PROVIDER, LLMResponse, MODEL_META, ChatMessage } from '@shared/presenter'
import { OpenAICompatibleProvider } from './openAICompatibleProvider'
import { ConfigPresenter } from '../../configPresenter'
import { ModelsPage } from 'openai/resources'

export class GithubProvider extends OpenAICompatibleProvider {
  constructor(provider: LLM_PROVIDER, configPresenter: ConfigPresenter) {
    super(provider, configPresenter)
  }
  protected async fetchOpenAIModels(options?: { timeout: number }): Promise<MODEL_META[]> {
    const response = (await this.openai.models.list(options)) as ModelsPage & {
      body: {
        id: string
        name: string
        description: string
      }[]
    }
    return response.body.map((model) => ({
      id: model.name,
      name: model.name,
      group: 'default',
      providerId: this.provider.id,
      isCustom: false,
      contextLength: 4096,
      maxTokens: 8192,
      description: model.description
    }))
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
          content: `请总结以下内容，使用简洁的语言，突出重点：\n${text}`
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
