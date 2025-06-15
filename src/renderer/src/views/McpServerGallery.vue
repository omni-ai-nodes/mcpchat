<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { useMcpStore } from '@/stores/mcp'
import McpServerForm from '@/components/mcp-config/mcpServerForm.vue'
import McpServers from '@/components/mcp-config/components/McpServers.vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'

// 异步加载组件
const Button = defineAsyncComponent(() => import('@/components/ui/button').then(mod => mod.Button))
const Card = defineAsyncComponent(() => import('@/components/ui/card').then(mod => mod.Card))
const CardContent = defineAsyncComponent(() => import('@/components/ui/card').then(mod => mod.CardContent))
const Input = defineAsyncComponent(() => import('@/components/ui/input').then(mod => mod.Input))
const Select = defineAsyncComponent(() => import('@/components/ui/select').then(mod => mod.Select))
const SelectContent = defineAsyncComponent(() => import('@/components/ui/select').then(mod => mod.SelectContent))
const SelectItem = defineAsyncComponent(() => import('@/components/ui/select').then(mod => mod.SelectItem))
const SelectTrigger = defineAsyncComponent(() => import('@/components/ui/select').then(mod => mod.SelectTrigger))
const SelectValue = defineAsyncComponent(() => import('@/components/ui/select').then(mod => mod.SelectValue))
const Badge = defineAsyncComponent(() => import('@/components/ui/badge').then(mod => mod.Badge))
const Switch = defineAsyncComponent(() => import('@/components/ui/switch').then(mod => mod.Switch))
const Separator = defineAsyncComponent(() => import('@/components/ui/separator').then(mod => mod.Separator))
const DropdownMenu = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenu))
const DropdownMenuContent = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenuContent))
const DropdownMenuItem = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenuItem))
const DropdownMenuTrigger = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenuTrigger))
const DropdownMenuSeparator = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenuSeparator))

const { t } = useI18n()
const mcpStore = useMcpStore()

// McpServers 组件引用
const mcpServersRef = ref<InstanceType<typeof McpServers> | null>(null)

// API返回的服务器数据类型
interface ApiServerItem {
  Id: number
  Name: string
  Logo: string
  By: string
  Introdution: string
  Github: string
  DeployJson: string
  Content: string
  Tools: string
  CreatedAt: string
  UpdatedAt: string
}

// API响应类型
interface ApiResponse {
  code: number
  msg: string
  data: {
    Infos: ApiServerItem[]
    total_pages: number
  }
}

// 服务器数据类型
interface ServerItem {
  id: string
  name: string
  icon: string
  description: string
  type: string // 改为显示By内容
  status: 'running' | 'stopped' | 'error' | 'loading'
  isRunning: boolean
  isDefault: boolean
  toolsCount: number
  promptsCount: number
  resourcesCount: number
  github?: string // 添加GitHub链接
  deployJson?: string // 添加部署配置信息
  command?: string
  args?: string[]
  baseUrl?: string
  errorMessage?: string
}

// 响应式数据
const servers = ref<ServerItem[]>([])
const loading = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)
const pageSize = ref(10)
const searchQuery = ref('')
const filterStatus = ref('all')
const viewMode = ref<'grid' | 'list'>('grid')
const showAddDialog = ref(false)

// API调用函数
const fetchServers = async (page: number = 1, size: number = 10, searchName: string = '') => {
  loading.value = true
  try {
    const apiUrl = import.meta.env.VITE_MCP_SERVER_API_URL || 'https://api.omni-ainode.com'
    const requestBody: any = {
      page_size: size,
      current_page: page
    }
    
    // 如果有搜索内容，添加到请求体中
    if (searchName.trim()) {
      requestBody.name = searchName.trim()
    }
    
    const response = await fetch(`${apiUrl}/api/get_mcp_server_list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data: ApiResponse = await response.json()
    
    if (data.code === 200) {
      // 将API数据映射为组件需要的格式
      servers.value = data.data.Infos.map(item => ({
        id: item.Id.toString(),
        name: item.Name,
        icon: getServerIcon(item.Logo), // 处理图标
        description: item.Introdution,
        type: 'stdio' as const, // 显示By内容而不是http/local
        status: 'stopped' as const, // 默认状态
        isRunning: false,
        isDefault: false,
        toolsCount: 0, // 可以根据需要解析Tools字段
        promptsCount: 0,
        resourcesCount: 0,
        github: item.Github,
        deployJson: item.DeployJson // 保留部署配置信息
      }))
      
      totalPages.value = data.data.total_pages
      currentPage.value = page
    } else {
      console.error('API返回错误:', data.msg)
    }
  } catch (error) {
    console.error('获取服务器列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 处理服务器图标
const getServerIcon = (logo: string): string => {
  // 如果logo是有效的URL，返回该URL用于显示图片
  if (logo && (logo.startsWith('http://') || logo.startsWith('https://') || logo.startsWith('data:'))) {
    return logo
  }
  // 如果logo是emoji或其他字符，直接返回
  if (logo && logo.trim()) {
    return logo
  }
  // 默认图标
  return '🔧'
}

// 打开GitHub链接
const openGithub = (url: string) => {
  if (url) {
    window.open(url, '_blank')
  }
}

// 翻页函数
// 组件挂载时获取数据
onMounted(() => {
  fetchServers()
})

// 监听搜索查询变化，实现实时搜索
watch(searchQuery, (newQuery) => {
  // 重置到第一页并执行搜索
  fetchServers(1, pageSize.value, newQuery)
}, { debounce: 500 }) // 添加防抖，避免频繁请求

// 修改翻页函数以支持搜索
const goToPageWithSearch = (page: number) => {
  if (page >= 1 && page <= totalPages.value && page !== currentPage.value) {
    fetchServers(page, pageSize.value, searchQuery.value)
  }
}

// 更新翻页函数
const goToPage = (page: number) => {
  goToPageWithSearch(page)
}

// 上一页
const prevPage = () => {
  if (currentPage.value > 1) {
    goToPageWithSearch(currentPage.value - 1)
  }
}

// 下一页
const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    goToPageWithSearch(currentPage.value + 1)
  }
}

// 计算属性：过滤后的服务器列表（仅保留状态过滤，搜索已移至服务端）
const filteredServers = computed(() => {
  let filtered = servers.value

  // 状态过滤（保留客户端状态过滤）
  if (filterStatus.value !== 'all') {
    filtered = filtered.filter(server => {
      switch (filterStatus.value) {
        case 'running':
          return server.status === 'running'
        case 'stopped':
          return server.status === 'stopped'
        case 'error':
          return server.status === 'error'
        default:
          return true
      }
    })
  }

  return filtered
})

// 状态相关函数
const getStatusText = (status: string) => {
  switch (status) {
    case 'running':
      return t('mcp.mcpGallery.running')
    case 'loading':
      return t('mcp.mcpGallery.starting')
    case 'error':
      return t('mcp.mcpGallery.error')
    default:
      return t('mcp.mcpGallery.stopped')
  }
}

const getStatusDotClass = (status: string) => {
  switch (status) {
    case 'running':
      return 'bg-green-500'
    case 'loading':
      return 'bg-yellow-500'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-gray-400'
  }
}

const getStatusTextClass = (status: string) => {
  switch (status) {
    case 'running':
      return 'text-green-600'
    case 'loading':
      return 'text-yellow-600'
    case 'error':
      return 'text-red-600'
    default:
      return 'text-gray-500'
  }
}

// 服务器操作函数
const addServer = () => {
  showAddDialog.value = true
}

const editServer = (server: ServerItem) => {
  console.log('编辑服务器:', server)
}

const deleteServer = (server: ServerItem) => {
  console.log('删除服务器:', server)
}

const toggleServer = (server: ServerItem) => {
  server.isRunning = !server.isRunning
  server.status = server.isRunning ? 'running' : 'stopped'
}

const viewTools = (server: ServerItem) => {
  console.log('查看工具:', server)
}

const viewPrompts = (server: ServerItem) => {
  console.log('查看提示词:', server)
}

const viewResources = (server: ServerItem) => {
  console.log('查看资源:', server)
}

// 弹窗状态管理
const isInstallDialogOpen = ref(false)
const prefilledJsonConfig = ref('')

const installServer = (server: ServerItem) => {
  console.log('安装服务器:', server)
  
  // 如果有 DeployJson 配置信息，预填充到弹窗中
  if (server.deployJson) {
    try {
      // 解析原始 JSON 配置
      const deployConfig = JSON.parse(server.deployJson)
      
      // 自动为每个服务器配置添加 icons 和 type 字段
      if (deployConfig.mcpServers) {
        Object.keys(deployConfig.mcpServers).forEach(serverKey => {
          const serverConfig = deployConfig.mcpServers[serverKey]
          
          // 添加 icons 字段，使用 ServerItem 的 icon
          if (!serverConfig.icons) {
            serverConfig.icons = server.icon
          }
          
          // 添加默认 type 字段
          if (!serverConfig.type) {
            serverConfig.type = 'stdio'
          }
          // 添加 简介
          if (!serverConfig.descriptions) {
            serverConfig.descriptions = server.description
          }
        })
      }
      
      // 将修改后的配置转换回 JSON 字符串
      const enhancedDeployJson = JSON.stringify(deployConfig, null, 2)
      
      // 设置预填充配置并打开弹窗
      prefilledJsonConfig.value = enhancedDeployJson
      isInstallDialogOpen.value = true
      
      console.log(`准备安装服务器 "${server.name}"，已预填充配置`)
    } catch (error) {
      console.error('DeployJson 格式错误:', error)
      alert(`服务器 "${server.name}" 的部署配置格式错误：\n\n${server.deployJson}`)
    }
  } else {
    alert(`服务器 "${server.name}" 没有部署配置信息`)
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
</script>

<template>
  <div class="flex flex-col h-full w-full bg-background">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between p-4 border-b">
      <div class="flex items-center space-x-4">
        <h1 class="text-2xl font-semibold">{{ t('mcp.mcpGallery.title') }}</h1>
      </div>
      
      <div class="flex items-center space-x-2">
        <!-- 视图切换按钮 -->
        <div class="flex items-center border rounded-md p-1">
          <Button
            variant="ghost"
            size="sm"
            :class="viewMode === 'grid' ? 'bg-muted' : ''"
            @click="viewMode = 'grid'"
          >
            <Icon icon="lucide:grid-3x3" class="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            :class="viewMode === 'list' ? 'bg-muted' : ''"
            @click="viewMode = 'list'"
          >
            <Icon icon="lucide:list" class="w-4 h-4" />
          </Button>
        </div>
        
        <!-- 添加服务器按钮 -->
        <Button @click="showAddDialog = true" class="gap-2">
          <Icon icon="lucide:plus" class="w-4 h-4" />
          {{ t('mcp.mcpGallery.addServer') }}
        </Button>
      </div>
    </div>

    <!-- 搜索和筛选栏 -->
    <div class="flex items-center gap-4 p-4 border-b">
      <div class="flex-1 relative">
        <Icon icon="lucide:search" class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          :placeholder="t('mcp.mcpGallery.searchPlaceholder')"
          class="pl-10"
        />
      </div>
      <Select v-model="filterStatus">
        <SelectTrigger class="w-48">
          <SelectValue :placeholder="t('mcp.mcpGallery.filterByStatus')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{{ t('mcp.mcpGallery.allServers') }}</SelectItem>
          <SelectItem value="running">{{ t('mcp.mcpGallery.runningServers') }}</SelectItem>
          <SelectItem value="stopped">{{ t('mcp.mcpGallery.stoppedServers') }}</SelectItem>
          <SelectItem value="error">{{ t('mcp.mcpGallery.errorServers') }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- 服务器展示区域 -->
    <div class="flex-1 overflow-auto">
      <!-- 加载状态 -->
      <div v-if="loading" class="flex items-center justify-center h-full min-h-[400px]">
        <Icon icon="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground" />
        <span class="ml-2 text-muted-foreground">加载中...</span>
      </div>
      
      <!-- 有服务器时的内容区域 -->
      <div v-else-if="filteredServers.length > 0" class="p-4">
        <!-- 网格视图 -->
        <div v-if="viewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          <Card
            v-for="server in filteredServers"
            :key="server.id"
            class="group cursor-pointer hover:shadow-lg transition-all duration-200 overflow-hidden border hover:border-primary"
          >
            <div class="px-4 py-3">
              <!-- 头部：图标、名称、状态、菜单 -->
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center space-x-2 flex-1 min-w-0">
                  <!-- 服务器图标 -->
                  <div class="text-lg flex-shrink-0">
                      <img 
                          v-if="getServerIcon(server.icon).startsWith('http') || getServerIcon(server.icon).startsWith('data:')"
                          :src="getServerIcon(server.icon)"
                          :alt="server.name"
                          class="w-10 h-10 rounded-lg object-cover"
                          @error="$event.target.style.display='none'; $event.target.nextElementSibling.style.display='flex'"
                      />
                      <div 
                          v-else
                          class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg"
                      >
                          {{ getServerIcon(server.icon) }}
                      </div>
                      <!-- 备用图标，当图片加载失败时显示 -->
                      <div 
                          class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg" 
                          style="display: none;"
                      >
                          🔧
                      </div>
                  </div>
                  <!-- 名称 -->
                  <h3 class="text-sm font-bold truncate flex-1">
                    {{ server.name }}
                  </h3>
                </div>
                <!-- GitHub图标 -->
                <Button
                  v-if="server.github"
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mr-1"
                  @click="openGithub(server.github)"
                >
                  <Icon icon="lucide:github" class="h-3 w-3" />
                </Button>
                <!-- 操作菜单 -->
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      <Icon icon="lucide:more-horizontal" class="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @click="editServer(server)">
                      <Icon icon="lucide:edit-3" class="h-4 w-4 mr-2" />
                      {{ t('mcp.mcpGallery.editServer') }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="toggleServer(server)">
                      <Icon
                        :icon="server.isRunning ? 'lucide:power-off' : 'lucide:power'"
                        class="h-4 w-4 mr-2"
                      />
                      {{ server.isRunning ? t('mcp.mcpGallery.stopServer') : t('mcp.mcpGallery.startServer') }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      @click="deleteServer(server)"
                    >
                      <Icon icon="lucide:trash-2" class="h-4 w-4 mr-2" />
                      {{ t('mcp.mcpGallery.deleteServer') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <!-- 类型和标识 -->
              <div class="flex items-center space-x-2 mb-2">
                <!-- 作者信息 -->
                <Badge variant="outline" class="text-xs h-4 px-1.5">
                  {{ server.type }}
                </Badge>
                <!-- 默认启动标识 -->
                <Badge v-if="server.isDefault" variant="secondary" class="text-xs h-4 px-1.5">
                  {{ t('mcp.mcpGallery.default') }}
                </Badge>
              </div>

              <!-- 描述 -->
              <div class="mb-3">
                <p class="text-xs text-secondary-foreground line-clamp-2 leading-4 h-8">
                  {{ server.description }}
                </p>
              </div>

              <!-- 底部控制 -->
              <div class="flex items-center justify-between">
                <!-- 状态 -->
                <div class="flex items-center space-x-1.5">
                  <div :class="['w-2 h-2 rounded-full', getStatusDotClass(server.status)]" />
                  <span :class="['text-xs', getStatusTextClass(server.status)]">
                    {{ getStatusText(server.status) }}
                  </span>
                </div>
                <!-- 开关 -->
                <Switch
                  :checked="server.isRunning"
                  @update:checked="toggleServer(server)"
                />
              </div>
            </div>
            
            <!-- 底部统计栏 -->
            <div class="flex flex-row bg-muted h-9 items-center">
              <!-- 工具按钮 -->
              <Button
                variant="ghost"
                class="h-full flex-1 text-xs hover:bg-secondary rounded-none"
                :disabled="server.toolsCount === 0"
                @click="viewTools(server)"
              >
                <Icon icon="lucide:wrench" class="h-3 w-3 mr-1" />
                {{ server.toolsCount }} {{ t('mcp.mcpGallery.tools') }}
              </Button>
              <Separator orientation="vertical" class="h-5" />
              <!-- 资源按钮 -->
              <Button
                variant="ghost"
                class="h-full flex-1 text-xs hover:bg-secondary rounded-none"
                :disabled="server.resourcesCount === 0"
                @click="viewResources(server)"
              >
                <Icon icon="lucide:folder" class="h-3 w-3 mr-1" />
                {{ server.resourcesCount }} {{ t('mcp.mcpGallery.resources') }}
              </Button>
              <Separator orientation="vertical" class="h-5" />
              <!-- 安装按钮 -->
              <Button
                variant="ghost"
                class="h-full flex-1 text-xs hover:bg-secondary rounded-none"
                @click="installServer(server)"
              >
                <Icon icon="lucide:download" class="h-3 w-3 mr-1" />
                {{ t('mcp.mcpGallery.install') }}
              </Button>
            </div>
          </Card>
        </div>
      
        <!-- 列表视图 -->
        <div v-else class="space-y-3">
          <Card
            v-for="server in filteredServers"
            :key="server.id"
            class="group cursor-pointer hover:shadow-md transition-all duration-200"
          >
            <CardContent class="p-4">
              <div class="flex items-center gap-4">
                <!-- 修复图标显示 -->
                <div class="flex-shrink-0">
                  <img 
                    v-if="getServerIcon(server.icon).startsWith('http') || getServerIcon(server.icon).startsWith('data:')"
                    :src="getServerIcon(server.icon)"
                    :alt="server.name"
                    class="w-8 h-8 rounded object-cover"
                    @error="$event.target.style.display='none'; $event.target.nextElementSibling.style.display='flex'"
                  />
                  <div 
                    v-else
                    class="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm"
                  >
                    {{ getServerIcon(server.icon) }}
                  </div>
                  <!-- 备用图标，当图片加载失败时显示 -->
                  <div 
                    class="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm" 
                    style="display: none;"
                  >
                    🔧
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-medium truncate">{{ server.name }}</h3>
                    <Badge variant="outline" class="text-xs">
                      {{ server.type }}
                    </Badge>
                    <Badge v-if="server.isDefault" variant="secondary" class="text-xs">
                      {{ t('mcp.mcpGallery.default') }}
                    </Badge>
                    <!-- GitHub图标 -->
                    <Button
                      v-if="server.github"
                      variant="ghost"
                      size="icon"
                      class="h-5 w-5"
                      @click="openGithub(server.github)"
                    >
                      <Icon icon="lucide:github" class="h-3 w-3" />
                    </Button>
                  </div>
                  <p class="text-sm text-muted-foreground line-clamp-1 mb-2">{{ server.description }}</p>
                  <div class="flex items-center space-x-4 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1">
                      <Icon icon="lucide:wrench" class="w-3 h-3" />
                      {{ server.toolsCount }} {{ t('mcp.mcpGallery.tools') }}
                    </span>

                    <span class="flex items-center gap-1">
                      <Icon icon="lucide:folder" class="w-3 h-3" />
                      {{ server.resourcesCount }} {{ t('mcp.mcpGallery.resources') }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <!-- 安装按钮 -->
                  <Button
                    variant="outline"
                    size="sm"
                    @click="installServer(server)"
                  >
                    <Icon icon="lucide:download" class="h-4 w-4 mr-1" />
                    {{ t('mcp.mcpGallery.install') }}
                  </Button>
                  <div class="flex items-center space-x-1.5">
                    <div :class="['w-2 h-2 rounded-full', getStatusDotClass(server.status)]" />
                    <span :class="['text-xs', getStatusTextClass(server.status)]">
                      {{ getStatusText(server.status) }}
                    </span>
                  </div>
                  <Switch
                    :checked="server.isRunning"
                    @update:checked="toggleServer(server)"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="icon" class="h-8 w-8">
                        <Icon icon="lucide:more-horizontal" class="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="editServer(server)">
                        <Icon icon="lucide:edit-3" class="h-4 w-4 mr-2" />
                        {{ t('mcp.mcpGallery.editServer') }}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem @click="toggleServer(server)">
                        <Icon
                          :icon="server.isRunning ? 'lucide:power-off' : 'lucide:power'"
                          class="h-4 w-4 mr-2"
                        />
                        {{ server.isRunning ? t('mcp.mcpGallery.stopServer') : t('mcp.mcpGallery.startServer') }}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="text-destructive focus:text-destructive"
                        @click="deleteServer(server)"
                      >
                        <Icon icon="lucide:trash-2" class="h-4 w-4 mr-2" />
                        {{ t('mcp.mcpGallery.deleteServer') }}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>

    <!-- 翻页组件 -->
    <div v-if="!loading && totalPages > 1" class="flex items-center justify-center gap-2 p-4 border-t">
      <Button
        variant="outline"
        size="sm"
        :disabled="currentPage <= 1"
        @click="prevPage"
      >
        <Icon icon="lucide:chevron-left" class="w-4 h-4" />
        上一页
      </Button>
      
      <div class="flex items-center gap-1">
        <Button
          v-for="page in Math.min(totalPages, 5)"
          :key="page"
          variant="outline"
          size="sm"
          :class="page === currentPage ? 'bg-primary text-primary-foreground' : ''"
          @click="goToPage(page)"
        >
          {{ page }}
        </Button>
        <span v-if="totalPages > 5" class="text-muted-foreground px-2">...</span>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        :disabled="currentPage >= totalPages"
        @click="nextPage"
      >
        下一页
        <Icon icon="lucide:chevron-right" class="w-4 h-4" />
      </Button>
      
      <span class="text-sm text-muted-foreground ml-4">
        第 {{ currentPage }} 页，共 {{ totalPages }} 页
      </span>
    </div>
  </div>
  
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
  
  <!-- 隐藏的 McpServers 组件，用于调用其方法 -->
  <McpServers ref="mcpServersRef" style="display: none;" />
</template>

<style scoped>
/* 自定义样式 */
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 隐藏滚动条 */
.overflow-auto {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.overflow-auto::-webkit-scrollbar {
  display: none; /* Chrome, Safari and Opera */
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
}
</style>
