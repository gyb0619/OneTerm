import React from 'react';

/**
 * 教务信息导入与结构化事件抽取页骨架（归属：子代理 A）
 */
export const ExtractPage: React.FC = () => {
  return (
    <div className="college-card p-6">
      <h1 className="text-xl font-bold text-slate-900 mb-2">教务信息导入与抽取</h1>
      <p className="text-sm text-slate-500">
        支持粘贴文本、txt、xlsx、图片导入及 SSE 流式进度抽取（由子代理 A 实现）
      </p>
    </div>
  );
};
export default ExtractPage;
