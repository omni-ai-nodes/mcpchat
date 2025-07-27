/**
 * 事件系统常量定义
 * 看似这里和 main/events.ts 重复了，其实不然，这里只包含了main上来给renderer的事件
 *
 * 按功能领域分类事件名，采用统一的命名规范：
 * - 使用冒号分隔域和具体事件
 * - 使用小写并用连字符连接多个单词
 */

// 配置相关事件
export const CONFIG_EVENTS = {
  PROVIDER_CHANGED: 'config:provider-changed', // 替代 provider-setting-changed
  MODEL_LIST_CHANGED: 'config:model-list-changed', // 替代 provider-models-updated（ConfigPresenter）
  MODEL_STATUS_CHANGED: 'config:model-status-changed', // 替代 model-status-changed（ConfigPresenter）
  SETTING_CHANGED: 'config:setting-changed', // 替代 setting-changed（ConfigPresenter）
  PROXY_MODE_CHANGED: 'config:proxy-mode-changed',
  CUSTOM_PROXY_URL_CHANGED: 'config:custom-proxy-url-changed',
  SYNC_SETTINGS_CHANGED: 'config:sync-settings-changed',
  SEARCH_ENGINES_UPDATED: 'config:search-engines-updated',
  CONTENT_PROTECTION_CHANGED: 'config:content-protection-changed',
  LANGUAGE_CHANGED: 'config:language-changed', // 新增：语言变更事件
  SOUND_ENABLED_CHANGED: 'config:sound-enabled-changed', // 新增：声音启用状态变更事件
  COPY_WITH_COT_CHANGED: 'config:copy-with-cot-enabled-changed'
}

// 会话相关事件
export const CONVERSATION_EVENTS = {
  ACTIVATED: 'conversation:activated', // 替代 conversation-activated
  DEACTIVATED: 'conversation:deactivated', // 替代 active-conversation-cleared
  MESSAGE_EDITED: 'conversation:message-edited' // 替代 message-edited
}

// 通信相关事件
export const STREAM_EVENTS = {
  RESPONSE: 'stream:response', // 替代 stream-response
  END: 'stream:end', // 替代 stream-end
  ERROR: 'stream:error' // 替代 stream-error
}

// 应用更新相关事件
export const UPDATE_EVENTS = {
  STATUS_CHANGED: 'update:status-changed', // 替代 update-status-changed
  ERROR: 'update:error', // 替代 update-error
  PROGRESS: 'update:progress', // 下载进度
  WILL_RESTART: 'update:will-restart' // 准备重启
}

// 窗口相关事件
export const WINDOW_EVENTS = {
  READY_TO_SHOW: 'window:ready-to-show', // 替代 main-window-ready-to-show
  FORCE_QUIT_APP: 'window:force-quit-app', // 替代 force-quit-app
  APP_FOCUS: 'app:focus',
  APP_BLUR: 'app:blur'
}

// ollama 相关事件
export const OLLAMA_EVENTS = {
  PULL_MODEL_PROGRESS: 'ollama:pull-model-progress'
}
// MCP 相关事件
export const MCP_EVENTS = {
  SERVER_STARTED: 'mcp:server-started',
  SERVER_STOPPED: 'mcp:server-stopped',
  CONFIG_CHANGED: 'mcp:config-changed',
  TOOL_CALL_RESULT: 'mcp:tool-call-result',
  SERVER_STATUS_CHANGED: 'mcp:server-status-changed',
  CACHE_UPDATED: 'mcp:cache-updated', // 新增：本地缓存更新事件
  GITHUB_DOWNLOAD_STARTED: 'mcp:github-download-started', // GitHub下载开始
  GITHUB_DOWNLOAD_PROGRESS: 'mcp:github-download-progress', // GitHub下载进度
  GITHUB_DOWNLOAD_COMPLETED: 'mcp:github-download-completed', // GitHub下载完成
  GITHUB_DOWNLOAD_ERROR: 'mcp:github-download-error' // GitHub下载错误
}

// GitHub 下载相关事件
export const GITHUB_DOWNLOAD_EVENTS = {
  NPM_INSTALL_STARTED: 'mcp:npm-install-started', // npm install 开始
  NPM_INSTALL_PROGRESS: 'mcp:npm-install-progress', // npm install 进度
  NPM_INSTALL_COMPLETED: 'mcp:npm-install-completed', // npm install 完成
  NPM_INSTALL_ERROR: 'mcp:npm-install-error' // npm install 错误
}
// 同步相关事件
export const SYNC_EVENTS = {
  BACKUP_STARTED: 'sync:backup-started',
  BACKUP_COMPLETED: 'sync:backup-completed',
  BACKUP_ERROR: 'sync:backup-error',
  IMPORT_STARTED: 'sync:import-started',
  IMPORT_COMPLETED: 'sync:import-completed',
  IMPORT_ERROR: 'sync:import-error',
  DATA_CHANGED: 'sync:data-changed'
}

// DeepLink 相关事件
export const DEEPLINK_EVENTS = {
  PROTOCOL_RECEIVED: 'deeplink:protocol-received',
  START: 'deeplink:start',
  MCP_INSTALL: 'deeplink:mcp-install'
}

// 全局通知相关事件
export const NOTIFICATION_EVENTS = {
  SHOW_ERROR: 'notification:show-error', // 显示错误通知
  SYS_NOTIFY_CLICKED: 'notification:sys-notify-clicked' // 系统通知点击事件
}
export const SHORTCUT_EVENTS = {
  ZOOM_IN: 'shortcut:zoom-in',
  ZOOM_OUT: 'shortcut:zoom-out',
  ZOOM_RESUME: 'shortcut:zoom-resume',
  CREATE_NEW_CONVERSATION: 'shortcut:create-new-conversation',
  GO_SETTINGS: 'shortcut:go-settings',
  CLEAN_CHAT_HISTORY: 'shortcut:clean-chat-history',
  DELETE_CONVERSATION: 'shortcut:delete-conversation'
}

// 标签页相关事件
export const TAB_EVENTS = {
  TITLE_UPDATED: 'tab:title-updated', // 标签页标题更新
  CONTENT_UPDATED: 'tab:content-updated', // 标签页内容更新
  STATE_CHANGED: 'tab:state-changed', // 标签页状态变化
  VISIBILITY_CHANGED: 'tab:visibility-changed' // 标签页可见性变化
}
