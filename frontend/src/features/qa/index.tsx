import React from 'react';

/**
 * RAG 流式问答页骨架（归属：子代理 C）
 */
export const QaPage: React.FC = () => {
  return (
    <div className="college-card p-6">
      <h1 className="text-xl font-bold text-slate-900 mb-2">教务智能问答 (RAG)</h1>
      <p className="text-sm text-slate-500">
        自然语言流式问答与原文片段溯源跳转（由子代理 C 实现）
      </p>
    </div>
  );
};
export default QaPage;
