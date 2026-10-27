'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAppStore, AppTab } from '@/lib/store';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDailyQueue } from '@/lib/learning/use-daily-queue';
import CommandPalette from '@/components/CommandPalette';

const TodayView = dynamic(() => import('@/components/today/TodayView'));
const ReviewsView = dynamic(() => import('@/components/review/ReviewsView'));
const OutputView = dynamic(() => import('@/components/output/OutputView'));
const BoardView = dynamic(() => import('@/components/board/BoardView'));
const BrainView = dynamic(() => import('@/components/BrainView'));
const SettingsView = dynamic(() => import('@/components/SettingsView'));
const GateScreen = dynamic(() => import('@/components/GateScreen'));
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame,
  Zap,
  BookOpen,
  Layers,
  Settings,
  Repeat,
  Command,
  Sun,
  Moon,
} from 'lucide-react';

declare global {
  interface Window {
    /** 防止 HMR / 二次执行时把 fetch 套娃包两次（每包一次多重一个 Authorization） */
    __growthOSFetchPatched?: boolean;
  }
}

if (typeof window !== 'undefined' && !window.__growthOSFetchPatched) {
  window.__growthOSFetchPatched = true;
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    // input 只有三种形态：字符串、URL、Request。排掉前两种，剩下就是 Request，
    // 不需要再 `as any` 去摸 .url —— 摸错了也只会静默拿到 undefined。
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else if (input instanceof Request) {
      url = input.url;
    }

    if (
      url.startsWith('/api/') &&
      !url.includes('/api/auth/verify') &&
      !url.includes('/api/uploadthing')
    ) {
      const token = sessionStorage.getItem('growthOS_auth_token');
      if (token) {
        const newInit = { ...init };
        const headers = new Headers(newInit.headers || {});
        headers.set('Authorization', `Bearer ${token}`);
        newInit.headers = headers;
        return originalFetch(input, newInit);
      }
    }
    return originalFetch(input, init);
  };
}

export default function Home() {
  const {
    activeTab,
    setActiveTab,
    setCommandPaletteOpen,
    toggleCommandPalette,
    theme,
    setTheme,
    currentDate,
  } = useAppStore();

  const [isWoopModalOpen, setIsWoopModalOpen] = useState(false);

  // 0. 初始化全局主题 (本地持久化) — 必须在验证检查之前，防止白屏
  useEffect(() => {
    const savedTheme =
      (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    setTheme(savedTheme);
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [setTheme]);

  // 入口密码验证状态：null=加载中, true=已验证, false=未验证
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // 检测是否已通过密码验证（sessionStorage 缓存 + 后端是否配置密码）
  useEffect(() => {
    const checkAuth = async () => {
      // 先检查 sessionStorage 缓存
      if (sessionStorage.getItem('growthOS_authenticated') === 'true') {
        setIsAuthenticated(true);
        return;
      }
      // 向后端发送空密码请求，判断是否配置了 SITE_PASSWORD
      // 如果未配置密码，后端会直接返回 success: true
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: '' }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          // 未配置密码，直接放行
          sessionStorage.setItem('growthOS_authenticated', 'true');
          if (data.token) {
            sessionStorage.setItem('growthOS_auth_token', data.token);
          }
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch {
        // 网络错误时也显示锁屏
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // 0.1 注册 PWA ServiceWorker
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      window.location.hostname !== 'localhost'
    ) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('PWA ServiceWorker 注册成功, scope: ', reg.scope);
          })
          .catch((err) => {
            console.warn('PWA ServiceWorker 注册失败: ', err);
          });
      });
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // 1. 初始化数据库默认数据（冷启动）
  useEffect(() => {
    const initDatabase = async () => {
      try {
        const habitCount = await db.habits.count();
        if (habitCount === 0) {
          await db.habits.bulkAdd([
            {
              id: 'habit-1',
              name: 'AI 编码深度训练',
              icon: 'Code',
              frequency: 'daily',
              energyDemand: 'high',
              createdAt: new Date(),
            },
            {
              id: 'habit-2',
              name: '英语口语表达演练',
              icon: 'MessageSquare',
              frequency: 'daily',
              energyDemand: 'low',
              createdAt: new Date(),
            },
            {
              id: 'habit-3',
              name: '三分化力量拉伸',
              icon: 'Activity',
              frequency: 'daily',
              energyDemand: 'high',
              createdAt: new Date(),
            },
            {
              id: 'habit-4',
              name: '高情商社交话术练习',
              icon: 'User',
              frequency: 'daily',
              energyDemand: 'medium',
              createdAt: new Date(),
            },
          ]);
        }

        const cardCount = await db.cards.count();
        if (cardCount === 0) {
          await db.cards.bulkAdd([
            {
              id: 'card-1',
              front: '什么是 AI Agent 的 ReAct 模式？',
              back: 'ReAct (Reason + Action) 是一种大模型提示词工程和决策机制。LLM 交替进行‘推理’（思考现状、下一步计划）与‘行动’（调用外部工具 API 并获得 Observation），实现闭环的自主控制流。',
              tags: ['AI', 'Agent', '方法论'],
              reps: 0,
              interval: 0,
              ease: 2.5,
              nextReview: new Date(),
              createdAt: new Date(),
            },
            {
              id: 'card-2',
              front: '费曼学习法的核心四步骤是什么？',
              back: '1. 选择目标概念并系统性学习；\n2. 尝试将该概念以最通俗的语言向完全不懂的小白解释（降维输出）；\n3. 在卡壳、无法合理解释的地方重新查阅原资料（纠错与查漏补缺）；\n4. 简化并加入类比，建立直观的逻辑联系。',
              tags: ['学习科学', '费曼'],
              reps: 0,
              interval: 0,
              ease: 2.5,
              nextReview: new Date(),
              createdAt: new Date(),
            },
          ]);
        }
      } catch (err) {
        console.error('初始化 IndexedDB 数据失败: ', err);
      }
    };
    initDatabase();
  }, []);

  // 1.5 每日冷启动：这里**刻意不再强制弹 WOOP**。
  // 老版本会在 800ms 后弹出 4 个字段的表单挡住首屏，等于把「开始学习」
  // 的门槛设在了「先填一张计划表」上，与手册的「两分钟启动」直接冲突。
  // 现在改为：首屏进入即可点「先复习一张」，WOOP 降级为「今日」页里的一张折叠卡，
  // 且只在第一次给一次行内邀请（由 settings.woopPromptedOnce 记录）。

  // 2. 监听全局快捷键 Cmd+K
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [toggleCommandPalette]);

  // 渲染匹配的子页面 View
  const renderContentView = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <TodayView
            isWoopModalOpen={isWoopModalOpen}
            setIsWoopModalOpen={setIsWoopModalOpen}
          />
        );
      case 'review':
        return <ReviewsView />;
      case 'output':
        return <OutputView />;
      case 'brain':
        return <BrainView />;
      case 'board':
        return <BoardView />;
      case 'settings':
        return <SettingsView />;
      default:
        return (
          <TodayView
            isWoopModalOpen={isWoopModalOpen}
            setIsWoopModalOpen={setIsWoopModalOpen}
          />
        );
    }
  };

  // 导航按「一天的动作」排，不按功能模块排。
  // 主路径：今日 → 复习 → 输出 → 制卡；支撑：看板 / 设置。
  // Phase 3 把「专注」（番茄钟）并进今日、把「数据」并进看板，
  // 于是 7 个一级入口收敛成 6 个——少掉的这一个，是每天最容易跳过的一个。
  const navLinks: { tab: AppTab; label: string; icon: React.ReactNode }[] = [
    {
      tab: 'dashboard',
      label: '今日',
      icon: <Flame className="w-4 h-4" />,
    },
    { tab: 'review', label: '复习', icon: <Repeat className="w-4 h-4" /> },
    { tab: 'output', label: '输出', icon: <Zap className="w-4 h-4" /> },
    { tab: 'brain', label: '制卡', icon: <BookOpen className="w-4 h-4" /> },
    { tab: 'board', label: '看板', icon: <Layers className="w-4 h-4" /> },
    {
      tab: 'settings',
      label: '设置',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  // 侧栏每一行右侧的状态位。
  //
  // 为什么要有它：一行只有 16px 图标 + 两个汉字，右侧会空出 129px（占整行 68%），
  // 六个入口排下来像一份没写完的清单。空着的位置不如放一个**事实**——
  // 而且这些事实本来就该在门口可见：今天几张到期、库里多少张卡、几个项目在跑。
  //
  // 复习的数字必须来自 useDailyQueue：它和复习页是同一个算法、同一份数据。
  // 各算一份的话，侧栏写「3」、点进去显示「5」，正是这套代码最忌讳的那种矛盾。
  const { queue, cards, ready } = useDailyQueue();
  const activeProjects = useLiveQuery(
    () => db.projects.where('status').equals('active').count(),
    [],
  );

  // 没有数字的入口就空着（设置、输出没有「待办」可报）。
  // 计数为 0 时不显示——0 不改变「点不点它」的决定，只会多一个噪音。
  const getNavMeta = (
    tab: AppTab
  ): { text: string; strong?: boolean } | null => {
    switch (tab) {
      case 'dashboard':
        // 今天的日期。侧栏说「今日」，右边就该写是几号。
        return currentDate
          ? { text: currentDate.slice(5).replace('-', '/') }
          : null;
      case 'review':
        return ready && queue.total > 0
          ? { text: String(queue.total), strong: true }
          : null;
      case 'brain':
        return cards && cards.length > 0
          ? { text: String(cards.length) }
          : null;
      case 'board':
        return activeProjects
          ? { text: String(activeProjects) }
          : null;
      default:
        return null;
    }
  };

  // 移动端底栏放主路径 4 个 + 看板，共 5 格（移动端底栏的常用上限）。
  // 设置不占底栏：它是低频配置页，走顶栏右侧的齿轮（移动端惯例位置）。
  // 以前第 5 格是「更多」→ 命令面板，但移动端用户只点不打字，
  // 让看板/设置藏在 /goto 后面等于把一半的页面锁进搜索框。
  const mobileNavLinks = navLinks.slice(0, 5);

  const getTabTitle = (tab: AppTab) => {
    switch (tab) {
      case 'dashboard':
        return '今日';
      case 'review':
        return '复习';
      case 'output':
        return '输出';
      case 'brain':
        return '制卡与图谱';
      case 'board':
        return '看板';
      case 'settings':
        return '设置';
      default:
        return 'GrowthOS';
    }
  };

  // 加载中：使用 inline style 确保深色背景，避免主题变量未就绪时白屏
  if (isAuthenticated === null) {
    return (
      <div
        className="h-screen w-screen"
        style={{ backgroundColor: '#121212' }}
      />
    );
  }

  // 未验证：显示密码锁屏
  if (!isAuthenticated) {
    return <GateScreen onVerified={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background-void text-text-primary">
      {/* 移动端顶部状态栏 (Mobile Header) - 专注模式下隐藏 */}
        <header className="fixed top-0 left-0 right-0 h-14 z-40 bg-surface-1/90 backdrop-blur-md border-b border-border-subtle flex items-center justify-between px-4 md:hidden">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <span className="text-black font-extrabold text-xs">G</span>
            </div>
            <span className="font-bold tracking-tight text-sm text-text-primary">
              {getTabTitle(activeTab)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="btn btn-sm btn-soft !px-0 w-8"
              aria-label="命令面板"
            >
              <Command className="w-4 h-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="btn btn-sm btn-soft !px-0 w-8"
              aria-label="切换主题"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            {/* 设置齿轮：底栏 5 格放不下第 6 个入口，把低频的配置页放到顶栏惯例位。
                当前在设置页时跟着导航一起高亮，不然用户不知道自己在哪个 tab。 */}
            <button
              onClick={() => setActiveTab('settings')}
              className={`btn btn-sm btn-soft !px-0 w-8 ${
                activeTab === 'settings' ? '!text-primary' : ''
              }`}
              aria-label="设置"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

      {/* 侧边导航栏 (Sidebar) - 在沉浸式 Flow Space 下折叠隐藏，在移动端下隐藏 */}
        <aside className="w-[208px] flex-shrink-0 bg-surface-1 border-r border-border-subtle hidden md:flex md:flex-col">
          {/* Logo 区域 */}
          <div className="h-14 flex items-center px-4 border-b border-border-subtle gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              {/* 主色上的字色统一走 primary-text：亮色=白、暗色=黑。
                  写死 text-black 的话，亮色下是黑压深绿（能看），
                  但换主题时就得有人记得回来改这一处。 */}
              <span className="text-primary-text font-extrabold text-xs">G</span>
            </div>
            <span className="font-extrabold tracking-tight text-[15px] text-text-primary">
              Growth<span className="text-primary">OS</span>
            </span>
          </div>

          {/* 导航项 */}
          <nav className="flex-1 py-3 px-2 space-y-0.5">
            {navLinks.map((link) => {
              const isActive = activeTab === link.tab;
              const meta = getNavMeta(link.tab);
              return (
                <button
                  key={link.tab}
                  onClick={() => setActiveTab(link.tab)}
                  className={`w-full flex items-center gap-2.5 h-9 px-2.5 rounded-[10px] text-[13px] font-semibold transition-colors duration-150 group relative ${
                    isActive
                      ? 'text-primary bg-primary/10'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  <span
                    className={`transition-transform duration-200 group-hover:scale-110 flex-shrink-0 ${isActive ? 'text-primary' : 'text-text-secondary'}`}
                  >
                    {link.icon}
                  </span>
                  <span className="truncate">{link.label}</span>
                  {meta && (
                    <span
                      className={`ml-auto pl-2 font-mono text-[11px] tabular-nums ${
                        meta.strong
                          ? 'text-primary'
                          : isActive
                            ? 'text-primary/60'
                            : 'text-text-secondary/55 group-hover:text-text-secondary'
                      }`}
                    >
                      {meta.text}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* 快捷引导与操作 */}
          <div className="p-3 border-t border-border-subtle space-y-1.5">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="btn btn-sm btn-ghost w-full !justify-between px-2.5"
            >
              <span className="flex items-center gap-2">
                <Command className="w-3.5 h-3.5" />
                指令面板
              </span>
              <span className="font-mono text-[10px] text-text-secondary/70">
                ⌘K
              </span>
            </button>
            <button
              onClick={toggleTheme}
              className="btn btn-sm btn-ghost w-full !justify-start px-2.5"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
              {theme === 'dark' ? '浅色模式' : '深色模式'}
            </button>
            <div className="text-[10px] text-center text-text-secondary py-1 font-mono">
              LOCAL-FIRST ARCHITECT
            </div>
          </div>
        </aside>

      {/* 主视图区 (Main View) */}
      <main
        className={`flex-1 flex flex-col min-w-0 overflow-hidden relative bg-background-void transition-all duration-200 ${
          'pt-14 pb-16 md:pt-0 md:pb-0'
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-1 flex flex-col min-w-0 overflow-hidden h-full"
          >
            {renderContentView()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 移动端底部导航栏 (Mobile Bottom Nav) - 专注模式下隐藏 */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 z-40 bg-surface-1/90 backdrop-blur-md border-t border-border-subtle flex items-center justify-around px-2 md:hidden">
          {mobileNavLinks.map((link) => {
            const isActive = activeTab === link.tab;
            return (
              <button
                key={link.tab}
                onClick={() => setActiveTab(link.tab)}
                className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all duration-200 ${
                  isActive
                    ? 'text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span
                  className={`transition-transform duration-200 ${isActive ? 'scale-110 text-primary' : 'text-text-secondary'}`}
                >
                  {link.icon}
                </span>
                <span className="text-[9px] font-medium tracking-tight truncate max-w-[62px]">
                  {link.label}
                </span>
              </button>
            );
          })}
        </nav>

      {/* 全局命令面板 (Command Palette) */}
      <CommandPalette onTriggerWoopModal={() => setIsWoopModalOpen(true)} />
    </div>
  );
}
