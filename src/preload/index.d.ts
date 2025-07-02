import { ElectronAPI } from '@electron-toolkit/preload'

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

export interface WorkflowData {
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
  }
}

interface WorkflowDeploymentResult {
  success: boolean
  deploymentId: string
  deploymentPath: string
  config: WorkflowData
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
      saveUploadedFile: (file: File) => Promise<{ success: boolean; filePath: string; fileName: string }>
  getUploadedFiles: () => Promise<string[]>
  readUploadedFile: (filePath: string) => Promise<string>
  
  // 工作流相关API
  saveWorkflow: (workflowData: WorkflowData) => Promise<{ success: boolean; filePath: string; fileName: string }>
  getWorkflows: () => Promise<WorkflowData[]>
  runWorkflow: (workflowData: WorkflowData) => Promise<WorkflowExecutionResult>
  deployWorkflow: (workflowData: WorkflowData) => Promise<WorkflowDeploymentResult>
  
  // Gallery管理相关API
  convertGalleryToLocal: (serverName: string, serverConfig: any, deployJson: string) => Promise<any>
    }
  }
}

export {}
