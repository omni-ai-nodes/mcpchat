<template>
  <div class="w-full h-full flex flex-col bg-background">
    <!-- 页面标题栏 -->
    <div class="flex items-center justify-between p-4 border-b">
      <div class="flex items-center gap-3">
        <Icon icon="lucide:image" class="w-6 h-6 text-primary" />
        <h1 class="text-2xl font-semibold">{{ t('imageGallery.title') }}</h1>
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
        
        <!-- 上传按钮 -->
        <Button @click="triggerFileUpload" class="gap-2">
          <Icon icon="lucide:upload" class="w-4 h-4" />
          {{ t('imageGallery.upload') }}
        </Button>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="image/*"
          class="hidden"
          @change="handleFileUpload"
        />
      </div>
    </div>

    <!-- 搜索和筛选栏 -->
    <div class="flex items-center gap-4 p-4 border-b">
      <div class="flex-1 relative">
        <Icon icon="lucide:search" class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          :placeholder="t('imageGallery.searchPlaceholder')"
          class="pl-10"
        />
      </div>
      <Select v-model="sortBy">
        <SelectTrigger class="w-48">
          <SelectValue :placeholder="t('imageGallery.sortBy')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">{{ t('imageGallery.sortByName') }}</SelectItem>
          <SelectItem value="date">{{ t('imageGallery.sortByDate') }}</SelectItem>
          <SelectItem value="size">{{ t('imageGallery.sortBySize') }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- 图片展示区域 -->
    <div class="flex-1 overflow-auto p-4">
      <!-- 网格视图 -->
      <div v-if="viewMode === 'grid'" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <Card
          v-for="image in filteredImages"
          :key="image.id"
          class="group cursor-pointer hover:shadow-lg transition-all duration-200 overflow-hidden"
          @click="openImagePreview(image)"
        >
          <div class="aspect-square relative overflow-hidden">
            <img
              :src="image.thumbnail || image.url"
              :alt="image.name"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              loading="lazy"
            />
            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
              <Icon icon="lucide:eye" class="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            </div>
            <!-- 删除按钮 -->
            <Button
              variant="destructive"
              size="sm"
              class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-8 h-8 p-0"
              @click.stop="deleteImage(image.id)"
            >
              <Icon icon="lucide:trash-2" class="w-4 h-4" />
            </Button>
          </div>
          <CardContent class="p-3">
            <p class="text-sm font-medium truncate">{{ image.name }}</p>
            <p class="text-xs text-muted-foreground">{{ formatFileSize(image.size) }}</p>
          </CardContent>
        </Card>
      </div>

      <!-- 列表视图 -->
      <div v-else class="space-y-2">
        <Card
          v-for="image in filteredImages"
          :key="image.id"
          class="group cursor-pointer hover:shadow-md transition-all duration-200"
          @click="openImagePreview(image)"
        >
          <CardContent class="p-4">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                <img
                  :src="image.thumbnail || image.url"
                  :alt="image.name"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium truncate">{{ image.name }}</h3>
                <p class="text-sm text-muted-foreground">{{ formatFileSize(image.size) }}</p>
                <p class="text-xs text-muted-foreground">{{ formatDate(image.createdAt) }}</p>
              </div>
              <div class="flex items-center gap-2">
                <Button variant="ghost" size="sm" @click.stop="openImagePreview(image)">
                  <Icon icon="lucide:eye" class="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" @click.stop="deleteImage(image.id)">
                  <Icon icon="lucide:trash-2" class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredImages.length === 0" class="flex flex-col items-center justify-center h-64 text-center">
        <Icon icon="lucide:image-off" class="w-16 h-16 text-muted-foreground mb-4" />
        <h3 class="text-lg font-medium mb-2">{{ t('imageGallery.noImages') }}</h3>
        <p class="text-muted-foreground mb-4">{{ t('imageGallery.noImagesDescription') }}</p>
        <Button @click="triggerFileUpload" class="gap-2">
          <Icon icon="lucide:upload" class="w-4 h-4" />
          {{ t('imageGallery.uploadFirst') }}
        </Button>
      </div>
    </div>

    <!-- 图片预览对话框 -->
    <Dialog v-model:open="previewDialogOpen">
      <DialogContent class="max-w-4xl max-h-[90vh] p-0">
        <div v-if="selectedImage" class="flex flex-col h-full">
          <!-- 预览头部 -->
          <DialogHeader class="p-6 pb-4">
            <DialogTitle class="flex items-center gap-3">
              <Icon icon="lucide:image" class="w-5 h-5" />
              {{ selectedImage.name }}
            </DialogTitle>
            <DialogDescription>
              {{ formatFileSize(selectedImage.size) }} • {{ formatDate(selectedImage.createdAt) }}
            </DialogDescription>
          </DialogHeader>
          
          <!-- 图片预览区域 -->
          <div class="flex-1 flex items-center justify-center p-6 pt-0 min-h-0">
            <img
              :src="selectedImage.url"
              :alt="selectedImage.name"
              class="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
          
          <!-- 预览底部操作 -->
          <DialogFooter class="p-6 pt-4">
            <Button variant="outline" @click="downloadImage(selectedImage)" class="gap-2">
              <Icon icon="lucide:download" class="w-4 h-4" />
              {{ t('imageGallery.download') }}
            </Button>
            <Button variant="destructive" @click="deleteImage(selectedImage.id)" class="gap-2">
              <Icon icon="lucide:trash-2" class="w-4 h-4" />
              {{ t('imageGallery.delete') }}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

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
const Dialog = defineAsyncComponent(() => import('@/components/ui/dialog').then(mod => mod.Dialog))
const DialogContent = defineAsyncComponent(() => import('@/components/ui/dialog').then(mod => mod.DialogContent))
const DialogHeader = defineAsyncComponent(() => import('@/components/ui/dialog').then(mod => mod.DialogHeader))
const DialogTitle = defineAsyncComponent(() => import('@/components/ui/dialog').then(mod => mod.DialogTitle))
const DialogDescription = defineAsyncComponent(() => import('@/components/ui/dialog').then(mod => mod.DialogDescription))
const DialogFooter = defineAsyncComponent(() => import('@/components/ui/dialog').then(mod => mod.DialogFooter))

const { t } = useI18n()

// 图片数据类型
interface ImageItem {
  id: string
  name: string
  url: string
  thumbnail?: string
  size: number
  createdAt: Date
  type: string
}

// 响应式数据
const images = ref<ImageItem[]>([])
const searchQuery = ref('')
const sortBy = ref('date')
const viewMode = ref<'grid' | 'list'>('grid')
const previewDialogOpen = ref(false)
const selectedImage = ref<ImageItem | null>(null)
const fileInput = ref<HTMLInputElement>()

// 计算属性
const filteredImages = computed(() => {
  let filtered = images.value
  
  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(image => 
      image.name.toLowerCase().includes(query)
    )
  }
  
  // 排序
  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'size':
        return b.size - a.size
      case 'date':
      default:
        return b.createdAt.getTime() - a.createdAt.getTime()
    }
  })
  
  return filtered
})

// 方法
const triggerFileUpload = () => {
  fileInput.value?.click()
}

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  
  if (files) {
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const url = e.target?.result as string
          const newImage: ImageItem = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: file.name,
            url,
            size: file.size,
            createdAt: new Date(),
            type: file.type
          }
          images.value.unshift(newImage)
        }
        reader.readAsDataURL(file)
      }
    })
  }
  
  // 清空input
  if (target) {
    target.value = ''
  }
}

const openImagePreview = (image: ImageItem) => {
  selectedImage.value = image
  previewDialogOpen.value = true
}

const deleteImage = (imageId: string) => {
  images.value = images.value.filter(img => img.id !== imageId)
  if (selectedImage.value?.id === imageId) {
    previewDialogOpen.value = false
    selectedImage.value = null
  }
}

const downloadImage = (image: ImageItem) => {
  const link = document.createElement('a')
  link.href = image.url
  link.download = image.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

// 初始化一些示例数据（可选）
const initSampleData = () => {
  // 这里可以添加一些示例图片数据
  // 在实际应用中，这些数据应该从API或本地存储加载
}

// 组件挂载时初始化
initSampleData()
</script>

<style scoped>
/* 自定义样式 */
.grid {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}
</style>