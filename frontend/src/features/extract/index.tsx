import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Clock,
  Layers,
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
  parseTimetableFile,
  updateSingleEvent,
  uploadExtractFile,
  type TimetableParseResult,
  type TimetableSlotDto,
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

type ImportMode = 'timetable' | 'ai';

export const ExtractPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timetableInputRef = useRef<HTMLInputElement | null>(null);
  const { highlightedEventId, setHighlightedEventId } = useAppStore();

  // 当前导入模式：周次课表 vs AI 流式抽取
  const [mode, setMode] = useState<ImportMode>('timetable');

  // --- 1. 周次课表解析相关状态 ---
  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [semesterStartDate, setSemesterStartDate] = useState<string>('2026-08-24');
  const [startWeek, setStartWeek] = useState<number>(1);
  const [endWeek, setEndWeek] = useState<number>(21);
  const [parsingTimetable, setParsingTimetable] = useState<boolean>(false);
  const [timetableResult, setTimetableResult] = useState<TimetableParseResult | null>(null);
  const [timetableError, setTimetableError] = useState<string | null>(null);
  const [showSlotsDetail, setShowSlotsDetail] = useState<boolean>(false);

  // --- 2. AI 文本/文件智能抽取状态 ---
  const [rawText, setRawText] = useState<string>('');
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [fileSourceBadge, setFileSourceBadge] = useState<{
    fileName: string;
    sourceType: 'txt' | 'xlsx' | 'image';
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // SSE 流式抽取 Hook
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

  // --- 3. 待核对草稿与分页状态 ---
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [savingBatch, setSavingBatch] = useState<boolean>(false);
  const [batchMessage, setBatchMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [draftPage, setDraftPage] = useState<number>(1);
  const PAGE_SIZE = 12;

  // --- 4. 已入库事件列表状态 ---
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

  // 高亮事件定位
  useEffect(() => {
    if (highlightedEventId !== null) {
      setExpandedSourceIds((prev) => ({ ...prev, [highlightedEventId]: true }));
    }
  }, [highlightedEventId]);

  // --- 周次课表解析处理器 ---
  const handleParseTimetable = async (fileToUse?: File | null) => {
    const file = fileToUse !== undefined ? fileToUse : timetableFile;
    setParsingTimetable(true);
    setTimetableError(null);
    setBatchMessage(null);

    try {
      const res = await parseTimetableFile(file, {
        semesterStartDate: semesterStartDate || '2026-08-24',
        startWeek: Number(startWeek) || 1,
        endWeek: Number(endWeek) || 21,
      });

      setTimetableResult(res);
      if (res.semester?.startDate) {
        setSemesterStartDate(res.semester.startDate);
      }
      if (res.semester?.totalWeeks) {
        setEndWeek(res.semester.totalWeeks);
      }

      // 将展开后的具体日期日程加入待核对草稿列表
      const newDrafts: DraftItem[] = (res.expandedEvents || []).map((ev) => ({
        type: ev.type || 'course',
        title: ev.title || '',
        startTime: ev.startTime,
        endTime: ev.endTime,
        location: ev.location || '',
        courseName: ev.courseName || '',
        sourceText: ev.sourceText || '',
        _localId: createLocalId(),
      }));

      setDrafts(newDrafts);
      setDraftPage(1);
      setBatchMessage({
        type: 'success',
        text: `课表解析成功！已自动识别 ${res.slots.length} 门固定课程，并按第 ${startWeek}-${endWeek} 周计算展开出 ${newDrafts.length} 条日程草稿。`,
      });
    } catch (err) {
      setTimetableError((err as Error).message || '课表解析失败，请检查文件格式');
    } finally {
      setParsingTimetable(false);
    }
  };

  const handleTimetableFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTimetableFile(file);
    e.target.value = '';
    void handleParseTimetable(file);
  };

  // --- AI 流式抽取处理器 ---
  const handleFillSampleText = () => {
    setRawText(SAMPLE_SEMESTER_TEXT);
    setFileSourceBadge({ fileName: 'semester-sample.txt（内置标准示例）', sourceType: 'txt' });
    setFileError(null);
    setBatchMessage(null);
  };

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

  const handleStartExtract = async () => {
    const trimmed = rawText.trim();
    if (!trimmed) {
      setFileError('请先粘贴教务通知文本或上传文件');
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
          const newDrafts = items.map((item) => ({
            type: item.type || 'course',
            title: item.title || '',
            startTime: item.startTime || '2026-11-04T08:00:00+08:00',
            endTime: item.endTime || '2026-11-04T09:40:00+08:00',
            location: item.location || '',
            courseName: item.courseName || '',
            sourceText: item.sourceText || '',
            _localId: createLocalId(),
          }));
          setDrafts(newDrafts);
          setDraftPage(1);
          if (doneEvent.usage) {
            setLastTokenUsage(doneEvent.usage);
          }
          void useAppStore.getState().refreshCurrentUser();
        },
      }
    );
  };

  // 草稿修改与批量入库
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

  const handleRemoveDraft = (localId: string) => {
    setDrafts((prev) => prev.filter((item) => item._localId !== localId));
  };

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
    setDrafts((prev) => [newDraft, ...prev]);
  };

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
        text: `成功将 ${saved.length} 条教务事件批量入库，并已同步构建 RAG 原文向量切片！`,
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

  // 单条已入库事件操作
  const toggleExpandSource = (id: number) => {
    if (highlightedEventId === id) {
      setHighlightedEventId(null);
    }
    setExpandedSourceIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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

  // 计算当前分页切片
  const totalDraftPages = Math.ceil(drafts.length / PAGE_SIZE) || 1;
  const pagedDrafts = useMemo(() => {
    const start = (draftPage - 1) * PAGE_SIZE;
    return drafts.slice(start, start + PAGE_SIZE);
  }, [drafts, draftPage]);

  // 计算流式进度
  const progressPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : streaming
        ? 40
        : 0;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* 顶部轻量化导览与模式切换 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">教务日程导入与抽取</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
              学期周次算法 · RAG 向量就绪
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            支持高校真实周次课表（.xls / .xlsx 按周展开计算）与多格式智能流式识别
          </p>
        </div>

        {/* 模式切换胶囊 */}
        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMode('timetable')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              mode === 'timetable'
                ? 'bg-white text-teal-700 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4 text-teal-600" />
            周次课表解析 (.xls/.xlsx)
          </button>
          <button
            type="button"
            onClick={() => setMode('ai')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              mode === 'ai'
                ? 'bg-white text-teal-700 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-sky-600" />
            智能流式抽取
          </button>
        </div>
      </div>

      {/* 模式一：高校周次课表解析卡片 */}
      {mode === 'timetable' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            {/* 学期基准参数 */}
            <div className="flex flex-wrap items-center gap-3.5 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">开学第一周周一：</span>
                <input
                  type="date"
                  value={semesterStartDate}
                  onChange={(e) => setSemesterStartDate(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-slate-800 bg-slate-50 focus:bg-white focus:border-teal-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">计算周次：</span>
                <input
                  type="number"
                  min={1}
                  max={endWeek}
                  value={startWeek}
                  onChange={(e) => setStartWeek(Number(e.target.value))}
                  className="w-16 px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-center text-slate-800 bg-slate-50 focus:bg-white"
                />
                <span className="text-slate-400">至</span>
                <input
                  type="number"
                  min={startWeek}
                  max={30}
                  value={endWeek}
                  onChange={(e) => setEndWeek(Number(e.target.value))}
                  className="w-16 px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-center text-slate-800 bg-slate-50 focus:bg-white"
                />
                <span className="text-slate-500 font-medium">周</span>
              </div>
            </div>

            {/* 文件操作与按周计算 */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => timetableInputRef.current?.click()}
                disabled={parsingTimetable}
                className="btn-secondary py-2 px-3.5 text-sm"
              >
                {parsingTimetable ? (
                  <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                ) : (
                  <FileUp className="w-4 h-4 text-sky-600" />
                )}
                {timetableFile ? timetableFile.name : '上传本地课表 (.xls / .xlsx)'}
              </button>

              <button
                type="button"
                onClick={() => void handleParseTimetable()}
                disabled={parsingTimetable}
                className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-3 text-xs"
              >
                {parsingTimetable ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Clock className="w-3.5 h-3.5" />
                )}
                按周计算展开
              </button>

              <input
                ref={timetableInputRef}
                type="file"
                accept=".xls,.xlsx"
                onChange={handleTimetableFileSelected}
                className="hidden"
              />
            </div>
          </div>

          {/* 课表错误提示 */}
          {timetableError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{timetableError}</span>
              </div>
              <button
                type="button"
                onClick={() => setTimetableError(null)}
                className="text-xs text-rose-600 underline ml-2"
              >
                关闭
              </button>
            </div>
          )}

          {/* 课表识别概要与固定课程时段 */}
          {timetableResult && (
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800">
                    学期周期：{timetableResult.semester?.startDate} 至 {timetableResult.semester?.endDate} (共 {timetableResult.semester?.totalWeeks} 周)
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-teal-700 font-medium">
                    已检测到 {timetableResult.slots.length} 门固定课程时段
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-600">
                    当前按第 {startWeek}~{endWeek} 周共生成 <strong>{timetableResult.expandedEvents.length}</strong> 条日程
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSlotsDetail((v) => !v)}
                  className="text-teal-700 hover:text-teal-800 font-medium inline-flex items-center gap-1"
                >
                  {showSlotsDetail ? '收起课程时段列表' : '查看识别出的课程时段'}
                  {showSlotsDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* 固定课程时段药丸列表 */}
              {showSlotsDetail && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                  {timetableResult.slots.map((slot, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1"
                    >
                      <div className="font-bold text-slate-800 truncate">{slot.courseName}</div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2">
                        <span>{slot.dayName} {slot.startSection}-{slot.endSection}节</span>
                        <span className="text-teal-700">{slot.startWeek}-{slot.endWeek}周</span>
                        {slot.location && <span className="truncate">{slot.location}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 模式二：AI 文本/文件智能抽取卡片 */}
      {mode === 'ai' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-800">
                粘贴教务文本或上传通知附件
              </span>
              {fileSourceBadge && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                  {fileSourceBadge.sourceType === 'xlsx' && <FileSpreadsheet className="w-3 h-3" />}
                  {fileSourceBadge.sourceType === 'image' && <ImageIcon className="w-3 h-3" />}
                  {fileSourceBadge.sourceType === 'txt' && <FileText className="w-3 h-3" />}
                  {fileSourceBadge.fileName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFillSampleText}
                className="btn-secondary py-1 px-2.5 text-xs text-teal-700 border-teal-200 hover:bg-teal-50"
              >
                <FileText className="w-3.5 h-3.5" />
                填入示例文本
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || streaming}
                className="btn-secondary py-1 px-2.5 text-xs"
              >
                {uploadingFile ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                ) : (
                  <FileUp className="w-3.5 h-3.5 text-sky-600" />
                )}
                {uploadingFile ? '解析中...' : '上传文档/图片'}
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

          {fileError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{fileError}</span>
              </div>
              <button
                type="button"
                onClick={() => setFileError(null)}
                className="text-xs text-rose-600 underline ml-2"
              >
                关闭
              </button>
            </div>
          )}

          <textarea
            rows={5}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="在此粘贴教务处通知、群消息、考试安排，或上传文档/截图..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-teal-600 font-mono leading-relaxed"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-teal-600" />
              防提示词注入隔离保护已启用（extract-v1）
            </div>

            <div className="flex items-center gap-2">
              {streaming ? (
                <button
                  type="button"
                  onClick={abortStream}
                  className="btn-secondary py-1.5 px-3 text-xs border-rose-200 text-rose-600 hover:bg-rose-50"
                >
                  <X className="w-3.5 h-3.5" />
                  停止抽取
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStartExtract()}
                  disabled={!rawText.trim() || uploadingFile}
                  className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-3 text-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  开始智能抽取
                </button>
              )}
            </div>
          </div>

          {/* 流式抽取进度条与增量视图 */}
          {(streaming || progress || streamError || accumulatedText) && (
            <div className="p-3.5 rounded-lg bg-teal-50/60 border border-teal-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {streaming ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                  ) : streamError ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  )}
                  <span className="font-medium text-slate-800">
                    {streamError
                      ? '抽取校验未通过'
                      : streaming
                        ? progress?.message || '大模型流式分析中...'
                        : `抽取完成（共识别 ${drafts.length} 条事件草稿）`}
                  </span>
                </div>

                {accumulatedText && (
                  <button
                    type="button"
                    onClick={() => setShowRawStreamPreview((v) => !v)}
                    className="text-teal-700 hover:underline"
                  >
                    {showRawStreamPreview ? '收起流式 JSON' : '查看流式增量'}
                  </button>
                )}
              </div>

              {streaming && (
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 transition-all duration-300"
                    style={{ width: `${Math.max(progressPercent, 20)}%` }}
                  />
                </div>
              )}

              {showRawStreamPreview && accumulatedText && (
                <pre className="p-2.5 rounded bg-slate-900 text-slate-100 text-[11px] font-mono max-h-36 overflow-y-auto whitespace-pre-wrap">
                  {accumulatedText}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* 全局操作横幅 */}
      {batchMessage && (
        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            batchMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {batchMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{batchMessage.text}</span>
          </div>

          {batchMessage.type === 'success' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/calendar')}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 py-1 px-2.5 text-xs text-white"
              >
                前往学期日历
                <ArrowRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/qa')}
                className="btn-secondary py-1 px-2.5 text-xs"
              >
                前往 RAG 问答
              </button>
            </div>
          )}
        </div>
      )}

      {/* 待核对草稿列表（极简紧凑表格布局） */}
      {drafts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                待入库日程草稿 ({drafts.length} 条)
              </h2>
              <span className="text-xs text-slate-400">
                （第 {draftPage} / {totalDraftPages} 页）
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddBlankDraft}
                className="btn-secondary py-1 px-2.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5 text-teal-600" />
                手动新增
              </button>
              <button
                type="button"
                onClick={() => setDrafts([])}
                className="btn-secondary py-1 px-2.5 text-xs text-rose-600 hover:bg-rose-50"
              >
                清空草稿
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmBatchSave()}
                disabled={savingBatch}
                className="btn-primary bg-teal-600 hover:bg-teal-700 py-1 px-3 text-xs"
              >
                {savingBatch ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {savingBatch ? '入库并向量化中...' : `确认批量入库 (${drafts.length})`}
              </button>
            </div>
          </div>

          {/* 紧凑数据表 */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/50">
                  <th className="py-2 px-2.5 font-medium w-16">序号</th>
                  <th className="py-2 px-2.5 font-medium w-28">类型</th>
                  <th className="py-2 px-2.5 font-medium">标题</th>
                  <th className="py-2 px-2.5 font-medium w-48">起止时间</th>
                  <th className="py-2 px-2.5 font-medium w-36">地点</th>
                  <th className="py-2 px-2.5 font-medium w-32">关联课程</th>
                  <th className="py-2 px-2.5 font-medium w-16 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedDrafts.map((draft, idx) => {
                  const globalIdx = (draftPage - 1) * PAGE_SIZE + idx + 1;
                  return (
                    <tr key={draft._localId} className="hover:bg-slate-50/70">
                      <td className="py-2 px-2.5 font-mono text-slate-400">#{globalIdx}</td>
                      <td className="py-2 px-2.5">
                        <select
                          value={draft.type}
                          onChange={(e) =>
                            handleUpdateDraft(draft._localId, 'type', e.target.value as EventType)
                          }
                          className="px-2 py-1 border border-slate-200 rounded bg-white text-xs"
                        >
                          {EVENT_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          value={draft.title}
                          onChange={(e) =>
                            handleUpdateDraft(draft._localId, 'title', e.target.value)
                          }
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-800"
                        />
                      </td>
                      <td className="py-2 px-2.5 space-y-1">
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
                          className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono"
                        />
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
                          className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] font-mono text-slate-500"
                        />
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          value={draft.location || ''}
                          placeholder="地点"
                          onChange={(e) =>
                            handleUpdateDraft(draft._localId, 'location', e.target.value)
                          }
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-slate-600"
                        />
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          value={draft.courseName || ''}
                          placeholder="课程名"
                          onChange={(e) =>
                            handleUpdateDraft(draft._localId, 'courseName', e.target.value)
                          }
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-slate-600"
                        />
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveDraft(draft._localId)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 分页控制 */}
          {totalDraftPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-500">
                显示 {(draftPage - 1) * PAGE_SIZE + 1} -{' '}
                {Math.min(draftPage * PAGE_SIZE, drafts.length)} 条，共 {drafts.length} 条
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={draftPage <= 1}
                  onClick={() => setDraftPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
                >
                  上一页
                </button>
                <span className="px-2 font-mono text-slate-600">{draftPage} / {totalDraftPages}</span>
                <button
                  type="button"
                  disabled={draftPage >= totalDraftPages}
                  onClick={() => setDraftPage((p) => Math.min(totalDraftPages, p + 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 已入库教务日程管理 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              已入库教务日程 ({savedEvents.length} 条)
            </h2>
            <p className="text-xs text-slate-500">
              已入库日程支持 RAG 语义切片问答与学期日历热力排期
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['', 'course', 'exam', 'deadline', 'activity', 'notice'] as const).map((t) => {
              const active = filterType === t;
              const label = t === '' ? '全部' : EVENT_TYPE_META[t].label;
              return (
                <button
                  key={t || 'all'}
                  type="button"
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                    active
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 单条编辑内嵌面板 */}
        {editingEventId !== null && editForm && (
          <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-800">编辑事件 #{editingEventId}</span>
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
                <label className="block text-slate-600 mb-1">类型</label>
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
                <label className="block text-slate-600 mb-1">标题 *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">课程名称</label>
                <input
                  type="text"
                  value={editForm.courseName || ''}
                  onChange={(e) => setEditForm({ ...editForm, courseName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">开始时间 *</label>
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
                <label className="block text-slate-600 mb-1">结束时间 *</label>
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
                <label className="block text-slate-600 mb-1">地点</label>
                <input
                  type="text"
                  value={editForm.location || ''}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 mb-1">关联原文片段 (sourceText) *</label>
              <textarea
                rows={2}
                value={editForm.sourceText}
                onChange={(e) => setEditForm({ ...editForm, sourceText: e.target.value })}
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
                className="btn-secondary py-1 px-3 text-xs"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEditedEvent()}
                disabled={savingSingle}
                className="btn-primary bg-teal-600 hover:bg-teal-700 py-1 px-3 text-xs"
              >
                <Save className="w-3.5 h-3.5" />
                {savingSingle ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        )}

        {/* 已入库列表 */}
        {loadingEvents ? (
          <div className="space-y-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        ) : savedEvents.length === 0 ? (
          <EmptyState
            title="暂无已入库的教务日程"
            description="您可以选择上方「周次课表解析」或「AI 智能流式抽取」，核对草稿后点击确认入库。"
            actionLabel="填入示例文本体验"
            onAction={handleFillSampleText}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {savedEvents.map((ev) => {
              const meta = EVENT_TYPE_META[ev.type] || EVENT_TYPE_META.course;
              const isExpanded = Boolean(expandedSourceIds[ev.id]);
              const isHighlighted = highlightedEventId === ev.id;
              return (
                <div
                  key={ev.id}
                  className={`py-3 px-2 rounded-lg transition ${
                    isHighlighted ? 'bg-teal-50/70 ring-1 ring-teal-500/30' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium border ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                      <span className="font-semibold text-xs text-slate-900">{ev.title}</span>
                      {ev.courseName && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          <BookOpen className="w-3 h-3" />
                          {ev.courseName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleExpandSource(ev.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-teal-700 hover:underline px-2 py-1"
                      >
                        {isExpanded ? '收起原文' : '原文依据'}
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditSavedEvent(ev)}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        title="编辑事件"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSavedEvent(ev.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="删除事件"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {formatDisplayDateTime(ev.startTime)} ~ {formatDisplayDateTime(ev.endTime)}
                    </span>
                    {ev.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {ev.location}
                      </span>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <pre className="p-2.5 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-700 font-mono whitespace-pre-wrap leading-relaxed">
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
