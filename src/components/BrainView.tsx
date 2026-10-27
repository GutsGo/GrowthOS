"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { db, trackDeletion } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useEditor, EditorContent, Extension, type Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { useAppStore } from "@/lib/store";
import StarterKit from "@tiptap/starter-kit";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { useLearningSettings } from "@/lib/learning/settings";
import {
  CARD_TYPES,
  CARD_TYPE_LABEL,
  type CardType,
} from "@/lib/learning/types";
import { dayKey } from "@/lib/learning/queue";
import {
  MAX_POOL_SIZE,
  buildCandidates,
  mergeCandidates,
  pendingCandidates,
  type CardCandidate,
} from "@/lib/learning/probe";
import CandidatePool from "./brain/CandidatePool";
import {
  BookOpen,
  Plus,
  Trash2,
  Tag,
  Search,
  Sparkles,
  Link as LinkIcon,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import {
  ReactFlow,
  type Node as FlowNode,
  type NodeProps,
  type ReactFlowInstance,
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

function findBiLinks(doc: PMNode) {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
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
/** React Flow 的节点数据。用 type 别名（不是 interface）才满足 v12 的 Record 约束。 */
type CardNodeData = { label: string; isSelected: boolean };
type TagNodeData = { label: string };

const CardNodeComponent = ({ data }: NodeProps<FlowNode<CardNodeData, "cardNode">>) => {
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

const TagNodeComponent = ({ data }: NodeProps<FlowNode<TagNodeData, "tagNode">>) => {
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
  // `useLiveQuery(...) || []` 每次渲染都新建一个空数组，而下面多个 useMemo/effect 以它
  // 为依赖 —— 兜底那个 `[]` 会让「没数据」时也每帧重算。拆成两行，引用只在数据变时换。
  const cardsRaw = useLiveQuery(() => db.cards.toArray());
  const cards = useMemo(() => cardsRaw ?? [], [cardsRaw]);
  const theme = useAppStore((state) => state.theme);
  const currentDate = useAppStore((state) => state.currentDate);
  const settings = useLearningSettings();

  // 今日新卡记账：到上限后只提醒，不阻止。
  // 手册第 3 号弃坑机制是「一次做几百张新卡，队列堆爆直接弃坑」，
  // 所以要有刹车，但刹车不能是「禁止」，否则用户会绕过它（另起一个库）。
  const newLimit = settings?.dailyNewCardLimit ?? 2;
  const createdToday = useMemo(
    () =>
      cards.filter((c) => {
        const t = new Date(c.createdAt).getTime();
        return Number.isFinite(t) && dayKey(t) === currentDate;
      }).length,
    [cards, currentDate],
  );

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [brainSubTab, setBrainSubTab] = useState<"list" | "editor" | "graph">("list");

  // 编辑器表单状态
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  // v4 字段：一张卡只考一个细节（type），以及一个能让自己记住的例子（example）
  const [cardType, setCardType] = useState<CardType>("concept");
  const [example, setExample] = useState("");

  // AI 闪卡提取状态与 Toast 提示
  const [selectedText, setSelectedText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  /** 当前表单的题目是否来自候选池；保存成功后才把它移出池子 */
  const [adoptedCandidateId, setAdoptedCandidateId] = useState<string | null>(null);
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
  const checkSuggestions = (editorInstance: Editor) => {
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

  /*
   * 选中卡片变化 → 回填表单。
   *
   * 原来是 useEffect，两个问题：
   * 1. effect 在这一帧提交之后才跑，中间存在一帧「列表已选中第 3 张、
   *    右边表单还是第 2 张的内容」。手快的人在这一帧按保存，就存到新卡上去了。
   * 2. 依赖里带 `cards`，每次 liveQuery 回推（哪怕只是别的卡改了）都会重跑，
   *    把正在编辑的内容覆盖掉。
   *
   * 改成渲染期按「表单当前对应哪张卡」修正：同一个渲染里就是对的，
   * 且只有 id 真的变了才回填，编辑中不会被后台数据打断。
   */
  const [formCardId, setFormCardId] = useState<string | null>(null);
  if (formCardId !== selectedCardId) {
    setFormCardId(selectedCardId);
    const activeCard = selectedCardId
      ? cards.find((c) => c.id === selectedCardId)
      : undefined;
    setFront(activeCard?.front ?? "");
    setBack(activeCard?.back ?? "");
    setTagsInput(activeCard?.tags.join(", ") ?? "");
    setCardType(activeCard?.type ?? "concept");
    setExample(activeCard?.example ?? "");
    setSelectedText(""); // 切换卡片时重置划词
    if (!activeCard && editor) {
      editor.commands.clearContent();
    }
  }

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

  /**
   * 划选一段原文 → 1 张卡 + 3 个追问（Phase 4）
   *
   * 老实现一次给 3 张完整卡、全部直接落库。结果是：你得到 3 张不用动脑的卡，
   * 而「提取」这个最有效的学习动作被系统代劳了。
   *
   * 现在的分工是刻意的：AI 只做 1 张（省事的部分归它），
   * 另外 3 个追问进候选池，等你回来自己答（费脑的部分归你）。
   */
  const handleExtractCards = async () => {
    if (!selectedText || !editor || isExtracting) return;

    setIsExtracting(true);
    try {
      const response = await apiFetch("/api/extract-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectedText }),
      });

      if (!response.ok) {
        throw new Error("请求提取接口失败");
      }

      const data = (await response.json()) as {
        card?: { front: string; back: string; tags?: string[]; type?: CardType };
        probes?: string[];
        fallback?: boolean;
      };

      if (!data.card?.front || !data.card?.back) {
        throw new Error("没有拿到可用的卡片");
      }

      await db.cards.put({
        id: crypto.randomUUID(),
        front: data.card.front,
        back: data.card.back,
        tags: data.card.tags?.length ? data.card.tags : ["AI提取"],
        type: data.card.type ?? "concept",
        reps: 0,
        interval: 0,
        ease: 2.5,
        nextReview: new Date(),
        createdAt: new Date(),
      });

      // 追问进候选池：先和已有的比对去重，再裁到上限（裁掉最旧的）
      const incoming = buildCandidates(data.probes ?? [], selectedText, Date.now(), () =>
        crypto.randomUUID(),
      );
      if (incoming.length) {
        const existing = await db.cardCandidates.toArray();
        const merged = mergeCandidates(existing, incoming);
        const existingIds = new Set(existing.map((c) => c.id));
        const fresh = merged.filter((c) => !existingIds.has(c.id));
        if (fresh.length) await db.cardCandidates.bulkPut(fresh);

        const overflow = pendingCandidates(merged).slice(MAX_POOL_SIZE);
        if (overflow.length) {
          await db.cardCandidates.bulkDelete(overflow.map((c) => c.id));
        }
      }

      // 清除选区，让光标停留在原选区终点
      const { to } = editor.state.selection;
      editor.commands.setTextSelection({ from: to, to: to });
      setSelectedText("");

      setToast({
        show: true,
        msg: `已存 1 张卡${
          incoming.length ? `，${incoming.length} 个追问进候选池` : ""
        }${data.fallback ? "（本地提取）" : ""}`,
        type: "success",
      });
    } catch (err: unknown) {
      console.error(err);
      setToast({
        show: true,
        msg: `提炼失败：${err instanceof Error ? err.message : "未知错误"}`,
        type: "error",
      });
    } finally {
      setIsExtracting(false);
      // 4秒后自动关闭 Toast
      setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 4000);
    }
  };

  /**
   * 候选池 → 制卡表单。
   *
   * 只填正面（问题），背面留空——答案必须自己写。
   * 连答案一起预填的话，这张卡就白做了，而且你会以为自己懂了。
   *
   * 另外这里**不**把候选标记为已采用：用户可能点了「我来答」就关掉页面，
   * 那这条追问就凭空蒸发了。真正的出池发生在保存成功的那一刻。
   */
  const handleAdoptCandidate = (candidate: CardCandidate) => {
    setSelectedCardId(null);
    setFront(candidate.question);
    setBack("");
    setTagsInput("");
    setCardType("concept");
    setExample("");
    setAdoptedCandidateId(candidate.id);
    setBrainSubTab("editor");
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
          type: cardType,
          example: example.trim(),
        });
      }
    } else {
      await db.cards.add({
        id: crypto.randomUUID(),
        front,
        back,
        tags,
        linkedCards: linked,
        type: cardType,
        example: example.trim(),
        reps: 0,
        interval: 0,
        ease: 2.5,
        nextReview: new Date(),
        createdAt: new Date(),
      });
    }

    // 保存成功 = 这条追问真的被回答了，这时才移出候选池
    if (adoptedCandidateId) {
      await db.cardCandidates.update(adoptedCandidateId, { adopted: true });
      setAdoptedCandidateId(null);
    }

    setSelectedCardId(null);
    setFront("");
    setBack("");
    setTagsInput("");
    setCardType("concept");
    setExample("");
    if (editor) {
      editor.commands.clearContent();
    }
    setBrainSubTab("list");
  };

  // 删除卡片
  const handleDeleteCard = async (id: string) => {
    if (confirm("确定删除这张卡？")) {
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
    /*
     * 这里故意只依赖 cards，不依赖 selectedCardId / theme：
     * 这个 effect 会重跑一遍力导向布局，把节点坐标全部重算。
     * 选中一张卡只是高亮变了，如果因此重跑布局，用户刚拖好的位置会弹回去。
     * 高亮由下一个 effect 单独负责（只改 data.isSelected / style，不动 position）。
     * theme 变化同理——真需要换配色时刷新一次页面，比每次拖拽都抖一下强。
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleReactFlowInit = (instance: ReactFlowInstance) => {
    setTimeout(() => {
      instance.fitView({ padding: 0.25 });
    }, 100);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* 移动端局部子 Tab 导航栏 (Brain Sub-Tabs) - 仅在小屏 (md以下) 显示 */}
      <div className="flex border-b border-border-subtle bg-surface-1 md:hidden flex-shrink-0">
        {(
          [
            { id: "list", label: "卡片列表" },
            { id: "editor", label: "卡片编辑" },
            { id: "graph", label: "知识图谱" },
          ] as { id: "list" | "editor" | "graph"; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setBrainSubTab(tab.id)}
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
        <div className="px-4 pt-6 pb-4 border-b border-border-subtle flex flex-col gap-2">
          <h2 className="section-title flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-primary" /> 卡片记忆库
          </h2>
          {/* 搜索框 */}
          <div className="flex items-center gap-2 px-2.5 h-9 rounded-[8px] bg-surface-1 border border-border-subtle focus-within:border-primary">
            <Search className="w-3.5 h-3.5 text-neutral-gray" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索正面、反面、标签"
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
                    className="btn btn-xs btn-ghost absolute right-1 top-2 !w-6 !px-0 hover:!text-error opacity-0 group-hover:opacity-100 transition-opacity duration-150"
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
            className="btn btn-sm btn-secondary w-full !border-border-subtle hover:!border-primary"
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
        <header>
          <p className="eyebrow">Brain · Flashcards</p>
          <h1 className="page-title mt-1">制卡与图谱</h1>
          <p className="page-sub">一张卡只考一个细节。</p>
        </header>

        {/* 候选池：AI 出的题（没有答案）。答完才从池子里消失 */}
        <CandidatePool onAdopt={handleAdoptCandidate} />

        <form onSubmit={handleSaveCard} className="surface-card space-y-4 p-4 md:p-5">
          <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            {selectedCardId ? "编辑卡片" : "新建卡片"}
          </h2>

          {/* 新卡当日上限：只提醒，不拦 */}
          {!selectedCardId && createdToday >= newLimit && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-text-secondary leading-relaxed">
                今天已建{" "}
                <span className="text-amber-500 font-bold">{createdToday}</span>{" "}
                张（上限 {newLimit}），超出的顺延到明天。
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
              正面
            </label>
            <textarea
              required
              rows={3}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="一个具体问题，或一个要点。支持 Markdown"
              className="field field-area !min-h-[84px] font-mono"
            />
            {/* 软校验：只提醒，不拦。拦住用户只会让他换个写法绕过去，
                而「一张卡只考一个细节」这事，提醒一次就够了。 */}
            {front.length > 0 &&
              ((front.match(/[?？]/g)?.length ?? 0) > 1 || front.length > 80) && (
                <p className="text-[10px] text-amber-500 leading-relaxed pt-1">
                  出现多个问号，或正面太长，说明这是好几张卡。现在拆开。
                </p>
              )}
          </div>

          {/* 题型：交错练习要靠它把概念/面试/错题混排 */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
              题型
            </label>
            <div className="flex gap-2">
              {CARD_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCardType(type)}
                  className={`chip flex-1 ${cardType === type ? "chip-active" : ""}`}
                >
                  {CARD_TYPE_LABEL[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
              背面
            </label>
            {editor ? (
              <div className="relative">
                <EditorContent editor={editor} />
                
                {/* 悬浮卡片推荐面板 */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute left-3 top-[calc(100%-8px)] z-50 w-64 bg-surface-3 border border-border-subtle rounded-xl p-1.5 shadow-2xl flex flex-col gap-0.5">
                    <span className="text-[9px] text-text-secondary uppercase font-mono tracking-widest px-2 py-1 font-bold">
                      关联已有卡片
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
                      划词提取：1 张卡 + 3 个追问
                    </span>
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      {selectedText
                        ? `已选 ${selectedText.length} 个字符。生成 1 张卡，另 3 个追问进候选池。`
                        : "先在背面编辑器里划词选中段落。"}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={!selectedText || isExtracting}
                    onClick={handleExtractCards}
                    className={`btn btn-sm uppercase tracking-wider ${
                      selectedText && !isExtracting
                        ? "btn-ai shadow-[0_0_15px_rgba(59,130,246,0.25)]"
                        : "btn-soft !text-text-secondary"
                    }`}
                  >
                    {isExtracting ? (
                      <>
                        <div className="w-3 h-3 border-2 border-current/20 border-t-current rounded-full animate-spin" />
                        <span>提取中…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>提取</span>
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
                placeholder="加载中…"
                className="field field-area !min-h-[140px] font-mono"
              />
            )}
          </div>

          {/* 一个例子：手册里「讲得出来」的最低门槛 */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono flex items-center gap-1.5">
              例子
              <span className="text-[9px] font-normal normal-case tracking-normal text-text-secondary/60">
                选填
              </span>
            </label>
            <textarea
              rows={2}
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder="比如：ReAct 就像边查地图边走路——先看一眼再迈一步，而不是背完地图才出发。"
              className="field field-area !min-h-[64px]"
            />
            <p className="text-[10px] text-text-secondary/60 leading-relaxed">
              翻面时一并显示。
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-text-secondary font-mono">
              标签
            </label>
            <div className="relative">
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="逗号分隔，如：AI, Agent, 学习科学"
                className="field !pl-8 font-mono"
              />
              <Tag className="w-3.5 h-3.5 text-neutral-gray absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="btn btn-md btn-primary flex-1 uppercase tracking-widest"
            >
              {selectedCardId ? "保存修改" : "保存"}
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
              className="btn btn-md btn-soft"
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
        <div className="px-4 pt-6 pb-4 border-b border-border-subtle flex flex-col gap-1">
          <h2 className="section-title flex items-center gap-2">
            <LinkIcon className="w-3.5 h-3.5 text-primary" /> 知识网图
          </h2>
          <p className="text-[10px] text-neutral-gray leading-relaxed">
            有共同标签的卡片会互相聚拢。
          </p>
        </div>

        <div className="w-full h-[400px] md:h-full relative bg-surface-1/5 border border-border-subtle/50 overflow-hidden">
          {rfNodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[11px] text-neutral-gray gap-1">
              <HelpCircle className="w-6 h-6 stroke-[1.5]" />
              <span>暂无图谱数据</span>
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
