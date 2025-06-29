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
                <!-- file-input 节点特殊显示 -->
                <div v-if="node.type === 'file-input'" class="flex flex-col gap-2">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Icon icon="lucide:upload" class="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div class="flex-1">
                      <div class="text-sm font-medium">加载图像</div>
                    </div>
                  </div>
                </div>
                
                <!-- 其他节点正常显示 -->
                <div v-else class="flex items-center gap-3">
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
        <!-- Canvas 画布 -->
        <canvas 
          ref="canvasRef" 
          class="absolute inset-0 w-full h-full"
          style="z-index: 1; cursor: default;"
          @drop="onDrop"
          @dragover="onDragOver"
          @mousemove="onCanvasMouseMoveCanvas"
          @mouseup="onCanvasMouseUpCanvas"
          @mousedown="onCanvasMouseDown"
          @wheel="onCanvasWheelCanvas"
        ></canvas>
        
        <!-- 空状态覆盖层 -->
        <div v-if="workflowNodes.length === 0" class="absolute inset-0 flex items-center justify-center pointer-events-none" style="z-index: 5;">
          <div class="text-center text-muted-foreground">
            <Icon icon="lucide:workflow" class="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 class="text-lg font-medium mb-2">{{ t('common.mcp.workflow.emptyCanvas') }}</h3>
            <p class="text-sm">{{ t('common.mcp.workflow.emptyCanvasDesc') }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧属性面板 - 弹出层 -->
    <div 
      v-if="selectedNode" 
      class="fixed top-0 right-0 w-80 h-full bg-card border-l shadow-lg flex flex-col"
      style="z-index: 50;"
    >
      <div class="p-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold">{{ t('common.mcp.workflow.properties') }}</h2>
        <button 
          @click="selectedNode = null"
          class="p-1 hover:bg-accent rounded transition-colors"
          title="关闭属性面板"
        >
          <Icon icon="lucide:x" class="w-4 h-4" />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <NodeProperties 
          :node="selectedNode"
          @update="updateSelectedNode"
          @delete="deleteNode"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@iconify/vue'
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
  config: Record<string, unknown>
  inputs: (string | { name: string })[]
  outputs: (string | { name: string })[]
  uploadButton?: {
    x: number
    y: number
    width: number
    height: number
  }
  fileNameArea?: {
    x: number
    y: number
    width: number
    height: number
  }
  cachedImage?: HTMLImageElement
  imageLoadError?: boolean
  textArea?: {
    x: number
    y: number
    width: number
    height: number
  }
  editButton?: {
    x: number
    y: number
    width: number
    height: number
  }
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
const canvasRef = ref<HTMLCanvasElement>()
const selectedNode = ref<WorkflowNode | null>(null)
const workflowNodes = ref<WorkflowNode[]>([])
const connections = ref<Connection[]>([])
const currentWorkflow = reactive<CurrentWorkflow>({
  name: '',
  description: '',
  nodes: [],
  connections: []
})

// Canvas 相关变量
const ctx = ref<CanvasRenderingContext2D | null>(null)
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const draggedNode = ref<WorkflowNode | null>(null)
const animationFrameId = ref<number | null>(null)

// Canvas 渲染配置
const GRID_SIZE = 20
const NODE_WIDTH = 220
const NODE_HEIGHT = 80
const PORT_RADIUS = 6
const CONNECTION_WIDTH = 3

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

// Canvas 初始化和渲染
const initCanvas = () => {
  if (!canvasRef.value) return
  
  const canvas = canvasRef.value
  ctx.value = canvas.getContext('2d')
  
  // 设置Canvas尺寸
  const resizeCanvas = () => {
    const rect = canvas.parentElement?.getBoundingClientRect()
    if (rect) {
      canvas.width = rect.width
      canvas.height = rect.height
    }
  }
  
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
}

const redraw = () => {
  if (ctx.value && canvasRef.value) {
    clearCanvas()
    drawGrid()
    drawConnections()
    drawNodes()
    drawTempConnection()
  }
}

const startRenderLoop = () => {
  const render = () => {
    redraw()
    animationFrameId.value = requestAnimationFrame(render)
  }
  render()
}

const clearCanvas = () => {
  if (!ctx.value || !canvasRef.value) return
  ctx.value.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
}

const drawGrid = () => {
  if (!ctx.value || !canvasRef.value) return
  
  const canvas = canvasRef.value
  const context = ctx.value
  
  context.strokeStyle = '#888888'
  context.lineWidth = 1
  context.setLineDash([10, 10]) // 设置虚线样式

  const startX = (-offset.value.x % GRID_SIZE) * scale.value
  const startY = (-offset.value.y % GRID_SIZE) * scale.value

  for (let x = startX; x < canvas.width; x += GRID_SIZE * scale.value) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, canvas.height)
    context.stroke()
  }

  for (let y = startY; y < canvas.height; y += GRID_SIZE * scale.value) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(canvas.width, y)
    context.stroke()
  }
  
  context.setLineDash([]) // 重置为实线，避免影响其他绘制
}

const drawNodes = () => {
  if (!ctx.value) return
  
  // 先绘制非选中的节点
  workflowNodes.value.forEach(node => {
    if (selectedNode.value?.id !== node.id) {
      drawNode(node)
    }
  })
  
  // 最后绘制选中的节点，确保它在最上层
  if (selectedNode.value) {
    const selectedNodeData = workflowNodes.value.find(node => node.id === selectedNode.value?.id)
    if (selectedNodeData) {
      drawNode(selectedNodeData)
    }
  }
}

const drawNode = (node: WorkflowNode) => {
  if (!ctx.value) return
  
  const context = ctx.value
  const x = (node.x + offset.value.x) * scale.value
  const y = (node.y + offset.value.y) * scale.value
  const width = NODE_WIDTH * scale.value
  // 为file-input节点动态计算高度
  const height = node.type === 'file-input' 
    ? (NODE_HEIGHT + 226 ) * scale.value  // 基础高度 + 上传区域高度 + 间距
    : NODE_HEIGHT * scale.value
  
  // 绘制节点阴影
  context.shadowColor = 'rgba(0, 0, 0, 0.15)'
  context.shadowBlur = 8 * scale.value
  context.shadowOffsetX = 0
  context.shadowOffsetY = 2 * scale.value
  
  // 绘制节点背景（使用路径绘制圆角矩形）
  const radius = 12 * scale.value
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
  
  // 根据节点类型设置不同的背景色
  let bgColor = '#2d2d2d'  // 默认深色背景
  let borderColor = '#404040'
  
  if (selectedNode.value?.id === node.id) {
    bgColor = '#3d3d3d'
    borderColor = '#0ea5e9'  // 蓝色边框表示选中
  }
  
  // 根据节点类型调整颜色
  if (node.type.includes('input')) {
    borderColor = selectedNode.value?.id === node.id ? '#0ea5e9' : '#10b981'  // 绿色
  } else if (node.type.includes('output')) {
    borderColor = selectedNode.value?.id === node.id ? '#0ea5e9' : '#8b5cf6'  // 紫色
  } else {
    borderColor = selectedNode.value?.id === node.id ? '#0ea5e9' : '#f59e0b'  // 橙色
  }
  
  context.fillStyle = bgColor
  context.fill()
  
  // 清除阴影设置
  context.shadowColor = 'transparent'
  context.shadowBlur = 0
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  
  // 绘制边框
  context.strokeStyle = borderColor
  context.lineWidth = 2 * scale.value
  context.stroke()
  
  // 绘制节点头部区域
  const headerHeight = 40 * scale.value
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + headerHeight)
  context.lineTo(x, y + headerHeight)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
  
  // 头部渐变背景
  const gradient = context.createLinearGradient(x, y, x, y + headerHeight)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)')
  context.fillStyle = gradient
  context.fill()
  
  // 绘制节点图标（左侧）
  const iconSize = 20 * scale.value
  const iconX = x + 12 * scale.value
  const iconY = y + (headerHeight - iconSize) / 2
  
  // 绘制图标背景圆圈
  context.fillStyle = borderColor
  context.beginPath()
  context.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2)
  context.fill()
  
  // 绘制图标（简化的图标）
  context.fillStyle = '#ffffff'
  context.font = `${12 * scale.value}px Arial`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  
  let iconText = '📄'  // 默认图标
  if (node.type.includes('input')) {
    iconText = '📥'
  } else if (node.type.includes('output')) {
    iconText = '📤'
  } else if (node.type.includes('process')) {
    iconText = '⚙️'
  }
  
  context.fillText(iconText, iconX + iconSize / 2, iconY + iconSize / 2)
  
  // 绘制节点标题
  context.fillStyle = '#ffffff'
  context.font = `bold ${13 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  
  // 限制文本长度
  let displayName = node.name
  if (displayName.length > 15) {
    displayName = displayName.substring(0, 12) + '...'
  }
  
  context.fillText(displayName, iconX + iconSize + 8 * scale.value, y + headerHeight / 2)
  
  // 绘制节点类型标签（右上角）
  const typeText = node.type.toUpperCase()
  context.fillStyle = 'rgba(255, 255, 255, 0.6)'
  context.font = `${9 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  context.textAlign = 'right'
  context.fillText(typeText, x + width - 8 * scale.value, y + 15 * scale.value)
  
  // 绘制分隔线
  context.strokeStyle = 'rgba(255, 255, 255, 0.1)'
  context.lineWidth = 1 * scale.value
  context.beginPath()
  context.moveTo(x + 8 * scale.value, y + headerHeight)
  context.lineTo(x + width - 8 * scale.value, y + headerHeight)
  context.stroke()
  
  // 绘制输入端口
  node.inputs.forEach(() => {
    const portY = y + headerHeight / 2
    drawPort(x - PORT_RADIUS * scale.value, portY, 'input')
  })
  
  // 绘制输出端口
  node.outputs.forEach(() => {
    const portY = y + headerHeight / 2
    drawPort(x + width + PORT_RADIUS * scale.value, portY, 'output')
  })
  
  // 如果是文件输入节点，在headers下面绘制上传区域或图片预览
  if (node.type === 'file-input') {
    const uploadAreaWidth = width - 16 * scale.value
    const uploadAreaHeight = 250 * scale.value  // 增加高度以容纳更多内容
    const uploadAreaX = x + 8 * scale.value
    const uploadAreaY = y + headerHeight + 8 * scale.value  // 放在headers下面
    
    // 检查是否有上传的图片或文件
    const hasImage = node.config?.imageData && typeof node.config.imageData === 'string'
    const hasFile = node.config?.fileName && typeof node.config.fileName === 'string' && !hasImage
    
    // 绘制整体背景（深色主题）
    context.fillStyle = '#374151'  // 深灰色背景
    context.beginPath()
    context.roundRect(uploadAreaX, uploadAreaY, uploadAreaWidth, uploadAreaHeight, 8 * scale.value)
    context.fill()
    
    // 绘制边框
    context.strokeStyle = '#4b5563'
    context.lineWidth = 1 * scale.value
    context.setLineDash([])
    context.stroke()
    
    // 绘制文件名显示区域（顶部）
    const fileNameAreaHeight = 24 * scale.value
    const fileNameAreaY = uploadAreaY + 8 * scale.value
    const fileNameAreaX = uploadAreaX + 8 * scale.value
    const fileNameAreaWidth = uploadAreaWidth - 16 * scale.value
    
    context.fillStyle = '#1f2937'  // 更深的背景
    context.beginPath()
    context.roundRect(fileNameAreaX, fileNameAreaY, fileNameAreaWidth, fileNameAreaHeight, 4 * scale.value)
    context.fill()
    
    // 绘制文件名或占位符
    const fileName = (node.config?.fileName as string) || '点击选择图片...'
    const displayFileName = fileName.length > 25 ? fileName.substring(0, 22) + '...' : fileName
    
    context.fillStyle = '#d1d5db'  // 浅灰色文字
    context.font = `${10 * scale.value}px 'SF Mono', Monaco, 'Cascadia Code', monospace`
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillText(displayFileName, uploadAreaX + 16 * scale.value, fileNameAreaY + fileNameAreaHeight / 2)
    
    // 存储文件名区域位置信息，用于点击检测
    if (!node.fileNameArea) {
      node.fileNameArea = {
        x: fileNameAreaX,
        y: fileNameAreaY,
        width: fileNameAreaWidth,
        height: fileNameAreaHeight
      }
    } else {
      node.fileNameArea.x = fileNameAreaX
      node.fileNameArea.y = fileNameAreaY
      node.fileNameArea.width = fileNameAreaWidth
      node.fileNameArea.height = fileNameAreaHeight
    }
    
    // 绘制upload按钮
    const buttonWidth = uploadAreaWidth - 16 * scale.value
    const buttonHeight = 20 * scale.value
    const buttonX = uploadAreaX + 8 * scale.value
    const buttonY = fileNameAreaY + fileNameAreaHeight + 8 * scale.value
    
    context.fillStyle = '#111827'  // 深色按钮背景
    context.beginPath()
    context.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 4 * scale.value)
    context.fill()
    
    // 按钮边框
    context.strokeStyle = '#374151'
    context.lineWidth = 1 * scale.value
    context.stroke()
    
    // 按钮文字
    context.fillStyle = '#9ca3af'
    context.font = `${10 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('upload', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2)
    
    if (hasImage) {
      // 图片预览区域
      const previewAreaY = buttonY + buttonHeight + 8 * scale.value
      const previewAreaHeight = uploadAreaHeight - (previewAreaY - uploadAreaY) - 16 * scale.value
      
      // 如果图片已缓存，直接绘制
       if (node.cachedImage) {
         const img = node.cachedImage
         // 计算图片显示尺寸，保持宽高比
         const maxWidth = uploadAreaWidth - 16 * scale.value
         const maxHeight = previewAreaHeight - 8 * scale.value
         let imgWidth = img.width
         let imgHeight = img.height
         
         const aspectRatio = imgWidth / imgHeight
         if (imgWidth > maxWidth) {
           imgWidth = maxWidth
           imgHeight = imgWidth / aspectRatio
         }
         if (imgHeight > maxHeight) {
           imgHeight = maxHeight
           imgWidth = imgHeight * aspectRatio
         }
         
         const imgX = uploadAreaX + (uploadAreaWidth - imgWidth) / 2
         const imgY = previewAreaY + (previewAreaHeight - imgHeight) / 2
         
         // 绘制图片
         context.drawImage(img, imgX, imgY, imgWidth, imgHeight)
         
         // 绘制图片尺寸信息（右下角）
         const sizeText = `${img.width} × ${img.height}`
         context.fillStyle = '#6b7280'
         context.font = `${9 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
         context.textAlign = 'right'
         context.textBaseline = 'bottom'
         context.fillText(sizeText, uploadAreaX + uploadAreaWidth - 12 * scale.value, uploadAreaY + uploadAreaHeight - 8 * scale.value)
      } else {
        // 异步加载图片
        const img = new Image()
        img.onload = () => {
          node.cachedImage = img
          // 重新绘制整个画布
          nextTick(() => {
            redraw()
          })
        }
        img.onerror = () => {
          console.error('图片加载失败:', node.config.imageData)
          // 标记图片加载失败，重新绘制
          node.imageLoadError = true
          nextTick(() => {
            redraw()
          })
        }
        img.src = node.config.imageData as string
        
        // 显示加载状态或错误信息
        if (node.imageLoadError) {
          context.fillStyle = '#ef4444'
          context.font = `${12 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillText('图片加载失败', uploadAreaX + uploadAreaWidth / 2, previewAreaY + previewAreaHeight / 2)
        } else {
          context.fillStyle = '#9ca3af'
          context.font = `${12 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillText('加载中...', uploadAreaX + uploadAreaWidth / 2, previewAreaY + previewAreaHeight / 2)
        }
      }
    } else if (hasFile) {
      // 非图片文件显示区域
      const previewAreaY = buttonY + buttonHeight + 8 * scale.value
      const previewAreaHeight = uploadAreaHeight - (previewAreaY - uploadAreaY) - 16 * scale.value
      
      // 绘制文件图标
      context.fillStyle = '#9ca3af'
      context.font = `${24 * scale.value}px Arial`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText('📄', uploadAreaX + uploadAreaWidth / 2, previewAreaY + previewAreaHeight / 2 - 8 * scale.value)
      
      // 绘制文件类型
      const fileType = node.config.fileType as string
      const typeText = fileType || 'FILE'
      context.fillStyle = '#6b7280'
      context.font = `${10 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(typeText.toUpperCase(), uploadAreaX + uploadAreaWidth / 2, previewAreaY + previewAreaHeight / 2 + 12 * scale.value)
      
      // 绘制文件大小（右下角）
      const fileSize = node.config.fileSize as number
      const sizeText = fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : '未知大小'
      context.fillStyle = '#6b7280'
      context.font = `${9 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
      context.textAlign = 'right'
      context.textBaseline = 'bottom'
      context.fillText(sizeText, uploadAreaX + uploadAreaWidth - 12 * scale.value, uploadAreaY + uploadAreaHeight - 8 * scale.value)
    } else {
      // 空状态显示区域
      const previewAreaY = buttonY + buttonHeight + 8 * scale.value
      const previewAreaHeight = uploadAreaHeight - (previewAreaY - uploadAreaY) - 16 * scale.value
      
      // 绘制虚线边框（预览区域）
      context.strokeStyle = '#4b5563'
      context.lineWidth = 1 * scale.value
      context.setLineDash([4 * scale.value, 4 * scale.value])
      context.beginPath()
      context.roundRect(uploadAreaX + 8 * scale.value, previewAreaY, uploadAreaWidth - 16 * scale.value, previewAreaHeight, 4 * scale.value)
      context.stroke()
      context.setLineDash([])
      
      // 绘制图标和文字
      context.fillStyle = '#6b7280'
      context.font = `${20 * scale.value}px Arial`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText('🖼️', uploadAreaX + uploadAreaWidth / 2, previewAreaY + previewAreaHeight / 2 - 8 * scale.value)
      
      context.fillStyle = '#6b7280'
      context.font = `${10 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText('点击上传图片或文件', uploadAreaX + uploadAreaWidth / 2, previewAreaY + previewAreaHeight / 2 + 12 * scale.value)
    }
    
    // 存储上传按钮位置信息，用于点击检测（只有按钮区域可点击）
    if (!node.uploadButton) {
      node.uploadButton = {
        x: buttonX,
        y: buttonY,
        width: buttonWidth,
        height: buttonHeight
      }
    } else {
      node.uploadButton.x = buttonX
      node.uploadButton.y = buttonY
      node.uploadButton.width = buttonWidth
      node.uploadButton.height = buttonHeight
    }
  }
  
  // 如果是文本输入节点，绘制文本输入区域
  if (node.type === 'text-input') {
    const inputAreaWidth = width - 16 * scale.value
    const inputAreaHeight = 120 * scale.value
    const inputAreaX = x + 8 * scale.value
    const inputAreaY = y + headerHeight + 8 * scale.value
    
    // 绘制整体背景
    context.fillStyle = '#374151'  // 深灰色背景
    context.beginPath()
    context.roundRect(inputAreaX, inputAreaY, inputAreaWidth, inputAreaHeight, 8 * scale.value)
    context.fill()
    
    // 绘制边框
    context.strokeStyle = '#4b5563'
    context.lineWidth = 1 * scale.value
    context.setLineDash([])
    context.stroke()
    
    // 绘制文本输入区域
    const textAreaHeight = 80 * scale.value
    const textAreaY = inputAreaY + 8 * scale.value
    const textAreaX = inputAreaX + 8 * scale.value
    const textAreaWidth = inputAreaWidth - 16 * scale.value
    
    context.fillStyle = '#1f2937'  // 更深的背景
    context.beginPath()
    context.roundRect(textAreaX, textAreaY, textAreaWidth, textAreaHeight, 4 * scale.value)
    context.fill()
    
    // 绘制文本输入边框
    context.strokeStyle = '#374151'
    context.lineWidth = 1 * scale.value
    context.stroke()
    
    // 绘制文本内容或占位符
    const textContent = (node.config?.textContent as string) || ''
    const placeholder = '请输入文本内容...'
    const displayText = textContent || placeholder
    
    context.fillStyle = textContent ? '#d1d5db' : '#6b7280'  // 有内容时浅色，占位符时更暗
    context.font = `${11 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
    context.textAlign = 'left'
    context.textBaseline = 'top'
    
    // 文本换行处理
    const maxWidth = textAreaWidth - 16 * scale.value
    const lineHeight = 14 * scale.value
    const lines = wrapText(context, displayText, maxWidth)
    
    lines.slice(0, 4).forEach((line, index) => {
      context.fillText(line, textAreaX + 8 * scale.value, textAreaY + 8 * scale.value + index * lineHeight)
    })
    
    // 存储文本区域位置信息，用于点击检测
    if (!node.textArea) {
      node.textArea = {
        x: textAreaX,
        y: textAreaY,
        width: textAreaWidth,
        height: textAreaHeight
      }
    } else {
      node.textArea.x = textAreaX
      node.textArea.y = textAreaY
      node.textArea.width = textAreaWidth
      node.textArea.height = textAreaHeight
    }
    
    // 绘制编辑按钮
    const buttonWidth = 60 * scale.value
    const buttonHeight = 20 * scale.value
    const buttonX = inputAreaX + inputAreaWidth - buttonWidth - 8 * scale.value
    const buttonY = textAreaY + textAreaHeight + 4 * scale.value
    
    context.fillStyle = '#4f46e5'
    context.beginPath()
    context.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 4 * scale.value)
    context.fill()
    
    // 按钮边框
    context.strokeStyle = '#6366f1'
    context.lineWidth = 1 * scale.value
    context.stroke()
    
    // 按钮文字
    context.fillStyle = '#ffffff'
    context.font = `${10 * scale.value}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('✏️ 编辑', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2)
    
    // 存储按钮位置信息，用于点击检测
    if (!node.editButton) {
      node.editButton = {
        x: buttonX,
        y: buttonY,
        width: buttonWidth,
        height: buttonHeight
      }
    } else {
      node.editButton.x = buttonX
      node.editButton.y = buttonY
      node.editButton.width = buttonWidth
      node.editButton.height = buttonHeight
    }
  }
}

const drawPort = (x: number, y: number, type: 'input' | 'output') => {
  if (!ctx.value) return
  
  const context = ctx.value
  const radius = PORT_RADIUS * scale.value
  
  // 绘制端口外圈（白色边框）
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.arc(x, y, radius + 1 * scale.value, 0, Math.PI * 2)
  context.fill()
  
  // 绘制端口内圈
  context.fillStyle = type === 'input' ? '#10b981' : '#3b82f6'  // 输入绿色，输出蓝色
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
  
  // 如果是连接状态，添加发光效果
  if (connectionManager.isConnecting.value) {
    context.shadowColor = type === 'input' ? '#10b981' : '#3b82f6'
    context.shadowBlur = 8 * scale.value
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
    
    // 清除阴影
    context.shadowColor = 'transparent'
    context.shadowBlur = 0
  }
}

const drawConnections = () => {
  if (!ctx.value) return
  
  connections.value.forEach(connection => {
    drawConnection(connection)
  })
}

const drawConnection = (connection: Connection) => {
  if (!ctx.value) return
  
  const context = ctx.value
  const startPos = connectionManager.getConnectionEndpoint(connection, 'from')
  const endPos = connectionManager.getConnectionEndpoint(connection, 'to')
  
  if (!startPos || !endPos) return
  
  const startX = (startPos.x + offset.value.x) * scale.value
  const startY = (startPos.y + offset.value.y) * scale.value
  const endX = (endPos.x + offset.value.x) * scale.value
  const endY = (endPos.y + offset.value.y) * scale.value
  
  // 绘制贝塞尔曲线
  const controlOffset = Math.abs(endX - startX) * 0.5
  const cp1x = startX + controlOffset
  const cp1y = startY
  const cp2x = endX - controlOffset
  const cp2y = endY
  
  // 使用蓝色实线绘制正常连接
  context.strokeStyle = connectionManager.selectedConnection.value?.id === connection.id ? '#ff5722' : '#2196f3'
  context.lineWidth = CONNECTION_WIDTH * scale.value
  context.beginPath()
  context.moveTo(startX, startY)
  context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY)
  context.stroke()
}

const drawTempConnection = () => {
  if (!ctx.value || !connectionManager.tempConnection.value) return
  
  const context = ctx.value
  const temp = connectionManager.tempConnection.value
  
  const startX = (temp.x1 + offset.value.x) * scale.value
  const startY = (temp.y1 + offset.value.y) * scale.value
  const endX = (temp.x2 + offset.value.x) * scale.value
  const endY = (temp.y2 + offset.value.y) * scale.value
  
  const controlOffset = Math.abs(endX - startX) * 0.5
  const cp1x = startX + controlOffset
  const cp1y = startY
  const cp2x = endX - controlOffset
  const cp2y = endY
  
  // 根据连接状态设置样式
  if (temp.isBoundarySnap && temp.isValidConnection) {
    // 边界感知且有效连接 - 绿色实线
    context.strokeStyle = '#4caf50'
    context.lineWidth = (CONNECTION_WIDTH + 1) * scale.value
    context.setLineDash([])
  } else if (temp.isValidConnection) {
    // 有效连接 - 蓝色虚线
    context.strokeStyle = '#2196f3'
    context.lineWidth = CONNECTION_WIDTH * scale.value
    context.setLineDash([5, 5])
  } else {
    // 无效连接 - 灰色虚线
    context.strokeStyle = '#999999'
    context.lineWidth = CONNECTION_WIDTH * scale.value
    context.setLineDash([3, 3])
  }
  
  context.beginPath()
  context.moveTo(startX, startY)
  context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY)
  context.stroke()
  context.setLineDash([])
  
  // 如果是边界感知，在目标位置绘制一个高亮圆圈
  if (temp.isBoundarySnap && temp.isValidConnection) {
    context.fillStyle = '#4caf50'
    context.globalAlpha = 0.3
    context.beginPath()
    context.arc(endX, endY, 12 * scale.value, 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = 1.0
  }
}

// 方法
const addNode = (template: NodeTemplate) => {
  const newNode: WorkflowNode = {
    id: `node_${Date.now()}`,
    type: template.type,
    name: template.name,
    x: Math.random() * 400 + 200,
    y: Math.random() * 300 + 150,
    config: template.type === 'file-input' ? { fileName: '' } : {},
    inputs: template.category === 'input' ? [] : ['input'],
    outputs: template.category === 'output' ? [] : ['output']
  }
  
  workflowNodes.value.push(newNode)
  // 移除自动选中节点，不显示编辑菜单
  // selectedNode.value = newNode
  
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
    
    // 如果是位置更新，重新绘制画布
    if (updates.x !== undefined || updates.y !== undefined) {
      // 对于位置更新，重新绘制画布
      connections.value = [...connections.value]
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
  tempConnection = ref<{ x1: number, y1: number, x2: number, y2: number, isHoveringPort?: boolean, isValidConnection?: boolean, isBoundarySnap?: boolean } | null>(null)
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
      // 只有input端口才自动断开现有连接
      if (type === 'input') {
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
    if (!this.isConnecting.value || !this.connectionStart.value) return false;
    
    const start = this.connectionStart.value
    
    // 验证连接规则
    if (!this.validateConnection(start, { nodeId: targetNodeId, port: targetPort, type: targetType })) {
      this.cancelConnection()
      return false
    }
    
    // 创建新连接
    const newConnection = this.createConnection(start, targetNodeId, targetPort)
    if (newConnection) {
      connections.value.push(newConnection)
      currentWorkflow.connections = [...connections.value]
      console.log('连接已创建并保存:', newConnection)
      console.log('当前连接总数:', connections.value.length)
      
      // 如果是拖拽重连，选中新连接
      if (this.isDraggingConnection.value) {
        this.selectedConnection.value = newConnection
      }
    } else {
      console.log('连接创建失败')
    }
    
    this.resetConnectionState()
    return true
  }
  
  // 验证连接规则
  validateConnection(start: { nodeId: string, port: string, type: 'input' | 'output' }, target: { nodeId: string, port: string, type: 'input' | 'output' }): boolean {
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
  createConnection(start: { nodeId: string, port: string, type: 'input' | 'output' }, targetNodeId: string, targetPort: string): Connection | null {
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
      if (this.selectedConnection && this.selectedConnection.value?.id === connectionId) {
        this.selectedConnection.value = null
      }
    }
  }
  
  // 开始拖拽重连
  startConnectionDrag(connection: Connection, endpoint: 'from' | 'to', event: MouseEvent) {
    event.stopPropagation()
    
    // 根据拖拽的端点确定连接起始信息
    if (endpoint === 'from') {
      // 拖拽output端口（from端），不删除原连接
      this.connectionStart.value = {
        nodeId: connection.from,
        port: connection.fromPort,
        type: 'output'
      }
    } else {
      // 拖拽input端口（to端），删除原连接
      this.deleteConnection(connection.id)
      this.connectionStart.value = {
        nodeId: connection.to,
        port: connection.toPort,
        type: 'input'
      }
    }
    
    // 设置拖拽状态
    this.isDraggingConnection.value = true
    this.draggingConnectionEnd.value = endpoint
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
    if (this.selectedConnection) {
      this.selectedConnection.value = null
    }
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
  getPortPosition(nodeId: string, port: string, type: 'input' | 'output'): { x: number, y: number } | null {
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (!node) return null
    
    const nodeWidth = 220
    const headerHeight = 40 // 节点头部高度
    
    // 计算端口圆点的中心位置，与WorkflowNode组件中的实际位置保持一致
    // input端口在节点左侧（left: -6px），output端口在节点右侧（right: -6px）
    return {
      x: type === 'input' ? node.x - 6 + 5 : node.x + nodeWidth + 6 - 5, // 考虑端口的实际偏移位置
      y: node.y + headerHeight / 2 // 头部中心位置
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

const updateSelectedNode = (updates: Partial<WorkflowNode>) => {
  if (selectedNode.value) {
    updateNode(selectedNode.value.id, updates)
    selectedNode.value = { ...selectedNode.value, ...updates }
  }
}

// Canvas 鼠标事件处理
const getCanvasPosition = (event: MouseEvent) => {
  if (!canvasRef.value) return { x: 0, y: 0 }
  
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) / scale.value - offset.value.x,
    y: (event.clientY - rect.top) / scale.value - offset.value.y
  }
}

const getNodeAtPosition = (x: number, y: number): WorkflowNode | null => {
  for (const node of workflowNodes.value) {
    if (x >= node.x && x <= node.x + NODE_WIDTH &&
        y >= node.y && y <= node.y + NODE_HEIGHT) {
      return node
    }
  }
  return null
}

const getEditIconAtPosition = (x: number, y: number): WorkflowNode | null => {
  for (const node of workflowNodes.value) {
    const iconSize = 16
    const iconX = node.x + NODE_WIDTH - iconSize - 8
    const iconY = node.y + 8
    
    if (x >= iconX - 2 && x <= iconX + iconSize + 2 &&
        y >= iconY - 2 && y <= iconY + iconSize + 2) {
      return node
    }
  }
  return null
}

const getUploadButtonAtPosition = (x: number, y: number): WorkflowNode | null => {
  for (const node of workflowNodes.value) {
    if ((node.type === 'text-input' || node.type === 'file-input') && node.uploadButton) {
      const button = node.uploadButton
      if (x >= button.x && x <= button.x + button.width && 
          y >= button.y && y <= button.y + button.height) {
        return node
      }
    }
  }
  return null
}

const getFileNameAreaAtPosition = (x: number, y: number): WorkflowNode | null => {
  for (const node of workflowNodes.value) {
    if (node.type === 'file-input' && node.fileNameArea) {
      const area = node.fileNameArea
      if (x >= area.x && x <= area.x + area.width && 
          y >= area.y && y <= area.y + area.height) {
        return node
      }
    }
  }
  return null
}

// 获取文本区域点击位置
const getTextAreaAtPosition = (x: number, y: number): WorkflowNode | null => {
  for (const node of workflowNodes.value) {
    if (node.type === 'text-input' && node.textArea) {
      const area = node.textArea
      if (x >= area.x && x <= area.x + area.width && 
          y >= area.y && y <= area.y + area.height) {
        return node
      }
    }
  }
  return null
}

// 获取编辑按钮点击位置
const getEditButtonAtPosition = (x: number, y: number): WorkflowNode | null => {
  for (const node of workflowNodes.value) {
    if (node.type === 'text-input' && node.editButton) {
      const button = node.editButton
      if (x >= button.x && x <= button.x + button.width && 
          y >= button.y && y <= button.y + button.height) {
        return node
      }
    }
  }
  return null
}

interface UploadedFile {
  name: string
  path: string
  size: number
  createdAt: Date
}

interface WindowAPI {
  getUploadedFiles: () => Promise<UploadedFile[]>
  readUploadedFile: (filePath: string) => Promise<string>
  saveUploadedFile: (fileName: string, fileData: string) => Promise<{ success: boolean; filePath: string; fileName: string }>
}

declare global {
  interface Window {
    api: WindowAPI
  }
}

const handleFileNameAreaClick = async (node: WorkflowNode) => {
  console.log('点击文件名区域，节点:', node.name)
  
  try {
    // 获取已上传的文件列表
    const uploadedFiles: UploadedFile[] = await window.api.getUploadedFiles()
    console.log('获取到的上传文件列表:', uploadedFiles)
    
    // 总是显示文件选择对话框，即使没有文件也显示上传按钮
    
    // 创建文件选择对话框
    const dialog = document.createElement('div')
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `
    
    const content = document.createElement('div')
    content.style.cssText = `
      background: #1f2937;
      border-radius: 12px;
      padding: 24px;
      max-width: 800px;
      width: 90vw;
      max-height: 700px;
      overflow-y: auto;
      color: white;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      border: 1px solid #374151;
    `
    
    const title = document.createElement('h3')
    title.textContent = '选择已上传的图片'
    title.style.cssText = `
      margin: 0 0 20px 0;
      color: #f9fafb;
      font-size: 18px;
      font-weight: 600;
      text-align: center;
      border-bottom: 1px solid #374151;
      padding-bottom: 12px;
    `
    content.appendChild(title)
    
    const fileList = document.createElement('div')
    fileList.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
      max-height: 480px;
      overflow-y: auto;
      padding: 8px;
    `
    
    // 如果没有文件，显示提示信息
    if (uploadedFiles.length === 0) {
      const emptyState = document.createElement('div')
      emptyState.style.cssText = `
        grid-column: 1 / -1;
        text-align: center;
        padding: 40px 20px;
        color: #9ca3af;
        font-size: 14px;
      `
      
      const emptyIcon = document.createElement('div')
      emptyIcon.innerHTML = '📁'
      emptyIcon.style.cssText = 'font-size: 48px; margin-bottom: 16px;'
      
      const emptyText = document.createElement('div')
      emptyText.textContent = '暂无已上传的图片'
      emptyText.style.cssText = 'margin-bottom: 8px; font-weight: 500; color: #d1d5db;'
      
      const emptyDesc = document.createElement('div')
      emptyDesc.textContent = '请点击下方的上传按钮添加图片文件'
      
      emptyState.appendChild(emptyIcon)
      emptyState.appendChild(emptyText)
      emptyState.appendChild(emptyDesc)
      fileList.appendChild(emptyState)
    } else {
      uploadedFiles.forEach((file: UploadedFile) => {
      const fileItem = document.createElement('div')
      fileItem.style.cssText = `
        border: 1px solid #374151;
        border-radius: 8px;
        padding: 0;
        cursor: pointer;
        text-align: center;
        transition: all 0.2s ease;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: #111827;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      `
      
      // 创建图片预览区域
      const imagePreview = document.createElement('div')
      imagePreview.style.cssText = `
        height: 120px;
        background: #0f172a;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative;
      `
      
      // 异步加载图片预览
      const loadImagePreview = async () => {
        try {
          const imageData = await window.api.readUploadedFile(file.path)
          const img = document.createElement('img')
          img.src = imageData
          img.style.cssText = `
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          `
          imagePreview.innerHTML = ''
          imagePreview.appendChild(img)
        } catch (error) {
          console.error('加载图片预览失败:', error)
          imagePreview.innerHTML = '<div style="color: #9ca3af; font-size: 12px;">预览失败</div>'
        }
      }
      
      // 显示加载中状态
      imagePreview.innerHTML = '<div style="color: #9ca3af; font-size: 12px;">加载中...</div>'
      loadImagePreview()
      
      // 文件信息区域
      const fileInfo = document.createElement('div')
      fileInfo.style.cssText = `
        padding: 10px;
        background: #1f2937;
      `
      
      const fileName = document.createElement('div')
      fileName.textContent = file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name
      fileName.style.cssText = 'font-size: 13px; color: #e5e7eb; margin-bottom: 5px; font-weight: 500;'
      
      const fileSize = document.createElement('div')
      fileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`
      fileSize.style.cssText = 'font-size: 11px; color: #9ca3af;'
      
      fileItem.addEventListener('mouseenter', () => {
        fileItem.style.transform = 'translateY(-2px)'
        fileItem.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
        fileItem.style.borderColor = '#60a5fa'
      })
      
      fileItem.addEventListener('mouseleave', () => {
        fileItem.style.transform = 'translateY(0)'
        fileItem.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        fileItem.style.borderColor = '#374151'
      })
      
      fileInfo.appendChild(fileName)
       fileInfo.appendChild(fileSize)
       
       fileItem.appendChild(imagePreview)
       fileItem.appendChild(fileInfo)
      
      fileItem.addEventListener('click', async () => {
         try {
           // 通过主进程API读取文件
           const fileData = await window.api.readUploadedFile(file.path)
           
           // 更新节点配置
           node.imageLoadError = false
           node.cachedImage = undefined
           updateNode(node.id, {
             config: {
               ...node.config,
               imageData: fileData,
               fileName: file.name.replace(/^\d+_/, ''), // 移除时间戳前缀
               fileSize: file.size,
               savedFileName: file.name
             }
           })
           
           console.log('选择已上传图片:', file.name)
           document.body.removeChild(dialog)
         } catch (error) {
           console.error('读取文件失败:', error)
           alert('读取文件失败')
         }
       })
      
      fileList.appendChild(fileItem)
    })
    }
    
    content.appendChild(fileList)
    
    const buttonContainer = document.createElement('div')
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #374151;
    `
    
    // 添加所有图片按钮
    const addAllButton = document.createElement('button')
    addAllButton.textContent = '添加所有图片'
    addAllButton.style.cssText = `
      padding: 10px 24px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
      min-width: 120px;
    `
    
    addAllButton.addEventListener('mouseenter', () => {
      addAllButton.style.background = '#2563eb'
      addAllButton.style.transform = 'translateY(-1px)'
    })
    
    addAllButton.addEventListener('mouseleave', () => {
      addAllButton.style.background = '#3b82f6'
      addAllButton.style.transform = 'translateY(0)'
    })
    
    addAllButton.addEventListener('click', async () => {
      try {
        // 为每个图片文件创建一个新的file-input节点
        for (let i = 0; i < uploadedFiles.length; i++) {
          const file = uploadedFiles[i]
          const fileData = await window.api.readUploadedFile(file.path)
          
          const newNode: WorkflowNode = {
            id: `node_${Date.now()}_${i}`,
            type: 'file-input',
            name: '文件输入',
            x: Math.random() * 400 + 200,
            y: Math.random() * 300 + 150,
            config: {
              imageData: fileData,
              fileName: file.name.replace(/^\d+_/, ''), // 移除时间戳前缀
              fileSize: file.size,
              savedFileName: file.name
            },
            inputs: [],
            outputs: ['output']
          }
          
          workflowNodes.value.push(newNode)
        }
        
        // 同步到当前工作流
        currentWorkflow.nodes = [...workflowNodes.value]
        console.log(`已添加 ${uploadedFiles.length} 个图片节点`)
        document.body.removeChild(dialog)
      } catch (error) {
        console.error('添加所有图片失败:', error)
        alert('添加所有图片失败')
      }
    })
    
    const closeButton = document.createElement('button')
    closeButton.textContent = '关闭'
    closeButton.style.cssText = `
      padding: 10px 24px;
      background: #374151;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
      min-width: 80px;
    `
    
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.background = '#4b5563'
      closeButton.style.transform = 'translateY(-1px)'
    })
    
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.background = '#374151'
      closeButton.style.transform = 'translateY(0)'
    })
    
    closeButton.addEventListener('click', () => {
      document.body.removeChild(dialog)
    })
    
    buttonContainer.appendChild(addAllButton)
    buttonContainer.appendChild(closeButton)
    content.appendChild(buttonContainer)
    dialog.appendChild(content)
    
    // 点击背景关闭对话框
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog)
      }
    })
    
    document.body.appendChild(dialog)
  } catch (error) {
    console.error('获取已上传文件失败:', error)
    alert('获取已上传文件失败')
  }
}

const handleUploadButtonClick = (node: WorkflowNode) => {
  console.log('点击上传按钮，节点:', node.name)
  
  // 创建文件输入元素
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  
  // 根据节点类型设置不同的文件类型过滤
  if (node.type === 'file-input') {
    fileInput.accept = 'image/*,.png,.jpg,.jpeg,.gif,.bmp,.webp'
  } else {
    fileInput.accept = '.txt,.md,.json,.csv,.xml'
  }
  
  fileInput.style.display = 'none'
  
  fileInput.onchange = (event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    
    if (file) {
      if (node.type === 'file-input' && file.type.startsWith('image/')) {
        // 处理图片文件
        const reader = new FileReader()
        reader.onload = async (e) => {
          const dataUrl = e.target?.result as string
          
          if (!dataUrl) {
            console.error('文件读取失败：无法获取文件数据')
            return
          }
          
          try {
            // 保存文件到 APP/inputs 目录
            const saveResult = await window.api.saveUploadedFile(file.name, dataUrl)
            
            // 清除之前的错误状态和缓存图片
            node.imageLoadError = false
            node.cachedImage = undefined
            updateNode(node.id, {
              config: {
                ...node.config,
                imageData: dataUrl,
                fileName: file.name,
                fileSize: file.size,
                savedFileName: saveResult.fileName // 保存实际文件名
              }
            })
            console.log('图片上传并保存成功:', file.name, '保存为:', saveResult.fileName)
          } catch (error) {
            console.error('保存图片失败:', error)
            // 即使保存失败，也显示图片预览
            node.imageLoadError = false
            node.cachedImage = undefined
            updateNode(node.id, {
              config: {
                ...node.config,
                imageData: dataUrl,
                fileName: file.name,
                fileSize: file.size
              }
            })
          }
        }
        reader.readAsDataURL(file)
      } else {
        // 处理文本文件
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          updateNode(node.id, {
            config: {
              ...node.config,
              defaultText: content,
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type || 'text/plain'
            }
          })
          console.log('文件上传成功:', file.name, '大小:', file.size, '内容长度:', content.length)
        }
        reader.readAsText(file)
      }
    }
    // 清理临时元素
    document.body.removeChild(fileInput)
  }
  
  // 添加到DOM并触发点击
  document.body.appendChild(fileInput)
  fileInput.click()
}

// 处理文本区域点击
const handleTextAreaClick = (node: WorkflowNode) => {
  console.log('点击文本区域，节点:', node.name)
  // 可以在这里添加文本区域的特殊处理逻辑
}

// 处理文本编辑按钮点击
const handleTextEditButtonClick = (node: WorkflowNode) => {
  console.log('点击编辑按钮，节点:', node.name)
  
  // 创建文本编辑对话框
  const currentText = (node.config?.textContent as string) || ''
  
  // 创建对话框容器
  const dialog = document.createElement('div')
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `
  
  // 计算与文本输入节点下方区域对齐的尺寸
  // 文本区域: 180 * scale, 编辑按钮区域: 60 * scale 高度, 加上间距
  const nodeScale = scale.value || 1
  const alignedWidth = Math.max(400, 180 * nodeScale + 48) // 最小400px，或与节点宽度对齐
  const alignedHeight = Math.max(300, 60 * nodeScale * 4 + 100) // 约4倍文本区域高度加上按钮空间
  
  // 创建对话框内容
  const dialogContent = document.createElement('div')
  dialogContent.style.cssText = `
    background: #2a2a2a;
    border-radius: 8px;
    padding: 24px;
    width: ${alignedWidth}px;
    height: ${alignedHeight}px;
    max-width: 90vw;
    max-height: 80vh;
    overflow: auto;
    border: 1px solid #404040;
    display: flex;
    flex-direction: column;
  `
  
  // 创建标题
  const title = document.createElement('h3')
  title.textContent = '编辑文本内容'
  title.style.cssText = `
    margin: 0 0 16px 0;
    color: #ffffff;
    font-size: 18px;
    font-weight: 600;
  `
  
  // 创建文本区域
  const textarea = document.createElement('textarea')
  textarea.value = currentText
  const textareaHeight = alignedHeight - 120 // 减去标题、按钮和间距的高度
  textarea.style.cssText = `
    width: 100%;
    height: ${textareaHeight}px;
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 4px;
    padding: 12px;
    color: #d1d5db;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    flex: 1;
  `
  textarea.placeholder = '请输入文本内容...'
  
  // 创建按钮容器
  const buttonContainer = document.createElement('div')
  buttonContainer.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 16px;
    flex-shrink: 0;
  `
  
  // 创建取消按钮
  const cancelButton = document.createElement('button')
  cancelButton.textContent = '取消'
  cancelButton.style.cssText = `
    padding: 8px 16px;
    background: #374151;
    border: 1px solid #4b5563;
    border-radius: 4px;
    color: #d1d5db;
    cursor: pointer;
    font-size: 14px;
  `
  
  // 创建确认按钮
  const confirmButton = document.createElement('button')
  confirmButton.textContent = '确认'
  confirmButton.style.cssText = `
    padding: 8px 16px;
    background: #4f46e5;
    border: 1px solid #6366f1;
    border-radius: 4px;
    color: #ffffff;
    cursor: pointer;
    font-size: 14px;
  `
  
  // 添加事件监听
  cancelButton.onclick = () => {
    document.body.removeChild(dialog)
  }
  
  confirmButton.onclick = () => {
    const newText = textarea.value
    updateNode(node.id, {
      config: {
        ...node.config,
        textContent: newText
      }
    })
    console.log('文本内容已更新:', newText)
    document.body.removeChild(dialog)
  }
  
  // 组装对话框
  buttonContainer.appendChild(cancelButton)
  buttonContainer.appendChild(confirmButton)
  dialogContent.appendChild(title)
  dialogContent.appendChild(textarea)
  dialogContent.appendChild(buttonContainer)
  dialog.appendChild(dialogContent)
  
  // 添加到页面
  document.body.appendChild(dialog)
  
  // 聚焦到文本区域
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }, 100)
}

const getPortAtCanvasPosition = (x: number, y: number): { node: WorkflowNode, port: string, type: 'input' | 'output' } | null => {
  for (const node of workflowNodes.value) {
    // 检查输入端口
    for (let i = 0; i < node.inputs.length; i++) {
      // 使用与 drawPort 相同的位置计算逻辑
      const portX = node.x - PORT_RADIUS
      const portY = node.y + (20 + i * 20)
      
      const distance = Math.sqrt((x - portX) ** 2 + (y - portY) ** 2)
      if (distance <= PORT_RADIUS * 2) {
        const portName = typeof node.inputs[i] === 'string' ? node.inputs[i] as string : (node.inputs[i] as { name: string }).name
        return { node, port: portName, type: 'input' }
      }
    }
    
    // 检查输出端口
    for (let i = 0; i < node.outputs.length; i++) {
      // 使用与 drawPort 相同的位置计算逻辑
      const portX = node.x + NODE_WIDTH + PORT_RADIUS
      const portY = node.y + (20 + i * 20)
      
      const distance = Math.sqrt((x - portX) ** 2 + (y - portY) ** 2)
      if (distance <= PORT_RADIUS * 2) {
        const portName = typeof node.outputs[i] === 'string' ? node.outputs[i] as string : (node.outputs[i] as { name: string }).name
        return { node, port: portName, type: 'output' }
      }
    }
  }
  return null
}

const onCanvasMouseDown = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  
  const pos = getCanvasPosition(event)
  const clickedEditIcon = getEditIconAtPosition(pos.x, pos.y)
  const clickedNode = getNodeAtPosition(pos.x, pos.y)
  const clickedPort = getPortAtCanvasPosition(pos.x, pos.y)
  const clickedUploadButton = getUploadButtonAtPosition(pos.x, pos.y)
  const clickedFileNameArea = getFileNameAreaAtPosition(pos.x, pos.y)
  const clickedTextArea = getTextAreaAtPosition(pos.x, pos.y)
  const clickedEditButton = getEditButtonAtPosition(pos.x, pos.y)
  
  if (clickedUploadButton) {
    // 处理上传按钮点击
    handleUploadButtonClick(clickedUploadButton)
  } else if (clickedFileNameArea) {
    // 处理文件名区域点击
    handleFileNameAreaClick(clickedFileNameArea)
  } else if (clickedEditButton) {
    // 处理编辑按钮点击
    handleTextEditButtonClick(clickedEditButton)
  } else if (clickedTextArea) {
    // 处理文本区域点击
    handleTextAreaClick(clickedTextArea)
  } else if (clickedPort) {
    console.log('检测到端口点击:', clickedPort.type, clickedPort.port, '节点:', clickedPort.node.name)
    if (clickedPort.type === 'output') {
      // 开始连接
      console.log('开始从输出端口创建连接')
      connectionManager.startConnection(clickedPort.node.id, clickedPort.port, 'output')
    } else if (clickedPort.type === 'input') {
      // 开始连接
      console.log('开始从输入端口创建连接')
      connectionManager.startConnection(clickedPort.node.id, clickedPort.port, 'input')
    }
  } else if (clickedEditIcon) {
    // 点击编辑图标，显示编辑栏
    selectedNode.value = clickedEditIcon
    console.log('点击编辑图标，选中节点:', clickedEditIcon.name)
  } else if (clickedNode) {
    // 点击节点但不是编辑图标，只开始拖拽，不显示编辑栏
    draggedNode.value = clickedNode
    isDragging.value = true
    dragStart.value = { x: pos.x - clickedNode.x, y: pos.y - clickedNode.y }
    console.log('开始拖拽节点:', clickedNode.name, 'isDragging:', isDragging.value)
  } else {
    // 点击空白区域
    selectedNode.value = null
    connectionManager.selectedConnection.value = null
  }
}

const onCanvasMouseMoveCanvas = (event: MouseEvent) => {
  event.preventDefault()
  
  const pos = getCanvasPosition(event)
  
  if (isDragging.value && draggedNode.value) {
    // 拖拽节点
    const newX = pos.x - dragStart.value.x
    const newY = pos.y - dragStart.value.y
    updateNode(draggedNode.value.id, { x: newX, y: newY })
    console.log('拖拽节点到:', newX, newY)
  } else if (connectionManager.tempConnection.value) {
    // 检测是否悬停在端口上
    const hoveredPort = getPortAtCanvasPosition(pos.x, pos.y)
    let isValidConnection = false
    let isBoundarySnap = false
    
    if (hoveredPort && connectionManager.connectionStart.value) {
      // 验证连接是否有效
      const start = connectionManager.connectionStart.value
      isValidConnection = connectionManager.validateConnection(start, {
        nodeId: hoveredPort.node.id,
        port: hoveredPort.port,
        type: hoveredPort.type
      })
      
      if (isValidConnection) {
        // 如果是有效连接，吸附到端口位置
        const portPos = connectionManager.getPortPosition(hoveredPort.node.id, hoveredPort.port, hoveredPort.type)
        if (portPos) {
          isBoundarySnap = true
          connectionManager.tempConnection.value.x2 = portPos.x
          connectionManager.tempConnection.value.y2 = portPos.y
          connectionManager.tempConnection.value.isHoveringPort = true
          connectionManager.tempConnection.value.isValidConnection = isValidConnection
          connectionManager.tempConnection.value.isBoundarySnap = isBoundarySnap
          console.log('悬停在有效端口上:', hoveredPort.node.name, hoveredPort.port, hoveredPort.type)
          return
        }
      }
    }
    
    // 更新临时连接线到鼠标位置
    connectionManager.tempConnection.value.x2 = pos.x
    connectionManager.tempConnection.value.y2 = pos.y
    connectionManager.tempConnection.value.isHoveringPort = false
    connectionManager.tempConnection.value.isValidConnection = isValidConnection
    connectionManager.tempConnection.value.isBoundarySnap = false
    console.log('更新临时连接线到:', pos.x, pos.y)
  }
}

const onCanvasMouseUpCanvas = (event: MouseEvent) => {
  event.preventDefault()
  
  const pos = getCanvasPosition(event)
  
  if (connectionManager.tempConnection.value) {
    // 检测目标端口
    const targetResult = getPortAtCanvasPosition(pos.x, pos.y)
    if (targetResult && connectionManager.connectionStart.value) {
      // 验证连接是否有效
      const start = connectionManager.connectionStart.value
      const isValidConnection = connectionManager.validateConnection(start, {
        nodeId: targetResult.node.id,
        port: targetResult.port,
        type: targetResult.type
      })
      
      if (isValidConnection) {
        console.log('完成有效连接:', targetResult)
        const success = connectionManager.completeConnection(targetResult.node.id, targetResult.port, targetResult.type)
        if (!success) {
          console.log('连接创建失败')
        }
      } else {
        console.log('连接无效，取消连接')
        connectionManager.cancelConnection()
      }
    } else {
      console.log('未检测到目标端口，取消连接')
      connectionManager.cancelConnection()
    }
  }
  
  if (isDragging.value) {
    console.log('结束拖拽')
  }
  
  isDragging.value = false
  draggedNode.value = null
}

const onCanvasWheelCanvas = (event: WheelEvent) => {
  event.preventDefault()
  const delta = event.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.max(0.1, Math.min(3, scale.value * delta))
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
      // 使用Canvas坐标转换函数
      const pos = getCanvasPosition(event)
      const newNode: WorkflowNode = {
        id: `node_${Date.now()}`,
        type: template.type,
        name: template.name,
        x: pos.x - NODE_WIDTH / 2, // 居中放置
        y: pos.y - NODE_HEIGHT / 2,
        config: {},
        inputs: template.category === 'input' ? [] : ['input'],
        outputs: template.category === 'output' ? [] : ['output']
      }
      workflowNodes.value.push(newNode)
      // 移除自动选中节点，不显示编辑菜单
      // selectedNode.value = newNode
      
      // 同步到当前工作流
      currentWorkflow.nodes = [...workflowNodes.value]
      console.log('拖拽添加节点:', newNode)
    }
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

// 文本换行处理函数
const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''
  
  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word
    const metrics = context.measureText(testLine)
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  
  if (currentLine) {
    lines.push(currentLine)
  }
  
  return lines
}

// 生命周期
onMounted(() => {
  // 初始化Canvas
  initCanvas()
  
  // 开始渲染循环
  startRenderLoop()
  
  // 添加全局鼠标事件监听，确保连接线和拖拽能在整个窗口范围内移动
  const handleGlobalMouseMove = (event: MouseEvent) => {
    if (!canvasRef.value) return
    
    const rect = canvasRef.value.getBoundingClientRect()
    const mouseX = (event.clientX - rect.left) / scale.value - offset.value.x
    const mouseY = (event.clientY - rect.top) / scale.value - offset.value.y
    
    // 处理节点拖拽
    if (isDragging.value && draggedNode.value) {
      const newX = mouseX - dragStart.value.x
      const newY = mouseY - dragStart.value.y
      updateNode(draggedNode.value.id, { x: newX, y: newY })
      console.log('全局拖拽节点到:', newX, newY)
      return
    }
    
    // 处理连接线
    if (connectionManager.tempConnection.value) {
      // 如果鼠标在画布范围内，使用画布的鼠标移动逻辑
      if (event.clientX >= rect.left && event.clientY >= rect.top && 
          event.clientX <= rect.right && event.clientY <= rect.bottom) {
        return // 让画布的鼠标移动事件处理
      }
      
      // 鼠标在画布外，直接跟随鼠标位置
      connectionManager.updateTempConnection(mouseX, mouseY, false)
    }
  }
  
  const handleGlobalMouseUp = () => {
    if (connectionManager.tempConnection.value) {
      // 在画布外释放鼠标，取消连接
      connectionManager.cancelConnection()
    }
    
    if (isDragging.value) {
      console.log('全局结束拖拽')
    }
    
    isDragging.value = false
    draggedNode.value = null
  }
  
  document.addEventListener('mousemove', handleGlobalMouseMove)
  document.addEventListener('mouseup', handleGlobalMouseUp)
  
  // 清理事件监听器和动画帧
  onUnmounted(() => {
    document.removeEventListener('mousemove', handleGlobalMouseMove)
    document.removeEventListener('mouseup', handleGlobalMouseUp)
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value)
      animationFrameId.value = null
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