// 测试 args 参数入口文件提取功能
import path from 'path';

console.log('=== Args 参数入口文件提取测试 ===');

// 模拟 GitDownloadManager 的入口文件提取逻辑
function extractEntryFileFromArgs(args) {
  
  if (!args || args.length === 0) {
    console.log('  ❌ 没有 args 参数');
    return null;
  }
  
  const firstArg = args[0];
  console.log(`  📝 第一个 arg: ${firstArg}`);
  
  // 检查第一个参数是否是相对路径的文件名（不包含路径分隔符）
  if (firstArg && !firstArg.includes('/') && !firstArg.includes('\\') && !path.isAbsolute(firstArg)) {
    console.log(`  ✅ 从 args 中提取入口文件: ${firstArg}`);
    return firstArg;
  } else if (firstArg) {
    // 如果是绝对路径或包含路径分隔符，提取文件名部分
    const basename = path.basename(firstArg);
    console.log(`  ✅ 从 args 路径中提取文件名: ${basename}`);
    return basename;
  }
  
  return null;
}

// 测试用例
const testCases = [
  {
    name: 'todo-mcp 服务器配置',
    args: ['claude-mcp.js'],
    expected: 'claude-mcp.js'
  },
  {
    name: '带路径的配置',
    args: ['/path/to/server.js'],
    expected: 'server.js'
  },
  {
    name: '相对路径配置',
    args: ['./src/main.js'],
    expected: 'main.js'
  },
  {
    name: '空 args',
    args: [],
    expected: null
  },
  {
    name: '多个 args',
    args: ['mcp.js', '--port', '3000'],
    expected: 'mcp.js'
  }
];

console.log('\n🧪 开始测试...\n');

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`);
  console.log(`  输入 args: [${testCase.args.map(arg => `'${arg}'`).join(', ')}]`);
  
  const result = extractEntryFileFromArgs(testCase.args);
  const passed = result === testCase.expected;
  
  console.log(`  期望结果: ${testCase.expected}`);
  console.log(`  实际结果: ${result}`);
  console.log(`  测试结果: ${passed ? '✅ 通过' : '❌ 失败'}`);
  console.log('');
});

console.log('=== 测试完成 ===');