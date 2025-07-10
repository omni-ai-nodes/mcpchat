import mysql, { Pool, PoolConnection } from 'mysql2/promise'

export interface DatabaseConfig {
  dbType: 'mysql' | 'postgresql'
  host: string
  port: number
  database: string
  username: string
  password: string
  sql?: string
}

export interface DatabaseResult {
  success: boolean
  message: string
  data?: unknown
  error?: string
  connectionTime?: number
  queryTime?: number
}

export class DatabasePresenter {
  private pools: Map<string, Pool> = new Map()

  constructor() {
    // 初始化数据库连接管理器
  }

  // 创建数据库连接池
  private createMySQLPool(config: DatabaseConfig): Pool {
    const poolKey = `${config.host}:${config.port}:${config.database}:${config.username}`
    
    if (this.pools.has(poolKey)) {
      return this.pools.get(poolKey)!
    }

    const pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000
    })

    this.pools.set(poolKey, pool)
    return pool
  }

  // 测试数据库连接
  private async testMySQLConnection(config: DatabaseConfig): Promise<void> {
    const pool = this.createMySQLPool(config)
    const connection = await pool.getConnection()
    try {
      await connection.ping()
    } finally {
      connection.release()
    }
  }

  // 执行SQL查询
  private async executeMySQLQuery(config: DatabaseConfig, sql: string): Promise<unknown> {
    const pool = this.createMySQLPool(config)
    const connection = await pool.getConnection()
    try {
      const [rows] = await connection.execute(sql)
      return rows
    } finally {
      connection.release()
    }
  }



  // 测试数据库连接并执行查询
  async testConnection(config: DatabaseConfig): Promise<DatabaseResult> {
    const startTime = Date.now()
    
    try {
      console.log('开始测试数据库连接...', config)
      
      // 验证必要参数
      if (!config.host || !config.port || !config.database || !config.username) {
        return {
          success: false,
          message: '缺少必要的数据库连接参数',
          error: 'MISSING_PARAMS'
        }
      }
      
      // 测试数据库连接
      const connectionStartTime = Date.now()
      if (config.dbType === 'mysql') {
        await this.testMySQLConnection(config)
      } else {
        throw new Error(`不支持的数据库类型: ${config.dbType}`)
      }
      const connectionTime = Date.now() - connectionStartTime
      
      console.log('数据库连接成功，开始执行查询...')
      
      const result: DatabaseResult = {
        success: true,
        message: '数据库连接成功',
        connectionTime
      }
      
      // 如果有SQL查询，执行查询
      if (config.sql && config.sql.trim()) {
        const queryStartTime = Date.now()
        const sqlQuery = config.sql.trim()
        let queryResult: unknown
        
        if (config.dbType === 'mysql') {
          queryResult = await this.executeMySQLQuery(config, sqlQuery)
        } else {
          throw new Error(`不支持的数据库类型: ${config.dbType}`)
        }
        
        const queryTime = Date.now() - queryStartTime
        
        result.data = queryResult
        result.message = '数据库连接成功，查询执行完成'
        result.queryTime = queryTime
        
        console.log('查询执行成功，结果:', queryResult)
      }
      
      return result
      
    } catch (error: unknown) {
      console.error('数据库连接测试失败:', error)
      
      let errorMessage = '数据库连接失败'
      
      if (error && typeof error === 'object') {
        const err = error as { code?: string; sqlMessage?: string; message?: string }
        
        if (err.code === 'ECONNREFUSED') {
          errorMessage = '无法连接到数据库服务器，请检查主机地址和端口'
        } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
          errorMessage = '数据库访问被拒绝，请检查用户名和密码'
        } else if (err.code === 'ER_BAD_DB_ERROR') {
          errorMessage = '指定的数据库不存在'
        } else if (err.code === 'ETIMEDOUT') {
          errorMessage = '数据库连接超时'
        } else if (err.sqlMessage) {
          errorMessage = `SQL语法错误: ${err.sqlMessage}`
        } else if (err.message) {
          errorMessage = err.message
        }
      }
      
      return {
        success: false,
        message: '数据库连接失败',
        error: errorMessage
      }
    }
  }

  // 清理资源（模拟实现）
  async destroy(): Promise<void> {
    console.log('数据库连接管理器已清理')
  }
}