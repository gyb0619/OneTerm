import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Cpu,
  Users,
  Activity,
  Plus,
  Trash2,
  Edit3,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Power,
} from 'lucide-react';
import { ApiClientError, httpClient } from '../../shared/api/httpClient';
import { useAppStore } from '../../shared/store/useAppStore';
import type { LlmRole, UserProfileResponse } from '../../shared/types/api';

interface AdminUserDto {
  id: number;
  username: string;
  role: 'ADMIN' | 'USER';
  enabled: boolean;
  dailyTokenLimit: number;
  todayTokensUsed: number;
  failedCount: number;
  lockedUntil?: string | null;
  preferredModelId?: number | null;
}

interface LlmConfigDto {
  id: number;
  role: LlmRole;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  enabled: boolean;
  updatedAt: string;
}

interface UsageLogDto {
  id: number;
  userId: number;
  username: string;
  kind: string;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
}

type AdminTab = 'configs' | 'users' | 'logs';

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser } = useAppStore();

  const [activeTab, setActiveTab] = useState<AdminTab>('configs');
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // 1. 模型配置状态
  const [configs, setConfigs] = useState<LlmConfigDto[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
  const [cfgRole, setCfgRole] = useState<LlmRole>('chat');
  const [cfgName, setCfgName] = useState('');
  const [cfgBaseUrl, setCfgBaseUrl] = useState('https://api.deepseek.com');
  const [cfgModel, setCfgModel] = useState('deepseek-chat');
  const [cfgApiKey, setCfgApiKey] = useState('');
  const [cfgEnabled, setCfgEnabled] = useState(true);

  // 2. 用户与额度管理状态
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'ADMIN'>('USER');
  const [newDailyLimit, setNewDailyLimit] = useState<number>(100000);
  const [quotaDrafts, setQuotaDrafts] = useState<Record<number, number>>({});
  const [resetTargetId, setResetTargetId] = useState<number | null>(null);
  const [resetNewPass, setResetNewPass] = useState('');

  // 3. 用量日志状态
  const [logs, setLogs] = useState<UsageLogDto[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [filterUserId, setFilterUserId] = useState<string>('');

  const showSuccess = (msg: string) => {
    setBannerError(null);
    setBannerSuccess(msg);
  };

  const showError = (err: unknown, fallback: string) => {
    setBannerSuccess(null);
    if (err instanceof ApiClientError) {
      setBannerError(err.message);
    } else {
      setBannerError(fallback);
    }
  };

  const loadConfigs = useCallback(async () => {
    setLoadingConfigs(true);
    try {
      const data = await httpClient.get<LlmConfigDto[]>('/api/admin/llm-configs');
      setConfigs(data);
    } catch (err) {
      showError(err, '获取模型配置列表失败');
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await httpClient.get<AdminUserDto[]>('/api/admin/users');
      setUsers(data);
      const drafts: Record<number, number> = {};
      data.forEach((u) => {
        drafts[u.id] = u.dailyTokenLimit;
      });
      setQuotaDrafts(drafts);
    } catch (err) {
      showError(err, '获取用户列表失败');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadLogs = useCallback(async (uidFilter?: string) => {
    setLoadingLogs(true);
    try {
      const query = uidFilter ? `?userId=${encodeURIComponent(uidFilter)}` : '';
      const data = await httpClient.get<UsageLogDto[]>(`/api/admin/usage-logs${query}`);
      setLogs(data);
    } catch (err) {
      showError(err, '获取 Token 用量日志失败');
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) return;
    setCheckingAuth(true);
    httpClient
      .get<UserProfileResponse>('/api/auth/me')
      .then((profile) => setCurrentUser(profile))
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, [currentUser, setCurrentUser]);

  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
      loadConfigs();
      loadUsers();
      loadLogs();
    }
  }, [currentUser, loadConfigs, loadUsers, loadLogs]);

  if (checkingAuth) {
    return (
      <div className="college-card p-8 text-center text-sm text-slate-500">
        正在校验管理员权限...
      </div>
    );
  }

  if (!currentUser || currentUser.role !== 'ADMIN') {
    return (
      <div className="max-w-lg mx-auto mt-12 college-card p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">仅系统管理员可访问</h2>
        <p className="text-xs text-slate-500 mb-6">
          管理后台仅对 ADMIN 角色开放。请使用管理员账号登录，或返回学期日历工作台。
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-primary text-xs"
          >
            前往登录页
          </button>
          <button
            type="button"
            onClick={() => navigate('/calendar')}
            className="btn-secondary text-xs"
          >
            返回日历主页
          </button>
        </div>
      </div>
    );
  }

  const resetConfigForm = () => {
    setEditingConfigId(null);
    setCfgRole('chat');
    setCfgName('');
    setCfgBaseUrl('https://api.deepseek.com');
    setCfgModel('deepseek-chat');
    setCfgApiKey('');
    setCfgEnabled(true);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        role: cfgRole,
        name: cfgName.trim(),
        baseUrl: cfgBaseUrl.trim(),
        model: cfgModel.trim(),
        apiKey: cfgApiKey.trim(),
        enabled: cfgEnabled,
      };
      if (editingConfigId !== null) {
        await httpClient.put<LlmConfigDto>(`/api/admin/llm-configs/${editingConfigId}`, payload);
        showSuccess(`模型配置「${payload.name}」已更新`);
      } else {
        await httpClient.post<LlmConfigDto>('/api/admin/llm-configs', payload);
        showSuccess(`模型配置「${payload.name}」已创建（API Key 已使用 AES-256-GCM 加密存储）`);
      }
      resetConfigForm();
      await loadConfigs();
      const me = await httpClient.get<UserProfileResponse>('/api/auth/me');
      setCurrentUser(me);
    } catch (err) {
      showError(err, '保存模型配置失败');
    }
  };

  const handleToggleConfigEnabled = async (cfg: LlmConfigDto) => {
    try {
      await httpClient.put<LlmConfigDto>(`/api/admin/llm-configs/${cfg.id}`, {
        role: cfg.role,
        name: cfg.name,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: '',
        enabled: !cfg.enabled,
      });
      showSuccess(`模型「${cfg.name}」已${!cfg.enabled ? '启用' : '停用'}`);
      await loadConfigs();
      const me = await httpClient.get<UserProfileResponse>('/api/auth/me');
      setCurrentUser(me);
    } catch (err) {
      showError(err, '更新模型状态失败');
    }
  };

  const handleDeleteConfig = async (cfg: LlmConfigDto) => {
    try {
      await httpClient.delete(`/api/admin/llm-configs/${cfg.id}`);
      showSuccess(`模型配置「${cfg.name}」已删除`);
      await loadConfigs();
      const me = await httpClient.get<UserProfileResponse>('/api/auth/me');
      setCurrentUser(me);
    } catch (err) {
      showError(err, '删除模型配置失败');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await httpClient.post<AdminUserDto>('/api/admin/users', {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        dailyTokenLimit: Number(newDailyLimit) || 100000,
      });
      showSuccess(`账号「${created.username}」创建成功`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('USER');
      setNewDailyLimit(100000);
      await loadUsers();
    } catch (err) {
      showError(err, '创建账号失败');
    }
  };

  const handleToggleUserEnabled = async (u: AdminUserDto) => {
    try {
      await httpClient.put<AdminUserDto>(`/api/admin/users/${u.id}`, {
        enabled: !u.enabled,
      });
      showSuccess(`账号「${u.username}」已${!u.enabled ? '启用并解除锁定' : '停用'}`);
      await loadUsers();
    } catch (err) {
      showError(err, '修改账号状态失败');
    }
  };

  const handleUpdateUserQuota = async (u: AdminUserDto) => {
    const targetLimit = quotaDrafts[u.id] ?? u.dailyTokenLimit;
    try {
      await httpClient.put<AdminUserDto>(`/api/admin/users/${u.id}`, {
        dailyTokenLimit: Number(targetLimit),
      });
      showSuccess(`账号「${u.username}」每日 Token 额度已更新为 ${Number(targetLimit).toLocaleString()}`);
      await loadUsers();
      if (u.id === currentUser.id) {
        const me = await httpClient.get<UserProfileResponse>('/api/auth/me');
        setCurrentUser(me);
      }
    } catch (err) {
      showError(err, '更新每日额度失败');
    }
  };

  const handleResetPassword = async (userId: number, username: string) => {
    try {
      await httpClient.post(`/api/admin/users/${userId}/reset-password`, {
        newPassword: resetNewPass,
      });
      showSuccess(`账号「${username}」密码已重置，登录锁定已同步解除`);
      setResetTargetId(null);
      setResetNewPass('');
      await loadUsers();
    } catch (err) {
      showError(err, '重置密码失败');
    }
  };

  const roleBadgeLabel = (role: LlmRole) => {
    switch (role) {
      case 'chat':
        return { text: 'chat · 对话/抽取/可视化', cls: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'vision':
        return { text: 'vision · 图片转文字识图', cls: 'bg-sky-50 text-sky-700 border-sky-200' };
      case 'embedding':
        return { text: 'embedding · 文本向量化', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    }
  };

  const totalPromptInLogs = logs.reduce((acc, item) => acc + item.promptTokens, 0);
  const totalCompletionInLogs = logs.reduce((acc, item) => acc + item.completionTokens, 0);

  return (
    <div className="space-y-6">
      {/* 顶部标题栏 */}
      <div className="college-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">系统管理后台</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              管理三类大模型网关配置（AES-256-GCM 加密存储）、评委与学生账号权限、每日 Token 额度与审计日志
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('configs')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'configs'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-4 h-4" />
            模型配置 ({configs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            账号与额度 ({users.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('logs');
              loadLogs(filterUserId);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'logs'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            Token 用量明细
          </button>
        </div>
      </div>

      {/* 全局操作反馈横幅 */}
      {bannerError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-rose-600 hover:underline ml-4"
          >
            关闭
          </button>
        </div>
      )}

      {bannerSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{bannerSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerSuccess(null)}
            className="text-emerald-700 hover:underline ml-4"
          >
            关闭
          </button>
        </div>
      )}

      {/* 标签页 1：大模型配置管理 */}
      {activeTab === 'configs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 college-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">
                {editingConfigId !== null ? '编辑模型配置' : '新增模型配置'}
              </h2>
              {editingConfigId !== null && (
                <button
                  type="button"
                  onClick={resetConfigForm}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  取消编辑
                </button>
              )}
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5">
              <span className="text-[11px] text-slate-400 self-center mr-1">快速模板：</span>
              <button
                type="button"
                onClick={() => {
                  setCfgRole('chat');
                  setCfgName('DeepSeek 对话主力模型');
                  setCfgBaseUrl('https://api.deepseek.com');
                  setCfgModel('deepseek-chat');
                }}
                className="px-2 py-1 text-[11px] rounded bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100"
              >
                DeepSeek Chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setCfgRole('vision');
                  setCfgName('Qwen-VL 识图模型');
                  setCfgBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1');
                  setCfgModel('qwen-vl-max');
                }}
                className="px-2 py-1 text-[11px] rounded bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100"
              >
                Vision 识图
              </button>
              <button
                type="button"
                onClick={() => {
                  setCfgRole('embedding');
                  setCfgName('Text-Embedding 向量模型');
                  setCfgBaseUrl('https://api.openai.com/v1');
                  setCfgModel('text-embedding-3-small');
                }}
                className="px-2 py-1 text-[11px] rounded bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
              >
                Embedding 向量
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">模型角色 (Role)</label>
                <select
                  value={cfgRole}
                  onChange={(e) => setCfgRole(e.target.value as LlmRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="chat">chat — 对话 / 事件抽取 / 可视化生成</option>
                  <option value="vision">vision — 课表与通知图片 OCR 转文字</option>
                  <option value="embedding">embedding — 原文切片 float32 向量化</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">显示名称</label>
                <input
                  type="text"
                  required
                  value={cfgName}
                  onChange={(e) => setCfgName(e.target.value)}
                  placeholder="例如：DeepSeek V3 生产节点"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  接口地址 (Base URL)
                </label>
                <input
                  type="text"
                  required
                  value={cfgBaseUrl}
                  onChange={(e) => setCfgBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">模型标识 (Model)</label>
                <input
                  type="text"
                  required
                  value={cfgModel}
                  onChange={(e) => setCfgModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  API Key（AES-256-GCM 加密入库，后台仅显示末 4 位）
                </label>
                <input
                  type="password"
                  required={editingConfigId === null}
                  value={cfgApiKey}
                  onChange={(e) => setCfgApiKey(e.target.value)}
                  placeholder={
                    editingConfigId !== null
                      ? '留空则保留现有加密 API Key'
                      : 'sk-xxxxxxxxxxxxxxxx'
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgEnabled}
                  onChange={(e) => setCfgEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-slate-700 font-medium">立即启用该模型配置</span>
              </label>

              <button
                type="submit"
                className="w-full btn-primary py-2.5 bg-teal-600 hover:bg-teal-700 text-xs"
              >
                <Plus className="w-4 h-4" />
                {editingConfigId !== null ? '保存配置修改' : '加密保存模型配置'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 college-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">已配置的大模型列表</h2>
                <p className="text-xs text-slate-500">
                  当无已启用的对话模型或设置 ONETERM_MOCK=true 时，系统自动使用内置 Mock 网关
                </p>
              </div>
              <button
                type="button"
                onClick={loadConfigs}
                disabled={loadingConfigs}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                刷新
              </button>
            </div>

            {configs.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                当前暂无外部模型配置，系统运行于免配置的 <strong>Mock 演示模式</strong>。
              </div>
            ) : (
              <div className="space-y-3">
                {configs.map((cfg) => {
                  const badge = roleBadgeLabel(cfg.role);
                  return (
                    <div
                      key={cfg.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium border ${badge.cls}`}
                          >
                            {badge.text}
                          </span>
                          <span className="font-bold text-sm text-slate-900">{cfg.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              cfg.enabled
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {cfg.enabled ? '已启用' : '已停用'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono flex flex-wrap gap-x-4 gap-y-1">
                          <span>Model: {cfg.model}</span>
                          <span>BaseURL: {cfg.baseUrl}</span>
                          <span className="text-teal-700 font-semibold">
                            Key: {cfg.apiKeyMasked}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleConfigEnabled(cfg)}
                          className="btn-secondary py-1 px-2.5 text-xs"
                        >
                          <Power className="w-3.5 h-3.5" />
                          {cfg.enabled ? '停用' : '启用'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingConfigId(cfg.id);
                            setCfgRole(cfg.role);
                            setCfgName(cfg.name);
                            setCfgBaseUrl(cfg.baseUrl);
                            setCfgModel(cfg.model);
                            setCfgApiKey('');
                            setCfgEnabled(cfg.enabled);
                          }}
                          className="btn-secondary py-1 px-2.5 text-xs"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConfig(cfg)}
                          className="btn-secondary py-1 px-2.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 标签页 2：账号与每日 Token 额度管理 */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 college-card p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">创建新账号</h2>
            <p className="text-xs text-slate-500 mb-4">
              系统不开放公开注册，评委账号与学生账号均在此处创建
            </p>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">用户名</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="例如：judge_01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  初始密码（至少 6 位，BCrypt 哈希入库）
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位字符"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">账号角色</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'USER' | 'ADMIN')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="USER">USER — 学生 / 评委体验账号</option>
                  <option value="ADMIN">ADMIN — 系统管理员</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  每日 Token 额度上限（默认 100,000）
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={newDailyLimit}
                  onChange={(e) => setNewDailyLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full btn-primary py-2.5 bg-teal-600 hover:bg-teal-700 text-xs"
              >
                <Plus className="w-4 h-4" />
                创建账号
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 college-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">账号列表与今日额度监控</h2>
                <p className="text-xs text-slate-500">
                  每日 0 点（Asia/Shanghai）自动重置今日用量；超限返回 HTTP 429
                </p>
              </div>
              <button
                type="button"
                onClick={loadUsers}
                disabled={loadingUsers}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                刷新
              </button>
            </div>

            <div className="space-y-3">
              {users.map((u) => {
                const ratio = Math.min(
                  100,
                  Math.round((u.todayTokensUsed / Math.max(1, u.dailyTokenLimit)) * 100)
                );
                const isOverQuota = u.todayTokensUsed >= u.dailyTokenLimit;
                return (
                  <div
                    key={u.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{u.username}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                            u.role === 'ADMIN'
                              ? 'bg-teal-50 text-teal-700 border-teal-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {u.role}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            u.enabled
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {u.enabled ? '正常' : '已停用'}
                        </span>
                        {u.lockedUntil && (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-medium">
                            登录锁定至 {u.lockedUntil}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleUserEnabled(u)}
                          className="btn-secondary py-1 px-2.5 text-xs"
                        >
                          {u.enabled ? '停用账号' : '启用账号'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTargetId(resetTargetId === u.id ? null : u.id);
                            setResetNewPass('');
                          }}
                          className="btn-secondary py-1 px-2.5 text-xs"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          重置密码
                        </button>
                      </div>
                    </div>

                    {/* 今日额度进度条与配额调节 */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                      <div className="sm:col-span-7 space-y-1">
                        <div className="flex justify-between text-slate-600">
                          <span>今日已用 Token</span>
                          <span
                            className={`font-mono font-semibold ${
                              isOverQuota ? 'text-rose-600' : 'text-slate-800'
                            }`}
                          >
                            {u.todayTokensUsed.toLocaleString()} /{' '}
                            {u.dailyTokenLimit.toLocaleString()} ({ratio}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOverQuota
                                ? 'bg-rose-500'
                                : ratio >= 80
                                  ? 'bg-amber-500'
                                  : 'bg-teal-600'
                            }`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-5 flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          aria-label={`${u.username} 每日额度`}
                          value={quotaDrafts[u.id] ?? u.dailyTokenLimit}
                          onChange={(e) =>
                            setQuotaDrafts((prev) => ({
                              ...prev,
                              [u.id]: Number(e.target.value),
                            }))
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateUserQuota(u)}
                          className="btn-primary py-1.5 px-3 text-xs shrink-0 bg-teal-600 hover:bg-teal-700"
                        >
                          保存额度
                        </button>
                      </div>
                    </div>

                    {/* 重置密码内联面板 */}
                    {resetTargetId === u.id && (
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <input
                          type="password"
                          minLength={6}
                          value={resetNewPass}
                          onChange={(e) => setResetNewPass(e.target.value)}
                          placeholder={`输入 ${u.username} 的新密码（至少 6 位）`}
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => handleResetPassword(u.id, u.username)}
                          className="btn-primary py-1.5 px-3 text-xs bg-teal-600"
                        >
                          确认重置并解锁
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 标签页 3：Token 用量审计日志 */}
      {activeTab === 'logs' && (
        <div className="college-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">大模型调用与 Token 用量明细</h2>
              <p className="text-xs text-slate-500">
                涵盖对话、事件抽取、RAG 问答、可视化工坊、识图 OCR 与向量生成全部调用
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <select
                value={filterUserId}
                onChange={(e) => {
                  setFilterUserId(e.target.value);
                  loadLogs(e.target.value);
                }}
                className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">全部账号</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.username} (#{u.id})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadLogs(filterUserId)}
                disabled={loadingLogs}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                刷新日志
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">当前列表调用次数</div>
              <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                {logs.length}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-teal-50/60 border border-teal-200">
              <div className="text-xs text-teal-700">累计输入 (Prompt Tokens)</div>
              <div className="text-lg font-bold text-teal-900 font-mono mt-0.5">
                {totalPromptInLogs.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-sky-50/60 border border-sky-200">
              <div className="text-xs text-sky-700">累计输出 (Completion Tokens)</div>
              <div className="text-lg font-bold text-sky-900 font-mono mt-0.5">
                {totalCompletionInLogs.toLocaleString()}
              </div>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              暂无大模型 Token 调用记录
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-3 font-medium">ID</th>
                    <th className="py-2.5 px-3 font-medium">账号</th>
                    <th className="py-2.5 px-3 font-medium">调用类型 (Kind)</th>
                    <th className="py-2.5 px-3 font-medium">Prompt Tokens</th>
                    <th className="py-2.5 px-3 font-medium">Completion Tokens</th>
                    <th className="py-2.5 px-3 font-medium">合计</th>
                    <th className="py-2.5 px-3 font-medium">调用时间 (Asia/Shanghai)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono text-slate-500">#{log.id}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {log.username || `User#${log.userId}`}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                          {log.kind}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">{log.promptTokens}</td>
                      <td className="py-2.5 px-3 font-mono">{log.completionTokens}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-teal-700">
                        {log.promptTokens + log.completionTokens}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{log.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPage;
