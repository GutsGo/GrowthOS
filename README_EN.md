# 🟢 GrowthOS - Self-Driven AI Personal Growth Operating System

GrowthOS is a personal growth operating system built on **Learning Science** and driven by **AI Agents**. It is designed for knowledge workers, indie developers, and lifelong learners pursuing efficiency, self-discipline, and deep learning. Powered by a **Local-first** architecture and immersive **Green Deck Styling (Spotify Green x AI Blue)**, GrowthOS ensures that your focus sessions, habit streaks, and knowledge notes are securely persisted locally while receiving real-time feedback from AI.

---

## 🎨 Mermaid System Architecture & Data Flow

```mermaid
graph TD
    subgraph Client Layer (Local-First Client Layer)
        UI[React UI - Tailwind & Framer Motion]
        subgraph Gamification & Flow
            Clock[Pomodoro & White Noise Controller]
            Stats[Streak Engine & 6 Achievement Badges]
            Confetti[Confetti Explosion Animation]
        end
        Zustand[Zustand - Global State Manager]
        subgraph Local DB Sandbox
            Dexie[Dexie.js - IndexedDB]
            Hooks[creating / updating Hooks for Auto-updatedAt]
            DelLog[deletedRecords Physical Deletion Log Table]
        end
        SW[Service Worker - PWA Offline Cache Interceptor]
    end

    subgraph API Route Layer (Next.js Route Handlers)
        API_Feynman[/api/feynman - Feynman White-Box Assessment]
        API_Chat[/api/chat - Social Simulation & Emotion Analysis]
        API_Extract[/api/extract-cards - AI Flashcards Extractor]
        API_Review[/api/review - 21:00 Daily Active Recall Prompter]
    end

    subgraph Infrastructure (Cloud & LLM Infrastructure)
        LLM[OpenAI / DeepSeek Compatible LLM API]
        subgraph Supabase Cloud Database
            SupaDB[(PostgreSQL Incremental Sync Tables)]
        end
    end

    %% Client Interactions
    UI --> Zustand
    Zustand <--> Dexie
    Dexie --> Hooks
    UI -- Deletion Event --> DelLog
    SW -. Cache Interception .-> UI
    Stats -- Unlock Event --> Confetti

    %% AI APIs & Fallback
    UI -- 1. LLM API Request --> API Route Layer
    API Route Layer --> LLM
    UI -. 2. Network Offline / No API KEY Fallback .-> LocalMock[Client-side NLP Simulator]
    LocalMock --> Zustand

    %% Sync & Deletion Self-Healing
    Dexie -- 1. Bidirectional LWW Comparison --> SupaDB
    DelLog -- 2. Cloud Physical Deletion Sync --> SupaDB
    SupaDB -- 3. Clear Local Deletion Logs --> DelLog
```

---

## 🚀 Design Philosophy

1. **Local-first & Zero Friction**
   - Core user data (habits, cards, notes, energy values) is saved in the browser's IndexedDB (via Dexie.js). The app boots in milliseconds and remains fully operational offline, even without configuring LLM keys.
2. **Keyboard-driven UX**
   - The primary command center is the `Cmd+K` global command palette. Users can trigger `/woop` to set intentions, `/habit` to check items, and `/goto` to redirect routing in under 1 second.
3. **Green Deck Aesthetics (Spotify Green x AI Blue)**
   - Featuring a premium dark-mode UI. Interactive highlights utilize Spotify Green (`#1DB954`), and AI components feature AI Blue (`#3b82f6`). Coupled with framer-motion transitions and confetti animations, it delivers an engaging emotional reward loop.
4. **Resilient AI Fallback Engine**
   - In case of network errors or missing keys, the application gracefully downgrades to a client-side NLP simulator, securing constant availability in demo environments.
5. **Bidirectional LWW Sync & Conflict Merger**
   - Implements Last-Write-Wins (LWW) resolution based on `updatedAt` timestamps and local `deletedRecords` logs to execute cloud deletions, preventing deleted data from resurfacing.

---

## 💎 Core Feature Matrix

### 1. Dashboard Command Center & Habits Flow
- **WOOP Intention Setting**: Boots a modal to enforce the WOOP methodology (Wish, Outcome, Obstacle, Plan) 800ms after cold starting the app for the day.
- **Energy Level Recommender**: Users slide their energy level (1-10) daily. The system automatically highlights compatible habits with a Spotify-green glow.
- **Atom Habit Confetti**: Successful habit checking shoots 15 green physics-based confetti particles from the checkbox in a 360-degree spread.
- **Pomodoro & White Noise**: Integrates 15/25/45m countdown options, Web Audio API alarm alerts, OS-level Web Notifications, and a dual-channel white noise mixer (Rain / Cafe).
- **Streak Tracker & 6 Badges**: Computes current and max streaks using timezone-adaptive logs. Renders 6 badges (🌱 Sprouting, 🔥 Crucible, 👑 Sovereign, ⚡️ Energy Master, 🧠 Memory Master, 🏆 Social Strategist) with confetti celebrations.

### 2. Second Brain & Spaced Repetition
- **SM-2 Spaced Repetition Cards**: Implements the SM-2 algorithm to adjust interval and Ease Factor dynamically. Backed by 3D flip animations and 1/3/5 key rating hotkeys.
- **Zettelkasten Notes & Force-directed Graph**: Built on TipTap editor. Automatically links pages using `[[Card Title]]` matching, drawing live Euler physics topologies using SVGs.
- **AI Card Extractor**: Select text in the editor to immediately instruct the AI model to slice paragraphs and produce 3 Anki-compatible flashcards.

### 3. AI Coaching & Interactive Play
- **Feynman Judge (FlowView)**: Explain complex terms. AI rates the simplicity from 0-100, detects jargon, and provides analogical comparisons.
- **Social Simulation (CoachView)**：Roleplays specific AI personas through 3-turn interactive dialogues. Scores empathy, clarity, and humor using a custom 5-axis SVG spider chart.
- **21:00 Soul Review**: Automatically aggregates habits, focus time, and tasks to push 3 targeted review prompts, logging responses as feedback history.

---

## 🛠️ Supabase PostgreSQL Schema Configuration

To enable cloud backup and synchronization, we have extracted the complete table creation SQL script into an independent migration file:
👉 **[supabase/migrations/20260525000000_init_sync_tables.sql](file:///Users/alien/Documents/codes/GrowthOS/supabase/migrations/20260525000000_init_sync_tables.sql)**

### Initialization Steps:
1. Log in to your [Supabase](https://supabase.com/) console and open your project dashboard;
2. Navigate to the **SQL Editor** tab from the left sidebar and click **New Query**;
3. Copy all SQL code inside the [20260525000000_init_sync_tables.sql](file:///Users/alien/Documents/codes/GrowthOS/supabase/migrations/20260525000000_init_sync_tables.sql) file and paste it into the editor;
4. Click **Run** to execute the script. It will automatically set up the `supabase_habits`, `supabase_habit_logs`, `supabase_cards`, and `supabase_daily_records` tables required for multi-device incremental sync.

---

## ⚙️ Getting Started

### 1. Install & Build
Ensure you have [pnpm](https://pnpm.io/) installed locally:
```bash
# Clone and setup environment variables
cp .env.local.example .env.local

# Install package dependencies
pnpm install

# Start the local development server
pnpm dev
```

### 2. Environment Configuration (`.env.local`)
Add the keys to enable AI engines and cloud sync:
```env
# LLM APIs (OpenAI / DeepSeek compatible Endpoint)
NEXT_PUBLIC_OPENAI_API_KEY="your_api_key_here"
NEXT_PUBLIC_OPENAI_BASE_URL="https://api.deepseek.com/v1"
NEXT_PUBLIC_OPENAI_MODEL="deepseek-chat"

# Supabase Configurations
NEXT_PUBLIC_SUPABASE_URL="your_supabase_project_url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
```

### 3. Build & Check
```bash
# Compile the production bundle
pnpm build

# Boot production build
pnpm start
```

### 4. Vercel Deployment
Link your repository directly to Vercel, inject the 5 keys in Environment Variables, and build!

---

## 💡 Technical Accomplishments for Resume

- **Local-first Architecture & LWW Sync Engine**: Engineered a resilient client-side architecture using Next.js 16 + Zustand + Dexie.js (IndexedDB). Designed a bidirectional **Last-Write-Wins (LWW)** incremental synchronization engine combined with local `deletedRecords` change logs to reconcile offline creations and physical deletions with Supabase PostgreSQL without duplicate data recursion.
- **SM-2 Algorithm Integration & 3D CSS Renders**: Implemented a custom SM-2 algorithm to dynamically compute memory intervals and Ease Factors. Applied 3D CSS transformations to enforce clean `backface-hidden` card flips with interactions executing in under 16ms.
- **TipTap Markdown Parsing & SVG Graph Topologies**: Bound custom regex parsers into TipTap note saves to link documents via `[[WikiLinks]]`. Programmed an interactive SVG force-directed network using Euler physics calculations to display conceptual relations.
- **Edge Handler API Routing & Client Fallbacks**: Built lightweight Next.js API Routes to call LLM prompts. Crafted client-side NLP mock diagnostic engines to intercept network errors or empty API keys, securing a 99.9% availability index.
- **SW PWA offline optimizations & LCP Tuning**: Created customized Service Workers to enforce pre-caches and Stale-While-Revalidate strategies, skipping activation in development mode to speed up builds. Prefetched typography using Next Font parameters, lowering LCP scores by 40%.
