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
          class="relative w-full h-full min-h-full"
          style="min-height: 100%; pointer-events: auto;"
          @drop="onDrop"
          @dragover="onDragOver"
          @mousemove="onCanvasMouseMove"
          @mouseup="onCanvasMouseUp"
          @click="onCanvasClick"
        >
          <!-- 连接线层 -->
          <svg class="absolute inset-0 pointer-events-none" style="z-index: 1; width: 100%; height: 100%;">
            <!-- 已建立的连接 -->
            <path 
              v-for="connection in connections" 
              :key="connection.id"
              :d="getConnectionPath(connection)"
              stroke="#60a5fa"
              stroke-width="3"
              fill="none"
              class="connection-path cursor-pointer"
              style="pointer-events: stroke;"
              @click="deleteConnection(connection.id)"
            />
            <!-- 临时连接线 -->
            <path 
              v-if="tempConnection"
              :d="getTempConnectionPath()"
              :stroke="tempConnection.isHoveringPort ? '#10b981' : '#60a5fa'"
              :stroke-width="tempConnection.isHoveringPort ? '3' : '2'"
              fill="none"
              :stroke-dasharray="tempConnection.isHoveringPort ? 'none' : '5,5'"
              :opacity="tempConnection.isHoveringPort ? '0.9' : '0.7'"
              class="temp-connection"
            />

          </svg>

          <!-- 节点层 -->
          <div class="nodes-container" style="position: relative; z-index: 10; width: 100%; height: 100%;">
            <!-- 工作流节点 -->
            <WorkflowNode
                v-for="node in workflowNodes"
                :key="node.id"
                :node="node"
                :is-selected="selectedNode?.id === node.id"
                :is-connecting="isConnecting"
                :connection-start="connectionStart"
                @select="selectNode"
                @delete="deleteNode"
                @update="updateNode"
                @start-connection="startConnection"
              />
            
            <!-- 空状态 -->
            <div v-if="workflowNodes.length === 0" class="absolute inset-0 flex items-center justify-center" style="z-index: 5;">
              <div class="text-center text-muted-foreground">
                <Icon icon="lucide:workflow" class="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 class="text-lg font-medium mb-2">{{ t('common.mcp.workflow.emptyCanvas') }}</h3>
                <p class="text-sm">{{ t('common.mcp.workflow.emptyCanvasDesc') }}</p>
              </div>
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
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
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
  
  // 同步到当前工作流
  currentWorkflow.nodes = [...workflowNodes.value]
  console.log('节点已添加:', newNode)
}

// 添加节流机制优化连接线更新
let updateAnimationFrame: number | null = null

const updateNode = (nodeId: string, updates: Partial<WorkflowNode>) => {
  const nodeIndex = workflowNodes.value.findIndex(n => n.id === nodeId)
  if (nodeIndex !== -1) {
    workflowNodes.value[nodeIndex] = { ...workflowNodes.value[nodeIndex], ...updates }
    // 同步到当前工作流
    currentWorkflow.nodes = [...workflowNodes.value]
    
    // 使用 requestAnimationFrame 优化连接线重绘
    if (updateAnimationFrame) {
      cancelAnimationFrame(updateAnimationFrame)
    }
    updateAnimationFrame = requestAnimationFrame(() => {
      // 强制触发连接线重新计算
      connections.value = [...connections.value]
      updateAnimationFrame = null
    })
  }
}

const deleteNode = (nodeId: string) => {
  workflowNodes.value = workflowNodes.value.filter(n => n.id !== nodeId)
  connections.value = connections.value.filter(c => c.from !== nodeId && c.to !== nodeId)
  if (selectedNode.value?.id === nodeId) {
    selectedNode.value = null
  }
  
  // 同步到当前工作流
  currentWorkflow.nodes = [...workflowNodes.value]
  currentWorkflow.connections = [...connections.value]
  console.log('节点已删除:', nodeId)
}

// 连接状态
const isConnecting = ref(false)
const connectionStart = ref<{ nodeId: string, port: string, type: 'input' | 'output' } | null>(null)
const tempConnection = ref<{ x1: number, y1: number, x2: number, y2: number, isHoveringPort?: boolean } | null>(null)

const startConnection = (nodeId: string, port: string, type: 'input' | 'output') => {
  // 只处理开始连接，不处理完成连接（完成连接由mouseup事件处理）
  if (!isConnecting.value) {
    // 开始连接
    isConnecting.value = true
    connectionStart.value = { nodeId, port, type }
    
    // 计算起始位置
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node && isFinite(node.x) && isFinite(node.y)) {
      // 修复portIndex计算，确保不会是-1
      let portIndex = 0
      if (type === 'input' && node.inputs) {
        const index = node.inputs.indexOf(port)
        portIndex = index >= 0 ? index : 0
      } else if (type === 'output' && node.outputs) {
        const index = node.outputs.indexOf(port)
        portIndex = index >= 0 ? index : 0
      }
      
      // 计算端口的实际中心位置（与端口样式完全对齐）
      const x = type === 'output' ? node.x + 200 + 2 + 8 : node.x - 16 + 8 // 端口中心位置
      const y = node.y + 20 + portIndex * 30 + 8 // 端口顶部位置 + 端口半径8px
      
      // 验证计算出的坐标
      if (isFinite(x) && isFinite(y)) {
        tempConnection.value = { x1: x, y1: y, x2: x, y2: y, isHoveringPort: false }
      }
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
  
  // 计算输出端口的实际位置（与端口样式完全对齐）
  const fromX = fromNode.x + 200 + 2 + 8 // 节点宽度200px + 端口right偏移2px + 端口半径8px（端口中心）
  const fromY = fromNode.y + 20 + 8      // 端口顶部位置20px + 端口半径8px
  // 计算输入端口的实际位置（与端口样式完全对齐）
  const toX = toNode.x - 16 + 8          // 输入端口left偏移-16px + 端口半径8px（端口中心）
  const toY = toNode.y + 20 + 8          // 端口顶部位置20px + 端口半径8px
  
  // 验证坐标值是否有效
  if (!isFinite(fromX) || !isFinite(fromY) || !isFinite(toX) || !isFinite(toY)) {
    return ''
  }
  
  // 创建更自然的贝塞尔曲线
  const deltaX = toX - fromX
  const deltaY = toY - fromY
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
  
  // 防止除零错误
  if (distance === 0) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`
  }
  
  // 根据距离和方向动态调整控制点
  const baseOffset = Math.min(distance * 0.4, 120)
  const verticalInfluence = Math.abs(deltaY) / distance
  const controlOffset = baseOffset * (1 + verticalInfluence * 0.2)
  
  // 处理反向连接的情况
  const isReverse = deltaX < 0
  const cp1X = fromX + (isReverse ? Math.min(controlOffset, 80) : controlOffset)
  const cp1Y = fromY + deltaY * 0.05
  const cp2X = toX - (isReverse ? Math.min(controlOffset, 80) : controlOffset)
  const cp2Y = toY - deltaY * 0.05
  
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
        
        // 同步到当前工作流
        currentWorkflow.nodes = [...workflowNodes.value]
        console.log('拖拽添加节点:', newNode)
      }
    }
  }
}

// 添加鼠标移动事件节流
let mouseMoveAnimationFrame: number | null = null

const onCanvasMouseMove = (event: MouseEvent) => {
  if (!isConnecting.value || !tempConnection.value || !canvasRef.value) return
  
  // 使用 requestAnimationFrame 节流鼠标移动事件
  if (mouseMoveAnimationFrame) {
    cancelAnimationFrame(mouseMoveAnimationFrame)
  }
  
  mouseMoveAnimationFrame = requestAnimationFrame(() => {
    if (!isConnecting.value || !tempConnection.value || !canvasRef.value) return
    
    const rect = canvasRef.value.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    
    // 检测是否悬停在端口上
    const hoveredPort = getPortAtPosition(mouseX, mouseY)
    
    if (hoveredPort) {
      // 悬停在端口上，吸附到端口中心
      const portElement = document.querySelector(`[data-port-id="${hoveredPort.nodeId}-${hoveredPort.port}-${hoveredPort.type}"]`) as HTMLElement
      if (portElement) {
        const portRect = portElement.getBoundingClientRect()
        const canvasRect = canvasRef.value.getBoundingClientRect()
        
        // 计算端口中心相对于画布的位置
        const portCenterX = portRect.left + portRect.width / 2 - canvasRect.left
        const portCenterY = portRect.top + portRect.height / 2 - canvasRect.top
        
        tempConnection.value.x2 = portCenterX
        tempConnection.value.y2 = portCenterY
        tempConnection.value.isHoveringPort = true
        
        // 检查连接是否有效
        if (connectionStart.value) {
          const isValidConnection = (
            connectionStart.value.type !== hoveredPort.type && // 不能连接同类型端口
            connectionStart.value.nodeId !== hoveredPort.nodeId // 不能连接同一节点
          )
          
          tempConnection.value.isValidConnection = isValidConnection
        }
      } else {
        // 如果没有找到端口元素，使用计算位置
        const { nodeId, port, type } = hoveredPort
        if (connectionStart.value && connectionStart.value.nodeId !== nodeId && connectionStart.value.type !== type) {
          // 计算端口位置
          const node = workflowNodes.value.find(n => n.id === nodeId)
          if (node) {
            const portIndex = type === 'input' ? (node.inputs?.indexOf(port) || 0) : (node.outputs?.indexOf(port) || 0)
            const portX = type === 'output' ? node.x + 200 + 2 + 8 : node.x - 16 + 8
            const portY = node.y + 20 + portIndex * 30 + 8
            tempConnection.value.x2 = portX
            tempConnection.value.y2 = portY
            tempConnection.value.isHoveringPort = true
          }
        } else {
          // 无效连接，跟随鼠标
          tempConnection.value.x2 = mouseX
          tempConnection.value.y2 = mouseY
          tempConnection.value.isHoveringPort = false
        }
      }
    } else {
      // 没有悬停在端口上，跟随鼠标
      tempConnection.value.x2 = mouseX
      tempConnection.value.y2 = mouseY
      tempConnection.value.isHoveringPort = false
    }
    
    mouseMoveAnimationFrame = null
  })
}

const onCanvasMouseUp = (event: MouseEvent) => {
  if (isConnecting.value && connectionStart.value && canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    
    // 检测是否在端口上释放
    const hoveredPort = getPortAtPosition(mouseX, mouseY)
    if (hoveredPort && connectionStart.value.nodeId !== hoveredPort.nodeId && connectionStart.value.type !== hoveredPort.type) {
      // 检查是否已存在完全相同的连接（相同的起始节点、目标节点和端口）
      const fromNode = connectionStart.value.type === 'output' ? connectionStart.value.nodeId : hoveredPort.nodeId
      const toNode = connectionStart.value.type === 'output' ? hoveredPort.nodeId : connectionStart.value.nodeId
      const fromPort = connectionStart.value.type === 'output' ? connectionStart.value.port : hoveredPort.port
      const toPort = connectionStart.value.type === 'output' ? hoveredPort.port : connectionStart.value.port
      
      const existingConnection = connections.value.find(conn => 
        conn.from === fromNode && conn.to === toNode && conn.fromPort === fromPort && conn.toPort === toPort
      )
      
      if (!existingConnection) {
        // 建立新连接
        const newConnection: Connection = {
          id: `conn_${Date.now()}`,
          from: fromNode,
          to: toNode,
          fromPort: fromPort,
          toPort: toPort
        }
        connections.value.push(newConnection)
        
        // 同步到当前工作流
        currentWorkflow.connections = [...connections.value]
        
        console.log('连接已建立:', newConnection)
      }
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
  
  // 验证坐标值是否有效
  if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) {
    return ''
  }
  
  // 创建更自然的贝塞尔曲线，根据距离和方向调整控制点
  const deltaX = x2 - x1
  const deltaY = y2 - y1
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
  
  // 防止除零错误
  if (distance === 0) {
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  
  // 动态调整控制点偏移量
  const baseOffset = Math.min(distance * 0.4, 120)
  const verticalInfluence = Math.abs(deltaY) / distance
  const controlOffset = baseOffset * (1 + verticalInfluence * 0.3)
  
  // 根据连接方向调整控制点
  const cp1X = x1 + controlOffset
  const cp1Y = y1 + deltaY * 0.1 // 轻微跟随垂直方向
  const cp2X = x2 - controlOffset
  const cp2Y = y2 - deltaY * 0.1
  
  return `M ${x1} ${y1} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${x2} ${y2}`
}

const getPortAtPosition = (x: number, y: number) => {
  // 扩大检测范围到整个节点区域，只要接触节点就自动连接
  for (const node of workflowNodes.value) {
    // 验证节点坐标有效性
    if (!isFinite(node.x) || !isFinite(node.y)) continue
    
    // 节点区域定义（200px宽，根据端口数量计算高度）
    const nodeWidth = 200
    const nodeHeight = Math.max(60, 20 + Math.max(node.inputs?.length || 0, node.outputs?.length || 0) * 30 + 20)
    
    // 检查是否在节点区域内
    const inNodeArea = x >= node.x && x <= node.x + nodeWidth && y >= node.y && y <= node.y + nodeHeight
    
    if (inNodeArea) {
      // 检查输入端口区域（节点左半部分）
      if (x <= node.x + nodeWidth / 2 && node.inputs && node.inputs.length > 0) {
        // 根据Y坐标确定最近的输入端口
        let closestPortIndex = 0
        let minDistance = Infinity
        
        for (let i = 0; i < node.inputs.length; i++) {
          const portY = node.y + 20 + i * 30 + 8
          const distance = Math.abs(y - portY)
          if (distance < minDistance) {
            minDistance = distance
            closestPortIndex = i
          }
        }
        
        return { nodeId: node.id, port: node.inputs[closestPortIndex], type: 'input' as const }
      }
      
      // 检查输出端口区域（节点右半部分）
      if (x > node.x + nodeWidth / 2 && node.outputs && node.outputs.length > 0) {
        // 根据Y坐标确定最近的输出端口
        let closestPortIndex = 0
        let minDistance = Infinity
        
        for (let i = 0; i < node.outputs.length; i++) {
          const portY = node.y + 20 + i * 30 + 8
          const distance = Math.abs(y - portY)
          if (distance < minDistance) {
            minDistance = distance
            closestPortIndex = i
          }
        }
        
        return { nodeId: node.id, port: node.outputs[closestPortIndex], type: 'output' as const }
      }
    }
  }
  return null
}

const deleteConnection = (connectionId: string) => {
  const index = connections.value.findIndex(c => c.id === connectionId)
  if (index > -1) {
    connections.value.splice(index, 1)
    // 同步到当前工作流
    currentWorkflow.connections = [...connections.value]
    console.log('连接已删除:', connectionId)
  }
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
}

const saveWorkflow = () => {
  // 更新当前工作流数据
  currentWorkflow.nodes = [...workflowNodes.value]
  currentWorkflow.connections = [...connections.value]
  
  console.log('保存工作流:', {
    name: currentWorkflow.name || '未命名工作流',
    nodes: currentWorkflow.nodes.length,
    connections: currentWorkflow.connections.length,
    data: currentWorkflow
  })
  
  // TODO: 实现实际的保存逻辑（保存到本地存储或服务器）
  alert(`工作流已保存！\n节点数量: ${currentWorkflow.nodes.length}\n连接数量: ${currentWorkflow.connections.length}`)
}

const runWorkflow = () => {
  if (workflowNodes.value.length === 0) {
    alert('工作流为空，请先添加节点')
    return
  }
  
  console.log('运行工作流:', {
    nodes: workflowNodes.value,
    connections: connections.value
  })
  
  // TODO: 实现工作流执行逻辑
  alert(`开始运行工作流...\n节点数量: ${workflowNodes.value.length}\n连接数量: ${connections.value.length}`)
}

const deployWorkflow = () => {
  if (workflowNodes.value.length === 0) {
    alert('工作流为空，请先添加节点')
    return
  }
  
  if (connections.value.length === 0) {
    alert('工作流没有连接，请先连接节点')
    return
  }
  
  console.log('部署工作流:', {
    name: currentWorkflow.name || '未命名工作流',
    nodes: workflowNodes.value,
    connections: connections.value
  })
  
  // TODO: 实现工作流部署逻辑
  alert(`工作流部署成功！\n名称: ${currentWorkflow.name || '未命名工作流'}\n节点数量: ${workflowNodes.value.length}\n连接数量: ${connections.value.length}`)
}

// 生命周期
onMounted(() => {
  // 添加全局鼠标事件监听，确保连接线能在整个窗口范围内移动
  let globalMouseMoveFrame: number | null = null
  
  const handleGlobalMouseMove = (event: MouseEvent) => {
    if (!isConnecting.value || !tempConnection.value || !canvasRef.value) return
    
    // 使用 requestAnimationFrame 节流全局鼠标移动事件
    if (globalMouseMoveFrame) {
      cancelAnimationFrame(globalMouseMoveFrame)
    }
    
    globalMouseMoveFrame = requestAnimationFrame(() => {
      if (!isConnecting.value || !tempConnection.value || !canvasRef.value) return
      
      const rect = canvasRef.value.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      
      // 如果鼠标在画布范围内，使用画布的鼠标移动逻辑
      if (mouseX >= 0 && mouseY >= 0 && mouseX <= rect.width && mouseY <= rect.height) {
        globalMouseMoveFrame = null
        return // 让画布的鼠标移动事件处理
      }
      
      // 鼠标在画布外，直接跟随鼠标位置
      tempConnection.value.x2 = mouseX
      tempConnection.value.y2 = mouseY
      tempConnection.value.isHoveringPort = false
      globalMouseMoveFrame = null
    })
  }
  
  const handleGlobalMouseUp = () => {
    if (isConnecting.value) {
      // 在画布外释放鼠标，取消连接
      isConnecting.value = false
      tempConnection.value = null
      connectionStart.value = null
    }
  }
  
  document.addEventListener('mousemove', handleGlobalMouseMove)
  document.addEventListener('mouseup', handleGlobalMouseUp)
  
  // 清理事件监听器和动画帧
  onUnmounted(() => {
    document.removeEventListener('mousemove', handleGlobalMouseMove)
    document.removeEventListener('mouseup', handleGlobalMouseUp)
    
    // 清理所有待处理的动画帧
    if (updateAnimationFrame) {
      cancelAnimationFrame(updateAnimationFrame)
      updateAnimationFrame = null
    }
    if (mouseMoveAnimationFrame) {
      cancelAnimationFrame(mouseMoveAnimationFrame)
      mouseMoveAnimationFrame = null
    }
    if (globalMouseMoveFrame) {
      cancelAnimationFrame(globalMouseMoveFrame)
      globalMouseMoveFrame = null
    }
  })
})
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
  overflow: auto;
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
  left: -16px;
}

.node-output-port {
  right: -2px;
}

.port {
  width: 12px;
  height: 12px;
  background: #60a5fa;
  border: 2px solid #2a2a2a;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  z-index: 10;
}

.port:hover {
  background: #93c5fd;
  transform: scale(1.2);
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.6);
}

.port.connecting {
  background: #10b981;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.8);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}

/* 连接线动画 */
.connection-path {
  fill: none;
  stroke: #60a5fa;
  stroke-width: 2;
  opacity: 0.8;
  transition: all 0.3s ease;
}

.connection-path:hover {
  stroke: #ef4444;
  stroke-width: 3;
  opacity: 1;
}

/* 临时连接线样式 */
.temp-connection {
  transition: stroke 0.2s ease, stroke-width 0.2s ease, opacity 0.2s ease;
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