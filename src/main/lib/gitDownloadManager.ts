import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import type { IConfigPresenter } from '../../shared/presenter'

/**
 * Git下载管理器
 * 负责从GitHub下载MCP服务器代码
 */
export class GitDownloadManager {
  private readonly downloadDir: string
  private configPresenter?: IConfigPresenter

  constructor(configPresenter?: IConfigPresenter) {
    // 下载目录设置为用户数据目录下的mcp-git-repos
    this.downloadDir = path.join(app.getPath('userData'), 'mcp-git-repos')
    this.configPresenter = configPresenter
  }

  /**
   * 确保下载目录存在
   */
  private async ensureDownloadDir(): Promise<void> {
    try {
      await fs.access(this.downloadDir)
    } catch {
      await fs.mkdir(this.downloadDir, { recursive: true })
    }
  }

  /**
   * 构建GitHub代理URL
   * @param originalUrl 原始GitHub URL
   * @returns 代理URL或原始URL
   */
  private buildProxyUrl(originalUrl: string): string {
    if (!this.configPresenter) {
      return originalUrl
    }

    try {
      const proxyEnabled = this.configPresenter.getGitHubProxyEnabled()
      if (!proxyEnabled) {
        return originalUrl
      }

      const proxyUrl = this.configPresenter.getGitHubProxyUrl()
      if (!proxyUrl) {
        return originalUrl
      }

      // 构建代理URL: proxyUrl + '//' + originalUrl
      const finalProxyUrl = `${proxyUrl.replace(/\/$/, '')}//${originalUrl}`
      console.log(`[GitDownloadManager] 使用GitHub代理: ${originalUrl} -> ${finalProxyUrl}`)
      return finalProxyUrl
    } catch (error) {
      console.error(`[GitDownloadManager] 构建代理URL失败:`, error)
      return originalUrl
    }
  }

  /**
   * 解析GitHub URL，提取仓库信息
   * @param githubUrl GitHub仓库URL
   * @returns 解析后的仓库信息
   */
  private parseGitHubUrl(githubUrl: string): { owner: string; repo: string; branch?: string; subPath?: string } {
    // 支持多种GitHub URL格式
    // https://github.com/owner/repo
    // https://github.com/owner/repo/tree/branch
    // https://github.com/owner/repo/tree/branch/path/to/subfolder
    const urlObj = new URL(githubUrl)
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0)
    
    if (pathParts.length < 2) {
      throw new Error(`Invalid GitHub URL: ${githubUrl}`)
    }

    const owner = pathParts[0]
    const repo = pathParts[1]
    let branch: string | undefined
    let subPath: string | undefined

    // 检查是否有tree路径（指定分支或子目录）
    if (pathParts.length > 2 && pathParts[2] === 'tree') {
      branch = pathParts[3]
      if (pathParts.length > 4) {
        subPath = pathParts.slice(4).join('/')
      }
    }

    return { owner, repo, branch, subPath }
  }

  /**
   * 生成本地仓库路径
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param branch 分支名称
   * @returns 本地路径
   */
  private getLocalRepoPath(owner: string, repo: string, branch?: string): string {
    const repoName = branch ? `${repo}-${branch}` : repo
    return path.join(this.downloadDir, owner, repoName)
  }

  /**
   * 检查本地仓库是否已存在
   * @param localPath 本地路径
   * @returns 是否存在
   */
  private async isRepoExists(localPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(localPath, '.git'))
      return true
    } catch {
      return false
    }
  }

  /**
   * 执行git命令
   * @param command git命令
   * @param args 参数
   * @param cwd 工作目录
   * @returns Promise<string> 命令输出
   */
  private async executeGitCommand(command: string, args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const gitProcess = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      gitProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      gitProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      gitProcess.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`Git command failed: ${stderr || stdout}`))
        }
      })

      gitProcess.on('error', (error) => {
        reject(new Error(`Failed to execute git command: ${error.message}`))
      })
    })
  }

  /**
   * 克隆或更新GitHub仓库
   * @param githubUrl GitHub仓库URL
   * @param targetName 目标名称，如果与仓库名不同则重命名
   * @returns Promise<string> 本地仓库路径
   */
  async downloadRepository(githubUrl: string, targetName?: string): Promise<string> {
    console.log(`[GitDownloadManager] 开始下载GitHub仓库: ${githubUrl}${targetName ? ` -> ${targetName}` : ''}`)
    console.log(`[GitDownloadManager] 下载目录: ${this.downloadDir}`)
    
    await this.ensureDownloadDir()
    
    const { owner, repo, branch, subPath } = this.parseGitHubUrl(githubUrl)
    console.log(`[GitDownloadManager] 解析URL结果: owner=${owner}, repo=${repo}, branch=${branch || 'default'}, subPath=${subPath || 'none'}`)
    
    const originalLocalPath = this.getLocalRepoPath(owner, repo, branch)
    const originalCloneUrl = `https://github.com/${owner}/${repo}.git`
    const cloneUrl = this.buildProxyUrl(originalCloneUrl)
    
    // 如果指定了目标名称且与原仓库名不同，使用目标名称作为本地路径
    const finalRepoName = targetName && targetName !== repo ? targetName : repo
    const localPath = targetName && targetName !== repo 
      ? this.getLocalRepoPath(owner, finalRepoName, branch)
      : originalLocalPath
    
    console.log(`[GitDownloadManager] 原始路径: ${originalLocalPath}`)
    console.log(`[GitDownloadManager] 最终路径: ${localPath}`)
    console.log(`[GitDownloadManager] 克隆URL: ${cloneUrl}`)
    
    try {
      // 检查是否需要重命名现有仓库
      if (targetName && targetName !== repo) {
        const originalExists = await this.isRepoExists(originalLocalPath)
        const targetExists = await this.isRepoExists(localPath)
        
        if (originalExists && !targetExists) {
          console.log(`[GitDownloadManager] 重命名仓库: ${originalLocalPath} -> ${localPath}`)
          await fs.rename(originalLocalPath, localPath)
          console.log(`[GitDownloadManager] 重命名完成`)
        } else {
          console.log(`[GitDownloadManager] 无需重命名 - 原始存在:${originalExists}, 目标存在:${targetExists}`)
        }
      }
      
      if (await this.isRepoExists(localPath)) {
        console.log(`[GitDownloadManager] 仓库已存在，更新代码: ${localPath}`)
        // 仓库已存在，执行pull更新
        console.log(`[GitDownloadManager] 执行 git fetch origin`)
        await this.executeGitCommand('git', ['fetch', 'origin'], localPath)
        
        if (branch) {
          // 切换到指定分支
          console.log(`[GitDownloadManager] 切换到分支: ${branch}`)
          await this.executeGitCommand('git', ['checkout', branch], localPath)
          console.log(`[GitDownloadManager] 执行 git pull origin ${branch}`)
          await this.executeGitCommand('git', ['pull', 'origin', branch], localPath)
        } else {
          // 更新默认分支
          console.log(`[GitDownloadManager] 执行 git pull (默认分支)`)
          await this.executeGitCommand('git', ['pull'], localPath)
        }
        console.log(`[GitDownloadManager] 仓库更新完成`)
      } else {
        console.log(`[GitDownloadManager] 克隆新仓库: ${cloneUrl} -> ${localPath}`)
        // 仓库不存在，执行clone
        const cloneArgs = ['clone']
        if (branch) {
          cloneArgs.push('-b', branch)
          console.log(`[GitDownloadManager] 克隆指定分支: ${branch}`)
        }
        cloneArgs.push(cloneUrl, localPath)
        
        console.log(`[GitDownloadManager] 执行克隆命令: git ${cloneArgs.join(' ')}`)
        await this.executeGitCommand('git', cloneArgs)
        console.log(`[GitDownloadManager] 克隆完成`)
      }
      
      // 如果指定了子路径，返回子路径
      const finalPath = subPath ? path.join(localPath, subPath) : localPath
      
      // 验证最终路径是否存在
      try {
        await fs.access(finalPath)
      } catch {
        throw new Error(`指定的路径不存在: ${subPath}`)
      }
      
      console.log(`[GitDownloadManager] 最终返回路径: ${finalPath}`)
      console.log(`[GitDownloadManager] GitHub仓库下载完成: ${finalPath}`)
      return finalPath
    } catch (error) {
      console.error(`[GitDownloadManager] 下载GitHub仓库失败:`, error)
      console.error(`[GitDownloadManager] 失败的URL: ${githubUrl}`)
      console.error(`[GitDownloadManager] 目标名称: ${targetName || 'none'}`)
      throw error
    }
  }

  /**
   * 清理下载的仓库
   * @param githubUrl GitHub仓库URL
   */
  async cleanRepository(githubUrl: string): Promise<void> {
    const { owner, repo, branch } = this.parseGitHubUrl(githubUrl)
    const localPath = this.getLocalRepoPath(owner, repo, branch)
    
    try {
      await fs.rm(localPath, { recursive: true, force: true })
      console.log(`已清理仓库: ${localPath}`)
    } catch (error) {
      console.error(`清理仓库失败: ${error}`)
    }
  }

  /**
   * 获取下载目录
   */
  getDownloadDirectory(): string {
    return this.downloadDir
  }

  /**
   * 清理所有下载的仓库
   */
  async cleanAllRepositories(): Promise<void> {
    try {
      await fs.rm(this.downloadDir, { recursive: true, force: true })
      console.log(`已清理所有下载的仓库: ${this.downloadDir}`)
    } catch (error) {
      console.error(`清理所有仓库失败: ${error}`)
    }
  }

  /**
   * 检查GitHub仓库是否已下载到本地
   * @param githubUrl GitHub仓库URL
   * @param targetName 目标名称，如果与仓库名不同则检查重命名后的路径
   * @returns Promise<boolean> 是否已下载
   */
  async isRepositoryDownloaded(githubUrl: string, targetName?: string): Promise<boolean> {
    try {
      const { owner, repo, branch, subPath } = this.parseGitHubUrl(githubUrl)
      
      // 如果指定了目标名称且与原仓库名不同，优先检查目标路径
      const finalRepoName = targetName && targetName !== repo ? targetName : repo
      const localPath = targetName && targetName !== repo 
        ? this.getLocalRepoPath(owner, finalRepoName, branch)
        : this.getLocalRepoPath(owner, repo, branch)
      
      // 检查仓库是否存在
      if (!(await this.isRepoExists(localPath))) {
        // 如果指定了targetName但目标路径不存在，也检查原始路径
        if (targetName && targetName !== repo) {
          const originalPath = this.getLocalRepoPath(owner, repo, branch)
          if (!(await this.isRepoExists(originalPath))) {
            return false
          }
          // 如果原始路径存在但目标路径不存在，说明还未重命名，仍然算作已下载
        } else {
          return false
        }
      }
      
      // 如果指定了子路径，检查子路径是否存在
      if (subPath) {
        const finalPath = path.join(localPath, subPath)
        try {
          await fs.access(finalPath)
          return true
        } catch {
          return false
        }
      }
      
      return true
    } catch (error) {
      console.error(`检查GitHub仓库下载状态失败: ${error}`)
      return false
    }
  }
}

// 不再导出单例实例，由使用方自行创建