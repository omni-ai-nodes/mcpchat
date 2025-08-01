<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, watch, nextTick, onUnmounted, reactive } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMcpStore } from '@/stores/mcp'
import { useToast } from '@/components/ui/toast/use-toast'
import { usePresenter } from '@/composables/usePresenter'
import { debounce } from 'lodash-es'
import McpServerForm from '@/components/mcp-config/mcpServerForm.vue'
import McpServers from '@/components/mcp-config/components/McpServers.vue'
import McpSettings from '@/components/settings/McpSettings.vue'
import type { MCPServerConfig } from '@shared/presenter'
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
const Badge = defineAsyncComponent(() => import('@/components/ui/badge').then(mod => mod.Badge))
// const Switch = defineAsyncComponent(() => import('@/components/ui/switch').then(mod => mod.Switch))
// const Separator = defineAsyncComponent(() => import('@/components/ui/separator').then(mod => mod.Separator))
const DropdownMenu = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenu))
const DropdownMenuContent = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenuContent))
const DropdownMenuItem = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenuItem))
const DropdownMenuTrigger = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenuTrigger))
const DropdownMenuSeparator = defineAsyncComponent(() => import('@/components/ui/dropdown-menu').then(mod => mod.DropdownMenuSeparator))

const { t } = useI18n()
const router = useRouter()
const mcpStore = useMcpStore()
const { toast } = useToast()
const mcpPresenter = usePresenter('mcpPresenter')

// 引用 McpServers 组件
const mcpServersRef = ref<InstanceType<typeof McpServers> | null>(null)
// 引用安装表单组件
const installFormRef = ref<InstanceType<typeof McpServerForm> | null>(null)

// API返回的服务器数据类型
interface ApiServerItem {
  id: number
  name: string
  logo: string
  by: string
  introduction: string
  github: string
  deploy_json: string
  content: string
  tools: string
  created_at: string
  updated_at: string
}

// API响应类型
interface ApiResponse {
  code: number
  msg: string
  data: {
    infos: ApiServerItem[]
    total_pages: number
    total_count: number
  }
}

// 服务器数据类型
interface ServerItem {
  id: string
  name: string
  icon: string
  description: string
  type: string // 显示By内容
  status: 'running' | 'stopped' | 'error' | 'loading' | 'not_installed'
  isRunning: boolean
  isDefault: boolean
  isGallery: boolean
  toolsCount: number
  promptsCount: number
  resourcesCount: number
  Github?: string // 添加GitHub链接
  deployJson?: string // 添加部署配置信息
  command?: string
  args?: string[]
  baseUrl?: string
  errorMessage?: string
}

// 响应式数据
const loading = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)
const pageSize = ref(30) // 调整为与API默认值一致
const searchQuery = ref('')
const filterStatus = ref('all')
const viewMode = ref<'grid' | 'list'>('grid')
const showAddDialog = ref(false)

// 页码输入相关
const pageInput = ref('')
const showPageInput = ref(false)

// 编辑和删除服务器相关状态
const isEditServerDialogOpen = ref(false)
const isRemoveConfirmDialogOpen = ref(false)
const selectedServer = ref<string>('')
const selectedServerConfig = ref<ServerItem | null>(null)

// 检查服务是否已安装
const isServerInstalled = (server: ServerItem): boolean => {
  const localServer = mcpStore.serverList.find(local => {
    // 优先通过deploy_json中的mcpServers键名进行精确匹配
    if (server.deployJson) {
      try {
        const deployConfig = JSON.parse(server.deployJson)
        if (deployConfig.mcpServers) {
          const deployServerNames = Object.keys(deployConfig.mcpServers)
          if (deployServerNames.includes(local.name)) {
            return true
          }
        }
      } catch (error) {
        console.warn('解析deployJson失败:', error)
      }
    }
    
    // 其次尝试精确名称匹配
    if (local.name === server.name) {
      return true
    }
    
    // GitHub匹配
    if (server.Github && local.Github && server.Github === local.Github) {
      return true
    }
    
    return false
  })
  return !!localServer
}

// 同步服务状态的函数
const syncServerStatuses = async () => {
  console.log('=== 开始同步服务状态 ===')
  console.log('当前本地服务列表:', mcpStore.serverList.map(s => ({ 
    name: s.name, 
    type: s.type, 
    isRunning: s.isRunning, 
    isLoading: s.isLoading,
    command: s.command 
  })))
  console.log('当前Gallery服务列表:', allApiServers.value.map(s => ({ 
    name: s.name, 
    status: s.status, 
    isRunning: s.isRunning 
  })))
  
  for (const server of allApiServers.value) {
    console.log(`\n正在处理服务器: ${server.name}`)
    
    // 使用与isServerInstalled相同的精确匹配逻辑
    let localServer = mcpStore.serverList.find(local => {
      // 优先通过deploy_json中的mcpServers键名进行精确匹配
      if (server.deployJson) {
        try {
          const deployConfig = JSON.parse(server.deployJson)
          if (deployConfig.mcpServers) {
            const deployServerNames = Object.keys(deployConfig.mcpServers)
            if (deployServerNames.includes(local.name)) {
              console.log(`  ✓ deployJson键名匹配: ${local.name} 在 [${deployServerNames.join(', ')}] 中`)
              return true
            }
          }
        } catch (error) {
          console.warn('解析deployJson失败:', error)
        }
      }
      
      // 其次尝试精确名称匹配
      if (local.name === server.name) {
        console.log(`  ✓ 精确匹配: ${local.name} === ${server.name}`)
        return true
      }
      
      // GitHub匹配
      if (server.Github && local.Github && server.Github === local.Github) {
        console.log(`  ✓ GitHub匹配: ${server.Github}`)
        return true
      }
      
      return false
    })
    
    if (localServer) {
      console.log(`✓ 找到匹配的本地服务: Gallery服务"${server.name}" -> 本地服务"${localServer.name}"`)
      console.log(`  本地服务状态: 运行=${localServer.isRunning}, 加载中=${localServer.isLoading}, 命令=${localServer.command}`)
      
      // 检查是否为GitHub类型的服务器且需要检查代码下载状态
      let isCodeDownloaded = true
      const isNpxCommand = localServer.command?.startsWith('npx') || false
      
      if (server.Github && localServer.Github && !isNpxCommand) {
        try {
          isCodeDownloaded = await mcpPresenter.isGitHubRepositoryDownloaded(localServer.Github, localServer.name)
          console.log(`  GitHub仓库下载状态检查: ${server.name}, 已下载: ${isCodeDownloaded}`)
        } catch (error) {
          console.warn('检查GitHub仓库下载状态失败:', error)
          isCodeDownloaded = false
        }
      } else if (isNpxCommand) {
        console.log(`  npx服务器 ${server.name} 跳过GitHub目录检查，命令: ${localServer.command}`)
      }
      
      // 关键修复：使用 mcpStore.serverStatuses 而不是 localServer.isRunning
      // 这样可以确保获取到最新的服务器运行状态
      // 但是要确保 serverStatuses 中确实有这个服务器的状态记录
      const actualIsRunning = Object.prototype.hasOwnProperty.call(mcpStore.serverStatuses, localServer.name)
        ? mcpStore.serverStatuses[localServer.name] 
        : localServer.isRunning || false
      console.log(`  实际运行状态检查: serverStatuses[${localServer.name}] = ${actualIsRunning}, localServer.isRunning = ${localServer.isRunning}`)
      
      // 计算新状态 - 优先考虑 loading 状态
      let newStatus: 'running' | 'stopped' | 'error' | 'loading' | 'not_installed'
      let newIsRunning = actualIsRunning
      let newIsDefault = localServer.isDefault
      
      if (localServer.isLoading) {
        newStatus = 'loading'
        console.log(`  服务器 ${server.name} 正在加载中`)
      } else if (actualIsRunning) {
        newStatus = 'running'
        console.log(`  服务器 ${server.name} 正在运行`)
      } else if (isCodeDownloaded) {
        newStatus = 'stopped'
        console.log(`  服务器 ${server.name} 已停止但代码已下载`)
      } else {
        newStatus = 'not_installed'
        console.log(`  服务器 ${server.name} 代码未下载，视为未安装`)
      }
      
      // 只在状态真正发生变化时才更新，避免触发不必要的响应式更新
      let hasChanges = false
      if (server.status !== newStatus) {
        console.log(`  状态变化: ${server.status} -> ${newStatus}`)
        server.status = newStatus
        hasChanges = true
      }
      if (server.isRunning !== newIsRunning) {
        console.log(`  运行状态变化: ${server.isRunning} -> ${newIsRunning}`)
        server.isRunning = newIsRunning
        hasChanges = true
      }
      if (server.isDefault !== newIsDefault) {
        console.log(`  默认状态变化: ${server.isDefault} -> ${newIsDefault}`)
        server.isDefault = newIsDefault
        hasChanges = true
      }
      
      if (hasChanges) {
        console.log(`  ✓ 服务器 ${server.name} 状态已更新`)
      } else {
        console.log(`  - 服务器 ${server.name} 状态无变化`)
      }
      
      if (localServer.mcp_type === 'mcp_gallery' && !server.isGallery) {
        server.isGallery = true
        console.log(`  ✓ 标记为Gallery服务器: ${server.name}`)
      }
    } else {
      // 只在状态真正发生变化时才更新
      let hasChanges = false
      if (server.status !== 'not_installed') {
        console.log(`✗ 未找到匹配的本地服务: ${server.name}, 状态: ${server.status} -> not_installed`)
        server.status = 'not_installed'
        hasChanges = true
      }
      if (server.isRunning !== false) {
        console.log(`  运行状态: ${server.isRunning} -> false`)
        server.isRunning = false
        hasChanges = true
      }
      if (server.isDefault !== false) {
        console.log(`  默认状态: ${server.isDefault} -> false`)
        server.isDefault = false
        hasChanges = true
      }
      
      if (hasChanges) {
        console.log(`  ✓ 服务器 ${server.name} 状态已重置为未安装`)
      }
    }
  }
  
  console.log('\n=== 同步完成 ===')
  console.log('最终状态:', allApiServers.value.map(s => ({ 
    name: s.name, 
    status: s.status, 
    isRunning: s.isRunning 
  })))
}

// 防抖的同步函数，避免频繁调用
const debouncedSyncServerStatuses = debounce(() => {
  // 在 loading 状态下不执行同步，避免无限循环
  // 同时检查是否正在从 fetchServers 中同步，避免重复触发
  if (!loading.value && !isRequestInProgress && !isSyncingFromFetch) {
    syncServerStatuses()
  }
}, 50) // 减少防抖时间到50ms，提高响应速度

// 监听mcpStore的服务状态变化 - 合并为一个监听器
watch(() => [mcpStore.serverStatuses, mcpStore.serverList, mcpStore.config], (newValues, oldValues) => {
  console.log('=== MCP Store 状态变化监听 ===')
  console.log('新的 serverStatuses:', newValues[0])
  console.log('新的 serverList 长度:', Array.isArray(newValues[1]) ? newValues[1].length : 'N/A')
  console.log('配置变化:', newValues[2] !== oldValues?.[2])
  
  // 在 loading 状态下不执行同步，避免无限循环
  // 同时检查是否正在从 fetchServers 中同步，避免重复触发
  if (!loading.value && !isRequestInProgress && !isSyncingFromFetch) {
    console.log('触发快速状态同步...')
    // 对于状态变化，使用更短的防抖时间以提高响应速度
    const quickSyncDebounced = debounce(() => {
      console.log('执行快速状态同步')
      syncServerStatuses()
    }, 10) // 10ms 的快速同步
    quickSyncDebounced()
  } else {
    console.log('跳过状态同步，原因:', { 
      loading: loading.value, 
      isRequestInProgress, 
      isSyncingFromFetch 
    })
  }
}, { deep: true, immediate: false })

// 所有API服务器数据
let allApiServers = ref<ServerItem[]>([])

// 服务器端分页信息
const serverTotalPages = ref(1)
const serverTotalCount = ref(0)

// 添加请求缓存，避免重复请求
let lastSearchQuery = ''
let isRequestInProgress = false
let isSyncingFromFetch = false // 新增：标记是否正在从 fetchServers 中同步状态
let hasInitialFetch = false // 新增：标记是否已经完成初始获取

// API调用函数 - 修改为支持服务器端分页
const fetchServers = async (searchName: string = '') => {
  // 如果正在请求中，则跳过
  if (isRequestInProgress || loading.value) {
    console.log('跳过重复的API请求，搜索查询:', searchName, '当前状态:', { 
      isRequestInProgress, 
      loading: loading.value
    })
    return
  }
  
  console.log('开始API请求，搜索查询:', searchName, '当前页:', currentPage.value)
  isRequestInProgress = true
  loading.value = true
  
  // 只有在搜索查询改变时才清空数据
  if (searchName !== lastSearchQuery) {
    allApiServers.value = []
    currentPage.value = 1 // 搜索时重置到第一页
  }
  
  lastSearchQuery = searchName
  
  try {
    const apiUrl = import.meta.env.VITE_MCP_SERVER_API_URL || 'https://api.omni-ainode.com'
    
    // 使用当前页码进行服务器端分页
    interface RequestBody { page_size: number; current_page: number; name?: string; status?: string; }
    const requestBody: RequestBody = {
      page_size: pageSize.value, // 使用当前设置的页面大小
      current_page: currentPage.value  // API使用1基索引，与UI保持一致
    }
    
    if (searchName.trim()) {
      requestBody.name = searchName.trim()
    }
    
    // 添加状态筛选参数
    if (filterStatus.value !== 'all') {
      requestBody.status = filterStatus.value
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
       // 映射服务器数据
       const mappedServers = data.data.infos.map(item => reactive({
         id: item.id.toString(),
         name: item.name,
         icon: getServerIcon(item.logo),
         description: item.introduction,
         type: item.by,
         status: 'not_installed' as const,
         isRunning: false,
         isDefault: false,
         isGallery: false,
         toolsCount: 0,
         promptsCount: 0,
         resourcesCount: 0,
         Github: item.github,
         deployJson: item.deploy_json
       }))
       
       // 更新服务器数据和分页信息
       allApiServers.value = mappedServers
       serverTotalPages.value = data.data.total_pages
       serverTotalCount.value = data.data.total_count
       totalPages.value = data.data.total_pages // 更新UI显示的总页数
       
       // 同步状态
       isSyncingFromFetch = true
       await syncServerStatuses()
       isSyncingFromFetch = false
       
       // 标记已完成初始获取
       if (searchName === '') {
         hasInitialFetch = true
       }
       
       console.log(`获取完成，当前页: ${currentPage.value}，共 ${data.data.infos.length} 个服务器，总计 ${data.data.total_count} 个，共 ${data.data.total_pages} 页`)
     } else {
       throw new Error(data.msg || 'API返回错误')
     }
  } catch (error) {
    console.error('获取服务器列表失败:', error)
    hasFetchError.value = true
    allApiServers.value = []
  } finally {
    loading.value = false
    isRequestInProgress = false
    isSyncingFromFetch = false
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

// 跳转到服务器详情页面
const goToServerDetail = (server: ServerItem) => {
  router.push({
    name: 'mcp-server-detail',
    params: {
      name: server.name
    }
  })
}

// 翻页函数
// 组件挂载时获取数据
onMounted(async () => {
  // 只在初始化时获取一次数据，并且确保没有正在进行的请求
  if (!hasInitialFetch && !isRequestInProgress && !loading.value) {
    await fetchServers()
  }
  
  // 设置定时器，但增加间隔时间，减少频率
  const syncInterval = setInterval(() => {
    debouncedSyncServerStatuses()
  }, 10000) // 从5秒改为10秒
  
  onUnmounted(() => {
    clearInterval(syncInterval)
  })
})

// 监听过滤变化，更新分页
watch(filterStatus, () => {
  currentPage.value = 1
})

// 监听分页大小变化，更新分页
watch(pageSize, () => {
  currentPage.value = 1
})

// 监听当前页变化，确保页码在有效范围内
watch(currentPage, (newPage) => {
  if (newPage > totalPages.value && totalPages.value > 0) {
    currentPage.value = totalPages.value || 1
  }
})

const hasFetchError = ref(false)

// 手动刷新函数
const manualRefresh = async () => {
  // 如果正在加载中，则不执行刷新
  if (loading.value || isRequestInProgress) {
    console.log('正在加载中，跳过手动刷新')
    return
  }
  
  hasFetchError.value = false
  await fetchServers(searchQuery.value)
}

// 监听搜索查询变化，实现实时搜索
const debouncedFetchServers = debounce((query: string) => {
  // 只有当搜索查询不为空时才重新获取数据，或者有错误需要重试
  // 同时确保不在 loading 状态下执行，避免无限循环
  if (!loading.value && !isRequestInProgress && (query.trim() !== '' || hasFetchError.value)) {
    fetchServers(query)
  }
}, 500) // 增加防抖时间到500ms

watch(searchQuery, (newQuery, oldQuery) => {
  // 避免初始化时的重复调用
  if (oldQuery !== undefined && newQuery !== oldQuery) {
    debouncedFetchServers(newQuery)
  }
})



// 更新翻页函数 - 支持服务端分页
const goToPage = async (page: number) => {
  if (page >= 1 && page <= totalPages.value && page !== currentPage.value) {
    currentPage.value = page
    // 重新获取数据，使用当前的搜索查询
    await fetchServers(searchQuery.value)
  }
}

// 上一页
const prevPage = () => {
  if (currentPage.value > 1) {
    goToPage(currentPage.value - 1)
  }
}

// 下一页
const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    goToPage(currentPage.value + 1)
  }
}

// 页码输入处理函数
const handlePageInput = () => {
  const page = parseInt(pageInput.value)
  if (!isNaN(page) && page >= 1 && page <= totalPages.value) {
    goToPage(page)
    showPageInput.value = false
    pageInput.value = ''
  }
}

// 显示页码输入框
const showPageInputBox = () => {
  showPageInput.value = true
  pageInput.value = currentPage.value.toString()
  // 下一帧聚焦输入框
  nextTick(() => {
    const input = document.querySelector('.page-input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

// 隐藏页码输入框
const hidePageInput = () => {
  showPageInput.value = false
  pageInput.value = ''
}

// 当前页显示的服务器（服务端分页，直接返回所有数据）
const filteredServers = computed(() => {
  // 对于服务端分页，当前页的数据就是 allApiServers
  return allApiServers.value
})

// 计算总页数 - 使用服务端返回的总页数
const computedTotalPages = computed(() => {
  return serverTotalPages.value || 1
})

// 监听筛选结果变化，更新总页数
watch(computedTotalPages, (newTotalPages) => {
  totalPages.value = newTotalPages
  // 如果当前页超出了新的总页数，重置到第一页
  if (currentPage.value > newTotalPages) {
    currentPage.value = 1
  }
}, { immediate: true })

// 监听筛选状态变化，重新获取数据
watch(filterStatus, async () => {
  currentPage.value = 1 // 重置到第一页
  await fetchServers(searchQuery.value)
})

// 监听搜索查询变化，重新获取数据
watch(searchQuery, async () => {
  currentPage.value = 1 // 重置到第一页
  await fetchServers(searchQuery.value)
})

// 计算可见的页码
const visiblePages = computed(() => {
  const current = currentPage.value
  const total = totalPages.value
  const maxVisible = 7 // 最多显示7个页码
  
  if (total <= maxVisible) {
    // 如果总页数不超过最大显示数，显示所有页码
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  
  const pages: (number | string)[] = []
  
  // 始终显示第一页
  pages.push(1)
  
  if (current <= 4) {
    // 当前页在前面时
    for (let i = 2; i <= Math.min(5, total - 1); i++) {
      pages.push(i)
    }
    if (total > 5) {
      pages.push('...')
    }
  } else if (current >= total - 3) {
    // 当前页在后面时
    if (total > 5) {
      pages.push('...')
    }
    for (let i = Math.max(total - 4, 2); i <= total - 1; i++) {
      pages.push(i)
    }
  } else {
    // 当前页在中间时
    pages.push('...')
    for (let i = current - 1; i <= current + 1; i++) {
      pages.push(i)
    }
    pages.push('...')
  }
  
  // 始终显示最后一页
  if (total > 1) {
    pages.push(total)
  }
  
  return pages
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
    case 'not_installed':
      return t('mcp.mcpGallery.notInstalled')
    case 'stopped':
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
    case 'not_installed':
      return 'bg-blue-500'
    case 'stopped':
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
    case 'not_installed':
      return 'text-blue-600'
    case 'stopped':
    default:
      return 'text-gray-500'
  }
}

// 服务器操作函数
// const addServer = () => {
  showAddDialog.value = true

const editServer = (server: ServerItem) => {
  // 特殊服务器跳转到对应设置页面
  const specialServers = {
    difyKnowledge: 'dify',
    ragflowKnowledge: 'ragflow',
    fastGptKnowledge: 'fastgpt'
  }

  if (specialServers[server.name]) {
    router.push({
      name: 'settings-knowledge-base',
      query: { subtab: specialServers[server.name] }
    })
    return
  }

  // 检查服务器是否已安装到本地
  const localServer = mcpStore.serverList.find(local => {
      console.log(`  检查本地服务: ${local.name}, 命令: ${local.command}`);
      
      // 优先通过deploy_json中的mcpServers键名进行精确匹配
      if (server.deployJson) {
        try {
          const deployConfig = JSON.parse(server.deployJson);
          if (deployConfig.mcpServers) {
            const deployServerNames = Object.keys(deployConfig.mcpServers)
            if (deployServerNames.includes(local.name)) {
              console.log(`  ✓ deployJson键名匹配: ${local.name} 在 [${deployServerNames.join(', ')}] 中`)
              return true
            }
          }
        } catch (error) {
          console.warn('解析deployJson失败:', error)
        }
      }
      
      // 其次尝试精确名称匹配
      if (local.name === server.name) {
        console.log(`  ✓ 精确匹配: ${local.name} === ${server.name}`);
        return true;
      }
      
      // GitHub匹配
      if (server.Github && local.Github && server.Github === local.Github) {
        console.log(`  ✓ GitHub匹配: ${server.Github}`)
        return true
      }
      
      return false;
    })
  
  if (!localServer) {
    // 如果服务器未安装，提示用户先安装
    console.log('服务器未安装，无法编辑')
    toast({
      title: t('mcp.mcpGallery.cannotEdit'),
      description: t('mcp.mcpGallery.serverNotInstalled'),
      variant: 'destructive'
    })
    return
  }
  
  // 处理配置信息，从 localServer 获取 DeployJson 数据
  const deployJsonSource = localServer.DeployJson || server.deployJson
  
  if (deployJsonSource) {
    try {
      // 解析原始 JSON 配置
      const deployConfig = JSON.parse(deployJsonSource)
      
      // 自动为每个服务器配置添加 icons、type 和 descriptions 字段
      if (deployConfig.mcpServers) {
        Object.keys(deployConfig.mcpServers).forEach(serverKey => {
          const serverConfig = deployConfig.mcpServers[serverKey]
          
          // 添加 icons 字段，使用 ServerItem 的 icon
          if (!serverConfig.icons) {
            serverConfig.icons = server.icon || '🔧'
          }
          
          // 添加默认 type 字段
          if (!serverConfig.type) {
            serverConfig.type = 'stdio'
          }
          
          // 添加简介
          if (!serverConfig.descriptions) {
            serverConfig.descriptions = server.description || ''
          }
        })
      }
      
      // 将修改后的配置转换回 JSON 字符串
      const enhancedDeployJson = JSON.stringify(deployConfig, null, 2)
      
      // 设置预填充配置
      selectedServer.value = localServer.name
      selectedServerConfig.value = server
      prefilledEditJsonConfig.value = enhancedDeployJson
      isEditServerDialogOpen.value = true
      
      console.log(`准备编辑服务器 "${server.name}"，已增强配置`)
      console.log('使用的 DeployJson 来源:', localServer.DeployJson ? 'localServer.DeployJson' : 'server.deployJson')
      console.log('selectedServer:', selectedServer.value)
      console.log('prefilledEditJsonConfig 长度:', prefilledEditJsonConfig.value.length)
      console.log('prefilledEditJsonConfig 内容:', prefilledEditJsonConfig.value.substring(0, 200) + '...')
    } catch (error) {
      console.error('DeployJson 格式错误:', error)
      // 如果解析失败，使用原始配置
      selectedServer.value = localServer.name
      selectedServerConfig.value = server
      prefilledEditJsonConfig.value = deployJsonSource || ''
      isEditServerDialogOpen.value = true
      
      console.log('解析失败，使用原始配置')
      console.log('使用的 DeployJson 来源:', localServer.DeployJson ? 'localServer.DeployJson' : 'server.deployJson')
      console.log('selectedServer:', selectedServer.value)
      console.log('prefilledEditJsonConfig 长度:', prefilledEditJsonConfig.value.length)
    }
  } else {
    // 如果没有 deployJson，尝试从当前服务器配置生成基本配置
    const basicConfig = {
      mcpServers: {
        [localServer.name]: {
          command: localServer.command || '',
          args: localServer.args || [],
          env: localServer.env || {},
          descriptions: localServer.descriptions || server.description || '',
          icons: localServer.icons || server.icon || '🔧',
          type: localServer.type || 'stdio',
          autoApprove: localServer.autoApprove || []
        }
      }
    }
    
    selectedServer.value = localServer.name
    selectedServerConfig.value = server
    prefilledEditJsonConfig.value = JSON.stringify(basicConfig, null, 2)
    isEditServerDialogOpen.value = true
    
    console.log('没有 deployJson，生成基本配置')
    console.log('selectedServer:', selectedServer.value)
    console.log('prefilledEditJsonConfig 长度:', prefilledEditJsonConfig.value.length)
    console.log('生成的基本配置:', prefilledEditJsonConfig.value)
  }
}

const deleteServer = (server: ServerItem) => {
  // 检查服务器是否已安装到本地
  const localServer = mcpStore.serverList.find(local => {
      console.log(`  检查本地服务: ${local.name}, 命令: ${local.command}`);
      
      // 优先通过deploy_json中的mcpServers键名进行精确匹配
      if (server.deployJson) {
        try {
          const deployConfig = JSON.parse(server.deployJson);
          if (deployConfig.mcpServers) {
            const deployServerNames = Object.keys(deployConfig.mcpServers)
            if (deployServerNames.includes(local.name)) {
              console.log(`  ✓ deployJson键名匹配: ${local.name} 在 [${deployServerNames.join(', ')}] 中`)
              return true
            }
          }
        } catch (error) {
          console.warn('解析deployJson失败:', error)
        }
      }
      
      // 其次尝试精确名称匹配
      if (local.name === server.name) {
        console.log(`  ✓ 精确匹配: ${local.name} === ${server.name}`);
        return true;
      }
      
      // GitHub匹配
      if (server.Github && local.Github && server.Github === local.Github) {
        console.log(`  ✓ GitHub匹配: ${server.Github}`)
        return true
      }
      
      return false;
    })
  
  if (!localServer) {
    // 如果服务器未安装，提示用户
    console.log('服务器未安装，无法删除')
    toast({
      title: t('mcp.mcpGallery.cannotDelete'),
      description: t('mcp.mcpGallery.serverNotInstalled'),
      variant: 'destructive'
    })
    return
  }
  
  // 检查是否为内置服务器
  const config = mcpStore.config.mcpServers[localServer.name]
  if (config?.type === 'inmemory') {
    console.log('内置服务器无法删除')
    toast({
      title: t('settings.mcp.cannotRemoveBuiltIn'),
      description: t('settings.mcp.builtInServerCannotBeRemoved'),
      variant: 'destructive'
    })
    return
  }
  
  selectedServer.value = localServer.name
  selectedServerConfig.value = server
  isRemoveConfirmDialogOpen.value = true
}

// 处理编辑服务器
const handleEditServer = async (serverName: string, serverConfig: Partial<MCPServerConfig>) => {
  console.log('=== handleEditServer 调试信息 ===')
  console.log('服务器名称:', serverName)
  console.log('提交的配置:', JSON.stringify(serverConfig, null, 2))
  console.log('当前本地服务器配置:', JSON.stringify(mcpStore.config.mcpServers[serverName], null, 2))
  
  const success = await mcpStore.updateServer(serverName, serverConfig)
  console.log('更新结果:', success)
  
  if (success) {
    console.log('更新后的服务器配置:', JSON.stringify(mcpStore.config.mcpServers[serverName], null, 2))
    isEditServerDialogOpen.value = false
    selectedServer.value = ''
    selectedServerConfig.value = null
    prefilledEditJsonConfig.value = ''
    // 重新同步服务器状态
    syncServerStatuses()
    toast({
      title: t('mcp.editServer'),
      description: t('mcp.serverUpdatedSuccessfully', { name: serverName })
    })
  } else {
    console.error('服务器更新失败')
    toast({
      title: t('mcp.editServer'),
      description: '服务器更新失败',
      variant: 'destructive'
    })
  }
}

// 处理删除服务器
const handleRemoveServer = async (serverName: string) => {
  const config = mcpStore.config.mcpServers[serverName]
  if (config?.type === 'inmemory') {
    toast({
      title: t('settings.mcp.cannotRemoveBuiltIn'),
      description: t('settings.mcp.builtInServerCannotBeRemoved'),
      variant: 'destructive'
    })
    return
  }
  
  const success = await mcpStore.removeServer(serverName)
  if (success) {
    isRemoveConfirmDialogOpen.value = false
    selectedServer.value = ''
    selectedServerConfig.value = null
    // 重新同步服务器状态
    syncServerStatuses()
    toast({
      title: t('mcp.deleteServer'),
      description: t('mcp.serverRemovedSuccessfully', { name: serverName })
    })
  }
}

// 确认删除服务器
const confirmRemoveServer = async () => {
  const serverName = selectedServer.value
  await handleRemoveServer(serverName)
}

const toggleServer = async (server: ServerItem) => {
  try {
    // 检查该服务是否已安装到本地配置中
    // 使用与syncServerStatuses相同的精确匹配逻辑
    const localServer = mcpStore.serverList.find(local => {
      console.log(`  检查本地服务: ${local.name}, 命令: ${local.command}`);
      
      // 优先通过deploy_json中的mcpServers键名进行精确匹配
      if (server.deployJson) {
        try {
          const deployConfig = JSON.parse(server.deployJson);
          if (deployConfig.mcpServers) {
            const deployServerNames = Object.keys(deployConfig.mcpServers)
            if (deployServerNames.includes(local.name)) {
              console.log(`  ✓ deployJson键名匹配: ${local.name} 在 [${deployServerNames.join(', ')}] 中`)
              return true
            }
          }
        } catch (error) {
          console.warn('解析deployJson失败:', error)
        }
      }
      
      // 其次尝试精确名称匹配
      if (local.name === server.name) {
        console.log(`  ✓ 精确匹配: ${local.name} === ${server.name}`);
        return true;
      }
      
      // GitHub匹配
      if (server.Github && local.Github && server.Github === local.Github) {
        console.log(`  ✓ GitHub匹配: ${server.Github}`)
        return true
      }
      
      return false;
    })
    
    if (localServer) {
      // 立即更新UI状态为loading
      const originalStatus = server.status
      const originalIsRunning = server.isRunning
      server.status = 'loading'
      
      // 获取当前真实的运行状态
      const currentIsRunning = mcpStore.serverStatuses[localServer.name] || false
      console.log(`开始切换服务器 ${localServer.name} 状态，当前运行状态: ${currentIsRunning}`)
      
      try {
        // 使用mcpStore的toggleServer方法
        const success = await mcpStore.toggleServer(localServer.name)
        
        if (success) {
          console.log(`服务器 ${localServer.name} 状态切换成功`)
          
          // 等待一小段时间确保后端状态更新完成
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // 强制刷新所有服务器状态，而不仅仅是当前服务器
          await mcpStore.updateAllServerStatuses()
          
          // 再等待一小段时间确保状态传播完成
          await new Promise(resolve => setTimeout(resolve, 300))
          
          // 立即同步状态以确保UI更新
          await syncServerStatuses()
          
          // 显示成功提示
          const actionText = !currentIsRunning ? '启动' : '停止'
          toast({
            title: `服务器${actionText}成功`,
            description: `服务器 "${server.name}" 已${actionText}`,
            variant: 'default'
          })
        } else {
          // 如果切换失败，恢复原状态
          server.status = originalStatus
          server.isRunning = originalIsRunning
          console.error(`服务器 ${localServer.name} 状态切换失败`)
          
          toast({
            title: '操作失败',
            description: `服务器 "${server.name}" 状态切换失败`,
            variant: 'destructive'
          })
        }
      } catch (toggleError) {
        // 如果切换过程中出错，恢复原状态
        server.status = originalStatus
        server.isRunning = originalIsRunning
        console.error(`服务器 ${localServer.name} 状态切换过程中出错:`, toggleError)
        
        toast({
          title: '操作失败',
          description: `服务器 "${server.name}" 状态切换时发生错误`,
          variant: 'destructive'
        })
      }
    } else {
      // 如果未安装，提示用户先安装
      console.log('当前已安装的服务列表:', mcpStore.serverList.map(s => s.name))
      toast({
        title: '服务器未安装',
        description: `请先安装服务器 "${server.name}" 后再启动`,
        variant: 'destructive'
      })
    }
  } catch (error) {
    console.error(`切换服务器 ${server.name} 状态时发生错误:`, error)
    // 恢复状态时需要考虑服务是否已安装
    if (isServerInstalled(server)) {
      server.status = server.isRunning ? 'running' : 'stopped'
    } else {
      server.status = 'not_installed'
    }
    
    toast({
      title: '操作失败',
      description: `服务器 "${server.name}" 操作时发生未知错误`,
      variant: 'destructive'
    })
  }
}

// const viewTools = (server: ServerItem) => {
//   console.log('查看工具:', server)
// }

// const viewPrompts = (server: ServerItem) => {
//   console.log('查看提示词:', server)
// }

// const viewResources = (server: ServerItem) => {
//   console.log('查看资源:', server)
// }

// 安装对话框状态
const isInstallDialogOpen = ref(false)
const prefilledJsonConfig = ref('')

// 编辑对话框状态
const prefilledEditJsonConfig = ref('')

// MCP设置对话框状态
const isMcpSettingsDialogOpen = ref(false)

const installServer = async (server: ServerItem) => {
  console.log('安装服务器:', server)
  
  // 如果有 DeployJson 配置信息，预填充到弹窗中
  if (server.deployJson) {
    try {
      // 解析原始 JSON 配置
      const deployConfig = JSON.parse(server.deployJson)
      
      // 自动为每个服务器配置添加 icons、type、github 等字段
      if (deployConfig.mcpServers) {
        for (const serverKey of Object.keys(deployConfig.mcpServers)) {
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
          
          // 添加 GitHub 字段，使用 ServerItem 的 Github（注意：后端期望小写的github字段）
          if (!serverConfig.github && server.Github) {
            serverConfig.github = server.Github
          }
          
          // 不在前端处理路径，让后端统一处理 GitHub 下载和路径设置
          console.log(`服务器 ${serverKey} 配置完成，GitHub仓库: ${server.Github}`)
        }
      }
      
      console.log('所有服务器配置处理完成，准备打开安装弹窗')
      
      // 将修改后的配置转换回 JSON 字符串
      const enhancedDeployJson = JSON.stringify(deployConfig, null, 2)
      
      console.log('增强后的配置:', enhancedDeployJson)
      
      // 设置预填充配置并打开弹窗
      prefilledJsonConfig.value = enhancedDeployJson
      isInstallDialogOpen.value = true
      
      console.log(`准备安装服务器 "${server.name}"，已预填充配置，弹窗状态:`, isInstallDialogOpen.value)
    } catch (error) {
      console.error('DeployJson 格式错误:', error)
      alert(`服务器 "${server.name}" 的部署配置格式错误：\n\n${server.deployJson}`)
    }
  } else {
    alert(`服务器 "${server.name}" 没有部署配置信息`)
  }
}

// 处理表单提交
const handleInstallSubmit = async (name: string, config: MCPServerConfig) => {
  console.log('安装服务器配置:', name, config)
  
  // 立即关闭弹窗
  isInstallDialogOpen.value = false
  // 清空预填充配置
  prefilledJsonConfig.value = ''
  
  // 显示开始安装的提示
  toast({
    title: '开始安装',
    description: `正在安装服务器 "${name}"...`,
    variant: 'default'
  })
  
  try {
    // 调用 McpServers 组件的 handleAddServer 方法
    if (mcpServersRef.value) {
      const result = await mcpServersRef.value.handleAddServer(name, {
        ...config,
        mcp_type: 'mcp_gallery',
      })
      
      if (result && result.success) {
        console.log('服务器添加成功:', name)
        
        // 显示成功通知
        toast({
          title: t('mcp.mcpGallery.installSuccess'),
          description: `服务器 "${name}" 安装成功`,
          variant: 'default'
        })
        
        // 等待一段时间确保后端配置更新完成，然后手动触发状态同步
        console.log('安装成功，开始状态同步流程...')
        await new Promise(resolve => setTimeout(resolve, 1000)) // 增加延迟到1秒
        await nextTick()
        
        // 强制重新加载配置
        console.log('重新加载MCP配置...')
        await mcpStore.loadConfig()
        
        // 再次等待确保配置加载完成
        await new Promise(resolve => setTimeout(resolve, 500))
        await nextTick()
        
        // 执行状态同步
        console.log('执行状态同步...')
        await syncServerStatuses()
        
        console.log('状态同步完成')
        
      } else {
        console.error('服务器添加失败:', name)
        toast({
          title: t('mcp.mcpGallery.installFailed'),
          description: `服务器 "${name}" 安装失败`,
          variant: 'destructive'
        })
      }
    } else {
      console.error('McpServers 组件引用不可用')
      toast({
        title: t('mcp.mcpGallery.installFailed'),
        description: 'MCP服务组件不可用',
        variant: 'destructive'
      })
    }
  } catch (error) {
    console.error('添加服务器时发生错误:', error)
    toast({
      title: t('mcp.mcpGallery.installFailed'),
      description: `安装过程中发生错误: ${error}`,
      variant: 'destructive'
    })
  } finally {
    // 重置表单的提交状态
    if (installFormRef.value) {
      installFormRef.value.isSubmitting = false
    }
  }
}

// 打开MCP设置弹窗
const goToMcpSettings = () => {
  isMcpSettingsDialogOpen.value = true
}

// 打开终端
const openTerminal = async (server: ServerItem) => {
  try {
    console.log('打开终端:', server.name)
    
    // 找到对应的本地服务器，使用与syncServerStatuses相同的匹配逻辑
    const localServer = mcpStore.serverList.find(local => {
      // 优先通过deploy_json中的mcpServers键名进行精确匹配
      if (server.deployJson) {
        try {
          const deployConfig = JSON.parse(server.deployJson)
          if (deployConfig.mcpServers) {
            const deployServerNames = Object.keys(deployConfig.mcpServers)
            if (deployServerNames.includes(local.name)) {
              return true
            }
          }
        } catch (error) {
          console.warn('解析deployJson失败:', error)
        }
      }
      
      // 其次尝试精确名称匹配
      if (local.name === server.name) {
        return true
      }
      
      // GitHub匹配
      if (server.Github && local.Github && server.Github === local.Github) {
        return true
      }
      
      return false
    })

    if (!localServer) {
      toast({
        title: '服务器未安装',
        description: `请先安装服务器 "${server.name}" 后再打开终端`,
        variant: 'destructive'
      })
      return
    }
    
    // 使用实际安装的本地服务器名称
    const actualServerName = localServer.name
    console.log('实际服务器名称:', actualServerName)
    
    // 获取服务器路径
    const serverPath = await (window as any).api.getMcpServerPath(actualServerName)
    console.log('服务器路径:', serverPath)
    
    // 打开终端
    const result = await (window as any).api.openTerminal(serverPath)
    
    if (result.success) {
      toast({
        title: '终端已打开',
        description: `已在 ${actualServerName} 目录打开终端`,
        variant: 'default'
      })
    } else {
      toast({
        title: '打开终端失败',
        description: result.error || '无法打开终端',
        variant: 'destructive'
      })
    }
  } catch (error) {
    console.error('打开终端失败:', error)
    toast({
      title: '打开终端失败',
      description: `错误: ${error}`,
      variant: 'destructive'
    })
  }
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
        
        <!-- MCP设置按钮 -->
        <Button @click="goToMcpSettings" class="gap-2">
          <Icon icon="lucide:settings" class="w-4 h-4" />
          MCP设置
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
      <!-- <Select v-model="filterStatus">
        <SelectTrigger class="w-48">
          <SelectValue :placeholder="t('mcp.mcpGallery.filterByStatus')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{{ t('mcp.mcpGallery.allServers') }}</SelectItem>
          <SelectItem value="running">{{ t('mcp.mcpGallery.runningServers') }}</SelectItem>
          <SelectItem value="stopped">{{ t('mcp.mcpGallery.stoppedServers') }}</SelectItem>
          <SelectItem value="not_installed">{{ t('mcp.mcpGallery.notInstalledServers') }}</SelectItem>
          <SelectItem value="error">{{ t('mcp.mcpGallery.errorServers') }}</SelectItem>
        </SelectContent>
      </Select> -->
    </div>

    <!-- 服务器展示区域 -->
    <div class="flex-1 overflow-auto">
      <!-- 加载状态 -->
      <div v-if="loading" class="flex items-center justify-center h-full min-h-[400px]">
        <Icon icon="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground" />
        <span class="ml-2 text-muted-foreground">加载中...</span>
      </div>
      <div v-else-if="hasFetchError" class="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <Icon icon="lucide:alert-triangle" class="w-8 h-8 text-destructive" />
        <p class="text-muted-foreground">加载服务器列表失败，请尝试刷新。</p>
        <Button @click="manualRefresh">
          <Icon icon="lucide:refresh-cw" class="w-4 h-4 mr-2" />
          刷新
        </Button>
      </div>
      
      <!-- 有服务器时的内容区域 -->
      <div v-else-if="filteredServers.length > 0" class="p-4">
        <!-- 网格视图 -->
        <div v-if="viewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          <Card
            v-for="server in filteredServers"
            :key="server.id"
            class="group hover:shadow-lg transition-all duration-200 overflow-hidden border hover:border-primary"
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
                          @error="(event) => { if (event.target) { (event.target as HTMLElement).style.display='none'; const next = (event.target as HTMLElement).nextElementSibling as HTMLElement; if (next) next.style.display='flex'; } }"
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
                  v-if="server.Github"
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mr-1"
                  @click.stop="openGithub(server.Github)"
                >
                  <Icon icon="lucide:github" class="h-3 w-3" />
                </Button>
                <!-- 详情按钮 -->
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mr-1"
                  @click.stop="goToServerDetail(server)"
                >
                  <Icon icon="lucide:info" class="h-3 w-3" />
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
                <!-- Gallery 标识 -->
                <Badge v-if="server.isGallery" variant="secondary" class="text-xs h-4 px-1.5">
                  Gallery
                </Badge>
                <!-- 默认启动标识 -->
                <Badge v-if="server.isDefault" variant="secondary" class="text-xs h-4 px-1.5">
                  {{ t('mcp.mcpGallery.default') }}
                </Badge>
              </div>

              <!-- 描述 -->
              <div class="mb-3">
                <p class="text-xs text-secondary-foreground line-clamp-2 leading-4 h-8 cursor-pointer hover:text-primary transition-colors"
                   @click="goToServerDetail(server)">
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
                <!-- 根据服务器状态显示不同控件 -->
                <div class="flex items-center space-x-1">
                  <!-- 未安装时显示安装按钮 -->
                  <Button
                    v-if="server.status === 'not_installed'"
                    variant="default"
                    size="sm"
                    class="px-3 py-1 text-xs"
                    @click="installServer(server)"
                  >
                    <Icon icon="lucide:download" class="h-3 w-3 mr-1" />
                    {{ t('mcp.mcpGallery.install') }}
                  </Button>
                  <!-- 已安装时显示启动按钮和终端按钮 -->
                  <Button
                    v-if="server.status !== 'not_installed'"
                    variant="default"
                    size="sm"
                    class="px-3 py-1 text-xs"
                    @click="toggleServer(server)"
                  >
                    <Icon :icon="server.isRunning ? 'lucide:power-off' : 'lucide:power'" class="h-3 w-3 mr-1" />
                    {{ server.isRunning ? t('mcp.mcpGallery.stopServer') : t('mcp.mcpGallery.startServer') }}
                  </Button>
                  <Button
                    v-if="server.status !== 'not_installed'"
                    variant="outline"
                    size="sm"
                    class="px-3 py-1 text-xs"
                    @click="openTerminal(server)"
                  >
                    <Icon icon="lucide:terminal" class="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
            

          </Card>
        </div>
      
        <!-- 列表视图 -->
        <div v-else class="space-y-3">
          <Card
            v-for="server in filteredServers"
            :key="server.id"
            class="group hover:shadow-md transition-all duration-200"
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
                    @error="(event) => { if (event.target) { (event.target as HTMLElement).style.display='none'; const next = (event.target as HTMLElement).nextElementSibling as HTMLElement; if (next) next.style.display='flex'; } }"
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
                    <Badge v-if="server.isGallery" variant="secondary" class="text-xs">
                      Gallery
                    </Badge>
                    <Badge v-if="server.isDefault" variant="secondary" class="text-xs">
                      {{ t('mcp.mcpGallery.default') }}
                    </Badge>
                    <!-- GitHub图标 -->
                    <Button
                      v-if="server.Github"
                      variant="ghost"
                      size="icon"
                      class="h-5 w-5"
                      @click.stop="openGithub(server.Github)"
                    >
                      <Icon icon="lucide:github" class="h-3 w-3" />
                    </Button>
                    <!-- 详情按钮 -->
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-5 w-5"
                      @click.stop="goToServerDetail(server)"
                    >
                      <Icon icon="lucide:info" class="h-3 w-3" />
                    </Button>
                  </div>
                  <p class="text-sm text-muted-foreground line-clamp-1 cursor-pointer hover:text-primary transition-colors"
                     @click="goToServerDetail(server)">{{ server.description }}</p>
                </div>
                <div class="flex items-center gap-3">
                  <!-- 状态显示 -->
                  <div class="flex items-center space-x-1.5">
                    <div :class="['w-2 h-2 rounded-full', getStatusDotClass(server.status)]" />
                  <span :class="['text-xs', getStatusTextClass(server.status)]">
                    {{ getStatusText(server.status) }}
                    </span>
                  </div>
                  <!-- 根据服务器状态显示不同按钮 -->
                  <div class="flex items-center space-x-2">
                    <!-- 未安装时显示安装按钮 -->
                    <Button
                      v-if="server.status === 'not_installed'"
                      variant="default"
                      size="sm"
                      class="px-4"
                      @click="installServer(server)"
                    >
                      <Icon icon="lucide:download" class="h-4 w-4 mr-2" />
                      {{ t('mcp.mcpGallery.install') }}
                    </Button>
                    <!-- 已安装时显示启动按钮和终端按钮 -->
                    <Button
                      v-if="server.status !== 'not_installed'"
                      variant="default"
                      size="sm"
                      class="px-4"
                      @click="toggleServer(server)"
                    >
                      <Icon :icon="server.isRunning ? 'lucide:power-off' : 'lucide:power'" class="h-4 w-4 mr-2" />
                      {{ server.isRunning ? t('mcp.mcpGallery.stopServer') : t('mcp.mcpGallery.startServer') }}
                    </Button>
                    <Button
                      v-if="server.status !== 'not_installed'"
                      variant="outline"
                      size="sm"
                      class="px-3"
                      @click="openTerminal(server)"
                    >
                      <Icon icon="lucide:terminal" class="h-4 w-4" />
                    </Button>
                  </div>
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
        <!-- 动态页码 -->
        <template v-for="(page, index) in visiblePages" :key="index">
          <Button
            v-if="typeof page === 'number'"
            variant="outline"
            size="sm"
            :class="page === currentPage ? 'bg-primary text-primary-foreground' : ''"
            @click="goToPage(page)"
          >
            {{ page }}
          </Button>
          <span v-else class="text-muted-foreground px-2">{{ page }}</span>
        </template>
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
      
      <!-- 页码输入区域 -->
      <div class="flex items-center gap-2 ml-4">
        <span class="text-sm text-muted-foreground">
          第 {{ currentPage }} 页，共 {{ totalPages }} 页
        </span>
        
        <!-- 页码输入框 -->
        <div class="flex items-center gap-1">
          <span class="text-sm text-muted-foreground">跳转到</span>
          <div class="relative">
            <input
              v-if="showPageInput"
              v-model="pageInput"
              type="number"
              :min="1"
              :max="totalPages"
              class="page-input w-16 h-8 px-2 text-sm border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              @keyup.enter="handlePageInput"
              @blur="hidePageInput"
              @keyup.escape="hidePageInput"
            />
            <Button
              v-else
              variant="outline"
              size="sm"
              class="h-8 px-2 text-xs"
              @click="showPageInputBox"
            >
              页码
            </Button>
          </div>
        </div>
      </div>
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
        ref="installFormRef"
        :default-json-config="prefilledJsonConfig"
        @submit="handleInstallSubmit"
      />
    </DialogContent>
  </Dialog>

  <!-- MCP设置弹窗 -->
  <Dialog v-model:open="isMcpSettingsDialogOpen">
    <DialogContent class="w-[98vw] max-w-[1200px] h-[90vh] max-h-[800px] flex flex-col">
      <DialogHeader class="flex-shrink-0 pb-4">
        <DialogTitle class="text-lg">
          MCP设置
        </DialogTitle>
        <DialogDescription class="text-sm">
          启用或禁用MCP功能和工具
        </DialogDescription>
      </DialogHeader>
      <div class="flex-grow overflow-hidden">
        <McpSettings />
      </div>
    </DialogContent>
  </Dialog>
  
  <!-- 编辑服务器对话框 -->
  <Dialog v-model:open="isEditServerDialogOpen">
    <DialogContent class="w-[95vw] max-w-[500px] px-0 h-[85vh] max-h-[500px] flex flex-col">
      <DialogHeader class="px-3 flex-shrink-0 pb-2">
        <DialogTitle class="text-base">
          {{ t('settings.mcp.editServerDialog.title') }}
        </DialogTitle>
        <DialogDescription class="text-sm">
          {{ t('settings.mcp.editServerDialog.description') }}
        </DialogDescription>
      </DialogHeader>
      <McpServerForm
        v-if="selectedServer"
        :server-name="selectedServer"
        :default-json-config="prefilledEditJsonConfig"
        @submit="(name, config) => handleEditServer(name, config)"
      />
    </DialogContent>
  </Dialog>

  <!-- 删除服务器确认对话框 -->
  <Dialog v-model:open="isRemoveConfirmDialogOpen">
    <DialogContent class="w-[95vw] max-w-[400px]">
      <DialogHeader>
        <DialogTitle>{{ t('settings.mcp.removeServerDialog.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.mcp.confirmRemoveServer', { name: selectedServer }) }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="sm" @click="isRemoveConfirmDialogOpen = false">
          {{ t('mcp.confirmDelete.cancel') }}
        </Button>
        <Button variant="destructive" size="sm" @click="confirmRemoveServer">
          {{ t('mcp.confirmDelete.confirm') }}
        </Button>
      </div>
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
