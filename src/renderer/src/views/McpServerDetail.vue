<template>
  <div class="flex flex-col h-full">
    <!-- 头部 -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 sm:p-6 border-b">
      <Button variant="ghost" size="icon" @click="goBack" class="self-start">
        <Icon icon="lucide:arrow-left" class="h-4 w-4" />
      </Button>
      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1 w-full sm:w-auto">
        <div class="flex items-center gap-3 flex-1 w-full sm:w-auto">
          <div class="flex-shrink-0">
            <img 
              v-if="serverDetail?.Logo && (serverDetail.Logo.startsWith('http') || serverDetail.Logo.startsWith('data:'))"
              :src="serverDetail.Logo"
              :alt="serverDetail?.Name || 'Server'"
              class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover"
              @error="$event.target.style.display='none'; $event.target.nextElementSibling.style.display='flex'"
            />
            <div 
              v-else
              class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-base sm:text-lg"
            >
              🔧
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-xl sm:text-2xl font-semibold truncate">{{ serverDetail?.Name || 'Loading...' }}</h1>
            <p v-if="serverDetail?.By" class="text-sm text-muted-foreground">by {{ serverDetail.By }}</p>
          </div>
        </div>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Button
            v-if="serverDetail?.Github"
            variant="outline"
            size="sm"
            @click="openGithub(serverDetail.Github)"
            class="w-full sm:w-auto"
          >
            <Icon icon="lucide:github" class="h-4 w-4 mr-2" />
            GitHub
          </Button>
          <Button
            v-if="serverDetail?.DeployJson"
            variant="default"
            size="sm"
            @click="installServer"
            class="w-full sm:w-auto"
          >
            <Icon icon="lucide:download" class="h-4 w-4 mr-2" />
            {{ t('mcp.mcpGallery.install') }}
          </Button>
        </div>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 overflow-hidden">
      <div class="h-full overflow-y-auto scrollbar-hide">
        <div class="max-w-4xl mx-auto p-4 sm:p-6">
          <!-- 加载状态 -->
          <div v-if="loading" class="flex items-center justify-center py-12">
            <div class="flex items-center gap-2">
              <Icon icon="lucide:loader-2" class="h-5 w-5 animate-spin" />
              <span>{{ t('common.loading') }}</span>
            </div>
          </div>

          <!-- 错误状态 -->
          <div v-else-if="error" class="flex items-center justify-center py-12">
            <div class="text-center">
              <Icon icon="lucide:alert-circle" class="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 class="text-lg font-semibold mb-2">{{ t('common.error') }}</h3>
              <p class="text-muted-foreground mb-4">{{ error }}</p>
              <Button @click="fetchServerDetail">{{ t('common.retry') }}</Button>
            </div>
          </div>

          <!-- 服务器详情 -->
          <div v-else-if="serverDetail" class="space-y-6">
            <!-- 简介 -->
            <div v-if="serverDetail.Introdution">
              <h2 class="text-xl font-semibold mb-3">{{ t('mcp.serverDetail.introduction') }}</h2>
              <p class="text-muted-foreground leading-relaxed">{{ serverDetail.Introdution }}</p>
            </div>

            <!-- 标签页 -->
            <div class="border rounded-lg">
              <div class="flex border-b overflow-x-auto scrollbar-hide">
                <button
                  v-for="tab in tabs"
                  :key="tab.key"
                  :class="[
                    'px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
                    activeTab === tab.key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  ]"
                  @click="activeTab = tab.key"
                >
                  {{ tab.label }}
                </button>
              </div>
              
              <div class="p-4 sm:p-6">
                <!-- 快速入门 -->
                <div v-if="activeTab === 'quickstart' && serverDetail.Content" class="prose prose-sm max-w-none dark:prose-invert">
                  <div v-html="serverDetail.Content"></div>
                </div>
                
                <!-- 工具说明 -->
                <div v-else-if="activeTab === 'tools' && serverDetail.Tools" class="prose prose-sm max-w-none dark:prose-invert">
                  <div v-html="serverDetail.Tools"></div>
                </div>
                
                <!-- 配置信息 -->
                <div v-else-if="activeTab === 'config' && serverDetail.DeployJson">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-semibold">{{ t('mcp.serverDetail.deployConfig') }}</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      @click="copyDeployConfig"
                      class="flex items-center gap-2"
                    >
                      <Icon icon="lucide:copy" class="h-4 w-4" />
                      {{ t('common.copy') }}
                    </Button>
                  </div>
                  <pre class="bg-muted p-4 rounded-lg overflow-x-auto scrollbar-hide text-sm"><code>{{ formatJson(serverDetail.DeployJson) }}</code></pre>
                </div>
                
                <!-- 空状态 -->
                <div v-else class="text-center py-8 text-muted-foreground">
                  <Icon icon="lucide:file-text" class="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{{ t('mcp.serverDetail.noContent') }}</p>
                </div>
              </div>
            </div>

            <!-- 元信息 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <h3 class="text-sm font-medium text-muted-foreground mb-1">{{ t('mcp.serverDetail.createdAt') }}</h3>
                <p class="text-sm break-words">{{ formatDate(serverDetail.CreatedAt) }}</p>
              </div>
              <div>
                <h3 class="text-sm font-medium text-muted-foreground mb-1">{{ t('mcp.serverDetail.updatedAt') }}</h3>
                <p class="text-sm break-words">{{ formatDate(serverDetail.UpdatedAt) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 隐藏的 McpServers 组件，用于调用其方法 -->
    <McpServers ref="mcpServersRef" style="display: none;" />

    <!-- 安装服务器弹窗 -->
    <Dialog v-model:open="isInstallDialogOpen">
      <DialogContent class="w-[95vw] max-w-[500px] px-0 h-[85vh] max-h-[500px] flex flex-col">
        <DialogHeader class="px-3 flex-shrink-0 pb-2">
          <DialogTitle class="text-base">
            {{ t('mcp.mcpGallery.installDialog.title') }}
          </DialogTitle>
          <DialogDescription class="text-sm">
            {{ t('mcp.mcpGallery.installDialog.description') }}
          </DialogDescription>
        </DialogHeader>
        <McpServerForm
          :default-json-config="prefilledJsonConfig"
          @submit="handleInstallSubmit"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button } from '@/components/ui/button'
import McpServerForm from '@/components/mcp-config/mcpServerForm.vue'
import McpServers from '@/components/mcp-config/components/McpServers.vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

// 响应式数据
const loading = ref(false)
const error = ref('')
const serverDetail = ref<any>(null)
const activeTab = ref('quickstart')

// 安装对话框状态
const isInstallDialogOpen = ref(false)
const prefilledJsonConfig = ref('')

// McpServers 组件引用
const mcpServersRef = ref<InstanceType<typeof McpServers> | null>(null)

// 标签页配置
const tabs = computed(() => [
  { key: 'quickstart', label: t('mcp.serverDetail.quickstart') },
  { key: 'tools', label: t('mcp.serverDetail.tools') },
  { key: 'config', label: t('mcp.serverDetail.config') }
])

// 获取服务器详情
const fetchServerDetail = async () => {
  const serverName = route.params.name as string
  if (!serverName) {
    error.value = t('mcp.serverDetail.invalidParams')
    return
  }

  loading.value = true
  error.value = ''
  
  const apiUrl = import.meta.env.VITE_MCP_SERVER_API_URL || 'https://api.omni-ainode.com'
  
  try {
    const response = await fetch(`${apiUrl}/api/get_mcp_server_info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: serverName
      })
    })

    const result = await response.json()
    
    if (result.code === 200) {
      serverDetail.value = result.data.mcp_data
    } else {
      error.value = result.msg || t('mcp.serverDetail.fetchError')
    }
  } catch (err) {
    console.error('Failed to fetch server detail:', err)
    error.value = t('mcp.serverDetail.networkError')
  } finally {
    loading.value = false
  }
}

// 返回上一页
const goBack = () => {
  router.back()
}

// 打开GitHub链接
const openGithub = (url: string) => {
  window.open(url, '_blank')
}

// 安装服务器
const installServer = () => {
  console.log('安装服务器:', serverDetail.value)
  
  if (!serverDetail.value) {
    alert('服务器信息不可用')
    return
  }
  
  // 如果有 DeployJson 配置信息，预填充到弹窗中
  if (serverDetail.value.DeployJson) {
    try {
      // 解析原始 JSON 配置
      const deployConfig = JSON.parse(serverDetail.value.DeployJson)
      
      // 自动为每个服务器配置添加 icons、type、github 等字段
      if (deployConfig.mcpServers) {
        Object.keys(deployConfig.mcpServers).forEach(serverKey => {
          const serverConfig = deployConfig.mcpServers[serverKey]
          
          // 添加 icons 字段，使用 ServerItem 的 icon
          if (!serverConfig.icons) {
            serverConfig.icons = serverDetail.value.Logo || '🔧'
          }
          
          // 添加默认 type 字段
          if (!serverConfig.type) {
            serverConfig.type = 'stdio'
          }
          
          // 添加 简介
          if (!serverConfig.descriptions) {
            serverConfig.descriptions = serverDetail.value.Introdution || ''
          }
          
          // 添加 GitHub 字段，使用 ServerDetail 的 Github
          if (!serverConfig.github && serverDetail.value.Github) {
            serverConfig.github = serverDetail.value.Github
          }
        })
      }
      
      // 将修改后的配置转换回 JSON 字符串
      const enhancedDeployJson = JSON.stringify(deployConfig, null, 2)
      
      // 设置预填充配置并打开弹窗
      prefilledJsonConfig.value = enhancedDeployJson
      isInstallDialogOpen.value = true
      
      console.log(`准备安装服务器 "${serverDetail.value.Name}"，已预填充配置`)
    } catch (error) {
      console.error('DeployJson 格式错误:', error)
      alert(`服务器 "${serverDetail.value.Name}" 的部署配置格式错误：\n\n${serverDetail.value.DeployJson}`)
    }
  } else {
    alert(`服务器 "${serverDetail.value.Name}" 没有部署配置信息`)
  }
}

// 处理表单提交
const handleInstallSubmit = async (name: string, config: any) => {
  console.log('安装服务器配置:', name, config)
  
  try {
    // 调用 McpServers 组件的 handleAddServer 方法
    if (mcpServersRef.value) {
      await mcpServersRef.value.handleAddServer(name, {
        ...config,
        type: 'gallery' // 确保类型为 gallery
      })
      console.log('服务器添加成功:', name)
    } else {
      console.error('McpServers 组件引用不可用')
    }
  } catch (error) {
    console.error('添加服务器时发生错误:', error)
  }
  
  // 关闭弹窗
  isInstallDialogOpen.value = false
  // 清空预填充配置
  prefilledJsonConfig.value = ''
}

// 复制部署配置
const copyDeployConfig = async () => {
  if (!serverDetail.value?.DeployJson) return
  
  try {
    const formattedJson = formatJson(serverDetail.value.DeployJson)
    await navigator.clipboard.writeText(formattedJson)
    // TODO: 可以添加成功提示
    console.log('Deploy config copied to clipboard')
  } catch (err) {
    console.error('Failed to copy deploy config:', err)
    // 降级方案：使用传统的复制方法
    try {
      const textArea = document.createElement('textarea')
      textArea.value = formatJson(serverDetail.value.DeployJson)
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      console.log('Deploy config copied to clipboard (fallback)')
    } catch (fallbackErr) {
      console.error('Fallback copy also failed:', fallbackErr)
    }
  }
}

// 格式化JSON
const formatJson = (jsonStr: string) => {
  try {
    return JSON.stringify(JSON.parse(jsonStr), null, 2)
  } catch {
    return jsonStr
  }
}

// 格式化日期
const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}

// 组件挂载时获取数据
onMounted(() => {
  fetchServerDetail()
})
</script>

<style scoped>
/* 自定义样式 */
.prose {
  color: inherit;
}

.prose h1,
.prose h2,
.prose h3,
.prose h4,
.prose h5,
.prose h6 {
  color: inherit;
}

.prose pre {
  background-color: hsl(var(--muted));
  color: inherit;
}

.prose code {
  background-color: hsl(var(--muted));
  color: inherit;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
}

.prose pre code {
  background-color: transparent;
  padding: 0;
}

/* 隐藏滚动条 */
.scrollbar-hide {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;  /* Chrome, Safari and Opera */
}
</style>