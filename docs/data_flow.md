# GrowthOS 自律活跃数据链路文档

本篇文档记录了 GrowthOS 系统中关于**自律连击天数（Streaks）**和**打卡活跃热力图**的数据流向与计算架构，方便后续的维护与扩展。

---

## 🗺️ 自律活跃数据流向图 (Mermaid)

```mermaid
flowchart TD
    %% 数据录入层
    subgraph Input ["数据录入层 (UI 交互)"]
        UI_Task["今日指挥舱: AI排程任务勾选"] -- 触发 toggleAiTask() --> DB_Write_DR["写入/更新 IndexedDB: dailyRecords"]
        UI_Habit["习惯卡片 / 命令面板: 习惯打卡"] -- 触发 db.habitLogs.add() --> DB_Write_HL["写入 IndexedDB: habitLogs"]
        UI_Coach["AI 教练舱: 保存闪卡或打卡"] -- 触发 db.habitLogs.add() --> DB_Write_HL
    end

    %% 本地数据库层
    subgraph DB ["本地数据持久化层 (IndexedDB)"]
        DB_DR[("db.dailyRecords <br>存储每日 WOOP/能量/AI任务")]
        DB_HL[("db.habitLogs <br>存储常规习惯打卡记录")]
        DB_Write_DR --> DB_DR
        DB_Write_HL --> DB_HL
    end

    %% 反应式数据查询层
    subgraph Query ["反应式状态获取层 (Dexie React Hooks)"]
        LQ_DR["useLiveQuery (db.dailyRecords) <br>实时监听并提取全部记录"]
        LQ_HL["useLiveQuery (db.habitLogs) <br>实时监听并提取全部打卡"]
        DB_DR --> LQ_DR
        DB_HL --> LQ_HL
    end

    %% 计算与渲染层
    subgraph Render ["计算与渲染层 (Client Component)"]
        %% Dashboard 页面
        subgraph Dash ["DashboardView.tsx (首页)"]
            Streak_D["streakDays <br>(合并计算今日与历史连续活跃天数)"]
        end

        %% Stats 页面
        subgraph Stats ["StatsView.tsx (数据与复盘页)"]
            Streak_S["streakInfo.current / max <br>(合并计算当前与历史最高连击)"]
            Heatmap["heatmapData <br>(合并习惯打卡与已完成 AI 任务数)"]
            Badges["badges <br>(基于连击天数与精力解锁徽章)"]
        end

        LQ_DR & LQ_HL --> Streak_D
        LQ_DR & LQ_HL --> Streak_S
        LQ_DR & LQ_HL --> Heatmap
        Streak_S --> Badges
    end

    %% 样式美化
    style DB_DR fill:#1DB954,stroke:#121212,stroke-width:2px,color:#fff
    style DB_HL fill:#1DB954,stroke:#121212,stroke-width:2px,color:#fff
    style LQ_DR fill:#3b82f6,stroke:#121212,stroke-width:2px,color:#fff
    style LQ_HL fill:#3b82f6,stroke:#121212,stroke-width:2px,color:#fff
```

---

## 🔍 数据流与关键计算逻辑

### 1. 连续自律活跃日期收集 (Dates Set)
两端（主页与复盘页）连击天数和活跃度的计算都建立在同一个“自律活跃日期集合”基础之上：
* **常规习惯打卡日期**：遍历 `db.habitLogs` 的所有记录并提取其 `date`。
* **AI 任务完成日期**：遍历 `db.dailyRecords`，如果某天记录中的 `aiTasks` 数组里有至少一个任务的 `isCompleted` 状态为 `true`，则将当天的 `date` 计入活跃日期。

### 2. 核心文件与逻辑位置
* **首页连击天数计算**：
  * 文件：[DashboardView.tsx](file:///Users/alien/Documents/codes/GrowthOS/src/components/DashboardView.tsx) 中的 `streakDays`
  * 特点：使用 `useLiveQuery` 监听 `db.habitLogs` 和 `db.dailyRecords` 的异步查询，并通过从今天/昨天向后追溯的方式得出当前连续活跃天数。
* **数据与复盘页计算**：
  * 文件：[StatsView.tsx](file:///Users/alien/Documents/codes/GrowthOS/src/components/StatsView.tsx) 中的 `streakInfo` 与 `heatmapData`
  * 特点：使用内存响应式 state `habitLogs` 与 `dailyRecords`（分别由各自 the `useLiveQuery` 实时查询拉取）。`streakInfo` 用来计算当前连击天数与历史最高连击；`heatmapData` 将习惯打卡和已完成 AI 任务数合并，并在每一周的第一天（周一）绑定跨月标签 `isMonthStart` 和 `monthLabel`，数据以本周日为终点倒推 370 天（53 周）生成包含今天在内的全量日期网格；横轴上方月份标签采用与网格完全对称的 53 列 `grid grid-flow-col` 布局，通过在每个单元格内部绝对定位输出月份文字，配合左侧具有相同行高 `h-3.5` 及 `gap-1.5` 的星期标签，实现了全分辨率下的精密物理对齐。
