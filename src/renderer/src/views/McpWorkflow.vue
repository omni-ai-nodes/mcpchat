<template>
  <div class="h-full flex flex-col bg-background">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between p-6 border-b">
      <div class="flex items-center gap-4">
        <h1 class="text-2xl font-semibold">{{ t('mcp.workflow.title') }}</h1>
        <Badge variant="secondary">{{ t('mcp.workflow.beta') }}</Badge>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="refreshWorkflows">
          <Icon icon="lucide:refresh-cw" class="w-4 h-4 mr-2" />
          {{ t('mcp.workflow.refresh') }}
        </Button>
        <Button size="sm" @click="createWorkflow">
          <Icon icon="lucide:plus" class="w-4 h-4 mr-2" />
          {{ t('mcp.workflow.create') }}
        </Button>
      </div>
    </div>

    <!-- 工作流列表 -->
    <div class="flex-1 p-6">
      <div v-if="loading" class="flex items-center justify-center h-64">
        <div class="flex items-center gap-2">
          <Icon icon="lucide:loader-2" class="w-5 h-5 animate-spin" />
          <span>{{ t('mcp.workflow.loading') }}</span>
        </div>
      </div>

      <div v-else-if="workflows.length === 0" class="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Icon icon="lucide:workflow" class="w-16 h-16 mb-4" />
        <h3 class="text-lg font-medium mb-2">{{ t('mcp.workflow.empty.title') }}</h3>
        <p class="text-sm mb-4">{{ t('mcp.workflow.empty.description') }}</p>
        <Button @click="createWorkflow">
          <Icon icon="lucide:plus" class="w-4 h-4 mr-2" />
          {{ t('mcp.workflow.create') }}
        </Button>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card v-for="workflow in workflows" :key="workflow.id" class="hover:shadow-md transition-shadow">
          <CardHeader>
            <div class="flex items-center justify-between">
              <CardTitle class="text-lg">{{ workflow.name }}</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Icon icon="lucide:more-horizontal" class="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @click="editWorkflow(workflow)">
                    <Icon icon="lucide:edit" class="w-4 h-4 mr-2" />
                    {{ t('mcp.workflow.edit') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="duplicateWorkflow(workflow)">
                    <Icon icon="lucide:copy" class="w-4 h-4 mr-2" />
                    {{ t('mcp.workflow.duplicate') }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem @click="deleteWorkflow(workflow)" class="text-destructive">
                    <Icon icon="lucide:trash-2" class="w-4 h-4 mr-2" />
                    {{ t('mcp.workflow.delete') }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <CardDescription>{{ workflow.description }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center gap-4 text-sm text-muted-foreground mb-4">
              <div class="flex items-center gap-1">
                <Icon icon="lucide:layers" class="w-4 h-4" />
                <span>{{ workflow.steps.length }} {{ t('mcp.workflow.steps') }}</span>
              </div>
              <div class="flex items-center gap-1">
                <Icon icon="lucide:clock" class="w-4 h-4" />
                <span>{{ formatDate(workflow.updatedAt) }}</span>
              </div>
            </div>
            <div class="flex items-center justify-between">
              <Badge :variant="workflow.status === 'active' ? 'default' : 'secondary'">
                {{ t(`mcp.workflow.status.${workflow.status}`) }}
              </Badge>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="runWorkflow(workflow)">
                  <Icon icon="lucide:play" class="w-4 h-4 mr-1" />
                  {{ t('mcp.workflow.run') }}
                </Button>
                <Button variant="outline" size="sm" @click="editWorkflow(workflow)">
                  <Icon icon="lucide:edit" class="w-4 h-4 mr-1" />
                  {{ t('mcp.workflow.edit') }}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Icon } from '@iconify/vue'

const { t } = useI18n()

// 工作流数据类型
interface WorkflowStep {
  id: string
  type: 'mcp-tool' | 'condition' | 'loop' | 'delay'
  name: string
  config: Record<string, any>
}

interface Workflow {
  id: string
  name: string
  description: string
  status: 'active' | 'inactive' | 'draft'
  steps: WorkflowStep[]
  createdAt: string
  updatedAt: string
}

// 响应式数据
const loading = ref(false)
const workflows = ref<Workflow[]>([])

// 模拟数据
const mockWorkflows: Workflow[] = [
  {
    id: '1',
    name: '自动化数据处理',
    description: '定期处理和分析数据文件',
    status: 'active',
    steps: [
      { id: '1', type: 'mcp-tool', name: '读取文件', config: {} },
      { id: '2', type: 'mcp-tool', name: '数据转换', config: {} },
      { id: '3', type: 'mcp-tool', name: '保存结果', config: {} }
    ],
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T15:30:00Z'
  },
  {
    id: '2',
    name: '代码审查助手',
    description: '自动检查代码质量和安全性',
    status: 'active',
    steps: [
      { id: '1', type: 'mcp-tool', name: '获取代码', config: {} },
      { id: '2', type: 'mcp-tool', name: '静态分析', config: {} },
      { id: '3', type: 'condition', name: '检查结果', config: {} },
      { id: '4', type: 'mcp-tool', name: '生成报告', config: {} }
    ],
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-18T11:20:00Z'
  },
  {
    id: '3',
    name: '文档生成器',
    description: '根据代码自动生成API文档',
    status: 'draft',
    steps: [
      { id: '1', type: 'mcp-tool', name: '扫描代码', config: {} },
      { id: '2', type: 'mcp-tool', name: '提取注释', config: {} },
      { id: '3', type: 'mcp-tool', name: '生成文档', config: {} }
    ],
    createdAt: '2024-01-12T14:00:00Z',
    updatedAt: '2024-01-12T14:00:00Z'
  }
]

// 方法
const refreshWorkflows = async () => {
  loading.value = true
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000))
    workflows.value = [...mockWorkflows]
  } catch (error) {
    console.error('Failed to refresh workflows:', error)
  } finally {
    loading.value = false
  }
}

const createWorkflow = () => {
  console.log('创建新工作流')
  // TODO: 打开工作流编辑器
}

const editWorkflow = (workflow: Workflow) => {
  console.log('编辑工作流:', workflow.name)
  // TODO: 打开工作流编辑器
}

const duplicateWorkflow = (workflow: Workflow) => {
  console.log('复制工作流:', workflow.name)
  // TODO: 复制工作流
}

const deleteWorkflow = (workflow: Workflow) => {
  console.log('删除工作流:', workflow.name)
  // TODO: 确认删除
}

const runWorkflow = (workflow: Workflow) => {
  console.log('运行工作流:', workflow.name)
  // TODO: 执行工作流
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// 组件挂载时获取数据
onMounted(() => {
  refreshWorkflows()
})
</script>