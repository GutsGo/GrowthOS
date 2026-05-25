import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface LocalNote {
  id: string;
  front: string; // 标题/现象
  back: string;  // 解决方案/正文
  tags?: string[];
}

// 后端内置的 5 大典型前端 Bug 知识库，用于离线/无 Key 降级匹配
const INTERNAL_BUG_DATABASE = [
  {
    title: "Next.js 页面在服务端渲染时报错 window is not defined 或 localStorage is not defined",
    keywords: ["window", "document", "localstorage", "sessionstorage", "not defined", "navigator"],
    analysis: "在 Next.js / React SSR 架构下，组件代码在服务端（Node.js）渲染时就会被执行，而 Node.js 环境中没有浏览器专属的 window, document, localStorage 等全局对象，从而导致代码在预渲染阶段崩溃。",
    diffCode: `// 错误代码示例 (Before)
- const token = localStorage.getItem("token");
- const width = window.innerWidth;

// 修复方案示例 (After)
+ const [token, setToken] = useState<string | null>(null);
+ const [width, setWidth] = useState<number>(1024);
+ 
+ useEffect(() => {
+   // 确保这些特有 API 只在客户端挂载后执行
+   setToken(localStorage.getItem("token"));
+   setWidth(window.innerWidth);
+ }, []);`,
    advice: "在 Next.js App Router 中，任何客户端特有的全局变量或方法，应使用 useEffect 包裹执行，或通过 'typeof window !== \"undefined\"' 进行运行时安全保护。"
  },
  {
    title: "React 19 中 forwardRef 报错或废弃，如何使用最新的普通 Ref 传参",
    keywords: ["forwardref", "ref", "component ref", "props ref", "react 19 ref"],
    analysis: "React 19 进行了重大升级，已经彻底弃用了 forwardRef 包裹函数。现在，ref 可以像普通的 Prop 一样直接传递给子组件进行解构使用，不需要额外的包装，使组件层级更加扁平清爽。",
    diffCode: `// 旧的 React 18 写法 (Before)
- const CustomInput = forwardRef((props, ref) => {
-   return <input ref={ref} {...props} className="input-class" />;
- });
- CustomInput.displayName = "CustomInput";

// React 19 现代化写法 (After)
+ const CustomInput = ({ ref, ...props }: { ref?: React.RefObject<HTMLInputElement | null> } & any) => {
+   return <input ref={ref} {...props} className="input-class" />;
+ };`,
    advice: "如果遇到 React 19 环境编译时 Ref 报错，直接删除 forwardRef 包装及 displayName 定义，将其转为子组件参数中的 ref 解构即可。"
  },
  {
    title: "Zustand 状态更新报错，或者 state 改变但页面不渲染 (Direct State Mutation)",
    keywords: ["zustand", "mutate", "render", "not updating", "readonly", "direct mutation"],
    analysis: "直接修改 Zustand store 状态（例如 state.tasks.find(...).completed = true）会导致 React 无法通过引用对比 (shallow compare) 检测到数据的改变，从而拦截了视图的重新渲染渲染。必须通过 set 返回全新的不可变数据副本，或者引入 Immer 中间件处理状态更新。",
    diffCode: `// 错误写法：直接突变状态 (Before)
- const completeHabit = (id) => {
-   const list = get().habits;
-   list.find(h => h.id === id).logged = true;
- };

// 正确写法：返回全新引用 (After)
+ const completeHabit = (id) => {
+   set((state) => ({
+     habits: state.habits.map((h) => 
+       h.id === id ? { ...h, logged: true } : h
+     )
+   }));
+ };`,
    advice: "Zustand 强调不可变数据流。若操作复杂深层嵌套，可使用 immer 中间件，便可在 state 上进行看起来是“突变”的修改，实质上它会在后台使用 Proxy 转换为不可变更新。"
  },
  {
    title: "Dexie.js / IndexedDB 报错 DatabaseClosedError 或 TransactionInactiveError",
    keywords: ["dexie", "indexeddb", "database is closed", "transaction", "inactive", "db closed"],
    analysis: "这通常是由于在 IndexedDB 关闭后或者生命周期完结后尝试执行查询，又或者在一个写操作事务 (transaction) 已经成功提交或取消后，继续在该事务作用域内执行了异步 await 操作，导致事务超时失效。",
    diffCode: `// 错误写法：在非活动的 transaction 外执行异步 (Before)
- await db.transaction("rw", db.habits, async () => {
-   await db.habits.add(newHabit);
-   setTimeout(async () => {
-     await db.habits.add(anotherHabit); // 事务在 setTimeout 执行前已自动提交并关闭
-   }, 100);
- });

// 正确写法：保证所有操作同步于事务上下文 (After)
+ await db.transaction("rw", db.habits, async () => {
+   await db.habits.add(newHabit);
+   await db.habits.add(anotherHabit); // 合理 await，事务依然处于激活状态
+ });`,
    advice: "IndexedDB 的事务对 JavaScript 微任务队列有着严密要求。严禁在 db.transaction 内部使用 setTimeout, setInterval 或 Fetch 等宏任务，所有的 IndexedDB 数据查询必须保证连续 await 链。"
  },
  {
    title: "Next.js 15 / Page.tsx 中获取 params 或 searchParams 报错，没有 await",
    keywords: ["params", "searchparams", "next 15", "async params", "promise params"],
    analysis: "在 Next.js 15 中，页面路由的 params 和 searchParams 属性已改为了异步的 Promise 结构。直接同步读取属性（如 params.id）会在生产环境打包或运行时引起未定义报错，必须在读取前使用 await 或者 React.use() 劫持解析。",
    diffCode: `// Next.js 14 的旧同步写法 (Before)
- export default function Page({ params }: { params: { id: string } }) {
-   return <div>详情 ID: {params.id}</div>;
- }

// Next.js 15 现代化异步写法 (After)
+ export default async function Page({ params }: { params: Promise<{ id: string }> }) {
+   const { id } = await params;
+   return <div>详情 ID: {id}</div>;
+ }`,
    advice: "在组件是客户端组件 ('use client') 的情况下，如果需要读取 params，请导入并使用 React 的 'use' Hook，即：const { id } = use(params);"
  }
];

export async function POST(req: Request) {
  try {
    const { bugDescription, codeContext, localNotes } = await req.json() as {
      bugDescription: string;
      codeContext?: string;
      localNotes?: LocalNote[];
    };

    if (!bugDescription) {
      return NextResponse.json({ error: "请输入需要诊断的报错信息或问题描述。" }, { status: 400 });
    }

    // 1. 尝试提取 API 配置
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const deepseekBase = process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com/v1";
    const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";

    const openaiKey = process.env.OPENAI_API_KEY;
    const openaiBase = process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1";
    const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

    let apiKey = "";
    let apiBase = "";
    let model = "";

    if (deepseekKey) {
      apiKey = deepseekKey;
      apiBase = deepseekBase;
      model = deepseekModel;
    } else if (openaiKey) {
      apiKey = openaiKey;
      apiBase = openaiBase;
      model = openaiModel;
    }

    // 2. 如果存在密钥且网络通畅，尝试执行大模型 RAG 诊断
    if (apiKey) {
      try {
        let referenceNotes: string[] = [];

        // 2.1 尝试从 Supabase pgvector 检索
        if (supabase) {
          try {
            // 调用 Embedding API 将报错信息转为向量
            const embedUrl = `${apiBase.replace(/\/$/, "")}/embeddings`;
            const embedRes = await fetch(embedUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                input: bugDescription,
                model: model.includes("gpt") ? "text-embedding-3-small" : "text-embedding-3-small", // 若是非 OpenAI 模型，依然尝试调用
              }),
            });

            if (embedRes.ok) {
              const embedData = await embedRes.json();
              const embedding = embedData.data?.[0]?.embedding;

              if (embedding) {
                // 调用 Supabase RPC `match_tech_notes`
                const { data: dbNotes, error: rpcError } = await supabase.rpc("match_tech_notes", {
                  query_embedding: embedding,
                  match_threshold: 0.3,
                  match_count: 2,
                });

                if (!rpcError && dbNotes) {
                  dbNotes.forEach((n: any) => {
                    referenceNotes.push(`【云端知识点 - ${n.title}】\n${n.content}`);
                  });
                }
              }
            }
          } catch (se) {
            console.warn("Supabase pgvector RAG 检索异常，平滑降级:", se);
          }
        }

        // 2.2 融合本地传入的 notes
        if (localNotes && localNotes.length > 0) {
          localNotes.forEach((ln) => {
            referenceNotes.push(`【本地错题卡 - ${ln.front}】\n${ln.back}`);
          });
        }

        // 2.3 调用大模型生成诊断和 Diff
        const chatUrl = `${apiBase.replace(/\/$/, "")}/chat/completions`;
        const systemPrompt = `你是一个顶级的前端开发调试专家。用户现在遇到了一处代码报错。
你必须结合他们提供的“报错信息”、“代码上下文”以及相关的“参考技术文档与笔记”来定位错误，并提供诊断修复方案。

你必须输出符合以下规范的 JSON 格式（直接输出 JSON，千万不要包含 \`\`\`json 标记）：
{
  "analysis": "这里填写对报错成因的深度诊断分析，指出根本问题在哪。",
  "diffCode": "这里必须写出精准的 Git-diff 格式代码方案。每一行被删除的错误代码前加 \`- \`，增加的正确代码前加 \`+ \`。必须包含错误和正确两部分的对比，不要写普通的 Markdown 代码块。",
  "matchedNoteTitle": "在此列出你采用的参考笔记中最匹配的卡片/文档标题，若没有则为空 string",
  "advice": "给用户的调试或规避此错误的架构忠告。"
}

示例 diffCode 格式：
// Before (错误)
- const list = state.data;
// After (修复)
+ const [list, setList] = useState(state.data || []);
+ useEffect(() => { ... }, []);`;

        const userPrompt = `【用户报错信息】：
${bugDescription}

【代码上下文】：
${codeContext || "未提供上下文"}

【参考知识文档】：
${referenceNotes.length > 0 ? referenceNotes.join("\n\n---\n\n") : "无匹配笔记，请根据你的知识库诊断"}`;

        const chatRes = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            response_format: { type: "json_object" },
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          const assistantContent = chatData.choices?.[0]?.message?.content;
          if (assistantContent) {
            const parsed = JSON.parse(assistantContent.trim());
            return NextResponse.json(parsed);
          }
        }
      } catch (aiErr) {
        console.error("AI 编程诊断故障，启动本地降级匹配算法:", aiErr);
      }
    }

    // 3. 本地降级：自适应模糊文本匹配算法
    // 将用户输入的 bug 描述进行小写分词
    const queryTokens = bugDescription.toLowerCase().split(/[\s,.:;'"?!(){}[\]\-\\\/]+/);
    
    // 合并内置知识库与本地错题笔记进行比对
    const allNotes = [
      ...INTERNAL_BUG_DATABASE.map((item) => ({
        title: item.title,
        keywords: item.keywords,
        analysis: item.analysis,
        diffCode: item.diffCode,
        advice: item.advice,
        source: "内置知识库"
      })),
      ...(localNotes || []).map((item) => {
        // 自定义分词作为本地卡片关键字
        const keywords = item.front.toLowerCase().split(/[\s,.:;'"?!]+/);
        return {
          title: item.front,
          keywords: keywords,
          analysis: "匹配到您在本地第二大脑中记录的相似 Bug 闪卡。",
          diffCode: item.back.replace(/<[^>]*>/g, ""), // 去除 HTML tag
          advice: "建议您对照此本地闪卡的解决方案进行调试。",
          source: "本地错题卡"
        };
      })
    ];

    let bestMatch: typeof allNotes[0] | null = null;
    let maxScore = -1;

    allNotes.forEach((note) => {
      let score = 0;
      // 计算查询词中命中该笔记关键字的个数
      note.keywords.forEach((kw) => {
        if (bugDescription.toLowerCase().includes(kw) && kw.length > 2) {
          score += 2;
        }
      });
      // 额外对标题进行模糊命中匹配
      if (note.title.toLowerCase().split(/\s+/).some((w) => bugDescription.toLowerCase().includes(w) && w.length > 2)) {
        score += 3;
      }
      
      if (score > maxScore) {
        maxScore = score;
        bestMatch = note;
      }
    });

    // 如果几乎没有匹配上，则默认返回第一个（SSR window 错误，最常见）
    if (!bestMatch || maxScore <= 0) {
      bestMatch = allNotes[0];
    }

    return NextResponse.json({
      analysis: `（⚠️ 本地降级匹配）${bestMatch.analysis}`,
      diffCode: bestMatch.diffCode,
      matchedNoteTitle: `${bestMatch.source} · ${bestMatch.title}`,
      advice: `（已自动降级为本地诊断）${bestMatch.advice}`
    });

  } catch (err: any) {
    console.error("Vibe Coding API Error:", err);
    return NextResponse.json({
      analysis: "（⚠️ 诊断异常）系统在解析报错时发生内部错误。",
      diffCode: `// 无法提供代码对比\n- Error: ${err.message}`,
      matchedNoteTitle: "",
      advice: "请检查网络、大模型 API KEY 配置或贴入的报错文本规范度。"
    });
  }
}
