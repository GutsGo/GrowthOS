"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { db, Card, trackDeletion } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useEditor, EditorContent, Extension } from "@tiptap/react";
import { useAppStore } from "@/lib/store";
import StarterKit from "@tiptap/starter-kit";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
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
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// 1. TipTap 双向链接语法高亮 Decoration 插件
const BiLinkHighlight = Extension.create({
  name: "biLinkHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("biLinkHighlight"),
        state: {
          init(_, { doc }) {
            return findBiLinks(doc);
          },
          apply(tr, oldState) {
            return tr.docChanged ? findBiLinks(tr.doc) : oldState;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

function findBiLinks(doc: any) {
  const decorations: any[] = [];
  doc.descendants((node: any, pos: number) => {
    if (node.isText) {
      const text = node.text || "";
      const regex = /\[\[(.*?)\]\]/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const start = pos + match.index;
        const end = start + match[0].length;
        decorations.push(
          Decoration.inline(start, end, {
            class: "bg-primary/20 text-primary border border-primary/30 rounded px-1 font-mono font-semibold mx-0.5 shadow-sm",
          })
        );
      }
    }
  });
  return DecorationSet.create(doc, decorations);
}

// 2. React Flow 自定义节点组件
const CardNodeComponent = ({ data }: any) => {
  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Bottom}
        id="card-target"
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="card-source"
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0 }}
      />
      <div
        className={`px-3 py-1.5 rounded-xl border text-[10px] font-sans font-medium tracking-tight shadow-md select-none transition-all duration-200 relative z-10 ${
          data.isSelected
            ? "bg-surface-1 text-primary border-primary shadow-[0_0_12px_rgba(29,185,84,0.3)] scale-[1.03]"
            : "bg-surface-1 border-border-subtle text-text-primary hover:border-text-secondary"
        }`}
        style={{ maxWidth: 120 }}
      >
        <div className="truncate font-semibold text-center">{data.label}</div>
      </div>
    </div>
  );
};

const TagNodeComponent = ({ data }: any) => {
  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Bottom}
        id="tag-target"
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0 }}
      />
      <div className="px-2 py-1 rounded-lg border border-ai-blue bg-surface-1 text-[9px] text-ai-blue font-semibold font-mono tracking-tight shadow-sm select-none relative z-10">
        #{data.label.replace(/^#/, "")}
      </div>
    </div>
  );
};

const nodeTypes = {
  cardNode: CardNodeComponent,
  tagNode: TagNodeComponent,
};

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
  const theme = useAppStore((state) => state.theme);

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

  // 键盘关联面板的搜索状态
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  // 解决 TipTap 键盘事件回调闭包缓存问题的 Refs
  const showSuggestionsRef = useRef(false);
  const suggestionIndexRef = useRef(0);
  const filteredSuggestionsRef = useRef<string[]>([]);

  useEffect(() => {
    showSuggestionsRef.current = showSuggestions;
  }, [showSuggestions]);

  useEffect(() => {
    suggestionIndexRef.current = suggestionIndex;
  }, [suggestionIndex]);

  // 双链匹配卡片列表
  const suggestions = useMemo(() => {
    return cards
      .filter((c) => c.id !== selectedCardId)
      .map((c) => c.front.trim());
  }, [cards, selectedCardId]);

  const filteredSuggestions = useMemo(() => {
    const query = suggestionQuery.toLowerCase().trim();
    if (!query) return suggestions.slice(0, 5);
    return suggestions
      .filter((title) => title.toLowerCase().includes(query))
      .slice(0, 5);
  }, [suggestions, suggestionQuery]);

  useEffect(() => {
    filteredSuggestionsRef.current = filteredSuggestions;
  }, [filteredSuggestions]);

  // 处理双链输入匹配检测
  const checkSuggestions = (editorInstance: any) => {
    const { from } = editorInstance.state.selection;
    const textBefore = editorInstance.state.doc.textBetween(Math.max(0, from - 20), from, " ");
    const match = /\[\[([^\]]*)$/.exec(textBefore);
    if (match) {
      setShowSuggestions(true);
      setSuggestionQuery(match[1]);
      setSuggestionIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  // 插入关联卡片
  const selectSuggestion = (title: string) => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 20), from, " ");
    const match = /\[\[([^\]]*)$/.exec(textBefore);
    if (match) {
      const matchLength = match[0].length;
      const startPos = from - matchLength;
      
      editor
        .chain()
        .focus()
        .insertContentAt({ from: startPos, to: from }, `[[${title}]]`)
        .run();
    }
    setShowSuggestions(false);
  };

  // 处理 TipTap 按键劫持
  const onSuggestionKeyDown = (key: string) => {
    const list = filteredSuggestionsRef.current;
    if (list.length === 0) {
      if (key === "Escape") setShowSuggestions(false);
      return;
    }
    if (key === "ArrowDown") {
      setSuggestionIndex((prev) => (prev + 1) % list.length);
    } else if (key === "ArrowUp") {
      setSuggestionIndex((prev) => (prev - 1 + list.length) % list.length);
    } else if (key === "Enter") {
      const selectedTitle = list[suggestionIndexRef.current];
      if (selectedTitle) {
        selectSuggestion(selectedTitle);
      }
    } else if (key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // 初始化 TipTap 编辑器（为卡片背面提供富文本支持）
  const editor = useEditor({
    extensions: [StarterKit, BiLinkHighlight],
    content: "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setBack(editor.getHTML());
      checkSuggestions(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, " ");
      setSelectedText(text.trim());
      checkSuggestions(editor);
    },
    editorProps: {
      attributes: {
        class: "w-full min-h-[160px] p-3 bg-surface-2 rounded-lg border border-border-subtle focus:border-primary focus:outline-none text-xs text-text-primary prose prose-invert max-w-none prose-sm overflow-y-auto",
      },
      handleKeyDown: (view, event) => {
        if (showSuggestionsRef.current) {
          if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
            event.preventDefault();
            onSuggestionKeyDown(event.key);
            return true;
          }
        }
        return false;
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
      const response = await apiFetch("/api/extract-cards", {
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
      await trackDeletion("cards", id);
      if (selectedCardId === id) {
        setSelectedCardId(null);
      }
    }
  };

  // ==========================================
  // React Flow & Verlet 物理动力学拓扑引擎
  // ==========================================
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const width = 500;
  const height = 400;

  // 1. 同步进行力导向图物理碰撞运算，瞬间计算出完美的平衡位置，避免高频 tick 冲突和拖拽闪烁
  useEffect(() => {
    if (cards.length === 0) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }

    const tempNodes: GraphNode[] = [];
    const tempLinks: GraphLink[] = [];
    const addedTags = new Set<string>();

    const getRandPos = (max: number) => 40 + Math.random() * (max - 80);

    const cardTitleToIdMap = new Map<string, string>();
    cards.forEach((c) => {
      cardTitleToIdMap.set(c.front.trim().toLowerCase(), c.id);
    });

    cards.forEach((card) => {
      tempNodes.push({
        id: card.id,
        label: card.front.substring(0, 8) + (card.front.length > 8 ? "..." : ""),
        type: "card",
        x: getRandPos(width),
        y: getRandPos(height),
        vx: 0,
        vy: 0,
      });

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

      card.tags.forEach((tag) => {
        const tagId = `tag-${tag}`;
        if (!addedTags.has(tag)) {
          addedTags.add(tag);
          tempNodes.push({
            id: tagId,
            label: tag,
            type: "tag",
            x: getRandPos(width),
            y: getRandPos(height),
            vx: 0,
            vy: 0,
          });
        }
        tempLinks.push({
          source: card.id,
          target: tagId,
        });
      });
    });

    // ==================================================
    // 同步物理引擎计算（跑 120 帧，约 2 秒钟的模拟，使其静止就位）
    // ==================================================
    const simulationNodes = [...tempNodes];
    const centerX = width / 2;
    const centerY = height / 2;

    for (let step = 0; step < 120; step++) {
      // 1. 重力聚拢
      simulationNodes.forEach((n) => {
        n.vx += (centerX - n.x) * 0.003;
        n.vy += (centerY - n.y) * 0.003;
      });

      // 2. 斥力防止重叠
      for (let i = 0; i < simulationNodes.length; i++) {
        for (let j = i + 1; j < simulationNodes.length; j++) {
          const n1 = simulationNodes[i];
          const n2 = simulationNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.hypot(dx, dy) || 1;
          const r = n1.type === "tag" && n2.type === "tag" ? 110 : 90;
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
      tempLinks.forEach((link) => {
        const sNode = simulationNodes.find((n) => n.id === link.source);
        const tNode = simulationNodes.find((n) => n.id === link.target);
        if (sNode && tNode) {
          const dx = tNode.x - sNode.x;
          const dy = tNode.y - sNode.y;
          const dist = Math.hypot(dx, dy) || 1;
          const targetDist = 75;
          const springForce = (dist - targetDist) * 0.008;
          const fx = (dx / dist) * springForce;
          const fy = (dy / dist) * springForce;
          sNode.vx += fx;
          sNode.vy += fy;
          tNode.vx -= fx;
          tNode.vy -= fy;
        }
      });

      // 4. 应用速度与限制
      simulationNodes.forEach((n) => {
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x = Math.max(40, Math.min(width - 40, n.x));
        n.y = Math.max(40, Math.min(height - 40, n.y));
      });
    }

    // 2. 将最终稳定的物理坐标一次性塞给 React Flow，之后拖拽完全由 React Flow 接管，避免闪烁
    const calculatedRfNodes = simulationNodes.map((n) => ({
      id: n.id,
      type: n.type === "card" ? "cardNode" : "tagNode",
      position: { x: n.x, y: n.y },
      data: {
        label: n.label,
        id: n.id,
        isSelected: n.id === selectedCardId,
      },
    }));

    const calculatedRfEdges = tempLinks.map((link, idx) => {
      const isHighlighted =
        selectedCardId &&
        (link.source === selectedCardId || link.target === selectedCardId);
      const defaultLineColor = theme === "dark" ? "#4d4d4d" : "#c8c8cb";
      const isTargetTag = link.target.startsWith("tag-");
      return {
        id: `e-${idx}`,
        source: link.source,
        target: link.target,
        sourceHandle: "card-source",
        targetHandle: isTargetTag ? "tag-target" : "card-target",
        type: "straight",
        style: {
          stroke: isHighlighted ? "#1DB954" : defaultLineColor,
          strokeWidth: isHighlighted ? 2 : 1.2,
          opacity: isHighlighted ? 1.0 : 0.8,
        },
      };
    });

    setRfNodes(calculatedRfNodes);
    setRfEdges(calculatedRfEdges);
  }, [cards]);

  // 3. 动态控制高亮选中卡片的连线和节点高亮状态，保留用户拖动后的新位置而不会闪烁弹回
  useEffect(() => {
    setRfNodes((prevNodes) =>
      prevNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isSelected: n.id === selectedCardId,
        },
      }))
    );

    setRfEdges((prevEdges) =>
      prevEdges.map((edge) => {
        const isHighlighted =
          selectedCardId &&
          (edge.source === selectedCardId || edge.target === selectedCardId);
        const defaultLineColor = theme === "dark" ? "#4d4d4d" : "#c8c8cb";
        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: isHighlighted ? "#1DB954" : defaultLineColor,
            strokeWidth: isHighlighted ? 2 : 1.2,
            opacity: isHighlighted ? 1.0 : 0.8,
          },
        };
      })
    );
  }, [selectedCardId, theme, setRfNodes, setRfEdges]);

  const handleReactFlowInit = (instance: any) => {
    setTimeout(() => {
      instance.fitView({ padding: 0.25 });
    }, 100);
  };

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
              <div className="relative">
                <EditorContent editor={editor} />
                
                {/* 悬浮卡片推荐面板 */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute left-3 top-[calc(100%-8px)] z-50 w-64 bg-surface-3 border border-border-subtle rounded-xl p-1.5 shadow-2xl flex flex-col gap-0.5">
                    <span className="text-[9px] text-text-secondary uppercase font-mono tracking-widest px-2 py-1 font-bold">
                      💡 关联已有卡片
                    </span>
                    {filteredSuggestions.map((title, idx) => {
                      const isFocused = idx === suggestionIndex;
                      return (
                        <div
                          key={title}
                          onClick={() => selectSuggestion(title)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors truncate font-medium ${
                            isFocused
                              ? "bg-primary text-black font-semibold"
                              : "text-text-primary hover:bg-surface-2"
                          }`}
                        >
                          [[{title}]]
                        </div>
                      );
                    })}
                  </div>
                )}

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
              </div>
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

        <div className="w-full h-[400px] md:h-full relative bg-surface-1/5 border border-border-subtle/50 overflow-hidden">
          {rfNodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[11px] text-neutral-gray gap-1">
              <HelpCircle className="w-6 h-6 stroke-[1.5]" />
              <span>暂无网络拓扑数据</span>
            </div>
          ) : (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(e, node) => {
                if (node.type === "cardNode") {
                  setSelectedCardId(node.id);
                  setBrainSubTab("editor");
                }
              }}
              onInit={handleReactFlowInit}
              minZoom={0.1}
              maxZoom={3}
            >
              <Background
                variant={BackgroundVariant.Lines}
                color={theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)"}
                gap={16}
                size={0.5}
                className="opacity-60"
              />
              <Controls />
            </ReactFlow>
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
