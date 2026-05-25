# GrowthOS 项目核心上下文 (Context)

## 一、 项目概述

- **项目定位**：基于学习科学与 AI Agent 驱动的「自我驱动型成长操作系统」。
- **目标用户**：追求持续进步的知识工作者、独立开发者、终身学习者。
- **设计哲学**：离线优先 (Local-first)、键盘驱动 (Keyboard-driven)、暗黑模式 (Dark-mode Only)。
- **核心交互约定**：`Cmd+K` 全局命令面板是 MVP 的核心交互手段，所有核心操作（如新建 WOOP、习惯打卡、切换页面）均同步首发并支持键盘命令。
- **Cmd+K 功能范围**：采用预设结构化指令与搜索。
  - `/woop`：触发今日意图创建弹窗。
  - `/habit <习惯名>` 或列表选择：执行/取消习惯打卡。
  - `/goto <页面>`：路由快速跳转。
  - 支持模糊检索已有的卡片或笔记。

## 二、 核心技术栈

- **前端框架**：Next.js 15 (App Router, 使用 TypeScript, ESLint, `src/` 目录, Tailwind CSS, 别名 `@/*`)
- **UI 组件库**：shadcn/ui (Radix UI) + Tailwind CSS (用于样式微调与组件生成)
- **状态管理**：Zustand + immer
- **本地数据库**：Dexie.js (IndexedDB)
- **AI 注入**：标准的 OpenAI 兼容协议 API (不引入 Mastra / LangGraph 等重型框架，直接由 Next.js API Routes 对接驱动)
- **动画库**：Framer Motion
- **包管理器**：pnpm


## 三、 视觉与设计系统 (Green Deck 融合版)

基于 `green-deck-DESIGN.md` 并融合 `prd.md` 中的 AI 专属色，支持深色 (Dark) 与浅色 (Light) 主题切换：

### 1. 共有核心色彩
- **主色 (Primary)**：`#1DB954` (Spotify Green) - 交互高亮、打卡激活、主按钮。
- **主色悬停 (Primary Hover)**：`#1ED760`
- **次强调色 (AI Color)**：`#3b82f6` (Blue-500) - AI 头像、AI 聊天、AI 反馈气泡。

### 2. 深色主题 (Dark Mode - 默认)
- **背景色 (Background)**：`#121212` (Void Black) - 页面底色。
- **表面色 (Surface)**：
  - Level 1 (卡片/侧边栏)：`#181818`
  - Level 2 (下拉菜单/悬浮层)：`#282828`
  - Level 3 (弹窗/模态框)：`#333333`
- **文字主色 (Text Primary)**：`#FFFFFF` (纯白)
- **文字次色 (Text Secondary)**：`#A7A7A7` (静音灰)
- **边框 (Border)**：`#282828`

### 3. 浅色主题 (Light Mode - 新增)
- **背景色 (Background)**：`#FAFAFA` (极浅灰)
- **表面色 (Surface)**：
  - Level 1 (卡片/侧边栏)：`#FFFFFF` (纯白)
  - Level 2 (悬浮层/灰卡片)：`#F4F4F5`
  - Level 3 (高亮背景层)：`#E4E4E7`
- **文字主色 (Text Primary)**：`#09090B` (碳黑)
- **文字次色 (Text Secondary)**：`#71717A` (深灰)
- **边框 (Border)**：`#E4E4E7`

- **字体系统**：DM Sans (加载自 Google Fonts)，代码字体使用 JetBrains Mono。

### 4. 交互动效系统 (ReactBits 集成)
为延续极客、黑客暗黑的设计张力，项目在本地实现了 ReactBits 动效规范，支持以下高质感交互组件。后续新增页面或功能卡片时，应优先考虑引入它们以维持视觉一致性：
- **`SpotlightCard` (跟随聚光灯卡片)**：
  - **组件路径**：`src/components/reactbits/SpotlightCard.tsx`
  - **场景**：仪表盘习惯打卡、WOOP 卡片、反思面板、专注区工具框等。
  - **规范**：可传 `spotlightColor`，普通习惯用绿色微光 `rgba(29, 185, 84, 0.12)`，AI 社交与教练模块采用蓝色微光 `rgba(59, 130, 246, 0.15)`。
- **`DecryptedText` (黑客字符解码文本)**：
  - **组件路径**：`src/components/reactbits/DecryptedText.tsx`
  - **场景**：AI 诊断标题、加载/反思引导、计时完成提示等需要彰显极客感的短文本。
  - **规范**：用于中短句标题或强调说明，避免用在大段正文中以免视觉疲劳。
- **`Squares` (Canvas 网格像素背景)**：
  - **组件路径**：`src/components/reactbits/Squares.tsx`
  - **场景**：沉浸式专注区、AI 教练聊天面板底层等容器级背景。
  - **规范**：网格线和跳动块需维持极微弱的透明度（10% ~ 15% 之间），确保作为背景不喧宾夺主。

## 四、 核心功能矩阵与路线图

详细的核心功能矩阵、开发路线图以及技术选型决策，请参考独立文档 [roadmap.md](file:///Users/alien/Documents/codes/GrowthOS/contexts/roadmap.md)。

---

## 五、 本地数据库设计 (Dexie.js Schema)

为保证离线优先，MVP 阶段规划以下 Dexie.js 表结构：

### 1. `habits`
- `id`: string (uuid, 主键)
- `name`: string (习惯名称)
- `icon`: string (图标名称)
- `frequency`: string (如 'daily')
- `createdAt`: Date

### 2. `habit_logs`
- `id`: string (uuid, 主键)
- `habitId`: string (关联 habit.id，索引)
- `date`: string (打卡日期格式 'YYYY-MM-DD'，索引)
- `createdAt`: Date

### 3. `cards` (SM-2 卡片)
- `id`: string (uuid, 主键)
- `front`: string (正面 Markdown 内容)
- `back`: string (背面 Markdown 内容)
- `tags`: string[] (标签，多值索引)
- `reps`: number (连续成功复习次数)
- `interval`: number (复习间隔天数，以天为单位)
- `ease`: number (简易度因子，默认 2.5)
- `nextReview`: Date (下一次复习的日期，索引)
- `createdAt`: Date

### 4. `daily_records` (每日意图与状态)
- `date`: string (格式 'YYYY-MM-DD'，主键)
- `woopWish`: string
- `woopOutcome`: string
- `woopObstacle`: string
- `woopPlan`: string
- `energyLevel`: number (当前能量值 1-10)
- `createdAt`: Date

#### 本地能量推荐逻辑
- 习惯表 (`habits`) 可选配置 `energyDemand`: 'high' (>=7) | 'medium' (5-6) | 'low' (<=4)。
- Dashboard 渲染时，若今日能量滑块分值符合习惯的能量要求，则在界面上对该习惯卡片给予绿色发光 (Green Glow) 边框高亮推荐，辅助用户进行“阻力最小”的行为决策。

#### SM-2 简化评分映射
- **完全忘记 (Again)**：在算法中映射为 `1` (不通过，重置 reps=0，计算新 interval)。
- **有些吃力 (Hard)**：在算法中映射为 `3` (通过，计算新 interval，ease 略微下调)。
- **轻松记住 (Good)**：在算法中映射为 `5` (通过，计算新 interval，ease 略微上调)。
