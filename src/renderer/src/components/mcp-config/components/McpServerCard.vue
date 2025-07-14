<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { useI18n } from 'vue-i18n'
import { computed, ref, nextTick, onMounted, watch } from 'vue'
import { Separator } from '@/components/ui/separator'

interface ServerInfo {
  name: string
  icons: string
  descriptions: string
  command: string
  args: string[]
  isRunning: boolean
  isDefault: boolean
  type?: string
  baseUrl?: string
  errorMessage?: string
}

interface Props {
  server: ServerInfo
  isBuiltIn?: boolean
  isLoading?: boolean
  disabled?: boolean
  toolsCount?: number
  promptsCount?: number
  resourcesCount?: number
}

interface Emits {
  (e: 'toggle'): void
  (e: 'toggleDefault'): void
  (e: 'edit'): void
  (e: 'remove'): void
  (e: 'viewLogs'): void
  (e: 'restart'): void
  (e: 'viewTools'): void
  (e: 'viewPrompts'): void
  (e: 'viewResources'): void
}

const props = defineProps<Props>()
defineEmits<Emits>()

const { t } = useI18n()
const isDescriptionExpanded = ref(false)
const descriptionRef = ref<HTMLElement>()
const needsExpansion = ref(false)

const getLocalizedServerName = (serverName: string) => {
  try {
    const key = `mcp.inmemory.${serverName}.name`
    const result = t(key)
    // 如果翻译结果等于键值本身，说明没有找到翻译，返回原始名称
    return result === key ? serverName : result
  } catch {
    return serverName
  }
}

const getLocalizedServerDesc = (serverName: string, fallbackDesc: string) => {
  try {
    const key = `mcp.inmemory.${serverName}.desc`
    const result = t(key)
    // 如果翻译结果等于键值本身，说明没有找到翻译，返回备用描述
    return result === key ? fallbackDesc : result
  } catch {
    return fallbackDesc
  }
}

const getServerTypeLabel = (type?: string) => {
  switch (type) {
    case 'http':
      return 'HTTP'
    case 'gallery':
      return 'Gallery'
    case 'inmemory':
    default:
      return 'Local'
  }
}

// 计算服务器状态
const serverStatus = computed(() => {
  if (props.isLoading) return 'loading'
  if (props.server.errorMessage) return 'error'
  if (props.server.isRunning) return 'running'
  return 'stopped'
})

// 计算状态样式
const statusConfig = computed(() => {
  switch (serverStatus.value) {
    case 'running':
      return {
        dot: 'bg-green-500',
        text: t('settings.mcp.running'),
        color: 'text-green-600 dark:text-green-400'
      }
    case 'loading':
      return {
        dot: 'bg-blue-500 animate-pulse',
        text: t('settings.mcp.starting'),
        color: 'text-blue-600 dark:text-blue-400'
      }
    case 'error':
      return {
        dot: 'bg-red-500',
        text: t('settings.mcp.error'),
        color: 'text-red-600 dark:text-red-400'
      }
    default:
      return {
        dot: 'bg-gray-400',
        text: t('settings.mcp.stopped'),
        color: 'text-muted-foreground'
      }
  }
})

// 获取完整描述
const fullDescription = computed(() => {
  return props.isBuiltIn
    ? getLocalizedServerDesc(props.server.name, props.server.descriptions)
    : props.server.descriptions
})

// 检查文本是否溢出
const checkTextOverflow = async () => {
  await nextTick()
  if (!descriptionRef.value) return

  const element = descriptionRef.value
  // 检查是否有文本溢出（scrollHeight > clientHeight）
  needsExpansion.value = element.scrollHeight > element.clientHeight
}

// 监听描述变化，重新检查是否需要展开
onMounted(() => {
  checkTextOverflow()
})

// 当描述内容变化时重新检查
const watchDescription = computed(() => fullDescription.value)
watch(watchDescription, () => {
  checkTextOverflow()
})
</script>

<template>
  <div
    class="bg-card shadow-sm border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary group"
  >
    <div class="px-4 py-2">
      <!-- 头部：图标、名称、状态、菜单 -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center space-x-2 flex-1 min-w-0">
          <!-- 图标显示区域 -->
          <div class="flex items-center space-x-2">
            <!-- 如果是图片URL，显示图片 -->
            <div v-if="server.icons && (server.icons.startsWith('http://') || server.icons.startsWith('https://') || server.icons.startsWith('data:'))"
                 class="w-8 h-8 rounded border flex items-center justify-center bg-muted">
              <img :src="server.icons" alt="Server Icon" class="w-8 h-8 object-contain"
                   @error="() => server.icons = '📁'" />
            </div>
            <!-- 如果是emoji，显示emoji -->
            <div v-else-if="server.icons && !server.icons.startsWith('http://') && !server.icons.startsWith('https://') && !server.icons.startsWith('data:')"
                 class="w-8 h-8 rounded border flex items-center justify-center bg-muted text-lg">
              {{ server.icons }}
            </div>
            <!-- 默认图标 -->
            <div v-else class="w-8 h-8 rounded border flex items-center justify-center bg-muted text-lg">
              📁
            </div>
          </div>

          <!-- 名称 -->
          <h3 class="text-sm font-bold truncate flex-1">
            {{ isBuiltIn ? getLocalizedServerName(server.name) : server.name }}
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
            <DropdownMenuItem :disabled="disabled" @click="$emit('edit')">
              <Icon icon="lucide:edit-3" class="h-4 w-4 mr-2" />
              {{ t('settings.mcp.editServer') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem :disabled="disabled" @click="$emit('toggleDefault')">
              <Icon
                :icon="server.isDefault ? 'lucide:power-off' : 'lucide:power'"
                class="h-4 w-4 mr-2"
              />
              {{
                server.isDefault ? t('settings.mcp.removeDefault') : t('settings.mcp.setAsDefault')
              }}
            </DropdownMenuItem>
            <DropdownMenuSeparator v-if="!isBuiltIn" />
            <DropdownMenuItem
              v-if="!isBuiltIn"
              :disabled="disabled"
              class="text-destructive focus:text-destructive"
              @click="$emit('remove')"
            >
              <Icon icon="lucide:trash-2" class="h-4 w-4 mr-2" />
              {{ t('settings.mcp.removeServer') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <!-- 类型和标识 -->
      <div class="flex items-center space-x-2 mb-2">
        <!-- 服务器类型 -->
        <Badge variant="outline" class="text-xs h-4 px-1.5">
          {{ getServerTypeLabel(server.type) }}
        </Badge>

        <!-- 默认启动标识 -->
        <Badge v-if="server.isDefault" variant="default" class="text-xs h-4 px-1.5">
          {{ t('settings.mcp.default') }}
        </Badge>
      </div>

      <!-- 描述 -->
      <div class="mb-2">
        <p
          ref="descriptionRef"
          class="text-xs text-secondary-foreground cursor-pointer overflow-hidden leading-5 break-all"
          :class="[
            !isDescriptionExpanded ? 'line-clamp-1' : '',
            needsExpansion ? 'hover:text-foreground transition-colors' : ''
          ]"
          style="min-height: 1rem"
          @click="needsExpansion && (isDescriptionExpanded = !isDescriptionExpanded)"
        >
          {{ fullDescription }}
        </p>
        <Button
          variant="link"
          size="sm"
          class="h-auto p-0 text-xs mt-1 hover:no-underline gap-1"
          :class="[needsExpansion ? 'opacity-100' : 'opacity-0 pointer-events-none']"
          @click="isDescriptionExpanded = !isDescriptionExpanded"
        >
          <Icon
            :icon="isDescriptionExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="h-3 w-3"
          />
          {{ isDescriptionExpanded ? t('common.collapse') : t('common.expand') }}
        </Button>
      </div>

      <!-- 底部控制 -->
      <div class="flex items-center justify-between">
        <!-- 状态 -->
        <div class="flex items-center space-x-1.5">
          <div :class="['w-2 h-2 rounded-full', statusConfig.dot]" />
          <span :class="['text-xs', statusConfig.color]">
            {{ statusConfig.text }}
          </span>

          <!-- 错误提示 -->
          <TooltipProvider v-if="server.errorMessage">
            <Tooltip>
              <TooltipTrigger>
                <Icon icon="lucide:alert-circle" class="w-3 h-3 text-red-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p class="text-xs max-w-xs">{{ server.errorMessage }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div class="flex items-center space-x-2">
          <Switch
            :checked="server.isRunning"
            :disabled="disabled || isLoading"
            @update:checked="$emit('toggle')"
          />
        </div>
      </div>
    </div>
    <div class="flex flex-row bg-muted h-9 items-center">
      <!-- 工具按钮 -->
      <Button
        v-if="toolsCount !== undefined"
        variant="ghost"
        class="h-full flex-1 text-xs hover:bg-secondary rounded-none"
        :disabled="disabled || toolsCount === 0"
        @click="$emit('viewTools')"
      >
        <Icon icon="lucide:wrench" class="h-3 w-3 mr-1" />
        {{ toolsCount }}
      </Button>
      <!-- 提示词按钮 -->
      <Separator orientation="vertical" class="h-5" />
      <Button
        v-if="promptsCount !== undefined"
        variant="ghost"
        class="h-full flex-1 text-xs hover:bg-secondary rounded-none"
        :disabled="disabled || promptsCount === 0"
        @click="$emit('viewPrompts')"
      >
        <Icon icon="lucide:message-square-quote" class="h-3 w-3 mr-1" />
        {{ promptsCount }}
      </Button>
      <Separator orientation="vertical" class="h-5" />
      <!-- 资源按钮 -->
      <Button
        v-if="resourcesCount !== undefined"
        variant="ghost"
        class="h-full flex-1 text-xs hover:bg-secondary rounded-none"
        :disabled="disabled || resourcesCount === 0"
        @click="$emit('viewResources')"
      >
        <Icon icon="lucide:folder" class="h-3 w-3 mr-1" />
        {{ resourcesCount }}
      </Button>
    </div>
  </div>
</template>
