<template>
  <div 
    class="workflow-node"
    :class="{ selected: isSelected }"
    :style="{ left: node.x + 'px', top: node.y + 'px' }"
    @mousedown="startDrag"
    @click="selectNode"
  >
    <!-- 节点头部 -->
    <div class="node-header">
      <!-- 输入端口 -->
      <div class="header-inputs" v-if="node.inputs?.length">
        <div 
          v-for="(input, index) in node.inputs" 
          :key="input"
          class="header-port input-port"
          :class="{ 
            'connecting': isPortHighlighted(input, 'input'),
            'connectable': props.isConnecting && props.connectionStart?.nodeId !== props.node.id && props.connectionStart?.type === 'output'
          }"
          @mousedown.stop="startPortDrag(input, 'input', $event)"
          @mouseup.stop="endPortDrag(input, 'input', $event)"
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
          v-for="(output, index) in node.outputs" 
          :key="output"
          class="header-port output-port"
          :class="{ 
            'connecting': isPortHighlighted(output, 'output'),
            'connectable': props.isConnecting && props.connectionStart?.nodeId !== props.node.id && props.connectionStart?.type === 'input'
          }"
          @mousedown.stop="startPortDrag(output, 'output', $event)"
          @mouseup.stop="endPortDrag(output, 'output', $event)"
          :title="`输出端口: ${output}`"
        >
          <div class="port-dot"></div>
        </div>
      </div>
    </div>

    <!-- 节点内容 -->
    <div class="node-content">
      <div class="node-type">{{ getNodeTypeLabel(node.type) }}</div>
      <div class="node-description">{{ node.description || '暂无描述' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'

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

interface Props {
  node: WorkflowNode
  isSelected?: boolean
  isConnecting?: boolean
  connectionStart?: { nodeId: string, port: string, type: 'input' | 'output' } | null
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
  
  emit('update', props.node.id, { x: newX, y: newY })
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

const endPortDrag = (port: string, type: 'input' | 'output', event: MouseEvent) => {
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

// 计算端口位置（现在端口在头部，这个方法可能不再需要，但保留以防其他地方使用）
const getPortPosition = (index: number, type: 'input' | 'output') => {
  // 端口现在在头部，返回头部中心位置
  const headerHeight = 32 // 节点头部高度
  return headerHeight / 2
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
  z-index: 20; /* 确保节点在连接线之上 */
  overflow: visible;
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
</style>