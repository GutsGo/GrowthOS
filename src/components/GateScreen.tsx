"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ArrowRight, Lock, Unlock } from "lucide-react";

interface GateScreenProps {
  onVerified: () => void;
}

export default function GateScreen({ onVerified }: GateScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦输入框
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLoading) return;

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (data.success) {
        setIsSuccess(true);
        // 将验证状态存入 sessionStorage，刷新页面后需重新验证
        sessionStorage.setItem("growthOS_authenticated", "true");
        if (data.token) {
          sessionStorage.setItem("growthOS_auth_token", data.token);
        }
        // 延迟跳转让成功动画播完
        setTimeout(() => {
          onVerified();
        }, 800);
      } else {
        setError(data.message || "密码错误");
        setPassword("");
        inputRef.current?.focus();
      }
    } catch {
      setError("网络连接失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background-void">
      {/* 背景动效：微弱的网格脉冲 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(29,185,84,0.06)_0%,transparent_60%)]" />
        {/* 动态呼吸圈 */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-primary/5"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.08, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-primary/8"
          animate={{
            scale: [1.1, 1, 1.1],
            opacity: [0.1, 0.25, 0.1],
          }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
        />
      </div>

      {/* 主卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm mx-4"
      >
        <div className="relative bg-surface-1 border border-border-subtle rounded-2xl p-8 backdrop-blur-xl shadow-level-3">
          {/* 顶部图标 */}
          <motion.div
            className="flex justify-center mb-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <div className="relative">
              <AnimatePresence mode="wait">
                {isSuccess ? (
                  <motion.div
                    key="unlocked"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center border border-primary/20"
                  >
                    <Unlock className="w-7 h-7 text-primary" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="locked"
                    className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center border border-border-subtle"
                  >
                    <Shield className="w-7 h-7 text-text-secondary" />
                  </motion.div>
                )}
              </AnimatePresence>
              {/* 图标底部微光 */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-primary/10 blur-sm" />
            </div>
          </motion.div>

          {/* 标题 */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-text-primary tracking-tight mb-1">
              Growth<span className="text-primary">OS</span>
            </h1>
            <p className="text-xs text-text-secondary font-medium tracking-wide uppercase">
              Access Verification
            </p>
          </div>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="输入访问密码"
                disabled={isSuccess}
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-surface-2 border border-border-subtle text-text-primary text-sm placeholder:text-muted-gray focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all duration-200 disabled:opacity-50"
                autoComplete="off"
              />
            </div>

            {/* 错误提示 */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -4, height: 0 }}
                  className="overflow-hidden"
                >
                  <p className="text-xs text-error font-medium px-1">
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 提交按钮 */}
            <motion.button
              type="submit"
              disabled={!password.trim() || isLoading || isSuccess}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
                isSuccess
                  ? "bg-primary text-primary-text"
                  : "bg-primary hover:bg-primary-hover text-primary-text disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              {isLoading ? (
                <motion.div
                  className="w-4 h-4 border-2 border-primary-text/30 border-t-primary-text rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              ) : isSuccess ? (
                <>
                  <span>验证成功</span>
                  <motion.span
                    initial={{ x: -4, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                  >
                    ✓
                  </motion.span>
                </>
              ) : (
                <>
                  <span>验证进入</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </form>

          {/* 底部提示 */}
          <div className="mt-6 text-center">
            <p className="text-[10px] text-muted-gray font-mono tracking-wider uppercase">
              Protected by Password · Local-First
            </p>
          </div>
        </div>
      </motion.div>

      {/* 成功时的全屏闪光过渡 */}
      <AnimatePresence>
        {isSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="absolute inset-0 bg-background-void z-10"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
