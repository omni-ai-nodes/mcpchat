import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { MCPServerConfig } from '@shared/presenter'
import { eventBus } from '@/eventbus'
import { MCP_EVENTS } from '@/events'

// Gallery 配置类型定义
interface GalleryTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

interface GalleryPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

interface GalleryResource {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

interface GalleryServerConfig {
  tools?: GalleryTool[]
  prompts?: GalleryPrompt[]
  resources?: GalleryResource[]
  description?: string
  version?: string
}

/**
 * Gallery MCP服务器管理器
 * 负责将在线安装的gallery MCP服务器转换为本地代码并存储到APP/gallery目录中
 */
export class GalleryManager {
  private galleryPath: string

  constructor() {
    // 获取应用数据目录下的gallery文件夹
    this.galleryPath = path.join(app.getPath('userData'), 'MCPServerGallery')
    this.ensureGalleryDirectory()
  }

  /**
   * 确保gallery目录存在
   */
  private async ensureGalleryDirectory(): Promise<void> {
    try {
      await fs.access(this.galleryPath)
    } catch {
      await fs.mkdir(this.galleryPath, { recursive: true })
      console.log(`Created gallery directory: ${this.galleryPath}`)
    }
  }

  /**
   * 将gallery服务器配置转换为本地代码
   * @param serverName 服务器名称
   * @param serverConfig 服务器配置
   * @param deployJson 部署配置JSON
   */
  async convertToLocalGalleryServer(
    serverName: string,
    serverConfig: MCPServerConfig,
    deployJson: string
  ): Promise<MCPServerConfig> {
    try {
      console.log(`Converting gallery server ${serverName} to local code...`)
      
      // 确保gallery根目录存在
      await this.ensureGalleryDirectory()
      
      // 解析部署配置
      const deployConfig = JSON.parse(deployJson)
      
      // 创建服务器专用目录
      const serverDir = path.join(this.galleryPath, this.sanitizeServerName(serverName))
      await fs.mkdir(serverDir, { recursive: true })
      console.log(`Created server directory: ${serverDir}`)
      
      // 生成本地服务器代码
      const localServerCode = this.generateLocalServerCode(serverName, deployConfig)
      
      // 写入本地服务器文件
      const serverFilePath = path.join(serverDir, 'index.ts')
      await fs.writeFile(serverFilePath, localServerCode, 'utf-8')
      console.log(`Written server code to: ${serverFilePath}`)
      
      // 生成package.json
      const packageJson = this.generatePackageJson(serverName, deployConfig)
      const packageJsonPath = path.join(serverDir, 'package.json')
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8')
      console.log(`Written package.json to: ${packageJsonPath}`)
      
      // 验证文件是否成功创建
      try {
        const indexStats = await fs.stat(serverFilePath)
        const packageStats = await fs.stat(packageJsonPath)
        console.log(`Files created successfully - index.ts: ${indexStats.size} bytes, package.json: ${packageStats.size} bytes`)
      } catch (verifyError) {
        console.error('Failed to verify created files:', verifyError)
      }
      
      // 创建本地化的服务器配置
      const localConfig: MCPServerConfig = {
        ...serverConfig,
        type: 'gallery-local' as const, // 新的类型标识
        command: 'node',
        args: ['--loader', 'ts-node/esm', serverFilePath],
        env: {
          ...serverConfig.env,
          GALLERY_SERVER_DIR: serverDir,
          GALLERY_SERVER_NAME: serverName
        },
        localPath: serverDir, // 添加本地路径信息
        originalDeployJson: deployJson // 保存原始部署配置
      }
      
      console.log(`Gallery server ${serverName} converted to local code at: ${serverDir}`)
      
      // 触发事件通知
      eventBus.emit(MCP_EVENTS.GALLERY_CONVERTED, {
        serverName,
        localPath: serverDir,
        config: localConfig
      })
      
      return localConfig
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Failed to convert gallery server ${serverName}:`, error)
      
      // 触发失败事件通知
      eventBus.emit(MCP_EVENTS.GALLERY_CONVERSION_FAILED, {
        serverName,
        error: errorMessage
      })
      
      throw error
    }
  }

  /**
   * 生成本地服务器代码 - 类似 howtocookServer.ts 的完整结构
   */
  private generateLocalServerCode(
    serverName: string,
    deployConfig: Record<string, unknown>
  ): string {
    const parsedConfig = this.parseGalleryConfig(deployConfig);
    const className = this.generateClassName(serverName);
    
    return `import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport'

/**
 * ${serverName} MCP Server - Generated from Gallery Configuration
 * ${parsedConfig.description || 'Local gallery server providing enhanced functionality'}
 */
export class ${className} {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: '${this.sanitizeServerName(serverName)}',
        version: '${parsedConfig.version || '1.0.0'}'
      },
      {
        capabilities: {
          tools: ${parsedConfig.tools.length > 0 ? '{}' : 'undefined'},
          prompts: ${parsedConfig.prompts.length > 0 ? '{}' : 'undefined'},
          resources: ${parsedConfig.resources.length > 0 ? '{}' : 'undefined'}
        }
      }
    )

    this.setupToolHandlers()
    this.setupErrorHandling()
  }

  private setupToolHandlers(): void {
    ${this.generateToolHandlers(parsedConfig)}
  }

  ${this.generateToolMethods(parsedConfig)}

  ${this.generatePromptMethods(parsedConfig)}

  ${this.generateResourceMethods(parsedConfig)}

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[${serverName} MCP Server] Error:', error)
    }
  }

  public startServer(transport: Transport): void {
    this.server.connect(transport)
  }
}

// ES module compatibility for local execution
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if this module is being run directly
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  
  const server = new ${className}();
  const transport = new StdioServerTransport();
  server.startServer(transport);
  console.error('${serverName} MCP Server started successfully');
}

// Default export for ES modules
export default ${className};
`;
  }

  /**
   * 解析 Gallery 配置，提取工具、提示和资源定义
   */
  private parseGalleryConfig(deployConfig: Record<string, unknown>): {
    tools: GalleryTool[],
    prompts: GalleryPrompt[],
    resources: GalleryResource[],
    description?: string,
    version?: string
  } {
    const result = {
      tools: [] as GalleryTool[],
      prompts: [] as GalleryPrompt[],
      resources: [] as GalleryResource[],
      description: undefined as string | undefined,
      version: undefined as string | undefined
    };

    // 从 mcpServers 配置中提取信息
    if (deployConfig.mcpServers && typeof deployConfig.mcpServers === 'object') {
      Object.values(deployConfig.mcpServers).forEach((serverConfig: GalleryServerConfig) => {
        if (serverConfig.tools && Array.isArray(serverConfig.tools)) {
          result.tools.push(...serverConfig.tools);
        }
        if (serverConfig.prompts && Array.isArray(serverConfig.prompts)) {
          result.prompts.push(...serverConfig.prompts);
        }
        if (serverConfig.resources && Array.isArray(serverConfig.resources)) {
          result.resources.push(...serverConfig.resources);
        }
        if (serverConfig.description) {
          result.description = serverConfig.description;
        }
        if (serverConfig.version) {
          result.version = serverConfig.version;
        }
      });
    }

    return result;
  }

  /**
   * 生成类名
   */
  private generateClassName(serverName: string): string {
    return serverName
      .split(/[-_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('') + 'Server';
  }

  /**
   * 生成工具处理器代码
   */
  private generateToolHandlers(config: { tools: GalleryTool[], prompts: GalleryPrompt[], resources: GalleryResource[] }): string {
    let handlers = '';

    // 工具处理器
    if (config.tools.length > 0) {
      handlers += `    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
${config.tools.map(tool => `          {
            name: '${tool.name}',
            description: '${tool.description || ''}',
            inputSchema: ${JSON.stringify(tool.inputSchema || { type: 'object', properties: {} }, null, 12).replace(/^/gm, '            ')}
          }`).join(',\n')}
        ]
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
${config.tools.map(tool => `          case '${tool.name}':
            return await this.${this.camelCase(tool.name)}(args)`).join('\n')}
          default:
            throw new McpError(ErrorCode.MethodNotFound, \`Unknown tool: \${name}\`)
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          \`Error executing tool \${name}: \${error instanceof Error ? error.message : String(error)}\`
        )
      }
    })

`;
    }

    // 提示处理器
    if (config.prompts.length > 0) {
      handlers += `    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
${config.prompts.map(prompt => `          {
            name: '${prompt.name}',
            description: '${prompt.description || ''}'
          }`).join(',\n')}
        ]
      }
    })

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
${config.prompts.map(prompt => `          case '${prompt.name}':
            return await this.${this.camelCase(prompt.name)}Prompt(args)`).join('\n')}
          default:
            throw new McpError(ErrorCode.MethodNotFound, \`Unknown prompt: \${name}\`)
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          \`Error executing prompt \${name}: \${error instanceof Error ? error.message : String(error)}\`
        )
      }
    })

`;
    }

    // 资源处理器
    if (config.resources.length > 0) {
      handlers += `    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
${config.resources.map(resource => `          {
            uri: '${resource.uri}',
            name: '${resource.name}',
            description: '${resource.description || ''}',
            mimeType: '${resource.mimeType || 'text/plain'}'
          }`).join(',\n')}
        ]
      }
    })

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params

      try {
        switch (uri) {
${config.resources.map(resource => `          case '${resource.uri}':
            return await this.${this.camelCase(resource.name || resource.uri || 'defaultResource')}Resource(uri)`).join('\n')}
          default:
            throw new McpError(ErrorCode.MethodNotFound, \`Unknown resource: \${uri}\`)
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          \`Error reading resource \${uri}: \${error instanceof Error ? error.message : String(error)}\`
        )
      }
    })

`;
    }

    return handlers || '    // No handlers configured';
  }

  /**
   * 生成工具方法
   */
  private generateToolMethods(config: { tools: GalleryTool[] }): string {
    if (config.tools.length === 0) return '';

    return config.tools.map(tool => {
        const methodName = this.camelCase(tool.name);
        const argsType = this.generateArgsType(tool.inputSchema || {});
      
      return `  private async ${methodName}(args: ${argsType}) {
    // TODO: Implement ${tool.name} functionality
    // Description: ${tool.description || 'No description provided'}
    
    return {
      content: [
        {
          type: 'text',
          text: \`Tool '${tool.name}' executed with arguments: \${JSON.stringify(args, null, 2)}\`
        }
      ]
    }
  }`;
    }).join('\n\n');
  }

  /**
   * 生成提示方法
   */
  private generatePromptMethods(config: { prompts: GalleryPrompt[] }): string {
    if (config.prompts.length === 0) return '';

    return config.prompts.map(prompt => {
        const methodName = this.camelCase(prompt.name || 'defaultPrompt') + 'Prompt';
      
      return `  private async ${methodName}(args: any) {
    // TODO: Implement ${prompt.name} prompt functionality
    // Description: ${prompt.description || 'No description provided'}
    
    return {
      description: '${prompt.description || prompt.name}',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: \`Prompt '${prompt.name}' with arguments: \${JSON.stringify(args, null, 2)}\`
          }
        }
      ]
    }
  }`;
    }).join('\n\n');
  }

  /**
   * 生成资源方法
   */
  private generateResourceMethods(config: { resources: GalleryResource[] }): string {
    if (config.resources.length === 0) return '';

    return config.resources.map(resource => {
        const methodName = this.camelCase(resource.name || resource.uri || 'defaultResource') + 'Resource';
      
      return `  private async ${methodName}(uri: string) {
    // TODO: Implement ${resource.name} resource functionality
    // Description: ${resource.description || 'No description provided'}
    
    return {
      contents: [
        {
          uri,
          mimeType: '${resource.mimeType || 'text/plain'}',
          text: \`Resource '${resource.name}' content for URI: \${uri}\`
        }
      ]
    }
  }`;
    }).join('\n\n');
  }

  /**
   * 将字符串转换为驼峰命名
   */
  private camelCase(str: string): string {
    return str
      .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
      .replace(/^[A-Z]/, char => char.toLowerCase());
  }

  /**
   * 生成参数类型定义
   */
  private generateArgsType(inputSchema: Record<string, unknown>): string {
    if (!inputSchema || !inputSchema.properties) {
      return 'any';
    }

    const properties = Object.entries(inputSchema.properties).map(([key, value]: [string, Record<string, unknown>]) => {
      const required = inputSchema.required && Array.isArray(inputSchema.required) ? inputSchema.required : [];
      const optional = !required.includes(key) ? '?' : '';
      let type = 'any';
      
      if (value.type === 'string') type = 'string';
      else if (value.type === 'number') type = 'number';
      else if (value.type === 'boolean') type = 'boolean';
      else if (value.type === 'array') type = 'any[]';
      else if (value.type === 'object') type = 'Record<string, any>';
      
      return `${key}${optional}: ${type}`;
    });

    return `{ ${properties.join('; ')} }`;
  }



  /**
   * 生成package.json
   */
  private generatePackageJson(serverName: string, deployConfig: Record<string, unknown>): Record<string, unknown> {
    return {
      name: `gallery-${this.sanitizeServerName(serverName)}`,
      version: '1.0.0',
      description: `Local gallery server for ${serverName}`,
      main: 'index.ts',
      scripts: {
        start: 'node --loader ts-node/esm index.ts'
      },
      dependencies: {
        '@modelcontextprotocol/sdk': '^1.0.0'
      },
      keywords: ['mcp', 'gallery', 'local'],
      author: 'DeepChat Gallery Manager',
      license: 'MIT',
      galleryConfig: {
        originalName: serverName,
        deployConfig: deployConfig,
        convertedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 清理服务器名称，使其适合作为文件夹名称
   */
  private sanitizeServerName(serverName: string): string {
    return serverName
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 检查服务器是否已经本地化
   */
  async isServerLocalized(serverName: string): Promise<boolean> {
    const serverDir = path.join(this.galleryPath, this.sanitizeServerName(serverName));
    const serverFilePath = path.join(serverDir, 'index.ts');
    console.log('Checking if server is localized:', serverFilePath);
    try {
      await fs.access(serverFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取本地化服务器的路径
   */
  getLocalServerPath(serverName: string): string {
    return path.join(this.galleryPath, this.sanitizeServerName(serverName), 'index.ts');
  }

  /**
   * 删除本地化的服务器
   */
  async removeLocalServer(serverName: string): Promise<void> {
    const serverDir = path.join(this.galleryPath, this.sanitizeServerName(serverName));
    
    try {
      await fs.rm(serverDir, { recursive: true, force: true });
      console.log(`Removed local gallery server: ${serverDir}`);
      
      eventBus.emit(MCP_EVENTS.GALLERY_CONVERTED, {
        serverName,
        localPath: serverDir
      });
    } catch (error) {
      console.error(`Failed to remove local gallery server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * 获取所有本地化的服务器列表
   */
  async getLocalizedServers(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.galleryPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  /**
   * 获取gallery目录路径
   */
  getGalleryPath(): string {
    return this.galleryPath;
  }
}

// 导出单例实例
export const galleryManager = new GalleryManager();