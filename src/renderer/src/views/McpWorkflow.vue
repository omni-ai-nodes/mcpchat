<template>
  <div class="h-full flex bg-background">
    <!-- 左侧工具面板 -->
    <div class="w-80 border-r bg-card flex flex-col">
      <!-- 工具面板标题 -->
      <div class="p-4 border-b">
        <h2 class="text-lg font-semibold">{{ t('common.mcp.workflow.toolPanel') }}</h2>
        <p class="text-sm text-muted-foreground mt-1">{{ t('common.mcp.workflow.toolPanelDesc') }}</p>
      </div>
      
      <!-- 工具分类 -->
      <div class="flex-1 overflow-y-auto p-4">
        <div class="space-y-6">
          <!-- 输入节点 -->
          <div>
            <h3 class="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">{{ t('common.mcp.workflow.inputNodes') }}</h3>
            <div class="space-y-2">
              <div 
                v-for="node in inputNodes" 
                :key="node.type"
                class="p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
                draggable="true"
                @click="addNode(node)"
                @dragstart="onDragStart(node, $event)"
              >
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Icon :icon="node.icon" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div class="text-sm font-medium">{{ node.name }}</div>
                    <div class="text-xs text-muted-foreground">{{ node.description }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 处理节点 -->
          <div>
            <h3 class="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">{{ t('common.mcp.workflow.processNodes') }}</h3>
            <div class="space-y-2">
              <div 
                v-for="node in processNodes" 
                :key="node.type"
                class="p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
                draggable="true"
                @click="addNode(node)"
                @dragstart="onDragStart(node, $event)"
              >
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <Icon :icon="node.icon" class="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <div class="text-sm font-medium">{{ node.name }}</div>
                    <div class="text-xs text-muted-foreground">{{ node.description }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 输出节点 -->
          <div>
            <h3 class="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">{{ t('common.mcp.workflow.outputNodes') }}</h3>
            <div class="space-y-2">
              <div 
                v-for="node in outputNodes" 
                :key="node.type"
                class="p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
                draggable="true"
                @click="addNode(node)"
                @dragstart="onDragStart(node, $event)"
              >
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                    <Icon :icon="node.icon" class="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <div class="text-sm font-medium">{{ node.name }}</div>
                    <div class="text-xs text-muted-foreground">{{ node.description }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 主工作区 -->
    <div class="flex-1 flex flex-col">
      <!-- 顶部工具栏 -->
      <div class="h-14 border-b bg-card flex items-center justify-between px-4">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-semibold">{{ currentWorkflow.name || t('common.mcp.workflow.untitled') }}</h1>
          <Badge variant="outline">{{ t('common.mcp.workflow.draft') }}</Badge>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="saveWorkflow">
            <Icon icon="lucide:save" class="w-4 h-4 mr-2" />
            {{ t('common.mcp.workflow.save') }}
          </Button>
          <Button variant="outline" size="sm" @click="runWorkflow">
            <Icon icon="lucide:play" class="w-4 h-4 mr-2" />
            {{ t('common.mcp.workflow.run') }}
          </Button>
          <Button size="sm" @click="deployWorkflow">
            <Icon icon="lucide:rocket" class="w-4 h-4 mr-2" />
            {{ t('common.mcp.workflow.deploy') }}
          </Button>
        </div>
      </div>

      <!-- 画布区域 -->
      <div class="flex-1 relative overflow-hidden bg-slate-50 dark:bg-slate-900">
        <!-- 网格背景 -->
        <div class="absolute inset-0 opacity-20">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" stroke-width="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <!-- 工作流画布 -->
        <div 
          ref="canvasRef" 
          class="relative w-full h-full"
          @drop="onDrop"
          @dragover="onDragOver"
          @mousemove="onCanvasMouseMove"
          @mouseup="onCanvasMouseUp"
          @click="onCanvasClick"
        >
          <!-- 工作流节点 -->
          <WorkflowNode
              v-for="node in workflowNodes"
              :key="node.id"
              :node="node"
              :is-selected="selectedNode?.id === node.id"
              @select="selectNode"
              @delete="deleteNode"
              @update="updateNode"
              @start-connection="startConnection"
            />

          <!-- 连接线 -->
          <svg class="absolute inset-0 pointer-events-none" style="z-index: 1">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#60a5fa" />
              </marker>
            </defs>
            <!-- 已建立的连接 -->
            <path 
              v-for="connection in connections" 
              :key="connection.id"
              :d="getConnectionPath(connection)"
              stroke="#60a5fa"
              stroke-width="3"
              fill="none"
              marker-end="url(#arrowhead)"
              class="cursor-pointer hover:stroke-red-400"
              @click="deleteConnection(connection.id)"
            />
            <!-- 临时连接线 -->
            <path 
              v-if="tempConnection"
              :d="getTempConnectionPath()"
              stroke="#60a5fa"
              stroke-width="2"
              fill="none"
              stroke-dasharray="5,5"
              opacity="0.7"
            />
          </svg>

          <!-- 空状态 -->
          <div v-if="workflowNodes.length === 0" class="absolute inset-0 flex items-center justify-center">
            <div class="text-center text-muted-foreground">
              <Icon icon="lucide:workflow" class="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 class="text-lg font-medium mb-2">{{ t('common.mcp.workflow.emptyCanvas') }}</h3>
              <p class="text-sm">{{ t('common.mcp.workflow.emptyCanvasDesc') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧属性面板 -->
    <div class="w-80 border-l bg-card flex flex-col" v-if="selectedNode">
      <div class="p-4 border-b">
        <h2 class="text-lg font-semibold">{{ t('common.mcp.workflow.properties') }}</h2>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <NodeProperties 
          :node="selectedNode"
          @update="updateSelectedNode"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@iconify/vue'
import WorkflowNode from '@/components/workflow/WorkflowNode.vue'
import NodeProperties from '@/components/workflow/NodeProperties.vue'

const { t } = useI18n()

// 节点类型定义
interface NodeTemplate {
  type: string
  name: string
  description: string
  icon: string
  category: 'input' | 'process' | 'output'
}

interface WorkflowNode {
  id: string
  type: string
  name: string
  x: number
  y: number
  config: Record<string, any>
  inputs: string[]
  outputs: string[]
}

interface Connection {
  id: string
  from: string
  to: string
  fromPort: string
  toPort: string
}

interface CurrentWorkflow {
  id?: string
  name: string
  description: string
  nodes: WorkflowNode[]
  connections: Connection[]
}

// 响应式数据
const canvasRef = ref<HTMLElement>()
const selectedNode = ref<WorkflowNode | null>(null)
const workflowNodes = ref<WorkflowNode[]>([])
const connections = ref<Connection[]>([])
const currentWorkflow = reactive<CurrentWorkflow>({
  name: '',
  description: '',
  nodes: [],
  connections: []
})

// 节点模板
const inputNodes: NodeTemplate[] = [
  {
    type: 'file-input',
    name: '文件输入',
    description: '读取本地文件',
    icon: 'lucide:file-input',
    category: 'input'
  },
  {
    type: 'text-input',
    name: '文本输入',
    description: '手动输入文本',
    icon: 'lucide:type',
    category: 'input'
  },
  {
    type: 'api-input',
    name: 'API输入',
    description: '从API获取数据',
    icon: 'lucide:globe',
    category: 'input'
  },
  {
    type: 'database-input',
    name: '数据库输入',
    description: '从数据库读取',
    icon: 'lucide:database',
    category: 'input'
  }
]

const processNodes: NodeTemplate[] = [
  {
    type: 'text-transform',
    name: '文本处理',
    description: '文本转换和处理',
    icon: 'lucide:text-cursor',
    category: 'process'
  },
  {
    type: 'data-filter',
    name: '数据过滤',
    description: '过滤和筛选数据',
    icon: 'lucide:filter',
    category: 'process'
  },
  {
    type: 'ai-analysis',
    name: 'AI分析',
    description: '使用AI进行分析',
    icon: 'lucide:brain',
    category: 'process'
  },
  {
    type: 'condition',
    name: '条件判断',
    description: '根据条件分支',
    icon: 'lucide:git-branch',
    category: 'process'
  },
  {
    type: 'loop',
    name: '循环处理',
    description: '重复执行操作',
    icon: 'lucide:repeat',
    category: 'process'
  }
]

const outputNodes: NodeTemplate[] = [
  {
    type: 'file-output',
    name: '文件输出',
    description: '保存到文件',
    icon: 'lucide:file-output',
    category: 'output'
  },
  {
    type: 'email-output',
    name: '邮件发送',
    description: '发送邮件通知',
    icon: 'lucide:mail',
    category: 'output'
  },
  {
    type: 'api-output',
    name: 'API输出',
    description: '发送到API',
    icon: 'lucide:send',
    category: 'output'
  },
  {
    type: 'notification',
    name: '通知',
    description: '系统通知',
    icon: 'lucide:bell',
    category: 'output'
  }
]

// 方法
const addNode = (template: NodeTemplate) => {
  const newNode: WorkflowNode = {
    id: `node_${Date.now()}`,
    type: template.type,
    name: template.name,
    x: Math.random() * 400 + 200,
    y: Math.random() * 300 + 150,
    config: {},
    inputs: template.category === 'input' ? [] : ['input'],
    outputs: template.category === 'output' ? [] : ['output']
  }
  
  workflowNodes.value.push(newNode)
  selectedNode.value = newNode
}

const updateNode = (nodeId: string, updates: Partial<WorkflowNode>) => {
  const nodeIndex = workflowNodes.value.findIndex(n => n.id === nodeId)
  if (nodeIndex !== -1) {
    workflowNodes.value[nodeIndex] = { ...workflowNodes.value[nodeIndex], ...updates }
  }
}

const deleteNode = (nodeId: string) => {
  workflowNodes.value = workflowNodes.value.filter(n => n.id !== nodeId)
  connections.value = connections.value.filter(c => c.from !== nodeId && c.to !== nodeId)
  if (selectedNode.value?.id === nodeId) {
    selectedNode.value = null
  }
}

// 连接状态
const isConnecting = ref(false)
const connectionStart = ref<{ nodeId: string, port: string, type: 'input' | 'output' } | null>(null)
const tempConnection = ref<{ x1: number, y1: number, x2: number, y2: number } | null>(null)

const startConnection = (nodeId: string, port: string, type: 'input' | 'output') => {
  // 只处理开始连接，不处理完成连接（完成连接由mouseup事件处理）
  if (!isConnecting.value) {
    // 开始连接
    isConnecting.value = true
    connectionStart.value = { nodeId, port, type }
    
    // 计算起始位置
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node) {
      const portIndex = type === 'input' ? (node.inputs?.indexOf(port) || 0) : (node.outputs?.indexOf(port) || 0)
      const x = type === 'output' ? node.x + 200 : node.x
      const y = node.y + 20 + portIndex * 30
      tempConnection.value = { x1: x, y1: y, x2: x, y2: y }
    }
  }
}

const updateSelectedNode = (updates: Partial<WorkflowNode>) => {
  if (selectedNode.value) {
    updateNode(selectedNode.value.id, updates)
    selectedNode.value = { ...selectedNode.value, ...updates }
  }
}

const getConnectionPath = (connection: Connection) => {
  // 连接线路径计算
  const fromNode = workflowNodes.value.find(n => n.id === connection.from)
  const toNode = workflowNodes.value.find(n => n.id === connection.to)
  
  if (!fromNode || !toNode) return ''
  
  // 输出端口在节点右侧，输入端口在节点左侧
  const fromX = fromNode.x + 200 // 节点宽度200px，输出端口在右侧
  const fromY = fromNode.y + 40  // 端口垂直居中位置
  const toX = toNode.x           // 输入端口在左侧
  const toY = toNode.y + 40
  
  // 创建更自然的贝塞尔曲线
  const distance = Math.abs(toX - fromX)
  const controlOffset = Math.min(distance * 0.5, 100)
  const cp1X = fromX + controlOffset
  const cp1Y = fromY
  const cp2X = toX - controlOffset
  const cp2Y = toY
  
  return `M ${fromX} ${fromY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${toX} ${toY}`
}

const selectNode = (nodeId: string) => {
  const node = workflowNodes.value.find(n => n.id === nodeId)
  selectedNode.value = node || null
}

const onDragStart = (template: NodeTemplate, event: DragEvent) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', template.type)
    event.dataTransfer.effectAllowed = 'copy'
  }
}

const onDrop = (event: DragEvent) => {
  event.preventDefault()
  const nodeType = event.dataTransfer?.getData('text/plain')
  if (nodeType) {
    const template = [...inputNodes, ...processNodes, ...outputNodes].find(n => n.type === nodeType)
    if (template) {
      const rect = canvasRef.value?.getBoundingClientRect()
      if (rect) {
        const newNode: WorkflowNode = {
          id: `node_${Date.now()}`,
          type: template.type,
          name: template.name,
          x: event.clientX - rect.left - 100,
          y: event.clientY - rect.top - 40,
          config: {},
          inputs: template.category === 'input' ? [] : ['input'],
          outputs: template.category === 'output' ? [] : ['output']
        }
        workflowNodes.value.push(newNode)
        selectedNode.value = newNode
      }
    }
  }
}

const onCanvasMouseMove = (event: MouseEvent) => {
  if (isConnecting.value && tempConnection.value && canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    
    // 检测是否悬停在端口上
    const hoveredPort = getPortAtPosition(mouseX, mouseY)
    if (hoveredPort && connectionStart.value) {
      // 如果悬停在有效端口上，连接到该端口
      const { nodeId, port, type } = hoveredPort
      if (connectionStart.value.nodeId !== nodeId && connectionStart.value.type !== type) {
        // 计算端口位置
        const node = workflowNodes.value.find(n => n.id === nodeId)
        if (node) {
          const portIndex = type === 'input' ? (node.inputs?.indexOf(port) || 0) : (node.outputs?.indexOf(port) || 0)
          const portX = type === 'output' ? node.x + 200 : node.x
          const portY = node.y + 20 + portIndex * 30
          tempConnection.value.x2 = portX
          tempConnection.value.y2 = portY
        }
      } else {
        tempConnection.value.x2 = mouseX
        tempConnection.value.y2 = mouseY
      }
    } else {
      tempConnection.value.x2 = mouseX
      tempConnection.value.y2 = mouseY
    }
  }
}

const onCanvasMouseUp = (event: MouseEvent) => {
  if (isConnecting.value && connectionStart.value && canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    
    // 检测是否在端口上释放
    const hoveredPort = getPortAtPosition(mouseX, mouseY)
    if (hoveredPort && connectionStart.value.nodeId !== hoveredPort.nodeId && connectionStart.value.type !== hoveredPort.type) {
      // 建立连接
      const newConnection: Connection = {
        id: `conn_${Date.now()}`,
        from: connectionStart.value.type === 'output' ? connectionStart.value.nodeId : hoveredPort.nodeId,
        to: connectionStart.value.type === 'output' ? hoveredPort.nodeId : connectionStart.value.nodeId,
        fromPort: connectionStart.value.type === 'output' ? connectionStart.value.port : hoveredPort.port,
        toPort: connectionStart.value.type === 'output' ? hoveredPort.port : connectionStart.value.port
      }
      connections.value.push(newConnection)
    }
    
    // 重置连接状态
    isConnecting.value = false
    connectionStart.value = null
    tempConnection.value = null
  }
}

const onCanvasClick = (event: MouseEvent) => {
  if (isConnecting.value) {
    // 取消连接
    isConnecting.value = false
    connectionStart.value = null
    tempConnection.value = null
  }
}

const getTempConnectionPath = () => {
  if (!tempConnection.value) return ''
  const { x1, y1, x2, y2 } = tempConnection.value
  
  // 创建与正式连接线相同的贝塞尔曲线
  const distance = Math.abs(x2 - x1)
  const controlOffset = Math.min(distance * 0.5, 100)
  const cp1X = x1 + controlOffset
  const cp1Y = y1
  const cp2X = x2 - controlOffset
  const cp2Y = y2
  
  return `M ${x1} ${y1} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${x2} ${y2}`
}

const getPortAtPosition = (x: number, y: number) => {
  for (const node of workflowNodes.value) {
    // 检查输入端口
    if (node.inputs) {
      for (let i = 0; i < node.inputs.length; i++) {
        const portX = node.x - 8 // 端口中心位置
        const portY = node.y + 20 + i * 30
        const distance = Math.sqrt((x - portX) ** 2 + (y - portY) ** 2)
        if (distance <= 12) { // 端口半径范围
          return { nodeId: node.id, port: node.inputs[i], type: 'input' as const }
        }
      }
    }
    
    // 检查输出端口
    if (node.outputs) {
      for (let i = 0; i < node.outputs.length; i++) {
        const portX = node.x + 208 // 端口中心位置
        const portY = node.y + 20 + i * 30
        const distance = Math.sqrt((x - portX) ** 2 + (y - portY) ** 2)
        if (distance <= 12) { // 端口半径范围
          return { nodeId: node.id, port: node.outputs[i], type: 'output' as const }
        }
      }
    }
  }
  return null
}

const deleteConnection = (connectionId: string) => {
  const index = connections.value.findIndex(c => c.id === connectionId)
  if (index > -1) {
    connections.value.splice(index, 1)
  }
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
}

const saveWorkflow = () => {
  console.log('保存工作流')
  // TODO: 保存工作流
}

const runWorkflow = () => {
  console.log('运行工作流')
  // TODO: 运行工作流
}

const deployWorkflow = () => {
  console.log('部署工作流')
  // TODO: 部署工作流
}
</script>

<style scoped>
.workflow-editor {
  height: 100vh;
  display: flex;
  background: #1a1a1a;
  color: #ffffff;
}

.tool-panel {
  width: 280px;
  background: #2a2a2a;
  border-right: 1px solid #404040;
  overflow-y: auto;
}

.tool-section {
  margin-bottom: 24px;
}

.tool-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  padding: 0 16px;
  color: #e0e0e0;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: #333333;
  border: 1px solid #404040;
}

.tool-item:hover {
  background: #404040;
  border-color: #555555;
  transform: translateY(-1px);
}

.tool-item-icon {
  width: 20px;
  height: 20px;
  color: #60a5fa;
}

.tool-item-content {
  flex: 1;
}

.tool-item-name {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 2px;
}

.tool-item-desc {
  font-size: 11px;
  color: #a0a0a0;
}

.main-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.workspace-header {
  height: 60px;
  background: #2a2a2a;
  border-bottom: 1px solid #404040;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.workspace-title {
  font-size: 18px;
  font-weight: 600;
}

.workspace-actions {
  display: flex;
  gap: 12px;
}

.workspace-canvas {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: 
    radial-gradient(circle at 20px 20px, #333 1px, transparent 1px),
    radial-gradient(circle at 60px 60px, #333 1px, transparent 1px);
  background-size: 40px 40px;
  background-position: 0 0, 20px 20px;
}

.workflow-node {
  position: absolute;
  width: 200px;
  min-height: 80px;
  background: #2a2a2a;
  border: 2px solid #404040;
  border-radius: 12px;
  cursor: move;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.workflow-node:hover {
  border-color: #60a5fa;
  box-shadow: 0 6px 20px rgba(96, 165, 250, 0.2);
}

.workflow-node.selected {
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.3);
}

.node-header {
  padding: 12px 16px;
  border-bottom: 1px solid #404040;
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-icon {
  width: 16px;
  height: 16px;
  color: #60a5fa;
}

.node-title {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
}

.node-content {
  padding: 12px 16px;
  font-size: 12px;
  color: #a0a0a0;
}

.node-ports {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}

.node-input-port {
  left: -6px;
}

.node-output-port {
  right: -6px;
}

.port {
  width: 12px;
  height: 12px;
  background: #60a5fa;
  border: 2px solid #2a2a2a;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.port:hover {
  background: #93c5fd;
  transform: scale(1.2);
}

.connections-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.connection-path {
  fill: none;
  stroke: #60a5fa;
  stroke-width: 2;
  opacity: 0.8;
}

.properties-panel {
  width: 320px;
  background: #2a2a2a;
  border-left: 1px solid #404040;
  overflow-y: auto;
}

.properties-header {
  padding: 20px;
  border-bottom: 1px solid #404040;
}

.properties-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.properties-subtitle {
  font-size: 12px;
  color: #a0a0a0;
}

.properties-content {
  padding: 20px;
}

.property-group {
  margin-bottom: 24px;
}

.property-label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
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
}

.property-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
}

.property-textarea {
  min-height: 80px;
  resize: vertical;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666666;
}

.empty-state-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state-title {
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 8px;
}

.empty-state-desc {
  font-size: 14px;
  text-align: center;
  max-width: 300px;
  line-height: 1.5;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: #1a1a1a;
}

::-webkit-scrollbar-thumb {
  background: #404040;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555555;
}
</style>