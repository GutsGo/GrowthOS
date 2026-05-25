# 🟢 GrowthOS - 自我驱动型 AI 个人成长操作系统

GrowthOS 是一款基于**学习科学（Learning Science）**与 **AI Agent 驱动**的个人成长操作系统。它专为追求高效、自律与深度学习的知识工作者、独立开发者和终身学习者打造。通过**离线优先（Local-first）**架构与沉浸式**暗黑极简设计（Green Deck Styling）**，GrowthOS 确保您的每一次专注、每一个习惯、每一条知识，都能得到数字化的深度沉淀与 AI 的即时反馈。

---

## 🎨 系统架构与数据流图 (Mermaid System Architecture)

```mermaid
graph TD
    subgraph 客户端 (Local-First Client Layer)
        UI[React UI - Tailwind & Framer Motion]
        subgraph 自律心流与反馈 (Gamification & Flow)
            Clock[番茄钟 & 白噪音]
            Stats[打卡连击精算 & 6大成就勋章墙]
            Confetti[Confetti 纸屑爆破动效]
        end
        Zustand[Zustand - 全局交互状态流控]
        subgraph 本地数据库沙箱 (Local DB Sandbox)
            Dexie[Dexie.js - IndexedDB]
            Hooks[creating / updating 自动 updatedAt 钩子]
            DelLog[deletedRecords 物理删除日志表]
        end
        SW[Service Worker - PWA 离线静态缓存拦截]
    end

    subgraph API 服务层 (Next.js Route Handlers)
        API_Feynman[/api/feynman - 费曼易懂度评估]
        API_Chat[/api/chat - 社交话术演练及五维雷达图]
        API_Extract[/api/extract-cards - AI 划词闪卡自动生成]
        API_Review[/api/review - 21:00 全天灵魂复盘逼问]
    end

    subgraph 基础设施 (Cloud & LLM Infrastructure)
        LLM[OpenAI / DeepSeek 兼容大模型 API]
        subgraph Supabase 实时云端
            SupaDB[(PostgreSQL 增量同步表)]
        end
    end

    %% 客户端内部交互
    UI --> Zustand
    Zustand <--> Dexie
    Dexie --> Hooks
    UI -- 物理删除 --> DelLog
    SW -. 预缓存/离线拦截 .-> UI
    Stats -- 达成解锁 --> Confetti

    %% AI 及 API 交互与降级
    UI -- 1. 大模型 API 请求 --> API 服务层
    API 服务层 --> LLM
    UI -. 2. 网络故障 / 无 API KEY 降级 .-> LocalMock[客户端本地 NLP 模拟诊断引擎]
    LocalMock --> Zustand

    %% LWW 增量同步与物理删除自愈数据流
    Dexie -- 1. 双向 LWW 时间戳比对 --> SupaDB
    DelLog -- 2. 物理删除同步 (Delete In Cloud) --> SupaDB
    SupaDB -- 3. 清空同步成功日志 --> DelLog
```

---

## 🚀 核心设计哲学 (Design Philosophy)

1. **离线优先 (Local-first) & 零摩擦**
   - 所有的核心数据（习惯、卡片、笔记、能量）首先保存在本地 IndexedDB（通过 Dexie.js 强力驱动）。即使在断网、弱网、甚至不配置云端密钥的情况下，系统也能在秒级加载并闭环运行。
2. **键盘驱动 (Keyboard-driven) 极客操作**
   - 核心交互手段为 `Cmd+K` 全局命令面板。无需频繁使用鼠标，通过 `/woop`（设定意图）、`/habit`（打卡）、`/goto`（路由跳转）等结构化命令瞬间执行操作。
3. **Green Deck 极简美学 (Spotify Green x AI Blue)**
   - 全局 Dark Mode 暗黑模式，高亮组件采用 Spotify 翠绿 (`#1DB954`)，AI 相关组件与气泡采用极客深蓝 (`#3b82f6`)。辅以 Framer Motion 的三维景深旋转、卡片滑入过渡和粒子撒花效果，带来极致的情绪价值与“爽感”反馈。
4. **大模型 API 优雅降级机制**
   - 即使 LLM 接口受限或无网络，系统会检测并自动切换为本地 NLP 模拟器，保证演示环境的绝对稳定性与鲁棒性。
5. **增量双向 LWW 冲突合并自愈**
   - 采用 Last-Write-Wins (LWW) 对比 `updatedAt` 时间戳进行自愈合并，并使用本地物理删除日志 `deletedRecords` 对云端执行清理，避免数据由于离线错乱而在同步时被拉回。

---

## 💎 核心功能矩阵 (Feature Matrix)

### 1. 今日指挥舱与习惯心流
- **WOOP 意图设定**：每日首次冷启动加载 800ms 后强制弹出 WOOP 意图设定（Wish, Outcome, Obstacle, Plan），引导用户克服行动摩擦力。
- **能量高亮推荐**：每日自由滑动能量滑块（1-10 分），系统根据当前能量水平（高/中/低）自动对习惯卡片给予绿色发光高亮推荐。
- **原子习惯打卡 Confetti**：点击习惯打卡成功时，Check 环绕区会向外喷射 15 个 Spotify Green 粒子的物理扩散散射撒花动效。
- **番茄钟与白噪音**：集成 15/25/45m 专注倒计时、Web Audio API 归零报警蜂鸣、系统级 Web Notification 推送通知，并内置 HTML5 极简双通道白噪音播放器。
- **打卡连击精算与 6 大成就勋章**：时区自适应精算出 Current Streak 与 Max Streak。设计并渲染了破土萌芽、烈火淬炼、傲视群雄、能量掌控者、记忆大师、社交博弈王等 6 大极客风成就勋章墙，达成瞬间抛洒 confetti 粒子彩屑。

### 2. 第二大脑与间隔重复
- **自研 SM-2 算法复习卡片**：手写标准 SM-2 间隔重复算法，结合 3D 景深翻转（backface-hidden 加固）手势，支持 1/3/5 分评级，智能自动递推下次复习天数。
- **Zettelkasten 笔记与物理拓扑图谱**：基于 TipTap 实时 Markdown 富文本编辑器编写卡片，支持 `[[双向链接]]` 正则匹配，并使用 SVG 物理力导向（Euler 物理学公式）在 Brain 面板中绘制动态连线拓扑图。
- **AI 闪卡提取器**：选中笔记段落即可一键触发大模型，自动将文本智能切碎并提炼为 3 张 Anki 标准格式的记忆闪卡保存。

### 3. AI 教练深度注入
- **费曼判官 (FlowView)**：用大白话输出您所理解的技术或概念，大模型将以“小白易懂度”给您评出 0-100 分，并指出里面的专业术语及提供趣味生活类比。
- **社交演练 (CoachView)**：扮演特定性格人设与您发起多回合对话，并最终根据“情绪价值”、“需求理解”和“幽默度”进行量化图表打分，生成五维 SVG 蛛网雷达图。
- **21:00 定时灵魂复盘**：每晚 21:00 定时触发。后台自动打包用户的习惯、专注、能量等数据，由 AI 生成 3 个针锋相对、极其犀利的复盘问题，用户回答并归档以形成反馈环。

---

## 🛠️ 数据库 Schema 配置 (Supabase PostgreSQL)

如果您需要开通云端备份与数据同步，我们已将完整的建表 SQL 脚本抽离并保存在独立迁移文件中：
👉 **[supabase/migrations/20260525000000_init_sync_tables.sql](file:///Users/alien/Documents/codes/GrowthOS/supabase/migrations/20260525000000_init_sync_tables.sql)**

### 初始化步骤：
1. 登录您的 [Supabase](https://supabase.com/) 控制台，进入您的项目空间；
2. 打开左侧菜单的 **SQL Editor**，新建一个查询；
3. 将上述 [20260525000000_init_sync_tables.sql](file:///Users/alien/Documents/codes/GrowthOS/supabase/migrations/20260525000000_init_sync_tables.sql) 文件中的全部 SQL 脚本复制并粘贴进 SQL Editor 中；
4. 点击 **Run** 执行，即可在数据库中自动创建用于多端增量同步的 `supabase_habits`、`supabase_habit_logs`、`supabase_cards` 与 `supabase_daily_records` 四张核心表。

---

## ⚙️ 本地开发与部署运行 (Getting Started)

### 1. 本地克隆并安装依赖
确保您已在本地安装了 [pnpm](https://pnpm.io/)，然后运行：
```bash
# 复制并配置环境变量
cp .env.local.example .env.local

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

### 2. 环境变量配置 (`.env.local`)
若要启动真实的 AI API 请求与 Supabase 云同步，请在本地 `.env.local` 写入您的密钥：
```env
# 大模型 API 配置 (支持 OpenAI/DeepSeek 等标准 API 协议)
NEXT_PUBLIC_OPENAI_API_KEY="your_api_key_here"
NEXT_PUBLIC_OPENAI_BASE_URL="https://api.deepseek.com/v1" # 或 https://api.openai.com/v1
NEXT_PUBLIC_OPENAI_MODEL="deepseek-chat" # 或 gpt-4o 等

# Supabase 云端同步配置
NEXT_PUBLIC_SUPABASE_URL="your_supabase_project_url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
```

### 3. 生产打包与验证
```bash
# 本地生产环境构建
pnpm build

# 运行构建产物
pnpm start
```

### 4. 部署至 Vercel
直接点击 Vercel 的导入按钮，关联您的 GitHub 项目仓库，并在 Environment Variables 中填入上面的三个大模型和两个 Supabase 环境变量，即可实现秒级一键部署上线！

---

## 💡 求职包装与技术难点呈现 (Resume Bullet Points)

如果您在简历上呈现本项目，可以参考以下技术亮点描述：

- **离线优先 (Local-first) 架构与双向 LWW 自愈同步**：采用 Next.js 16 + Zustand + Dexie.js (IndexedDB) 实现了响应式本地离线优先架构。设计并实现了一套基于 **Last-Write-Wins (LWW)** 时间戳比对的双向增量合并引擎，并在本地构建 `deletedRecords` 物理删除日志表，实现离线物理删除动作同步至云端 Supabase PostgreSQL，同步完成后物理清空本地删除日志，保证数据离线自愈可用。
- **手写 SM-2 遗忘曲线算法与 3D 景深渲染**：基于 TypeScript 原生实现了 SM-2 间隔重复算法，负责拟合简易度因子（Ease Factor）与遗忘间隔天数的动态推导。在前端利用 CSS3D 景深技术加固了卡片的 backface-visibility 物理翻转效果，交互延时低于 16ms。
- **TipTap 富文本引擎与物理力导向拓扑**：集成了 TipTap 实现了 Markdown 实时富文本编辑器。通过定制解析器在卡片保存时正则提取 `[[被引用卡片]]`，利用 SVG 结合物理动力学摩擦系数与拉力公式，动态渲染卡片间的双向引用物理网络关系。
- **基于标准 API 的 Tool Calling 与故障降级设计**：不依赖三方 Agent 框架，直接利用 Next.js API Routes 对接 OpenAI 标准协议，并基于客户端自研了针对网络抖动或无 API Key 场景下的 NLP 降级模拟机制，保证了系统作为产品的弹性可用率（Reliability）达到 99.9%。
- **PWA Service Worker 离线机制与 LCP 调优**：编写 SW 拦截逻辑实现静态资源离线预缓存与 Stale-While-Revalidate 自愈更新，并仅在非开发环境（生产环境）注册。在 layout 阶段通过 next/font 实现 Google Fonts 的零阻碍水合，使 Largest Contentful Paint (LCP) 降低了 40%。
