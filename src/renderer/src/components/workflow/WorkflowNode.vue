<template>
  <div 
    class="workflow-node"
    :class="{ 
      selected: isSelected,
      'node-idle': nodeStatus === 'idle',
      'node-running': nodeStatus === 'running',
      'node-completed': nodeStatus === 'completed',
      'node-error': nodeStatus === 'error',
      'node-flashing': isCurrentRunning
    }"
    :style="{ left: node.x + 'px', top: node.y + 'px' }"
    @mousedown="startDrag"
    @click="selectNode"
  >
    <!-- 节点头部 -->
    <div class="node-header">
      <!-- 输入端口 -->
      <div class="header-inputs" v-if="node.inputs?.length">
        <div 
          v-for="input in node.inputs" 
          :key="input"
          class="header-port input-port"
          :class="{ 
            'connecting': isPortHighlighted(input, 'input'),
            'connectable': props.isConnecting && props.connectionStart?.nodeId !== props.node.id && props.connectionStart?.type === 'output'
          }"
          @mousedown.stop="startPortDrag(input, 'input', $event)"
          @mouseup.stop="endPortDrag($event)"
          :title="`输入端口: ${input}`"
        >
          <div class="port-dot"></div>
        </div>
      </div>
      
      <div class="node-content-header">
        <div class="node-icon">
          {{ getNodeIcon(node.type) }}
        </div>
        <div class="node-title">{{ node.name }}</div>
      </div>
      
      <!-- 输出端口 -->
      <div class="header-outputs" v-if="node.outputs?.length">
        <div 
          v-for="output in node.outputs" 
          :key="output"
          class="header-port output-port"
          :class="{ 
            'connecting': isPortHighlighted(output, 'output'),
            'connectable': props.isConnecting && props.connectionStart?.nodeId !== props.node.id && props.connectionStart?.type === 'input'
          }"
          @mousedown.stop="startPortDrag(output, 'output', $event)"
          @mouseup.stop="endPortDrag($event)"
          :title="`输出端口: ${output}`"
        >
          <div class="port-dot"></div>
        </div>
      </div>
    </div>

    <!-- 节点内容 -->
    <div class="node-content">
      <!-- 文本输出节点特殊显示 -->
      <template v-if="node.type === 'text-output'">
        <div class="node-type">{{ getNodeTypeLabel(node.type) }}</div>
        <div v-if="node.config?.outputText" class="output-text-content">
          <div class="output-text-label">输出内容:</div>
          <div class="output-text-value">{{ node.config.outputText }}</div>
        </div>
        <div v-else class="node-description">等待执行结果...</div>
      </template>
      
      <!-- 非文件输入和非文本输出节点显示通用文字区域 -->
      <template v-else-if="node.type !== 'file-input'">
        <div class="node-type">{{ getNodeTypeLabel(node.type) }}</div>
        <div class="node-description">{{ node.config?.description || '暂无描述' }}</div>
      </template>
      
      <!-- 文件输入节点特殊内容 -->
      <div v-if="node.type === 'file-input'" class="file-input-content">
        <!-- 文件输入节点不显示通用的文字区域，直接显示上传按钮 -->
        <input 
          ref="fileInputRef"
          type="file" 
          class="hidden-file-input"
          @change="handleFileUpload"
          accept="*/*"
        />
        <button 
          class="upload-button"
          @click="triggerFileUpload"
          @mousedown.stop
          @click.stop
        >
          📁 选择文件
        </button>
        
        <!-- 已上传文件信息 -->
        <div v-if="uploadedFile" class="uploaded-file-info">
          <div class="file-name">{{ uploadedFile.name }}</div>
          
          <!-- 图片预览 -->
          <div v-if="isImageFile(uploadedFile.name)" class="image-preview">
            <img :src="uploadedFile.localPath" alt="预览图" class="preview-image" />
          </div>
          
          <!-- 文件信息 -->
          <div class="file-details">
            <span class="file-size">{{ formatFileSize(uploadedFile.size) }}</span>
            <span class="file-type">{{ getFileExtension(uploadedFile.name) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

interface WorkflowNode {
  id: string
  type: string
  name: string
  x: number
  y: number
  config: {
    description?: string
    outputText?: string
    uploadedFile?: {
      name: string
      size: number
      localPath: string
      originalPath: string
    }
    [key: string]: unknown
  }
  inputs: string[]
  outputs: string[]
}

interface Props {
  node: WorkflowNode
  isSelected?: boolean
  isConnecting?: boolean
  connectionStart?: { nodeId: string, port: string, type: 'input' | 'output' } | null
  nodeStatus?: 'idle' | 'running' | 'completed' | 'error'
  isCurrentRunning?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  delete: [nodeId: string]
  update: [nodeId: string, updates: Partial<WorkflowNode>]
  select: [nodeId: string]
  startConnection: [nodeId: string, port: string, type: 'input' | 'output']
}>()

const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const nodeStart = ref({ x: 0, y: 0 })

// 节点拖拽更新节流控制
let lastDragUpdate = 0
const DRAG_UPDATE_THROTTLE = 16 // 约60fps的更新频率

// 文件上传相关
const fileInputRef = ref<HTMLInputElement>()
const uploadedFile = ref<{
  name: string
  size: number
  localPath: string
  originalPath: string
} | null>(props.node.config?.uploadedFile || null)

// 移除调试日志

const getNodeIcon = (type: string) => {
  const iconMap: Record<string, string> = {
    'file-input': '📁',
    'api-input': '🌐',
    'text-transform': '🔄',
    'data-filter': '🔍',
    'file-output': '💾',
    'api-output': '📤'
  }
  return iconMap[type] || '📦'
}

const getNodeTypeLabel = (type: string) => {
  const labelMap: Record<string, string> = {
    'file-input': '文件输入',
    'text-input': '文本输入',
    'text-output': '文本输出',
    'model-service': '模型服务',
    'mcp-service': 'MCP服务',
    'api-input': 'API输入',
    'text-transform': '文本转换',
    'data-filter': '数据过滤',
    'file-output': '文件输出',
    'api-output': 'API输出'
  }
  return labelMap[type] || type
}

const selectNode = () => {
  emit('select', props.node.id)
}

const startDrag = (event: MouseEvent) => {
  isDragging.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
  nodeStart.value = { x: props.node.x, y: props.node.y }
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

const onDrag = (event: MouseEvent) => {
  if (!isDragging.value) return
  
  const deltaX = event.clientX - dragStart.value.x
  const deltaY = event.clientY - dragStart.value.y
  
  const newX = nodeStart.value.x + deltaX
  const newY = nodeStart.value.y + deltaY
  
  // 使用节流控制，确保流畅的拖拽体验同时避免过度更新
  const now = Date.now()
  if (now - lastDragUpdate >= DRAG_UPDATE_THROTTLE) {
    emit('update', props.node.id, { x: newX, y: newY })
    lastDragUpdate = now
  }
}

const stopDrag = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const startPortDrag = (port: string, type: 'input' | 'output', event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  emit('startConnection', props.node.id, port, type)
}

const endPortDrag = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  // 端口的mouseup事件由画布处理，这里不需要额外处理
}

// 检查端口是否应该高亮
const isPortHighlighted = (port: string, type: 'input' | 'output') => {
  if (!props.isConnecting || !props.connectionStart) return false
  
  // 如果是连接起始端口，显示连接状态
  if (props.connectionStart.nodeId === props.node.id && 
      props.connectionStart.port === port && 
      props.connectionStart.type === type) {
    return true
  }
  
  // 如果是可连接的目标端口（不同节点，不同类型），显示高亮
  if (props.connectionStart.nodeId !== props.node.id && 
      props.connectionStart.type !== type) {
    return true
  }
  
  return false
}

// 端口位置计算函数（如需要可以实现）
// const getPortPosition = (index: number, type: 'input' | 'output') => {
//   const headerHeight = 32 // 节点头部高度
//   return headerHeight / 2
// }

// 文件上传相关函数
const triggerFileUpload = () => {
  fileInputRef.value?.click()
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    // 创建文件的本地URL用于预览
    const fileUrl = URL.createObjectURL(file)

    // 通过IPC发送文件保存请求到主进程
    const timestamp = Date.now()
    const fileName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    
    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer()
    
    // 发送文件保存请求到主进程
    let savedPath = ''
    if (window.electron?.ipcRenderer) {
      savedPath = await window.electron?.ipcRenderer?.invoke('save-uploaded-file', {
        fileName,
        fileData: Array.from(new Uint8Array(arrayBuffer)),
        originalName: file.name
      })
    }

    // 更新上传文件信息
    uploadedFile.value = {
      name: file.name,
      size: file.size,
      localPath: isImageFile(file.name) ? fileUrl : savedPath,
      originalPath: savedPath
    }

    // 读取文件内容用于base64编码（如果是图片）
    let imageData = ''
    let fileContent = ''
    
    if (isImageFile(file.name)) {
      // 对于图片文件，转换为base64
      const reader = new FileReader()
      imageData = await new Promise<string>((resolve) => {
        reader.onload = (e) => {
          resolve(e.target?.result as string || '')
        }
        reader.readAsDataURL(file)
      })
    } else {
      // 对于文本文件，读取文本内容
      try {
        fileContent = await file.text()
      } catch (error) {
        console.warn('无法读取文件文本内容:', error)
      }
    }

    // 更新节点配置
    emit('update', props.node.id, {
      config: {
        ...props.node.config,
        uploadedFile: uploadedFile.value,
        // 添加executeFileInputNode需要的字段
        fileName: file.name,
        filePath: savedPath,
        fileType: file.type,
        fileSize: file.size,
        imageData: imageData,
        fileContent: fileContent
      }
    })

  } catch (error) {
    console.error('文件上传失败:', error)
    // 如果保存失败，至少创建一个临时预览
    const fileUrl = URL.createObjectURL(file)
    uploadedFile.value = {
      name: file.name,
      size: file.size,
      localPath: fileUrl,
      originalPath: ''
    }
  }
}

// 工具函数
const isImageFile = (fileName: string): boolean => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg']
  const extension = getFileExtension(fileName)
  return imageExtensions.includes('.' + extension)
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const getFileExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex === -1) return 'unknown'
  return fileName.substring(lastDotIndex + 1).toLowerCase()
}

// 组件卸载时清理
onUnmounted(() => {
  // 清理可能残留的事件监听器
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<style scoped>
.workflow-node {
  position: absolute;
  width: 220px;
  min-height: 120px;
  background: #2a2a2a;
  border: 2px solid #404040;
  border-radius: 12px;
  cursor: move;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  user-select: none;
  display: flex;
  flex-direction: column;
}

/* 节点状态样式 */
.workflow-node.node-idle {
  border-color: #404040;
}

.workflow-node.node-running {
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.workflow-node.node-completed {
  border-color: #10b981;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.workflow-node.node-error {
  border-color: #ef4444;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

/* 当前运行节点的闪光动画 */
.workflow-node.node-flashing {
  animation: nodeFlashing 1.5s ease-in-out infinite;
}

@keyframes nodeFlashing {
  0%, 100% {
    border-color: #3b82f6;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }
  50% {
    border-color: #60a5fa;
    box-shadow: 0 4px 20px rgba(96, 165, 250, 0.8), 0 0 30px rgba(96, 165, 250, 0.6);
  }
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
  padding: 6px 8px;
  border-bottom: 1px solid #404040;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #333333;
  border-radius: 10px 10px 0 0;
  position: relative;
  min-height: 40px;
}

.node-content-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: center;
}

.node-icon {
  width: 16px;
  height: 16px;
  color: #60a5fa;
  flex-shrink: 0;
}

.node-title {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-inputs {
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header-outputs {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header-port {
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 2px;
}

.header-port .port-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #555;
  border: 2px solid #777;
  transition: all 0.2s ease;
  position: relative;
  z-index: 10;
}

.header-port:hover .port-dot {
  background: #60a5fa;
  border-color: #60a5fa;
  box-shadow: 0 0 6px rgba(96, 165, 250, 0.6);
  transform: scale(1.1);
}

.header-port.connecting .port-dot {
  background: #10b981;
  border-color: #10b981;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);
  animation: pulse 1s infinite;
  transform: scale(1.2);
}

.header-port.connectable .port-dot {
  background: #f59e0b;
  border-color: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
  animation: glow 1.5s ease-in-out infinite alternate;
  transform: scale(1.1);
}

.node-content {
  padding: 10px 14px;
  color: #cccccc;
}

.node-type {
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
  font-weight: 500;
}

.node-description {
  font-size: 11px;
  color: #aaa;
  line-height: 1.4;
  max-height: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1.2);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}

@keyframes glow {
  from {
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
    transform: scale(1.1);
  }
  to {
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.9);
    transform: scale(1.15);
  }
}

/* 文件上传相关样式 */
.file-input-content {
  /* 移除默认的 margin 和 border，让按钮占满整个内容区域 */
  min-height: 40px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hidden-file-input {
  display: none;
}

.upload-button {
  width: 100%;
  padding: 6px 12px;
  background: #404040;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.upload-button:hover {
  background: #4a4a4a;
  border-color: #60a5fa;
}

.uploaded-file-info {
  margin-top: 8px;
  padding: 8px;
  background: #333;
  border-radius: 6px;
  border: 1px solid #404040;
}

.file-name {
  font-size: 11px;
  color: #fff;
  font-weight: 500;
  margin-bottom: 4px;
  word-break: break-all;
}

.image-preview {
  margin: 6px 0;
  text-align: center;
}

.preview-image {
  max-width: 100%;
  max-height: 80px;
  border-radius: 4px;
  border: 1px solid #555;
  object-fit: cover;
}

.file-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: #888;
}

.file-size {
  color: #aaa;
}

.file-type {
  color: #60a5fa;
  text-transform: uppercase;
  font-weight: 500;
}

/* 文本输出节点样式 */
.output-text-content {
  margin-top: 8px;
  padding: 8px;
  background: #333;
  border-radius: 6px;
  border: 1px solid #404040;
}

.output-text-label {
  font-size: 10px;
  color: #888;
  margin-bottom: 4px;
  font-weight: 500;
}

.output-text-value {
  font-size: 11px;
  color: #fff;
  line-height: 1.4;
  max-height: 80px;
  overflow-y: auto;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>