<template>
  <div class="w-full h-full flex flex-col">
    <!-- 固定部分 -->
    <div class="flex-shrink-0 bg-background sticky top-0 z-10">
      <!-- MCP全局开关 -->
      <div class="p-4 flex-shrink-0">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium">{{ t('settings.mcp.enabledTitle') }}</h3>
            <p class="text-xs text-muted-foreground mt-1">
              {{ t('settings.mcp.enabledDescription') }}
            </p>
          </div>
          <Switch :checked="mcpEnabled" @update:checked="handleMcpEnabledChange" />
        </div>
      </div>

      <!-- 本地包缓存管理 -->
      <div class="px-4 pb-2 flex-shrink-0" v-if="mcpEnabled">
        <div class="border rounded-lg p-3 bg-muted/30">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <Icon icon="lucide:package" class="w-4 h-4 text-blue-600" />
              <h4 class="text-sm font-medium">{{ t('settings.mcp.localCache.title') }}</h4>
            </div>
            <Button
              variant="outline"
              size="sm"
              @click="clearLocalCache"
              :disabled="cacheClearing"
              class="h-7 px-2 text-xs"
            >
              <Icon 
                :icon="cacheClearing ? 'lucide:loader-2' : 'lucide:trash-2'" 
                :class="['w-3 h-3 mr-1', { 'animate-spin': cacheClearing }]" 
              />
              {{ t('settings.mcp.localCache.clear') }}
            </Button>
          </div>
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>{{ t('settings.mcp.localCache.packages') }}: {{ cacheStats.totalPackages }}</span>
            <span>{{ t('settings.mcp.localCache.size') }}: {{ formatSize(cacheStats.totalSize) }}</span>
            <div class="flex items-center gap-1">
              <div :class="['w-2 h-2 rounded-full', networkStatus ? 'bg-green-500' : 'bg-red-500']"></div>
              <span>{{ networkStatus ? t('settings.mcp.localCache.online') : t('settings.mcp.localCache.offline') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- MCP Marketplace 入口 -->
      <div class="px-4 pb-4 flex-shrink-0">
        <div class="flex gap-2">
          <Button
            v-if="false"
            variant="outline"
            class="flex-1 flex items-center justify-center gap-2"
            @click="openMcpMarketplace"
          >
            <Icon icon="lucide:shopping-bag" class="w-4 h-4" />
            <span>{{ t('settings.mcp.marketplace') }}</span>
            <Icon icon="lucide:external-link" class="w-3.5 h-3.5 text-muted-foreground" />
          </Button>

          <!-- Higress MCP Marketplace 入口 -->
          <Button
            variant="outline"
            class="flex-1 flex items-center justify-center gap-2"
            @click="openHigressMcpMarketplace"
          >
            <img src="@/assets/mcp-icons/higress.avif" class="w-4 h-4" />
            <span>{{ $t('settings.mcp.higressMarket') }}</span>
            <Icon icon="lucide:external-link" class="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>

    <!-- 可滚动部分 -->
    <!-- MCP配置 -->
    <div class="flex-grow overflow-y-auto">
      <div v-if="mcpEnabled" class="border-t h-full">
        <McpServers />
      </div>
      <div v-else class="p-4 text-center text-muted-foreground text-sm">
        {{ t('settings.mcp.enableToAccess') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import McpServers from '@/components/mcp-config/components/McpServers.vue'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Icon } from '@iconify/vue'
import { useMcpStore } from '@/stores/mcp'
import { useToast } from '@/components/ui/toast'
import { MCP_MARKETPLACE_URL, HIGRESS_MCP_MARKETPLACE_URL } from '../mcp-config/const'
import { MCP_EVENTS } from '@/events'

const { t } = useI18n()
const mcpStore = useMcpStore()
const { toast } = useToast()

// 响应式数据
const cacheClearing = ref(false)
const cacheStats = ref({ totalPackages: 0, totalSize: 0 })
const networkStatus = ref(false)
let networkCheckInterval: NodeJS.Timeout | null = null

// 计算属性
const mcpEnabled = computed(() => mcpStore.mcpEnabled)

// 格式化文件大小
const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 更新缓存统计信息
const updateCacheStats = async () => {
  try {
    const stats = await window.electron.ipcRenderer.invoke('presenter:call', 'mcpPresenter', 'getLocalPackageCacheStats')
    cacheStats.value = stats
  } catch (error) {
    console.error('Failed to get cache stats:', error)
  }
}

// 检查网络状态
const checkNetworkStatus = async () => {
  try {
    const status = await window.electron.ipcRenderer.invoke('presenter:call', 'mcpPresenter', 'checkNetworkConnection')
    networkStatus.value = status
  } catch (error) {
    console.error('Failed to check network status:', error)
    networkStatus.value = false
  }
}

// 清理本地缓存
const clearLocalCache = async () => {
  try {
    cacheClearing.value = true
    await window.electron.ipcRenderer.invoke('presenter:call', 'mcpPresenter', 'clearLocalPackageCache')
    await updateCacheStats()
    toast({
      title: t('settings.mcp.localCache.clearSuccess'),
      description: t('settings.mcp.localCache.clearSuccessDesc'),
    })
  } catch (error) {
    console.error('Failed to clear cache:', error)
    toast({
      title: t('settings.mcp.localCache.clearError'),
      description: t('settings.mcp.localCache.clearErrorDesc'),
      variant: 'destructive'
    })
  } finally {
    cacheClearing.value = false
  }
}

// 处理MCP开关状态变化
const handleMcpEnabledChange = async (enabled: boolean) => {
  await mcpStore.setMcpEnabled(enabled)
}

// 打开MCP Marketplace
const openMcpMarketplace = () => {
  window.open(MCP_MARKETPLACE_URL, '_blank')
}

// 打开Higress MCP Marketplace
const openHigressMcpMarketplace = () => {
  window.open(HIGRESS_MCP_MARKETPLACE_URL, '_blank')
}

// 监听MCP缓存更新事件
const handleCacheUpdateEvent = async () => {
  console.log('收到MCP缓存更新事件，正在更新缓存统计...')
  await updateCacheStats()
}

// 生命周期钩子
onMounted(async () => {
  await updateCacheStats()
  await checkNetworkStatus()
  
  // 定期检查网络状态
  networkCheckInterval = setInterval(checkNetworkStatus, 30000) // 每30秒检查一次
  
  // 监听MCP缓存更新事件
  window.electron.ipcRenderer.on(MCP_EVENTS.CACHE_UPDATED, handleCacheUpdateEvent)
})

onUnmounted(() => {
  if (networkCheckInterval) {
    clearInterval(networkCheckInterval)
  }
  
  // 移除事件监听器
  window.electron.ipcRenderer.removeListener(MCP_EVENTS.CACHE_UPDATED, handleCacheUpdateEvent)
})
</script>
