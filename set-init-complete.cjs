// 手动设置 init_complete 标志的脚本
// 运行此脚本可以跳过欢迎页面，直接进入聊天界面

const fs = require('fs')
const path = require('path')
const os = require('os')

function setInitComplete() {
  try {
    // 获取用户数据目录
    const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'mcpchat')
    const configPath = path.join(userDataPath, 'app-settings.json')
    
    console.log('🔍 Looking for config file at:', configPath)
    
    // 检查配置文件是否存在
    if (!fs.existsSync(configPath)) {
      console.log('📁 Config file not found, creating new one...')
      
      // 确保目录存在
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true })
      }
      
      // 创建基本配置
      const defaultConfig = {
        init_complete: true,
        language: 'zh-CN'
      }
      
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
      console.log('✅ Created new config file with init_complete: true')
    } else {
      // 读取现有配置
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      
      // 设置 init_complete 为 true
      configData.init_complete = true
      
      // 写回配置文件
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2))
      console.log('✅ Successfully updated init_complete to true')
    }
    
    console.log('📁 Config file location:', configPath)
    console.log('🔄 Please restart the application to see the changes')
    
    // 显示当前配置状态
    const finalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    console.log('\n📋 Current settings:')
    console.log('- init_complete:', finalConfig.init_complete)
    console.log('- language:', finalConfig.language || 'not set')
    
  } catch (error) {
    console.error('❌ Error setting init_complete:', error)
    process.exit(1)
  }
}

// 运行脚本
setInitComplete()