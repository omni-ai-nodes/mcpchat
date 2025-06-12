import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport'

/**
 * HowToCook MCP Server - 基于 Anduin2017/HowToCook 的菜谱推荐服务器
 * 帮助推荐菜谱、规划膳食，解决"今天吃什么"的问题
 */
export class HowToCookServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'howtocook-mcp',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )

    this.setupToolHandlers()
    this.setupErrorHandling()
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_recipes',
            description: '搜索菜谱，根据食材、菜名或类型查找相关菜谱',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: '搜索关键词，可以是食材名、菜名或菜系类型'
                },
                category: {
                  type: 'string',
                  description: '菜谱分类，如：家常菜、素食、汤品等',
                  enum: ['家常菜', '素食', '汤品', '甜品', '小食', '饮品']
                }
              },
              required: ['query']
            }
          },
          {
            name: 'get_recipe_detail',
            description: '获取具体菜谱的详细制作步骤和食材清单',
            inputSchema: {
              type: 'object',
              properties: {
                recipe_name: {
                  type: 'string',
                  description: '菜谱名称'
                }
              },
              required: ['recipe_name']
            }
          },
          {
            name: 'recommend_daily_menu',
            description: '推荐每日菜单，根据偏好和营养需求规划膳食',
            inputSchema: {
              type: 'object',
              properties: {
                preferences: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '饮食偏好，如：清淡、重口味、素食等'
                },
                meal_count: {
                  type: 'number',
                  description: '一日餐数，默认为3（早中晚）',
                  default: 3
                }
              }
            }
          }
        ]
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'search_recipes':
            return await this.searchRecipes(args as { query: string; category?: string })
          case 'get_recipe_detail':
            return await this.getRecipeDetail(args as { recipe_name: string })
          case 'recommend_daily_menu':
            return await this.recommendDailyMenu(args as { preferences?: string[]; meal_count?: number })
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  }

  private async searchRecipes(args: { query: string; category?: string }) {
    // 模拟菜谱搜索功能
    const mockRecipes = [
      { name: '西红柿炒鸡蛋', category: '家常菜', difficulty: '简单', time: '15分钟' },
      { name: '麻婆豆腐', category: '家常菜', difficulty: '中等', time: '20分钟' },
      { name: '青椒肉丝', category: '家常菜', difficulty: '简单', time: '18分钟' },
      { name: '红烧肉', category: '家常菜', difficulty: '中等', time: '45分钟' },
      { name: '蒸蛋羹', category: '家常菜', difficulty: '简单', time: '12分钟' }
    ]

    const filteredRecipes = mockRecipes.filter(recipe => 
      recipe.name.includes(args.query) || 
      (args.category && recipe.category === args.category)
    )

    return {
      content: [
        {
          type: 'text',
          text: `找到 ${filteredRecipes.length} 个相关菜谱：\n\n${filteredRecipes.map(recipe => 
            `• ${recipe.name} (${recipe.category}) - 难度：${recipe.difficulty}，用时：${recipe.time}`
          ).join('\n')}`
        }
      ]
    }
  }

  private async getRecipeDetail(args: { recipe_name: string }) {
    // 模拟获取菜谱详情
    const mockRecipeDetails = {
      '西红柿炒鸡蛋': {
        ingredients: ['鸡蛋 3个', '西红柿 2个', '葱花 适量', '盐 适量', '糖 少许', '食用油 适量'],
        steps: [
          '1. 鸡蛋打散，加少许盐调味',
          '2. 西红柿切块，去皮备用',
          '3. 热锅下油，倒入蛋液炒熟盛起',
          '4. 锅内留底油，下西红柿块炒出汁水',
          '5. 加入炒蛋，调味炒匀即可'
        ],
        tips: '西红柿要充分炒出汁水，这样味道更浓郁'
      }
    }

    const detail = mockRecipeDetails[args.recipe_name as keyof typeof mockRecipeDetails]
    
    if (!detail) {
      return {
        content: [
          {
            type: 'text',
            text: `抱歉，暂时没有找到「${args.recipe_name}」的详细菜谱。`
          }
        ]
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `## ${args.recipe_name}\n\n**食材清单：**\n${detail.ingredients.map(ing => `• ${ing}`).join('\n')}\n\n**制作步骤：**\n${detail.steps.join('\n')}\n\n**小贴士：**\n${detail.tips}`
        }
      ]
    }
  }

  private async recommendDailyMenu(args: { preferences?: string[]; meal_count?: number }) {
    const mealCount = args.meal_count || 3
    const preferences = args.preferences || []
    
    // 模拟菜单推荐
    const mockMenus = {
      breakfast: ['小米粥 + 咸菜', '豆浆 + 油条', '牛奶 + 面包', '蒸蛋羹 + 馒头'],
      lunch: ['西红柿炒鸡蛋 + 米饭', '麻婆豆腐 + 米饭', '青椒肉丝 + 米饭', '红烧肉 + 米饭'],
      dinner: ['清汤面条', '蒸蛋羹 + 小菜', '简单汤品 + 馒头', '粥类 + 小菜']
    }

    let menu = ''
    if (mealCount >= 1) menu += `**早餐：** ${mockMenus.breakfast[Math.floor(Math.random() * mockMenus.breakfast.length)]}\n`
    if (mealCount >= 2) menu += `**午餐：** ${mockMenus.lunch[Math.floor(Math.random() * mockMenus.lunch.length)]}\n`
    if (mealCount >= 3) menu += `**晚餐：** ${mockMenus.dinner[Math.floor(Math.random() * mockMenus.dinner.length)]}\n`

    const prefText = preferences.length > 0 ? `\n根据您的偏好（${preferences.join('、')}）为您推荐：` : ''

    return {
      content: [
        {
          type: 'text',
          text: `## 今日菜单推荐${prefText}\n\n${menu}\n💡 **小提示：** 记得搭配蔬菜和水果，保持营养均衡哦！`
        }
      ]
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[HowToCook MCP Server] Error:', error)
    }
  }

  public startServer(transport: Transport): void {
    this.server.connect(transport)
  }
}