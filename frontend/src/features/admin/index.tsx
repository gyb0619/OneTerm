import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  RotateCcw,
  X,
  Sliders,
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
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
  const [cfgRole, setCfgRole] = useState<LlmRole>('chat');
  const [cfgName, setCfgName] = useState('');
  const [cfgBaseUrl, setCfgBaseUrl] = useState('https://api.deepseek.com');
  const [cfgModel, setCfgModel] = useState('deepseek-chat');
  const [cfgApiKey, setCfgApiKey] = useState('');
  const [cfgEnabled, setCfgEnabled] = useState(true);

  // 2. 用户管理状态
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'ADMIN'>('USER');
  const [newDailyLimit, setNewDailyLimit] = useState<number>(100000);

  // 额度与密码弹窗
  const [editingQuotaUser, setEditingQuotaUser] = useState<AdminUserDto | null>(null);
  const [quotaInputValue, setQuotaInputValue] = useState<number>(100000);
  const [resetTargetUser, setResetTargetUser] = useState<AdminUserDto | null>(null);
  const [resetNewPass, setResetNewPass] = useState('');

  // 3. 用量审计日志状态
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
      <div className="p-8 text-center text-xs text-slate-400">正在校验管理员权限...</div>
    );
  }

  if (!currentUser || currentUser.role !== 'ADMIN') {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">需要管理员权限</h2>
        <p className="text-xs text-slate-500">管理后台仅对系统管理员开放，请登录 ADMIN 账号后访问。</p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="btn-primary py-2 px-4 text-xs bg-teal-600 hover:bg-teal-700"
        >
          前往登录
        </button>
      </div>
    );
  }

  const openNewConfigModal = () => {
    setEditingConfigId(null);
    setCfgRole('chat');
    setCfgName('');
    setCfgBaseUrl('https://api.deepseek.com');
    setCfgModel('deepseek-chat');
    setCfgApiKey('');
    setCfgEnabled(true);
    setIsConfigModalOpen(true);
  };

  const openEditConfigModal = (cfg: LlmConfigDto) => {
    setEditingConfigId(cfg.id);
    setCfgRole(cfg.role);
    setCfgName(cfg.name);
    setCfgBaseUrl(cfg.baseUrl);
    setCfgModel(cfg.model);
    setCfgApiKey('');
    setCfgEnabled(cfg.enabled);
    setIsConfigModalOpen(true);
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
        showSuccess(
          editingConfigId < 0
            ? `环境变量模型「${payload.name}」定制覆盖已保存`
            : `模型配置「${payload.name}」已更新`
        );
      } else {
        await httpClient.post<LlmConfigDto>('/api/admin/llm-configs', payload);
        showSuccess(`模型配置「${payload.name}」已创建（API Key 已加密存储）`);
      }
      setIsConfigModalOpen(false);
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
      showSuccess(
        cfg.id < 0
          ? `环境变量模型「${cfg.name}」已恢复系统默认设置`
          : `模型配置「${cfg.name}」已删除`
      );
      await loadConfigs();
      const me = await httpClient.get<UserProfileResponse>('/api/auth/me');
      setCurrentUser(me);
    } catch (err) {
      showError(err, cfg.id < 0 ? '重置环境变量模型失败' : '删除模型配置失败');
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
      setIsUserModalOpen(false);
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

  const handleSaveUserQuota = async () => {
    if (!editingQuotaUser) return;
    try {
      await httpClient.put<AdminUserDto>(`/api/admin/users/${editingQuotaUser.id}`, {
        dailyTokenLimit: Number(quotaInputValue),
      });
      showSuccess(`账号「${editingQuotaUser.username}」每日额度已更新`);
      setEditingQuotaUser(null);
      await loadUsers();
      if (editingQuotaUser.id === currentUser.id) {
        const me = await httpClient.get<UserProfileResponse>('/api/auth/me');
        setCurrentUser(me);
      }
    } catch (err) {
      showError(err, '更新额度失败');
    }
  };

  const handleResetPassword = async () => {
    if (!resetTargetUser || !resetNewPass) return;
    try {
      await httpClient.post(`/api/admin/users/${resetTargetUser.id}/reset-password`, {
        newPassword: resetNewPass,
      });
      showSuccess(`账号「${resetTargetUser.username}」密码已重置并解锁`);
      setResetTargetUser(null);
      setResetNewPass('');
      await loadUsers();
    } catch (err) {
      showError(err, '重置密码失败');
    }
  };

  const totalPromptInLogs = logs.reduce((acc, item) => acc + item.promptTokens, 0);
  const totalCompletionInLogs = logs.reduce((acc, item) => acc + item.completionTokens, 0);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* 极简顶栏与分段选项卡 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">系统管理后台</h1>
            <p className="text-[11px] text-slate-500">模型网关、评委/学生账号权限与 Token 审计</p>
          </div>
        </div>

        {/* 分段标签切换 */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('configs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'configs'
                ? 'bg-white text-teal-700 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            模型配置 ({configs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'users'
                ? 'bg-white text-teal-700 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            账号与额度 ({users.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('logs');
              void loadLogs(filterUserId);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'logs'
                ? 'bg-white text-teal-700 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Token 用量明细
          </button>
        </div>
      </div>

      {/* 提示信息横幅 */}
      {bannerError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-xs text-rose-600 underline"
          >
            关闭
          </button>
        </div>
      )}

      {bannerSuccess && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{bannerSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerSuccess(null)}
            className="text-xs text-emerald-700 underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* 标签 1：大模型网关配置 */}
      {activeTab === 'configs' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">大模型路由网关列表</h2>
              <p className="text-[11px] text-slate-500">
                支持系统环境变量模型覆盖与外部 API Key（AES-256-GCM 加密存储）
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openNewConfigModal}
                className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-3 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                新增模型配置
              </button>
              <button
                type="button"
                onClick={loadConfigs}
                disabled={loadingConfigs}
                className="btn-secondary py-1.5 px-2.5 text-xs"
                title="刷新"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingConfigs ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {configs.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              当前暂无外部模型配置，系统运行于免配置的 Mock 演示模式。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/50">
                    <th className="py-2 px-3 font-medium">模型名称</th>
                    <th className="py-2 px-3 font-medium">角色 (Role)</th>
                    <th className="py-2 px-3 font-medium">标识 (Model)</th>
                    <th className="py-2 px-3 font-medium">接口地址 (BaseURL)</th>
                    <th className="py-2 px-3 font-medium">API Key</th>
                    <th className="py-2 px-3 font-medium">状态</th>
                    <th className="py-2 px-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {configs.map((cfg) => {
                    const isEnv = cfg.id < 0;
                    return (
                      <tr key={cfg.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{cfg.name}</span>
                            {isEnv && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-purple-50 text-purple-700 border border-purple-200">
                                ENV 环境变量
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700">
                            {cfg.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{cfg.model}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500 max-w-xs truncate">
                          {cfg.baseUrl}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-teal-700 font-medium">
                          {cfg.apiKeyMasked}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              cfg.enabled
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {cfg.enabled ? '已启用' : '已停用'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleToggleConfigEnabled(cfg)}
                              className="p-1 rounded text-slate-500 hover:text-slate-800"
                              title={cfg.enabled ? '停用' : '启用'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditConfigModal(cfg)}
                              className="p-1 rounded text-slate-500 hover:text-teal-700"
                              title="编辑"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteConfig(cfg)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600"
                              title={isEnv ? '恢复系统环境变量默认值' : '删除'}
                            >
                              {isEnv ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 标签 2：账号与额度 */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">账号列表与每日 Token 额度</h2>
              <p className="text-[11px] text-slate-500">
                每日 0 点（Asia/Shanghai）自动重置额度，超限拦截
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsUserModalOpen(true)}
                className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-3 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                创建新账号
              </button>
              <button
                type="button"
                onClick={loadUsers}
                disabled={loadingUsers}
                className="btn-secondary py-1.5 px-2.5 text-xs"
                title="刷新"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/50">
                  <th className="py-2 px-3 font-medium">用户名</th>
                  <th className="py-2 px-3 font-medium">角色</th>
                  <th className="py-2 px-3 font-medium">状态</th>
                  <th className="py-2 px-3 font-medium w-64">今日 Token 用量</th>
                  <th className="py-2 px-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const ratio = Math.min(
                    100,
                    Math.round((u.todayTokensUsed / Math.max(1, u.dailyTokenLimit)) * 100)
                  );
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{u.username}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                            u.role === 'ADMIN'
                              ? 'bg-teal-50 text-teal-700 border-teal-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
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
                          <span className="ml-1 text-[10px] text-rose-600 bg-rose-50 px-1 py-0.5 rounded">
                            锁定
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                          <span>{u.todayTokensUsed.toLocaleString()}</span>
                          <span>/ {u.dailyTokenLimit.toLocaleString()} ({ratio}%)</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              ratio >= 100
                                ? 'bg-rose-500'
                                : ratio >= 80
                                  ? 'bg-amber-500'
                                  : 'bg-teal-600'
                            }`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuotaUser(u);
                              setQuotaInputValue(u.dailyTokenLimit);
                            }}
                            className="btn-secondary py-0.5 px-2 text-[11px]"
                            title="修改额度"
                          >
                            <Sliders className="w-3 h-3" />
                            额度
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleUserEnabled(u)}
                            className="btn-secondary py-0.5 px-2 text-[11px]"
                          >
                            {u.enabled ? '停用' : '启用'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetTargetUser(u);
                              setResetNewPass('');
                            }}
                            className="btn-secondary py-0.5 px-2 text-[11px]"
                            title="重置密码"
                          >
                            <KeyRound className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 标签 3：Token 用量审计日志 */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Token 用量审计明细</h2>
              <p className="text-[11px] text-slate-500">
                记录对话、抽取、问答、识图与向量化调用的真实 Token 消耗
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <select
                value={filterUserId}
                onChange={(e) => {
                  setFilterUserId(e.target.value);
                  void loadLogs(e.target.value);
                }}
                className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white"
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
                onClick={() => void loadLogs(filterUserId)}
                disabled={loadingLogs}
                className="btn-secondary py-1 px-2.5 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500">调用总次数</div>
              <div className="text-base font-bold text-slate-900 font-mono mt-0.5">{logs.length}</div>
            </div>
            <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-200">
              <div className="text-[11px] text-teal-700">累计输入 Tokens</div>
              <div className="text-base font-bold text-teal-900 font-mono mt-0.5">
                {totalPromptInLogs.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-sky-50/50 border border-sky-200">
              <div className="text-[11px] text-sky-700">累计输出 Tokens</div>
              <div className="text-base font-bold text-sky-900 font-mono mt-0.5">
                {totalCompletionInLogs.toLocaleString()}
              </div>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">暂无调用审计记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/50">
                    <th className="py-2 px-3 font-medium">序号</th>
                    <th className="py-2 px-3 font-medium">账号</th>
                    <th className="py-2 px-3 font-medium">调用类型</th>
                    <th className="py-2 px-3 font-medium">Prompt</th>
                    <th className="py-2 px-3 font-medium">Completion</th>
                    <th className="py-2 px-3 font-medium">合计</th>
                    <th className="py-2 px-3 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono text-slate-400">#{log.id}</td>
                      <td className="py-2 px-3 font-medium text-slate-800">{log.username || `User#${log.userId}`}</td>
                      <td className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                          {log.kind}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-500">{log.promptTokens}</td>
                      <td className="py-2 px-3 font-mono text-slate-500">{log.completionTokens}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-teal-700">
                        {log.promptTokens + log.completionTokens}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">{log.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 弹窗：新增/编辑模型配置 */}
      {isConfigModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center animate-fade-in">
            <div className="relative w-full max-w-lg my-auto bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
              {/* 固定头部 */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
                <h3 className="text-sm font-bold text-slate-900">
                  {editingConfigId !== null
                    ? editingConfigId < 0
                      ? '定制环境变量模型'
                      : '编辑模型配置'
                    : '新增模型配置'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 表单容器：撑满剩余高度并隐藏溢出 */}
              <form onSubmit={handleSaveConfig} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* 可滚动字段区域 */}
                <div className="p-5 space-y-3.5 text-xs overflow-y-auto flex-1 min-h-0">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">模型角色</label>
                    <select
                      value={cfgRole}
                      onChange={(e) => setCfgRole(e.target.value as LlmRole)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="chat">chat — 对话 / 事件抽取 / 可视化</option>
                      <option value="vision">vision — 课表与通知图片 OCR</option>
                      <option value="embedding">embedding — 原文切片向量化</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">显示名称</label>
                    <input
                      type="text"
                      required
                      value={cfgName}
                      onChange={(e) => setCfgName(e.target.value)}
                      placeholder="例如：DeepSeek 生产节点"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">接口地址 (Base URL)</label>
                    <input
                      type="text"
                      required
                      value={cfgBaseUrl}
                      onChange={(e) => setCfgBaseUrl(e.target.value)}
                      placeholder="https://api.deepseek.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">模型标识 (Model)</label>
                    <input
                      type="text"
                      required
                      value={cfgModel}
                      onChange={(e) => setCfgModel(e.target.value)}
                      placeholder="deepseek-chat"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">
                      API Key（AES-256 加密存储）
                    </label>
                    <input
                      type="password"
                      required={editingConfigId === null}
                      value={cfgApiKey}
                      onChange={(e) => setCfgApiKey(e.target.value)}
                      placeholder={
                        editingConfigId !== null
                          ? editingConfigId < 0
                            ? '留空保留环境变量原生密钥，输入新Key则覆盖'
                            : '留空保留现有密钥'
                          : 'sk-xxxxxxxxxxxxxxxx'
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={cfgEnabled}
                      onChange={(e) => setCfgEnabled(e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-slate-700 font-medium">启用该模型配置</span>
                  </label>
                </div>

                {/* 固定底部操作栏 */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/90 flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsConfigModalOpen(false)}
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-4 text-xs font-medium"
                  >
                    保存配置
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 弹窗：创建新账号 */}
      {isUserModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center animate-fade-in">
            <div className="relative w-full max-w-sm my-auto bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
              {/* 固定头部 */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
                <h3 className="text-sm font-bold text-slate-900">创建新账号</h3>
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 表单容器 */}
              <form onSubmit={handleCreateUser} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* 可滚动字段区域 */}
                <div className="p-5 space-y-3.5 text-xs overflow-y-auto flex-1 min-h-0">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">用户名</label>
                    <input
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="例如：judge_02"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">密码（至少6位）</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="至少 6 位字符"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">角色</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as 'USER' | 'ADMIN')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="USER">USER — 学生 / 评委</option>
                      <option value="ADMIN">ADMIN — 系统管理员</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">每日 Token 额度上限</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={newDailyLimit}
                      onChange={(e) => setNewDailyLimit(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>

                {/* 固定底部操作栏 */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/90 flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsUserModalOpen(false)}
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-4 text-xs font-medium"
                  >
                    创建账号
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 弹窗：调整每日额度 */}
      {editingQuotaUser &&
        createPortal(
          <div className="fixed inset-0 z-50 overflow-y-auto p-4 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center animate-fade-in">
            <div className="relative w-full max-w-sm my-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-5 space-y-4 text-xs animate-scale-in">
              <h3 className="text-sm font-bold text-slate-900">
                调整 {editingQuotaUser.username} 的每日 Token 额度
              </h3>

              <div>
                <label className="block text-slate-600 mb-1">每日上限数值</label>
                <input
                  type="number"
                  min={0}
                  step={5000}
                  value={quotaInputValue}
                  onChange={(e) => setQuotaInputValue(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingQuotaUser(null)}
                  className="btn-secondary py-1.5 px-3"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveUserQuota}
                  className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-3"
                >
                  保存额度
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 弹窗：重置密码 */}
      {resetTargetUser &&
        createPortal(
          <div className="fixed inset-0 z-50 overflow-y-auto p-4 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center animate-fade-in">
            <div className="relative w-full max-w-sm my-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-5 space-y-4 text-xs animate-scale-in">
              <h3 className="text-sm font-bold text-slate-900">
                重置 {resetTargetUser.username} 的密码并解除锁定
              </h3>

              <div>
                <label className="block text-slate-600 mb-1">新密码（至少 6 位）</label>
                <input
                  type="password"
                  minLength={6}
                  value={resetNewPass}
                  onChange={(e) => setResetNewPass(e.target.value)}
                  placeholder="输入新密码"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="btn-secondary py-1.5 px-3"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetNewPass.length < 6}
                  className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-3"
                >
                  确认重置
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default AdminPage;
