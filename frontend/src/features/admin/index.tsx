import React from 'react';

/**
 * 管理后台页骨架（归属：子代理 E）
 */
export const AdminPage: React.FC = () => {
  return (
    <div className="college-card p-6">
      <h1 className="text-xl font-bold text-slate-900 mb-2">系统管理后台</h1>
      <p className="text-sm text-slate-500">
        模型配置、账号管理与每日 Token 额度管理（由子代理 E 实现）
      </p>
    </div>
  );
};
export default AdminPage;
