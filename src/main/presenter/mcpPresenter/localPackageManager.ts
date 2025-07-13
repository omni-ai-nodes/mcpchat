import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { eventBus, SendTarget } from '@/eventbus'
import { NOTIFICATION_EVENTS, MCP_EVENTS } from '@/events'
import { getErrorMessageLabels } from '@shared/i18n'

/**
 * 本地包管理器 - 用于处理MCP服务的本地化部署
 * 支持离线安装已缓存的npx包
 */
export class LocalPackageManager {
  private userDataPath: string
  private localCachePath: string
  private localNodeModulesPath: string
  private nodeRuntimePath: string | null = null

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.localCachePath = path.join(this.userDataPath, 'mcp-cache')
    this.localNodeModulesPath = path.join(this.userDataPath, 'mcp-node-modules')
    this.setupNodeRuntime()
    this.ensureDirectories()
  }

  /**
   * 设置Node运行时路径
   */
  private setupNodeRuntime(): void {
    const runtimePath = path
      .join(app.getAppPath(), 'runtime', 'node')
      .replace('app.asar', 'app.asar.unpacked')

    if (process.platform === 'win32') {
      const nodeExe = path.join(runtimePath, 'node.exe')
      if (fs.existsSync(nodeExe)) {
        this.nodeRuntimePath = runtimePath
      }
    } else {
      const nodeBin = path.join(runtimePath, 'bin', 'node')
      if (fs.existsSync(nodeBin)) {
        this.nodeRuntimePath = path.join(runtimePath, 'bin')
      }
    }

    if (!this.nodeRuntimePath) {
      console.warn('未找到内置Node运行时，将尝试使用系统Node')
    }
  }

  /**
   * 确保必要的目录存在
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.localCachePath)) {
      fs.mkdirSync(this.localCachePath, { recursive: true })
    }
    if (!fs.existsSync(this.localNodeModulesPath)) {
      fs.mkdirSync(this.localNodeModulesPath, { recursive: true })
    }
  }

  /**
   * 检查包是否已在本地缓存
   */
  isPackageCached(packageName: string): boolean {
    const packagePath = path.join(this.localNodeModulesPath, packageName)
    return fs.existsSync(packagePath) && fs.existsSync(path.join(packagePath, 'package.json'))
  }

  /**
   * 获取本地缓存的包路径
   */
  getLocalPackagePath(packageName: string): string | null {
    if (this.isPackageCached(packageName)) {
      return path.join(this.localNodeModulesPath, packageName)
    }
    return null
  }

  /**
   * 在线安装包到本地缓存
   */
  async installPackageToCache(packageName: string, npmRegistry?: string): Promise<boolean> {
    try {
      console.log(`正在安装包到本地缓存: ${packageName}`)
      
      const env = { ...process.env }
      
      // 设置npm配置
      if (npmRegistry) {
        env.npm_config_registry = npmRegistry
      }
      env.npm_config_cache = this.localCachePath
      env.npm_config_prefix = this.localNodeModulesPath
      
      // 设置PATH
      if (this.nodeRuntimePath) {
        const separator = process.platform === 'win32' ? ';' : ':'
        env.PATH = `${this.nodeRuntimePath}${separator}${env.PATH}`
      }

      return new Promise((resolve, reject) => {
        const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        const child = spawn(npmCommand, ['install', packageName, '--global'], {
          env,
          cwd: this.localNodeModulesPath,
          stdio: ['pipe', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        child.stdout?.on('data', (data) => {
          stdout += data.toString()
        })

        child.stderr?.on('data', (data) => {
          stderr += data.toString()
        })

        child.on('close', (code) => {
          if (code === 0) {
            console.log(`包 ${packageName} 安装成功`)
            // 发送缓存更新事件
            eventBus.send(MCP_EVENTS.CACHE_UPDATED, SendTarget.ALL_WINDOWS)
            resolve(true)
          } else {
            console.error(`包 ${packageName} 安装失败:`, stderr)
            reject(new Error(`安装失败: ${stderr}`))
          }
        })

        child.on('error', (error) => {
          console.error(`安装包 ${packageName} 时发生错误:`, error)
          reject(error)
        })
      })
    } catch (error) {
      console.error(`安装包 ${packageName} 失败:`, error)
      return false
    }
  }

  /**
   * 生成本地化的命令
   * 将npx命令转换为使用本地缓存的node命令
   */
  generateLocalCommand(originalCommand: string): { command: string; args: string[] } | null {
    // 解析原始命令
    const parts = originalCommand.trim().split(/\s+/)
    if (parts.length === 0) {
      return null
    }

    const firstPart = parts[0]
    
    // 处理npx命令
    if (firstPart === 'npx' && parts.length > 1) {
      const packageName = parts[1]
      const packageArgs = parts.slice(2)
      
      // 检查包是否在本地缓存中
      const localPackagePath = this.getLocalPackagePath(packageName)
      if (localPackagePath) {
        // 查找包的入口文件
        const packageJsonPath = path.join(localPackagePath, 'package.json')
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
            const binPath = this.getPackageBinPath(localPackagePath, packageJson, packageName)
            
            if (binPath && fs.existsSync(binPath)) {
              const nodeCommand = this.nodeRuntimePath 
                ? (process.platform === 'win32' 
                    ? path.join(this.nodeRuntimePath, 'node.exe')
                    : path.join(this.nodeRuntimePath, 'node'))
                : 'node'
              
              return {
                command: nodeCommand,
                args: [binPath, ...packageArgs]
              }
            }
          } catch (error) {
            console.error(`解析包 ${packageName} 的package.json失败:`, error)
          }
        }
      }
    }
    
    // 如果不是npx命令或无法本地化，返回原始命令
    return {
      command: firstPart,
      args: parts.slice(1)
    }
  }

  /**
   * 获取包的可执行文件路径
   */
  private getPackageBinPath(packagePath: string, packageJson: any, packageName: string): string | null {
    if (packageJson.bin) {
      if (typeof packageJson.bin === 'string') {
        return path.join(packagePath, packageJson.bin)
      } else if (typeof packageJson.bin === 'object') {
        // 优先使用包名对应的bin
        if (packageJson.bin[packageName]) {
          return path.join(packagePath, packageJson.bin[packageName])
        }
        // 否则使用第一个bin
        const firstBin = Object.values(packageJson.bin)[0] as string
        if (firstBin) {
          return path.join(packagePath, firstBin)
        }
      }
    }
    
    // 如果没有bin字段，尝试查找main字段
    if (packageJson.main) {
      return path.join(packagePath, packageJson.main)
    }
    
    // 默认查找index.js
    const indexPath = path.join(packagePath, 'index.js')
    if (fs.existsSync(indexPath)) {
      return indexPath
    }
    
    return null
  }

  /**
   * 清理本地缓存
   */
  async clearCache(): Promise<void> {
    try {
      if (fs.existsSync(this.localCachePath)) {
        fs.rmSync(this.localCachePath, { recursive: true, force: true })
      }
      if (fs.existsSync(this.localNodeModulesPath)) {
        fs.rmSync(this.localNodeModulesPath, { recursive: true, force: true })
      }
      this.ensureDirectories()
      console.log('MCP本地缓存已清理')
    } catch (error) {
      console.error('清理MCP本地缓存失败:', error)
      throw error
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { totalPackages: number; totalSize: number } {
    let totalPackages = 0
    let totalSize = 0

    try {
      if (fs.existsSync(this.localNodeModulesPath)) {
        const packages = fs.readdirSync(this.localNodeModulesPath)
        totalPackages = packages.length
        
        // 计算总大小（简化版本，只计算目录数量）
        for (const pkg of packages) {
          const pkgPath = path.join(this.localNodeModulesPath, pkg)
          if (fs.statSync(pkgPath).isDirectory()) {
            totalSize += this.getDirectorySize(pkgPath)
          }
        }
      }
    } catch (error) {
      console.error('获取缓存统计信息失败:', error)
    }

    return { totalPackages, totalSize }
  }

  /**
   * 获取目录大小
   */
  private getDirectorySize(dirPath: string): number {
    let size = 0
    try {
      const files = fs.readdirSync(dirPath)
      for (const file of files) {
        const filePath = path.join(dirPath, file)
        const stats = fs.statSync(filePath)
        if (stats.isDirectory()) {
          size += this.getDirectorySize(filePath)
        } else {
          size += stats.size
        }
      }
    } catch (error) {
      // 忽略权限错误等
    }
    return size
  }

  /**
   * 检查网络连接状态
   */
  async checkNetworkConnection(): Promise<boolean> {
    try {
      const { default: axios } = await import('axios')
      await axios.get('https://registry.npmjs.org/', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取本地化命令 - 用于MCP客户端
   * 如果包在本地缓存中，返回本地化的node命令
   * 否则尝试智能安装
   */
  async getLocalCommand(packageName: string, npmRegistry?: string): Promise<string | null> {
    // 首先尝试智能安装包
    const installed = await this.smartInstallPackage(packageName, npmRegistry)
    if (!installed) {
      return null
    }

    // 生成本地化命令
    const localCommand = this.generateLocalCommand(`npx ${packageName}`)
    if (localCommand) {
      return `${localCommand.command} ${localCommand.args.join(' ')}`
    }

    return null
  }

  /**
   * 智能安装包 - 优先使用本地缓存，网络可用时自动缓存
   */
  async smartInstallPackage(packageName: string, npmRegistry?: string): Promise<boolean> {
    // 首先检查本地缓存
    if (this.isPackageCached(packageName)) {
      console.log(`包 ${packageName} 已在本地缓存中`)
      return true
    }

    // 检查网络连接
    const hasNetwork = await this.checkNetworkConnection()
    if (!hasNetwork) {
      console.warn(`包 ${packageName} 不在本地缓存中，且无网络连接`)
      return false
    }

    // 尝试在线安装到缓存
    try {
      return await this.installPackageToCache(packageName, npmRegistry)
    } catch (error) {
      console.error(`在线安装包 ${packageName} 失败:`, error)
      return false
    }
  }
}