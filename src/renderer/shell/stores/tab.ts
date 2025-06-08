import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePresenter } from '@/composables/usePresenter'
import { TabData } from '@shared/presenter'
import { TAB_EVENTS } from '@/events'

export const useTabStore = defineStore('tab', () => {
  const tabPresenter = usePresenter('tabPresenter')
  const tabs = ref<TabData[]>([])

  const currentTabId = ref<number | null>(null)

  const addTab = async (tab: { name: string; icon: string; viewType: string }) => {
    // if (tabs.value.find((t) => t.viewType === tab.viewType)) {
    //   return
    // }
    const windowId = window.api.getWindowId()
    console.log('windowId', windowId)
    const viewId = await tabPresenter.createTab(windowId ?? 1, `local://${tab.viewType}`)
    console.log('viewId', viewId)

    let position = 0
    for (const tab of tabs.value) {
      if (tab.position > position) {
        position = tab.position
      }
    }

    const newTab: TabData = {
      id: viewId ?? 0,
      title: tab.name,
      icon: tab.icon,
      isActive: true,
      position: position + 1,
      closable: true,
      url: `local://${tab.viewType}`
    }
    tabs.value.push(newTab)
    setCurrentTabId(newTab.id)
    return newTab
  }

  const removeTab = async (id: number) => {
    await tabPresenter.closeTab(tabs.value.find((tab) => tab.id === id)?.id ?? 0)
    tabs.value = tabs.value.filter((tab) => tab.id !== id)
  }

  const setCurrentTabId = async (id: number) => {
    await tabPresenter.switchTab(tabs.value.find((tab) => tab.id === id)?.id ?? 0)
    currentTabId.value = id
  }

  const updateWindowTabs = (windowId: number, tabsData: TabData[]) => {
    console.log('updateWindowTabs', windowId, tabsData)
    tabs.value = tabsData
    for (const tab of tabsData) {
      if (tab.isActive) {
        currentTabId.value = tab.id
      }
    }
  }

  const init = async () => {
    const windowId = window.api.getWindowId()
    const tabsData = await tabPresenter.getWindowTabsData(windowId ?? 1)
    window.electron.ipcRenderer.on('update-window-tabs', (_, windowId, tabsData: TabData[]) => {
      // console.log('update-window-tabs', windowId, tabsData)
      updateWindowTabs(windowId, tabsData)
    })

    // 监听标题更新事件
    window.electron.ipcRenderer.on(
      TAB_EVENTS.TITLE_UPDATED,
      (_, data: { tabId: number; title: string; windowId: number }) => {
        const tab = tabs.value.find((t) => t.id === data.tabId)
        if (tab) {
          tab.title = data.title
        }
      }
    )

    // console.log('tabsData', tabsData)
    if (tabsData.length <= 0) {
      // await addTab({
      //   name: 'New Tab',
      //   icon: 'lucide:plus',
      //   viewType: 'chat'
      // })
    } else {
      tabs.value = tabsData
      for (const tab of tabsData) {
        if (tab.isActive) {
          currentTabId.value = tab.id
        }
      }
    }
  }

  init()

  // addTab({
  //   name: 'New Tab',
  //   icon: 'lucide:plus',
  //   viewType: 'chat'
  // })

  // setCurrentTabId(tabs.value[0].id)

  return {
    tabs,
    currentTabId,
    addTab,
    removeTab,
    setCurrentTabId
  }
})
