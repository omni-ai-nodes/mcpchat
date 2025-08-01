import { clipboard, contextBridge, nativeImage, webUtils, webFrame, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'

// 工作流相关类型定义
interface WorkflowNode {
  id: string
  type: string
  name: string
  x: number
  y: number
  config: Record<string, unknown>
  inputs?: string[]
  outputs?: string[]
}

interface WorkflowConnection {
  id: string
  sourceNodeId: string
  targetNodeId: string
  sourceOutput: string
  targetInput: string
}

interface WorkflowData {
  name: string
  nodes: WorkflowNode[]
  connections: WorkflowConnection[]
  metadata?: Record<string, unknown>
  deploymentConfig?: Record<string, unknown>
}

// 数据库相关类型定义
interface DatabaseConfig {
  dbType: string
  host: string
  port: number
  database: string
  username: string
  password: string
  sql?: string | null
}

// 缓存变量
let cachedWindowId: number | undefined = undefined
let cachedWebContentsId: number | undefined = undefined

// Custom APIs for renderer
const api = {
  copyText: (text: string) => {
    clipboard.writeText(text)
  },
  copyImage: (image: string) => {
    const img = nativeImage.createFromDataURL(image)
    clipboard.writeImage(img)
  },
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file)
  },
  getWindowId: () => {
    if (cachedWindowId !== undefined) {
      return cachedWindowId
    }
    cachedWindowId = ipcRenderer.sendSync('get-window-id')
    return cachedWindowId
  },
  getWebContentsId: () => {
    if (cachedWebContentsId !== undefined) {
      return cachedWebContentsId
    }
    cachedWebContentsId = ipcRenderer.sendSync('get-web-contents-id')
    return cachedWebContentsId
  },
  saveUploadedFile: (fileName: string, fileData: string) => {
    return ipcRenderer.invoke('save-uploaded-file', fileName, fileData)
  },
  getUploadedFiles: () => {
    return ipcRenderer.invoke('get-uploaded-files')
  },
  readUploadedFile: (filePath: string) => ipcRenderer.invoke('read-uploaded-file', filePath),
  // 终端相关API
  getMcpServerPath: (serverName: string) => ipcRenderer.invoke('get-mcp-server-path', serverName),
  openTerminal: (workDir: string) => ipcRenderer.invoke('open-terminal', workDir),
  // 工作流相关API
  saveWorkflow: (workflowData: WorkflowData) => {
    return ipcRenderer.invoke('save-workflow', workflowData)
  },
  updateWorkflow: (filePath: string, workflowData: WorkflowData) => {
    return ipcRenderer.invoke('update-workflow', filePath, workflowData)
  },
  getWorkflows: () => {
    return ipcRenderer.invoke('get-workflows')
  },
  loadWorkflow: (filePath: string) => {
    return ipcRenderer.invoke('load-workflow', filePath)
  },
  runWorkflow: (workflowData: WorkflowData) => {
    return ipcRenderer.invoke('run-workflow', workflowData)
  },
  deployWorkflow: (workflowData: WorkflowData) => {
    return ipcRenderer.invoke('deploy-workflow', workflowData)
  },
  // 数据库相关API
  testDatabaseConnection: (config: DatabaseConfig) => {
    return ipcRenderer.invoke('test-database-connection', config)
  },
  // MCP相关API
  mcpPresenter: {
    getLocalPackageCacheStats: () => {
      return ipcRenderer.invoke('presenter:call', 'mcpPresenter', 'getLocalPackageCacheStats')
    },
    checkNetworkConnection: () => {
      return ipcRenderer.invoke('presenter:call', 'mcpPresenter', 'checkNetworkConnection')
    },
    clearLocalPackageCache: () => {
      return ipcRenderer.invoke('presenter:call', 'mcpPresenter', 'clearLocalPackageCache')
    },
    isPackageCached: (packageName: string) => {
      return ipcRenderer.invoke('presenter:call', 'mcpPresenter', 'isPackageCached', packageName)
    },
    installPackageToCache: (packageName: string) => {
      return ipcRenderer.invoke('presenter:call', 'mcpPresenter', 'installPackageToCache', packageName)
    },

  },
  // 通用 Presenter 调用接口
  presenter: {
    call: (presenterName: string, method: string, ...args: unknown[]) => {
      return ipcRenderer.invoke('presenter:call', presenterName, method, ...args)
    }
  }
}

// 暴露 Electron API
exposeElectronAPI()

// 手动暴露 ipcRenderer 到 window.electron
const electronAPI = {
  ipcRenderer: {
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, listener)
    },
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => {
      ipcRenderer.removeListener(channel, listener)
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel)
    },
    send: (channel: string, ...args: unknown[]) => {
      ipcRenderer.send(channel, ...args)
    },
    invoke: (channel: string, ...args: unknown[]) => {
      return ipcRenderer.invoke(channel, ...args)
    },
    sendSync: (channel: string, ...args: unknown[]) => {
      return ipcRenderer.sendSync(channel, ...args)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.electron = electronAPI
}
window.addEventListener('DOMContentLoaded', () => {
  webFrame.setVisualZoomLevelLimits(1, 1) // 禁用 trackpad 缩放
  webFrame.setZoomFactor(1)
})
