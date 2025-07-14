import { ElectronAPI } from '@electron-toolkit/preload'

interface WindowAPI {
  copyText(text: string): void
  copyImage(image: string): void
  getPathForFile(file: File): string
  getWindowId(): number | null
  getWebContentsId(): number
  saveUploadedFile: (fileName: string, fileData: string) => Promise<{ success: boolean; filePath: string; fileName: string }>
  getUploadedFiles: () => Promise<string[]>
  readUploadedFile: (filePath: string) => Promise<string>
  saveWorkflow: (workflowData: WorkflowData) => Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string; message?: string }>
  updateWorkflow: (filePath: string, workflowData: WorkflowData) => Promise<{ success: boolean; error?: string }>
  getWorkflows: () => Promise<{ success: boolean; workflows: Array<{ name: string; filePath: string; savedAt: string }>; error?: string }>
  loadWorkflow: (filePath: string) => Promise<{ success: boolean; workflow?: WorkflowData; error?: string }>
  runWorkflow: (workflowData: WorkflowData) => Promise<WorkflowExecutionResult>
  deployWorkflow: (workflowData: WorkflowData) => Promise<WorkflowDeploymentResult>
  testDatabaseConnection: (config: DatabaseConfig) => Promise<DatabaseResult>
  mcpPresenter: {
    getLocalPackageCacheStats: () => Promise<{ packageCount: number; totalSize: number }>
    checkNetworkConnection: () => Promise<boolean>
    clearLocalPackageCache: () => Promise<void>
    isPackageCached: (packageName: string) => Promise<boolean>
    installPackageToCache: (packageName: string) => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowAPI
  }
}