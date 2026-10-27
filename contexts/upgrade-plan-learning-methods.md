# GrowthOS × 学习实践工具：改造计划

> 输入：`学习方法手册.html`（方法论 + 证据分级）、`学习实践工具.html`（交互原型）
> 对象：GrowthOS（Next.js 16 / React 19 / Dexie / Zustand / Supabase，约 11,000 行）
> 日期：2026-10-26

---

## 0. 一句话结论

**不要"把新工具塞进 GrowthOS"，要"用新工具的手术刀切 GrowthOS"。**

老项目的问题不是功能不够——功能是新工具的 3 倍。问题是**结构错了**：

- 老项目按「功能模块」切了 6 个 tab（指挥舱/专注/大脑/教练/数据/设置），一天要过 6 道门；
- 新工具按「一天的动作」切了 5 个 tab（今日/复习/制卡/输出/看板），一天只有 5 个连续动作，且第 1 个动作小到 2 分钟能完成。

改造主线只有一条：**6 个功能模块 → 1 条每日闭环 + 2 个支撑层 + 1 份删除清单**。

同时要诚实地说：新工具在方法论上补了老项目的 3 个真空（项目实战、交错练习、最小任务门禁），但它也丢了老项目 3 个真本事（语音主动回忆 + LCS 相似度、TipTap 富文本 + 双链图谱、AI 注入）。**合并原则是「方法论取新的，工程能力取旧的」，不是谁替代谁。**

---

## 1. 现状对照

### 1.1 信息架构对照

| 新工具（按动作） | 老项目（按模块） | 冲突判定 |
|---|---|---|
| 今日 | 今日指挥舱 Dashboard | ⚠️ 同名不同义：新=最小任务门禁；老=WOOP 强弹窗+能量滑块+习惯矩阵+AI任务+待复习+灵魂复盘 六件套 |
| 复习 | 并入「专注与输出」FlowView | ❌ 复习藏在番茄钟页面里，是最大的埋没 |
| 制卡 | 并入「第二大脑」BrainView | ⚠️ 制卡和双链图谱混居，1011 行 |
| 输出 | 并入「专注与输出」FlowView | ⚠️ 费曼判官和 SM-2 复习挤同一个文件 |
| 看板 | 拆在「数据与复盘」StatsView | ⚠️ 徽章/雷达/热力图都在，但没有"项目进度" |
| （无） | AI 教练舱 CoachView | ⚠️ 1937 行，与学习闭环无强关联 |
| （无） | 系统设置 SettingsView | ✅ 保留 |

**结论**：老项目的 6 个 tab 里有 3 个是"多种职责挤在一起"（FlowView = 番茄钟+白噪音+费曼+SM-2；BrainView = 卡片+编辑器+双链图+AI提取；DashboardView = 6 张卡堆叠）。

### 1.2 六个方法论覆盖对照

| 手册方法 | 老项目 | 新工具 | 改造动作 |
|---|---|---|---|
| ① 提取练习 | ✅ 真做到了（主动回忆开关 + 语音录入 + LCS 相似度对答案）——**这是老项目最强的地方** | ✅ 基础版（先想再翻面） | 保留语音+LCS，别丢 |
| ② 间隔重复 | ⚠️ SM-2 只做了**三档**（1/3/5），「困难」和「良好」被合并，EF 惩罚区分度丢失 | ✅ **四档 0/3/4/5**，「困难」缩短间隔 | 迁四档，是 breaking change，要迁移脚本 |
| ③ 费曼输出 | ⚠️ AI 直接打分（score/grade/tips），没有"卡壳点"记录，没关联卡片 | ✅ 有 `stuck` 卡壳点，无评分 | 合并：卡壳点 + 100 字大白话 + cardId + AI 改「追问」而非「打分」 |
| ④ 项目实战 | ❌ 完全没有 | ❌ 完全没有 | **新增**（两边的共同真空） |
| ⑤ 交错练习 | ❌ 完全没有 | ❌ 完全没有 | **新增**（两边的共同真空） |
| ⑥ 两分钟启动 | ⚠️ 有 WOOP + 番茄钟，但入口极重：先填 4 个字段才放你进去 | ✅ 最小任务 1 张卡 | **重构入口**，这是最高优先级 |

**三个真空，两个是两边都没有**——所以这不是"融合"，是"补课"。

### 1.3 每日五步闭环对照

| 闭环步骤 | 老项目落点 | 差距 |
|---|---|---|
| ① 学一点 → 制卡 | BrainView | ❌ 没有新卡上限（AI 提取还能一次吐 3 张，正好是积压制造机） |
| ② 先回想 → 复习 | FlowView | ⚠️ 藏在番茄钟页；只有三档 |
| ③ 讲出来 → 费曼 | FlowView 费曼判官 | ⚠️ AI 替你评判，不是"讲给小白听"的动作本身 |
| ④ 写一句 → 复盘 | DashboardView 晚间灵魂复盘 | ❌ AI 生成 3 个尖锐问题 ≠ 自己写一句"明天先补哪个" |
| ⑤ 不断链 → 打卡 | habitLogs + Streak | ❌ **语义相反**：手册说"断了不补、漏一天无害"，老项目做的是"断签归零 + 6 大徽章" |

第 ⑤ 条是整份计划里最尖锐的冲突：**老项目把"断链"设计成了惩罚，而手册第 3 号痛点的机制分析明确指出，欠账感和断链归零就是弃坑的直接触发器。**

### 1.4 数据模型对照

| 新工具字段 | 老项目现状（`src/lib/db.ts`） | 动作 |
|---|---|---|
| `question` / `answer` | `front` / `back`（HTML，TipTap） | 保留字段名，改 UI 文案为"问题 / 用自己的话讲清楚" |
| `example`（类比） | ❌ 无 | **新增** `Card.example` |
| `type`（概念/面试题/错题） | ❌ 无 | **新增** `Card.type`（交错练习靠它识别题型） |
| `easeFactor` / `repetitions` / `interval` / `due` | `ease` / `reps` / `interval` / `nextReview` | 改名不改意，v4 迁移时做映射 |
| `history[{q,at,interval}]` | ❌ 无 | **新增表 `reviewEvents`**（热力图和统计的真实数据源） |
| `outputs(kind=feynman, stuck)` | `feynmanRecords(score/grade/tips)` | 合并：加 `stuckPoints[]` / `plainSummary` / `cardId` |
| `outputs(kind=journal)` | `dailyRecords.reviewAnswers` | 保留日复盘；**额外新增 `weeklyReviews` 表**（周复盘是另一个动作） |
| `settings.checkins[]` | `habitLogs` | 不改，但出勤率改从 `habitLogs + reviewEvents` 合并计算 |
| — | `deletedRecords`（LWW 同步） | ✅ 保留，与新功能无关 |
| — | `projects` | **新增**（项目实战看板，含 `pitfalls[{problem, solution}]`） |

---

## 2. 诊断：老项目的 5 个结构性问题

1. **入口太重，违反"两分钟启动"。** 打开 Dashboard：WOOP 强制弹窗（4 个字段）→ 能量滑块 → 习惯矩阵 → AI 任务 → 待复习 → 灵魂复盘。一天要做的第一个决策是"填 WOOP"，而不是"先做 1 张卡"。手册第一章说得很直白：先坐下，先做一张。

2. **Streak 是道德评分，不是频率记录。** `StatsView` 里 Current/Max Streak + 6 个徽章（破土萌芽/烈火淬炼/傲视群雄…）。手册第七章第 2 条：打卡是"看见频率"，不是"道德评分"；Lally 2010 的数据是"漏掉一天对长期轨迹无显著影响"。当前设计把一次漏打变成了整条链的重置。

3. **方法论上的三个真空**（见 1.2）：项目实战、交错练习、最小任务门禁。其中"项目实战"最致命——手册第七章第 3 条明确建议"第一个迭代对象就是你这个学习工具本身"，而 GrowthOS 里没有任何"项目 / 难题—解法"的落点，只有卡片和习惯。

4. **AI 定位反了。** `/api/extract-cards` 一键生成 3 张卡、`/api/feynman` 直接给分。手册的内核是"提取难度本身即学习"（必要难度 / Bjork）。AI 替你总结、替你评分，等于把难度抹平了。而新工具里那句小字恰恰是对的：「复制问题去问 AI，让它扮演考官追问你」。**AI 应该当追问者，不该当代笔和裁判。**

5. **技术债是文件体积**：`CoachView 1937` / `DashboardView 1493` / `FlowView 1180` / `BrainView 1011` / `SettingsView 1005` / `StatsView 871` / `page.tsx 519`。改造的成本大头不在加功能，在**先拆文件**——FlowView 一个文件扛了 4 个职责（番茄钟 / 白噪音 / 费曼 / SM-2），任何改动都在踩雷。

---

## 3. 改造主线：6 模块 → 1 闭环 + 2 支撑层

```
                        ┌──────────── 1 条每日闭环（主路径）────────────┐
   打开 App ──▶ 今日（最小任务门禁）──▶ 复习（四档）──▶ 制卡（限额）──▶ 输出（卡壳点）──▶ 写一句（日复盘）
                        └──────────────────────────────────────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
              支撑层 A：看板                                 支撑层 B：设置
     项目实战 / 骨架地图 / 周复盘 / 出勤格子          新卡上限 / if-then 触发 / 学习前仪式 / 数据
```

- **主路径 5 步，每步一个 tab，按时间顺序排，不按功能模块排。**
- **看板不再是"数据与复盘"，是"项目 + 骨架 + 周复盘"三件事**——数据可视化降级为看板里的一个折叠区。
- **AI 教练舱不进主路径**：从一级 tab 降级为「输出」页里的一个入口（考官模式），以及「看板」里的一个复盘提问器。

目标 tab 结构（6 → 5）：

| 新 tab | 来源 | 谁被合并进来 |
|---|---|---|
| 今日 | DashboardView 重构 | WOOP（折叠）/ 能量滑块（二次展开）/ 习惯矩阵（下滚可见）/ AI 任务（折叠） |
| 复习 | **从 FlowView 拆出** | SM-2 四档 + 语音主动回忆 + LCS |
| 制卡 | 从 BrainView 拆出 | 卡片列表 + TipTap 编辑器 + AI 提取（改为"1 张 + 3 追问"） |
| 输出 | 从 FlowView 拆出 | 费曼 + 卡壳点 + 考官模式（原 CoachView 入口） |
| 看板 | Stats + 新增 | 项目实战 / 骨架地图 / 周复盘 / 出勤格子 / 热力图（折叠） |

`第二大脑` 的双链图谱去哪了？→ 移到「制卡」页的一个「图谱」视图切换，它服务的是卡片关系，不是每日动作。

---

## 4. 分阶段执行计划

五个 Phase，每个都能独立上线、独立验证。**不要一次性动 11,000 行。**

### Phase 0 · 先立契约（0.5 天）

不写任何 UI，只写领域层和迁移。这一步不做完，后面全是返工。

| 任务 | 产出 | DoD |
|---|---|---|
| SM-2 四档纯函数 | `src/lib/learning/sm2.ts` | `applyRating(card, 0\|3\|4\|5, now)` 纯函数；「困难(3)」= 缩短间隔而非重置 reps；单测覆盖四档 × 边界（ease 下限 1.3） |
| 队列构建 | `src/lib/learning/queue.ts` | `buildDailyQueue(cards, {newLimit})`：到期卡优先 + 新卡硬上限，超限不进队列 |
| 类型扩展 | `src/lib/learning/types.ts` | `Card.example` / `Card.type` / `ReviewEvent` / `OutputRecord` / `WeeklyReview` / `Project` |
| Dexie v4 迁移 | `src/lib/db.ts` | 老 `ease/reps/interval/nextReview` 映射到新字段；新增 `reviewEvents` / `weeklyReviews` / `projects` 表；旧数据一条不丢（写迁移测试） |

> 风险点：四档是 breaking change，老卡片已有的 `interval` 直接沿用，只把 `ease` 保留，**不要重算历史间隔**。

### Phase 1 · 换骨架：「今日」是一个门，不是一张报表（3–4 天）

| 任务 | 涉及文件 | DoD |
|---|---|---|
| 新建 TodayView | `src/components/today/TodayView.tsx` | 首屏只有三块：① 今日最小任务（1 张新卡 + N 张到期）② 一个"开始"主按钮 ③ 一句"断了不补，今天继续就好" |
| 拆解 DashboardView | `DashboardView.tsx` → `today/EnergySlider.tsx` / `today/HabitGrid.tsx` / `today/WoopCard.tsx` / `today/AiTasksPanel.tsx` | 每个子组件 < 300 行 |
| WOOP 降级 | `WoopCard.tsx` | 从"800ms 强制弹窗"改为"折叠卡 + 首次引导一次"；`localStorage.woopPrompted` 只提示一次 |
| 新卡上限 | `dailyRecords` 或新建 `settings` 表 | 设置项 `dailyNewCardLimit`（默认 2）；制卡页超限时提示"今天够了，明天再加"，不阻止但显式记账 |
| Streak 语义改造 | `StatsView.tsx` | 从"断签归零"改为「近 30 天出勤格子 + 出勤率 %」；6 枚徽章保留 2 枚（7 天/30 天出勤），其余归档 |
| 命令面板同步 | `CommandPalette.tsx` | `/goto` 的路由表跟随 5 tab 更新 |

> 这一步是整个改造的胜负手。**首屏从"6 张卡"变成"1 个按钮"，用户行为会立刻不一样。**

### Phase 2 · 把复习做对（2–3 天）

| 任务 | 涉及文件 | DoD |
|---|---|---|
| 拆出 ReviewView | `src/components/review/ReviewsView.tsx`（从 FlowView 抽离） | 独立 tab，不再藏在番茄钟里 |
| 四档评分 | 同上 | 忘记 / 困难 / 良好 / 简单，色语义：红 / 橙 / 绿 / 青；困难 = 缩短间隔 |
| 写复习事件 | `db.reviewEvents` | 每次评分写一条 `{id, cardId, rating, at, intervalBefore, intervalAfter}` |
| 卡片字段补全 | 制卡表单 + `Card` | `example`（类比）必填提示、"一张卡只考一个细节"的软校验、`type` 选择 |
| 「这题考什么」提示位 | ReviewsView | 翻面前先让用户选/写题型分类（为 Phase 3 的交错练习铺路） |

> 保留并强化：语音识别 + LCS 相似度对答案。这是 GrowthOS 比新工具强的地方，别因为重构丢掉。

### Phase 3 · 补三个真空（4–5 天）

**3.1 输出页（费曼正确版）**

- `feynmanRecords` 扩展：`cardId?` / `stuckPoints[]` / `plainSummary`（100 字大白话）
- 流程固定三步：讲 → 标卡壳 → 写 100 字
- 产出不是"AI 打个分"，而是**一条"待补卡"建议**（不自动建卡，让用户自己建——提取动作必须由人完成）

**3.2 周复盘（新增 `WeeklyReviewView`）**

三个问题，一屏问完，存 `weeklyReviews` 表：

1. 这一周，哪一步我真的做到了？
2. 哪一步是伪努力（看了但没提取）？
3. 下周**只改哪一个变量**？

> 和老项目已有的「晚间灵魂复盘」分工：AI 日复盘负责"提问/扎心"，周复盘负责"做减法"。周复盘不允许 AI 给结论，只允许 AI 基于数据提问。

**3.3 项目实战看板（新增 `ProjectBoardView`）**

- `projects` 表：`{id, title, status, startAt, targetEndAt, milestones[], pitfalls[{problem, solution, at}]}`
- 一周一个小项目的硬约束：新建时默认 `targetEndAt = now + 7d`
- `pitfalls` 就是面试故事的原料库。可以一键"用这段讲一遍"跳到输出页
- 建议默认第一个项目：GrowthOS 自身的这次改造（手册第七章第 3 条原话就是"第一个项目就是你手上这个学习工具本身"）

### Phase 4 · AI 重新定位 + 视觉收口（3 天）

| 任务 | 动作 |
|---|---|
| `/api/extract-cards` | 从"一次生成 3 张"改为"1 张卡 + 3 个追问"；默认只落 1 张，其余进"候选池"等用户手建 |
| `/api/feynman` | 从"打分"改为"追问"：先指出你讲漏的 2 个点，再给术语密度提示；分数保留但降为次要信息 |
| 考官模式（新） | 卡片问题交给 AI 扮演考官追问 2 轮，答完再翻面。这就是新工具里"复制去问 AI"的正式实现 |
| 视觉收口 | 把新工具的**四档色语义**（红/橙/绿/青）和**卡片规格**（12px 圆角 + 1px 描边 + 极浅阴影）迁进 GrowthOS 的 surface 层；**主色 #1DB954 不动**（1 万行在用）；Noto Serif 只用于数字和大标题，正文继续用 DM Sans |

### Phase 5 · 可选：把两个 HTML 留作"产品说明书"

- 两个单文件 HTML 不动，作为「无账号离线试用版」+「交互原型」放进 `public/` 或单独仓库
- README 里给链接。它是求职作品集里的"设计过程产物"，比再造一份 PPT 有说服力

---

## 5. 删除 / 降级清单（ROI 最高的部分）

手册第三章原话：**"下面六个方法是全部内容，不再加第七个。"**

一个已经 11,000 行、6 个 tab、11 个 API 路由的项目，改造时最该干的事不是"再加三个功能"，是"砍掉三个入口"。以下按 ROI 排序：

| 处理 | 对象 | 理由 |
|---|---|---|
| 🗑️ 归档 | Vibe Coding 助手（`/api/vibe-coding`，323 行） | 与学习闭环无关，是另一个产品。留着只会让人以为这是"AI 代码工具" |
| ⬇️ 降级 | 五维能力雷达图 → 看板折叠区 | 看起来很专业，但不告诉你明天做什么 |
| ⬇️ 降级 | 6 大徽章 → 保留 2 枚（7 天/30 天出勤） | 徽章墙是"外驱动机"，与手册"最小承诺"的设计相反 |
| ⬇️ 降级 | AI 教练舱 → 「输出」页内的考官模式入口 | 1937 行的一级 tab，实际使用频率最低 |
| ⬇️ 降级 | 双链图谱 → 「制卡」页的视图切换 | 服务卡片关系，不服务每日动作 |
| ✅ 保留 | 白噪音 + 番茄钟 | 低成本、高留存，放进「今日」的专注区 |
| ✅ 保留 | Cmd+K 命令面板 | 降低摩擦，与手册理念一致 |
| ✅ 保留 | 语音主动回忆 + LCS 相似度 | 老项目最强的一处工程实现 |
| ✅ 保留 | Supabase 同步 + LWW + deletedRecords | 与学习方法论无关，但已经跑通，不要动 |

---

## 6. 风险与迁移注意

1. **四档 SM-2 是 breaking change。** 老卡片别重算历史 `interval`，只映射字段；`ease` 保留原值。写迁移单测，覆盖"老数据 → 新结构 → 队列构建"全链路。
2. **热力图数据源切换会有一段空白。** 从 `habitLogs` 切到 `reviewEvents` 后，历史复习记录为空。用 `habitLogs` 兜底填充到上线日，之后走 `reviewEvents`。
3. **6 tab → 5 tab 是用户可见的破坏性变更。** `CommandPalette` 的 `/goto` 命令、`mobile nav` 的 label 截断逻辑（`page.tsx:503-508` 那串 `.replace()`）、`isFullScreenMode` 判定都要同步改。
4. **不要为了改造去升级同步架构。** 现在的 LWW + `deletedRecords` 够用，CRDT 是另一个议题，别混进方法论改造里。
5. **每个 Phase 独立可发布。** Phase 1 上线后先观察一周再开 Phase 2——首屏改造的真实效果，只有真实用一周才知道。

---

## 7. 验收：怎么知道改造成功了

不看你加了多少功能，看三个数字：

| 指标 | 现状（估） | 目标 |
|---|---|---|
| 打开到"第一张卡翻面"的点击/决策数 | 6 次决策（WOOP 4 字段 + 能量 + 习惯） | ≤ 2 次 |
| 一天里进入的 tab 数 | 平均 2–3 个（分散） | 主路径 3 个连续（今日 → 复习 → 输出） |
| 连续 7 天有出勤的比例 | 受 Streak 归零影响，断一次即掉 | 只看出勤率，不看连续性；断一天不影响次日进入 |

---

## 8. 工作量

| Phase | 内容 | 预估 |
|---|---|---|
| 0 | 领域层 + 迁移契约 | 0.5 人日 |
| 1 | 换骨架（今日门禁 + 拆 DashboardView） | 4 人日 |
| 2 | 复习四档 + reviewEvents + 拆 FlowView | 3 人日 |
| 3 | 输出 / 周复盘 / 项目看板 | 5 人日 |
| 4 | AI 改追问 + 视觉收口 | 3 人日 |
| **合计** | | **≈ 15.5 人日** |

不含 Phase 5（可选）。Phase 5 已在实际执行中改为「补齐交错练习」，见文末附录。

---

*本文件为计划，不含代码改动。执行顺序建议严格按 Phase 0 → 1 → 2 → 3 → 4，Phase 3 的三块可以并行但不要早于 Phase 1 上线。*

---

## 附录 · Phase 0 执行记录（2026-10-26 完成）

**5. 「专注页」这个例外没有活下来。**

第一版留了两档宽度：文档页 840、复习页 560，理由是「一张卡就是全部内容」。
实际用下来，同一排页签点过去，正文宽度差 280px，像两个产品；复习页自己也没因此更好读
（卡片是固定 340 高，变窄只是把同样的字挤进更小的框里）。
所以 `--page-max-focus` 和 `.page-shell-focus` 整个删掉，全站只剩 `.page-shell` 一个壳。
**能删掉的例外，比能配好的例外更值钱。**

### 落地文件

| 文件 | 职责 |
|---|---|
| `src/lib/learning/types.ts` | 领域类型契约：`Rating` 四档、`RATING_META`、`ReviewState`、`ReviewEvent`、`WeeklyReview`、`Project`、`LearningSettings` |
| `src/lib/learning/sm2.ts` | 四档调度纯函数：`applyRating` / `easeDelta` / `createInitialState` / `isRating` |
| `src/lib/learning/queue.ts` | 每日队列：`buildDailyQueue`（到期 + 新卡配额）、`isNewCardState`、`clampNewCardLimit`、`dayKey` |
| `src/lib/learning/adapters.ts` | 防腐层：存储字段 ↔ 领域状态、`normalizeCardForV4` 迁移回填 |
| `src/lib/db.ts` | Dexie v4：`cards.type/example`、四张新表、`upgrade` 回填 |
| `src/lib/learning/__tests__/*.test.ts` | 36 个断言，`node --test` 实跑 |

### 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npm test` | 36 pass / 0 fail |
| 类型检查 | `npm run typecheck` | 0 error |
| 生产构建 | `next build` | ✓ Compiled，12 个路由全部生成 |
| Lint（新代码） | `eslint src/lib/learning` | 0 problem |

> `db.ts` 报的 1 error + 2 warning 是既有问题（`HabitLog.customData?: any`、hook 里未使用的参数），不是本次引入。

### 两处刻意偏离原计划（附理由）

**偏离 1：存储字段不改名。**

计划 1.4 节写的是「改名不改意，v4 迁移时做映射」。实际执行时改成：**存储层保留 `ease / reps / interval / nextReview`，领域层用 `easeFactor / repetitions / interval / due`，由 `adapters.ts` 翻译。**

理由：这三个字段名同时被 `FlowView`（SM-2 评分）、`StatsView`、`BrainView`、`db.ts` 的索引声明、Supabase 同步脚本引用。改名的收益只是命名好看，成本是三个组件同时编译失败 + 一次全表字段迁移 + 同步冲突。**Phase 0 的承诺是「不动 UI」，改名会直接违约。** 防腐层的成本只有 90 行，比改名的连锁反应便宜得多。

**偏离 2：「困难」不按标准 SM-2 实现。**

标准 SM-2 里 q=3 仍然按 EF 累乘（只是 EF 掉 0.14）；手册 4.5 节要求的是「缩短间隔，提前再见」。所以实现成：

```
困难 → interval = max(1, round(max(上次间隔, 1) × 1.2))
良好 → interval = 标准 SM-2 推进（1 天 → 6 天 → ×EF）
简单 → interval = max(良好 + 1, round(良好 × 1.3))
```

关键设计：困难档用「上次间隔 × 1.2」而不是「默认推进值 × 系数」，这样**无论卡片处于哪个阶段，困难档都严格短于良好档**（有单测守着这条）。这也是「简单」首次直接给 3 天的原因——手册要求「减少重复次数」，1 天不足以表达。

### 一个容易踩的坑（已用测试钉住）

**「新卡」不能用「没有复习记录」来判定。** 因为「忘记」会把 `reps` 归零，但 `interval` 变成 1——如果按 `reps === 0` 判新卡，那些你刚忘掉的卡下次会被当成新卡重新放行，既绕过配额又重复消耗注意力。

正确判定是 `repetitions === 0 && interval === 0`。对应的回归测试名：`「忘记」过的卡是熟面孔，不能当新卡重复放行`。

### 未做（属于后续 Phase，不要误以为是遗漏）

- `ReviewView` / `TodayView` 等 UI：Phase 1–2
- 读到 `reviewEvents` 的热力图：Phase 2（数据源切换时用 `habitLogs` 兜底填到上线日）
- 交错练习混排：Phase 3（`Card.type` 索引已就位）
- Dexie `upgrade` 的真机验证：需要有数据的浏览器（现有数据是 v3），已用纯函数幂等测试覆盖逻辑风险


---

## 附录 · Phase 1 执行记录（2026-10-26 完成）

### 落地文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/components/today/TodayView.tsx` | 220 | 首屏编排：门禁 + 四张往下的卡 |
| `src/components/today/TaskGate.tsx` | 88 | 首屏唯一的主角（一句话 + 一个按钮 + 一句免责） |
| `src/components/today/WoopCard.tsx` | 340 | WOOP 三态折叠卡 + 主动打开的表单（已去掉强制弹窗） |
| `src/components/today/EnergySlider.tsx` | 85 | 常驻面板 → 可展开胶囊 |
| `src/components/today/HabitGrid.tsx` | 300 | 习惯矩阵（行为等价，只是挪到第二屏） |
| `src/components/today/AiTasksPanel.tsx` | 250 | AI 排程（默认折叠） |
| `src/components/today/NightReflection.tsx` | 250 | 晚间复盘（默认折叠，去掉施压措辞） |
| `src/lib/learning/gate.ts` | 130 | 门禁文案与动作的纯函数（三分支，有单测） |
| `src/lib/learning/attendance.ts` | 240 | 出勤窗口 / 出勤率 / 两枚里程碑（替代 streak） |
| `src/lib/learning/settings.ts` | 95 | 设置读写 + 缺行兜底 + `useLearningSettings` |
| `src/lib/db.ts`（改） | +25 | 新增 `upsertDailyRecord`，消灭 4 处字段逐个兜底的写法 |
| `src/app/page.tsx`（改） | −35 | 删掉 800ms 强制弹窗；导航改口语化；默认 tab 换 TodayView |
| `src/components/StatsView.tsx`（改） | −120 | 删除 streak / 4 枚徽章，改 30 格出勤 + 出勤率 |
| `src/components/FlowView.tsx`（改） | +25 | 复习队列改走 `buildDailyQueue`，与门禁数字对齐 |
| `src/components/BrainView.tsx`（改） | +20 | 制卡页当日限额提示（不阻断） |
| `src/components/SettingsView.tsx`（改） | +40 | 每日新卡上限的 +/- 控件 |
| `src/components/CommandPalette.tsx`（改） | 路由表 | `/goto` 与 5+1 导航同步 |
| `DashboardView.tsx` | 删除 | 1493 行拆解完毕，无残留引用 |

### 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npm test` | 55 pass / 0 fail（新增 19 个：gate 8 + attendance 11） |
| 类型检查 | `npm run typecheck` | 0 error |
| 生产构建 | `next build` | ✓ 12 个路由全部生成 |
| Lint（`today/` + `lib/learning`） | `eslint` | 0 error / 0 warning |
| Lint（StatsView） | `eslint` | 0 error（原 28 个错误里它占 0） |

> 剩余 lint error 全在 `BrainView / FlowView / SettingsView / CommandPalette` 的历史代码里（`no-explicit-any`、`set-state-in-effect`），本次未新增。

### 首屏的真实变化

| | 改造前 | 改造后 |
|---|---|---|
| 首屏元素 | WOOP 强弹窗 + 能量面板 + WOOP 卡 + 习惯矩阵 + 复习卡 + AI 排程 + 晚间复盘 | 门禁 + 一个按钮 + 一句「断了不补」 |
| 到第一张卡的决定数 | 6 次（WOOP 4 字段 + 能量 + 习惯） | 1 次（点按钮） |
| 无卡可做时 | 「开始复习」灰按钮，无出路 | 主按钮变成「再制一张/做第一张卡」 |
| 断链叙事 | 「已连续打卡 N 天 🔥」 | 「近 30 天你来了 18 天」 |

### 三处刻意偏离 / 判断

**1. 没有一次性把 6 tab 砍成 5 tab。**
计划里 5 tab 是终态，但它依赖 Phase 2 的 `ReviewView` 和 Phase 3 的「输出 / 项目」。现在只做**改名 + 排序**（今日 / 复习与专注 / 制卡与图谱 / AI 教练 / 看板 / 设置），让导航先按「一天的动作」说话；真正的拆分在 Phase 2 做。避免出现「tab 叫复习，点进去还是番茄钟」的假承诺。

**2. 顺手改了 FlowView 的复习队列。**
原计划这属于 Phase 2，但改完首屏会出现一个立刻可见的矛盾：门禁说「今天 2 张」（配额截断），点进去复习页显示 4 张（老逻辑是「所有 nextReview <= now」，含全部新卡）。**门禁说的话必须和复习页一致**，否则首屏的可信度当场归零。所以把 `reviewCards` 换成 `buildDailyQueue`，只动查询、不动 UI，风险可控。

**3. 能量的回填不用 effect。**
改成 `energyOverride ?? todayRecord.energyLevel ?? 5`。好处是不需要「记录回写 → effect → setState」的同步链（这条链会让滑块在拖动时被旧值弹回去），也顺手绕开了 `react-hooks/set-state-in-effect`。WOOP 表单同理：表单状态放在随弹窗挂载的子组件里，`useState` 初值即回填，不需要 effect。

### 已知缺口（明确留给 Phase 2）

- **复习仍是三档（1/3/5）**：`FlowView.handleSM2Rating` 还没接 `applyRating` 的四档。Phase 1 只保证了「队列数量」一致，还没保证「评分档位」一致。
- **`reviewEvents` 还没开始写**：所以门禁里的 `newIntroducedToday` 恒为 0，热力图也还没有复习数据源。
- **UI 未做浏览器实测**：沙箱里 Chromium 起不来（GPU/sandbox 限制），只验证了编译、类型、单测与 SSR 返回 200。首屏视觉效果需要你本地打开确认一次。

---

## 附录 · Phase 2 执行记录（2026-10-26 完成）

### 落地文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/components/review/ReviewsView.tsx` | 243 | 编排：进度、切换、空态/完成态分支 |
| `src/components/review/ReviewCard.tsx` | 171 | 3D 翻面卡；回忆状态随卡挂载自动重置 |
| `src/components/review/RecallPanel.tsx` | 209 | 语音 + 打字 + 核对；手写 Web Speech 类型，零 `any` |
| `src/components/review/RatingBar.tsx` | 84 | 四档评分，按钮上直接印下次间隔 |
| `src/components/review/TypePrompt.tsx` | 65 | 「这题在考什么」翻面前必答一步 |
| `src/components/review/SessionDone.tsx` | 104 | 完成页：事实陈述，不做颁奖典礼 |
| `src/lib/learning/review.ts` | 170 | 评分 → 卡片补丁 + 事件；间隔预览；新卡计数 |
| `src/lib/learning/review-store.ts` | 83 | 事务落库（卡片 + 事件同生共死） |
| `src/lib/learning/recall.ts` | 136 | LCS / 高亮 / HTML 转义（修掉老实现的 XSS） |
| `src/lib/learning/use-daily-queue.ts` | 92 | 队列唯一来源，门禁与复习页共用 |
| `src/lib/learning/sm2.ts`（改） | — | 修「困难」档把卡钉死在 1 天的缺陷 |
| `src/lib/learning/adapters.ts`（改） | +15 | 新增 `StoredReviewPatch`，实现「读宽写严」 |
| `src/components/FlowView.tsx`（改） | 1215 → 678 | 摘掉复习分支（−537 行），只剩番茄钟 + 白噪音 + 费曼 |
| `src/components/today/TodayView.tsx`（改） | −45 | 队列改走 `useDailyQueue`；主按钮直接跳 `review` |
| `src/lib/store.ts`（改） | — | `AppTab` 加 `review`；删除死状态 `isReviewMode` |
| `src/app/page.tsx`（改） | +30 | 新路由；移动端底栏 5 + 「更多」 |
| `src/components/BrainView.tsx`（改） | +60 | 题型选择、「一个例子」字段、正面多问号软提示 |
| `src/components/CommandPalette.tsx`（改） | — | `/goto` 路由表加 review；`/review` 命令改跳新页 |

### 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npm test` | **80 pass / 0 fail**（新增 25 个：review 10 + recall 12 + sm2 3） |
| 类型检查 | `npx tsc --noEmit` | 0 error |
| 生产构建 | `next build` | ✓ 12 个路由全部生成 |
| Lint（新代码） | `eslint src/components/review src/lib/learning` | **0 error / 0 warning** |
| 浏览器冒烟 | headless 截图 | 导航层通过（7 项 + 移动端 5+更多），卡片区被虚拟时钟冻在骨架屏，无法确认 |

### 三个结构性修正

**1. 复习不再用「下标」索引活队列。**
老代码 `reviewCards[currentCardIndex]`，而 `useLiveQuery` 的队列是活的：评完一张，它的 `nextReview` 变成未来，队列立刻少一张，下标却不动——于是会跳卡、会漏卡。现在改成「永远取还没评过的第一张」，评过的进 `ratedIds`，队列自己缩短。进度分母是 `已评 + 待评`，不是 `queue.total`（否则进度条永远停在 0%）。

**2. `reviewEvents` 与卡片更新放在同一个事务里。**
半成功状态最难受：卡片间隔推进了，但统计里少一次复习，既没法重做也没法修。Dexie 的 `transaction` 保证两者同生共死。

**3. 「先说后看」默认关闭，能力不做嗅探。**
老代码在 effect 里检测 `SpeechRecognition` 支持并 `setState`，既触发 `set-state-in-effect`，又会在 SSR/CSR 之间水合不一致。现在改成「点了才知道」：拿不到构造函数就降级提示打字。

### 四处刻意偏离 / 判断

**1. 修了 Phase 0 的算法缺陷。**
`HARD_GROWTH = 1.2` 在 `interval=1` 时 `round(1.2)=1`，于是「困难」会把卡永久钉在每天一次（1→1→1）。这不是「提前再见」，是「永远再见」，而且**专门惩罚如实自评的人**：诚实点困难的人被卡住，虚报良好的人推进得快。任何惩罚诚实的设计，最后都会让人学会不诚实。
改成 `min(baseline, max(上次间隔+1, 上次间隔×1.2))`：下限保证每天变长，上限保证永远不超过良好。三条测试守着（严格递增 / 不超过良好 / 新卡两档同为 1 天）。

**2. 翻面前多了一次必答点击。**
「这题在考什么」挡在翻面和答案之间，选完才翻。多这一下是有意的：翻开答案之后再问「考什么」没有意义，只有信息不足时判断一次才练得到识别题型。同时保底给了「说不清，直接看答案」的逃生门——不给逃生门的强制步骤，用户会用关页面来逃，那时连数据都没有。

**3. 移动端底栏不是 7 个。**
7 个入口每个只有 53px，两字标签都挤不下。改成前 5 个 + 「更多」，第 6 格直接开命令面板（`/goto` 已覆盖全部页面）。

**4. 顺手修了老实现的 XSS。**
`highlightMatchedText` 原来把用户口述（语音转写/打字）原样拼进 `dangerouslySetInnerHTML`，说一句 `<img onerror=...>` 就能执行脚本。现在先转义再上色，有测试守着。

### 已知缺口（留给 Phase 3）

- **交错练习还没有数据可混排**：`card.type` 现在开始积累（制卡时选、复习时押），但要跑交错练习至少需要几十条带类型的卡。算法本身也还没写。
- **费曼页仍是「AI 打分」**：`feynmanRecords` 只加了 `cardId` 索引，三步流程（讲 → 标卡壳 → 写 100 字大白话）和「待补卡建议」都在 Phase 3。
- **卡片渲染未经真人验证**：headless 只确认到导航层与骨架屏。**复习卡片的翻面、语音面板、四档按钮的实际手感需要你本地打开看一眼**——尤其 340px 固定高度在窄屏是否够用。
- **`ReviewEvent` 没有「题型押注」字段**：押的题型写回 `card.type`，事件流里不单独留痕。如果以后想分析「押错率」，需要再加一个可选字段。

---

## 附录 · Phase 3 执行记录（2026-10-26 完成）

### 落地文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/lib/learning/feynman.ts` | 252 | 三步校验、句子切分、术语/缩写检测、待补卡建议 |
| `src/lib/learning/weekly.ts` | 256 | 周边界、周汇总、**基于数据的提问**、三问校验 |
| `src/lib/learning/projects.ts` | 202 | 7 天契约、进度、健康度、难题→故事、可否收尾 |
| `src/components/output/OutputView.tsx` | 274 | 三步编排 + 存盘 + 历史载入 |
| `src/components/output/StepSpeak.tsx` | 95 | 第一步：写题目 + 讲（不预填正文） |
| `src/components/output/StepStuck.tsx` | 154 | 第二步：点选卡壳句 + 手写补充 |
| `src/components/output/StepPlain.tsx` | 98 | 第三步：100 字，带字数与术语反馈 |
| `src/components/output/OutputDone.tsx` | 136 | 完成态：一条待补卡建议 + 复制 + 去制卡 |
| `src/components/output/OutputHistory.tsx` | 106 | 历史：标「未补卡 / 已补卡」不给分数 |
| `src/components/board/BoardView.tsx` | 70 | 看板三视图（项目 / 周复盘 / 数据） |
| `src/components/board/ProjectBoard.tsx` | 117 | 项目列表与新建 |
| `src/components/board/ProjectCard.tsx` | 281 | 里程碑 + 难题—解法 + 收尾动作 |
| `src/components/board/ProjectForm.tsx` | 103 | 新建表单（没有「周期」输入框） |
| `src/components/board/WeeklyReviewPanel.tsx` | 270 | 三问 + 数据提问 + 往期 |
| `src/components/today/FocusPanel.tsx` | 285 | 番茄钟 + 白噪音（从 FlowView 抽出，降级为折叠卡） |
| `src/components/FlowView.tsx` | **删除** | 678 → 0：复习已在 Phase 2 迁走，费曼迁到 `output/`，番茄钟迁到 `today/` |
| `src/lib/store.ts`（改） | — | `AppTab` 收口为 6 个（去掉 flow/stats）；新增 `outputSeed` |
| `src/app/page.tsx`（改） | — | 接 output / board；去掉全屏模式；移动端 4 + 更多 |
| `src/components/StatsView.tsx`（改） | +14 | 新增 `embedded` 开关，嵌进看板时不再套第二层滚动与页头 |
| `src/components/CommandPalette.tsx`（改） | — | `/goto` 路由表同步；AI 教练留作「旧入口」 |

### 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npm test` | **127 pass / 0 fail**（新增 47 个：feynman 14 + weekly 17 + projects 16） |
| 类型检查 | `tsc --noEmit` | 0 error |
| 生产构建 | `next build` | ✓ 12 个路由全部生成 |
| Lint（新代码） | `eslint output/ board/ today/ lib/learning` | **0 error / 0 warning** |
| SSR 冒烟 | `curl` | 200（页面首屏是鉴权骨架，看不到正文，见下方缺口） |

### 三个结构性判断

**1. 输出页不接 AI 打分，改接「一条待补卡建议」。**
老 FlowView 的费曼板是「写完 → `/api/feynman` → 85 分 + 三条建议」。分数是终点，而学习需要下一步。现在三步全部不依赖 AI：讲 → 标卡壳 → 写 100 字，产出物是**一条**建议，且不自动落库。系统代劳建卡等于删掉「提取」这个最有效的动作。

**2. 周复盘只有两问来自数据，而且都是疑问句。**
`buildDataQuestions` 最多返回 2 条，每条都把「是 A 还是 B」两个归因方向摆出来（「是卡写得太细，还是复习时状态不对？」）。只问「为什么这周这么差」的复盘，人只会防御。三条固定问题里第三问在数据结构上只能填一个字符串——多填就是没有重点，所以另加「并列词检测」提醒，但不阻塞。

**3. 番茄钟从一级 tab 降级为今日页的折叠卡。**
番茄钟是工具，不是目的地。老项目把它做成独立页面，于是「专注」变成一个要去的地方，而不是做卡时顺手按的按钮。同时删掉 `isFullScreenMode` 那一整套「专注模式下隐藏侧边栏」的分支——一个折叠卡不需要沉浸模式。

### 四处刻意偏离

**1. 没做「骨架地图」。**
计划里看板要放四块（项目 / 骨架 / 周复盘 / 出勤）。骨架地图（知识依赖关系图）需要先有卡片之间的依赖边，而现在 `linkedCards` 只是双向链接，不是「前置—后继」。硬做只会得到一张漂亮的毛线球，所以先不做，留给「制卡页的图谱视图」在 Phase 4 一起收。

**2. AI 教练没有直接删，而是留了「旧入口」。**
1937 行的 `CoachView` 里还有真在用的能力（复盘提问、单卡追问）。Phase 4 才做「考官模式」，现在直接砍会让功能真空。所以：主导航移除、输出页右上角留一个「让 AI 追问」、命令面板保留 `/goto coach`。等考官模式上线后再删。

**3. 待补卡建议用「复制 + 跳转」，没有一键预填制卡表单。**
预填需要 BrainView 接一个 seed 通道，属于额外改动；而且「自己把问题敲一遍」本身就是提取。先用复制，等 Phase 4 统一制卡入口时再决定要不要预填。

**4. 数据区复用 StatsView，而不是重写。**
加了 `embedded` 开关（14 行），比把 763 行重写便宜得多，也避免出勤格子出现两套实现。

### 已知缺口

- **交错练习仍未实现**：`card.type` 已在积累（制卡时选、复习时押），但混排算法没写。这是六项方法里唯一还没落地的一项。
- **项目看板没有「骨架地图」入口**：见上方偏离 1。
- **输出页没有接语音**：第一步只有打字。`RecallPanel` 里已有 Web Speech 实现，Phase 4 可以直接搬。
- **UI 仍未真人验证**：只验证了编译、类型、单测与 SSR 200。三步流程的观感（尤其 100 字那屏的反馈密度）需要你本地打开看一眼。
- **`/api/feynman` 已无调用方**：旧接口还留着，Phase 4 要把它从「打分」改成「追问」，届时再接回输出页。

---

## 附录 · Phase 4 执行记录（2026-10-26 完成）

### 落地文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/lib/ai/provider.ts` | 247 | provider 解析 + 25s 超时 + JSON 容错提取 + json 模式失败自动重试 |
| `src/lib/ai/contract.ts` | 300 | AI 返回垃圾时的规范化（提取 / 追问 / 考官三份契约）+ 本地降级提取 |
| `src/lib/learning/exam.ts` | 117 | 考官两轮状态机、薄回答判定、降级追问、锚点词抽取 |
| `src/lib/learning/probe.ts` | 109 | 候选池：建池、去重合并、上限裁剪、预填规则 |
| `src/app/api/extract-cards/route.ts` | 83（重写） | 从「3 张卡」改为「1 张卡 + 3 个追问」 |
| `src/app/api/feynman/route.ts` | 102（重写） | 从「打分」改为「追问」：gaps + terms，分数降为可选 |
| `src/app/api/exam/route.ts` | 127（新） | 考官追问接口，含无 Key 降级 |
| `src/components/review/ExaminerPanel.tsx` | 137 | 考官面板（纯展示，请求在 ReviewsView） |
| `src/components/brain/CandidatePool.tsx` | 105 | 候选池（空时整块不出现） |
| `src/lib/db.ts`（改） | +30 | v5：`cardCandidates` 表；`FeynmanRecord.aiGaps` 改为结构化 |
| `src/components/review/ReviewsView.tsx`（改） | +90 | 考官模式接入：开考、追问、两轮后自动翻面 |
| `src/components/output/OutputView.tsx`（改） | +60 | 完成页异步问 AI，结果回写记录 |
| `src/components/output/OutputDone.tsx`（改） | +55 | 「AI 追问 · 你漏了什么」区块，分数降为脚注 |
| `src/components/BrainView.tsx`（改） | +50 | 接新提取契约、候选池、「我来答」预填 |
| `src/components/StatsView.tsx`（改） | +40 | 删掉硬编码的「AI 教练诊断」，改自评分布事实 |
| `src/app/globals.css`（改） | +40 | 四档语义色 + 卡片规格 token + `.surface-card` + 衬线字体 |
| `src/components/review/RatingBar.tsx`（改） | — | 改用四档色 token，加色点 |
| `src/components/review/ReviewCard.tsx`（改） | — | 改用 `.surface-card`（12px + 1px 描边 + 极浅阴影） |
| `src/components/today/TaskGate.tsx`（改） | — | 大标题改用衬线 |
| `CoachView.tsx` / `api/chat` / `api/vibe-coding` / `Squares.tsx` / `DecryptedText.tsx` | **删除** | 1937 + 207 + 323 + 2 个装饰组件 |

### 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npm test` | **168 pass / 0 fail**（新增 41：contract 22 + exam 12 + probe 8，含 1 个测试文件未被 glob 收录的修复） |
| 类型检查 | `npm run typecheck` | 0 error |
| 生产构建 | `next build` | ✓ 通过（路由 8 个 + not-found；少了 chat / vibe-coding 两个） |
| Lint（新代码） | `eslint lib/ai lib/learning review output brain today` | **0 error / 0 warning** |
| 接口降级冒烟 | `curl /api/exam`、`/api/extract-cards`、`/api/feynman` | 三个都返回可用形状 + `fallback: true` |

### 三个结构性判断

**1. AI 只做「一张卡」，剩下的必须由人完成。**
`/api/extract-cards` 原来一次给 3 张完整卡、全部落库。那等于把「提取」这个最有效的动作交给机器，人只剩「点一下」。现在 1 张归它，3 个追问（**只有问题没有答案**）进候选池。契约里明确禁止模型把答案写进追问，`normalizeProbes` 还会再剥一次 `答：` 前缀——因为「带答案的追问」会被系统当成一张卡，那又绕回原点了。

**2. 分数保留但降级为脚注。**
`/api/feynman` 的主产物是 `gaps`（你没讲到的 2 点）和 `terms`（用了没解释的词），`score` 变成可选字段：模型不给就是 `null`，前端不许编一个 85。改造前那一屏最显眼的位置是一个大分数，人看完只会记住「85」。

**3. 考官模式只问，不给答案。**
两轮上限写在客户端（`exam.ts`）也写在服务端，两边都以「用户看得见的那一份」为准。回答很薄时不阻断提交，只提示——「忘了」也是一种诚实回答，而且它本身就是「这张卡该回炉」的强信号。

### 五处刻意偏离 / 判断

**1. 没把「候选池」做成待办列表。**
它是「还没提取完的输入」：不进复习队列、不占每日新卡上限、空的时候整块不出现。做成待办清单就等于给自己造了一份永远还不完的债，而手册把「欠账感」列为第 3 号弃坑机制。

**2. 候选池点了「我来答」不立即出池。**
真正的出池发生在**卡片保存成功的那一刻**。否则用户点一下「我来答」然后关掉页面，这条追问就凭空蒸发了。

**3. 首问不在 effect 里发。**
`ExaminerPanel` 改成纯展示组件，请求放在 `ReviewsView` 的点击处理器里。原因有两个：effect 里发请求会过不了 `set-state-in-effect`；而且真的会「点开面板先闪一下空白再出现问题」。

**4. 顺带删掉了 StatsView 里那段硬编码「AI 教练诊断」。**
它会建议用户「今晚 21:00 前往 AI 教练舱开启一次模拟演练」，而那个页面本轮已经删了。假数据 + 死链接比什么都不写更糟。改成本地事实：复习总次数 + 最常出现的自评档位。雷达图保留（它至少是由 `habitLogs` 算出来的真数据）。

**5. 视觉收口只做「新代码 + 卡片规格」。**
四档色与 `.surface-card` 应用在复习页（卡片隐喻最强的一屏）；老的 `rounded-2xl` 没有全局改成 12px——一次性换圆角会让整站看起来像换了套皮，而这一轮的产出应该落在行为上。衬线字体同理：只给了 token 和首屏大标题，没做全局替换。

**6. 没有引入 `next/font` 加载思源宋体。**
中文衬线字体体积大，构建期下载还会让离线构建失败。改用系统字体栈（macOS 自带宋体），只在装了的机器上生效——这是可接受的降级。

### 一个真实的配置问题（发现于冒烟）

`curl` 三个接口全部走降级，服务端日志给出原因：

```
[ai] openai 调用失败：http 404 Not Found (DEPLOYMENT_NOT_FOUND)
```

`.env.local` 里的 `OPENAI_API_BASE_URL` 指向一个**已下线的 Vercel 部署**。所以当前本地环境里三个 AI 功能都是降级态（本地追问 / 本地提取 / 本地术语检测），行为可用但不是真 AI。换成可用的 base URL，或填 `DEEPSEEK_API_KEY`，即可恢复。

顺带修了一个曾经踩过的坑：`response_format: json_object` 不是所有网关都支持，不支持会直接 400。现在 HTTP 失败会自动**去掉 json 模式重试一次**——否则就会出现「Key 配了、模型通了、功能永远降级」这种最难查的状态。

### 已知缺口

- **交错练习仍未实现**：六项方法里唯一没落地的一项。`card.type` 已在积累，但混排算法没写。
- **考官的对话内容没有落库**：`ReviewEvent` 里没有「追问记录」字段，所以「两轮都答很薄」这个信号只在当屏有效，评完就没了。要沉淀得给 `reviewEvents` 加可选字段（会让表结构再动一次）。
- **候选池不参与同步**：它没有 `updatedAt`、不进 Supabase 同步，换设备看不到。这是刻意的（追问是一次性的作业），但如果用户想跨设备，需要另议。
- **UI 仍未真人验证**：只验证了编译、类型、单测与接口降级。考官的节奏、候选池在 280px 左栏之外的位置、12px 圆角的观感，需要你本地看一眼。

---

## 附录 · Phase 5 执行记录（2026-10-27 完成）

### 先说结论：这一 Phase 换了内容

计划里的 Phase 5 是「把两个 HTML 留作产品说明书」。执行时发现两件事：

1. **源文件不在**。`学习方法手册.html` / `学习实践工具.html` 在当前机器上找不到（既不在项目里，也不在 `~/Desktop`、`~/Downloads`）。没有原件就复制不了一份「能打开的说明书」，硬造一份只会在 README 里留一条死链接——这正是 Phase 4 刚刚清理掉的那类东西（`StatsView` 的假诊断）。
2. **六项方法还差一项**。Phase 4 的已知缺口里写着「交错练习仍未实现：六项方法里唯一没落地的一项」。功能缺口比作品集包装紧急。

所以 Phase 5 改成补交错练习。HTML 留档挂起，等你把两个文件找回来（放到 `public/` 并告诉我一声即可，README 那条链接我来加）。

### 落地文件

| 文件 | 变化 |
|---|---|
| `src/lib/learning/interleave.ts`（新） | 交错排序纯函数：`mergeFresh` / `spreadByKey` / `resolveDimension` / `buildReviewSequence` / `describeSequence` |
| `src/lib/learning/__tests__/interleave.test.ts`（新） | 21 个断言 |
| `src/lib/learning/queue.ts` | `QueueCard` 加 `tags`（类型不足以区分时的回落分组键） |
| `src/lib/learning/use-daily-queue.ts` | 新增 `sequence`（已交错的顺序）、`meta`、`interleaving` 三个导出——**顺序也收敛到队列唯一来源** |
| `src/lib/learning/types.ts` | `LearningSettings` 加 `interleavingEnabled`，默认 `true` |
| `src/lib/learning/settings.ts` | `normalizeSettings` 补该字段（老数据缺字段时回落默认值，不需要再改表结构） |
| `src/components/review/ReviewsView.tsx` | 待评队列从 `[...due, ...fresh]` 改为读 `sequence`；卡片上方加一行「交错中 · 按题型混排」 |
| `src/components/SettingsView.tsx` | 加「🔀 交错练习」开关，说明块状练习与交错练习的差别 |

### 算法：为什么是「分桶轮询」而不是「相邻就换」

第一版写的是「扫一遍，发现相邻同组就往后找一张换过来」。它在 `AABB` 上完美：

```
A A B B  →  A B A B
```

但在 `AAABBBCCC` 上翻车：

```
A A A B B B C C C
→ A B A B A B C C C     ← 最后三张 C 连在一起
```

原因很实在：局部修补只看得见「前面已经乱好的部分」，等走到后面，剩下的全是 C，没有可交换的对象。而正确答案 `A B C A B C A B C` 从头到尾都在，只是「相邻就换」这个策略看不到它。

改成「每取一张，都从**剩余最多、且不同于上一张**的桶里取」：

```
AAABBBCCC  →  A B C A B C A B C    （零相邻）
AAAB       →  A B A A              （数学上限：A 占 3/4，必然 1 处相邻）
AABBBB     →  B A B A B B          （B 占 4/6，必然 1 处相邻，达成）
```

三级降级写在代码里，注释也留在原地：非中性桶 → 中性桶填空 → 破例允许相邻。

### 三个判断

**1. 分组键是「类型优先，tag 回落」，不是「两个一起用」。**

大多数用户的卡只有概念卡一种类型，此时类型维度是空操作。所以 `resolveDimension` 会检查「这一批里有几种类型」，少于 2 种就改用「字典序第一个 tag」当分组键；两样都凑不出 2 组，就返回 `"none"`，界面上那行「交错中」也不出现。

假提示比没有提示更糟——如果界面写着「交错中」而顺序压根没变，用户会觉得这个功能坏了。

**2. 不冻结整批顺序。**

评完一张卡，那张卡离开队列，`sequence` 会重算一次，顺序可能局部变化。想冻结得把会话状态落库（新表 or 给 `reviewEvents` 加字段），代价与收益不成比例。

关键是它**不影响正确性**：`ratedIds` 保证不重复评，队列本身保证不丢卡，用户看到的永远只是「下一张」。这一点写进了 `ReviewsView` 的注释，免得以后有人以为是 bug。

**3. 关掉开关 = 完全回到老顺序，包括新卡不插队。**

如果「关掉」只关类型混排、还留着新卡均分，那这个开关就没法验证——用户点两下看不出区别。「关闭」必须是一个能对照的状态：`[...due, ...fresh]`，先还完旧账再学新的。

### 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npm test` | **189 pass / 0 fail**（+21） |
| 类型检查 | `npm run typecheck` | 0 error |
| 生产构建 | `npm run build` | ✓ 通过，8 个 API 路由 |
| Lint | `eslint src/lib/learning src/components/review` | 0 problem |

真实数据下的效果（5 张到期 + 2 张新卡）：

```
关掉：d1 → d2 → d3 → d4 → d5 → f1 → f2      （新卡全在最后）
交错：d1 → f1 → d2 → d4 → d3 → f2 → d5      （零相邻，新卡落在第 2 和第 6 位）
```

### 六项方法的落地状态（收口）

| 方法 | 落地位置 | 状态 |
|---|---|---|
| 间隔重复 | `sm2.ts` + `queue.ts` + `review-store.ts` | ✅ |
| 主动回忆 | `recall.ts`（语音 + LCS）+ 复习页「先说后看」 | ✅ |
| 交错练习 | `interleave.ts` + 复习页顺序 | ✅ 本轮补齐 |
| 费曼输出 | `feynman.ts` + `/api/feynman` + 输出页三步 | ✅ |
| 每周复盘 | `weekly.ts` + 看板周复盘面板 | ✅ |
| 项目实践 | `projects.ts` + 看板项目卡 | ✅ |

### 本轮遗留

- **HTML 留档未做**：等源文件回来。
- **UI 仍未真人验证**：交错那行提示的位置（卡片正上方）需要你本地看一眼；`text-[10px]` 在浅色主题下可能偏淡。

---

## 附录 · 收尾：缺口清点（2026-10-27）

Phase 5 之后又问了一遍「还有缺口吗」，查出三类：能修的、要你决定的、故意留的。

### A. 已修（这一轮做了）

**A1. 两个老路由绕过统一 AI 层**

`/api/review` 和 `/api/generate-tasks` 各自读 `process.env`、各自手写 `fetch`。而 Phase 4 新建的 `provider.ts` 已经处理了三件它们没处理的事：

| | 老路由 | 统一层 |
|---|---|---|
| 超时 | 无（请求挂死就一直挂着） | 25s AbortController |
| `response_format: json_object` 被网关拒绝 | 直接降级 | 自动去掉重试一次 |
| 日志 | `"调用失败"` 一句 | `[ai] openai 调用失败：http 404 <上游原文>` |

第三条是致命的：配置错了，日志里看不出来是超时、是 401、还是模型名写错。现在两个路由都走 `chatJSON()`。

顺带修掉的：
- `HabitItem.customData?: any` → 具体形状（`sets/mood/notes/contact/topic/reflect/followUp`）。原来字段名写错（比如 `moods`）会静默取到 `undefined`，于是 prompt 里出现「状态：undefined」而 AI 照样输出。
- `generate-tasks` 里算好了 `uncompletedReport`（打卡率 < 60% 的习惯）却没用进 prompt，现在补上了——这本来就是写它的目的。
- 新增 `normalizeTaskDrafts()`：没有 name 的任务直接丢（原来会补一句「AI 规划任务」这种空壳），`energyDemand` 越界落 `medium`（这个值会拼进 className），缺 id 补一个。
- 7 个新单测覆盖上述规则。

**A2. README 重写**

旧 README 有 5 处硬伤，都是会让人「照着做但做不成」的那种：

| 问题 | 旧 | 新 |
|---|---|---|
| 环境变量名 | `NEXT_PUBLIC_OPENAI_API_KEY` | `OPENAI_API_KEY`（加 NEXT_PUBLIC 会把密钥打进客户端包） |
| WOOP | 「加载 800ms 后强制弹出」 | 已删掉强制弹窗 |
| 勋章墙 | 「6 大成就勋章」 | 已删，改成 30 格出勤 |
| 评级 | 「1/3/5 分」 | 四档 0/3/4/5 |
| 已删页面 | `CoachView`、`/api/chat`、`FlowView` | 改为六方法 ↔ 六页面的对照表 |

另外删掉了「可用率 99.9%」「LCP 降低 40%」这类没法验证的数字——简历上写这种数，面试官一问就露。

### B. 需要你决定 / 提供

| # | 缺口 | 说明 |
|---|---|---|
| B1 | **AI 全部降级** | `.env.local` 的 `OPENAI_API_BASE_URL` 指向 Deno Deploy Classic，该服务 **2026-07-20 已停服**，日志原文：`DEPLOYMENT_NOT_FOUND`。换成 `https://api.openai.com/v1` 或填 `DEEPSEEK_API_KEY` 即可恢复真 AI。 |
| B2 | **两个 HTML 源文件** | `学习方法手册.html` / `学习实践工具.html` 在本机找不到，Phase 5 的留档没做。 |
| B3 | **UI 真人验证** | 所有验证都是编译 / 类型 / 单测 / 接口降级。这些能证明不崩，不能证明好用。 |

### C. 故意留的（不是漏做）

| # | 缺口 | 理由 |
|---|---|---|
| C1 | 考官对话不落库 | 要沉淀得给 `reviewEvents` 加字段（表结构再动一次）。当前的信号「两轮都答很薄」在当屏已经提示过，落库的边际收益低于迁移风险。 |
| C2 | 同步只覆盖 4 张表 | `reviewEvents` / `projects` / `weeklyReviews` / `cardCandidates` 只在本地。跨设备看复习统计会缺数据。做全量同步要处理冲突合并，属于另一个议题。 |
| C3 | `db.ts:39 customData?: any` | 这个 `any` 会传染到 6 个组件。收紧它需要同步改 `SettingsView` / `HabitCard` / `SpecializedRecordModal`，收益是类型安全，成本是碰一遍老代码。评估后没做。 |

### 验证结果

| 检查 | 结果 |
|---|---|
| `npm test` | **196 pass / 0 fail**（+7） |
| `npm run typecheck` | 0 error |
| `npm run build` | ✓ 通过，8 个 API 路由 |
| `eslint src/lib src/app/api src/components/review` | 1 error，为 `db.ts` 既有 `any`（见 C3） |
| 接口冒烟 | `/api/review` 返回 3 条本地问题；`/api/generate-tasks` 返回 2 条本地任务 + `isFallback: true` |

---

## 附录 · 收口：把「故意留的」收掉（2026-10-27）

上一轮把缺口分成 A（已修）/ B（等你）/ C（故意留）。这一轮把 C 里的两条也做掉了，
并把全仓 lint 从 **29 error / 30 warning** 收到 **0 / 0**。

### 一、lint 清零：29 个 error 里没有一个是「新代码的错」

`npx eslint .` 之前只跑了 `src/lib`、`src/app/api`、`src/components/review` 三个目录，
所以 Phase 0–5 的「0 problem」是这三个目录的，不是全仓的。全仓跑一遍才发现
`page.tsx` / `BrainView` / `SettingsView` / `SpecializedRecordModal` 里还压着 29 个 error，
其中 26 个是 `any`，3 个是 `set-state-in-effect`。

**修法按「这个 any 在掩盖什么」分三类，不是统一换成 unknown。**

| 位置 | 原来 | 现在 | 为什么不是随便换个类型 |
|---|---|---|---|
| `page.tsx` fetch 拦截器 | `(window as any).__fetchIntercepted`、`(input as any).url` | `declare global { interface Window { __growthOSFetchPatched?: boolean } }`；`input instanceof Request ? input.url` | `input` 只有三种形态（string / URL / Request），第三种摸 `.url` 是确定成立的，不需要断言 |
| `SettingsView` 同步层 | `habitsToCloud: any[]` 等 8 个数组 | `HabitRow` / `HabitLogRow` / `CardRow` / `DailyRecordRow` 四个行类型（snake_case 列名） | 往 `HabitRow[]` 里 push 字面量有额外的属性检查：`depends_on` 写成 `depend_on` 当场编译报错。原来的 `any[]` 让这种错**在同步"成功"之后**才暴露 |
| `BrainView` TipTap / React Flow | `findBiLinks(doc: any)`、`({ data }: any)`、`(instance: any)` | `PMNode`、`NodeProps<FlowNode<CardNodeData, "cardNode">>`、`ReactFlowInstance` | 节点数据用 `type` 别名而不是 `interface`——React Flow v12 的 `Node<T>` 要求 `T extends Record<string, unknown>`，只有 type 别名才有隐式索引签名 |
| `SpecializedRecordModal` | `onSave: (customData: any)`、`setFitnessMood(x as any)` | 新建 `src/lib/habit-data.ts` 的 `HabitCustomData` | 这个形状被三方共用（写库 / 填表 / 拼 prompt）。各写一份是最坏的选择：组件改了字段名，prompt 那边还在读老字段，TS 一个错都不报 |

**`db.ts` 的 `customData?: any` 就是 C3**。修它不需要「碰一遍老代码」——
真正的成本在于没有一个共同的类型。补上 `habit-data.ts` 之后，`db.ts` / `Modal` / `HabitGrid`
三处 import 同一个接口即可，改动量 30 行左右。

### 二、三个 `set-state-in-effect` 是三种不同的病

规则名一样，成因完全不同，所以修法也不能一样：

**1. `CommandPalette`：搜索词变了要重置高亮索引。**

原来是 `useEffect(() => setSelectedIndex(0), [search])`。它有个隐蔽的 bug：
搜索词先变、渲染一轮（此时 `commandItems[selectedIndex]` 可能已经越界），
effect 才把索引改回 0。回车正好落在这一帧，就点空了。
改成 `applySearch()`——搜词和归零是同一次事件里的两次 `setState`，React 合并成一次渲染，
中间那一帧不存在。

**2. `SpecializedRecordModal`：打开时把 9 个表单字段重置。**

这是「把 props 的变化同步进 state」，React 明确不建议。改成父组件传
`key={habitId-openState}` 强制重挂载：习惯一换组件重建，所有 state 天然回到初始值，
**不可能漏写某个字段**。原写法漏一个字段的后果是「上次的输入粘到了这次」。

**3. `BrainView`：选中卡片变了要回填表单。**

这个最值得说。原 effect 有两个问题：
- 它在提交之后才跑，中间存在一帧「列表已选中第 3 张、右边表单还是第 2 张」。
  手快的人在这一帧按保存，就存到新卡上去了。
- 依赖数组里有 `cards`，所以每次 liveQuery 回推（哪怕只是别的卡改了）都重填一遍，
  把正在编辑的内容覆盖掉。

改成渲染期按「表单当前对应哪张卡」修正（`formCardId !== selectedCardId` 才动手）：
同一个渲染里就是对的，且只有 id 真的变了才回填。

### 三、顺手修掉的一个真性能问题

`const cards = useLiveQuery(() => db.cards.toArray()) || []` 这种写法在
`StatsView` / `BrainView` / `CommandPalette` 里各出现了一次或多次。

问题不在功能，在**那个 `[]` 每次渲染都是新引用**：数据还没到的时候，
下游所有以 `cards` 为依赖的 `useMemo` 全部失效。`react-hooks/exhaustive-deps`
把它报成了 13 条 warning，措辞是「logical expression could make the dependencies change on every render」。

拆成两行解决：

```ts
const cardsRaw = useLiveQuery(() => db.cards.toArray());
const cards = useMemo(() => cardsRaw ?? [], [cardsRaw]);
```

顺带把 `StatsView` 里写在组件体内的 `radarDimensions` 提到模块级——
它是个常量数组，写在组件里等于每帧新建，做依赖会把 `useMemo` 的缓存打穿。

### 四、C1 兑现：考官问答落库

上一轮判定「收益低于迁移风险」，重看之后结论反了——因为**不需要动表结构**。
`reviewEvents` 是非索引字段自由的（Dexie 只按 `cardId` / `at` 建索引），加一个可选字段不用升版本。

| 文件 | 变化 |
|---|---|
| `learning/types.ts` | `ExamTurn` 从 `exam.ts` 挪进来（`ReviewEvent` 要引用它），`ReviewEvent.exam?: ExamTurn[]` |
| `learning/exam.ts` | 改为 `import type { ExamTurn } from "./types"; export type { ExamTurn };`，对外接口不变 |
| `learning/review-store.ts` | `recordReview(cardId, rating, { exam })`；**事件对象在同一个事务里带 exam 写入**，空数组不写（否则「有没有走考官」这个信息失真） |
| `components/review/ReviewsView.tsx` | `handleRate` 把 `examTurns` 一起交出去（`finally` 里会清空，必须在这一刻给） |
| `components/review/SessionDone.tsx` | 多一句事实：「其中 N 张在翻面前先答了两轮」 |
| `learning/review.ts` | `summarizeSession` 增加 `examined` 计数 |

这里有个容易做错的点：`finishExam` 在答完第二轮时就把 `examTurns` 设好了，
但用户**答完可以不改评分直接看答案**，也可以中途跳过。只有真给了评分，
那两轮才和一次复习事件绑定。所以落库点放在 `handleRate` 而不是 `finishExam`。

### 五、C2 兑现一半：卡片题型参与同步

查 `supabase/migrations/20260525000000_init_sync_tables.sql` 才发现一个比「4 张表没同步」更隐蔽的问题：

**`supabase_cards` 建表时有 front / back / tags / linked_cards / reps / interval / ease / next_review，就是没有 v4 新加的 `type` 和 `example`。**

后果不是报错，是**静默丢失**：换一台机器登录，卡片都在、复习进度也在，
但题型全空 —— 交错练习退化成「按 tag 混排」，界面上还会显示「交错中」。
这比直接报错难查得多。

修法：

1. 新增 `supabase/migrations/20261027000000_add_card_type_example.sql`
   （`ADD COLUMN IF NOT EXISTS`，幂等，SQL Editor 里跑一遍即可）。
2. 同步的 push / pull 两侧都带上这两列。
3. **老库兜底**：upsert 如果因为缺列失败（`PGRST204` / `42703`），
   把 `type`/`example` 摘掉重试一次。题型丢了可以补，整次同步失败会连
   front/back 和复习进度都传不上去——那才是真丢数据。
4. 兜底触发时在成功 toast 里补一句，告诉用户跑哪条 SQL，而不是静默降级。

判定逻辑单独抽成 `src/lib/sync-errors.ts` 并配 5 条测试。**只认这两个错误码和一条明确的文案**，
权限错误 / 主键冲突 / 外键错误照旧抛出——把网络问题当成「缺列」吞掉，
用户会以为同步成功，实际一条都没写进去。

### 六、测试 glob 改成递归

`"test": "node --test src/lib/learning/__tests__/*.test.ts src/lib/ai/__tests__/*.test.ts"`

这是**第二次**被这个写法坑（上一次是 `src/lib/ai/__tests__` 整个目录漏跑，127→168 才暴露）。
这轮新增 `src/lib/__tests__/` 又差点漏掉。改成：

```
node --test "src/**/__tests__/*.test.ts"
```

一条递归 glob，新增测试目录不用再改 `package.json`。

### 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npm test` | **202 pass / 0 fail**（+6） |
| 类型检查 | `npm run typecheck` | 0 error |
| 生产构建 | `npm run build` | ✓ 通过，8 个 API 路由 |
| **全仓 lint** | `npx eslint .` | **0 problem**（29 error / 30 warning → 0） |
| 首页渲染 | `next start` + curl `/` | HTTP 200；但导航是登录后才渲染的客户端状态，SSR 里看不到 |

### 还剩什么

| # | 事项 | 需要谁 |
|---|---|---|
| 1 | `OPENAI_API_BASE_URL` 指向已停服的 Deno Deploy Classic，AI 全降级 | 你换 URL 或填 `DEEPSEEK_API_KEY` |
| 2 | `学习方法手册.html` / `学习实践工具.html` 仍不在本机 | 你丢进 `public/` |
| 3 | 云端 `supabase_cards` 要跑新增的迁移，题型才会真正同步 | 你在 SQL Editor 执行 |
| 4 | UI 仍未真人验证（lint / 类型 / 单测 / 接口都过了，但它们证明不了好用） | 你本地跑 `npm run dev` 看一眼 |
| 5 | 同步仍只覆盖 4 张表：`reviewEvents` / `projects` / `weeklyReviews` / `cardCandidates` 只在本地 | 属于「跨设备冲突合并」这个独立议题，不是补几列能解决的 |

## 附录 · 视觉收口：两套主题共用一套语言（2026-10-27 完成）

### 起因

亮色和暗色各自长成了自己的一套规矩。同一个「主要按钮」在六个页面里出现过十几次，
每次的圆角、字重、字色都略有不同；同一个「页面」的宽度从 560 到 1384 都有；
按钮高度在全站能数出 **17 种**。换主题不是换配色，是换了一整套尺寸。

这轮做的事只有一件：**把尺寸和字色从组件里抽出来，变成一份定义**。

### 改造前实测（1440×900 窗口，dpr 2）

| 维度 | 改造前 | 改造后 |
|---|---|---|
| 页面宽度 | `720` / `560` / `1000` / 无上限（制卡） | `840`（五个单栏页）/ 三栏工作台不设上限 |
| 正文左边界 x | 369 / 376 / 511 / …（同一档内还差 7px） | **全部 371**（五页正文同一左右边界 403–1179） |
| 按钮高度 | 14/23/24/25/26/29/30/32/33/34/36/38/40/41/48/54/56 | **26 / 32 / 38 / 48** 四档 |
| 区块标题 | 11（等宽）/ 14 / 16 三种混用 | 16（`.section-heading`）+ 11 等宽（`.section-title`，只做栏目标签） |
| 页面标题 | 18 / 20 / 24 / 30 | 26（`.page-title`，六个页面同一字号） |
| 按钮文字颜色 | `text-white` 与 `text-black` 按页面手写 | 一律 `--color-primary-text`（亮=白 / 暗=黑） |
| 卡片圆角 | 4 / 6 / 12 / 16 | 12（`--radius-card`）；按钮 10；控件 8 |

### 五个关键决定

**1. 先把主色压缩到「白字能读」，字色才能只剩一个变量。**

亮色原来用 `#16a34a`，配白字只有 **2.96:1**——12px 的按钮文字会糊成一片，
所以很多组件偷偷写了 `text-black`。主色改成 `#15803d`（配白字 **5.2:1**）之后，
`--color-primary-text` 可以恒定表达「亮色=白、暗色=黑」，组件里再不用猜该写哪个。
这一条是整个收口能成立的地基：**字色之所以能统一，是因为底色先被修好了。**

**2. `scrollbar-gutter: stable` 会被编译器丢掉，别指望它。**

切页时正文左右跳 7px（15px 滚动条的一半）。查到的根因有两层：
先是 dev server 的 CSS chunk 缓存了旧产物，新规则没进去；清掉之后又发现
即便写进去也不稳——`scrollbar-gutter` 会被 CSS 编译器按目标浏览器集合裁掉。
最终改用 `overflow-y: scroll`（常驻轨道，古老属性，一定编得进去）+ 全站透明滚动条
（`scrollbar-color` 与 `::-webkit-scrollbar` 两套都写）。
轨道常驻但视觉上不可见，宽度恒定，跳页问题消失。

**3. 禁用态不能用 `opacity`。**

`.btn:disabled { opacity: .45 }` 在主色按钮上会变成「淡绿底 + 淡白字」，
两头的对比度一起塌，看起来像坏了而不是像禁用。改成中性底 + 明确灰字。

**4. 空态和卡片要分开。**

虚线框原来套着卡片的实心投影，视觉上像渲染错误。新增 `.surface-empty`：
虚线、无阴影、无底色。

### 落地文件

| 文件 | 改动 |
|---|---|
| `src/app/globals.css` | +150 行：版式 token（`--page-max` / `--page-pad-x` / `--radius-btn` / `--radius-field`）+ 整个 `@layer components` 块（`.page-shell` / `.page-title` / `.section-heading` / `.btn` × 4 尺寸 × 5 变体 / `.chip` / `.field` / `.surface-empty`）+ 滚动条统一样式 |
| `src/app/page.tsx` | 侧边栏 `240` → `208px`；Logo 区与导航项压到 `h-14` / `h-9`；底部两个按钮改用 `btn` |
| `src/components/today/*`（6 个） | 页骨架、按钮、输入框、空态全部映射到组件类；折叠面板行统一 `h-12`（原来同 class 却差 1px，是内容里的徽标高度不同导致的） |
| `src/components/review/*`（5 个） | 四处滚动容器改 `page-scroll` + `page-shell`；题型改 `chip`；跳过口改 `btn-ghost`；完成页去掉 `max-w-[520px]` 跟着页宽走 |
| `src/components/output/*`（5 个） | 步骤指示改 `chip !rounded-full`；卡片改 `surface-card`；空态改 `surface-empty` |
| `src/components/board/*`（4 个） | 分段控件改 `btn btn-sm` + `btn-primary` / `btn-ghost` |
| `src/components/SettingsView.tsx` | 页骨架重写；三处区块标题改 `section-heading`；步进器与删除键改 `btn btn-sm`；图标选择格 54 → 48 |
| `src/components/BrainView.tsx` | 中栏头部改 `eyebrow` / `page-title` / `page-sub`；三栏首行对齐到同一个 y=24 |
| `src/components/StatsView.tsx` 等 | 34 处 `rounded-2xl` → `rounded-xl` |

### 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npm test` | **202 pass / 0 fail** |
| 类型检查 | `npm run typecheck` | 0 error |
| 全仓 lint | `npx eslint .` | **0 problem** |
| 生产构建 | `npm run build` | ✓ 通过，11 个路由 |
| 亮/暗双主题实测 | 浏览器内测量六页 × 两主题 | 见下表 |

实测（亮色；暗色数值完全一致）：

| 页面 | 页宽上限 | 正文 x | 按钮高度档 |
|---|---|---|---|
| 今日 | 840 | 371 | 26 / 32 / 48 |
| 复习 | 840 | 371 | 26 / 32 |
| 输出 | 840 | 371 | 38 |
| 制卡 | 三栏自适应 | — | 26 / 32 / 38 |
| 看板 | 840 | 371 | 32 |
| 设置 | 840 | 371 | 24（开关滑块）/ 32 / 38 / 48 |

### 还没做的

| # | 事项 | 说明 |
|---|---|---|
| 1 | 复习页内容顶部对齐，下方大片留白 | 卡片固定 340 高（换题不跳），窗口高时下半屏空；要改得动垂直居中策略，且必须处理「内容超过一屏」时不裁顶 |
| 2 | 制卡左栏卡片仍用 12 / 13px 手写字号 | 右栏和图谱没走 `page-title` 体系，属于三栏工作台的独立尺度 |
| 3 | 空态文案与图示没统一 | 六个页面各自写了自己的空态句子，尺寸统一了，语气还没统一 |

## 附录 · 「先做一张」到底是几张

### 现象

首屏那颗主按钮写着「先做一张」，点下去落在复习页，顶部立刻是 `0 / 2` 的进度条，
评完第一张还继续给第二张。按钮承诺一个最小动作，落地页当场改口说「你还有一堆」。

这不是文案问题，是**两处各自正确、合起来就错**：`gate.ts` 只管写文案（它甚至专门有
一条用例钉住「按钮上不能出现『3 张』这种压力」），`TodayView` 只管跳转（`setActiveTab('review')`），
没有人检查「跳过去的页面是否兑现了这句话」。而且同一张卡上的小字还写着「约 2 分钟」——
那是两张的时间，等于自己拆自己的台。

### 修法：让行为兑现文案，而不是把文案改软

「先做一张」是产品主张（两分钟启动），不能退化成「开始复习」。所以给复习页加一个**进入意图**：

| 入口 | `reviewScope` | 落地表现 |
|---|---|---|
| 今日首屏「先做一张」 | `one` | 只放出一张；顶部不摆进度条，写「这一张 · 做完就能走」；评完即收尾 |
| 侧边栏 / 命令面板「复习」 | `all` | 整队，进度条照常 |

关键实现点：

- `startReview(scope)` 与 `setActiveTab('review')` 分开。后者会把 `reviewScope` 重置成 `all`——
  否则「只做一张」会跟着用户飘到下一次进复习页。
- `planSession()`（`src/lib/learning/session.ts`，纯函数）决定「该显示哪张、分母多少、何时算收尾」。
  裁剪用的是**配额** `Math.max(0, 1 - rated)` 而不是 `slice(0, 1)`——后者评完第一张会把第二张顶上来，
  等于一点没限住。
- 收尾页 `SingleCardDone` 不复用 `SessionDone`。那句话是「今天的队列清空了」，只做一张时说这句
  是替用户宣布一件没发生的事；明天他打开会看到还剩一张，被骗一次就够毁掉信任。
- `gate.ts` 的 `primaryHint` 改成「做完这一张就能走」，并删掉 `TodayGate.estimateMinutes` 字段——
  一个没人展示、但随时会被人顺手贴回按钮下面的「整批耗时」，是同一类 bug 的种子。

### 一条可以复用的判断

**当一句承诺出现在 UI 上，它就得有一个跟着它走的执行路径。** 文案和后端行为分居两个文件时，
测试要两边都钉：`gate.test` 钉文案（小字里不许出现分钟数），`session.test` 钉行为
（`one` 模式下评完一张不再出第二张）。只钉一边，另一边随时可以背叛。

### 影响面

| 文件 | 改动 |
|---|---|
| `src/lib/store.ts` | 新增 `reviewScope` + `startReview(scope)`；`setActiveTab('review')` 重置为 `all` |
| `src/lib/learning/session.ts` | **新增**：`planSession()` 纯函数，7 个用例 |
| `src/components/review/ReviewsView.tsx` | 用 `planSession` 取代原地的 filter；一张模式换掉进度条；插入收尾分支 |
| `src/components/review/SingleCardDone.tsx` | **新增**：这张做完了 / 还有 N 张 / 接着做 · 回今日 |
| `src/components/today/TodayView.tsx` | 主按钮改走 `startReview('one')` |
| `src/lib/learning/gate.ts` | 小字改为「做完这一张就能走」；删掉 `estimateMinutes` 字段 |

### 补记：「做一张」到底是做卡还是复习（同日）

上面的修法只解决了「承诺一张、给了整队」，没解决**「一张」是什么**。

用户原话：*"本来就该跳转到复习页吗，那文案为什么是「先做一张」，语义上像是做一张卡片。"*
——按钮确实该去复习（这张卡的标题就是「今天 N 张卡待复习」，制卡有独立页签和独立分支
「再制一张 / 做第一张卡」），问题出在**动词**：全站一个「做」字同时管两件事。

| 语境 | 用法 | 例子 |
|---|---|---|
| 制卡（页签「制卡」） | 做 / 制 + 卡 | 「做第一张卡」「再制一张」「制一张能问住自己的卡」 |
| 复习（页签「复习」） | 原本也写「做」 | 「先做一张」「这一张做完了」「接着做」 |

同一个词根指两个动作，而页签里明晃晃摆着「制卡」，读成"去做卡"是**合理的**。
所以文案里所有复习动作一律改用「复习」：

- 主按钮：`先做一张` → **`先复习一张`**（同时保留"只做一张"的最小承诺）
- 小字：`做完这一张就能走` → `复习完这一张就能走`
- 复习页一张模式：`这一张 / 做完就能走` → `这一张 / 复习完就能走`
- 收尾页：`这一张做完了` → `这一张复习完了`，`接着做` → `接着复习`
- 空态：`今天的卡都做完了` → `今天的卡都复习完了`；`去做第一张卡` → `去制第一张卡`
- 首屏免责：`今天做一张，就接上了` → `今天复习一张，就接上了`

`gate.test` 里加了一条守卫：`primaryLabel` 必须匹配 `/复习/`。
理由写在用例里——**文案的歧义是能被测出来的，只要你写得出"它必须包含哪个词"**。

## 附录 · 偏差记录（2026-10-28 核查）

对照本文档全量核查实现（Phase 0–5 + 四个附录），除以下两处外均一致，`pnpm run check` 全绿：

1. **导航顺序与第 3 节的目标 tab 表不同。** 文档写的是 今日 → 复习 → **制卡 → 输出** → 看板，
   实际落地为 今日 → 复习 → **输出 → 制卡** → 看板。理由：一天的时序里「讲出来（输出）」
   发生在「补输入（制卡）」之前——先暴露卡壳点，再带着问题去制卡，与每日闭环的逻辑一致。
   **这处偏离是刻意的，本条即为确认记录**，后续核查不再视为疑点。

2. **`gate.ts` 的 `estimateMinutes` 函数已删除。** 第 3 节收尾时只删了 `TodayGate.estimateMinutes`
   字段，函数本体作为「没人展示但随时会被贴回按钮下」的种子残留（仅剩自身测试在引用）。
   2026-10-28 连同测试断言一并移除，`gate.test` 中「小字不得出现分钟数」的守卫保留。
