"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { db, Card } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Plus,
  Trash2,
  Tag,
  Search,
  Sparkles,
  Link as LinkIcon,
  HelpCircle,
} from "lucide-react";

interface GraphNode {
  id: string;
  label: string;
  type: "card" | "tag";
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphLink {
  source: string;
  target: string;
}

export default function BrainView() {
  const cards = useLiveQuery(() => db.cards.toArray()) || [];

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [brainSubTab, setBrainSubTab] = useState<"list" | "editor" | "graph">("list");

  // 编辑器表单状态
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // AI 闪卡提取状态与 Toast 提示
  const [selectedText, setSelectedText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: "success" | "error" }>({
    show: false,
    msg: "",
    type: "success",
  });

  // 初始化 TipTap 编辑器（为卡片背面提供富文本支持）
  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setBack(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, " ");
      setSelectedText(text.trim());
    },
    editorProps: {
      attributes: {
        class: "w-full min-h-[160px] p-3 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary focus:outline-none text-xs text-text-primary prose prose-invert max-w-none prose-sm overflow-y-auto",
      },
    },
  });

  // 监听选中卡片变化，回填表单
  useEffect(() => {
    if (selectedCardId) {
      const activeCard = cards.find((c) => c.id === selectedCardId);
      if (activeCard) {
        setFront(activeCard.front);
        setBack(activeCard.back);
        setTagsInput(activeCard.tags.join(", "));
      }
    } else {
      setFront("");
      setBack("");
      setTagsInput("");
      if (editor) {
        editor.commands.clearContent();
      }
    }
    setSelectedText(""); // 切换卡片时重置划词
  }, [selectedCardId, cards, editor]);

  // 当 back 状态由外部变化时（回填表单），同步更新 TipTap 内容
  useEffect(() => {
    if (editor) {
      const html = editor.getHTML();
      if (html !== back) {
        editor.commands.setContent(back || "");
      }
    }
  }, [back, editor]);

  // 过滤卡片列表
  const filteredCards = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return cards;
    return cards.filter(
      (c) =>
        c.front.toLowerCase().includes(query) ||
        c.back.toLowerCase().includes(query) ||
        c.tags.some((t) => t.toLowerCase().includes(query))
    );
  }, [cards, searchQuery]);

  // 调用 AI 一键提取闪卡
  const handleExtractCards = async () => {
    if (!selectedText || !editor) return;

    setIsExtracting(true);
    try {
      const response = await fetch("/api/extract-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectedText }),
      });

      if (!response.ok) {
        throw new Error("请求闪卡提取 API 失败");
      }

      const data = await response.json() as { cards: any[]; isFallback?: boolean };
      if (!data.cards || data.cards.length === 0) {
        throw new Error("未提取到任何有效卡片");
      }

      const newCards = data.cards.map((c: any) => ({
        id: crypto.randomUUID(),
        front: c.front,
        back: c.back,
        tags: c.tags && c.tags.length > 0 ? c.tags : ["AI提取"],
        reps: 0,
        interval: 0,
        ease: 2.5,
        nextReview: new Date(),
        createdAt: new Date(),
      }));

      await db.cards.bulkAdd(newCards);

      // 清除选区，让光标停留在原选区终点
      const { to } = editor.state.selection;
      editor.commands.setTextSelection({ from: to, to: to });
      setSelectedText("");

      setToast({
        show: true,
        msg: `✨ AI 成功提炼并存入 ${newCards.length} 张记忆卡片！${data.isFallback ? "（已启用本地降级）" : ""}`,
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      setToast({
        show: true,
        msg: `❌ 提炼失败：${err.message || "未知错误"}`,
        type: "error",
      });
    } finally {
      setIsExtracting(false);
      // 4秒后自动关闭 Toast
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 4000);
    }
  };

  // 从 Markdown 或者是 HTML 富文本中提取双向引用的卡片正面标题
  const extractLinkedCards = (text: string): string[] => {
    // 匹配 [[被引用卡片的正面标题]]
    const regex = /\[\[(.*?)\]\]/g;
    const result: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        result.push(match[1].trim());
      }
    }
    return Array.from(new Set(result));
  };

  // 保存/修改卡片
  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front || !back) return;

    const tags = tagsInput
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const isEdit = !!selectedCardId;
    const linked = extractLinkedCards(front + " " + back);

    if (isEdit && selectedCardId) {
      const existing = cards.find((c) => c.id === selectedCardId);
      if (existing) {
        await db.cards.put({
          ...existing,
          front,
          back,
          tags,
          linkedCards: linked,
        });
      }
    } else {
      await db.cards.add({
        id: crypto.randomUUID(),
        front,
        back,
        tags,
        linkedCards: linked,
        reps: 0,
        interval: 0,
        ease: 2.5,
        nextReview: new Date(),
        createdAt: new Date(),
      });
    }

    setSelectedCardId(null);
    setFront("");
    setBack("");
    setTagsInput("");
    if (editor) {
      editor.commands.clearContent();
    }
    setBrainSubTab("list");
  };

  // 删除卡片
  const handleDeleteCard = async (id: string) => {
    if (confirm("确定要删除这张记忆卡片吗？此操作不可撤销。")) {
      await db.cards.delete(id);
      if (selectedCardId === id) {
        setSelectedCardId(null);
      }
    }
  };

  // ==========================================
  // SVG 局部知识图谱力导向图物理引擎
  // ==========================================
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const width = 360;
  const height = 300;

  // 1. 根据卡片、标签以及双向引用初始化力导向图的数据
  useEffect(() => {
    if (cards.length === 0) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const tempNodes: GraphNode[] = [];
    const tempLinks: GraphLink[] = [];
    const addedTags = new Set<string>();

    // 随机定位初始化
    const getRandPos = (max: number) => 40 + Math.random() * (max - 80);

    // 1. 建立标题到 ID 的映射，便于渲染双向引用连线
    const cardTitleToIdMap = new Map<string, string>();
    cards.forEach((c) => {
      cardTitleToIdMap.set(c.front.trim().toLowerCase(), c.id);
    });

    cards.forEach((card) => {
      // 2. 加入卡片节点
      tempNodes.push({
        id: card.id,
        label: card.front.substring(0, 8) + (card.front.length > 8 ? "..." : ""),
        type: "card",
        x: getRandPos(width),
        y: getRandPos(height),
        vx: 0,
        vy: 0,
      });

      // 3. 渲染双向引用 [[被引卡片正面标题]] 连线
      if (card.linkedCards && card.linkedCards.length > 0) {
        card.linkedCards.forEach((refTitle) => {
          const targetId = cardTitleToIdMap.get(refTitle.toLowerCase());
          if (targetId && targetId !== card.id) {
            tempLinks.push({
              source: card.id,
              target: targetId,
            });
          }
        });
      }

      // 4. 提取并加入标签节点并连线
      card.tags.forEach((tag) => {
        const tagId = `tag-${tag}`;
        if (!addedTags.has(tag)) {
          addedTags.add(tag);
          tempNodes.push({
            id: tagId,
            label: `#${tag}`,
            type: "tag",
            x: getRandPos(width),
            y: getRandPos(height),
            vx: 0,
            vy: 0,
          });
        }
        // 建立连接
        tempLinks.push({
          source: card.id,
          target: tagId,
        });
      });
    });

    setNodes(tempNodes);
    setLinks(tempLinks);
  }, [cards]);

  // 2. 动画帧更新，使用极简 Verlet/Euler 物理引擎模拟引力和斥力
  useEffect(() => {
    if (nodes.length === 0) return;

    let animId: number;

    const tick = () => {
      setNodes((prevNodes) => {
        const nextNodes = prevNodes.map((n) => ({ ...n }));

        // 1. 向中心聚拢的重力
        const centerX = width / 2;
        const centerY = height / 2;
        nextNodes.forEach((n) => {
          n.vx += (centerX - n.x) * 0.003;
          n.vy += (centerY - n.y) * 0.003;
        });

        // 2. 节点间的排斥力 (防止重叠)
        for (let i = 0; i < nextNodes.length; i++) {
          for (let j = i + 1; j < nextNodes.length; j++) {
            const n1 = nextNodes[i];
            const n2 = nextNodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.hypot(dx, dy) || 1;
            
            // 节点排斥半径
            const r = n1.type === "tag" && n2.type === "tag" ? 90 : 70;
            if (dist < r) {
              const force = (r - dist) * 0.04;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              n1.vx -= fx;
              n1.vy -= fy;
              n2.vx += fx;
              n2.vy += fy;
            }
          }
        }

        // 3. 连线弹性拉力
        links.forEach((link) => {
          const sNode = nextNodes.find((n) => n.id === link.source);
          const tNode = nextNodes.find((n) => n.id === link.target);
          if (sNode && tNode) {
            const dx = tNode.x - sNode.x;
            const dy = tNode.y - sNode.y;
            const dist = Math.hypot(dx, dy) || 1;
            const targetDist = 60; // 弹簧理想长度
            const springForce = (dist - targetDist) * 0.008;
            const fx = (dx / dist) * springForce;
            const fy = (dy / dist) * springForce;
            
            sNode.vx += fx;
            sNode.vy += fy;
            tNode.vx -= fx;
            tNode.vy -= fy;
          }
        });

        // 4. 应用速度与边界摩擦
        nextNodes.forEach((n) => {
          n.x += n.vx;
          n.y += n.vy;
          
          // 摩擦系数
          n.vx *= 0.82;
          n.vy *= 0.82;

          // 限制在画布边界内
          n.x = Math.max(20, Math.min(width - 20, n.x));
          n.y = Math.max(20, Math.min(height - 20, n.y));
        });

        return nextNodes;
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [links, nodes.length]);

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* 移动端局部子 Tab 导航栏 (Brain Sub-Tabs) - 仅在小屏 (md以下) 显示 */}
      <div className="flex border-b border-border-subtle bg-surface-1 md:hidden flex-shrink-0">
        {[
          { id: "list", label: "卡片列表" },
          { id: "editor", label: "卡片编辑" },
          { id: "graph", label: "知识图谱" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setBrainSubTab(tab.id as any)}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all ${
              brainSubTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. 左栏：卡片过滤列表 (占 30% 宽度) */}
      <div className={`w-full md:w-[280px] bg-surface-2/40 md:border-r border-border-subtle flex flex-col flex-shrink-0 ${
        brainSubTab === "list" ? "flex" : "hidden md:flex"
      }`}>
        <div className="p-4 border-b border-border-subtle flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary font-mono flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-primary" /> 卡片记忆库
          </h2>
          {/* 搜索框 */}
          <div className="flex items-center gap-2 px-2.5 h-9 rounded-lg bg-surface-1 border border-border-subtle">
            <Search className="w-3.5 h-3.5 text-neutral-gray" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索正面/反面/标签..."
              className="flex-1 bg-transparent border-0 outline-none text-xs text-text-primary placeholder:text-neutral-gray"
            />
          </div>
        </div>

        {/* 过滤结果列表 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredCards.length === 0 ? (
            <div className="text-center py-8 text-[11px] text-neutral-gray">
              未检索到卡片
            </div>
          ) : (
            filteredCards.map((card) => {
              const isSelected = card.id === selectedCardId;
              return (
                <div
                  key={card.id}
                  onClick={() => {
                    setSelectedCardId(card.id);
                    setBrainSubTab("editor"); // 点击卡片自动切到编辑
                  }}
                  className={`p-3 rounded-lg cursor-pointer transition-colors select-none relative group ${
                    isSelected ? "bg-surface-1 text-primary" : "hover:bg-surface-1/40"
                  }`}
                >
                  <div className="text-xs font-semibold truncate pr-4">
                    {card.front}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {card.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] text-text-secondary bg-surface-2 px-1 rounded"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCard(card.id);
                    }}
                    className="absolute right-2 top-3 text-text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* 新建卡片按钮 */}
        <div className="p-3 border-t border-border-subtle bg-surface-1">
          <button
            onClick={() => {
              setSelectedCardId(null);
              setBrainSubTab("editor"); // 点击新建自动切到编辑
            }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-surface-1 border border-border-subtle hover:border-primary text-xs font-bold transition-all duration-200 text-text-primary active:scale-95"
          >
            <Plus className="w-4 h-4 text-primary" />
            <span>新建记忆卡片</span>
          </button>
        </div>
      </div>

      {/* 2. 中栏：卡片编辑器 (占主面积) */}
      <div className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-6 flex flex-col ${
        brainSubTab === "editor" ? "flex" : "hidden md:flex"
      }`}>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">第二大脑 (Brain Space)</h1>
          <p className="text-xs text-text-secondary mt-1">
            将学到的高价值核心知识提炼为正反面卡片。系统将在后台依据 SM-2 算法进行主动的复习干预。
          </p>
        </div>

        <form onSubmit={handleSaveCard} className="space-y-4 bg-surface-1 border border-border-subtle p-4 md:p-5 rounded-2xl">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            {selectedCardId ? "编辑卡片 (Edit Card)" : "创建卡片 (Create Card)"}
          </h2>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
              正面 提示问题 (Front)
            </label>
            <textarea
              required
              rows={3}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="提出一个挑战自我的核心提问或要点概念 (支持 Markdown)"
              className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none resize-none font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
              背面 核心解答 (Back - 支持 Markdown 与 [[双向链接]])
            </label>
            {editor ? (
              <>
                <EditorContent editor={editor} />
                {/* AI 提取闪卡工具栏 */}
                <div className="mt-2 p-3 bg-surface-2/40 border border-border-subtle/60 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <span className="text-[10px] text-ai-blue uppercase tracking-widest font-mono font-bold block mb-0.5">
                      ✨ AI 划词闪卡生成器
                    </span>
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      {selectedText 
                        ? `已选中 ${selectedText.length} 个字符，点此一键提炼 Q&A 闪卡` 
                        : "在上方编辑器中用鼠标划词选中段落，AI 将自动提取 1-3 张记忆闪卡"}
                    </p>
                  </div>
                  
                  <button
                    type="button"
                    disabled={!selectedText || isExtracting}
                    onClick={handleExtractCards}
                    className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all duration-200 relative active:scale-95 ${
                      selectedText && !isExtracting
                        ? "bg-ai-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                        : "bg-surface-3 text-text-secondary cursor-not-allowed"
                    }`}
                  >
                    {isExtracting ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span>提取中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI 一键提取</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <textarea
                required
                rows={6}
                value={back}
                onChange={(e) => setBack(e.target.value)}
                placeholder="编辑器加载中..."
                className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-border-subtle text-xs text-text-primary outline-none resize-none font-mono"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
              分类标签 (Tags)
            </label>
            <div className="relative">
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="使用逗号隔开不同标签，例如：AI, Agent, 学习科学"
                className="w-full pl-8 pr-3 py-2 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary text-xs text-text-primary outline-none font-mono"
              />
              <Tag className="w-3.5 h-3.5 text-neutral-gray absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-primary-text transition-all duration-200 rounded-lg text-xs font-bold uppercase tracking-widest active:scale-95"
            >
              {selectedCardId ? "保存修改" : "保存至第二大脑"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCardId(null);
                setFront("");
                setBack("");
                setTagsInput("");
                if (editor) editor.commands.clearContent();
                setBrainSubTab("list"); // 取消返回列表
              }}
              className="px-6 bg-surface-3 hover:bg-surface-2 border border-border-subtle transition-all duration-200 rounded-lg text-xs font-semibold active:scale-95"
            >
              取消
            </button>
          </div>
        </form>
      </div>

      {/* 3. 右栏：局部知识图谱 (Graph View，占 360px 宽度) */}
      <div className={`w-full md:w-[360px] bg-surface-2/40 md:border-l border-border-subtle flex flex-col flex-shrink-0 overflow-hidden ${
        brainSubTab === "graph" ? "flex" : "hidden md:flex"
      }`}>
        <div className="p-4 border-b border-border-subtle flex flex-col gap-1">
          <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary font-mono flex items-center gap-2">
            <LinkIcon className="w-3.5 h-3.5 text-primary" /> 局部知识网图 (Graph)
          </h2>
          <p className="text-[10px] text-neutral-gray leading-relaxed">
            物理斥力模拟。圆圈为卡片，标签为绿色井号 `#`。有共同标签的卡片会相互拉近聚拢。
          </p>
        </div>

        <div className="flex-1 flex items-center justify-center bg-surface-1/10 relative p-4">
          {nodes.length === 0 ? (
            <div className="text-[11px] text-neutral-gray flex flex-col items-center gap-1">
              <HelpCircle className="w-6 h-6 stroke-[1.5]" />
              <span>暂无网络拓扑数据</span>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              className="w-full max-w-[360px] h-auto overflow-visible select-none"
            >
              {/* 渲染连接边 */}
              {links.map((link, idx) => {
                const sNode = nodes.find((n) => n.id === link.source);
                const tNode = nodes.find((n) => n.id === link.target);
                if (!sNode || !tNode) return null;
                
                const isHighlighted = sNode.id === selectedCardId || tNode.id === selectedCardId;
                
                return (
                  <line
                     key={idx}
                     x1={sNode.x}
                     y1={sNode.y}
                     x2={tNode.x}
                     y2={tNode.y}
                     stroke={isHighlighted ? "#1DB954" : "#282828"}
                     strokeWidth={isHighlighted ? 1.5 : 1}
                     strokeOpacity={isHighlighted ? 0.9 : 0.4}
                  />
                );
              })}

              {/* 渲染节点 */}
              {nodes.map((node) => {
                const isSelected = node.id === selectedCardId;
                const isLinkedToSelected = links.some(
                  (l) =>
                    (l.source === node.id && l.target === selectedCardId) ||
                    (l.target === node.id && l.source === selectedCardId)
                );

                const isHighlight = isSelected || isLinkedToSelected;

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => {
                      if (node.type === "card") {
                        setSelectedCardId(node.id);
                        setBrainSubTab("editor"); // 图谱内点击卡片自动切换到编辑页
                      }
                    }}
                  >
                    {node.type === "card" ? (
                      // 卡片节点渲染成精细圆圈
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isSelected ? 10 : 8}
                        fill={isHighlight ? "#1DB954" : "#282828"}
                        stroke={isHighlight ? "#1ED760" : "#535353"}
                        strokeWidth={1.5}
                      />
                    ) : (
                      // 标签节点渲染成微型透明胶囊
                      <rect
                        x={node.x - 22}
                        y={node.y - 8}
                        width={44}
                        height={16}
                        rx={4}
                        fill="#181818"
                        stroke={isHighlight ? "#3b82f6" : "#282828"}
                        strokeWidth={1}
                      />
                    )}
                    
                    {/* 文字标签 */}
                    <text
                      x={node.x}
                      y={node.y + (node.type === "card" ? 18 : 3)}
                      textAnchor="middle"
                      className={`text-[9px] font-sans font-medium transition-colors select-none ${
                        isHighlight
                          ? "fill-primary font-bold"
                          : "fill-neutral-gray"
                      }`}
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      
      {/* Toast 提示通知层 */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed bottom-6 left-6 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 font-mono ${
              toast.type === "success"
                ? "bg-surface-1 border-primary/40 text-primary shadow-[0_0_15px_rgba(29,185,84,0.2)]"
                : "bg-surface-1 border-error/40 text-error shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            }`}
          >
            <Sparkles className={`w-4 h-4 ${toast.type === "success" ? "text-primary animate-pulse" : "text-error"}`} />
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
