import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import type { IConfigPresenter } from '../../shared/presenter'
import { eventBus, SendTarget } from '../eventbus'
import { MCP_EVENTS, GITHUB_DOWNLOAD_EVENTS } from '../events'

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
   * 检查文件是否存在
   * @param filePath 文件路径
   * @returns 是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 检查并安装依赖（如果需要）
   * @param localPath 本地仓库路径
   * @param serverName 服务器名称（用于事件通知）
   */
  private async installDependenciesIfNeeded(localPath: string, serverName?: string): Promise<void> {
    try {
      // 检查是否存在 package.json 文件
      const packageJsonPath = path.join(localPath, 'package.json')
      try {
        await fs.access(packageJsonPath)
        console.log(`[GitDownloadManager] 发现 package.json，开始安装依赖: ${packageJsonPath}`)
        
        // 检测包管理器 - 优先使用 bun 以避免 yarn 版本冲突
        let installer = 'bun'
        
        // 如果存在 bun.lockb，优先使用 bun
        if (await this.fileExists(path.join(localPath, 'bun.lockb'))) {
          installer = 'bun'
        } 
        // 检查是否存在 package-lock.json，使用 npm
        else if (await this.fileExists(path.join(localPath, 'package-lock.json'))) {
          installer = 'npm'
        }
        // 检查是否存在 yarn.lock，但避免使用 yarn 以避免版本冲突
        else if (await this.fileExists(path.join(localPath, 'yarn.lock'))) {
          // 检查 package.json 中是否指定了 yarn 版本，如果是则降级到使用 bun
          try {
            const packageJsonPath = path.join(localPath, 'package.json')
            const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
            const packageJson = JSON.parse(packageJsonContent)
            
            // 如果 package.json 中指定了 packageManager 为 yarn，优先使用 bun
            if (packageJson.packageManager && packageJson.packageManager.startsWith('yarn@')) {
              console.log(`[GitDownloadManager] 检测到 yarn packageManager 指定，为避免版本冲突，使用 bun 替代 yarn`)
              installer = 'bun'
            } else {
              installer = 'yarn'
            }
          } catch {
            installer = 'yarn'
          }
        }
        // 检查是否存在 pnpm-lock.yaml
        else if (await this.fileExists(path.join(localPath, 'pnpm-lock.yaml'))) {
          installer = 'pnpm'
        }
        // 默认使用 bun 而不是 npm
        else {
          installer = 'bun'
        }
        
        // 发送安装开始事件
        eventBus.send(GITHUB_DOWNLOAD_EVENTS.NPM_INSTALL_STARTED, SendTarget.ALL_WINDOWS, {
          serverName: serverName || 'unknown',
          packagePath: packageJsonPath,
          installer
        })
        
        // 检查是否存在 node_modules 目录
        const nodeModulesPath = path.join(localPath, 'node_modules')
        let needInstall = false
        
        try {
          await fs.access(nodeModulesPath)
          console.log(`[GitDownloadManager] node_modules 已存在，检查是否需要更新`)
          // node_modules 存在，但我们仍然运行 npm install 以确保依赖是最新的
          needInstall = true
        } catch {
          console.log(`[GitDownloadManager] node_modules 不存在，需要安装依赖`)
          needInstall = true
        }
        
        if (needInstall) {
          console.log(`[GitDownloadManager] 执行 ${installer} install`)
          
          // 发送安装进度事件
          eventBus.send(GITHUB_DOWNLOAD_EVENTS.NPM_INSTALL_PROGRESS, SendTarget.ALL_WINDOWS, {
            serverName: serverName || 'unknown',
            installer,
            message: `使用 ${installer} 安装依赖...`
          })
          
          await this.executeNpmCommand(installer, ['install'], localPath, serverName)
          console.log(`[GitDownloadManager] 依赖安装完成`)
          
          // 发送安装完成事件
          eventBus.send(GITHUB_DOWNLOAD_EVENTS.NPM_INSTALL_COMPLETED, SendTarget.ALL_WINDOWS, {
            serverName: serverName || 'unknown',
            installer,
            success: true
          })
        }
      } catch {
        console.log(`[GitDownloadManager] 未发现 package.json，跳过依赖安装`)
      }
    } catch (error) {
      console.error(`[GitDownloadManager] 安装依赖失败:`, error)
      
      // 发送安装错误事件
      eventBus.send(GITHUB_DOWNLOAD_EVENTS.NPM_INSTALL_ERROR, SendTarget.ALL_WINDOWS, {
        serverName: serverName || 'unknown',
        installer: 'npm',
        error: error instanceof Error ? error.message : String(error)
      })
      
      // 不抛出错误，因为依赖安装失败不应该阻止仓库下载完成
    }
  }

  /**
   * 检查命令是否可用
   * @param command 命令名称
   * @returns Promise<boolean> 是否可用
   */
  private async isCommandAvailable(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn(command, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      })
      
      checkProcess.on('close', (code) => {
        resolve(code === 0)
      })
      
      checkProcess.on('error', () => {
        resolve(false)
      })
    })
  }

  /**
   * 执行 npm 命令
   * @param command npm 命令
   * @param args 参数
   * @param cwd 工作目录
   * @param serverName 服务器名称（用于事件通知）
   */
  private async executeNpmCommand(command: string, args: string[], cwd?: string, serverName?: string): Promise<string> {
    // 处理命令选择逻辑
    let finalCommand = command
    let finalArgs = [...args]
    
    // 如果是 yarn 命令，直接替换为 bun 或 npm
    if (command === 'yarn') {
      console.log(`[GitDownloadManager] 检测到 yarn，为避免版本冲突，将使用 bun 替代`)
      finalCommand = 'bun'
      // 将 yarn install 转换为 bun install
      if (args[0] === 'install') {
        finalArgs = ['install']
      }
    }
    
    // 如果是 bun 命令，检查是否可用
    if (finalCommand === 'bun') {
      const bunAvailable = await this.isCommandAvailable('bun')
      if (!bunAvailable) {
        console.log(`[GitDownloadManager] bun 不可用，回退到 npm`)
        finalCommand = 'npm'
      } else {
        console.log(`[GitDownloadManager] 使用 bun 安装依赖`)
      }
    }
    
    return new Promise((resolve, reject) => {
      console.log(`[GitDownloadManager] 执行命令: ${finalCommand} ${finalArgs.join(' ')} (在目录: ${cwd})`)
      
      // 为不同的包管理器设置环境变量
      const env = {
        ...process.env,
        // 确保使用系统的 npm 配置
        npm_config_registry: process.env.npm_config_registry || 'https://registry.npmjs.org/'
      }
      
      const npmProcess = spawn(finalCommand, finalArgs, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env
      })

      let stdout = ''
      let stderr = ''

      npmProcess.stdout.on('data', (data) => {
        const output = data.toString()
        stdout += output
        const message = output.trim()
        console.log(`[GitDownloadManager] ${finalCommand} stdout: ${message}`)
        
        // 发送安装进度事件
        if (message && serverName) {
          eventBus.send(GITHUB_DOWNLOAD_EVENTS.NPM_INSTALL_PROGRESS, SendTarget.ALL_WINDOWS, {
            serverName,
            installer: finalCommand,
            output: message
          })
        }
      })

      npmProcess.stderr.on('data', (data) => {
        const output = data.toString()
        stderr += output
        const message = output.trim()
        console.log(`[GitDownloadManager] ${finalCommand} stderr: ${message}`)
        
        // 发送安装进度事件（stderr 也可能包含有用信息）
        if (message && serverName) {
          eventBus.send(GITHUB_DOWNLOAD_EVENTS.NPM_INSTALL_PROGRESS, SendTarget.ALL_WINDOWS, {
            serverName,
            installer: finalCommand,
            output: message
          })
        }
      })

      npmProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[GitDownloadManager] ${finalCommand} 命令执行成功`)
          resolve(stdout)
        } else {
          console.error(`[GitDownloadManager] ${finalCommand} 命令执行失败，退出码: ${code}`)
          
          // 发送安装错误事件
          if (serverName) {
            eventBus.send(GITHUB_DOWNLOAD_EVENTS.NPM_INSTALL_ERROR, SendTarget.ALL_WINDOWS, {
              serverName,
              installer: finalCommand,
              error: `${finalCommand} install failed with code ${code}: ${stderr || stdout}`
            })
          }
          
          reject(new Error(`${finalCommand} command failed with code ${code}: ${stderr || stdout}`))
        }
      })

      npmProcess.on('error', (error) => {
        console.error(`[GitDownloadManager] ${finalCommand} 命令执行错误:`, error)
        
        // 发送安装错误事件
        if (serverName) {
          eventBus.send(GITHUB_DOWNLOAD_EVENTS.NPM_INSTALL_ERROR, SendTarget.ALL_WINDOWS, {
            serverName,
            installer: finalCommand,
            error: `Failed to execute ${finalCommand} command: ${error.message}`
          })
        }
        
        reject(new Error(`Failed to execute ${finalCommand} command: ${error.message}`))
      })
    })
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
   * @param args MCP服务器配置中的args参数，用于确定入口文件
   * @param serverName 服务器名称，用于事件通知
   * @returns Promise<{localPath: string, entryFile: string}> 本地路径和入口文件
   */
  async downloadRepository(githubUrl: string, targetName?: string, args?: string[], serverName?: string): Promise<{ localPath: string; entryFile: string }> {
    console.log(`[GitDownloadManager] 开始下载GitHub仓库: ${githubUrl}${targetName ? ` -> ${targetName}` : ''}`)
    console.log(`[GitDownloadManager] 下载目录: ${this.downloadDir}`)
    
    // 发送下载开始事件
    eventBus.sendToRenderer(MCP_EVENTS.GITHUB_DOWNLOAD_STARTED, SendTarget.ALL_WINDOWS, {
      url: githubUrl,
      targetName: targetName || null
    })
    
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
      // 发送进度事件：开始处理
      eventBus.sendToRenderer(MCP_EVENTS.GITHUB_DOWNLOAD_PROGRESS, SendTarget.ALL_WINDOWS, {
        url: githubUrl,
        stage: 'preparing',
        message: '准备下载...'
      })
      
      // 检查是否需要重命名现有仓库
      if (targetName && targetName !== repo) {
        const originalExists = await this.isRepoExists(originalLocalPath)
        const targetExists = await this.isRepoExists(localPath)
        
        if (originalExists && !targetExists) {
          console.log(`[GitDownloadManager] 重命名仓库: ${originalLocalPath} -> ${localPath}`)
          eventBus.sendToRenderer(MCP_EVENTS.GITHUB_DOWNLOAD_PROGRESS, SendTarget.ALL_WINDOWS, {
            url: githubUrl,
            stage: 'renaming',
            message: '重命名仓库...'
          })
          await fs.rename(originalLocalPath, localPath)
          console.log(`[GitDownloadManager] 重命名完成`)
        } else {
          console.log(`[GitDownloadManager] 无需重命名 - 原始存在:${originalExists}, 目标存在:${targetExists}`)
        }
      }
      
      if (await this.isRepoExists(localPath)) {
        console.log(`[GitDownloadManager] 仓库已存在，更新代码: ${localPath}`)
        
        // 发送进度事件：更新代码
        eventBus.sendToRenderer(MCP_EVENTS.GITHUB_DOWNLOAD_PROGRESS, SendTarget.ALL_WINDOWS, {
          url: githubUrl,
          stage: 'updating',
          message: '更新代码...'
        })
        
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
        
        // 发送进度事件：克隆代码
        eventBus.sendToRenderer(MCP_EVENTS.GITHUB_DOWNLOAD_PROGRESS, SendTarget.ALL_WINDOWS, {
          url: githubUrl,
          stage: 'cloning',
          message: '克隆代码...'
        })
        
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
      
      // 发送进度事件：安装依赖
      eventBus.sendToRenderer(MCP_EVENTS.GITHUB_DOWNLOAD_PROGRESS, SendTarget.ALL_WINDOWS, {
        url: githubUrl,
        stage: 'installing',
        message: '安装依赖...'
      })
      
      // 检查是否需要安装依赖
      await this.installDependenciesIfNeeded(localPath, serverName)
      
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
      
      // 尝试读取 package.json 的 main 字段作为入口文件
      let entryFile = 'index.js'; // 默认入口文件
      
      // 优先从 args 参数中提取入口文件
      if (args && args.length > 0) {
        const firstArg = args[0]
        // 检查第一个参数是否是相对路径的文件名（不包含路径分隔符）
        if (firstArg && !firstArg.includes('/') && !firstArg.includes('\\') && !path.isAbsolute(firstArg)) {
          entryFile = firstArg
          console.log(`[GitDownloadManager] 从 args 中提取入口文件: ${entryFile}`)
        } else if (firstArg) {
          // 如果是绝对路径或包含路径分隔符，提取文件名部分
          entryFile = path.basename(firstArg)
          console.log(`[GitDownloadManager] 从 args 路径中提取文件名: ${entryFile}`)
        }
      } else {
        // 如果没有 args，尝试读取 package.json 的 main 字段
        try {
          const packageJsonPath = path.join(localPath, 'package.json');
          const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
          const packageJson = JSON.parse(packageJsonContent);
          if (packageJson.main && typeof packageJson.main === 'string') {
            entryFile = packageJson.main;
            console.log(`[GitDownloadManager] 从 package.json 中提取入口文件: ${entryFile}`)
          }
        } catch (readError) {
          console.warn(`[GitDownloadManager] Failed to read package.json or main field: ${readError}`);
        }
      }

      // 检查入口文件是否存在，如果不存在则回退到常见文件名检查
      try {
        const entryFilePath = path.join(localPath, entryFile);
        await fs.access(entryFilePath);
        console.log(`[GitDownloadManager] 确认入口文件存在: ${entryFile}`);
      } catch {
        console.log(`[GitDownloadManager] 指定的入口文件不存在: ${entryFile}，回退到常见文件名检查`);
        
        // 检查常见的 MCP 入口文件名，优先级从高到低
        const commonEntryFiles = ['claude-mcp.js', 'mcp.js', 'server.js', 'main.js', 'index.js'];
        const distEntryFiles = ['dist/index.js', 'dist/main.js', 'dist/server.js', 'build/index.js', 'build/main.js', 'build/server.js'];
        let foundEntry = false;
        
        // 首先检查dist/build目录中的入口文件
        for (const fileName of distEntryFiles) {
          try {
            const filePath = path.join(localPath, fileName);
            await fs.access(filePath);
            entryFile = fileName;
            foundEntry = true;
            console.log(`[GitDownloadManager] 找到dist/build目录入口文件: ${fileName}`);
            break;
          } catch {
            // 文件不存在，继续检查下一个
          }
        }
        
        // 如果dist目录中没有找到，再检查根目录的常见入口文件
        if (!foundEntry) {
          for (const fileName of commonEntryFiles) {
            try {
              const filePath = path.join(localPath, fileName);
              await fs.access(filePath);
              entryFile = fileName;
              foundEntry = true;
              console.log(`[GitDownloadManager] 找到根目录入口文件: ${fileName}`);
              break;
            } catch {
              // 文件不存在，继续检查下一个
            }
          }
        }
        
        if (!foundEntry) {
          console.warn(`[GitDownloadManager] 未找到任何常见入口文件，使用默认: ${entryFile}`);
        }
      }
      
      // 发送下载完成事件
      eventBus.sendToRenderer(MCP_EVENTS.GITHUB_DOWNLOAD_COMPLETED, SendTarget.ALL_WINDOWS, {
        url: githubUrl,
        targetName: targetName || null,
        localPath: subPath ? path.join(localPath, subPath) : localPath,
        entryFile
      })
      
      return { localPath: subPath ? path.join(localPath, subPath) : localPath, entryFile };
    } catch (error) {
      console.error(`[GitDownloadManager] 下载GitHub仓库失败:`, error)
      console.error(`[GitDownloadManager] 失败的URL: ${githubUrl}`)
      console.error(`[GitDownloadManager] 目标名称: ${targetName || 'none'}`)
      
      // 发送下载错误事件
      eventBus.sendToRenderer(MCP_EVENTS.GITHUB_DOWNLOAD_ERROR, SendTarget.ALL_WINDOWS, {
        url: githubUrl,
        targetName: targetName || null,
        error: error instanceof Error ? error.message : String(error)
      })
      
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
