import { app, protocol, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { presenter } from './presenter'
import { ProxyMode, proxyConfig } from './presenter/proxyConfig'
import path from 'path'
import fs from 'fs'
import { spawn, spawnSync } from 'child_process'
import { eventBus } from './eventbus'
import { WINDOW_EVENTS, TRAY_EVENTS } from './events'
import { setLoggingEnabled } from '@shared/logger'
import { is } from '@electron-toolkit/utils' // 确保导入 is

// 设置应用命令行参数
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required') // 允许视频自动播放
app.commandLine.appendSwitch('webrtc-max-cpu-consumption-percentage', '100') // 设置 WebRTC 最大 CPU 占用率
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096') // 设置 V8 堆内存大小
app.commandLine.appendSwitch('ignore-certificate-errors') // 忽略证书错误 (开发或特定场景下使用)

// 根据平台设置特定命令行参数
if (process.platform == 'win32') {
  // Windows 平台特定参数 (目前注释掉)
  // app.commandLine.appendSwitch('in-process-gpu')
  // app.commandLine.appendSwitch('wm-window-animations-disabled')
}
if (process.platform === 'darwin') {
  // macOS 平台特定参数
  app.commandLine.appendSwitch('disable-features', 'DesktopCaptureMacV2,IOSurfaceCapturer')
}

// 初始化 DeepLink 处理
presenter.deeplinkPresenter.init()

// 等待 Electron 初始化完成
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.wefonk.mcpchat')

  // 从配置中读取日志设置并应用
  const loggingEnabled = presenter.configPresenter.getLoggingEnabled()
  setLoggingEnabled(loggingEnabled)

  // 初始化托盘图标和菜单，并存储 presenter 实例
  presenter.setupTray()

  // 从配置中读取代理设置并初始化
  const proxyMode = presenter.configPresenter.getProxyMode() as ProxyMode
  const customProxyUrl = presenter.configPresenter.getCustomProxyUrl()
  // 异步初始化代理配置，避免阻塞应用启动
  await proxyConfig.initFromConfig(proxyMode as ProxyMode, customProxyUrl).catch(error => {
    console.warn('Proxy initialization failed:', error)
  })

  // 在开发环境中为新创建的窗口添加 F12 DevTools 支持，生产环境忽略 CmdOrControl + R
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 处理应用激活事件 (如 macOS 点击 Dock 图标)
  app.on('activate', function () {
    // 在 macOS 上，点击 Dock 图标时重新创建窗口很常见
    // 同时处理已隐藏窗口的显示
    const allWindows = presenter.windowPresenter.getAllWindows()
    if (allWindows.length === 0) {
      presenter.windowPresenter.createShellWindow({
        initialTab: {
          url: 'local://chat'
        }
      })
    } else {
      // 尝试显示最近焦点的窗口，否则显示第一个窗口
      const targetWindow = presenter.windowPresenter.getFocusedWindow() || allWindows[0]
      if (!targetWindow.isDestroyed()) {
        targetWindow.show()
        targetWindow.focus() // 确保窗口获得焦点
      } else {
        console.warn('App activated but target window is destroyed, creating new window.') // 保持 warn
        presenter.windowPresenter.createShellWindow({
          // 如果目标窗口已销毁，创建新窗口
          initialTab: { url: 'local://chat' }
        })
      }
    }
  })

  // 如果没有窗口，创建主窗口 (应用首次启动时)
  if (presenter.windowPresenter.getAllWindows().length === 0) {
    presenter.windowPresenter.createShellWindow({
      initialTab: {
        url: 'local://chat'
      }
    })
  }

  // 注册全局快捷键
  presenter.shortcutPresenter.registerShortcuts()

  // 监听显示/隐藏窗口事件 (从托盘或快捷键触发)
  eventBus.on(TRAY_EVENTS.SHOW_HIDDEN_WINDOW, (trayClick: boolean) => {
    const allWindows = presenter.windowPresenter.getAllWindows()
    if (allWindows.length === 0) {
      presenter.windowPresenter.createShellWindow({
        initialTab: {
          url: 'local://chat'
        }
      })
    } else {
      // 查找目标窗口 (焦点窗口或第一个窗口)
      const targetWindow = presenter.windowPresenter.getFocusedWindow() || allWindows[0]

      if (!targetWindow.isDestroyed()) {
        // 逻辑: 如果窗口可见且不是从托盘点击触发，则隐藏；否则显示并置顶
        if (targetWindow.isVisible() && !trayClick) {
          presenter.windowPresenter.hide(targetWindow.id)
        } else {
          presenter.windowPresenter.show(targetWindow.id)
          targetWindow.focus() // 确保窗口置顶
        }
      } else {
        console.warn('Target window for SHOW_HIDDEN_WINDOW event is destroyed.') // 保持 warn
        // 如果目标窗口已销毁，创建新窗口
        presenter.windowPresenter.createShellWindow({
          initialTab: {
            url: 'local://chat'
          }
        })
      }
    }
  })

  // 监听浏览器窗口获得焦点事件
  app.on('browser-window-focus', () => {
    // 当任何窗口获得焦点时，注册快捷键
    presenter.shortcutPresenter.registerShortcuts()
    eventBus.sendToMain(WINDOW_EVENTS.APP_FOCUS)
  })

  // 监听浏览器窗口失去焦点事件
  app.on('browser-window-blur', () => {
    // 检查是否所有窗口都已失去焦点，如果是则注销快捷键
    // 使用短延迟以处理窗口间焦点切换
    setTimeout(() => {
      const allWindows = presenter.windowPresenter.getAllWindows()
      const isAnyWindowFocused = allWindows.some((win) => !win.isDestroyed() && win.isFocused())

      if (!isAnyWindowFocused) {
        presenter.shortcutPresenter.unregisterShortcuts()
        eventBus.sendToMain(WINDOW_EVENTS.APP_BLUR)
      }
    }, 50) // 50毫秒延迟
  })

  // 注册 'deepcdn' 协议，用于加载应用内置资源 (模拟 CDN)
  protocol.handle('deepcdn', (request) => {
    try {
      const filePath = request.url.slice('deepcdn://'.length)
      // 根据开发/生产环境确定资源路径
      const resourcesPath = is.dev
        ? path.join(app.getAppPath(), 'resources')
        : process.resourcesPath
      // 检查资源是否被解包 (app.asar.unpacked)，优先使用解包路径
      const unpackedResourcesPath = path.join(resourcesPath, 'app.asar.unpacked', 'resources')

      const baseResourcesDir = fs.existsSync(unpackedResourcesPath)
        ? unpackedResourcesPath
        : path.join(resourcesPath, 'resources') // 否则使用默认资源路径

      const fullPath = path.join(baseResourcesDir, 'cdn', filePath)

      // 根据文件扩展名决定 MIME 类型
      let mimeType = 'application/octet-stream' // 默认类型
      if (filePath.endsWith('.js')) {
        mimeType = 'text/javascript'
      } else if (filePath.endsWith('.css')) {
        mimeType = 'text/css'
      } else if (filePath.endsWith('.json')) {
        mimeType = 'application/json'
      } else if (filePath.endsWith('.wasm')) {
        mimeType = 'application/wasm'
      } else if (filePath.endsWith('.data')) {
        mimeType = 'application/octet-stream'
      } else if (filePath.endsWith('.html')) {
        mimeType = 'text/html'
      }

      // 检查文件是否存在
      if (!fs.existsSync(fullPath)) {
        console.warn(`deepcdn handler: File not found: ${fullPath}`) // 保持 warn
        return new Response(`找不到文件: ${filePath}`, {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        })
      }

      // 读取文件并返回响应
      const fileContent = fs.readFileSync(fullPath)
      return new Response(fileContent, {
        headers: { 'Content-Type': mimeType }
      })
    } catch (error: unknown) {
      console.error('处理deepcdn请求时出错:', error) // 保持 error
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(`服务器错误: ${errorMessage}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      })
    }
  })

  // 注册 'imgcache' 协议，用于处理图片缓存
  protocol.handle('imgcache', (request) => {
    try {
      const filePath = request.url.slice('imgcache://'.length)
      // 图片存储在用户数据目录的 images 子文件夹中
      const fullPath = path.join(app.getPath('userData'), 'images', filePath)

      // 检查文件是否存在
      if (!fs.existsSync(fullPath)) {
        console.warn(`imgcache handler: Image file not found: ${fullPath}`) // 保持 warn
        return new Response(`找不到图片: ${filePath}`, {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        })
      }

      // 根据文件扩展名确定 MIME 类型
      let mimeType = 'application/octet-stream' // 默认类型
      if (filePath.endsWith('.png')) {
        mimeType = 'image/png'
      } else if (filePath.endsWith('.gif')) {
        mimeType = 'image/gif'
      } else if (filePath.endsWith('.webp')) {
        mimeType = 'image/webp'
      } else if (filePath.endsWith('.svg')) {
        mimeType = 'image/svg+xml'
      } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
        mimeType = 'image/jpeg'
      } else if (filePath.endsWith('.bmp')) {
        mimeType = 'image/bmp'
      } else if (filePath.endsWith('.ico')) {
        mimeType = 'image/x-icon'
      } else if (filePath.endsWith('.avif')) {
        mimeType = 'image/avif'
      }

      // 读取文件并返回响应
      const fileContent = fs.readFileSync(fullPath)
      return new Response(fileContent, {
        headers: { 'Content-Type': mimeType }
      })
    } catch (error: unknown) {
      console.error('处理imgcache请求时出错:', error) // 保持 error
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(`服务器错误: ${errorMessage}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      })
    }
  })

  // 注册 'api' 协议，用于处理内部API请求
  protocol.handle('api', async (request) => {
    try {
      const url = new URL(request.url)
      const pathname = url.pathname
      
      // 处理数据库测试API
      if (pathname === '/database/test' && request.method === 'POST') {
        const body = await request.text()
        const config = JSON.parse(body)
        
        const result = await presenter.databasePresenter.testConnection(config)
        
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      // 未找到的API路径
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'API路径不存在' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
      
    } catch (error: unknown) {
      console.error('处理API请求时出错:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({ 
        success: false, 
        error: `服务器错误: ${errorMessage}` 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  })

  // 注册 IPC 处理程序用于打开终端
  ipcMain.handle('get-mcp-server-path', async (_, serverName: string) => {
    try {
      const configPresenter = presenter.configPresenter
      const mcpServers = await configPresenter.getMcpServers()
      
      // 查找匹配的服务器配置（支持模糊匹配）
      let serverConfig = mcpServers[serverName]
      
      // 如果直接匹配失败，尝试通过显示名称查找
      if (!serverConfig) {
        const servers = Object.entries(mcpServers)
        const found = servers.find(([key, config]) => 
          key === serverName || 
          (config as any).displayName === serverName ||
          key.toLowerCase().includes(serverName.toLowerCase()) ||
          (config as any).name === serverName
        )
        if (found) {
          serverConfig = found[1]
        }
      }
      
      if (!serverConfig) {
        // 如果没有找到配置，回退到基于名称的目录查找
        console.warn(`服务器 ${serverName} 未在配置中找到，尝试基于名称的目录查找`)
        
        // 清理服务器名称，移除特殊字符
        const cleanName = serverName.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()
        const userDataPath = app.getPath('userData')
        const mcpServersPath = path.join(userDataPath, 'mcp-git-repos')
        
        // 列出所有已下载的目录
        if (fs.existsSync(mcpServersPath)) {
          const dirs = fs.readdirSync(mcpServersPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
          
          // 查找匹配的目录
          const matchedDir = dirs.find(dir => 
            dir.toLowerCase().includes(cleanName) ||
            cleanName.includes(dir.toLowerCase())
          )
          
          if (matchedDir) {
            const repoPath = path.join(mcpServersPath, matchedDir)
            console.log(`找到匹配的目录: ${repoPath}`)
            return repoPath
          }
        }
        
        // 最后回退到原始名称
        const fallbackPath = path.join(mcpServersPath, cleanName)
        if (!fs.existsSync(fallbackPath)) {
          fs.mkdirSync(fallbackPath, { recursive: true })
        }
        return fallbackPath
      }
      
      // 从配置中提取本地仓库路径
      if (serverConfig.args && serverConfig.args.length > 0) {
        const scriptPath = serverConfig.args[0]
        if (scriptPath && typeof scriptPath === 'string') {
          // 处理GitHub下载的仓库路径
          if (scriptPath.includes('mcp-git-repos')) {
            const repoDir = path.dirname(scriptPath)
            if (fs.existsSync(repoDir)) {
              return repoDir
            }
          }
          
          // 处理绝对路径
          if (path.isAbsolute(scriptPath)) {
            return path.dirname(scriptPath)
          }
        }
      }
      
      // 处理GitHub仓库的情况
      if (serverConfig.github) {
        const githubUrl = serverConfig.github
        const repoName = githubUrl.split('/').pop()?.replace('.git', '') || serverName
        const userDataPath = app.getPath('userData')
        const repoPath = path.join(userDataPath, 'mcp-git-repos', repoName)
        
        if (fs.existsSync(repoPath)) {
          return repoPath
        }
      }
      
      // 默认回退
      const userDataPath = app.getPath('userData')
      const mcpServersPath = path.join(userDataPath, 'mcp-git-repos')
      const serverPath = path.join(mcpServersPath, serverName)
      
      if (!fs.existsSync(serverPath)) {
        fs.mkdirSync(serverPath, { recursive: true })
      }
      
      return serverPath
    } catch (error) {
      console.error('获取 MCP 服务器路径失败:', error)
      throw error
    }
  })

  ipcMain.handle('open-terminal', async (_, workDir: string) => {
    try {
      if (!fs.existsSync(workDir)) {
        throw new Error(`工作目录不存在: ${workDir}`)
      }

      const platform = process.platform
      let terminalCommand: string
      let args: string[]

      switch (platform) {
        case 'darwin': // macOS
          terminalCommand = 'open'
          args = ['-a', 'Terminal', workDir]
          break
        case 'win32': // Windows
          terminalCommand = 'cmd'
          args = ['/c', 'start', 'cmd', '/k', `cd /d "${workDir}"`]
          break
        case 'linux': { // Linux
          // 尝试常见的 Linux 终端
          const terminals = ['gnome-terminal', 'konsole', 'x-terminal-emulator', 'xterm']
          terminalCommand = terminals.find(term => {
            try {
              const result = spawnSync('which', [term], { stdio: 'pipe' })
              return result.status === 0
            } catch {
              return false
            }
          }) || 'xterm'
          args = ['--working-directory', workDir]
          break
        }
        default:
          throw new Error(`不支持的平台: ${platform}`)
      }

      const child = spawn(terminalCommand, args, {
        detached: true,
        stdio: 'ignore'
      })

      child.unref()
      
      return { success: true, terminal: terminalCommand, directory: workDir }
    } catch (error) {
      console.error('打开终端失败:', error)
      throw error
    }
  })
}) // app.whenReady().then 结束

// 当所有窗口都关闭时，不退出应用。macOS 平台会保留在 Dock 中，Windows 会保留在托盘。
// 用户需要通过托盘菜单或 Cmd+Q 来真正退出应用。
// 因此移除 'window-all-closed' 事件监听
/*
app.on('window-all-closed', () => {
  presenter.destroy()
  // trayPresenter.destroy() // <-- 已移动到 will-quit
})
*/

// 在应用即将退出时触发，适合进行最终的资源清理 (如销毁托盘)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.on('will-quit', (_event) => {
  console.log('main: app will-quit event triggered.') // 保留关键日志

  // 销毁托盘图标
  if (presenter.trayPresenter) {
    console.log('main: Destroying tray during will-quit.') // 保留关键日志
    presenter.trayPresenter.destroy()
  } else {
    console.warn('main: TrayPresenter not found in presenter during will-quit.') // 保持 warn
  }

  // 调用 presenter 的销毁方法进行其他清理
  if (presenter.destroy) {
    console.log('main: Calling presenter.destroy() during will-quit.') // 保留关键日志
    presenter.destroy()
  }
})

// 在应用退出之前触发，早于 will-quit。通常不如 will-quit 适合资源清理。
// 移除在此处销毁托盘的逻辑。
app.on('before-quit', () => {
  console.log('main: app before-quit event triggered.') // 保留关键日志
  // presenter.destroy() // 如果需要在 will-quit 之前清理 presenter，可以保留
  // trayPresenter.destroy() // <-- 从此处移除托盘销毁
})
