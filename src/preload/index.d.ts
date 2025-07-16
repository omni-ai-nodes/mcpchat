import { ElectronAPI } from '@electron-toolkit/preload'

// 工作流相关类型定义
interface WorkflowNode {
  id: string
  type: string
  name: string
  x: number
  y: number
  config: Record<string, unknown>
  inputs?: (string | { name: string; })[]
  outputs?: (string | { name: string; })[]
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

interface WorkflowExecutionResult {
  success: boolean
  executionId: string
  startTime: string
  status: string
  results: {
    processedNodes: number
    processedConnections: number
    nodeResults?: Record<string, { output: string }>
  }
  error?: string
}

interface WorkflowDeploymentResult {
  success: boolean
  deploymentId: string
  deploymentPath: string
  config: WorkflowData
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

interface DatabaseResult {
  success: boolean
  message: string
  data?: any
  error?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      copyText(text: string): void
      copyImage(image: string): void
      getPathForFile(file: File): string
      getWindowId(): number | null
      getWebContentsId(): number
      // sendPortDrag: (port: string, type: 'input' | 'output', event: MouseEvent) => void
      saveUploadedFile: (fileName: string, fileData: string) => Promise<{ success: boolean; filePath: string; fileName: string }>
  getUploadedFiles: () => Promise<string[]>
  readUploadedFile: (filePath: string) => Promise<string>
  
  // 工作流相关API
  saveWorkflow: (workflowData: WorkflowData) => Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string; message?: string }>
  updateWorkflow: (filePath: string, workflowData: WorkflowData) => Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string; message?: string }>
  getWorkflows: () => Promise<{ success: boolean; workflows: Array<{ name: string; filePath: string; savedAt: string }>; error?: string }>
  loadWorkflow: (filePath: string) => Promise<{ success: boolean; workflow?: WorkflowData; error?: string }>
  runWorkflow: (workflowData: WorkflowData) => Promise<WorkflowExecutionResult>
  deployWorkflow: (workflowData: WorkflowData) => Promise<WorkflowDeploymentResult>
  
  // 数据库相关API
  testDatabaseConnection: (config: DatabaseConfig) => Promise<DatabaseResult>
  
  // MCP相关API
  mcpPresenter: {
    getLocalPackageCacheStats: () => Promise<{ packageCount: number; totalSize: number }>
    checkNetworkConnection: () => Promise<boolean>
    clearLocalPackageCache: () => Promise<void>
    isPackageCached: (packageName: string) => Promise<boolean>
    installPackageToCache: (packageName: string) => Promise<boolean>
  }
    }
  }
}

export {}
