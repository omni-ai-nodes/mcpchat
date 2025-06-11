<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'

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

// 服务器数据类型
interface ServerItem {
  id: string
  name: string
  icon: string
  description: string
  type: 'http' | 'local'
  status: 'running' | 'stopped' | 'error' | 'loading'
  isRunning: boolean
  isDefault: boolean
  toolsCount: number
  promptsCount: number
  resourcesCount: number
  command?: string
  args?: string[]
  baseUrl?: string
  errorMessage?: string
}

// 响应式数据
const servers = ref<ServerItem[]>([
  {
    id: '1',
    name: '支付宝 MCP',
    icon: '💰',
    description: '支付宝支付服务器，提供支付相关功能和API接口',
    type: 'http',
    status: 'running',
    isRunning: true,
    isDefault: true,
    toolsCount: 5,
    promptsCount: 3,
    resourcesCount: 2
  },
  {
    id: '2',
    name: '无影 AgentBay',
    icon: '🔧',
    description: '无影AgentBay服务，提供AI代理和自动化工具',
    type: 'local',
    status: 'running',
    isRunning: true,
    isDefault: false,
    toolsCount: 8,
    promptsCount: 12,
    resourcesCount: 4
  },
  {
    id: '3',
    name: 'Cloudflare',
    icon: '☁️',
    description: 'Cloudflare MCP服务器，提供CDN和网络服务管理',
    type: 'http',
    status: 'stopped',
    isRunning: false,
    isDefault: false,
    toolsCount: 6,
    promptsCount: 2,
    resourcesCount: 8
  },
  {
    id: '4',
    name: 'Firecrawl',
    icon: '🔥',
    description: '网页爬虫MCP服务器，提供网页内容抓取和解析功能',
    type: 'local',
    status: 'running',
    isRunning: true,
    isDefault: false,
    toolsCount: 4,
    promptsCount: 1,
    resourcesCount: 3
  },
  {
    id: '5',
    name: 'Playwright',
    icon: '🎭',
    description: '浏览器自动化测试工具，支持多种浏览器的自动化操作',
    type: 'local',
    status: 'running',
    isRunning: true,
    isDefault: false,
    toolsCount: 15,
    promptsCount: 8,
    resourcesCount: 5
  },
  {
    id: '6',
    name: 'Perplexity Ask',
    icon: '🔍',
    description: 'Perplexity搜索服务，提供智能问答和信息检索功能',
    type: 'http',
    status: 'error',
    isRunning: false,
    isDefault: false,
    toolsCount: 3,
    promptsCount: 5,
    resourcesCount: 1,
    errorMessage: '连接超时，请检查网络设置'
  },
  {
    id: '7',
    name: 'Blender',
    icon: '🎨',
    description: '3D建模和渲染工具，支持复杂的3D场景创建和动画制作',
    type: 'local',
    status: 'stopped',
    isRunning: false,
    isDefault: false,
    toolsCount: 20,
    promptsCount: 6,
    resourcesCount: 12
  },
  {
    id: '8',
    name: 'Figma',
    icon: '🎨',
    description: '设计协作平台，提供界面设计和原型制作工具',
    type: 'http',
    status: 'running',
    isRunning: true,
    isDefault: false,
    toolsCount: 10,
    promptsCount: 4,
    resourcesCount: 7
  },
  {
    id: '9',
    name: 'Baidu Map',
    icon: '🗺️',
    description: '百度地图服务，提供地理位置和导航相关功能',
    type: 'http',
    status: 'running',
    isRunning: true,
    isDefault: false,
    toolsCount: 7,
    promptsCount: 2,
    resourcesCount: 9
  }
])

const searchQuery = ref('')
const filterStatus = ref('all')
const viewMode = ref<'grid' | 'list'>('grid')
const showAddDialog = ref(false)

// 计算属性
const filteredServers = computed(() => {
  let filtered = servers.value
  
  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(server => 
      server.name.toLowerCase().includes(query) ||
      server.description.toLowerCase().includes(query)
    )
  }
  
  // 状态过滤
  if (filterStatus.value !== 'all') {
    filtered = filtered.filter(server => server.status === filterStatus.value)
  }
  
  return filtered
})

// 方法
const getStatusDotClass = (status: string) => {
  switch (status) {
    case 'running':
      return 'bg-green-500'
    case 'loading':
      return 'bg-blue-500 animate-pulse'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-gray-400'
  }
}

const getStatusTextClass = (status: string) => {
  switch (status) {
    case 'running':
      return 'text-green-600 dark:text-green-400'
    case 'loading':
      return 'text-blue-600 dark:text-blue-400'
    case 'error':
      return 'text-red-600 dark:text-red-400'
    default:
      return 'text-muted-foreground'
  }
}

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

const toggleServer = (server: ServerItem) => {
  server.isRunning = !server.isRunning
  server.status = server.isRunning ? 'running' : 'stopped'
  console.log(`${server.isRunning ? '启动' : '停止'}服务器:`, server.name)
}

const editServer = (server: ServerItem) => {
  console.log('编辑服务器:', server.name)
}

const deleteServer = (server: ServerItem) => {
  const index = servers.value.findIndex(s => s.id === server.id)
  if (index > -1) {
    servers.value.splice(index, 1)
  }
  console.log('删除服务器:', server.name)
}

const viewTools = (server: ServerItem) => {
  console.log('查看工具:', server.name)
}

const viewPrompts = (server: ServerItem) => {
  console.log('查看提示词:', server.name)
}

const viewResources = (server: ServerItem) => {
  console.log('查看资源:', server.name)
}
</script>

<template>
  <div class="w-full h-full flex flex-col bg-background">
    <!-- 页面标题栏 -->
    <div class="flex items-center justify-between p-4 border-b">
      <div class="flex items-center gap-3">
        <Icon icon="lucide:server" class="w-6 h-6 text-primary" />
        <h1 class="text-2xl font-semibold">{{ t('mcp.mcpGallery.title') }}</h1>
      </div>
      <div class="flex items-center gap-2">
        <!-- 视图切换 -->
        <div class="flex items-center border rounded-lg p-1">
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
    <div class="flex-1 overflow-auto p-4">
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
                <div class="text-lg flex-shrink-0">{{ server.icon }}</div>
                <!-- 名称 -->
                <h3 class="text-sm font-bold truncate flex-1">
                  {{ server.name }}
                </h3>
              </div>
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
              <!-- 服务器类型 -->
              <Badge variant="outline" class="text-xs h-4 px-1.5">
                {{ server.type === 'http' ? 'HTTP' : 'Local' }}
              </Badge>
              <!-- 默认启动标识 -->
              <Badge v-if="server.isDefault" variant="secondary" class="text-xs h-4 px-1.5">
                {{ t('mcp.mcpGallery.default') }}
              </Badge>
            </div>

            <!-- 描述 -->
            <div class="mb-3">
              <p class="text-xs text-secondary-foreground line-clamp-2 leading-4">
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
              {{ server.toolsCount }}
            </Button>
            <!-- 提示词按钮 -->
            <Separator orientation="vertical" class="h-5" />
            <Button
              variant="ghost"
              class="h-full flex-1 text-xs hover:bg-secondary rounded-none"
              :disabled="server.promptsCount === 0"
              @click="viewPrompts(server)"
            >
              <Icon icon="lucide:message-square-quote" class="h-3 w-3 mr-1" />
              {{ server.promptsCount }}
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
              {{ server.resourcesCount }}
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
              <div class="text-2xl flex-shrink-0">{{ server.icon }}</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-medium truncate">{{ server.name }}</h3>
                  <Badge variant="outline" class="text-xs">
                    {{ server.type === 'http' ? 'HTTP' : 'Local' }}
                  </Badge>
                  <Badge v-if="server.isDefault" variant="secondary" class="text-xs">
                    {{ t('mcp.mcpGallery.default') }}
                  </Badge>
                </div>
                <p class="text-sm text-muted-foreground line-clamp-1 mb-2">{{ server.description }}</p>
                <div class="flex items-center space-x-4 text-xs text-muted-foreground">
                  <span class="flex items-center gap-1">
                    <Icon icon="lucide:wrench" class="w-3 h-3" />
                    {{ server.toolsCount }} {{ t('mcp.mcpGallery.tools') }}
                  </span>
                  <span class="flex items-center gap-1">
                    <Icon icon="lucide:message-square-quote" class="w-3 h-3" />
                    {{ server.promptsCount }} {{ t('mcp.mcpGallery.prompts') }}
                  </span>
                  <span class="flex items-center gap-1">
                    <Icon icon="lucide:folder" class="w-3 h-3" />
                    {{ server.resourcesCount }} {{ t('mcp.mcpGallery.resources') }}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-3">
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

      <!-- 空状态 -->
      <div v-if="filteredServers.length === 0" class="flex flex-col items-center justify-center h-64 text-center">
        <Icon icon="lucide:server-off" class="w-16 h-16 text-muted-foreground mb-4" />
        <h3 class="text-lg font-medium mb-2">{{ t('mcp.mcpGallery.noServers') }}</h3>
        <p class="text-muted-foreground mb-4">{{ t('mcp.mcpGallery.noServersDescription') }}</p>
        <Button @click="showAddDialog = true" class="gap-2">
          <Icon icon="lucide:plus" class="w-4 h-4" />
          {{ t('mcp.mcpGallery.addFirstServer') }}
        </Button>
      </div>
    </div>
  </div>
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