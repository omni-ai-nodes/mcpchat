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
          <svg class="absolute inset-0" style="z-index: 1; width: 100%; height: 100%; pointer-events: none;">
            <!-- 已建立的连接 -->
            <g v-for="connection in connections" :key="connection.id">
              <path 
                :d="getConnectionPath(connection)"
                :stroke="connectionManager.getConnectionStyle(connection).stroke"
                :stroke-width="connectionManager.getConnectionStyle(connection).strokeWidth"
                fill="none"
                class="connection-path cursor-pointer"
                style="pointer-events: all;"
                @click="selectConnection(connection, $event)"
              />
              

              
              <!-- 连接端点（仅在选中时显示） -->
              <template v-if="selectedConnection?.id === connection.id">
                <circle 
                  :cx="getConnectionEndpoint(connection, 'from').x"
                  :cy="getConnectionEndpoint(connection, 'from').y"
                  r="6"
                  fill="#f59e0b"
                  stroke="white"
                  stroke-width="2"
                  class="cursor-grab"
                  style="pointer-events: all;"
                  @mousedown="startConnectionDrag(connection, 'from', $event)"
                />
                <circle 
                  :cx="getConnectionEndpoint(connection, 'to').x"
                  :cy="getConnectionEndpoint(connection, 'to').y"
                  r="6"
                  fill="#f59e0b"
                  stroke="white"
                  stroke-width="2"
                  class="cursor-grab"
                  style="pointer-events: all;"
                  @mousedown="startConnectionDrag(connection, 'to', $event)"
                />
              </template>
            </g>
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
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
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

// 画布缩放和偏移
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })

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
    
    // 如果是位置更新，立即更新节点缓存以确保连接线实时响应
    if (updates.x !== undefined || updates.y !== undefined) {
      // 立即更新缓存中的节点边界信息
      const updatedNode = workflowNodes.value[nodeIndex]
      const cacheIndex = cachedNodeBounds.findIndex(cache => cache.id === nodeId)
      if (cacheIndex !== -1) {
        cachedNodeBounds[cacheIndex].bounds = {
          left: updatedNode.x - 30,
          right: updatedNode.x + 250,
          top: updatedNode.y,
          bottom: updatedNode.y + 40
        }
      }
      
      // 对于位置更新，使用节流控制的高频更新
      const now = Date.now()
      if (now - lastConnectionUpdate >= CONNECTION_UPDATE_THROTTLE) {
        connections.value = [...connections.value]
        lastConnectionUpdate = now
      }
    } else {
      // 对于非位置更新，使用 requestAnimationFrame 优化
      if (updateAnimationFrame) {
        cancelAnimationFrame(updateAnimationFrame)
      }
      updateAnimationFrame = requestAnimationFrame(() => {
        connections.value = [...connections.value]
        updateAnimationFrame = null
      })
    }
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

// 连接线管理系统
class ConnectionManager {
  // 连接状态
  isConnecting = ref(false)
  connectionStart = ref<{ nodeId: string, port: string, type: 'input' | 'output' } | null>(null)
  tempConnection = ref<{ x1: number, y1: number, x2: number, y2: number, isHoveringPort?: boolean } | null>(null)
  selectedConnection = ref<Connection | null>(null)
  isDraggingConnection = ref(false)
  draggingConnectionEnd = ref<'from' | 'to' | null>(null)
  
  // 连接线样式配置
  styles = {
    normal: { stroke: '#60a5fa', strokeWidth: 3 },
    selected: { stroke: '#f59e0b', strokeWidth: 4 },
    hover: { stroke: '#3b82f6', strokeWidth: 3.5 }
  }
  
  constructor() {
    this.setupEventListeners()
  }
  
  // 设置事件监听
  setupEventListeners() {
    // 键盘事件监听
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (this.selectedConnection.value) {
          this.deleteConnection(this.selectedConnection.value.id)
          event.preventDefault()
        }
      }
      if (event.key === 'Escape') {
        this.cancelConnection()
        this.clearSelection()
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    
    // 清理函数
    onUnmounted(() => {
      document.removeEventListener('keydown', handleKeyDown)
    })
  }
  
  // 开始连接
  startConnection(nodeId: string, port: string, type: 'input' | 'output') {
    if (!this.isConnecting.value) {
      // 只有output端口才自动断开现有连接
      if (type === 'output') {
        this.disconnectPortConnections(nodeId, port, type)
      }
      
      this.isConnecting.value = true
      this.connectionStart.value = { nodeId, port, type }
      this.clearSelection()
      
      const startPos = this.getPortPosition(nodeId, port, type)
      if (startPos) {
        this.tempConnection.value = {
          x1: startPos.x,
          y1: startPos.y,
          x2: startPos.x,
          y2: startPos.y
        }
      }
    }
  }
  
  // 完成连接
  completeConnection(targetNodeId: string, targetPort: string, targetType: 'input' | 'output') {
    if (!this.isConnecting.value || !this.connectionStart.value) return false
    
    const start = this.connectionStart.value
    
    // 验证连接规则
    if (!this.validateConnection(start, { nodeId: targetNodeId, port: targetPort, type: targetType })) {
      this.cancelConnection()
      return false
    }
    
    // 创建新连接
    const newConnection = this.createConnection(start, targetNodeId, targetPort, targetType)
    if (newConnection) {
      connections.value.push(newConnection)
      currentWorkflow.connections = [...connections.value]
      
      // 如果是拖拽重连，选中新连接
      if (this.isDraggingConnection.value) {
        this.selectedConnection.value = newConnection
      }
    }
    
    this.resetConnectionState()
    return true
  }
  
  // 验证连接规则
  validateConnection(start: any, target: any): boolean {
    // 不能连接到自己
    if (start.nodeId === target.nodeId) return false
    
    // 输入只能连接到输出，输出只能连接到输入
    if (start.type === target.type) return false
    
    // 检查是否已存在相同连接
    const fromNode = start.type === 'output' ? start.nodeId : target.nodeId
    const toNode = start.type === 'output' ? target.nodeId : start.nodeId
    const fromPort = start.type === 'output' ? start.port : target.port
    const toPort = start.type === 'output' ? target.port : start.port
    
    return !connections.value.some(conn => 
      conn.from === fromNode && conn.to === toNode && 
      conn.fromPort === fromPort && conn.toPort === toPort
    )
  }
  
  // 创建连接
  createConnection(start: any, targetNodeId: string, targetPort: string, targetType: 'input' | 'output'): Connection | null {
    const fromNode = start.type === 'output' ? start.nodeId : targetNodeId
    const toNode = start.type === 'output' ? targetNodeId : start.nodeId
    const fromPort = start.type === 'output' ? start.port : targetPort
    const toPort = start.type === 'output' ? targetPort : start.port
    
    return {
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from: fromNode,
      to: toNode,
      fromPort: fromPort,
      toPort: toPort
    }
  }
  
  // 选中连接
  selectConnection(connection: Connection, event?: MouseEvent) {
    if (event) {
      event.stopPropagation()
    }
    this.selectedConnection.value = connection
    selectedNode.value = null
  }
  
  // 删除连接
  deleteConnection(connectionId: string) {
    const index = connections.value.findIndex(c => c.id === connectionId)
    if (index > -1) {
      connections.value.splice(index, 1)
      currentWorkflow.connections = [...connections.value]
      
      // 如果删除的是选中的连接，清除选中状态
      if (this.selectedConnection.value?.id === connectionId) {
        this.selectedConnection.value = null
      }
    }
  }
  
  // 开始拖拽重连
  startConnectionDrag(connection: Connection, endpoint: 'from' | 'to', event: MouseEvent) {
    event.stopPropagation()
    
    // 删除原连接
    this.deleteConnection(connection.id)
    
    // 设置拖拽状态
    this.isDraggingConnection.value = true
    this.draggingConnectionEnd.value = endpoint
    
    // 根据拖拽的端点确定连接起始信息
    if (endpoint === 'from') {
      this.connectionStart.value = {
        nodeId: connection.to,
        port: connection.toPort,
        type: 'input'
      }
    } else {
      this.connectionStart.value = {
        nodeId: connection.from,
        port: connection.fromPort,
        type: 'output'
      }
    }
    
    this.isConnecting.value = true
    
    // 设置临时连接线起始位置
    const startPos = this.getPortPosition(
      this.connectionStart.value.nodeId,
      this.connectionStart.value.port,
      this.connectionStart.value.type
    )
    
    if (startPos) {
      this.tempConnection.value = {
        x1: startPos.x,
        y1: startPos.y,
        x2: event.clientX,
        y2: event.clientY
      }
    }
  }
  
  // 更新临时连接线
  updateTempConnection(x: number, y: number, isHoveringPort = false) {
    if (this.tempConnection.value) {
      this.tempConnection.value.x2 = x
      this.tempConnection.value.y2 = y
      this.tempConnection.value.isHoveringPort = isHoveringPort
    }
  }
  
  // 取消连接
  cancelConnection() {
    this.resetConnectionState()
  }
  
  // 清除选中状态
  clearSelection() {
    this.selectedConnection.value = null
  }
  
  // 重置连接状态
  resetConnectionState() {
    this.isConnecting.value = false
    this.connectionStart.value = null
    this.tempConnection.value = null
    this.isDraggingConnection.value = false
    this.draggingConnectionEnd.value = null
  }
  
  // 获取端口位置
  getPortPosition(nodeId: string, port: string, type: 'input' | 'output') {
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (!node) return null
    
    const nodeWidth = 220
    const headerHeight = 32 // 更新为新的头部高度
    
    // 计算端口圆点的中心位置
    // 根据用户测试的正确配置调整位置
    return {
      x: type === 'input' ? node.x + 30 : node.x + nodeWidth - 30, // 圆点中心位置
      y: node.y + 20 // 头部位置 + 20px偏移
    }
  }
  
  // 获取连接线端点坐标
  getConnectionEndpoint(connection: Connection, endpoint: 'from' | 'to') {
    if (endpoint === 'from') {
      return this.getPortPosition(connection.from, connection.fromPort, 'output') || { x: 0, y: 0 }
    } else {
      return this.getPortPosition(connection.to, connection.toPort, 'input') || { x: 0, y: 0 }
    }
  }
  
  // 获取连接线样式
  getConnectionStyle(connection: Connection) {
    if (this.selectedConnection.value?.id === connection.id) {
      return this.styles.selected
    }
    return this.styles.normal
  }
  
  // 断开指定端口的所有连接
  disconnectPortConnections(nodeId: string, port: string, type: 'input' | 'output') {
    const connectionsToRemove: string[] = []
    
    connections.value.forEach(connection => {
      let shouldRemove = false
      
      if (type === 'input') {
        // 输入端口：检查连接的目标端
        if (connection.to === nodeId && connection.toPort === port) {
          shouldRemove = true
        }
      } else {
        // 输出端口：检查连接的源端
        if (connection.from === nodeId && connection.fromPort === port) {
          shouldRemove = true
        }
      }
      
      if (shouldRemove) {
        connectionsToRemove.push(connection.id)
      }
    })
    
    // 删除找到的连接
    connectionsToRemove.forEach(connectionId => {
      this.deleteConnection(connectionId)
    })
  }
}

// 创建连接管理器实例
const connectionManager = new ConnectionManager()

// 导出响应式状态供模板使用
const isConnecting = connectionManager.isConnecting
const connectionStart = connectionManager.connectionStart
const tempConnection = connectionManager.tempConnection
const selectedConnection = connectionManager.selectedConnection
const isDraggingConnection = connectionManager.isDraggingConnection
const draggingConnectionEnd = connectionManager.draggingConnectionEnd

const startConnection = (nodeId: string, port: string, type: 'input' | 'output') => {
  connectionManager.startConnection(nodeId, port, type)
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
  
  // 计算输出端口圆点的中心位置
  // 根据用户测试的正确配置调整位置
  const fromX = fromNode.x + 220 - 30    // 节点宽度220px - 30px偏移
  const fromY = fromNode.y + 20          // 头部位置 + 20px偏移
  // 计算输入端口圆点的中心位置
  // 对应调整输入端口位置
  const toX = toNode.x + 30              // 节点左边缘 + 30px偏移
  const toY = toNode.y + 20              // 头部位置 + 20px偏移
  
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

// 获取连接线中点位置
const getConnectionMidpoint = (connection: Connection) => {
  const fromNode = workflowNodes.value.find(n => n.id === connection.from)
  const toNode = workflowNodes.value.find(n => n.id === connection.to)
  
  if (!fromNode || !toNode) return { x: 0, y: 0 }
  
  // 使用与getConnectionPath相同的端口位置计算
  const fromX = fromNode.x + 220 - 30    // 输出端口圆点中心位置
  const fromY = fromNode.y + 20          // 输出端口圆点中心位置
  const toX = toNode.x + 30              // 输入端口圆点中心位置
  const toY = toNode.y + 20              // 输入端口圆点中心位置
  
  // 计算贝塞尔曲线的中点（t=0.5时的位置）
  const deltaX = toX - fromX
  const deltaY = toY - fromY
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
  
  if (distance === 0) {
    return { x: fromX, y: fromY }
  }
  
  const baseOffset = Math.min(distance * 0.4, 120)
  const verticalInfluence = Math.abs(deltaY) / distance
  const controlOffset = baseOffset * (1 + verticalInfluence * 0.2)
  
  const isReverse = deltaX < 0
  const cp1X = fromX + (isReverse ? Math.min(controlOffset, 80) : controlOffset)
  const cp1Y = fromY + deltaY * 0.05
  const cp2X = toX - (isReverse ? Math.min(controlOffset, 80) : controlOffset)
  const cp2Y = toY - deltaY * 0.05
  
  // 贝塞尔曲线在t=0.5时的位置公式
  const t = 0.5
  const x = Math.pow(1-t, 3) * fromX + 3 * Math.pow(1-t, 2) * t * cp1X + 3 * (1-t) * Math.pow(t, 2) * cp2X + Math.pow(t, 3) * toX
  const y = Math.pow(1-t, 3) * fromY + 3 * Math.pow(1-t, 2) * t * cp1Y + 3 * (1-t) * Math.pow(t, 2) * cp2Y + Math.pow(t, 3) * toY
  
  return { x, y }
}

// 从中点删除连接


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

// 节流变量
let lastMouseMoveTime = 0
let cachedCanvasRect: DOMRect | null = null
let lastHoveredPort: any = null

// 缓存端口DOM元素查询结果
const portElementCache = new Map<string, HTMLElement | null>()
let lastPortCacheClean = 0

const onCanvasMouseMove = (event: MouseEvent) => {
  if (!isConnecting.value || !tempConnection.value || !canvasRef.value) return
  
  // 节流处理，提高性能
  const now = Date.now()
  if (now - lastMouseMoveTime < 7) return // 限制为144fps
  lastMouseMoveTime = now
  
  // 缓存画布边界矩形，减少重复计算
  if (!cachedCanvasRect) {
    cachedCanvasRect = canvasRef.value.getBoundingClientRect()
  }
  
  // 清理端口元素缓存（每2秒清理一次）
  if (now - lastPortCacheClean > 2000) {
    portElementCache.clear()
    lastPortCacheClean = now
  }
  
  const mouseX = (event.clientX - cachedCanvasRect.left) / scale.value + offset.value.x
  const mouseY = (event.clientY - cachedCanvasRect.top) / scale.value + offset.value.y
  
  // 快速检测是否悬停在端口上
  const hoveredPort = getPortAtPosition(mouseX, mouseY)
    
  if (hoveredPort) {
    const currentPortKey = `${hoveredPort.nodeId}-${hoveredPort.type}`
    const lastPortKey = lastHoveredPort ? `${lastHoveredPort.nodeId}-${lastHoveredPort.type}` : null
    
    // 检查是否悬停在同一个端口，避免重复计算
    if (currentPortKey !== lastPortKey) {
      // 尝试从缓存获取端口元素
      let portElement = portElementCache.get(currentPortKey)
      
      if (portElement === undefined) {
        // 缓存中没有，进行DOM查询
        portElement = document.querySelector(
          `[data-node-id="${hoveredPort.nodeId}"] .port.${hoveredPort.type}`
        ) as HTMLElement
        portElementCache.set(currentPortKey, portElement)
      }
      
      lastHoveredPort = { nodeId: hoveredPort.nodeId, type: hoveredPort.type, element: portElement }
      
      // 直接使用计算位置，避免DOM查询
      const { nodeId, port, type } = hoveredPort
      if (connectionStart.value && connectionStart.value.nodeId !== nodeId && connectionStart.value.type !== type) {
        // 从缓存中查找节点，提高查找效率
        const node = workflowNodes.value.find(n => n.id === nodeId)
        if (node) {
          // 使用与getPortPosition方法相同的坐标计算
          const portX = type === 'input' ? node.x + 30 : node.x + 220 - 30
          const portY = node.y + 20
          
          tempConnection.value.x2 = portX
          tempConnection.value.y2 = portY
          tempConnection.value.isHoveringPort = true
          tempConnection.value.isValidConnection = true
        }
      } else {
        // 无效连接，跟随鼠标
        tempConnection.value.x2 = mouseX
        tempConnection.value.y2 = mouseY
        tempConnection.value.isHoveringPort = false
        tempConnection.value.isValidConnection = false
      }
    }
  } else {
    // 没有悬停在端口上，跟随鼠标
    lastHoveredPort = null
    tempConnection.value.x2 = mouseX
    tempConnection.value.y2 = mouseY
    tempConnection.value.isHoveringPort = false
    tempConnection.value.isValidConnection = false
  }
}
const onCanvasMouseUp = (event: MouseEvent) => {
  if (isConnecting.value && connectionStart.value && canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect()
    const x = (event.clientX - rect.left) / scale.value + offset.value.x
    const y = (event.clientY - rect.top) / scale.value + offset.value.y
    
    // 使用优化后的端口检测，支持更大的检测区域
    const hoveredPort = getPortAtPosition(x, y)
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
          
          // 立即同步到当前工作流，避免延迟
          currentWorkflow.connections = [...connections.value]
          console.log('连接已建立:', newConnection)
          
          // 如果是拖拽重连，选中新连接
          if (isDraggingConnection.value) {
            selectedConnection.value = newConnection
          }
          
          // 立即触发连接线重绘，确保视觉反馈即时
          nextTick(() => {
            connections.value = [...connections.value]
          })
        }
    }
    
    // 重置连接状态
    isConnecting.value = false
    connectionStart.value = null
    tempConnection.value = null
    
    // 重置拖拽状态
    isDraggingConnection.value = false
    draggingConnectionEnd.value = null
  }
}

const onCanvasClick = (event: MouseEvent) => {
  if (isConnecting.value) {
    connectionManager.cancelConnection()
  }
  // 点击空白区域取消选中
  selectedNode.value = null
  connectionManager.clearSelection()
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

// 缓存节点边界信息，提高检测效率
let cachedNodeBounds: Array<{id: string, bounds: {left: number, right: number, top: number, bottom: number}, hasInputs: boolean, hasOutputs: boolean}> = []
let lastNodeCacheUpdate = 0

// 连接线更新节流控制
let lastConnectionUpdate = 0
const CONNECTION_UPDATE_THROTTLE = 16 // 约60fps的更新频率

const getPortAtPosition = (x: number, y: number) => {
  // 更新节点边界缓存（每100ms更新一次）
  const now = Date.now()
  if (now - lastNodeCacheUpdate > 100) {
    cachedNodeBounds = workflowNodes.value.map(node => ({
      id: node.id,
      bounds: {
        left: node.x - 30,
        right: node.x + 250,
        top: node.y,
        bottom: node.y + 40
      },
      hasInputs: !!(node.inputs && node.inputs.length > 0),
      hasOutputs: !!(node.outputs && node.outputs.length > 0)
    }))
    lastNodeCacheUpdate = now
  }
  
  // 快速边界检查，使用缓存的边界信息
  for (const cachedNode of cachedNodeBounds) {
    const { bounds, hasInputs, hasOutputs } = cachedNode
    
    // 快速边界检查
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
      continue
    }
    
    // 在节点区域内，进行精确检测
    const node = workflowNodes.value.find(n => n.id === cachedNode.id)
    if (!node || !isFinite(node.x) || !isFinite(node.y)) continue
    
    // 扩大header-inputs检测区域（左侧区域，包含整个左半部分）
    if (hasInputs && x >= node.x - 30 && x <= node.x + 110) {
      return { nodeId: node.id, port: node.inputs![0], type: 'input' as const }
    }
    
    // 扩大header-outputs检测区域（右侧区域，包含整个右半部分）
    if (hasOutputs && x >= node.x + 110 && x <= node.x + 250) {
      return { nodeId: node.id, port: node.outputs![0], type: 'output' as const }
    }
  }
  
  return null
}

const selectConnection = (connection: Connection, event: MouseEvent) => {
  connectionManager.selectConnection(connection, event)
}

const deleteConnection = (connectionId: string) => {
  connectionManager.deleteConnection(connectionId)
}

const deleteSelectedConnection = () => {
  if (selectedConnection.value) {
    connectionManager.deleteConnection(selectedConnection.value.id)
  }
}

const startConnectionDrag = (connection: Connection, end: 'from' | 'to', event: MouseEvent) => {
  connectionManager.startConnectionDrag(connection, end, event)
}

const getConnectionEndpoint = (connection: Connection, end: 'from' | 'to') => {
  return connectionManager.getConnectionEndpoint(connection, end)
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
  const handleGlobalMouseMove = (event: MouseEvent) => {
    if (!isConnecting.value || !tempConnection.value || !canvasRef.value) return
    
    const rect = canvasRef.value.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    
    // 如果鼠标在画布范围内，使用画布的鼠标移动逻辑
    if (mouseX >= 0 && mouseY >= 0 && mouseX <= rect.width && mouseY <= rect.height) {
      return // 让画布的鼠标移动事件处理
    }
    
    // 鼠标在画布外，直接跟随鼠标位置
    connectionManager.updateTempConnection(mouseX, mouseY, false)
  }
  
  const handleGlobalMouseUp = () => {
    if (isConnecting.value) {
      // 在画布外释放鼠标，取消连接
      connectionManager.cancelConnection()
    }
  }
  
  document.addEventListener('mousemove', handleGlobalMouseMove)
  document.addEventListener('mouseup', handleGlobalMouseUp)
  
  // 键盘事件处理已移至ConnectionManager中
  
  // 清理事件监听器和动画帧
  onUnmounted(() => {
    document.removeEventListener('mousemove', handleGlobalMouseMove)
    document.removeEventListener('mouseup', handleGlobalMouseUp)
    if (updateAnimationFrame) {
      cancelAnimationFrame(updateAnimationFrame)
      updateAnimationFrame = null
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