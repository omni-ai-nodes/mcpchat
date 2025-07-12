<template>
  <div class="node-properties">
    <div class="property-group">
      <label class="property-label">节点名称</label>
      <input 
        v-model="localNode.name"
        class="property-input"
        type="text"
        @input="updateProperty('name', ($event.target as HTMLInputElement)?.value)"
      />
    </div>

    <div class="property-group">
      <label class="property-label">节点类型</label>
      <div class="property-value">{{ getNodeTypeLabel() }}</div>
    </div>

    <div class="property-group">
      <label class="property-label">描述</label>
      <textarea 
        :value="localNode.config.description || ''"
        @input="updateConfig('description', ($event.target as HTMLTextAreaElement)?.value)"
        class="property-input property-textarea"
        placeholder="输入节点描述..."
      />
    </div>

    <!-- 根据节点类型显示不同的配置选项 -->
    <template v-if="node.type === 'file-input'">
      <div class="property-group">
        <label class="property-label">文件路径</label>
        <input 
          :value="localNode.config.filePath || ''"
          @input="updateConfig('filePath', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="text"
          placeholder="选择文件路径..."
        />
      </div>
      <div class="property-group">
        <label class="property-label">文件类型</label>
        <select 
          :value="localNode.config.fileType || ''"
          @change="updateConfig('fileType', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="text">文本文件</option>
          <option value="json">JSON文件</option>
          <option value="csv">CSV文件</option>
          <option value="xml">XML文件</option>
        </select>
      </div>
    </template>

    <template v-else-if="node.type === 'text-input'">
      <div class="property-group">
        <label class="property-label">默认文本</label>
        <textarea 
          :value="localNode.config.defaultText || ''"
          @input="updateConfig('defaultText', ($event.target as HTMLTextAreaElement)?.value)"
          class="property-input property-textarea"
          placeholder="输入默认文本..."
        />
      </div>
    </template>

    <template v-else-if="node.type === 'api-input'">
      <div class="property-group">
        <label class="property-label">API URL</label>
        <input 
          :value="localNode.config.apiUrl || ''"
          @input="updateConfig('apiUrl', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="url"
          placeholder="https://api.example.com/data"
        />
      </div>
      <div class="property-group">
        <label class="property-label">请求方法</label>
        <select 
          :value="localNode.config.method || ''"
          @change="updateConfig('method', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>
      <div class="property-group">
        <label class="property-label">请求头</label>
        <textarea 
          :value="localNode.config.headers || ''"
          @input="updateConfig('headers', ($event.target as HTMLTextAreaElement)?.value)"
          class="property-input property-textarea"
          placeholder='{"Content-Type": "application/json"}'
        />
      </div>
      <div v-if="localNode.config.method === 'POST' || localNode.config.method === 'PUT'" class="property-group">
        <label class="property-label">JSON参数</label>
        <textarea 
          :value="localNode.config.jsonParams || ''"
          @input="updateConfig('jsonParams', ($event.target as HTMLTextAreaElement)?.value)"
          class="property-input property-textarea"
          placeholder='{"key": "value", "param": "data"}'
          rows="6"
        />
        <div class="property-hint">请输入有效的JSON格式参数</div>
      </div>
      <div class="property-group">
        <button 
          class="test-button"
          @click="testApiRequest"
          :disabled="!localNode.config.apiUrl || isTestingApi"
          title="测试API请求"
        >
          <Icon v-if="isTestingApi" icon="mdi:loading" class="animate-spin" />
          <Icon v-else icon="mdi:send" />
          {{ isTestingApi ? '测试中...' : '测试请求' }}
        </button>
        <div v-if="apiTestResult" class="test-result" :class="{ 'success': apiTestResult.success, 'error': !apiTestResult.success }">
          {{ apiTestResult.message }}
        </div>
      </div>
    </template>

    <template v-else-if="node.type === 'text-transform'">
      <div class="property-group">
        <label class="property-label">转换类型</label>
        <select 
          :value="localNode.config.transformType || ''"
          @change="updateConfig('transformType', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="uppercase">转大写</option>
          <option value="lowercase">转小写</option>
          <option value="trim">去除空格</option>
          <option value="replace">替换文本</option>
          <option value="extract">提取文本</option>
        </select>
      </div>
      <div v-if="localNode.config.transformType === 'replace'" class="property-group">
        <label class="property-label">查找文本</label>
        <input 
          :value="localNode.config.findText || ''"
          @input="updateConfig('findText', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="text"
          placeholder="要查找的文本"
        />
      </div>
      <div v-if="localNode.config.transformType === 'replace'" class="property-group">
        <label class="property-label">替换文本</label>
        <input 
          :value="localNode.config.replaceText || ''"
          @input="updateConfig('replaceText', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="text"
          placeholder="替换为的文本"
        />
      </div>
      <div v-if="localNode.config.transformType === 'extract'" class="property-group">
        <label class="property-label">正则表达式模式</label>
        <input 
          :value="localNode.config.pattern || ''"
          @input="updateConfig('pattern', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="text"
          placeholder="例如: \\d+|[a-zA-Z]+|\\w+@\\w+\\.\\w+"
        />
        <div class="property-hint">使用正则表达式提取匹配的文本，多个匹配结果将用换行符分隔</div>
      </div>
    </template>

    <template v-else-if="node.type === 'data-filter'">
      <div class="property-group">
        <label class="property-label">过滤类型</label>
        <select 
          :value="localNode.config.filterType || ''"
          @change="updateConfig('filterType', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="contains">包含文本</option>
          <option value="not-contains">不包含文本</option>
          <option value="starts-with">以...开头</option>
          <option value="ends-with">以...结尾</option>
          <option value="regex">正则表达式</option>
          <option value="length">长度过滤</option>
          <option value="numeric">数值过滤</option>
        </select>
      </div>
      <div v-if="localNode.config.filterType === 'contains' || localNode.config.filterType === 'not-contains' || localNode.config.filterType === 'starts-with' || localNode.config.filterType === 'ends-with'" class="property-group">
        <label class="property-label">过滤文本</label>
        <input 
          :value="localNode.config.filterText || ''"
          @input="updateConfig('filterText', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="text"
          placeholder="要过滤的文本内容"
        />
      </div>
      <div v-if="localNode.config.filterType === 'regex'" class="property-group">
        <label class="property-label">正则表达式</label>
        <input 
          :value="localNode.config.filterRegex || ''"
          @input="updateConfig('filterRegex', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="text"
          placeholder="例如: ^\\d+$|[a-zA-Z]+|\\w+@\\w+\\.\\w+"
        />
        <div class="property-hint">使用正则表达式匹配文本，匹配的内容将被保留</div>
      </div>
      <div v-if="localNode.config.filterType === 'length'" class="property-group">
        <label class="property-label">长度条件</label>
        <select 
          :value="localNode.config.lengthCondition || ''"
          @change="updateConfig('lengthCondition', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="greater">大于</option>
          <option value="less">小于</option>
          <option value="equal">等于</option>
          <option value="between">介于</option>
        </select>
      </div>
      <div v-if="localNode.config.filterType === 'length' && localNode.config.lengthCondition !== 'between'" class="property-group">
        <label class="property-label">长度值</label>
        <input 
          v-model.number="localNode.config.lengthValue"
          class="property-input"
          type="number"
          min="0"
          placeholder="字符长度"
          @input="updateConfig('lengthValue', Number(($event.target as HTMLInputElement)?.value))"
        />
      </div>
      <div v-if="localNode.config.filterType === 'length' && localNode.config.lengthCondition === 'between'" class="property-group">
        <label class="property-label">最小长度</label>
        <input 
          :value="localNode.config.minLength || ''"
          class="property-input"
          type="number"
          min="0"
          placeholder="最小字符长度"
          @input="updateConfig('minLength', Number(($event.target as HTMLInputElement)?.value))"
        />
      </div>
      <div v-if="localNode.config.filterType === 'length' && localNode.config.lengthCondition === 'between'" class="property-group">
        <label class="property-label">最大长度</label>
        <input 
          :value="localNode.config.maxLength || ''"
          class="property-input"
          type="number"
          min="0"
          placeholder="最大字符长度"
          @input="updateConfig('maxLength', Number(($event.target as HTMLInputElement)?.value))"
        />
      </div>
      <div v-if="localNode.config.filterType === 'numeric'" class="property-group">
        <label class="property-label">数值条件</label>
        <select 
          :value="localNode.config.numericCondition || ''"
          @change="updateConfig('numericCondition', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="greater">大于</option>
          <option value="less">小于</option>
          <option value="equal">等于</option>
          <option value="between">介于</option>
        </select>
      </div>
      <div v-if="localNode.config.filterType === 'numeric' && localNode.config.numericCondition !== 'between'" class="property-group">
        <label class="property-label">数值</label>
        <input 
          :value="localNode.config.numericValue || ''"
          class="property-input"
          type="number"
          step="any"
          placeholder="比较的数值"
          @input="updateConfig('numericValue', Number(($event.target as HTMLInputElement)?.value))"
        />
      </div>
      <div v-if="localNode.config.filterType === 'numeric' && localNode.config.numericCondition === 'between'" class="property-group">
        <label class="property-label">最小值</label>
        <input 
          :value="localNode.config.minValue || ''"
          class="property-input"
          type="number"
          step="any"
          placeholder="最小数值"
          @input="updateConfig('minValue', Number(($event.target as HTMLInputElement)?.value))"
        />
      </div>
      <div v-if="localNode.config.filterType === 'numeric' && localNode.config.numericCondition === 'between'" class="property-group">
        <label class="property-label">最大值</label>
        <input 
          :value="localNode.config.maxValue || ''"
          class="property-input"
          type="number"
          step="any"
          placeholder="最大数值"
          @input="updateConfig('maxValue', Number(($event.target as HTMLInputElement)?.value))"
        />
      </div>
      <div class="property-group">
        <label class="property-label">输出模式</label>
        <select 
          :value="localNode.config.outputMode || ''"
          @change="updateConfig('outputMode', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="matched">匹配的内容</option>
          <option value="filtered">过滤后的内容</option>
          <option value="count">匹配数量</option>
        </select>
        <div class="property-hint">选择输出匹配的内容、过滤后的内容或匹配数量</div>
      </div>
    </template>

    <template v-else-if="node.type === 'ai-analysis'">
      <div class="property-group">
        <label class="property-label">选择提供商</label>
        <select 
          :value="localNode.config.selectedProvider || ''"
          @change="updateConfig('selectedProvider', ($event.target as HTMLSelectElement).value)"
          class="property-input"
        >
          <option value="">请选择提供商...</option>
          <option 
            v-for="provider in availableProviders.filter(p => p.enable)"
            :key="provider.id"
            :value="provider.id"
          >
            {{ provider.name }}
          </option>
        </select>
      </div>
      <div class="property-group">
        <label class="property-label">选择模型</label>
        <select 
          :value="localNode.config.selectedModel || ''"
          @change="updateConfig('selectedModel', ($event.target as HTMLSelectElement).value)"
          class="property-input"
          :disabled="!localNode.config.selectedProvider"
        >
          <option value="">请选择模型...</option>
          <option 
            v-for="model in availableModels"
            :key="model.id"
            :value="model.id"
          >
            {{ model.name || model.id }}
          </option>
        </select>
      </div>
      <div class="property-group">
        <label class="property-label">分析类型</label>
        <select 
          :value="localNode.config.analysisType || ''"
          @change="updateConfig('analysisType', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="sentiment">情感分析</option>
          <option value="summary">内容摘要</option>
          <option value="keywords">关键词提取</option>
          <option value="classification">文本分类</option>
          <option value="entity">实体识别</option>
          <option value="custom">自定义分析</option>
        </select>
      </div>
      <div v-if="localNode.config.analysisType === 'custom'" class="property-group">
        <label class="property-label">自定义提示词</label>
        <textarea 
          :value="localNode.config.customPrompt || ''"
          @input="updateConfig('customPrompt', ($event.target as HTMLTextAreaElement)?.value)"
          class="property-input property-textarea"
          placeholder="请输入自定义的分析提示词，例如：请分析以下文本的主要观点和论据..."
          rows="4"
        />
        <div class="property-hint">自定义提示词将用于指导AI进行特定的文本分析</div>
      </div>
      <div v-if="localNode.config.analysisType === 'classification'" class="property-group">
        <label class="property-label">分类标签</label>
        <textarea 
          :value="localNode.config.classificationLabels || ''"
          @input="updateConfig('classificationLabels', ($event.target as HTMLTextAreaElement)?.value)"
          class="property-input property-textarea"
          placeholder="请输入分类标签，每行一个，例如：\n正面\n负面\n中性"
          rows="3"
        />
        <div class="property-hint">每行输入一个分类标签，AI将从这些标签中选择最合适的</div>
      </div>
      <div class="property-group">
        <label class="property-label">输出格式</label>
        <select 
          :value="localNode.config.outputFormat || ''"
          @change="updateConfig('outputFormat', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="text">纯文本</option>
          <option value="json">JSON格式</option>
          <option value="structured">结构化文本</option>
        </select>
      </div>
      <div class="property-group">
        <label class="property-label">温度参数</label>
        <input 
          :value="localNode.config.temperature || ''"
          class="property-input"
          type="number"
          min="0"
          max="2"
          step="0.1"
          placeholder="0.3"
          @input="updateConfig('temperature', Number(($event.target as HTMLInputElement)?.value))"
        />
        <div class="property-hint">较低的温度值(0.1-0.3)适合分析任务，确保结果更稳定</div>
      </div>
      <div class="property-group">
        <label class="property-label">最大令牌数</label>
        <input 
          :value="localNode.config.maxTokens || ''"
          class="property-input"
          type="number"
          min="1"
          max="4096"
          placeholder="1024"
          @input="updateConfig('maxTokens', Number(($event.target as HTMLInputElement)?.value))"
        />
      </div>
    </template>



    <template v-else-if="node.type === 'condition'">
      <div class="property-group">
        <label class="property-label">条件类型</label>
        <select 
          :value="localNode.config.conditionType || ''"
          @change="updateConfig('conditionType', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="equal">等于</option>
          <option value="not-equal">不等于</option>
          <option value="contains">包含</option>
          <option value="not-contains">不包含</option>
          <option value="greater">大于</option>
          <option value="less">小于</option>
          <option value="greater-equal">大于等于</option>
          <option value="less-equal">小于等于</option>
          <option value="regex">正则匹配</option>
          <option value="empty">为空</option>
          <option value="not-empty">不为空</option>
        </select>
      </div>
      <div v-if="localNode.config.conditionType !== 'empty' && localNode.config.conditionType !== 'not-empty'" class="property-group">
        <label class="property-label">比较值</label>
        <input 
          :value="localNode.config.compareValue || ''"
          @input="updateConfig('compareValue', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="text"
          placeholder="输入比较的值"
        />
        <div v-if="localNode.config.conditionType === 'regex'" class="property-hint">
          使用正则表达式进行匹配，例如：^\\d+$ 匹配纯数字
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">数据类型</label>
        <select 
          :value="localNode.config.dataType || ''"
          @change="updateConfig('dataType', ($event.target as HTMLSelectElement)?.value)"
          class="property-input"
        >
          <option value="string">文本</option>
          <option value="number">数字</option>
          <option value="boolean">布尔值</option>
        </select>
        <div class="property-hint">选择输入数据的类型以进行正确的比较</div>
      </div>
      <div class="property-group">
        <label class="property-label">真值输出</label>
        <input 
          :value="localNode.config.trueOutput || ''"
          @input="updateConfig('trueOutput', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="text"
          placeholder="条件为真时的输出值"
        />
      </div>
      <div class="property-group">
        <label class="property-label">假值输出</label>
        <input 
          :value="localNode.config.falseOutput || ''"
          @input="updateConfig('falseOutput', ($event.target as HTMLInputElement)?.value)"
          class="property-input"
          type="text"
          placeholder="条件为假时的输出值"
        />
      </div>
    </template>

    <template v-else-if="node.type === 'model-service'">
      <div class="property-group">
        <label class="property-label">选择提供商</label>
        <select 
          :value="localNode.config.selectedProvider || ''"
          class="property-input"
          @change="updateConfig('selectedProvider', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择提供商...</option>
          <option 
            v-for="provider in availableProviders.filter(p => p.enable)"
            :key="provider.id"
            :value="provider.id"
          >
            {{ provider.name }}
          </option>
        </select>
      </div>
      <div class="property-group">
        <label class="property-label">选择模型</label>
        <select 
          :value="localNode.config.selectedModel || ''"
          class="property-input"
          @change="updateConfig('selectedModel', ($event.target as HTMLSelectElement).value)"
          :disabled="!localNode.config.selectedProvider"
        >
          <option value="">请选择模型...</option>
          <option 
            v-for="model in availableModels"
            :key="model.id"
            :value="model.id"
          >
            {{ model.name || model.id }}
          </option>
        </select>
      </div>
      <div class="property-group">
        <label class="property-label">温度参数</label>
        <input 
          :value="localNode.config.temperature || ''"
          class="property-input"
          type="number"
          min="0"
          max="2"
          step="0.1"
          placeholder="0.7"
          @input="updateConfig('temperature', Number(($event.target as HTMLInputElement)?.value))"
        />
      </div>
      <div class="property-group">
        <label class="property-label">最大令牌数</label>
        <input 
          :value="localNode.config.maxTokens || ''"
          class="property-input"
          type="number"
          min="1"
          max="4096"
          placeholder="2048"
          @input="updateConfig('maxTokens', Number(($event.target as HTMLInputElement)?.value))"
        />
      </div>
    </template>

    <div class="property-group">
      <label class="property-label">位置</label>
      <div class="position-inputs">
        <div class="position-input-group">
          <label class="position-label">X:</label>
          <input 
            :value="localNode.x || ''"
            class="position-input"
            type="number"
            @input="updateProperty('x', Number(($event.target as HTMLInputElement)?.value))"
          />
        </div>
        <div class="position-input-group">
          <label class="position-label">Y:</label>
          <input 
            :value="localNode.y || ''"
            class="position-input"
            type="number"
            @input="updateProperty('y', Number(($event.target as HTMLInputElement)?.value))"
          />
        </div>
      </div>
    </div>

    <!-- 删除节点按钮 -->
    <div class="property-group">
      <button 
        class="delete-button"
        @click="deleteNode"
        title="删除此节点"
      >
        <Icon icon="mdi:delete" class="delete-icon" />
        删除节点
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, reactive, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import type { LLM_PROVIDER, MODEL_META } from '@shared/presenter'

interface WorkflowNode {
  id: string
  type: string
  name: string
  x: number
  y: number
  config: Record<string, unknown>
  inputs: (string | { name: string })[]
  outputs: (string | { name: string })[]
}

interface Props {
  node: WorkflowNode
}

interface Emits {
  update: [updates: Partial<WorkflowNode>]
  delete: [nodeId: string]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const localNode = reactive({ ...props.node })

// 动态获取的提供者和模型数据
const availableProviders = ref<LLM_PROVIDER[]>([])
const availableModels = ref<MODEL_META[]>([])

// API测试相关状态
const isTestingApi = ref(false)
const apiTestResult = ref<{ success: boolean; message: string } | null>(null)

// 获取提供者列表
const loadProviders = async () => {
  try {
    if (window.electron?.ipcRenderer) {
      const providers = await window.electron.ipcRenderer.invoke('get-llm-providers')
      availableProviders.value = providers || []
    }
  } catch (error) {
    console.error('获取提供者列表失败:', error)
  }
}

// 获取指定提供者的模型列表
const loadModels = async (providerId: string) => {
  try {
    if (window.electron?.ipcRenderer && providerId) {
      const models = await window.electron.ipcRenderer.invoke('get-provider-models', providerId)
      availableModels.value = models || []
    }
  } catch (error) {
    console.error('获取模型列表失败:', error)
    availableModels.value = []
  }
}

// 监听提供者选择变化，自动加载对应的模型
watch(() => localNode.config.selectedProvider, (newProviderId) => {
  if (newProviderId) {
    loadModels(newProviderId as string)
  } else {
    availableModels.value = []
  }
})

// 组件挂载时加载提供者列表
onMounted(() => {
  loadProviders()
  // 如果已经选择了提供者，加载对应的模型
  if (localNode.config.selectedProvider) {
    loadModels(localNode.config.selectedProvider as string)
  }
})

// 监听props变化，更新本地数据
watch(() => props.node, (newNode) => {
  Object.assign(localNode, newNode)
}, { deep: true })

const getNodeTypeLabel = () => {
  const labelMap: Record<string, string> = {
    'file-input': '文件输入',
    'text-input': '文本输入',
    'api-input': 'API输入',
    'database-input': '数据库输入',
    'text-transform': '文本处理',
    'data-filter': '数据过滤',
    'ai-analysis': 'AI分析',
    'condition': '条件判断',
    'loop': '循环处理',
    'file-output': '文件输出',
    'email-output': '邮件发送',
    'api-output': 'API输出',
    'notification': '通知'
  }
  return labelMap[props.node.type] || props.node.type
}

const updateProperty = (key: string, value: string | number) => {
  emit('update', { [key]: value })
}

const updateConfig = (key: string, value: string | number) => {
  const newConfig = { ...localNode.config, [key]: value }
  emit('update', { config: newConfig })
}

const deleteNode = () => {
  if (confirm('确定要删除这个节点吗？此操作无法撤销。')) {
    emit('delete', props.node.id)
  }
}

// API测试方法
const testApiRequest = async () => {
  if (!localNode.config.apiUrl) {
    apiTestResult.value = { success: false, message: '请先输入API URL' }
    return
  }

  isTestingApi.value = true
  apiTestResult.value = null

  try {
    const url = localNode.config.apiUrl as string
    const method = (localNode.config.method as string) || 'GET'
    
    // 解析请求头
    let headers: Record<string, string> = {}
    if (localNode.config.headers) {
      try {
        headers = JSON.parse(localNode.config.headers as string)
      } catch {
        apiTestResult.value = { success: false, message: '请求头JSON格式错误' }
        return
      }
    }

    // 准备请求配置
    const requestConfig: {
      method: string
      headers: Record<string, string>
      body?: string
    } = {
      method,
      headers
    }

    // 如果是POST、PUT请求且有JSON参数，添加到请求体
    if ((method === 'POST' || method === 'PUT') && localNode.config.jsonParams) {
      try {
        const jsonData = JSON.parse(localNode.config.jsonParams as string)
        requestConfig.body = JSON.stringify(jsonData)
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json'
        }
      } catch {
        apiTestResult.value = { success: false, message: 'JSON参数格式错误' }
        return
      }
    }

    // 发送请求
    const response = await fetch(url, requestConfig)
    const responseText = await response.text()
    
    if (response.ok) {
      apiTestResult.value = {
        success: true,
        message: `状态码: ${response.status}\n响应: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`
      }
    } else {
      apiTestResult.value = {
        success: false,
        message: `请求失败 (${response.status}): ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`
      }
    }
  } catch (error) {
    apiTestResult.value = {
      success: false,
      message: `网络错误: ${error instanceof Error ? error.message : '未知错误'}`
    }
  } finally {
    isTestingApi.value = false
  }
}
</script>

<style scoped>
.node-properties {
  color: #ffffff;
}

.property-group {
  margin-bottom: 20px;
}

.property-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #e0e0e0;
}

.property-input {
  width: 100%;
  padding: 8px 12px;
  background: #333333;
  border: 1px solid #404040;
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  transition: border-color 0.2s;
}

.property-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
}

.property-textarea {
  min-height: 80px;
  resize: vertical;
  font-family: inherit;
}

.property-value {
  padding: 8px 12px;
  background: #2a2a2a;
  border: 1px solid #404040;
  border-radius: 6px;
  color: #888;
  font-size: 13px;
}

.position-inputs {
  display: flex;
  gap: 12px;
}

.position-input-group {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.position-label {
  font-size: 12px;
  color: #888;
  min-width: 20px;
}

.position-input {
  flex: 1;
  padding: 6px 8px;
  background: #333333;
  border: 1px solid #404040;
  border-radius: 4px;
  color: #ffffff;
  font-size: 12px;
}

.position-input:focus {
  outline: none;
  border-color: #60a5fa;
}

select.property-input {
  cursor: pointer;
}

select.property-input option {
  background: #333333;
  color: #ffffff;
}

.delete-button {
  width: 100%;
  padding: 10px 16px;
  background: #dc2626;
  border: 1px solid #b91c1c;
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.delete-button:hover {
  background: #b91c1c;
  border-color: #991b1b;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
}

.delete-button:active {
  background: #991b1b;
  transform: translateY(1px);
}

.delete-icon {
  width: 16px;
  height: 16px;
}

.test-button {
  width: 100%;
  padding: 8px 16px;
  background: #059669;
  border: 1px solid #047857;
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

.test-button:hover {
  background: #047857;
  border-color: #065f46;
  box-shadow: 0 2px 8px rgba(5, 150, 105, 0.3);
}

.test-button:active {
  background: #065f46;
  transform: translateY(1px);
}

.test-button:disabled {
  background: #374151;
  border-color: #4b5563;
  color: #9ca3af;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.test-result {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.test-result.success {
  background: rgba(5, 150, 105, 0.1);
  border: 1px solid #059669;
  color: #10b981;
}

.test-result.error {
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid #dc2626;
  color: #ef4444;
}

.property-hint {
  font-size: 11px;
  color: #888;
  margin-top: 4px;
  line-height: 1.4;
}
</style>