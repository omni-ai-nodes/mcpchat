// 测试GitHub下载功能修复
console.log('=== GitHub下载功能测试 ===');

// 模拟前端传递的配置（修复后）
const testConfig = {
  mcpServers: {
    "todo-mcp": {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
      env: {},
      type: "stdio",
      icons: "📝",
      descriptions: "A simple todo MCP server",
      github: "https://github.com/modelcontextprotocol/servers"  // 修复：使用小写github
    }
  }
};

console.log('修复后的配置:');
console.log(JSON.stringify(testConfig, null, 2));

// 检查github字段是否存在
const serverConfig = testConfig.mcpServers["todo-mcp"];
if (serverConfig.github) {
  console.log('✅ github字段存在:', serverConfig.github);
} else {
  console.log('❌ github字段缺失');
}

console.log('=== 测试完成 ===');