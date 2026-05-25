"use client";

import React, { useEffect, useRef, useState } from "react";

interface SquaresProps {
  className?: string;
  squareSize?: number; // 单个网格大小 (px)
  gridGap?: number; // 网格间距 (px)
  borderColor?: string; // 默认网格线条颜色
  hoverFillColor?: string; // 鼠标掠过时的填充颜色
  speed?: number; // 网格亮度更新过渡速度
}

export default function Squares({
  className = "",
  squareSize = 48,
  gridGap = 1,
  borderColor = "rgba(40, 40, 40, 0.25)",
  hoverFillColor = "rgba(29, 185, 84, 0.04)",
  speed = 0.05,
}: SquaresProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredSquare, setHoveredSquare] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    // 自适应父级容器的宽高
    const resizeCanvas = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const columns = Math.ceil(canvas.width / (squareSize + gridGap));
    const rows = Math.ceil(canvas.height / (squareSize + gridGap));

    // 二维数组记录每个格子的当前亮度和目标亮度
    const squareStates = Array.from({ length: columns }, () =>
      Array.from({ length: rows }, () => ({
        targetOpacity: 0,
        currentOpacity: 0,
      }))
    );

    // 主渲染绘制逻辑
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let col = 0; col < columns; col++) {
        for (let row = 0; row < rows; row++) {
          const x = col * (squareSize + gridGap);
          const y = row * (squareSize + gridGap);

          // 极低概率随机激发某些网格的微弱亮光
          if (Math.random() < 0.001) {
            squareStates[col][row].targetOpacity = Math.random() * 0.08;
          }

          // 透明度平滑插值过渡
          const state = squareStates[col][row];
          state.currentOpacity += (state.targetOpacity - state.currentOpacity) * speed;

          if (Math.abs(state.targetOpacity - state.currentOpacity) < 0.005) {
            state.targetOpacity = 0; // 亮光结束后归于黑暗
          }

          // 绘制触发微光的绿色网格
          if (state.currentOpacity > 0.01) {
            ctx.fillStyle = `rgba(29, 185, 84, ${state.currentOpacity})`;
            ctx.fillRect(x, y, squareSize, squareSize);
          }

          // 绘制鼠标悬停高亮格子
          if (hoveredSquare && hoveredSquare.x === col && hoveredSquare.y === row) {
            ctx.fillStyle = hoverFillColor;
            ctx.fillRect(x, y, squareSize, squareSize);
          }

          // 绘制网格边框
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, squareSize, squareSize);
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    // 监听鼠标事件用于悬停高亮计算
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const col = Math.floor(clientX / (squareSize + gridGap));
      const row = Math.floor(clientY / (squareSize + gridGap));

      if (col >= 0 && col < columns && row >= 0 && row < rows) {
        setHoveredSquare({ x: col, y: row });
      } else {
        setHoveredSquare(null);
      }
    };

    const handleMouseLeave = () => {
      setHoveredSquare(null);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [squareSize, gridGap, borderColor, hoverFillColor, speed, hoveredSquare]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none z-0 ${className}`}
    />
  );
}
