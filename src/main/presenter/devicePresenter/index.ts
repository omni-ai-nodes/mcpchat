import { IDevicePresenter, DeviceInfo, MemoryInfo, DiskInfo } from '../../../shared/presenter'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { app, dialog } from 'electron'
import { nanoid } from 'nanoid'
import axios from 'axios'
const execAsync = promisify(exec)

export class DevicePresenter implements IDevicePresenter {
  static getDefaultHeaders(): Record<string, string> {
    return {
      'HTTP-Referer': 'https://mcpchatai.cn',
      'X-Title': 'McpChat'
    }
  }
  async getAppVersion(): Promise<string> {
    return app.getVersion()
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    return {
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0].model,
      totalMemory: os.totalmem(),
      osVersion: os.release()
    }
  }

  async getCPUUsage(): Promise<number> {
    const startMeasure = os.cpus().map((cpu) => cpu.times)

    // Wait for 100ms to get a meaningful CPU usage measurement
    await new Promise((resolve) => setTimeout(resolve, 100))

    const endMeasure = os.cpus().map((cpu) => cpu.times)

    const idleDifferences = endMeasure.map((end, i) => {
      const start = startMeasure[i]
      const idle = end.idle - start.idle
      const total =
        end.user -
        start.user +
        (end.nice - start.nice) +
        (end.sys - start.sys) +
        (end.irq - start.irq) +
        idle
      return 1 - idle / total
    })

    // Return average CPU usage across all cores
    return (idleDifferences.reduce((sum, idle) => sum + idle, 0) / idleDifferences.length) * 100
  }

  async getMemoryUsage(): Promise<MemoryInfo> {
    const total = os.totalmem()
    const free = os.freemem()
    const used = total - free

    return {
      total,
      free,
      used
    }
  }

  async getDiskSpace(): Promise<DiskInfo> {
    if (process.platform === 'win32') {
      // Windows implementation
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace')
      const lines = stdout.trim().split('\n').slice(1)
      let total = 0
      let free = 0

      lines.forEach((line) => {
        const [freeSpace, size] = line.trim().split(/\s+/).map(Number)
        if (!isNaN(freeSpace) && !isNaN(size)) {
          free += freeSpace
          total += size
        }
      })

      return {
        total,
        free,
        used: total - free
      }
    } else {
      // Unix-like systems implementation
      const { stdout } = await execAsync('df -k /')
      const [, line] = stdout.trim().split('\n')
      const [, total, , used, free] = line.split(/\s+/)

      return {
        total: parseInt(total) * 1024,
        free: parseInt(free) * 1024,
        used: parseInt(used) * 1024
      }
    }
  }

  /**
   * 缓存图片到本地文件系统
   * @param imageData 图片数据，可以是URL或Base64编码
   * @returns 返回以imgcache://协议的图片URL或原始URL（下载失败时）
   */
  async cacheImage(imageData: string): Promise<string> {
    // 如果已经是imgcache协议，直接返回
    if (imageData.startsWith('imgcache://')) {
      return imageData
    }

    // 创建缓存目录
    const cacheDir = path.join(app.getPath('userData'), 'images')
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }

    // 生成唯一的文件名
    const timestamp = Date.now()
    const uniqueId = nanoid(8)
    const fileName = `img_${timestamp}_${uniqueId}`

    // 判断图片类型
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
      // 处理URL图片
      return this.cacheImageFromUrl(imageData, cacheDir, fileName)
    } else if (imageData.startsWith('data:image/')) {
      // 处理Base64图片
      return this.cacheImageFromBase64(imageData, cacheDir, fileName)
    } else {
      console.warn('不支持的图片格式')
      return imageData // 返回原始数据
    }
  }

  /**
   * 从URL下载并缓存图片
   * @param url 图片URL
   * @param cacheDir 缓存目录
   * @param fileName 文件名(不含扩展名)
   * @returns 返回imgcache协议URL或原始URL（下载失败时）
   */
  private async cacheImageFromUrl(
    url: string,
    cacheDir: string,
    fileName: string
  ): Promise<string> {
    try {
      // 使用axios下载图片
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'arraybuffer',
        timeout: 10000 // 10秒超时
      })

      // 获取内容类型并确定文件扩展名
      const contentType = response.headers['content-type'] || 'image/jpeg'
      let extension = 'jpg'

      if (contentType.includes('png')) {
        extension = 'png'
      } else if (contentType.includes('gif')) {
        extension = 'gif'
      } else if (contentType.includes('webp')) {
        extension = 'webp'
      } else if (contentType.includes('svg')) {
        extension = 'svg'
      }

      const saveFileName = `${fileName}.${extension}`
      const fullPath = path.join(cacheDir, saveFileName)

      // 将下载的数据写入文件
      await fs.promises.writeFile(fullPath, Buffer.from(response.data))

      // 返回imgcache协议URL
      return `imgcache://${saveFileName}`
    } catch (error) {
      console.error('下载图片失败:', error)
      // 下载失败时返回原始URL
      return url
    }
  }

  /**
   * 从Base64数据缓存图片
   * @param base64Data Base64编码的图片数据
   * @param cacheDir 缓存目录
   * @param fileName 文件名(不含扩展名)
   * @returns 返回imgcache协议URL或原始数据（处理失败时）
   */
  private async cacheImageFromBase64(
    base64Data: string,
    cacheDir: string,
    fileName: string
  ): Promise<string> {
    try {
      // 解析MIME类型和实际的Base64数据
      const matches = base64Data.match(/^data:([^;]+);base64,(.*)$/)
      if (!matches || matches.length !== 3) {
        console.warn('无效的Base64图片数据')
        return base64Data
      }

      const mimeType = matches[1]
      const base64Content = matches[2]

      // 根据MIME类型确定文件扩展名
      let extension = 'jpg'
      if (mimeType.includes('png')) {
        extension = 'png'
      } else if (mimeType.includes('gif')) {
        extension = 'gif'
      } else if (mimeType.includes('webp')) {
        extension = 'webp'
      } else if (mimeType.includes('svg')) {
        extension = 'svg'
      }

      const saveFileName = `${fileName}.${extension}`
      const fullPath = path.join(cacheDir, saveFileName)

      // 将Base64数据转换为Buffer并保存为图片文件
      const imageBuffer = Buffer.from(base64Content, 'base64')
      await fs.promises.writeFile(fullPath, imageBuffer)

      // 返回imgcache协议URL
      return `imgcache://${saveFileName}`
    } catch (error) {
      console.error('保存Base64图片失败:', error)
      return base64Data // 出错时返回原始数据
    }
  }

  async resetData(): Promise<void> {
    return new Promise((resolve, reject) => {
      const response = dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['确认', '取消'],
        defaultId: 0,
        message: '清除本地的所有数据',
        detail: '注意本操作会导致本地记录彻底删除，你确定么？'
      })
      if (response === 0) {
        try {
          const dbPath = path.join(app.getPath('userData'), 'app_db')
          const removeDirectory = (dirPath: string): void => {
            if (fs.existsSync(dirPath)) {
              fs.readdirSync(dirPath).forEach((file) => {
                const currentPath = path.join(dirPath, file)
                if (fs.lstatSync(currentPath).isDirectory()) {
                  removeDirectory(currentPath)
                } else {
                  fs.unlinkSync(currentPath)
                }
              })
              fs.rmdirSync(dirPath)
            }
          }
          removeDirectory(dbPath)

          app.relaunch()
          app.exit()
          resolve()
        } catch (err) {
          console.error('softReset failed')
          reject(err)
          return
        }
      }
    })
  }

  /**
   * 选择目录
   * @returns 返回所选目录的路径，如果用户取消则返回null
   */
  async selectDirectory(): Promise<{ canceled: boolean; filePaths: string[] }> {
    return dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
  }

  /**
   * 重启应用程序
   */
  restartApp(): Promise<void> {
    console.log('restartApp')
    app.relaunch()
    app.exit()
    return Promise.resolve()
  }
}
