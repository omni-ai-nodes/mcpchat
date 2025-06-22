<template>
  <div 
    class="workflow-node"
    :class="{ selected: isSelected }"
    :style="{ left: node.x + 'px', top: node.y + 'px' }"
    @mousedown="startDrag"
    @click="selectNode"
  >
    <!-- 输入端口 -->
    <div 
      v-if="node.inputs?.length"
      class="node-ports node-input-port"
    >
      <div 
        v-for="(input, index) in node.inputs" 
        :key="input"
        class="port input-port"
        :class="{ 
          'connecting': isPortHighlighted(input, 'input'),
          'connectable': props.isConnecting && props.connectionStart?.nodeId !== props.node.id && props.connectionStart?.type === 'output'
        }"
        :style="{ top: `${20 + index * 30}px` }"
        @mousedown.stop="startPortDrag(input, 'input', $event)"
        @mouseup.stop="endPortDrag(input, 'input', $event)"
        :title="`输入端口: ${input}`"
      />
    </div>

    <!-- 输出端口 -->
    <div 
      v-if="node.outputs?.length"
      class="node-ports node-output-port"
    >
      <div 
        v-for="(output, index) in node.outputs" 
        :key="output"
        class="port output-port"
        :class="{ 
          'connecting': isPortHighlighted(output, 'output'),
          'connectable': props.isConnecting && props.connectionStart?.nodeId !== props.node.id && props.connectionStart?.type === 'input'
        }"
        :style="{ top: `${20 + index * 30}px` }"
        @mousedown.stop="startPortDrag(output, 'output', $event)"
        @mouseup.stop="endPortDrag(output, 'output', $event)"
        :title="`输出端口: ${output}`"
      />
    </div>

    <!-- 节点头部 -->
    <div class="node-header">
      <div class="node-icon">
        {{ getNodeIcon(node.type) }}
      </div>
      <div class="node-title">{{ node.name }}</div>
      <button 
        class="node-delete-btn"
        @click.stop="$emit('delete', node.id)"
      >
        ×
      </button>
    </div>

    <!-- 节点内容 -->
    <div class="node-content">
      <div class="node-type">{{ getNodeTypeLabel(node.type) }}</div>
      <div class="node-description">{{ node.description || '暂无描述' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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
</script>

<style scoped>
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
  user-select: none;
  z-index: 20; /* 确保节点在连接线之上 */
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
  background: #333333;
  border-radius: 10px 10px 0 0;
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
  color: #ffffff;
}

.node-delete-btn {
  padding: 2px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.node-delete-btn:hover {
  background: #ff4444;
  color: white;
}

.node-content {
  padding: 12px 16px;
  color: #cccccc;
}

.node-type {
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}

.node-description {
  font-size: 11px;
  color: #aaa;
  line-height: 1.4;
}

.node-ports {
  position: absolute;
  top: 0;
  height: 100%;
  z-index: 25; /* 端口容器的z-index */
}

.node-input-port {
  left: -16px;
}

.node-output-port {
  right: -2px;
}

.port {
  position: absolute;
  width: 16px;
  height: 16px;
  background: #60a5fa;
  border: 2px solid #2a2a2a;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 30; /* 确保端口在最上层，便于交互 */
}

.port:hover {
  background: #93c5fd;
  transform: scale(1.2);
}

.input-port {
  background: #10b981;
}

.output-port {
  background: #f59e0b;
}

.port.connecting {
  background: #10b981;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.8);
  animation: pulse 1.5s infinite;
}

.port.connectable {
  background: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
  transform: scale(1.1);
}

.port.connectable:hover {
  background: #fbbf24;
  transform: scale(1.3);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.8);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>