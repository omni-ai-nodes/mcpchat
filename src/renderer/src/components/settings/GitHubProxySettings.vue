<template>
  <ScrollArea class="w-full h-full p-2">
    <div class="w-full h-full flex flex-col gap-1.5">
      <!-- GitHub 代理开关 -->
      <div class="flex flex-row p-2 items-center gap-2 px-2">
        <span class="flex flex-row items-center gap-2 flex-grow w-full">
          <Icon icon="lucide:github" class="w-4 h-4 text-muted-foreground" />
          <span class="text-sm font-medium">{{ t('settings.githubProxy.enabled') }}</span>
        </span>
        <div class="flex-shrink-0">
          <Switch
            id="github-proxy-switch"
            :checked="githubProxyEnabled"
            @update:checked="handleGitHubProxyEnabledChange"
          />
        </div>
      </div>

      <!-- GitHub 代理 URL 配置 -->
      <div v-if="githubProxyEnabled" class="flex flex-col p-2 gap-2 px-2">
        <div class="flex flex-row items-center gap-2">
          <span class="flex flex-row items-center gap-2 flex-grow w-full">
            <Icon icon="lucide:link" class="w-4 h-4 text-muted-foreground" />
            <span class="text-sm font-medium">{{ t('settings.githubProxy.proxyUrl') }}</span>
          </span>
          <div class="flex-shrink-0 min-w-64 max-w-96">
            <Input
              v-model="githubProxyUrl"
              :placeholder="t('settings.githubProxy.proxyUrlPlaceholder')"
              :class="{ 'border-red-500': showUrlError }"
              @input="validateProxyUrl"
              @blur="validateProxyUrl"
            />
          </div>
        </div>
        <div v-if="showUrlError" class="text-xs text-red-500 ml-6">
          {{ t('settings.githubProxy.invalidProxyUrl') }}
        </div>
      </div>

      <!-- 预设代理选项 -->
      <div v-if="githubProxyEnabled" class="flex flex-col p-2 gap-2 px-2">
        <div class="flex flex-row items-center gap-2">
          <span class="flex flex-row items-center gap-2 flex-grow w-full">
            <Icon icon="lucide:list" class="w-4 h-4 text-muted-foreground" />
            <span class="text-sm font-medium">{{ t('settings.githubProxy.presetOptions') }}</span>
          </span>
          <div class="flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              @click="openAddProxyOptionDialog"
            >
              <Icon icon="lucide:plus" class="w-4 h-4 mr-1" />
              {{ t('settings.githubProxy.addOption') }}
            </Button>
          </div>
        </div>

        <!-- 代理选项列表 -->
        <div v-if="githubProxyOptions.length > 0" class="space-y-2 ml-6">
          <div
            v-for="(option, index) in githubProxyOptions"
            :key="index"
            class="flex items-center justify-between p-2 border rounded-lg"
          >
            <div class="flex flex-col">
              <span class="text-sm font-medium">{{ option }}</span>
            </div>
            <div class="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                @click="useProxyOption(option)"
              >
                {{ t('settings.githubProxy.use') }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                @click="removeProxyOption(index)"
              >
                <Icon icon="lucide:trash-2" class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        <div v-else class="text-xs text-muted-foreground ml-6">
          {{ t('settings.githubProxy.noOptions') }}
        </div>
      </div>

      <!-- 使用说明 -->
      <div class="flex flex-col p-2 gap-2 px-2">
        <div class="flex flex-row items-start gap-2">
          <Icon icon="lucide:info" class="w-4 h-4 text-muted-foreground mt-0.5" />
          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ t('settings.githubProxy.usage') }}</span>
            <div class="text-xs text-muted-foreground space-y-1">
              <p>{{ t('settings.githubProxy.usageDesc1') }}</p>
              <p>{{ t('settings.githubProxy.usageDesc2') }}</p>
              <p>{{ t('settings.githubProxy.usageDesc3') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ScrollArea>

  <!-- 添加代理选项对话框 -->
  <Dialog v-model:open="isAddProxyOptionDialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('settings.githubProxy.addProxyOption') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.githubProxy.addProxyOptionDesc') }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="proxy-option-url" class="text-right">
            {{ t('settings.githubProxy.optionUrl') }}
          </Label>
          <div class="col-span-3">
            <Input
              id="proxy-option-url"
              v-model="newProxyUrl"
              :placeholder="t('settings.githubProxy.optionUrlPlaceholder')"
              :class="{ 'border-red-500': showNewOptionUrlError }"
            />
            <div v-if="showNewOptionUrlError" class="text-xs text-red-500 mt-1">
              {{ t('settings.githubProxy.invalidProxyUrl') }}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="closeAddProxyOptionDialog">
          {{ t('dialog.cancel') }}
        </Button>
        <Button type="submit" :disabled="!isValidNewProxyOption" @click="addProxyOption">
          {{ t('dialog.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Icon } from '@iconify/vue'
import { useToast } from '@/components/ui/toast/use-toast'
import { usePresenter } from '@/composables/usePresenter'

const { t } = useI18n()
const { toast } = useToast()
const configPresenter = usePresenter('configPresenter')

// 响应式数据
const githubProxyEnabled = ref(false)
const githubProxyUrl = ref('')
const githubProxyOptions = ref<string[]>([])
const showUrlError = ref(false)
const isAddProxyOptionDialogOpen = ref(false)
const newProxyUrl = ref('')
const showNewOptionUrlError = ref(false)

// 计算属性
const isValidNewProxyOption = computed(() => {
  return newProxyUrl.value.trim() !== '' && isValidUrl(newProxyUrl.value)
})

// 验证 URL 格式
const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch {
    return false
  }
}

// 验证代理 URL
const validateProxyUrl = () => {
  if (githubProxyUrl.value.trim() === '') {
    showUrlError.value = false
    return
  }
  showUrlError.value = !isValidUrl(githubProxyUrl.value)
  if (!showUrlError.value) {
    handleGitHubProxyUrlChange()
  }
}

// 处理 GitHub 代理开关变化
const handleGitHubProxyEnabledChange = async (enabled: boolean) => {
  try {
    await configPresenter.setGitHubProxyEnabled(enabled)
    githubProxyEnabled.value = enabled
    toast({
      title: t('settings.githubProxy.enabled'),
      description: enabled ? t('settings.githubProxy.enabledSuccess') : t('settings.githubProxy.disabledSuccess')
    })
  } catch (error) {
    console.error('Failed to update GitHub proxy enabled:', error)
    toast({
      title: t('common.error'),
      description: t('settings.githubProxy.updateError'),
      variant: 'destructive'
    })
  }
}

// 处理 GitHub 代理 URL 变化
const handleGitHubProxyUrlChange = async () => {
  if (showUrlError.value) return
  
  try {
    await configPresenter.setGitHubProxyUrl(githubProxyUrl.value)
    toast({
      title: t('settings.githubProxy.proxyUrl'),
      description: t('settings.githubProxy.urlUpdateSuccess')
    })
  } catch (error) {
    console.error('Failed to update GitHub proxy URL:', error)
    toast({
      title: t('common.error'),
      description: t('settings.githubProxy.updateError'),
      variant: 'destructive'
    })
  }
}

// 打开添加代理选项对话框
const openAddProxyOptionDialog = () => {
  newProxyUrl.value = ''
  showNewOptionUrlError.value = false
  isAddProxyOptionDialogOpen.value = true
}

// 关闭添加代理选项对话框
const closeAddProxyOptionDialog = () => {
  isAddProxyOptionDialogOpen.value = false
  newProxyUrl.value = ''
  showNewOptionUrlError.value = false
}

// 添加代理选项
const addProxyOption = async () => {
  if (!isValidNewProxyOption.value) return

  try {
    await configPresenter.addGitHubProxyOption(newProxyUrl.value)
    await loadGitHubProxyOptions()
    closeAddProxyOptionDialog()
    toast({
      title: t('settings.githubProxy.addOption'),
      description: t('settings.githubProxy.addOptionSuccess')
    })
  } catch (error) {
    console.error('Failed to add GitHub proxy option:', error)
    toast({
      title: t('common.error'),
      description: t('settings.githubProxy.updateError'),
      variant: 'destructive'
    })
  }
}

// 使用代理选项
const useProxyOption = (option: string) => {
  githubProxyUrl.value = option
  validateProxyUrl()
}

// 移除代理选项
const removeProxyOption = async (index: number) => {
  try {
    const option = githubProxyOptions.value[index]
    await configPresenter.removeGitHubProxyOption(option)
    await loadGitHubProxyOptions()
    toast({
      title: t('settings.githubProxy.removeOption'),
      description: t('settings.githubProxy.removeOptionSuccess')
    })
  } catch (error) {
    console.error('Failed to remove GitHub proxy option:', error)
    toast({
      title: t('common.error'),
      description: t('settings.githubProxy.updateError'),
      variant: 'destructive'
    })
  }
}

// 加载 GitHub 代理设置
const loadGitHubProxySettings = async () => {
  try {
    const [enabled, url] = await Promise.all([
      configPresenter.getGitHubProxyEnabled(),
      configPresenter.getGitHubProxyUrl()
    ])
    githubProxyEnabled.value = enabled
    githubProxyUrl.value = url || ''
  } catch (error) {
    console.error('Failed to load GitHub proxy settings:', error)
  }
}

// 加载 GitHub 代理选项
const loadGitHubProxyOptions = async () => {
  try {
    const options = await configPresenter.getGitHubProxyOptions()
    githubProxyOptions.value = options || []
  } catch (error) {
    console.error('Failed to load GitHub proxy options:', error)
  }
}

// 组件挂载时加载设置
onMounted(async () => {
  await loadGitHubProxySettings()
  await loadGitHubProxyOptions()
})
</script>