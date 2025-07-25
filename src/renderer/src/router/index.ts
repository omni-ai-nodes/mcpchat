import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/chat'
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/views/ChatTabView.vue'),
      meta: {
        titleKey: 'routes.chat',
        icon: 'lucide:message-square'
      }
    },
    {
      path: '/mcp-gallery',
      name: 'mcp-gallery',
      component: () => import('@/views/McpServerGallery.vue'),
      meta: {
        titleKey: 'routes.mcp-gallery',
        icon: 'lucide:message-square'
      }
    },
    {
      path: '/mcp-workflow',
      name: 'mcp-workflow',
      component: () => import('@/views/McpWorkflow.vue'),
      meta: {
        titleKey: 'routes.mcp-workflow',
        icon: 'lucide:workflow'
      }
    },
    {
      path: '/mcp-server/:name',
      name: 'mcp-server-detail',
      component: () => import('@/views/McpServerDetail.vue'),
      meta: {
        titleKey: 'routes.mcp-server-detail',
        icon: 'lucide:server'
      }
    },
    {
      path: '/welcome',
      name: 'welcome',
      component: () => import('@/views/WelcomeView.vue'),
      meta: {
        titleKey: 'routes.welcome',
        icon: 'lucide:message-square'
      }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsTabView.vue'),
      meta: {
        titleKey: 'routes.settings',
        icon: 'lucide:settings'
      },
      redirect: { name: 'settings-common' },
      children: [
        {
          path: 'common',
          name: 'settings-common',
          component: () => import('@/components/settings/CommonSettings.vue'),
          meta: {
            titleKey: 'routes.settings-common',
            icon: 'lucide:bolt'
          }
        },
        {
          path: 'display',
          name: 'settings-display',
          component: () => import('@/components/settings/DisplaySettings.vue'),
          meta: {
            titleKey: 'routes.settings-display',
            icon: 'lucide:monitor'
          }
        },
        {
          path: 'provider/:providerId?',
          name: 'settings-provider',
          component: () => import('@/components/settings/ModelProviderSettings.vue'),
          meta: {
            titleKey: 'routes.settings-provider',
            icon: 'lucide:cloud-cog'
          }
        },
        {
          path: 'mcp',
          name: 'settings-mcp',
          component: () => import('@/components/settings/McpSettings.vue'),
          meta: {
            titleKey: 'routes.settings-mcp',
            icon: 'lucide:server'
          }
        },
        {
          path: 'github-proxy',
          name: 'settings-github-proxy',
          component: () => import('@/components/settings/GitHubProxySettings.vue'),
          meta: {
            titleKey: 'routes.settings-github-proxy',
            icon: 'lucide:github'
          }
        },
        {
          path: 'prompt',
          name: 'settings-prompt',
          component: () => import('@/components/settings/PromptSetting.vue'),
          meta: {
            titleKey: 'routes.settings-prompt',
            icon: 'lucide:book-open-text'
          }
        },
        {
          path: 'knowledge-base',
          name: 'settings-knowledge-base',
          component: () => import('@/components/settings/KnowledgeBaseSettings.vue'),
          meta: {
            titleKey: 'routes.settings-knowledge-base',
            icon: 'lucide:book-marked'
          }
        },
        {
          path: 'database',
          name: 'settings-database',
          component: () => import('@/components/settings/DataSettings.vue'),
          meta: {
            titleKey: 'routes.settings-database',
            icon: 'lucide:database'
          }
        },
        {
          path: 'shortcut',
          name: 'settings-shortcut',
          component: () => import('@/components/settings/ShortcutSettings.vue'),
          meta: {
            titleKey: 'routes.settings-shortcut',
            icon: 'lucide:keyboard'
          }
        },
        {
          path: 'about',
          name: 'settings-about',
          component: () => import('@/components/settings/AboutUsSettings.vue'),
          meta: {
            titleKey: 'routes.settings-about',
            icon: 'lucide:info'
          }
        }
      ]
    }
  ]
})

export default router
