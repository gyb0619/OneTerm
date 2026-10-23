import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileUp,
  Sparkles,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Calendar,
  MapPin,
  BookOpen,
  Edit3,
  Save,
  X,
  ShieldAlert,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useSseStream } from '../../shared/hooks/useSseStream';
import { useAppStore } from '../../shared/store/useAppStore';
import { EmptyState } from '../../shared/components/EmptyState';
import { SkeletonCard } from '../../shared/components/SkeletonCard';
import type { EventDto, EventInputDto, EventType } from '../../shared/types/api';
import {
  batchSaveEvents,
  createSingleEvent,
  deleteSingleEvent,
  fetchUserEvents,
  updateSingleEvent,
  uploadExtractFile,
} from './api';
import {
  datetimeLocalToIso,
  EVENT_TYPE_META,
  EVENT_TYPE_OPTIONS,
  formatDisplayDateTime,
  isoToDatetimeLocal,
  SAMPLE_SEMESTER_TEXT,
} from './sampleData';

interface DraftItem extends EventInputDto {
  _localId: string;
}

let draftCounter = 1;
function createLocalId(): string {
  return `draft-${Date.now()}-${draftCounter++}`;
}

export const ExtractPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { highlightedEventId, setHighlightedEventId } = useAppStore();

  // 1. 原始输入文本与文件上传状态
  const [rawText, setRawText] = useState<string>('');
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [fileSourceBadge, setFileSourceBadge] = useState<{
    fileName: string;
    sourceType: 'txt' | 'xlsx' | 'image';
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // 2. SSE 流式抽取 Hook 与状态
  const {
    streaming,
    progress,
    accumulatedText,
    error: streamError,
    startStream,
    abortStream,
  } = useSseStream<EventInputDto[]>();
  const [showRawStreamPreview, setShowRawStreamPreview] = useState<boolean>(false);
  const [lastTokenUsage, setLastTokenUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
  } | null>(null);

  // 3. 抽取出的待核对草稿列表
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [savingBatch, setSavingBatch] = useState<boolean>(false);
  const [batchMessage, setBatchMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // 4. 已入库事件列表状态
  const [savedEvents, setSavedEvents] = useState<EventDto[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<EventType | ''>('');
  const [expandedSourceIds, setExpandedSourceIds] = useState<Record<number, boolean>>({});
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EventInputDto | null>(null);
  const [savingSingle, setSavingSingle] = useState<boolean>(false);

  // 加载当前用户已入库事件
  const loadSavedEvents = useCallback(async (typeFilter: EventType | '' = filterType) => {
    setLoadingEvents(true);
    try {
      const list = await fetchUserEvents({ type: typeFilter || undefined });
      setSavedEvents(list);
    } catch {
      // 未登录或初始化阶段静默处理
    } finally {
      setLoadingEvents(false);
    }
  }, [filterType]);

  useEffect(() => {
    void loadSavedEvents(filterType);
  }, [filterType, loadSavedEvents]);

  // 若从问答引用或日历冲突跳转过来携带 highlightedEventId，则自动展开对应原文
  useEffect(() => {
    if (highlightedEventId !== null) {
      setExpandedSourceIds((prev) => ({ ...prev, [highlightedEventId]: true }));
    }
  }, [highlightedEventId]);

  // 一键填入示例文本
  const handleFillSampleText = () => {
    setRawText(SAMPLE_SEMESTER_TEXT);
    setFileSourceBadge({ fileName: 'semester-sample.txt（内置标准示例）', sourceType: 'txt' });
    setFileError(null);
    setBatchMessage(null);
  };

  // 上传文件（.txt / .xlsx / 图片）
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploadingFile(true);
    setFileError(null);
    setBatchMessage(null);

    try {
      const res = await uploadExtractFile(file);
      setRawText(res.extractedText);
      setFileSourceBadge({ fileName: res.fileName, sourceType: res.sourceType });
    } catch (err) {
      setFileError((err as Error).message || '文件解析失败，请检查文件格式');
    } finally {
      setUploadingFile(false);
    }
  };

  // 发起 SSE 流式智能抽取
  const handleStartExtract = async () => {
    const trimmed = rawText.trim();
    if (!trimmed) {
      setFileError('请先粘贴教务通知文本、点击「一键填入示例文本」或上传文件');
      return;
    }
    setFileError(null);
    setBatchMessage(null);
    setLastTokenUsage(null);

    await startStream(
      '/api/extract/stream',
      { text: trimmed },
      {
        onDone: (doneEvent) => {
          const items = Array.isArray(doneEvent.result) ? doneEvent.result : [];
          setDrafts(
            items.map((item) => ({
              type: item.type || 'course',
              title: item.title || '',
              startTime: item.startTime || '2026-11-04T08:00:00+08:00',
              endTime: item.endTime || '2026-11-04T09:40:00+08:00',
              location: item.location || '',
              courseName: item.courseName || '',
              sourceText: item.sourceText || '',
              _localId: createLocalId(),
            }))
          );
          if (doneEvent.usage) {
            setLastTokenUsage(doneEvent.usage);
          }
        },
      }
    );
  };

  // 草稿条目字段修改
  const handleUpdateDraft = (
    localId: string,
    field: keyof EventInputDto,
    value: string
  ) => {
    setDrafts((prev) =>
      prev.map((item) =>
        item._localId === localId ? { ...item, [field]: value } : item
      )
    );
  };

  // 删除单条草稿
  const handleRemoveDraft = (localId: string) => {
    setDrafts((prev) => prev.filter((item) => item._localId !== localId));
  };

  // 手动新增一条草稿条目
  const handleAddBlankDraft = () => {
    const newDraft: DraftItem = {
      _localId: createLocalId(),
      type: 'course',
      title: '新教务日程事件',
      startTime: '2026-11-05T10:00:00+08:00',
      endTime: '2026-11-05T11:40:00+08:00',
      location: '教学楼 A201',
      courseName: '',
      sourceText: '手动补充的教务日程记录',
    };
    setDrafts((prev) => [...prev, newDraft]);
  };

  // 确认批量入库
  const handleConfirmBatchSave = async () => {
    if (drafts.length === 0) return;

    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      if (!d.title.trim()) {
        setBatchMessage({
          type: 'error',
          text: `第 ${i + 1} 条事件标题不能为空`,
        });
        return;
      }
      if (!d.startTime.trim() || !d.endTime.trim()) {
        setBatchMessage({
          type: 'error',
          text: `第 ${i + 1} 条事件开始与结束时间不能为空`,
        });
        return;
      }
      if (!d.sourceText.trim()) {
        setBatchMessage({
          type: 'error',
          text: `第 ${i + 1} 条事件必须保留原文片段（sourceText）`,
        });
        return;
      }
    }

    setSavingBatch(true);
    setBatchMessage(null);
    try {
      const payload: EventInputDto[] = drafts.map(({ _localId: _, ...rest }) => ({
        ...rest,
        title: rest.title.trim(),
        location: (rest.location || '').trim(),
        courseName: (rest.courseName || '').trim(),
        sourceText: rest.sourceText.trim(),
      }));
      const saved = await batchSaveEvents(payload);
      setDrafts([]);
      setBatchMessage({
        type: 'success',
        text: `成功入库 ${saved.length} 条教务事件，并已同步生成 RAG 原文向量切片！`,
      });
      await loadSavedEvents(filterType);
    } catch (err) {
      setBatchMessage({
        type: 'error',
        text: (err as Error).message || '批量入库失败，请检查各字段格式后重试',
      });
    } finally {
      setSavingBatch(false);
    }
  };

  // 切换已入库事件的原文展开状态
  const toggleExpandSource = (id: number) => {
    if (highlightedEventId === id) {
      setHighlightedEventId(null);
    }
    setExpandedSourceIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 开始编辑单条已入库事件
  const startEditSavedEvent = (ev: EventDto) => {
    setEditingEventId(ev.id);
    setEditForm({
      type: ev.type,
      title: ev.title,
      startTime: ev.startTime,
      endTime: ev.endTime,
      location: ev.location || '',
      courseName: ev.courseName || '',
      sourceText: ev.sourceText,
    });
  };

  // 保存已入库事件的编辑或手动新增单条已入库事件
  const handleSaveEditedEvent = async () => {
    if (!editForm || editingEventId === null) return;
    setSavingSingle(true);
    try {
      if (editingEventId === -1) {
        await createSingleEvent(editForm);
      } else {
        await updateSingleEvent(editingEventId, editForm);
      }
      setEditingEventId(null);
      setEditForm(null);
      await loadSavedEvents(filterType);
    } catch (err) {
      setBatchMessage({
        type: 'error',
        text: (err as Error).message || '保存事件失败',
      });
    } finally {
      setSavingSingle(false);
    }
  };

  // 删除单条已入库事件
  const handleDeleteSavedEvent = async (id: number) => {
    try {
      await deleteSingleEvent(id);
      setSavedEvents((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setBatchMessage({
        type: 'error',
        text: (err as Error).message || '删除事件失败',
      });
    }
  };

  // 计算进度百分比
  const progressPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : streaming
        ? 35
        : 0;

  return (
    <div className="space-y-6">
      {/* 顶部清爽学院风导览横幅 */}
      <div className="college-card p-6 bg-gradient-to-r from-teal-50/70 via-white to-sky-50/70 border-teal-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-100/80 text-teal-800 text-xs font-medium mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              F2 教务多源导入与大模型流式抽取
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              教务信息导入与结构化抽取
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              支持直接粘贴群通知、上传 <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">.txt</code> /{' '}
              <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">.xlsx</code> 课表或课表截图，实时流式识别课程、考试与截止提醒，保留每条原文依据。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleFillSampleText}
              className="btn-secondary border-teal-200 text-teal-700 hover:bg-teal-50"
            >
              <FileText className="w-4 h-4" />
              一键填入示例文本
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile || streaming}
              className="btn-secondary"
            >
              {uploadingFile ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              ) : (
                <FileUp className="w-4 h-4 text-sky-600" />
              )}
              {uploadingFile ? '正在解析文件...' : '上传文件 (.txt / .xlsx / 图片)'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.xlsx,.png,.jpg,.jpeg,.webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* 步骤一：教务原文输入与文件解析工作区 */}
      <div className="college-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
              1
            </span>
            <h2 className="text-base font-semibold text-slate-900">
              待抽取教务原文
            </h2>
            {fileSourceBadge && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
                {fileSourceBadge.sourceType === 'xlsx' && (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                {fileSourceBadge.sourceType === 'image' && (
                  <ImageIcon className="w-3.5 h-3.5" />
                )}
                {fileSourceBadge.sourceType === 'txt' && (
                  <FileText className="w-3.5 h-3.5" />
                )}
                来源：{fileSourceBadge.fileName} ({fileSourceBadge.sourceType.toUpperCase()})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              <ShieldAlert className="w-3.5 h-3.5" />
              防提示词注入保护已启用（extract-v1）
            </span>
            <span>{rawText.length} 字符</span>
            {rawText && (
              <button
                type="button"
                onClick={() => {
                  setRawText('');
                  setFileSourceBadge(null);
                  setFileError(null);
                }}
                className="text-slate-400 hover:text-slate-600 underline"
              >
                清空
              </button>
            )}
          </div>
        </div>

        {fileError && (
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-3 text-sm text-red-700">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{fileError}</span>
            </div>
            <button
              type="button"
              onClick={() => setFileError(null)}
              className="text-xs underline hover:text-red-900"
            >
              关闭
            </button>
          </div>
        )}

        <textarea
          rows={9}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="在此粘贴教务处课表文本、班级群考试通知、作业截止提醒，或点击上方「一键填入示例文本」/「上传文件」..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-mono leading-relaxed transition"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
            <span>支持识别类型：</span>
            {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${meta.badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                {meta.label}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {streaming ? (
              <button
                type="button"
                onClick={abortStream}
                className="btn-secondary border-red-200 text-red-600 hover:bg-red-50"
              >
                <X className="w-4 h-4" />
                停止抽取
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleStartExtract()}
                disabled={!rawText.trim() || uploadingFile}
                className="btn-primary bg-teal-600 hover:bg-teal-700 px-5 py-2.5"
              >
                <Sparkles className="w-4 h-4" />
                开始智能抽取
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 步骤二：SSE 流式进度条、流式增量预览与失败重试卡片 */}
      {(streaming || progress || streamError || accumulatedText) && (
        <div className="college-card p-5 space-y-3 border-teal-200/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {streaming ? (
                <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
              ) : streamError ? (
                <AlertCircle className="w-4 h-4 text-red-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
              )}
              <span className="text-sm font-semibold text-slate-900">
                {streamError
                  ? '流式抽取未通过校验'
                  : streaming
                    ? progress?.message || '正在连接大模型流式抽取服务...'
                    : `流式抽取完成（共识别出 ${drafts.length} 条事件草稿）`}
              </span>
              {progress && progress.total > 0 && !streamError && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-medium">
                  进度 {progress.current} / {progress.total}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {lastTokenUsage && (
                <span className="text-xs text-slate-500">
                  消耗 Token：Prompt {lastTokenUsage.promptTokens} + Completion{' '}
                  {lastTokenUsage.completionTokens}
                </span>
              )}
              {accumulatedText && (
                <button
                  type="button"
                  onClick={() => setShowRawStreamPreview((v) => !v)}
                  className="text-xs text-teal-700 hover:text-teal-800 font-medium inline-flex items-center gap-1"
                >
                  {showRawStreamPreview ? '收起流式 JSON 预览' : '展开流式 JSON 预览'}
                  {showRawStreamPreview ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 实时流式进度条 */}
          {(streaming || progress) && !streamError && (
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-sky-500 transition-all duration-300 rounded-full"
                style={{ width: `${streaming ? Math.max(progressPercent, 15) : 100}%` }}
              />
            </div>
          )}

          {/* 流式失败醒目提示与一键重试按钮 */}
          {streamError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-red-800">
                  错误码：{streamError.code}
                </div>
                <div className="text-xs text-red-700">{streamError.message}</div>
              </div>
              <button
                type="button"
                onClick={() => void handleStartExtract()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 shadow-sm shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                立即重试抽取
              </button>
            </div>
          )}

          {/* 实时流式增量 JSON 预览 */}
          {(streaming || showRawStreamPreview) && accumulatedText && (
            <div className="rounded-lg bg-slate-900 text-slate-100 p-3.5 text-xs font-mono max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {accumulatedText}
            </div>
          )}
        </div>
      )}

      {/* 入库成功或错误横幅提示 */}
      {batchMessage && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            batchMessage.type === 'success'
              ? 'bg-teal-50 border-teal-200 text-teal-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm font-medium">
            {batchMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{batchMessage.text}</span>
          </div>
          {batchMessage.type === 'success' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/calendar')}
                className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-3 text-xs"
              >
                前往日历与冲突检测
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/qa')}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                前往 RAG 问答
              </button>
            </div>
          )}
        </div>
      )}

      {/* 步骤三：抽取结果核对、编辑、删除、手动新增与确认入库工作台 */}
      {drafts.length > 0 && (
        <div className="college-card p-6 space-y-5 border-2 border-teal-500/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
                2
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  抽取结果核对与编辑（待入库草稿：{drafts.length} 条）
                </h2>
                <p className="text-xs text-slate-500">
                  您可以直接修改任意字段、删除不需要的条目或手动补充遗漏日程，核对无误后点击「确认入库」。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddBlankDraft}
                className="btn-secondary text-xs py-2 px-3"
              >
                <Plus className="w-4 h-4 text-teal-600" />
                手动新增条目
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmBatchSave()}
                disabled={savingBatch}
                className="btn-primary bg-teal-600 hover:bg-teal-700 text-xs py-2 px-4"
              >
                {savingBatch ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {savingBatch
                  ? '正在写入数据库并生成向量...'
                  : `确认入库 (共 ${drafts.length} 条)`}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {drafts.map((draft, idx) => {
              const meta = EVENT_TYPE_META[draft.type] || EVENT_TYPE_META.course;
              return (
                <div
                  key={draft._localId}
                  className={`rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 ${meta.borderClass}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">
                        #{idx + 1}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium border ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDraft(draft._localId)}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      删除此条
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        事件类型 (type)
                      </label>
                      <select
                        value={draft.type}
                        onChange={(e) =>
                          handleUpdateDraft(
                            draft._localId,
                            'type',
                            e.target.value as EventType
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                      >
                        {EVENT_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-1 lg:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        事件标题 (title) *
                      </label>
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(e) =>
                          handleUpdateDraft(draft._localId, 'title', e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        关联课程 (courseName)
                      </label>
                      <input
                        type="text"
                        value={draft.courseName || ''}
                        onChange={(e) =>
                          handleUpdateDraft(
                            draft._localId,
                            'courseName',
                            e.target.value
                          )
                        }
                        placeholder="如：算法设计与分析"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        开始时间 (startTime) *
                      </label>
                      <input
                        type="datetime-local"
                        value={isoToDatetimeLocal(draft.startTime)}
                        onChange={(e) =>
                          handleUpdateDraft(
                            draft._localId,
                            'startTime',
                            datetimeLocalToIso(e.target.value)
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        结束时间 (endTime) *
                      </label>
                      <input
                        type="datetime-local"
                        value={isoToDatetimeLocal(draft.endTime)}
                        onChange={(e) =>
                          handleUpdateDraft(
                            draft._localId,
                            'endTime',
                            datetimeLocalToIso(e.target.value)
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        地点 / 提交方式 (location)
                      </label>
                      <input
                        type="text"
                        value={draft.location || ''}
                        onChange={(e) =>
                          handleUpdateDraft(draft._localId, 'location', e.target.value)
                        }
                        placeholder="如：教学楼 A302"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      对应原文片段 (sourceText，用于可追溯核对与 RAG 问答引用) *
                    </label>
                    <textarea
                      rows={2}
                      value={draft.sourceText}
                      onChange={(e) =>
                        handleUpdateDraft(draft._localId, 'sourceText', e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-700 font-mono focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 步骤四：已入库事件列表（支持过滤、展开查看原文 sourceText、单条新增/编辑/删除） */}
      <div className="college-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center">
              3
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                已入库教务日程列表（{savedEvents.length} 条）
              </h2>
              <p className="text-xs text-slate-500">
                每条事件均支持展开查看关联的原始通知片段 <code className="text-teal-700">sourceText</code>，修改或删除将自动同步更新 RAG 向量库。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 类型筛选标签 */}
            {(['', 'exam', 'deadline', 'course', 'activity', 'notice'] as const).map(
              (t) => {
                const active = filterType === t;
                const label = t === '' ? '全部' : EVENT_TYPE_META[t].label;
                return (
                  <button
                    key={t || 'all'}
                    type="button"
                    onClick={() => setFilterType(t)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      active
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                );
              }
            )}

            <button
              type="button"
              onClick={() => {
                setEditingEventId(-1);
                setEditForm({
                  type: 'course',
                  title: '',
                  startTime: '2026-11-04T08:00:00+08:00',
                  endTime: '2026-11-04T09:40:00+08:00',
                  location: '',
                  courseName: '',
                  sourceText: '',
                });
              }}
              className="btn-secondary text-xs py-1.5 px-3 ml-1"
            >
              <Plus className="w-3.5 h-3.5 text-teal-600" />
              手动新增入库
            </button>
          </div>
        </div>

        {/* 单条事件新增/编辑内嵌表单 */}
        {editingEventId !== null && editForm && (
          <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-800">
                {editingEventId === -1
                  ? '手动新增入库事件'
                  : `编辑事件 #${editingEventId}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingEventId(null);
                  setEditForm(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">类型</label>
                <select
                  value={editForm.type}
                  onChange={(e) =>
                    setEditForm({ ...editForm, type: e.target.value as EventType })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  {EVENT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">标题 *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm({ ...editForm, title: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">课程名称</label>
                <input
                  type="text"
                  value={editForm.courseName || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, courseName: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">开始时间 *</label>
                <input
                  type="datetime-local"
                  value={isoToDatetimeLocal(editForm.startTime)}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      startTime: datetimeLocalToIso(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">结束时间 *</label>
                <input
                  type="datetime-local"
                  value={isoToDatetimeLocal(editForm.endTime)}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      endTime: datetimeLocalToIso(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">地点</label>
                <input
                  type="text"
                  value={editForm.location || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, location: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-600 mb-1">
                关联原文片段 (sourceText) *
              </label>
              <textarea
                rows={2}
                value={editForm.sourceText}
                onChange={(e) =>
                  setEditForm({ ...editForm, sourceText: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-mono"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingEventId(null);
                  setEditForm(null);
                }}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEditedEvent()}
                disabled={savingSingle}
                className="btn-primary bg-teal-600 hover:bg-teal-700 text-xs py-1.5 px-3"
              >
                <Save className="w-3.5 h-3.5" />
                {savingSingle ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

        {loadingEvents ? (
          <div className="space-y-3">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        ) : savedEvents.length === 0 ? (
          <EmptyState
            title="暂无已入库的教务日程"
            description="您可以点击上方「一键填入示例文本」再点击「开始智能抽取」，核对后确认入库即可在此查看所有结构化日程与原文追溯片段。"
            actionLabel="填入示例文本体验"
            onAction={handleFillSampleText}
          />
        ) : (
          <div className="space-y-3">
            {savedEvents.map((ev) => {
              const meta = EVENT_TYPE_META[ev.type] || EVENT_TYPE_META.course;
              const isExpanded = Boolean(expandedSourceIds[ev.id]);
              const isHighlighted = highlightedEventId === ev.id;
              return (
                <div
                  key={ev.id}
                  className={`rounded-xl border p-4 transition ${meta.borderClass} ${
                    isHighlighted
                      ? 'border-teal-500 bg-teal-50/40 ring-2 ring-teal-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium border ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                      <span className="font-semibold text-sm text-slate-900">
                        {ev.title}
                      </span>
                      {ev.courseName && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          <BookOpen className="w-3 h-3" />
                          {ev.courseName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleExpandSource(ev.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100/70 px-2.5 py-1 rounded-md transition"
                      >
                        {isExpanded ? '收起原文' : '查看原文依据'}
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditSavedEvent(ev)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        title="编辑事件"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSavedEvent(ev.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="删除事件"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatDisplayDateTime(ev.startTime)} 至{' '}
                      {formatDisplayDateTime(ev.endTime)}
                    </span>
                    {ev.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {ev.location}
                      </span>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        关联教务原文片段 (sourceText)
                      </div>
                      <pre className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-700 font-mono whitespace-pre-wrap leading-relaxed">
                        {ev.sourceText}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtractPage;
