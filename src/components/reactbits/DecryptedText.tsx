"use client";

import React, { useState, useEffect, useRef } from "react";

interface DecryptedTextProps {
  text: string;
  speed?: number; // 每次变换的速度（毫秒）
  delay?: number; // 初始延迟（毫秒）
  className?: string;
  animateOnHover?: boolean; // 是否在鼠标悬停时重新触发
}

// 解密混淆所使用的随机字符集
const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*";

export default function DecryptedText({
  text,
  speed = 40,
  delay = 0,
  className = "",
  animateOnHover = false,
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 开始执行解密乱码动画
  const startAnimation = () => {
    if (isAnimating) return;
    setIsAnimating(true);

    let iteration = 0;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setDisplayText(() => {
        return text
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            // 如果已迭代到当前位置，则渲染正确的目标字符
            if (index < iteration) {
              return text[index];
            }
            // 否则随机混淆一个乱码字符
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join("");
      });

      // 当所有字符都完全揭示后，结束动画
      if (iteration >= text.length) {
        clearInterval(timerRef.current!);
        setIsAnimating(false);
      }
      iteration += 1 / 3; // 控制每次字符解密的增量速度，越小揭示越慢
    }, speed);
  };

  useEffect(() => {
    const startDelay = setTimeout(() => {
      startAnimation();
    }, delay);

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, delay, speed]);

  return (
    <span
      className={className}
      onMouseEnter={() => {
        if (animateOnHover && !isAnimating) {
          startAnimation();
        }
      }}
    >
      {displayText || text}
    </span>
  );
}
