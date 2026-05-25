'use client';

import React, { useRef, useState } from 'react';

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string; // 聚光灯的颜色，默认是 Spotify 绿的微光
}

export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(29, 185, 84, 0.12)',
  ...props
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  // 监听鼠标在卡片内的移动，实时更新聚光灯的相对中心坐标
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const card = cardRef.current;
    const rect = card.getBoundingClientRect();

    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseEnter = () => setOpacity(1);
  const handleMouseLeave = () => setOpacity(0);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-lg border border-border-subtle bg-surface-1 transition-all duration-300 ${className}`}
      {...props}
    >
      {/* 聚光灯光晕层，通过 radial-gradient 渐变展现跟随效果 */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 z-0"
        style={{
          opacity,
          background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
        }}
      />
      {/* 核心内容容器，需置于聚光灯层之上以确保交互正常 */}
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}
