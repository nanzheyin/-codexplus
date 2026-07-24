import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownWideNarrow,
  ArrowDown,
  ArrowUp,
  AppWindow,
  ArrowLeft,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  CircleArrowUp,
  Copy,
  Database,
  Download,
  Edit3,
  Filter,
  Gauge,
  GripVertical,
  Info,
  ExternalLink,
  Hammer,
  KeyRound,
  LayoutGrid,
  Languages,
  LayoutDashboard,
  Link2,
  List,
  LogIn,
  MessageCircle,
  FileCode2,
  Moon,
  Network,
  PanelTopOpen,
  Power,
  PowerOff,
  Plus,
  Play,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Stethoscope,
  Sun,
  TestTube,
  Trash2,
  Users,
  Wrench,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { ProviderPresetSelector } from "@/components/ProviderPresetSelector";
import type { PresetPatch } from "@/components/ProviderPresetSelector";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  mergeModelWindowRows,
  modelWindowRowsFromProfile,
  serializeModelWindowRows,
  type ModelWindowRow,
} from "./model-windows";
import { getLanguage, t, tf, toggleLanguage } from "@/i18n";

const isWindowsPlatform = /\bWindows\b/i.test(navigator.userAgent);
const codexDeckLogo = new URL("./assets/codex-deck-logo.svg", import.meta.url).href;

type Status = "ok" | "failed" | "not_implemented" | "not_checked" | string;

type CommandResult<T> = T & {
  status: Status;
  message: string;
};

type PathState = {
  status: string;
  path: string | null;
};

type LaunchStatus = {
  status: string;
  message: string;
  started_at_ms: number;
  debug_port: number | null;
  helper_port: number | null;
  codex_app: string | null;
};

type OverviewResult = CommandResult<{
  codex_app: PathState;
  codex_version: string | null;
  silent_shortcut: PathState;
  management_shortcut: PathState;
  latest_launch: LaunchStatus | null;
  current_version: string;
  update_status: string;
  settings_path: string;
  logs_path: string;
}>;

type PluginMarketplaceRepairResult = CommandResult<{
  codexHome: string;
  marketplaceRoot?: string | null;
  initialized: boolean;
  configured: boolean;
  needsRepair: boolean;
}>;

type PluginMarketplaceStatusResult = CommandResult<{
  codexHome: string;
  marketplaceRoot?: string | null;
  configRegistered: boolean;
  needsRepair: boolean;
}>;

type RemotePluginMarketplaceResult = CommandResult<{
  codexHome: string;
  marketplaceRoot?: string | null;
  configRegistered: boolean;
  needsRepair: boolean;
  pluginCount: number;
  skillCount: number;
}>;

type BackendSettings = {
  codexAppPath: string;
  codexExtraArgs: string[];
  providerSyncEnabled: boolean;
  providerSyncSavedProviders: string[];
  providerSyncManualProviders: string[];
  providerSyncLastSelectedProvider: string;
  relayProfilesEnabled: boolean;
  enhancementsEnabled: boolean;
  computerUseGuardEnabled: boolean;
  codexAppUserScriptHotReload: boolean;
  codexAppPluginMarketplaceUnlock: boolean;
  codexAppPluginAutoExpand: boolean;
  codexAppModelWhitelistUnlock: boolean;
  codexAppSessionDelete: boolean;
  codexAppMarkdownExport: boolean;
  codexAppPasteFix: boolean;
  codexAppForceChineseLocale: boolean;
  codexAppFastStartup: boolean;
  codexAppProjectMove: boolean;
  codexAppThreadIdBadge: boolean;
  codexAppConversationView: boolean;
  codexAppThreadScrollRestore: boolean;
  codexAppUpstreamWorktreeCreate: boolean;
  codexAppNativeMenuPlacement: boolean;
  codexAppNativeMenuLocalization: boolean;
  codexAppServiceTierControls: boolean;
  codexAppPetRealMouseLook: boolean;
  codexAppStepwiseEnabled: boolean;
  codexAppStepwiseDirectSend: boolean;
  codexAppStepwiseBaseUrl: string;
  codexAppStepwiseApiKey: string;
  codexAppStepwiseApiKeyEnv: string;
  codexAppStepwiseModel: string;
  codexAppStepwiseMaxItems: number;
  codexAppStepwiseMaxInputChars: number;
  codexAppStepwiseMaxOutputTokens: number;
  codexAppStepwiseTimeoutMs: number;
  codexAppImageOverlayEnabled: boolean;
  codexAppImageOverlayPath: string;
  codexAppImageOverlayOpacity: number;
  codexAppImageOverlayFitMode: ImageOverlayFitMode;
  codexGoalsEnabled: boolean;
  codexAppGoalResumeGuard: boolean;
  launchMode: LaunchMode;
  relayBaseUrl: string;
  relayApiKey: string;
  relayProfiles: RelayProfile[];
  aggregateRelayProfiles: AggregateRelayProfile[];
  activeAggregateRelayId: string;
  relayCommonConfigContents: string;
  relayContextConfigContents: string;
  activeRelayId: string;
  relayTestModel: string;
  /// 路径 B1：视觉模型中转配置（VL API）。
  /// 纯文本模型请求中遇到图片时，Codex++ 会调这个 API 拿文字描述。
  visionRelay: {
    enabled: boolean;
    model: string;
    apiKey: string;
    baseUrl: string;
    /// 上游 VL API 协议。复用 RelayProfile 的协议枚举：
    /// - "chatCompletions"（默认）：OpenAI 兼容 Chat Completions
    /// - "responses"：OpenAI Responses API
    protocol: RelayProtocol;
    /// VL 回复的最大 token 数，控制描述详细程度。默认 256。
    maxTokens: number;
    /// VL 上下文窗口（token）。超出窗口的老图直接丢弃不调 VL。0=不限制。
    contextWindow: number;
  };
};

type LaunchMode = "patch" | "relay";
type ImageOverlayFitMode = "fill" | "fit" | "stretch" | "tile" | "center";

export type RelayProfile = {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  upstreamBaseUrl: string;
  apiKey: string;
  protocol: RelayProtocol;
  relayMode: RelayMode;
  officialMixApiKey: boolean;
  testModel: string;
  configContents: string;
  authContents: string;
  useCommonConfig: boolean;
  contextSelection: RelayContextSelection;
  contextSelectionInitialized: boolean;
  contextWindow: string;
  autoCompactLimit: string;
  modelList: string;
  modelWindows: string;
  // 路径 A：开启后从 Responses 转 Chat Completions 时静默丢弃 input_image，
  // 适用于 DeepSeek/GLM/Kimi 等纯文本模型。默认 false（保留多模态行为）。
  stripImages: boolean;
  /// 路径 A 进阶 + 路径 C 进阶：per-model 图片能力 JSON map。
  /// 仅存 `false`（纯文本）条目；`true` 是默认行为，从 map 中省略。
  /// 例：`{"deepseek-v4-pro":false,"glm-5.2":false}`
  modelImageSupport: string;
  modelReasoningSupport: string;
  userAgent: string;
  aggregate?: RelayAggregateConfig | null;
};

type RelayAggregateStrategy = "failover" | "conversationRoundRobin" | "requestRoundRobin" | "weightedRoundRobin";
type RelayAggregateMember = {
  profileId: string;
  weight: number;
};
type RelayAggregateConfig = {
  strategy: RelayAggregateStrategy;
  members: RelayAggregateMember[];
};
type AggregateRelayMember = {
  relayId: string;
  weight: number;
};
type AggregateRelayProfile = {
  id: string;
  name: string;
  strategy: RelayAggregateStrategy;
  members: AggregateRelayMember[];
};

type RelayContextSelection = {
  mcpServers: string[];
  skills: string[];
  plugins: string[];
};

type ContextKind = "mcp" | "skill" | "plugin";
type ContextStatusFilter = "all" | "enabled" | "disabled";
type ContextListSort = "config" | "name" | "enabled";

type CodexContextEntry = {
  id: string;
  kind: ContextKind;
  title: string;
  summary: string;
  tomlBody: string;
  enabled: boolean;
};

type CodexContextEntries = {
  mcpServers: CodexContextEntry[];
  skills: CodexContextEntry[];
  plugins: CodexContextEntry[];
};

type RelayProtocol = "responses" | "chatCompletions";
type RelayMode = "official" | "mixedApi" | "pureApi" | "aggregate";
type RelayListView = "grid" | "list";
type RelayListSort = "manual" | "name";
type RelayWorkspaceSection = "providers" | "localRelay" | "localFiles";
const PROTOCOL_PROXY_BASE_URL = "http://127.0.0.1:57321/v1";
const CHAT_UPSTREAM_BASE_URL_KEY = "codex_plus_chat_base_url";
const SCRIPT_MARKET_REPOSITORY_URL = "https://github.com/BigPizzaV3/CodexPlusPlusScriptMarket";

const emptyContextSelection = (): RelayContextSelection => ({
  mcpServers: [],
  skills: [],
  plugins: [],
});

type UserScriptInventory = {
  enabled?: boolean;
  scripts?: Array<{
    key: string;
    name: string;
    source: string;
    enabled: boolean;
    status: string;
    error: string;
    market_id?: string;
    version?: string;
    installed?: boolean;
    source_url?: string;
    homepage?: string;
  }>;
};

type SettingsResult = CommandResult<{
  settings: BackendSettings;
  settings_path: string;
  user_scripts: UserScriptInventory;
}>;

type RelayResult = CommandResult<{
  authenticated: boolean;
  authSource: string;
  accountLabel: string | null;
  configPath: string;
  configured: boolean;
  requiresOpenaiAuth: boolean;
  hasBearerToken: boolean;
  backupPath: string | null;
}>;

type RelayPayload = Omit<RelayResult, "status" | "message">;

type RelayFilesResult = CommandResult<{
  configPath: string;
  authPath: string;
  configContents: string;
  authContents: string;
}>;

type LocalSession = {
  id: string;
  title: string;
  cwd: string;
  modelProvider: string;
  archived: boolean;
  updatedAtMs: number | null;
  rolloutPath: string;
  dbPath: string;
};

type SessionListFilter = "all" | "active" | "archived";
type SessionListSort = "newest" | "oldest";

type LocalSessionsResult = CommandResult<{
  dbPath: string;
  dbPaths: string[];
  sessions: LocalSession[];
}>;

type DeleteLocalSessionResult = CommandResult<{
  status: string;
  session_id: string;
  message: string;
  undo_token: string | null;
  backup_path: string | null;
}>;

type ContextEntriesResult = CommandResult<{
  settings: BackendSettings;
  entries: CodexContextEntries;
}>;

type LiveContextEntriesResult = CommandResult<{
  entries: CodexContextEntries;
}>;

type ExtractRelayCommonConfigResult = CommandResult<{
  commonConfigContents: string;
  profileConfigContents: string;
}>;

type RelaySwitchResult = CommandResult<{
  settings: BackendSettings;
  settingsPath: string;
  user_scripts: unknown;
  relay: RelayPayload;
}>;

type SettingsBackfillResult = CommandResult<{
  settings: BackendSettings;
}>;

type RelayProfileTestResult = CommandResult<{
  httpStatus: number;
  endpoint: string;
  responsePreview: string;
}>;

type StepwiseTestResult = CommandResult<{
  itemCount: number;
  error: string;
}>;

type RelayProfileModelsResult = CommandResult<{
  models: string[];
  endpoint: string;
}>;

type ProviderDoctorCheck = {
  id: string;
  title: string;
  status: Status;
  detail: string;
};

type ProviderDoctorResult = CommandResult<{
  profileName: string;
  model: string;
  summary: string;
  recommendation: string;
  checks: ProviderDoctorCheck[];
}>;

type CcsProviderImport = {
  sourceId: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: RelayProtocol;
  configContents: string;
  authContents: string;
};

type CcsProvidersResult = CommandResult<{
  dbPath: string;
  providers: CcsProviderImport[];
}>;

type ProviderImportRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
  wireApi: string;
  relayMode: string;
  configContents: string;
  authContents: string;
};

type PendingProviderImportResult = CommandResult<{
  pending: ProviderImportRequest | null;
}>;

type LocalRelaySettings = {
  enabled: boolean;
  port: number;
  apiKey: string;
  routingStrategy: string;
  providerIds: string[];
  disabledProviderIds: string[];
  hourlyQuota: number | null;
  weeklyQuota: number | null;
};

type LocalRelayResult = CommandResult<{
  settings: LocalRelaySettings;
  apiKeyMasked: string;
  running: boolean;
  baseUrl: string;
  statePath: string;
}>;

type OAuthLoginResult = CommandResult<{
  loginId: string;
  authUrl: string;
}>;

type OAuthProfileResult = CommandResult<{
  state: "pending" | "completed" | "failed" | string;
  profileId: string | null;
  settings: BackendSettings;
  settingsPath: string;
  userScripts: UserScriptInventory;
}>;

type LegacyImportSchema = {
  settingsJsonFound: boolean;
  settingsJsonValid: boolean;
  settingsKeyCount: number;
};

type LegacyImportSummary = {
  automaticItems: number;
  confirmationItems: number;
  secretItems: number;
  executableOrExternalItems: number;
  excludedItems: number;
  conflicts: number;
  codexNativeSessionSources: number;
};

type LegacyImportItem = {
  id: string;
  group: string;
  sourcePath: string;
  sourceKey: string;
  target: string;
  action: string;
  requiresConfirmation: boolean;
  risk: string;
};

type LegacyImportConflict = {
  id: string;
  severity: string;
  sourcePath: string;
  message: string;
};

type LegacyImportExcluded = {
  id: string;
  category: string;
  sourcePath: string;
  reason: string;
  sizeBytes?: number | null;
};

type LegacyImportPreview = {
  sourceRoot: string;
  found: boolean;
  schema: LegacyImportSchema;
  summary: LegacyImportSummary;
  items: LegacyImportItem[];
  conflicts: LegacyImportConflict[];
  excluded: LegacyImportExcluded[];
};

type LegacyImportLedgerEntry = {
  itemId: string;
  group: string;
  sourcePath: string;
  sourceKey: string;
  target: string;
  selected: boolean;
  status: string;
  requiresConfirmation: boolean;
  risk: string;
};

type LegacyImportLedger = {
  sourceRoot: string;
  createdAtMs: number;
  entries: LegacyImportLedgerEntry[];
};

type LegacyImportTransaction = {
  transactionRoot: string;
  previewPath: string;
  ledgerPath: string;
  rollbackManifestPath: string;
  ledger: LegacyImportLedger;
};

type LegacyImportApplyResult = {
  settingsPath: string;
  ledgerPath: string;
  imported: number;
  skipped: number;
  pendingConfirmation: number;
  failed: number;
};

type LegacyImportRollbackResult = {
  settingsPath: string;
  ledgerPath: string;
  rollbackManifestPath: string;
  backupPath: string;
  restored: boolean;
  entriesMarkedRolledBack: number;
  backupSha256Verified: boolean;
};

type LegacyImportPreviewResult = CommandResult<{
  preview: LegacyImportPreview;
}>;

type LegacyImportPrepareResult = CommandResult<{
  transaction: LegacyImportTransaction | null;
}>;

type LegacyImportApplyCommandResult = CommandResult<{
  result: LegacyImportApplyResult | null;
}>;

type LegacyImportRollbackCommandResult = CommandResult<{
  result: LegacyImportRollbackResult | null;
}>;

type EnvConflict = {
  name: string;
  source: "process" | "user" | string;
  valuePresent: boolean;
};

type EnvConflictsResult = CommandResult<{
  conflicts: EnvConflict[];
}>;

type RelayLatencyResult = CommandResult<{
  latencyMs: number | null;
  httpStatus: number | null;
}>;

type RemoveEnvConflictsResult = CommandResult<{
  removed: Array<{
    name: string;
    removedProcess: boolean;
    removedUser: boolean;
  }>;
  backupPath: string | null;
  remaining: EnvConflict[];
}>;

type ProviderSyncPayload = {
  syncStatus?: string;
  targetProvider?: string;
  changedSessionFiles?: number;
  skippedLockedRolloutFiles?: string[];
  sqliteRowsUpdated?: number;
  sqliteProviderRowsUpdated?: number;
  sqliteUserEventRowsUpdated?: number;
  sqliteCwdRowsUpdated?: number;
  updatedWorkspaceRoots?: number;
  prunedSessionIndexEntries?: number;
  encryptedContentWarning?: string | null;
};

type SessionIndexCleanupCandidate = {
  id: string;
  threadName: string;
  updatedAt: string;
};

type SessionIndexCleanupPreviewPayload = {
  snapshotSha256: string;
  candidates: SessionIndexCleanupCandidate[];
};

type SessionIndexCleanupApplyPayload = {
  prunedEntries?: number;
  backupDir?: string | null;
  appStatePruned?: boolean;
  appStateBackupDir?: string | null;
};

type ProviderSyncTargetSource = "config" | "rollout" | "sqlite" | "manual";

type ProviderSyncTargetOption = {
  id: string;
  sources: ProviderSyncTargetSource[];
  isCurrentProvider: boolean;
  isManual: boolean;
  isSaved: boolean;
};

type ProviderSyncTargetsPayload = {
  currentProvider: string;
  targets: ProviderSyncTargetOption[];
};

type ProviderSyncTargetsResult = CommandResult<ProviderSyncTargetsPayload>;

type ProviderSyncProgress = {
  active: boolean;
  percent: number;
  message: string;
  result: CommandResult<ProviderSyncPayload> | null;
};

type TaskProgress = {
  active: boolean;
  percent: number;
  message: string;
};

type LogsResult = CommandResult<{
  path: string;
  text: string;
  lines: number;
}>;

type DiagnosticsResult = CommandResult<{
  report: string;
}>;

type WatcherResult = CommandResult<{
  enabled: boolean;
  disabled_flag: string;
}>;

type InstallResult = CommandResult<{
  silent_shortcut: { installed: boolean; path: string | null };
  management_shortcut: { installed: boolean; path: string | null };
}>;

type UpdateResult = CommandResult<{
  currentVersion: string;
  latestVersion?: string | null;
  releaseSummary?: string;
  assetName?: string | null;
  assetUrl?: string | null;
  updateAvailable?: boolean;
  installedPath?: string;
  progress?: number;
}>;

type ScriptMarketItem = {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  homepage: string;
  script_url: string;
  sha256: string;
  installed: boolean;
  installedVersion: string;
  updateAvailable: boolean;
};

type ScriptMarketResult = CommandResult<{
  market: {
    status: string;
    message: string;
    indexUrl: string;
    updatedAt: string;
    scripts: ScriptMarketItem[];
  };
  user_scripts: UserScriptInventory;
}>;

function providerSyncProgressMessage(result: CommandResult<ProviderSyncPayload>): string {
  const changed = result.changedSessionFiles ?? 0;
  const rows = result.sqliteRowsUpdated ?? 0;
  const pruned = result.prunedSessionIndexEntries ?? 0;
  const target = result.targetProvider || t("当前 provider");
  const skipped = result.skippedLockedRolloutFiles?.length ?? 0;
  const prunedText = pruned ? tf("，清理 {0} 条失效任务索引", [pruned]) : "";
  const skippedText = skipped ? tf("，跳过 {0} 个占用文件", [skipped]) : "";
  return tf("已同步到 {0}：修复 {1} 个会话文件，更新 {2} 行数据库索引{3}{4}。", [
    target,
    changed,
    rows,
    prunedText,
    skippedText,
  ]);
}

const providerSyncSourceLabels: Record<ProviderSyncTargetSource, string> = {
  config: t("配置"),
  rollout: t("会话"),
  sqlite: t("索引"),
  manual: t("手动"),
};

function providerSyncTargetLabel(target: ProviderSyncTargetOption): string {
  const labels = target.sources.map((source) => providerSyncSourceLabels[source]).filter(Boolean);
  const current = target.isCurrentProvider ? [t("当前")] : [];
  return [...labels, ...current].join(" / ") || t("发现");
}

function syncMarketInstalledState(current: ScriptMarketResult | null, userScripts: UserScriptInventory): ScriptMarketResult | null {
  if (!current) return current;
  const installed = new Map(
    (userScripts.scripts ?? [])
      .filter((script) => script.market_id)
      .map((script) => [script.market_id || "", script.version || ""]),
  );
  return {
    ...current,
    user_scripts: userScripts,
    market: {
      ...current.market,
      scripts: current.market.scripts.map((script) => {
        const installedVersion = installed.get(script.id) || "";
        return {
          ...script,
          installed: Boolean(installedVersion),
          installedVersion,
          updateAvailable: Boolean(installedVersion) && installedVersion !== script.version,
        };
      }),
    },
  };
}

type StartupResult = CommandResult<{
  showUpdate: boolean;
}>;

type Route = "overview" | "relay" | "sessions" | "context" | "enhance" | "userScripts" | "maintenance" | "about" | "settings";
type Theme = "dark" | "light";

const routes: Array<{ id: Route; label: string; icon: LucideIcon; badge?: string }> = [
  { id: "overview", label: t("概览"), icon: LayoutDashboard },
  { id: "relay", label: t("供应商配置"), icon: KeyRound },
  { id: "sessions", label: t("会话管理"), icon: MessageCircle },
  { id: "context", label: t("工具与插件"), icon: Network },
  { id: "enhance", label: t("Codex 增强"), icon: Hammer },
  { id: "userScripts", label: t("脚本市场"), icon: FileCode2 },
  { id: "maintenance", label: t("安装维护"), icon: Wrench },
  { id: "about", label: t("关于"), icon: Info },
  { id: "settings", label: t("设置"), icon: Settings },
];

const routeGroups: Array<{ label: string; items: Route[] }> = [
  { label: t("工作台"), items: ["overview", "relay", "sessions", "context"] },
  { label: t("扩展"), items: ["enhance", "userScripts"] },
  { label: t("系统"), items: ["maintenance", "about", "settings"] },
];

const defaultSettings: BackendSettings = {
  codexAppPath: "",
  codexExtraArgs: [],
  providerSyncEnabled: false,
  providerSyncSavedProviders: [],
  providerSyncManualProviders: [],
  providerSyncLastSelectedProvider: "",
  relayProfilesEnabled: true,
  enhancementsEnabled: true,
  computerUseGuardEnabled: false,
  codexAppUserScriptHotReload: false,
  codexAppPluginMarketplaceUnlock: true,
  codexAppPluginAutoExpand: true,
  codexAppModelWhitelistUnlock: true,
  codexAppSessionDelete: true,
  codexAppMarkdownExport: true,
  codexAppPasteFix: false,
  codexAppForceChineseLocale: true,
  codexAppFastStartup: false,
  codexAppProjectMove: true,
  codexAppThreadIdBadge: false,
  codexAppConversationView: false,
  codexAppThreadScrollRestore: true,
  codexAppUpstreamWorktreeCreate: true,
  codexAppNativeMenuPlacement: true,
  codexAppNativeMenuLocalization: true,
  codexAppServiceTierControls: true,
  codexAppPetRealMouseLook: false,
  codexAppStepwiseEnabled: false,
  codexAppStepwiseDirectSend: false,
  codexAppStepwiseBaseUrl: "",
  codexAppStepwiseApiKey: "",
  codexAppStepwiseApiKeyEnv: "CODEX_STEPWISE_API_KEY",
  codexAppStepwiseModel: "",
  codexAppStepwiseMaxItems: 6,
  codexAppStepwiseMaxInputChars: 6000,
  codexAppStepwiseMaxOutputTokens: 500,
  codexAppStepwiseTimeoutMs: 8000,
  codexAppImageOverlayEnabled: false,
  codexAppImageOverlayPath: "",
  codexAppImageOverlayOpacity: 35,
  codexAppImageOverlayFitMode: "fit",
  codexGoalsEnabled: false,
  codexAppGoalResumeGuard: false,
  launchMode: "patch",
  relayBaseUrl: "",
  relayApiKey: "",
  relayProfiles: [
    {
      id: "default",
      name: t("默认中转"),
      model: "",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      protocol: "responses",
      relayMode: "official",
      officialMixApiKey: false,
      testModel: "",
      configContents: "",
      authContents: "",
      useCommonConfig: true,
      contextSelection: emptyContextSelection(),
      contextSelectionInitialized: true,
      contextWindow: "",
      autoCompactLimit: "",
      modelList: "",
      modelWindows: "",
      stripImages: false,
      modelImageSupport: "",
      modelReasoningSupport: "",
      userAgent: "",
    },
  ],
  relayCommonConfigContents: "",
  relayContextConfigContents: "",
  activeRelayId: "default",
  aggregateRelayProfiles: [],
  activeAggregateRelayId: "",
  relayTestModel: "gpt-5.4-mini",
  visionRelay: { enabled: false, model: "", apiKey: "", baseUrl: "", protocol: "chatCompletions", maxTokens: 256, contextWindow: 0 },
};

export function App() {
  const [theme, setTheme] = useState<Theme>(() => loadInitialTheme());
  const [route, setRoute] = useState<Route>(() => loadInitialRoute());
  const [notice, setNotice] = useState<{ title: string; message: string; status?: Status } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [sessionIndexCleanupDialog, setSessionIndexCleanupDialog] = useState<{
    candidates: SessionIndexCleanupCandidate[];
    resolve: (selectedIds: string[] | null) => void;
  } | null>(null);
  const [overview, setOverview] = useState<OverviewResult | null>(null);
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [relay, setRelay] = useState<RelayResult | null>(null);
  const [relayFiles, setRelayFiles] = useState<RelayFilesResult | null>(null);
  const [localRelay, setLocalRelay] = useState<LocalRelayResult | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflictsResult | null>(null);
  const [ccsProviders, setCcsProviders] = useState<CcsProvidersResult | null>(null);
  const [pendingProviderImport, setPendingProviderImport] = useState<ProviderImportRequest | null>(null);
  const [localSessions, setLocalSessions] = useState<LocalSessionsResult | null>(null);
  const [liveContextEntries, setLiveContextEntries] = useState<CodexContextEntries | null>(null);
  const [logs, setLogs] = useState<LogsResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [watcher, setWatcher] = useState<WatcherResult | null>(null);
  const [update, setUpdate] = useState<UpdateResult | null>(null);
  const [updateInstallProgress, setUpdateInstallProgress] = useState<TaskProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行安装包更新。"),
  });
  const [scriptMarket, setScriptMarket] = useState<ScriptMarketResult | null>(null);
  const [launchForm, setLaunchForm] = useState({
    appPath: "",
    debugPort: "9229",
    helperPort: "57321",
  });
  const prevLaunchStatusRef = useRef<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<BackendSettings>({ ...defaultSettings });
  const [providerSyncProgress, setProviderSyncProgress] = useState<ProviderSyncProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行历史会话修复。"),
    result: null,
  });
  const [pluginMarketplaceProgress, setPluginMarketplaceProgress] = useState<TaskProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行插件市场修复。"),
  });
  const [remotePluginMarketplace, setRemotePluginMarketplace] = useState<RemotePluginMarketplaceResult | null>(null);
  const [remotePluginMarketplaceProgress, setRemotePluginMarketplaceProgress] = useState<TaskProgress>({
    active: false,
    percent: 0,
    message: t("尚未检查官方远端插件缓存。"),
  });
  const [providerSyncTargets, setProviderSyncTargets] = useState<ProviderSyncTargetsResult | null>(null);
  const [selectedProviderSyncTarget, setSelectedProviderSyncTarget] = useState("");
  const [removeOwnedData, setRemoveOwnedData] = useState(false);
  const [relaySwitching, setRelaySwitching] = useState(false);

  const call = <T,>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args);

  const logDiagnostic = (event: string, detail: Record<string, unknown> = {}) => {
    void invoke("write_diagnostic_event", { event, detail }).catch(() => {});
  };

  const run = async <T,>(task: () => Promise<T>): Promise<T | null> => {
    try {
      return await task();
    } catch (error) {
      showNotice(t("调用失败"), stringifyError(error), "failed");
      return null;
    }
  };

  const refreshOverview = async (silent = false) => {
    const result = await run(() => call<OverviewResult>("load_overview"));
    if (result) {
      // 崩溃检测：进程从运行状态变为停止/失败 → 弹出通知
      const prev = prevLaunchStatusRef.current;
      const current = result.latest_launch?.status;
      if (prev && prev === "running" && current && (current === "stopped" || current === "failed" || current === "crashed")) {
        showNotice(t("Codex 意外停止"), tf("进程状态：{0}。是否要重新启动？", [current]), "failed");
      }
      prevLaunchStatusRef.current = current ?? null;
      setOverview(result);
      if (!silent) showResultNotice(t("概览已检查"), result, { silentSuccess: true });
    }
  };

  const refreshSettings = async (silent = false) => {
    const result = await run(() => call<SettingsResult>("load_settings"));
    if (result) {
      setSettings(result);
      const normalized = normalizeSettings(result.settings);
      setSettingsForm(normalized);
      setLaunchForm((current) => ({
        ...current,
        appPath: current.appPath || result.settings.codexAppPath || "",
      }));
      if (!silent) showResultNotice(t("设置已加载"), result, { silentSuccess: true });
      return normalized;
    }
    return null;
  };

  const refreshScriptMarket = async (silent = false) => {
    const result = await run(() => call<ScriptMarketResult>("refresh_script_market"));
    if (result) {
      setScriptMarket(result);
      setSettings((current) => (current ? { ...current, user_scripts: result.user_scripts } : current));
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("脚本市场"), result, { silentSuccess: true });
    }
  };

  const installMarketScript = async (id: string) => {
    const result = await run(() => call<ScriptMarketResult>("install_market_script", { id }));
    if (result) {
      setScriptMarket(result);
      setSettings((current) => (current ? { ...current, user_scripts: result.user_scripts } : current));
      showResultNotice(t("脚本市场"), result);
    }
  };

  const setUserScriptEnabled = async (key: string, enabled: boolean) => {
    const result = await run(() => call<SettingsResult>("set_user_script_enabled", { key, enabled }));
    if (result) {
      setSettings(result);
      setScriptMarket((current) => syncMarketInstalledState(current, result.user_scripts));
      showResultNotice(t("本地脚本"), result);
    }
  };

  const deleteUserScript = async (key: string) => {
    const script = settings?.user_scripts?.scripts?.find((item) => item.key === key);
    const name = script?.name || key;
    if (!window.confirm(tf("删除脚本“{0}”？此操作会移除本地脚本文件。", [name]))) return;
    const result = await run(() => call<SettingsResult>("delete_user_script", { key }));
    if (result) {
      setSettings(result);
      setScriptMarket((current) => syncMarketInstalledState(current, result.user_scripts));
      showResultNotice(t("本地脚本"), result);
    }
  };

  const refreshRelay = async (silent = false) => {
    const result = await run(() => call<RelayResult>("relay_status"));
    if (result) {
      setRelay(result);
      if (!silent) showResultNotice(t("登录状态"), result, { silentSuccess: true });
    }
  };

  const refreshRelayFiles = async (silent = false) => {
    const result = await run(() => call<RelayFilesResult>("read_relay_files"));
    if (result) {
      setRelayFiles(result);
      if (!silent) showResultNotice(t("配置文件"), result, { silentSuccess: true });
    }
    return result;
  };

  const refreshEnvConflicts = async (silent = false) => {
    const result = await run(() => call<EnvConflictsResult>("check_env_conflicts"));
    if (result) {
      setEnvConflicts(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("环境变量检测"), result, { silentSuccess: true });
    }
    return result;
  };

  const removeEnvConflicts = async (names: string[]) => {
    const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    if (!uniqueNames.length) return;
    if (!window.confirm(tf("删除这些环境变量？\n\n{0}\n\n删除前会写入备份。", [uniqueNames.join("\n")]))) return;
    const result = await run(() => call<RemoveEnvConflictsResult>("remove_env_conflicts", { request: { names: uniqueNames } }));
    if (result) {
      setEnvConflicts({
        status: result.status,
        message: result.message,
        conflicts: result.remaining,
      });
      showNotice(t("环境变量清理"), result.message, result.status);
    }
  };

  const refreshCcsProviders = async (silent = false) => {
    const result = await run(() => call<CcsProvidersResult>("load_ccs_providers"));
    if (result) {
      setCcsProviders(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("cc-switch 导入"), result, { silentSuccess: true });
    }
    return result;
  };

  const importCcsProviders = async () => {
    const result = await run(() => call<SettingsResult>("import_ccs_providers"));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showResultNotice(t("cc-switch 导入"), result);
      await refreshCcsProviders(true);
    }
  };

  const refreshPendingProviderImport = async (silent = true) => {
    if (!settingsForm.relayProfilesEnabled) {
      setPendingProviderImport(null);
      return null;
    }
    const result = await run(() => call<PendingProviderImportResult>("load_pending_provider_import"));
    if (result) {
      setPendingProviderImport(result.pending);
      if (!silent && !isSuccessStatus(result.status)) showResultNotice(t("Codex Deck 导入"), result, { silentSuccess: true });
    }
    return result;
  };

  const confirmPendingProviderImport = async () => {
    const result = await run(() => call<SettingsResult>("confirm_pending_provider_import"));
    if (result) {
      setPendingProviderImport(null);
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showResultNotice(t("Codex Deck 导入"), result);
      await refreshCcsProviders(true);
    }
  };

  const dismissPendingProviderImport = async () => {
    const result = await run(() => call<PendingProviderImportResult>("dismiss_pending_provider_import"));
    if (result) {
      setPendingProviderImport(null);
      showResultNotice(t("Codex Deck 导入"), result, { silentSuccess: true });
    }
  };

  const previewLegacyImport = async (sourcePath: string) => {
    const result = await run(() =>
      call<LegacyImportPreviewResult>("preview_legacy_import", {
        request: { sourcePath },
      }),
    );
    if (result) showResultNotice(t("Legacy 导入预览"), result, { silentSuccess: true });
    return result;
  };

  const refreshLocalRelay = async (silent = false) => {
    const result = await run(() => call<LocalRelayResult>("local_relay_status"));
    if (result) {
      setLocalRelay(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("本地中转"), result, { silentSuccess: true });
    }
    return result;
  };

  const applyOAuthProfileResult = (result: OAuthProfileResult) => {
    const normalized = normalizeSettings(result.settings);
    setSettings({
      status: result.status,
      message: result.message,
      settings: normalized,
      settings_path: result.settingsPath,
      user_scripts: result.userScripts,
    });
    setSettingsForm(normalized);
  };

  const startCodexOAuthLogin = async () => {
    const result = await run(() => call<OAuthLoginResult>("start_codex_oauth_login"));
    if (!result) return null;
    if (!isSuccessStatus(result.status) || !result.authUrl) {
      showResultNotice(t("OAuth 登录"), result);
      return result;
    }
    await openExternalUrl(result.authUrl);
    return result;
  };

  const pollCodexOAuthLogin = async (loginId: string) => {
    const result = await run(() => call<OAuthProfileResult>("poll_codex_oauth_login", { loginId }));
    if (!result) return null;
    if (result.state === "completed") {
      applyOAuthProfileResult(result);
      showResultNotice(t("OAuth 登录"), result);
    } else if (!isSuccessStatus(result.status) || result.state === "failed") {
      showResultNotice(t("OAuth 登录"), result);
    }
    return result;
  };

  const importLocalCodexOAuth = async () => {
    const result = await run(() => call<OAuthProfileResult>("import_local_codex_oauth"));
    if (!result) return null;
    if (isSuccessStatus(result.status)) applyOAuthProfileResult(result);
    showResultNotice(t("OAuth 导入"), result);
    return result;
  };

  const startLocalRelay = async (settings: LocalRelaySettings) => {
    const result = await run(() => call<LocalRelayResult>("start_local_relay", { request: { settings } }));
    if (result) {
      setLocalRelay(result);
      showResultNotice(t("本地中转"), result);
      if (isSuccessStatus(result.status)) {
        await refreshSettings(true);
        await refreshRelayFiles(true);
        await refreshRelay(true);
      }
    }
    return result;
  };

  const stopLocalRelay = async () => {
    const result = await run(() => call<LocalRelayResult>("stop_local_relay"));
    if (result) {
      setLocalRelay(result);
      showResultNotice(t("本地中转"), result);
      if (isSuccessStatus(result.status)) {
        await refreshSettings(true);
        await refreshRelayFiles(true);
        await refreshRelay(true);
      }
    }
    return result;
  };

  const regenerateLocalRelayKey = async () => {
    const result = await run(() => call<LocalRelayResult>("regenerate_local_relay_key"));
    if (result) {
      setLocalRelay(result);
      showResultNotice(t("本地中转"), result);
    }
    return result;
  };

  const prepareLegacyImportTransaction = async (sourcePath: string, selectedItemIds: string[]) => {
    const result = await run(() =>
      call<LegacyImportPrepareResult>("prepare_legacy_import_transaction", {
        request: { sourcePath, selectedItemIds },
      }),
    );
    if (result) showResultNotice(t("Legacy 导入事务"), result);
    return result;
  };

  const applyLegacyImportTransaction = async (transactionRoot: string) => {
    const result = await run(() =>
      call<LegacyImportApplyCommandResult>("apply_legacy_import_transaction", {
        request: { transactionRoot },
      }),
    );
    if (result) {
      if (isSuccessStatus(result.status)) await refreshSettings(true);
      showResultNotice(t("Legacy 导入应用"), result);
    }
    return result;
  };

  const rollbackLegacyImportTransaction = async (transactionRoot: string) => {
    const result = await run(() =>
      call<LegacyImportRollbackCommandResult>("rollback_legacy_import_transaction", {
        request: { transactionRoot },
      }),
    );
    if (result) {
      if (isSuccessStatus(result.status)) await refreshSettings(true);
      showResultNotice(t("Legacy 导入回滚"), result);
    }
    return result;
  };

  const refreshLocalSessions = async (silent = false) => {
    const result = await run(() => call<LocalSessionsResult>("list_local_sessions"));
    if (result) {
      setLocalSessions(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("会话管理"), result, { silentSuccess: true });
    }
    return result;
  };

  const requestDeleteLocalSession = (session: LocalSession) =>
    call<DeleteLocalSessionResult>("delete_local_session", {
      request: { sessionId: session.id, title: session.title, dbPath: session.dbPath },
    });

  const confirmSessionDelete = (title: string, message: string) =>
    new Promise<boolean>((resolve) => {
      setConfirmDialog({
        title,
        message,
        confirmText: t("确认删除"),
        cancelText: t("取消"),
        resolve,
      });
    });

  const selectSessionIndexCleanupCandidates = (candidates: SessionIndexCleanupCandidate[]) =>
    new Promise<string[] | null>((resolve) => {
      setSessionIndexCleanupDialog({
        candidates,
        resolve,
      });
    });

  const deleteLocalSession = async (session: LocalSession) => {
    const title = session.title || session.id;
    const confirmed = await confirmSessionDelete(t("删除会话"), tf("删除会话“{0}”？此操作会删除本地数据库记录和 rollout 文件，并创建备份。", [truncateSessionDeletePreview(title)]));
    if (!confirmed) return;
    const result = await run(() => requestDeleteLocalSession(session));
    if (result) {
      showResultNotice(t("会话删除"), result);
      await refreshLocalSessions(true);
    }
  };

  const deleteLocalSessions = async (sessions: LocalSession[]) => {
    const uniqueSessions = Array.from(new Map(sessions.map((session) => [session.id, session])).values());
    if (!uniqueSessions.length) {
      showNotice(t("批量删除会话"), t("请先选择要删除的会话。"), "failed");
      return;
    }
    const preview = uniqueSessions
      .slice(0, 6)
      .map((session) => `- ${truncateSessionDeletePreview(session.title || session.id)}`)
      .join("\n");
    const extraCount = uniqueSessions.length > 6 ? tf("\n...以及另外 {0} 个会话", [uniqueSessions.length - 6]) : "";
    const confirmed = await confirmSessionDelete(
      t("批量删除会话"),
      tf("删除选中的 {0} 个会话？此操作会删除本地数据库记录和 rollout 文件，并为每个会话创建备份。\n\n{1}{2}", [uniqueSessions.length, preview, extraCount]),
    );
    if (!confirmed) return;

    let succeeded = 0;
    const failed: string[] = [];
    for (const session of uniqueSessions) {
      const result = await run(() => requestDeleteLocalSession(session));
      if (result && isSuccessStatus(result.status)) {
        succeeded += 1;
      } else {
        failed.push(session.title || session.id);
      }
    }

    if (failed.length) {
      showNotice(
        t("批量删除会话"),
        tf("已删除 {0} 个，失败 {1} 个：{2}", [succeeded, failed.length, failed.slice(0, 3).map(truncateSessionDeletePreview).join(t("、"))]),
        succeeded ? "ok" : "failed",
      );
    } else {
      showNotice(t("批量删除会话"), tf("已删除 {0} 个会话。", [succeeded]), "ok");
    }
    await refreshLocalSessions(true);
  };

  const refreshLiveContextEntries = async (silent = false) => {
    const result = await run(() => call<LiveContextEntriesResult>("read_live_context_entries"));
    if (result) {
      setLiveContextEntries(result.entries);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("工具与插件"), result, { silentSuccess: true });
    }
    return result;
  };

  const syncLiveContextEntries = async (next: BackendSettings, silent = false) => {
    const result = await run(() => call<LiveContextEntriesResult>("sync_live_context_entries", { request: { settings: next } }));
    if (result) {
      setLiveContextEntries(result.entries);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("工具与插件"), result, { silentSuccess: true });
    }
    return result;
  };

  const refreshLogs = async (silent = false) => {
    const result = await run(() => call<LogsResult>("read_latest_logs", { request: { lines: 240 } }));
    if (result) {
      setLogs(result);
      if (!silent) showResultNotice(t("日志已刷新"), result, { silentSuccess: true });
    }
  };

  const refreshDiagnostics = async (silent = false) => {
    const result = await run(() => call<DiagnosticsResult>("copy_diagnostics"));
    if (result) {
      setDiagnostics(result);
      if (!silent) showResultNotice(t("诊断已生成"), result, { silentSuccess: true });
    }
  };

  const refreshWatcher = async (silent = false) => {
    const result = await run(() => call<WatcherResult>("load_watcher_state"));
    if (result) {
      setWatcher(result);
      if (!silent) showResultNotice(t("Watcher 状态"), result, { silentSuccess: true });
    }
  };

  const navigate = async (next: Route) => {
    setRoute(next);
    if (next === "overview") await refreshOverview(true);
    if (next === "relay") {
      await refreshSettings(true);
      await refreshRelay(true);
      await refreshRelayFiles(true);
      await refreshEnvConflicts(true);
      await refreshCcsProviders(true);
      await refreshLocalRelay(true);
    }
    if (next === "sessions") {
      await refreshSettings(true);
      await refreshLocalSessions(true);
      await refreshProviderSyncTargets(true);
    }
    if (next === "context") {
      await refreshSettings(true);
      await refreshRelayFiles(true);
      await refreshLiveContextEntries(true);
    }
    if (next === "settings") await refreshSettings(true);
    if (next === "userScripts") {
      await refreshSettings(true);
      await refreshScriptMarket(true);
    }
    if (next === "about") {
      await refreshOverview(true);
      await refreshLogs(true);
      await refreshDiagnostics(true);
    }
    if (next === "maintenance") {
      await refreshOverview(true);
      await refreshWatcher(true);
    }
  };

  const launch = async () => {
    const result = await launchCommand("launch_codex_plus");
    if (result) {
      showNotice(t("启动任务"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const restart = async () => {
    const result = await launchCommand("restart_codex_plus");
    if (result) {
      showNotice(t("重启 Codex Deck"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const launchCommand = async (command: "launch_codex_plus" | "restart_codex_plus") => {
    const result = await run(() =>
      call<CommandResult<Record<string, unknown>>>(command, {
        request: {
          appPath: launchForm.appPath,
          debugPort: numberOrDefault(launchForm.debugPort, 9229),
          helperPort: numberOrDefault(launchForm.helperPort, 57321),
        },
      }),
    );
    return result;
  };

  const repairPluginMarketplace = async () => {
    if (pluginMarketplaceProgress.active) return;
    setPluginMarketplaceProgress({ active: true, percent: 8, message: t("正在检查本地插件市场…") });
    const progressTimer = window.setInterval(() => {
      setPluginMarketplaceProgress((current) => {
        if (!current.active) return current;
        const nextPercent = Math.min(92, current.percent + 9);
        const message =
          nextPercent < 28
            ? t("正在连接 openai/plugins…")
            : nextPercent < 62
              ? t("正在下载插件市场快照…")
              : nextPercent < 84
                ? t("正在解压并校验插件文件…")
                : t("正在写入 Codex 配置…");
        return { ...current, percent: nextPercent, message };
      });
    }, 500);
    try {
      const result = await run(() => call<PluginMarketplaceRepairResult>("repair_plugin_marketplace"));
      if (result) {
        setPluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: result.message,
        });
        showNotice(t("插件市场修复"), result.message, result.status);
      } else {
        setPluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: t("插件市场修复失败，请查看错误提示后重试。"),
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const refreshRemotePluginMarketplace = async (silent = false) => {
    const result = await run(() => call<RemotePluginMarketplaceResult>("remote_plugin_marketplace_status"));
    if (result) {
      setRemotePluginMarketplace(result);
      if (!silent) {
        setRemotePluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: result.message,
        });
      }
      if (!silent) showNotice(t("官方远端插件缓存"), result.message, result.status);
    }
    return result;
  };

  const repairRemotePluginMarketplace = async () => {
    if (remotePluginMarketplaceProgress.active) return;
    setRemotePluginMarketplaceProgress({
      active: true,
      percent: 18,
      message: t("正在检查内置官方远端插件缓存…"),
    });
    const progressTimer = window.setInterval(() => {
      setRemotePluginMarketplaceProgress((current) => {
        if (!current.active) return current;
        const nextPercent = Math.min(92, current.percent + 18);
        const message =
          nextPercent < 50
            ? t("正在释放内置远端插件快照…")
            : nextPercent < 78
              ? t("正在注册官方远端插件市场…")
              : t("正在刷新官方远端插件缓存状态…");
        return { ...current, percent: nextPercent, message };
      });
    }, 450);
    try {
      const result = await run(() => call<RemotePluginMarketplaceResult>("repair_remote_plugin_marketplace"));
      if (result) {
        setRemotePluginMarketplace(result);
        setRemotePluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: result.message,
        });
        showNotice(t("官方远端插件缓存"), result.message, result.status);
      } else {
        setRemotePluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: t("官方远端插件缓存修复失败，请查看错误提示后重试。"),
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const installEntrypoints = async () => {
    const result = await run(() => call<InstallResult>("install_entrypoints"));
    if (result) {
      showNotice(t("入口安装"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const uninstallEntrypoints = async () => {
    const result = await run(() =>
      call<InstallResult>("uninstall_entrypoints", {
        options: { removeOwnedData },
      }),
    );
    if (result) {
      showNotice(t("入口卸载"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const repairShortcuts = async () => {
    const result = await run(() => call<InstallResult>("repair_shortcuts"));
    if (result) {
      showNotice(t("快捷方式修复"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const watcherAction = async (command: string) => {
    const result = await run(() => call<WatcherResult>(command));
    if (result) {
      setWatcher(result);
      showNotice(t("Watcher 操作"), result.message, result.status);
    }
  };

  const checkUpdate = async (silent = false) => {
    const result = await run(() => call<UpdateResult>("check_update"));
    if (result) {
      setUpdate(result);
      if (!silent || result.updateAvailable) {
        showNotice(t("GitHub Release 检查"), result.message, result.status);
      }
    }
  };

  const performUpdate = async () => {
    if (updateInstallProgress.active) return;
    const release =
      update?.latestVersion && update.assetName && update.assetUrl
        ? {
            version: update.latestVersion,
            url: "",
            body: update.releaseSummary ?? "",
            asset_name: update.assetName,
            asset_url: update.assetUrl,
          }
        : null;
    setUpdateInstallProgress({
      active: true,
      percent: 8,
      message: t("正在准备安装包下载…"),
    });
    const progressTimer = window.setInterval(() => {
      setUpdateInstallProgress((current) => {
        if (!current.active) return current;
        const nextPercent = Math.min(92, current.percent + 10);
        const message =
          nextPercent < 32
            ? t("正在获取 GitHub Release 信息…")
            : nextPercent < 72
              ? t("正在下载安装包…")
              : t("正在启动安装包…");
        return { ...current, percent: nextPercent, message };
      });
    }, 500);
    try {
      const result = await run(() => call<UpdateResult>("perform_update", { release }));
      if (result) {
        setUpdate(result);
        setUpdateInstallProgress({
          active: false,
          percent: result.progress ?? 100,
          message: result.message,
        });
        showNotice(t("更新安装"), result.message, result.status);
      } else {
        setUpdateInstallProgress({
          active: false,
          percent: 100,
          message: t("安装包更新失败，请查看错误提示后重试。"),
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const saveSettings = async () => {
    const next = normalizeSettings(settingsForm);
    const result = await run(() => call<SettingsResult>("save_settings", { settings: next }));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      if (isSuccessStatus(result.status)) await refreshLocalRelay(true);
      showNotice(t("设置保存"), result.message, result.status);
    }
  };

  const saveSettingsValue = async (next: BackendSettings, silent = true) => {
    const normalized = normalizeSettings(next);
    setSettingsForm(normalized);
    const result = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      if (isSuccessStatus(result.status)) await refreshLocalRelay(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("设置保存"), result.message, result.status);
    }
  };

  const resetSettings = async () => {
    const result = await run(() => call<SettingsResult>("reset_settings"));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showNotice(t("设置重置"), result.message, result.status);
    }
  };

  const resetImageOverlaySettings = async () => {
    const result = await run(() => call<SettingsResult>("reset_image_overlay_settings"));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showNotice(t("图片覆盖层"), result.message, result.status);
    }
  };

  const refreshProviderSyncTargets = async (silent = false) => {
    const result = await run(() => call<ProviderSyncTargetsResult>("load_provider_sync_targets"));
    if (result) {
      setProviderSyncTargets(result);
      const targets = result.targets ?? [];
      const saved = settingsForm.providerSyncLastSelectedProvider;
      const preferred =
        targets.find((target) => target.id === saved)?.id ||
        targets.find((target) => target.isCurrentProvider)?.id ||
        targets[0]?.id ||
        "openai";
      setSelectedProviderSyncTarget((current) => (targets.some((target) => target.id === current) ? current : preferred));
      if (!silent && !isSuccessStatus(result.status)) showNotice(t("Provider 同步目标"), result.message, result.status);
    }
    return result;
  };

  const syncProvidersNow = async () => {
    if (providerSyncProgress.active) return;
    setProviderSyncProgress({
      active: true,
      percent: 12,
      message: selectedProviderSyncTarget ? tf("正在同步到 {0}…", [selectedProviderSyncTarget]) : t("正在扫描历史会话与索引…"),
      result: null,
    });
    const progressTimer = window.setInterval(() => {
      setProviderSyncProgress((current) => {
        if (!current.active) return current;
        return {
          ...current,
          percent: Math.min(88, current.percent + 8),
          message: current.percent < 40 ? t("正在检查会话 provider 标记…") : t("正在写入修复与备份…"),
        };
      });
    }, 350);
    try {
      const targetProvider = selectedProviderSyncTarget || undefined;
      const result = await run(() =>
        call<CommandResult<ProviderSyncPayload>>("sync_providers_now", { targetProvider }),
      );
      if (result) {
        let finalResult = result;
        if (isSuccessStatus(result.status)) {
          const preview = await run(() =>
            call<CommandResult<SessionIndexCleanupPreviewPayload>>("preview_session_index_cleanup"),
          );
          if (preview && isSuccessStatus(preview.status) && preview.candidates.length > 0) {
            const selectedIds = await selectSessionIndexCleanupCandidates(preview.candidates);
            if (selectedIds?.length) {
              const cleanup = await run(() =>
                call<CommandResult<SessionIndexCleanupApplyPayload>>("apply_session_index_cleanup", {
                  snapshotSha256: preview.snapshotSha256,
                  threadIds: selectedIds,
                }),
              );
              if (cleanup && isSuccessStatus(cleanup.status)) {
                finalResult = {
                  ...result,
                  prunedSessionIndexEntries: cleanup.prunedEntries ?? 0,
                };
              } else if (cleanup) {
                showNotice(t("清理幽灵任务索引"), cleanup.message, cleanup.status);
              }
            }
          } else if (preview && !isSuccessStatus(preview.status)) {
            showNotice(t("清理幽灵任务索引"), preview.message, preview.status);
          }
        }
        setProviderSyncProgress({
          active: false,
          percent: 100,
          message: providerSyncProgressMessage(finalResult),
          result: finalResult,
        });
        if (targetProvider) {
          const next = {
            ...settingsForm,
            providerSyncLastSelectedProvider: targetProvider,
            providerSyncSavedProviders: Array.from(
              new Set([...(settingsForm.providerSyncSavedProviders ?? []), targetProvider]),
            ).sort(),
          };
          setSettingsForm(next);
        }
        await refreshProviderSyncTargets(true);
        showNotice(t("历史会话修复"), finalResult.message, finalResult.status);
      } else {
        setProviderSyncProgress({
          active: false,
          percent: 100,
          message: t("历史会话修复失败，请查看错误提示后重试。"),
          result: null,
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const applyRelayInjection = async (silent = false) => {
    const settingsResult = await run(() => call<SettingsResult>("save_settings", { settings: settingsForm }));
    if (settingsResult) {
      setSettings(settingsResult);
      setSettingsForm(normalizeSettings(settingsResult.settings));
      if (!isSuccessStatus(settingsResult.status)) {
        showNotice(t("设置保存"), settingsResult.message, settingsResult.status);
        return false;
      }
    } else {
      return false;
    }
    const result = await run(() => call<RelayResult>("apply_relay_injection"));
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("官方混入 API Key"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && result.configured;
  };

  const saveLaunchMode = async (launchMode: LaunchMode, silent = false, baseSettings: BackendSettings = settingsForm) => {
    const next = { ...baseSettings, launchMode };
    setSettingsForm(next);
    const result = await run(() => call<SettingsResult>("save_settings", { settings: next }));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      if (!silent) showNotice(t("Codex 增强模式"), result.message, result.status);
    }
    return result;
  };

  const applyPureApiInjection = async (silent = false) => {
    const settingsResult = await run(() => call<SettingsResult>("save_settings", { settings: settingsForm }));
    if (settingsResult) {
      setSettings(settingsResult);
      setSettingsForm(normalizeSettings(settingsResult.settings));
      if (!isSuccessStatus(settingsResult.status)) {
        showNotice(t("设置保存"), settingsResult.message, settingsResult.status);
        return false;
      }
    } else {
      return false;
    }
    const result = await run(() => call<RelayResult>("apply_pure_api_injection"));
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("纯 API 模式"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && result.configured;
  };

  const clearRelayInjection = async (silent = false) => {
    const result = await run(() => call<RelayResult>("clear_relay_injection"));
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("官方登录模式"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && !result.configured;
  };

  const saveRelayFile = async (kind: "config" | "auth", contents: string, silent = false) => {
    const result = await run(() => call<RelayFilesResult>("save_relay_file", { request: { kind, contents } }));
    if (result) {
      setRelayFiles(result);
      if (!silent || !isSuccessStatus(result.status)) {
        showNotice(kind === "config" ? "config.toml" : "auth.json", result.message, result.status);
      }
      await refreshSettings(true);
      await refreshRelay(true);
    }
  };

  const upsertContextEntry = async (next: BackendSettings, kind: ContextKind, id: string, tomlBody: string) => {
    const result = await run(() =>
      call<ContextEntriesResult>("upsert_context_entry", {
        request: { settings: next, kind, id, tomlBody },
      }),
    );
    if (!result) return null;
    let normalized = normalizeSettings(result.settings);
    const saveResult = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (saveResult) {
      setSettings(saveResult);
      normalized = normalizeSettings(saveResult.settings);
    }
    setSettingsForm(normalized);
    if (!isSuccessStatus(result.status)) showResultNotice(t("工具与插件"), result);
    return normalized;
  };

  const deleteContextEntry = async (next: BackendSettings, kind: ContextKind, id: string) => {
    const result = await run(() =>
      call<ContextEntriesResult>("delete_context_entry", {
        request: { settings: next, kind, id },
      }),
    );
    if (!result) return null;
    let normalized = normalizeSettings(result.settings);
    const saveResult = await run(() => call<SettingsResult>("save_settings", { settings: normalized }));
    if (saveResult) {
      setSettings(saveResult);
      normalized = normalizeSettings(saveResult.settings);
    }
    setSettingsForm(normalized);
    if (!isSuccessStatus(result.status)) showResultNotice(t("工具与插件"), result);
    return normalized;
  };

  const extractRelayCommonConfig = async (configContents: string) => {
    const result = await run(() =>
      call<ExtractRelayCommonConfigResult>("extract_relay_common_config", {
        request: { configContents },
      }),
    );
    if (result) showResultNotice(t("通用配置文件"), result);
    return result && isSuccessStatus(result.status) ? result : null;
  };

  const testRelayProfile = async (profile: RelayProfile) => {
    const result = await run(() => call<RelayProfileTestResult>("test_relay_profile", { profile }));
    if (result) showNotice(t("供应商测试"), result.message, result.status);
  };

  const measureRelayLatency = async (url: string) => {
    return await run(() => call<RelayLatencyResult>("measure_relay_latency", { url }));
  };

  const diagnoseRelayProfile = async (profile: RelayProfile) => {
    const result = await run(() => call<ProviderDoctorResult>("diagnose_relay_profile", { profile }));
    if (result) showNotice("Provider Doctor", result.message, result.status);
    return result ?? null;
  };

  const testStepwiseSettings = async (settings: BackendSettings) => {
    const result = await run(() => call<StepwiseTestResult>("test_stepwise_settings", { settings }));
    if (result) showNotice("Stepwise 测试", result.message, result.status);
  };

  const fetchRelayProfileModels = async (profile: RelayProfile) => {
    const result = await run(() => call<RelayProfileModelsResult>("fetch_relay_profile_models", { profile }));
    if (result) showNotice(t("模型列表"), result.message, result.status);
    return result && isSuccessStatus(result.status) ? result.models : null;
  };

  const switchOfficialMode = async () => {
    const switched = await clearRelayInjection(true);
    if (!switched) return;
    const result = await saveLaunchMode("relay", true);
    if (result) showNotice(t("官方登录模式"), t("已切回官方登录；Codex 增强已设为兼容增强。"), result.status);
  };

  const switchPureApiMode = async () => {
    const switched = await applyPureApiInjection(true);
    if (!switched) return;
    const result = await saveLaunchMode("patch", true);
    if (result) showNotice(t("纯 API 模式"), t("已切换到纯 API；Codex 增强已设为完整增强。"), result.status);
  };

  const switchRelayProfile = async (next: BackendSettings, previousActiveRelayId = settingsForm.activeRelayId) => {
    if (relaySwitching) {
      showNotice(t("供应商切换中"), t("上一次切换还没有完成，请稍后再试。"), "failed");
      return;
    }
    let switchSettings = normalizeSettings(next);
    if (!switchSettings.relayProfilesEnabled) {
      showNotice(t("供应商配置已关闭"), t("当前不会写入 Codex config.toml / auth.json。打开供应商配置总开关后再切换。"), "failed");
      return;
    }
    const targetBeforeSnapshot = activeRelayProfile(switchSettings);
    logDiagnostic("switchRelayProfile.start", {
      currentRelayId: settingsForm.activeRelayId,
      targetRelayId: switchSettings.activeRelayId,
      targetRelayName: targetBeforeSnapshot.name,
      targetRelayMode: targetBeforeSnapshot.relayMode,
    });
    const selectedBeforeSave = activeRelayProfile(switchSettings);
    const validationError = relayProfileSwitchValidation(selectedBeforeSave);
    if (validationError) {
      logDiagnostic("switchRelayProfile.validation_failed", {
        targetRelayId: selectedBeforeSave.id,
        targetRelayName: selectedBeforeSave.name,
        error: validationError,
      });
      showNotice(t("供应商配置可能不正确"), validationError, "failed");
      return;
    }
    if (!localRelay?.settings.enabled) {
      switchSettings = await snapshotActiveRelayFilesBeforeSwitch(switchSettings, previousActiveRelayId);
    }
    const selectedAfterSave = activeRelayProfile(switchSettings);
    const command = relayProfileSwitchCommand(selectedAfterSave);

    logDiagnostic("switchRelayProfile.apply_start", {
      targetRelayId: selectedAfterSave.id,
      targetRelayName: selectedAfterSave.name,
      previousActiveRelayId,
      command,
    });
    setRelaySwitching(true);
    try {
      const result = await run(() =>
        call<RelaySwitchResult>("switch_relay_profile", {
          request: { settings: switchSettings, previousActiveRelayId },
        }),
      );
      if (!result) {
        logDiagnostic("switchRelayProfile.apply_no_result", {
          targetRelayId: selectedAfterSave.id,
        });
        return;
      }
      const selectedSettings = normalizeSettings(result.settings);
      setSettings({
        status: result.status,
        message: result.message,
        settings: selectedSettings,
        settings_path: result.settingsPath,
        user_scripts: result.user_scripts as UserScriptInventory,
      });
      setSettingsForm(selectedSettings);
      setRelay({
        status: result.status,
        message: result.message,
        ...result.relay,
      });
      await refreshRelayFiles(true);
      if (!isSuccessStatus(result.status)) {
        logDiagnostic("switchRelayProfile.apply_failed", {
          targetRelayId: selectedAfterSave.id,
          status: result.status,
          message: result.message,
          activeRelayId: selectedSettings.activeRelayId,
        });
        showNotice(t("供应商切换"), result.message, result.status);
        return;
      }
      const currentSelected = activeRelayProfile(selectedSettings);
      logDiagnostic("switchRelayProfile.ok", {
        targetRelayId: currentSelected.id,
        launchMode: selectedSettings.launchMode,
        status: result.status,
      });
    } finally {
      setRelaySwitching(false);
    }
  };

  const snapshotActiveRelayFilesBeforeSwitch = async (
    next: BackendSettings,
    previousActiveRelayId: string,
  ): Promise<BackendSettings> => {
    const profileId = previousActiveRelayId.trim();
    if (!profileId) return next;
    const result = await run(() =>
      call<SettingsBackfillResult>("backfill_relay_profile_from_live", {
        request: { settings: next, profileId },
      }),
    );
    if (!result) return next;
    const normalized = normalizeSettings(result.settings);
    if (!isSuccessStatus(result.status)) {
      showNotice(t("供应商切换"), result.message, result.status);
      return next;
    }
    return normalized;
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      showNotice(t("复制失败"), stringifyError(error), "failed");
    }
  };

  const openExternalUrl = async (url: string) => {
    const result = await run(() => call<CommandResult<Record<string, unknown>>>("open_external_url", { url }));
    if (result) {
      showResultNotice(t("打开链接"), result, { silentSuccess: true });
    }
  };

  const showNotice = (title: string, message: string, status?: Status) => {
    setNotice({ title, message: t(message), status });
  };

  const exitManagerApp = async () => {
    await call<void>("manager_exit_app");
  };

  const hideManagerToTray = async () => {
    await call<void>("manager_hide_to_tray");
  };

  const showResultNotice = (
    title: string,
    result: Pick<CommandResult<unknown>, "message" | "status">,
    options: { silentSuccess?: boolean } = {},
  ) => {
    if (options.silentSuccess && isSuccessStatus(result.status)) return;
    showNotice(title, result.message, result.status);
  };

  useEffect(() => {
    void (async () => {
      const startup = await run(() => call<StartupResult>("startup_options"));
      if (startup?.showUpdate) {
        setRoute("about");
        void checkUpdate(false);
      } else {
        void checkUpdate(true);
      }
      await refreshOverview(true);
      await refreshSettings(true);
      await refreshRelay(true);
      await refreshRelayFiles(true);
      await refreshLocalRelay(true);
      await refreshEnvConflicts(true);
      await refreshProviderSyncTargets(true);
      await refreshPendingProviderImport(true);
      await refreshRemotePluginMarketplace(true);
    })();
  }, []);

  useEffect(() => {
    if (getLanguage() === "en") {
      void invoke("update_tray_labels", {
        showLabel: "Show window",
        quitLabel: "Quit",
        windowTitle: "Codex Deck",
      });
    }
  }, []);

  useEffect(() => {
    if (!settingsForm.relayProfilesEnabled) {
      setPendingProviderImport(null);
      return;
    }
    const timer = window.setInterval(() => {
      void refreshPendingProviderImport(true);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [settingsForm.relayProfilesEnabled]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("codex-plus-theme", theme);
  }, [theme]);

  const saveCodexAppPath = async (appPath: string) => {
    const next = { ...settingsForm, codexAppPath: appPath };
    const result = await run(() => call<SettingsResult>("save_settings", { settings: next }));
    if (result) {
      setSettings(result);
      const normalized = normalizeSettings(result.settings);
      setSettingsForm(normalized);
      setLaunchForm((current) => ({ ...current, appPath: normalized.codexAppPath }));
      await refreshOverview(true);
    }
    return result;
  };

  const actions = useMemo(
    () => ({
      refreshCurrent: () => navigate(route),
      launch,
      restart,
      repairPluginMarketplace,
      refreshRemotePluginMarketplace,
      repairRemotePluginMarketplace,
      installEntrypoints,
      uninstallEntrypoints,
      repairShortcuts,
      checkUpdate,
      performUpdate,
      saveSettings,
      saveSettingsValue,
      refreshSettings,
      resetSettings,
      resetImageOverlaySettings,
      chooseCodexAppPath: async (mode: "folder" | "file") => {
        let selected: unknown;
        try {
          selected = await open(
            mode === "folder"
              ? { directory: true, multiple: false, title: t("选择 Codex 应用目录") }
              : {
                  directory: false,
                  multiple: false,
                  title: t("选择 Codex.exe 或 Codex.app"),
                  filters: [{ name: t("Codex 应用"), extensions: ["exe", "app"] }],
                },
          );
        } catch (error) {
          // Surface plugin failures (e.g. missing capability permission) so the
          // buttons no longer appear unresponsive — see #345.
          const message = error instanceof Error ? error.message : String(error);
          showNotice(t("Codex 应用路径"), tf("打开选择器失败：{0}", [message]), "failed");
          return;
        }
        if (typeof selected === "string" && selected.trim()) {
          const result = await saveCodexAppPath(selected.trim());
          if (result) {
            showNotice(t("Codex 应用路径"), t("应用路径已保存，之后启动会自动复用。"), result.status);
          }
        }
      },
      clearCodexAppPath: async () => {
        const next = { ...settingsForm, codexAppPath: "" };
        const result = await run(() => call<SettingsResult>("save_settings", { settings: next }));
        if (result) {
          setSettings(result);
          setSettingsForm(normalizeSettings(result.settings));
          setLaunchForm((current) => ({ ...current, appPath: "" }));
          showNotice(t("Codex 应用路径"), t("已清除保存路径，后续启动会回到自动探测。"), result.status);
          await refreshOverview(true);
        }
      },
      chooseImageOverlayPath: async () => {
        let selected: unknown;
        try {
          selected = await open({
            directory: false,
            multiple: false,
            title: t("选择覆盖图片"),
            filters: [{ name: t("图片"), extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          showNotice(t("图片覆盖层"), tf("打开选择器失败：{0}", [message]), "failed");
          return;
        }
        if (typeof selected === "string" && selected.trim()) {
          setSettingsForm((current) => ({
            ...current,
            codexAppImageOverlayEnabled: true,
            codexAppImageOverlayPath: selected.trim(),
          }));
        }
      },
      saveManualCodexAppPath: async () => {
        const appPath = launchForm.appPath.trim();
        if (!appPath) {
          showNotice(t("Codex 应用路径"), t("请先填写或选择应用路径。"), "failed");
          return;
        }
        const result = await saveCodexAppPath(appPath);
        if (result) {
          showNotice(t("Codex 应用路径"), t("应用路径已保存，之后启动会自动复用。"), result.status);
        }
      },
      syncProvidersNow,
      refreshProviderSyncTargets,
      setProviderSyncTarget: (provider: string) => {
        setSelectedProviderSyncTarget(provider);
        setSettingsForm((current) => ({ ...current, providerSyncLastSelectedProvider: provider }));
      },
      setLaunchMode: async (launchMode: LaunchMode) => {
        await saveLaunchMode(launchMode);
      },
      refreshRelay,
      refreshRelayFiles,
      refreshLocalRelay,
      startLocalRelay,
      stopLocalRelay,
      regenerateLocalRelayKey,
      startCodexOAuthLogin,
      pollCodexOAuthLogin,
      importLocalCodexOAuth,
      refreshEnvConflicts,
      removeEnvConflicts,
      refreshCcsProviders,
      importCcsProviders,
      previewLegacyImport,
      prepareLegacyImportTransaction,
      applyLegacyImportTransaction,
      rollbackLegacyImportTransaction,
      refreshLiveContextEntries,
      syncLiveContextEntries,
      refreshScriptMarket,
      installMarketScript,
      setUserScriptEnabled,
      deleteUserScript,
      refreshLocalSessions,
      deleteLocalSession,
      deleteLocalSessions,
      openExternalUrl,
      applyRelayInjection,
      applyPureApiInjection,
      clearRelayInjection,
      saveRelayFile,
      upsertContextEntry,
      deleteContextEntry,
      extractRelayCommonConfig,
      testRelayProfile,
      measureRelayLatency,
      diagnoseRelayProfile,
      testStepwiseSettings,
      fetchRelayProfileModels,
      switchRelayProfile,
      relaySwitching,
      switchOfficialMode,
      switchPureApiMode,
      refreshLogs,
      refreshDiagnostics,
      showMessage: async (title: string, message: string, status?: Status) => showNotice(title, message, status),
      copyLogs: () => copyText(logs?.text ?? "", t("日志已复制。")),
      copyDiagnostics: () => copyText(diagnostics?.report ?? "", t("诊断报告已复制。")),
      goLogs: () => navigate("about"),
      checkHealth: async () => {
        await refreshOverview(true);
        await refreshRelay(true);
        await refreshWatcher(true);
        showNotice(t("检查完成"), t("已刷新 Codex 应用、入口和 Watcher 状态。"), "ok");
      },
      installWatcher: () => watcherAction("install_watcher"),
      uninstallWatcher: () => watcherAction("uninstall_watcher"),
      enableWatcher: () => watcherAction("enable_watcher"),
      disableWatcher: () => watcherAction("disable_watcher"),
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [route, launchForm, settingsForm, settings, removeOwnedData, update, updateInstallProgress.active, logs, diagnostics, theme, relayFiles, localRelay, localSessions, selectedProviderSyncTarget, envConflicts, ccsProviders],
  );
  const hasUpdate = update?.updateAvailable === true;

  return (
    <div className={`shell console-v2 ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img alt="" aria-hidden="true" src={codexDeckLogo} />
          </div>
          <div className="brand-copy">
            <div className="brand-title-row">
              <div className="brand-title">Codex Deck</div>
              {hasUpdate ? (
                <button
                  className="update-dot"
                  onClick={() => {
                    setRoute("about");
                    void checkUpdate(false);
                  }}
                  title={tf("发现新版本 {0}", [update?.latestVersion ?? ""])}
                  type="button"
                >
                  <CircleArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="brand-subtitle">{t("Codex 管理控制台")}</div>
          </div>
        </div>
        <nav aria-label={t("主导航")} className="nav">
          {routeGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((routeId) => {
                const item = routes.find((candidate) => candidate.id === routeId);
                if (!item) return null;
                const Icon = item.icon;
                return (
                  <button
                    aria-current={route === item.id ? "page" : undefined}
                    className={`nav-item ${route === item.id ? "active" : ""}`}
                    key={item.id}
                    onClick={() => void navigate(item.id)}
                    title={item.label}
                    type="button"
                  >
                    <span className="nav-icon">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="nav-label">{item.label}</span>
                    {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-status" title={overview?.current_version ?? t("等待状态检查")}>
          <span className={`sidebar-status-dot ${overview?.codex_version ? "online" : ""}`} aria-hidden="true" />
          <div>
            <strong>{overview?.codex_version ? t("Codex Deck 已就绪") : t("等待状态检查")}</strong>
            <small>{overview?.current_version ?? t("正在连接本机 Codex")}</small>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar" key={`topbar-${route}`}>
          <div>
            <h1>{routeTitle(route)}</h1>
            <p>{routeSubtitle(route)}</p>
          </div>
          <div className="topbar-actions">
            <Button
              aria-label={getLanguage() === "en" ? t("切换到中文") : t("切换到英文")}
              onClick={() => toggleLanguage()}
              size="icon"
              title={getLanguage() === "en" ? t("切换到中文") : t("切换到英文")}
              variant="outline"
            >
              <Languages className="h-4 w-4" />
            </Button>
            <Button
              aria-label={theme === "dark" ? t("切换到浅色") : t("切换到深色")}
              onClick={actions.toggleTheme}
              size="icon"
              title={theme === "dark" ? t("切换到浅色") : t("切换到深色")}
              variant="outline"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button onClick={() => void actions.restart()} title={t("重启 Codex Deck")} variant="outline">
              <Rocket className="h-4 w-4" />
              {t("重启 Codex Deck")}
            </Button>
            <Button
              aria-label={t("刷新当前页面")}
              onClick={() => void actions.refreshCurrent()}
              size="icon"
              title={t("刷新当前页面")}
              variant="outline"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <section className="screen" key={route}>
          {route === "overview" ? (
            <OverviewScreen
              overview={overview}
              pluginMarketplaceProgress={pluginMarketplaceProgress}
              actions={actions}
            />
          ) : null}
          {route === "relay" ? (
            <RelayScreen
              settings={settings}
              relayFiles={relayFiles}
              localRelay={localRelay}
              envConflicts={envConflicts}
              ccsProviders={ccsProviders}
              form={settingsForm}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "sessions" ? (
            <SessionsScreen
              settings={settings}
              form={settingsForm}
              sessions={localSessions}
              providerSyncProgress={providerSyncProgress}
              providerSyncTargets={providerSyncTargets}
              selectedProviderSyncTarget={selectedProviderSyncTarget}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "context" ? (
            <ContextScreen
              form={settingsForm}
              liveEntries={liveContextEntries}
              relayFiles={relayFiles}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "enhance" ? (
            <EnhanceScreen
              form={settingsForm}
              pluginMarketplaceProgress={pluginMarketplaceProgress}
              remotePluginMarketplace={remotePluginMarketplace}
              remotePluginMarketplaceProgress={remotePluginMarketplaceProgress}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "userScripts" ? <UserScriptsScreen settings={settings} market={scriptMarket} actions={actions} /> : null}
          {route === "maintenance" ? (
            <MaintenanceScreen
              overview={overview}
              watcher={watcher}
              settings={settings}
              launchForm={launchForm}
              onLaunchFormChange={setLaunchForm}
              removeOwnedData={removeOwnedData}
              onRemoveOwnedDataChange={setRemoveOwnedData}
              actions={actions}
            />
          ) : null}
          {route === "about" ? (
            <AboutScreen
              overview={overview}
              update={update}
              updateInstallProgress={updateInstallProgress}
              logs={logs}
              diagnostics={diagnostics}
              actions={actions}
            />
          ) : null}
          {route === "settings" ? (
            <SettingsScreen settings={settings} theme={theme} form={settingsForm} onFormChange={setSettingsForm} actions={actions} />
          ) : null}
        </section>
      </main>
      {notice ? (
        <NoticeDialog
          key={`${notice.title}-${notice.message}-${notice.status ?? ""}`}
          notice={notice}
          onClose={() => setNotice(null)}
        />
      ) : null}
      {confirmDialog ? (
        <ConfirmDialog
          confirm={confirmDialog}
          onCancel={() => {
            confirmDialog.resolve(false);
            setConfirmDialog(null);
          }}
          onConfirm={() => {
            confirmDialog.resolve(true);
            setConfirmDialog(null);
          }}
        />
      ) : null}
      {sessionIndexCleanupDialog ? (
        <SessionIndexCleanupDialog
          request={sessionIndexCleanupDialog}
          onCancel={() => {
            sessionIndexCleanupDialog.resolve(null);
            setSessionIndexCleanupDialog(null);
          }}
          onConfirm={(selectedIds) => {
            sessionIndexCleanupDialog.resolve(selectedIds);
            setSessionIndexCleanupDialog(null);
          }}
        />
      ) : null}
      {pendingProviderImport ? (
        <PendingProviderImportDialog
          request={pendingProviderImport}
          onConfirm={() => void confirmPendingProviderImport()}
          onDismiss={() => void dismissPendingProviderImport()}
        />
      ) : null}
    </div>
  );
}

type Actions = {
  refreshCurrent: () => Promise<void>;
  launch: () => Promise<void>;
  restart: () => Promise<void>;
  repairPluginMarketplace: () => Promise<void>;
  refreshRemotePluginMarketplace: (silent?: boolean) => Promise<RemotePluginMarketplaceResult | null>;
  repairRemotePluginMarketplace: () => Promise<void>;
  installEntrypoints: () => Promise<void>;
  uninstallEntrypoints: () => Promise<void>;
  repairShortcuts: () => Promise<void>;
  checkUpdate: () => Promise<void>;
  performUpdate: () => Promise<void>;
  saveSettings: () => Promise<void>;
  saveSettingsValue: (settings: BackendSettings, silent?: boolean) => Promise<void>;
  refreshSettings: (silent?: boolean) => Promise<BackendSettings | null>;
  resetSettings: () => Promise<void>;
  resetImageOverlaySettings: () => Promise<void>;
  chooseCodexAppPath: (mode: "folder" | "file") => Promise<void>;
  clearCodexAppPath: () => Promise<void>;
  chooseImageOverlayPath: () => Promise<void>;
  saveManualCodexAppPath: () => Promise<void>;
  syncProvidersNow: () => Promise<void>;
  refreshProviderSyncTargets: (silent?: boolean) => Promise<ProviderSyncTargetsResult | null>;
  setProviderSyncTarget: (provider: string) => void;
  setLaunchMode: (launchMode: LaunchMode) => Promise<void>;
  refreshRelay: () => Promise<void>;
  refreshRelayFiles: (silent?: boolean) => Promise<RelayFilesResult | null>;
  refreshLocalRelay: (silent?: boolean) => Promise<LocalRelayResult | null>;
  startLocalRelay: (settings: LocalRelaySettings) => Promise<LocalRelayResult | null>;
  stopLocalRelay: () => Promise<LocalRelayResult | null>;
  regenerateLocalRelayKey: () => Promise<LocalRelayResult | null>;
  startCodexOAuthLogin: () => Promise<OAuthLoginResult | null>;
  pollCodexOAuthLogin: (loginId: string) => Promise<OAuthProfileResult | null>;
  importLocalCodexOAuth: () => Promise<OAuthProfileResult | null>;
  refreshEnvConflicts: (silent?: boolean) => Promise<EnvConflictsResult | null>;
  removeEnvConflicts: (names: string[]) => Promise<void>;
  refreshCcsProviders: (silent?: boolean) => Promise<CcsProvidersResult | null>;
  importCcsProviders: () => Promise<void>;
  previewLegacyImport: (sourcePath: string) => Promise<LegacyImportPreviewResult | null>;
  prepareLegacyImportTransaction: (sourcePath: string, selectedItemIds: string[]) => Promise<LegacyImportPrepareResult | null>;
  applyLegacyImportTransaction: (transactionRoot: string) => Promise<LegacyImportApplyCommandResult | null>;
  rollbackLegacyImportTransaction: (transactionRoot: string) => Promise<LegacyImportRollbackCommandResult | null>;
  refreshLiveContextEntries: (silent?: boolean) => Promise<LiveContextEntriesResult | null>;
  syncLiveContextEntries: (settings: BackendSettings, silent?: boolean) => Promise<LiveContextEntriesResult | null>;
  refreshScriptMarket: () => Promise<void>;
  installMarketScript: (id: string) => Promise<void>;
  setUserScriptEnabled: (key: string, enabled: boolean) => Promise<void>;
  deleteUserScript: (key: string) => Promise<void>;
  refreshLocalSessions: () => Promise<LocalSessionsResult | null>;
  deleteLocalSession: (session: LocalSession) => Promise<void>;
  deleteLocalSessions: (sessions: LocalSession[]) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  applyRelayInjection: () => Promise<boolean>;
  applyPureApiInjection: () => Promise<boolean>;
  clearRelayInjection: () => Promise<boolean>;
  saveRelayFile: (kind: "config" | "auth", contents: string, silent?: boolean) => Promise<void>;
  upsertContextEntry: (
    settings: BackendSettings,
    kind: ContextKind,
    id: string,
    tomlBody: string,
  ) => Promise<BackendSettings | null>;
  deleteContextEntry: (settings: BackendSettings, kind: ContextKind, id: string) => Promise<BackendSettings | null>;
  extractRelayCommonConfig: (configContents: string) => Promise<ExtractRelayCommonConfigResult | null>;
  testRelayProfile: (profile: RelayProfile) => Promise<void>;
  measureRelayLatency: (url: string) => Promise<RelayLatencyResult | null>;
  diagnoseRelayProfile: (profile: RelayProfile) => Promise<ProviderDoctorResult | null>;
  testStepwiseSettings: (settings: BackendSettings) => Promise<void>;
  fetchRelayProfileModels: (profile: RelayProfile) => Promise<string[] | null>;
  switchRelayProfile: (settings: BackendSettings, previousActiveRelayId?: string) => Promise<void>;
  relaySwitching: boolean;
  switchOfficialMode: () => Promise<void>;
  switchPureApiMode: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  showMessage: (title: string, message: string, status?: Status) => Promise<void>;
  copyLogs: () => Promise<void>;
  copyDiagnostics: () => Promise<void>;
  goLogs: () => Promise<void>;
  installWatcher: () => Promise<void>;
  uninstallWatcher: () => Promise<void>;
  enableWatcher: () => Promise<void>;
  disableWatcher: () => Promise<void>;
  toggleTheme: () => void;
  checkHealth: () => Promise<void>;
};

function OverviewScreen({
  overview,
  pluginMarketplaceProgress,
  actions,
}: {
  overview: OverviewResult | null;
  pluginMarketplaceProgress: TaskProgress;
  actions: Actions;
}) {
  const health = healthItems(overview);
  const shortcutsReady = overview?.silent_shortcut.status === "installed" ? 1 : 0;
  const allHealthy = Boolean(overview?.codex_version) && health.every((item) => item.ok);
  const issueCount = health.filter((item) => !item.ok).length + (overview?.codex_version ? 0 : 1);
  const orderedHealth = [...health].sort((left, right) => Number(left.ok) - Number(right.ok));
  return (
    <div className="deck-page overview-deck-page">
      <section className={`overview-status-band ${allHealthy ? "ready" : "attention"}`} aria-labelledby="system-status-heading">
        <div className="overview-status-copy">
          <span className="overview-status-icon" aria-hidden="true">
            {allHealthy ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </span>
          <div>
            <h2 id="system-status-heading">{t("系统状态")}</h2>
            <p>{allHealthy ? t("全部关键状态正常") : tf("发现 {0} 个需要处理的状态", [issueCount])}</p>
          </div>
        </div>
        <div className="overview-status-actions">
          <Button onClick={() => void actions.checkHealth()} variant="outline">
            <RefreshCw className="h-4 w-4" />
            {t("重新检查")}
          </Button>
          <Button onClick={() => void actions.launch()}>
            <Rocket className="h-4 w-4" />
            {t("启动 Codex")}
          </Button>
        </div>
      </section>

      <section className="overview-summary" aria-label={t("运行状态概览")}>
        <div className="overview-section-head">
          <div>
            <h2>{t("运行概览")}</h2>
            <p>{t("版本、应用、入口和最近启动状态")}</p>
          </div>
          <Badge status={allHealthy ? "ok" : overview ? "missing" : "not_checked"} />
        </div>
        <div className="dashboard-metrics">
          <DashboardMetric
            icon={Gauge}
            label={t("Codex 版本")}
            status={overview?.codex_version ? "ok" : "not_checked"}
            value={overview?.codex_version ?? t("未检测到")}
          />
          <DashboardMetric
            icon={AppWindow}
            label={t("Codex 应用")}
            status={overview?.codex_app.status ?? "not_checked"}
            tone="green"
            value={statusLabel(overview?.codex_app.status ?? "not_checked")}
          />
          <DashboardMetric
            icon={PanelTopOpen}
            label={t("快捷入口")}
            status={shortcutsReady === 1 ? "installed" : overview ? "missing" : "not_checked"}
            value={`${shortcutsReady} / 1`}
          />
          <DashboardMetric
            icon={Rocket}
            label={t("最近启动")}
            status={overview?.latest_launch?.status ?? "not_checked"}
            tone="amber"
            value={overview?.latest_launch?.status ? statusLabel(overview.latest_launch.status) : t("暂无记录")}
          />
        </div>
      </section>

      <div className="overview-main-grid">
        <Panel className="overview-health-panel">
          <CardHead title={t("需要关注")} detail={issueCount ? tf("{0} 个状态等待处理", [issueCount]) : t("当前没有阻塞项")} />
          <CardContent>
            <div className="health-grid">
              {orderedHealth.map((item) => (
                <div className={`health-item ${item.ok ? "ok" : "needs-fix"}`} key={item.title}>
                  {item.ok ? <CheckCircle2 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <Badge status={item.status} />
                </div>
              ))}
            </div>
            <Toolbar>
              <Button onClick={() => void actions.checkHealth()} variant="outline">
                <RefreshCw className="h-4 w-4" />
                {t("重新检查")}
              </Button>
              <Button disabled={pluginMarketplaceProgress.active} variant="outline" onClick={() => void actions.repairPluginMarketplace()}>
                {pluginMarketplaceProgress.active ? t("正在修复…") : t("修复插件市场")}
              </Button>
            </Toolbar>
            <TaskProgressBox progress={pluginMarketplaceProgress} title={t("插件市场修复进度")} />
          </CardContent>
        </Panel>
        <Panel className="overview-launch-panel">
          <CardHead title={t("最近启动")} detail={overview?.latest_launch ? formatTime(overview.latest_launch.started_at_ms) : t("暂无启动状态")} />
          <CardContent>
            <LatestLaunch status={overview?.latest_launch ?? null} />
            <Toolbar>
              <Button variant="outline" onClick={() => void actions.goLogs()}>
                {t("查看日志与诊断")}
              </Button>
            </Toolbar>
          </CardContent>
        </Panel>
      </div>

      <div className="overview-command-bar">
        <div>
          {allHealthy ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4" aria-hidden="true" />}
          <span>{allHealthy ? t("Codex Deck 已准备就绪") : t("建议先处理异常状态再启动 Codex")}</span>
        </div>
        <Toolbar>
          <Button variant="outline" onClick={() => void actions.repairShortcuts()}>
            <Wrench className="h-4 w-4" />
            {t("修复入口")}
          </Button>
          <Button variant="secondary" onClick={() => void actions.goLogs()}>
            <FileCode2 className="h-4 w-4" />
            {t("日志与诊断")}
          </Button>
        </Toolbar>
      </div>
    </div>
  );
}

function DashboardMetric({
  icon: Icon,
  label,
  status,
  tone = "blue",
  value,
}: {
  icon: LucideIcon;
  label: string;
  status: string;
  tone?: "blue" | "green" | "amber";
  value: string;
}) {
  return (
    <div className="dashboard-metric">
      <span className={`dashboard-metric-icon ${tone}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Badge status={status} />
    </div>
  );
}

function RelayScreen({
  settings: _settings,
  relayFiles,
  localRelay,
  envConflicts,
  ccsProviders,
  form,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  relayFiles: RelayFilesResult | null;
  localRelay: LocalRelayResult | null;
  envConflicts: EnvConflictsResult | null;
  ccsProviders: CcsProvidersResult | null;
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const normalized = normalizeSettings(form);
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<RelayWorkspaceSection>("providers");
  const [newProfileDraft, setNewProfileDraft] = useState<RelayProfile | null>(null);
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [oauthDialogOpen, setOAuthDialogOpen] = useState(false);
  const [thirdPartyImportOpen, setThirdPartyImportOpen] = useState(false);
  const [relaySearch, setRelaySearch] = useState("");
  const [relayListView, setRelayListView] = useState<RelayListView>("grid");
  const [relayListSort, setRelayListSort] = useState<RelayListSort>("manual");
  const relayProfilesForDisplay = useMemo(() => {
    const query = relaySearch.trim().toLocaleLowerCase();
    const profiles = normalized.relayProfiles.filter((profile) => {
      if (isAggregateRelayProfile(profile)) return false;
      if (!query) return true;
      return [
        profile.name,
        profile.baseUrl,
        profile.upstreamBaseUrl,
        relayModeLabel(profile.relayMode),
        relayProtocolLabel(profile.protocol),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
    if (relayListSort === "name") {
      profiles.sort((left, right) => (left.name || t("未命名供应商")).localeCompare(right.name || t("未命名供应商"), getLanguage() === "zh" ? "zh-CN" : "en"));
    }
    return profiles;
  }, [normalized.relayProfiles, relayListSort, relaySearch]);
  const relayReorderEnabled = relayListSort === "manual" && !relaySearch.trim();
  const detailProfile = newProfileDraft || (detailProfileId
    ? normalized.relayProfiles.find((profile) => profile.id === detailProfileId) || null
    : null);
  const isNewProfile = !!newProfileDraft;
  const saveRelaySettings = async (next: BackendSettings) => {
    onFormChange(next);
    await actions.saveSettingsValue(next, true);
  };
  const editRelayProfile = async (profileId: string) => {
    setNewProfileDraft(null);
    setDetailProfileId(
      normalized.relayProfiles.some((item) => item.id === profileId) ? profileId : null,
    );
  };
  useEffect(() => {
    if (!newProfileDraft && detailProfileId && !normalized.relayProfiles.some((profile) => profile.id === detailProfileId)) {
      setDetailProfileId(null);
    }
  }, [detailProfileId, newProfileDraft, normalized.relayProfiles]);
  useEffect(() => {
    if (!newProfileDraft && detailProfileId === normalized.activeRelayId) {
      void actions.refreshRelayFiles();
    }
  }, [detailProfileId, newProfileDraft, normalized.activeRelayId]);
  const openThirdPartyImport = () => {
    setThirdPartyImportOpen((open) => !open);
    if (!ccsProviders) void actions.refreshCcsProviders(true);
  };

  const localRelayEnabled = localRelay?.settings.enabled === true;
  const workspaceTabs = (
    <nav aria-label={t("Codex 本地管理")} className="deck-tabs relay-workspace-tabs" role="tablist">
      {([
        ["providers", t("供应商"), KeyRound],
        ["localRelay", t("本地中转"), Workflow],
        ["localFiles", t("本机文件"), FileCode2],
      ] as Array<[RelayWorkspaceSection, string, LucideIcon]>).map(([id, label, Icon]) => (
        <button
          aria-selected={activeSection === id}
          className={activeSection === id ? "active" : ""}
          key={id}
          onClick={() => setActiveSection(id)}
          role="tab"
          type="button"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );

  if (detailProfile) {
    return (
      <RelayProfileDetail
        profile={detailProfile}
        relayFiles={!localRelayEnabled && !isNewProfile && detailProfile.id === normalized.activeRelayId ? relayFiles : null}
        form={normalized}
        isNew={isNewProfile}
        localRelayEnabled={localRelayEnabled}
        onBack={() => {
          setNewProfileDraft(null);
          setDetailProfileId(null);
        }}
        onFormChange={saveRelaySettings}
        onSaved={() => {
          setNewProfileDraft(null);
          setDetailProfileId(null);
        }}
        actions={actions}
      />
    );
  }

  if (activeSection === "localRelay") {
    return <>{workspaceTabs}<LocalRelayPanel actions={actions} form={normalized} localRelay={localRelay} /></>;
  }

  if (activeSection === "localFiles") {
    return <>{workspaceTabs}<RelayLocalFilesPanel actions={actions} relayFiles={relayFiles} /></>;
  }

  return (
    <>
      {workspaceTabs}
      <Panel className="relay-control-panel">
        <CardContent className="relay-control-content">
          <EnvConflictNotice envConflicts={envConflicts} actions={actions} />
          <div className="relay-cockpit-toolbar">
            <label className="relay-search-field">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t("搜索供应商")}</span>
              <Input
                aria-label={t("搜索供应商")}
                onChange={(event) => setRelaySearch(event.currentTarget.value)}
                placeholder={t("搜索供应商名称或 Base URL...")}
                value={relaySearch}
              />
            </label>
            <div className="relay-view-toggle" aria-label={t("切换视图")} role="group">
              <Button
                aria-label={t("列表视图")}
                className="relay-view-button"
                onClick={() => setRelayListView("list")}
                size="icon"
                title={t("列表视图")}
                variant={relayListView === "list" ? "secondary" : "ghost"}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                aria-label={t("卡片视图")}
                className="relay-view-button"
                onClick={() => setRelayListView("grid")}
                size="icon"
                title={t("卡片视图")}
                variant={relayListView === "grid" ? "default" : "ghost"}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <label className="relay-toolbar-select-wrap">
              <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t("排序方式")}</span>
              <select
                aria-label={t("排序方式")}
                className="relay-toolbar-select"
                onChange={(event) => setRelayListSort(event.currentTarget.value as RelayListSort)}
                value={relayListSort}
              >
                <option value="manual">{t("手动顺序")}</option>
                <option value="name">{t("按名称")}</option>
              </select>
            </label>
            <label className="relay-toolbar-switch">
              <input
                checked={normalized.relayProfilesEnabled}
                onChange={(event) => {
                  const next = { ...normalized, relayProfilesEnabled: event.currentTarget.checked };
                  void saveRelaySettings(next);
                }}
                type="checkbox"
              />
              <span>
                <strong>{t("供应商切换")}</strong>
                <small>{normalized.relayProfilesEnabled ? t("已启用") : t("已禁用")}</small>
              </span>
            </label>
            <div className="relay-toolbar-actions">
              <div className="third-party-import">
                <Button
                  aria-label={t("添加供应商")}
                  onClick={() => setAddProviderOpen((open) => !open)}
                  size="icon"
                  title={t("添加供应商")}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {addProviderOpen ? (
                  <div className="third-party-import-menu provider-kind-menu">
                    <button
                      onClick={() => {
                        setAddProviderOpen(false);
                        setNewProfileDraft(createRelayProfile(normalized));
                        setDetailProfileId(null);
                      }}
                      type="button"
                    >
                      <strong>{t("API Key")}</strong>
                      <span>{t("配置 Base URL、Key 和模型")}</span>
                    </button>
                    <button
                      onClick={() => {
                        setAddProviderOpen(false);
                        setOAuthDialogOpen(true);
                      }}
                      type="button"
                    >
                      <strong>{t("OAuth")}</strong>
                      <span>{t("从本机导入或浏览器登录")}</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="third-party-import">
                <Button
                  aria-label={t("从第三方导入")}
                  onClick={openThirdPartyImport}
                  size="icon"
                  title={t("从第三方导入")}
                  variant="secondary"
                >
                  <Download className="h-4 w-4" />
                </Button>
                {thirdPartyImportOpen ? (
                  <div className="third-party-import-menu">
                    <button
                      disabled={!ccsProviders?.providers.length}
                      onClick={() => {
                        setThirdPartyImportOpen(false);
                        void actions.importCcsProviders();
                      }}
                      type="button"
                    >
                      <strong>ccswitch</strong>
                      <span>{ccsProviderSummary(ccsProviders)}</span>
                    </button>
                    <button
                      onClick={() => void actions.refreshCcsProviders()}
                      type="button"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t("刷新列表")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <p className="relay-master-note">{t("关闭后本工具不会在手动切换时写入 Codex 的 config.toml / auth.json；启动 Codex 时始终不会自动改这些文件。")}</p>
        </CardContent>
      </Panel>
      <section className="relay-provider-section">
        <div className="relay-list-heading">
            <div>
              <strong>{t("供应商")}</strong>
              <span>{tf("{0} 个配置", [relayProfilesForDisplay.length])}</span>
            </div>
            <span className={`relay-switch-status ${normalized.relayProfilesEnabled ? "enabled" : "disabled"}`}>
              <span aria-hidden="true" className="relay-status-dot" />
              {normalized.relayProfilesEnabled ? t("当前配置可正常切换") : t("供应商配置已关闭")}
            </span>
        </div>
        <RelayProfileList
          form={normalized}
          localRelayEnabled={localRelayEnabled}
          onEdit={(profileId) => void editRelayProfile(profileId)}
          onFormChange={saveRelaySettings}
          disabled={!normalized.relayProfilesEnabled || actions.relaySwitching}
          actions={actions}
          profiles={relayProfilesForDisplay}
          reorderEnabled={relayReorderEnabled}
          view={relayListView}
        />
      </section>
      {oauthDialogOpen ? (
        <OAuthProviderDialog actions={actions} onClose={() => setOAuthDialogOpen(false)} />
      ) : null}
    </>
  );
}

function RelayLocalFilesPanel({
  relayFiles,
  actions,
}: {
  relayFiles: RelayFilesResult | null;
  actions: Actions;
}) {
  const [configContents, setConfigContents] = useState("");
  const [authContents, setAuthContents] = useState("");
  useEffect(() => {
    setConfigContents(relayFiles?.configContents || "");
    setAuthContents(relayFiles?.authContents || "");
  }, [relayFiles?.authContents, relayFiles?.configContents]);
  return (
    <section className="relay-workspace-panel">
      <div className="relay-workspace-head">
        <div>
          <h2>{t("本机 Codex 配置")}</h2>
          <p>{relayFiles?.configPath || t("正在读取 ~/.codex/config.toml")}</p>
        </div>
        <Button onClick={() => void actions.refreshRelayFiles()} variant="secondary">
          <RefreshCw className="h-4 w-4" />{t("重新读取")}
        </Button>
      </div>
      <div className="relay-file-grid">
        <div className="relay-file-panel">
          <div className="relay-file-head"><strong>config.toml</strong><span>{relayFiles?.configPath}</span></div>
          <textarea
            aria-label="config.toml"
            className="relay-file-textarea"
            onChange={(event) => setConfigContents(event.currentTarget.value)}
            spellCheck={false}
            value={configContents}
          />
          <Button onClick={() => void actions.saveRelayFile("config", configContents)} size="sm">
            <Save className="h-4 w-4" />{t("保存 config.toml")}
          </Button>
        </div>
        <div className="relay-file-panel">
          <div className="relay-file-head"><strong>auth.json</strong><span>{relayFiles?.authPath}</span></div>
          <textarea
            aria-label="auth.json"
            className="relay-file-textarea"
            onChange={(event) => setAuthContents(event.currentTarget.value)}
            spellCheck={false}
            value={authContents}
          />
          <Button onClick={() => void actions.saveRelayFile("auth", authContents)} size="sm">
            <Save className="h-4 w-4" />{t("保存 auth.json")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function LocalRelayPanel({
  localRelay,
  form,
  actions,
}: {
  localRelay: LocalRelayResult | null;
  form: BackendSettings;
  actions: Actions;
}) {
  const [draft, setDraft] = useState<LocalRelaySettings>(localRelay?.settings || {
    enabled: false,
    port: 57321,
    apiKey: "",
    routingStrategy: "conversation-sticky",
    providerIds: [],
    disabledProviderIds: [],
    hourlyQuota: null,
    weeklyQuota: null,
  });
  useEffect(() => {
    if (localRelay?.settings) {
      setDraft({
        ...localRelay.settings,
        disabledProviderIds: localRelay.settings.disabledProviderIds ?? [],
      });
    }
  }, [localRelay?.settings]);
  const providers = form.relayProfiles.filter((profile) => !isAggregateRelayProfile(profile));
  const disabledProviderIds = draft.disabledProviderIds ?? [];
  const selectedProviders = draft.providerIds
    .map((providerId) => providers.find((profile) => profile.id === providerId))
    .filter((profile): profile is RelayProfile => !!profile);
  const providerEnabled = (providerId: string) => !disabledProviderIds.includes(providerId);
  const enabledProviders = selectedProviders.filter((provider) => providerEnabled(provider.id));
  const availableProviders = providers.filter((profile) => !draft.providerIds.includes(profile.id));
  const activeProvider = providers.find((profile) => profile.id === form.activeRelayId)?.name || t("未选择");
  const localRelayCanApply = enabledProviders.length > 0 && enabledProviders.every(relayProfileCanJoinLocalPool);
  const appliedSettings = localRelay?.settings;
  const relayDraftDirty = !!appliedSettings && (
    draft.port !== appliedSettings.port
    || draft.providerIds.join("\u0000") !== appliedSettings.providerIds.join("\u0000")
    || disabledProviderIds.join("\u0000") !== (appliedSettings.disabledProviderIds ?? []).join("\u0000")
  );
  const addProvider = (providerId: string) => {
    if (!providerId || draft.providerIds.includes(providerId)) return;
    setDraft({
      ...draft,
      providerIds: [...draft.providerIds, providerId],
      disabledProviderIds: disabledProviderIds.filter((id) => id !== providerId),
    });
  };
  const removeProvider = (providerId: string) => {
    setDraft({
      ...draft,
      providerIds: draft.providerIds.filter((id) => id !== providerId),
      disabledProviderIds: disabledProviderIds.filter((id) => id !== providerId),
    });
  };
  const toggleProvider = (providerId: string) => {
    setDraft({
      ...draft,
      disabledProviderIds: providerEnabled(providerId)
        ? [...disabledProviderIds, providerId]
        : disabledProviderIds.filter((id) => id !== providerId),
    });
  };
  const moveProvider = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= draft.providerIds.length) return;
    const providerIds = [...draft.providerIds];
    [providerIds[index], providerIds[target]] = [providerIds[target], providerIds[index]];
    setDraft({ ...draft, providerIds });
  };
  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(draft.apiKey);
      await actions.showMessage(t("本地中转"), t("本地中转 API Key 已复制。"), "ok");
    } catch {
      await actions.showMessage(t("本地中转"), t("复制失败，请检查剪贴板权限。"), "failed");
    }
  };
  return (
    <section className="relay-workspace-panel local-relay-workspace">
      <div className="relay-workspace-head">
        <div>
          <h2>{t("本地中转")}</h2>
          <p>{localRelay?.statePath || t("~/.codex-deck/local-relay.json")}</p>
        </div>
        <div className="local-relay-head-actions">
          <span className={`relay-switch-status ${localRelay?.running ? "enabled" : "disabled"}`}>
            <span aria-hidden="true" className="relay-status-dot" />
            {localRelay?.running ? t("运行中") : t("已停止")}
          </span>
          {localRelay?.running && relayDraftDirty ? <span className="local-relay-pending">{t("待应用")}</span> : null}
          {localRelay?.running ? (
            <>
              <Button disabled={!localRelayCanApply} onClick={() => void actions.startLocalRelay(draft)} size="sm" variant="secondary">
                <Save className="h-4 w-4" />{t("应用配置")}
              </Button>
              <Button onClick={() => void actions.stopLocalRelay()} size="sm">
                <PowerOff className="h-4 w-4" />{t("停止中转")}
              </Button>
            </>
          ) : (
            <Button disabled={!localRelayCanApply} onClick={() => void actions.startLocalRelay(draft)} size="sm">
              <Play className="h-4 w-4" />{t("启动中转")}
            </Button>
          )}
          <Button aria-label={t("刷新本地中转状态")} onClick={() => void actions.refreshLocalRelay()} size="icon" title={t("刷新本地中转状态")} variant="ghost">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="local-relay-metrics">
        <div><span>{t("Base URL")}</span><strong>{localRelay?.baseUrl || `http://127.0.0.1:${draft.port}/v1`}</strong></div>
        <div><span>{t("直接供应商")}</span><strong>{activeProvider}</strong></div>
        <div><span>{t("中转成员")}</span><strong>{tf("{0} / {1} 个", [enabledProviders.length, selectedProviders.length])}</strong></div>
      </div>
      <div className="local-relay-config-row">
        <Field label={t("端口")}>
          <Input
            min={1}
            max={65535}
            onChange={(event) => setDraft({ ...draft, port: Number(event.currentTarget.value) || 57321 })}
            type="number"
            value={draft.port}
          />
        </Field>
        <div className="local-relay-policy">
          <Workflow className="h-4 w-4" />
          <span><strong>{t("会话固定")}</strong><small>{t("新会话轮转，失败后切换并重新绑定")}</small></span>
        </div>
      </div>
      <div className="local-relay-provider-section">
        <div className="local-relay-provider-head">
          <div>
            <strong>{t("供应商池")}</strong>
            <span>{tf("{0} 个参与 / {1} 个成员", [enabledProviders.length, selectedProviders.length])}</span>
          </div>
          <select
            aria-label={t("从供应商列表添加")}
            className="field-select local-relay-provider-select"
            onChange={(event) => {
              addProvider(event.currentTarget.value);
              event.currentTarget.value = "";
            }}
            value=""
          >
            <option value="">{t("添加供应商")}</option>
            {availableProviders.map((provider) => (
              <option disabled={!relayProfileCanJoinLocalPool(provider)} key={provider.id} value={provider.id}>
                {provider.name || t("未命名供应商")} · {relayCredentialLabel(provider)}
              </option>
            ))}
          </select>
        </div>
        <div className="local-relay-provider-list">
          {selectedProviders.map((provider, index) => {
            const enabled = providerEnabled(provider.id);
            const ready = relayProfileCanJoinLocalPool(provider);
            const providerName = provider.name || t("未命名供应商");
            return (
              <div className={`local-relay-provider-row ${enabled ? "enabled" : "paused"}`} key={provider.id}>
                <span className="local-relay-provider-order">{index + 1}</span>
                <span className="local-relay-provider-copy">
                  <strong>{providerName}</strong>
                  <small>{relayCredentialLabel(provider)} · {relayProtocolLabel(provider.protocol)}</small>
                </span>
                <span className={`local-relay-provider-state ${!enabled ? "paused" : ready ? "ready" : "invalid"}`}>
                  {!enabled ? t("已暂停") : ready ? t("可用") : t("配置不完整")}
                </span>
                <label className="local-relay-provider-toggle">
                  <input
                    aria-label={tf("{0}：参与中转", [providerName])}
                    checked={enabled}
                    onChange={() => toggleProvider(provider.id)}
                    type="checkbox"
                  />
                  <span>{enabled ? t("参与中转") : t("暂停调用")}</span>
                </label>
                <span className="local-relay-provider-actions">
                  <Button aria-label={t("上移")} disabled={index === 0} onClick={() => moveProvider(index, -1)} size="icon" title={t("上移")} variant="ghost">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button aria-label={t("下移")} disabled={index === selectedProviders.length - 1} onClick={() => moveProvider(index, 1)} size="icon" title={t("下移")} variant="ghost">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button aria-label={t("移除")} onClick={() => removeProvider(provider.id)} size="icon" title={t("移除")} variant="ghost">
                    <X className="h-4 w-4" />
                  </Button>
                </span>
              </div>
            );
          })}
          {!selectedProviders.length ? <div className="local-relay-provider-empty">{t("尚未添加供应商")}</div> : null}
        </div>
      </div>
      <Field label={t("本地 API Key")}>
        <div className="local-relay-key-row">
          <Input readOnly type="password" value={draft.apiKey} />
          <Button aria-label={t("复制本地 API Key")} onClick={() => void copyKey()} size="icon" title={t("复制本地 API Key")} variant="secondary">
            <Copy className="h-4 w-4" />
          </Button>
          <Button onClick={() => void actions.regenerateLocalRelayKey()} size="sm" variant="secondary">
            <RefreshCw className="h-4 w-4" />{t("重新生成")}
          </Button>
        </div>
      </Field>
    </section>
  );
}

function OAuthProviderDialog({ actions, onClose }: { actions: Actions; onClose: () => void }) {
  const [loginId, setLoginId] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "completed" | "failed">("idle");
  const [message, setMessage] = useState(t("选择 OAuth 凭据来源"));
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!loginId || state !== "pending") return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      const result = await actions.pollCodexOAuthLogin(loginId);
      if (cancelled || !result) return;
      setMessage(result.message);
      if (result.state === "completed") {
        setState("completed");
        setWorking(false);
        return;
      }
      if (result.state === "failed" || !isSuccessStatus(result.status)) {
        setState("failed");
        setWorking(false);
        return;
      }
      timer = window.setTimeout(() => void poll(), 1200);
    };
    timer = window.setTimeout(() => void poll(), 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loginId, state]);

  const startBrowserLogin = async () => {
    setWorking(true);
    setState("pending");
    setMessage(t("正在打开浏览器登录"));
    const result = await actions.startCodexOAuthLogin();
    if (!result || !isSuccessStatus(result.status) || !result.loginId) {
      setState("failed");
      setMessage(result?.message || t("OAuth 登录启动失败"));
      setWorking(false);
      return;
    }
    setLoginId(result.loginId);
    setMessage(t("等待浏览器授权完成"));
  };

  const importLocal = async () => {
    setWorking(true);
    setMessage(t("正在读取本机 config.toml / auth.json"));
    const result = await actions.importLocalCodexOAuth();
    setWorking(false);
    if (!result) {
      setState("failed");
      setMessage(t("OAuth 导入失败"));
      return;
    }
    setState(result.state === "completed" && isSuccessStatus(result.status) ? "completed" : "failed");
    setMessage(result.message);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-labelledby="oauth-provider-title" aria-modal="true" className="modal-card oauth-provider-modal" role="dialog">
        <div className="modal-title-row">
          <div>
            <h2 id="oauth-provider-title">{t("添加 OAuth 供应商")}</h2>
            <p>{message}</p>
          </div>
          <Button aria-label={t("关闭")} disabled={working} onClick={onClose} size="icon" title={t("关闭")} variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="oauth-provider-options">
          <button disabled={working} onClick={() => void importLocal()} type="button">
            <FileCode2 className="h-5 w-5" />
            <span><strong>{t("从本机导入")}</strong><small>config.toml + auth.json</small></span>
          </button>
          <button disabled={working} onClick={() => void startBrowserLogin()} type="button">
            <LogIn className="h-5 w-5" />
            <span><strong>{t("浏览器登录")}</strong><small>OpenAI OAuth</small></span>
          </button>
        </div>
        <div className={`oauth-provider-status ${state}`}>
          <span aria-hidden="true" className="relay-status-dot" />
          <strong>{state === "completed" ? t("供应商已添加") : state === "pending" ? t("等待授权") : state === "failed" ? t("操作失败") : t("等待选择")}</strong>
        </div>
        {state === "completed" ? (
          <div className="modal-actions">
            <Button onClick={onClose}>{t("完成")}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EnvConflictNotice({
  envConflicts,
  actions,
}: {
  envConflicts: EnvConflictsResult | null;
  actions: Actions;
}) {
  const conflicts = envConflicts?.conflicts ?? [];
  if (!conflicts.length) return null;
  const names = Array.from(new Set(conflicts.map((conflict) => conflict.name))).sort();
  return (
    <div className="env-conflict-notice">
      <div className="env-conflict-icon">
        <ShieldAlert className="h-4 w-4" />
      </div>
      <div className="env-conflict-body">
        <strong>{t("检测到 OPENAI 环境变量")}</strong>
        <p>{t("这些变量可能覆盖当前供应商写入的 config.toml / auth.json；CODEX_HOME 不会被清理。")}</p>
        <div className="env-conflict-tags">
          {conflicts.map((conflict) => (
            <span key={`${conflict.source}-${conflict.name}`}>
              {conflict.name}
              <small>{envConflictSourceLabel(conflict.source)}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="env-conflict-actions">
        <Button onClick={() => void actions.removeEnvConflicts(names)} size="sm">
          <Trash2 className="h-4 w-4" />
          {t("删除")}
        </Button>
        <Button onClick={() => void actions.refreshEnvConflicts(false)} size="sm" variant="secondary">
          <RefreshCw className="h-4 w-4" />
          {t("检测")}
        </Button>
      </div>
    </div>
  );
}

function envConflictSourceLabel(source: string): string {
  if (source === "process") return t("当前进程");
  if (source === "user") return t("用户环境");
  return source || t("环境变量");
}

type DeckSectionOption<T extends string> = {
  id: T;
  label: string;
  detail: string;
  icon: LucideIcon;
};

function DeckSectionNav<T extends string>({
  label,
  options,
  active,
  onChange,
}: {
  label: string;
  options: Array<DeckSectionOption<T>>;
  active: T;
  onChange: (section: T) => void;
}) {
  return (
    <nav aria-label={label} className="deck-section-nav">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            aria-current={active === option.id ? "page" : undefined}
            className={active === option.id ? "active" : ""}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            <span className="deck-section-nav-icon"><Icon className="h-4 w-4" /></span>
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <ChevronRight className="h-4 w-4 deck-section-nav-arrow" />
          </button>
        );
      })}
    </nav>
  );
}

type EnhanceSection = "plugins" | "conversation" | "stepwise" | "interface";

function EnhanceScreen({
  form,
  pluginMarketplaceProgress,
  remotePluginMarketplace,
  remotePluginMarketplaceProgress,
  onFormChange,
  actions,
}: {
  form: BackendSettings;
  pluginMarketplaceProgress: TaskProgress;
  remotePluginMarketplace: RemotePluginMarketplaceResult | null;
  remotePluginMarketplaceProgress: TaskProgress;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const setEnhanceFlag = (key: keyof BackendSettings, value: boolean) => onFormChange({ ...form, [key]: value });
  const setPersistedEnhanceFlag = (key: keyof BackendSettings, value: boolean) => {
    const next = { ...form, [key]: value };
    onFormChange(next);
    void actions.saveSettingsValue(next, true);
  };
  const masterEnabled = form.enhancementsEnabled;
  const patchMode = form.launchMode === "patch";
  const remoteMarketplaceStatus = remotePluginMarketplace?.marketplaceRoot
    ? remotePluginMarketplace.configRegistered
      ? t("已注册")
      : t("已缓存未注册")
    : t("未发现缓存");
  const remoteMarketplaceSummary = remotePluginMarketplace?.marketplaceRoot
    ? tf("已缓存 {0} 个插件 / {1} 个技能。", [
        String(remotePluginMarketplace.pluginCount),
        String(remotePluginMarketplace.skillCount),
      ])
    : t("未发现本地缓存；点击按钮会从 Codex Deck 内置快照释放并注册，无需官方账号预缓存。");
  const [activeSection, setActiveSection] = useState<EnhanceSection>("plugins");
  const enhanceSections: Array<DeckSectionOption<EnhanceSection>> = [
    { id: "plugins", label: t("插件与模型"), detail: t("市场、模型与服务档位"), icon: Boxes },
    { id: "conversation", label: t("对话与输入"), detail: t("会话、导出和输入体验"), icon: MessageCircle },
    { id: "stepwise", label: "Stepwise", detail: t("后续建议与发送方式"), icon: Workflow },
    { id: "interface", label: t("界面与启动"), detail: t("语言、菜单和启动速度"), icon: AppWindow },
  ];
  const activeSectionOption = enhanceSections.find((section) => section.id === activeSection) ?? enhanceSections[0];
  const ActiveSectionIcon = activeSectionOption.icon;
  return (
    <div className="deck-page deck-settings-page enhance-deck-page">
      <Panel className="enhance-master-panel">
        <CardHead title={t("Codex 增强")} detail={t("会话删除、导出、项目移动和用户脚本等界面能力")} />
        <CardContent>
          <div className="enhance-master-grid">
          <label className="switch-row enhance-master-switch">
            <input
              checked={form.enhancementsEnabled}
              onChange={(event) => onFormChange({ ...form, enhancementsEnabled: event.currentTarget.checked })}
              type="checkbox"
            />
            <span>
              <strong>{t("启用 Codex 增强")}</strong>
              <small>{t("关闭后会停用删除、导出、项目移动、插件相关和菜单位置增强。")}</small>
            </span>
          </label>
          <ModeSelector launchMode={form.launchMode} actions={actions} />
          </div>
          {form.launchMode === "relay" ? (
            <div className="hint-line">
              <ShieldCheck className="h-4 w-4" />
              <span>{t("当前为兼容增强模式，插件市场解锁不会启用；其他页面功能仍可用。")}</span>
            </div>
          ) : null}
        </CardContent>
      </Panel>
      <div className="deck-settings-layout">
        <DeckSectionNav
          active={activeSection}
          label={t("增强功能分类")}
          onChange={setActiveSection}
          options={enhanceSections}
        />
        <section className="deck-settings-content">
          <div className="deck-settings-content-head">
            <span className="deck-settings-content-icon"><ActiveSectionIcon className="h-4 w-4" /></span>
            <div>
              <h2>{activeSectionOption.label}</h2>
              <p>{activeSectionOption.detail}</p>
            </div>
          </div>
          <div className="enhance-feature-groups" data-active-section={activeSection}>
            <FeatureGroup title={t("插件与模型")} detail={t("管理插件市场、模型列表和服务档位相关增强。")}>
              <FeatureToggle title={t("强制启用 Windows Computer Use Guard")} detail={t("在非完整增强场景中继续准备 Browser、Chrome 与 Computer Use 的本地守护状态。")} checked={form.computerUseGuardEnabled} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("computerUseGuardEnabled", value)} />
              <FeatureToggle title={t("插件市场解锁")} detail={t("API Key 模式下扩展插件市场请求，尽量显示完整插件列表；官方/混合模式通常不需要。")} checked={form.codexAppPluginMarketplaceUnlock} disabled={!masterEnabled || !patchMode} onChange={(value) => setEnhanceFlag("codexAppPluginMarketplaceUnlock", value)} />
              <FeatureToggle title={t("插件列表全量展示")} detail={t("进入插件页后自动连续展开“更多”，尽量一次显示完整插件列表。")} checked={form.codexAppPluginAutoExpand} disabled={!masterEnabled || !patchMode} onChange={(value) => setEnhanceFlag("codexAppPluginAutoExpand", value)} />
              <FeatureToggle title={t("模型白名单解锁")} detail={t("从环境变量和 config.toml 的 /v1/models 拉取模型并补进模型列表。")} checked={form.codexAppModelWhitelistUnlock} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppModelWhitelistUnlock", value)} />
              <FeatureToggle title={t("系统 Fast 开关")} detail={t("是否开启系统 Fast 开关：已默认开启，API Key 登录复用 Codex 原生速度选项与标识；具体 Fast / Standard 在 Codex 界面选择。")} checked={true} disabled onChange={() => {}} />
              <div className="feature-action-row">
                <div>
                  <strong>{t("官方远端插件缓存")}</strong>
                  <small>{t("使用 Codex Deck 内置快照补齐远端插件，API 模式也可显示和安装 Product Design 插件。")}</small>
                  <small>{remoteMarketplaceSummary}</small>
                </div>
                <Badge status={remotePluginMarketplace?.configRegistered ? "ok" : "not_checked"} />
                <Button
                  disabled={remotePluginMarketplaceProgress.active}
                  onClick={() => void actions.repairRemotePluginMarketplace()}
                  variant="secondary"
                >
                  {remotePluginMarketplaceProgress.active ? t("正在处理…") : t("释放并注册内置缓存")}
                </Button>
                <Button
                  disabled={remotePluginMarketplaceProgress.active}
                  onClick={() => void actions.refreshRemotePluginMarketplace()}
                  variant="outline"
                >
                  {t("刷新")}
                </Button>
                <span className="feature-action-status">{remoteMarketplaceStatus}</span>
              </div>
            </FeatureGroup>
            <FeatureGroup title={t("对话与输入")} detail={t("调整会话管理、输入行为和对话阅读体验。")}>
              <FeatureToggle title={t("会话删除")} detail={t("在会话列表悬停显示删除按钮，并支持撤销。")} checked={form.codexAppSessionDelete} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppSessionDelete", value)} />
              <FeatureToggle title={t("Markdown 导出")} detail={t("在会话列表显示导出按钮，导出带时间戳的 Markdown。")} checked={form.codexAppMarkdownExport} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppMarkdownExport", value)} />
              <FeatureToggle title={t("用户脚本热重载")} detail={t("默认关闭；开启后每 1 秒检查脚本和配置变化并自动 reload，可能增加资源消耗或导致脚本重复执行。需重启 Codex 才生效。")} checked={form.codexAppUserScriptHotReload} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppUserScriptHotReload", value)} />
              <FeatureToggle title={t("粘贴修复")} detail={t("从 Word 等富文本粘贴到 Codex composer 时只保留纯文本，避免被识别为图片/文件附件。需重启 Codex 才生效。")} checked={form.codexAppPasteFix} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppPasteFix", value)} />
              <FeatureToggle title={t("会话项目移动")} detail={t("把会话移动到普通对话或其他本地项目。")} checked={form.codexAppProjectMove} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppProjectMove", value)} />
              <FeatureToggle title={t("会话 ID 标识")} detail={t("在侧边栏会话标题前显示短 ID 和 UUIDv7 创建时间，方便定位历史会话。")} checked={form.codexAppThreadIdBadge} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppThreadIdBadge", value)} />
              <FeatureToggle title={t("对话居中宽度")} detail={t("把主对话和输入框限制到固定最大宽度，适合大屏阅读。")} checked={form.codexAppConversationView} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppConversationView", value)} />
              <FeatureToggle title={t("切换对话保留位置")} detail={t("切换 thread 时恢复上一次浏览位置。")} checked={form.codexAppThreadScrollRestore} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppThreadScrollRestore", value)} />
            </FeatureGroup>
            <FeatureGroup title="Stepwise" detail={t("基于当前对话生成下一步建议，使用独立 API 配置。")}>
              <FeatureToggle title="Stepwise" detail={t("在 Codex 页面显示可拖动的后续建议浮层；建议由单独配置的 Stepwise API 生成。")} checked={form.codexAppStepwiseEnabled} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppStepwiseEnabled", value)} />
              <FeatureToggle title={t("Stepwise 直接发送")} detail={t("点击建议后自动发送；关闭时只填入输入框。")} checked={form.codexAppStepwiseDirectSend} disabled={!masterEnabled || !form.codexAppStepwiseEnabled} onChange={(value) => setEnhanceFlag("codexAppStepwiseDirectSend", value)} />
            </FeatureGroup>
            <FeatureGroup title={t("界面与启动")} detail={t("控制语言、启动速度和 Codex 原生界面调整。")}>
              {isWindowsPlatform ? <FeatureToggle title={t("桌宠跟随真实鼠标")} detail={t("仅支持 V2 桌宠；不会修改宠物文件。将 V2 的 Computer Use 光标朝向动作映射到真实鼠标，V1 开启后安全不生效；拖拽、原生悬停或 Computer Use 活跃时自动让步。")} checked={form.codexAppPetRealMouseLook} disabled={!masterEnabled} onChange={(value) => setPersistedEnhanceFlag("codexAppPetRealMouseLook", value)} /> : null}
              <FeatureToggle title={t("强制中文界面")} detail={t("强制启用 Codex App 内置 zh-CN 语言包，避免 Statsig/VPN 不通时回退英文。需重启 Codex 才能完整生效。")} checked={form.codexAppForceChineseLocale} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppForceChineseLocale", value)} />
              <FeatureToggle title={t("快速启动")} detail={t("默认关闭；无 VPN 时可开启，让 Statsig 初始化快速失败，减少启动时长。需重启 Codex 才生效。")} checked={form.codexAppFastStartup} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppFastStartup", value)} />
              <FeatureToggle title={t("原生菜单栏位置")} detail={t("把 Codex Deck 菜单插入 Codex 顶部原生菜单栏。")} checked={form.codexAppNativeMenuPlacement} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppNativeMenuPlacement", value)} />
              <FeatureToggle title={t("原生菜单汉化")} detail={t("启动时通过本地主进程调试端口汉化 Codex 原生菜单；不修改安装包。需重启 Codex 才生效。")} checked={form.codexAppNativeMenuLocalization} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppNativeMenuLocalization", value)} />
            </FeatureGroup>
            <FeatureGroup title={t("远程 Git")} detail={t("通过 upstream worktree 管理远程 Git 工作区。")}>
              <FeatureToggle title="Upstream worktree" detail={t("从最新 upstream 分支创建 Git worktree。")} checked={form.codexAppUpstreamWorktreeCreate} disabled={!masterEnabled} onChange={(value) => setEnhanceFlag("codexAppUpstreamWorktreeCreate", value)} />
            </FeatureGroup>
          </div>
          {activeSection === "plugins" ? (
            <>
          <div className="hint-line">
            <Wrench className="h-4 w-4" />
            <span>{t("新机器没有本地插件市场时，可从 openai/plugins 初始化到当前 CODEX_HOME。")}</span>
            <Button disabled={pluginMarketplaceProgress.active} variant="secondary" onClick={() => void actions.repairPluginMarketplace()}>
              {pluginMarketplaceProgress.active ? t("正在修复…") : t("修复插件市场")}
            </Button>
          </div>
          <TaskProgressBox progress={pluginMarketplaceProgress} title={t("插件市场修复进度")} />
          <TaskProgressBox progress={remotePluginMarketplaceProgress} title={t("官方远端插件缓存进度")} />
            </>
          ) : null}
          {activeSection === "plugins" ? (
          <div className="hint-line">
            <Info className="h-4 w-4" />
            <span>{t("如果使用官方模式或官方混入 API 模式，通常不需要开启插件市场解锁。")}</span>
          </div>
          ) : null}
        </section>
      </div>
      <div className="deck-save-bar">
        <div>
          <span className={masterEnabled ? "ready" : ""} aria-hidden="true" />
          <div>
            <strong>{masterEnabled ? t("Codex 增强已启用") : t("Codex 增强已关闭")}</strong>
            <small>{t("更改保存后会在下次启动 Codex 时生效")}</small>
          </div>
        </div>
        <Button onClick={() => void actions.saveSettings()}>
          <Save className="h-4 w-4" />
          {t("保存增强设置")}
        </Button>
      </div>
    </div>
  );
}

function UserScriptsScreen({ settings, market, actions }: { settings: SettingsResult | null; market: ScriptMarketResult | null; actions: Actions }) {
  const inventory = settings?.user_scripts;
  const scripts = inventory?.scripts ?? [];
  const marketScripts = market?.market.scripts ?? [];
  const installedCount = marketScripts.filter((script) => script.installed).length;
  const updateCount = marketScripts.filter((script) => script.updateAvailable).length;
  const enabledLocalCount = scripts.filter((script) => script.enabled).length;
  const [scriptView, setScriptView] = useState<"market" | "local">("market");
  const [scriptSearch, setScriptSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<"all" | "available" | "installed" | "updates">("all");
  const [localFilter, setLocalFilter] = useState<"all" | "enabled" | "disabled">("all");
  const normalizedScriptSearch = scriptSearch.trim().toLocaleLowerCase();
  const visibleMarketScripts = marketScripts.filter((script) => {
    if (marketFilter === "available" && script.installed) return false;
    if (marketFilter === "installed" && !script.installed) return false;
    if (marketFilter === "updates" && !script.updateAvailable) return false;
    if (!normalizedScriptSearch) return true;
    return [script.name, script.description, script.author, script.tags.join(" ")].join(" ").toLocaleLowerCase().includes(normalizedScriptSearch);
  });
  const visibleLocalScripts = scripts.filter((script) => {
    if (localFilter === "enabled" && !script.enabled) return false;
    if (localFilter === "disabled" && script.enabled) return false;
    if (!normalizedScriptSearch) return true;
    return [script.name, script.key, script.source, script.status].join(" ").toLocaleLowerCase().includes(normalizedScriptSearch);
  });
  return (
    <div className="deck-page script-deck-page">
      <Panel className="script-control-panel">
        <CardHead title={t("脚本市场")} detail={market?.market.message ?? t("尚未刷新")} />
        <CardContent>
          <div aria-label={t("脚本视图")} className="deck-tabs script-view-tabs" role="tablist">
            <button aria-selected={scriptView === "market"} className={scriptView === "market" ? "active" : ""} onClick={() => setScriptView("market")} role="tab" type="button">
              <Download className="h-4 w-4" />
              <span><strong>{t("市场脚本")}</strong><small>{tf("{0} 个，可更新 {1} 个", [marketScripts.length, updateCount])}</small></span>
            </button>
            <button aria-selected={scriptView === "local"} className={scriptView === "local" ? "active" : ""} onClick={() => setScriptView("local")} role="tab" type="button">
              <FileCode2 className="h-4 w-4" />
              <span><strong>{t("本地脚本")}</strong><small>{tf("{0} 个，已启用 {1} 个", [scripts.length, enabledLocalCount])}</small></span>
            </button>
          </div>
          <div className="deck-list-toolbar script-list-toolbar">
            <label className="deck-search-field">
              <Search className="h-4 w-4" aria-hidden="true" />
              <Input aria-label={t("搜索脚本")} onChange={(event) => setScriptSearch(event.currentTarget.value)} placeholder={t("搜索名称、作者或标签...")} type="search" value={scriptSearch} />
            </label>
            <label className="deck-toolbar-select">
              <Filter className="h-4 w-4" aria-hidden="true" />
              {scriptView === "market" ? (
                <select aria-label={t("市场脚本筛选")} onChange={(event) => setMarketFilter(event.currentTarget.value as typeof marketFilter)} value={marketFilter}>
                  <option value="all">{t("全部状态")}</option>
                  <option value="available">{t("未安装")}</option>
                  <option value="installed">{t("已安装")}</option>
                  <option value="updates">{t("可更新")}</option>
                </select>
              ) : (
                <select aria-label={t("本地脚本筛选")} onChange={(event) => setLocalFilter(event.currentTarget.value as typeof localFilter)} value={localFilter}>
                  <option value="all">{t("全部状态")}</option>
                  <option value="enabled">{t("已启用")}</option>
                  <option value="disabled">{t("已禁用")}</option>
                </select>
              )}
            </label>
            <div className="deck-toolbar-actions">
              <Button aria-label={scriptView === "market" ? t("刷新市场") : t("刷新本地")} onClick={() => void (scriptView === "market" ? actions.refreshScriptMarket() : actions.refreshCurrent())} size="icon" title={scriptView === "market" ? t("刷新市场") : t("刷新本地")} variant="outline"><RefreshCw className="h-4 w-4" /></Button>
              <Button onClick={() => void actions.openExternalUrl(SCRIPT_MARKET_REPOSITORY_URL)} variant="secondary"><ExternalLink className="h-4 w-4" />{t("投稿")}</Button>
            </div>
          </div>
        </CardContent>
      </Panel>
      <section className="script-workspace">
        <div className="script-workspace-head">
          <div>
            <strong>{scriptView === "market" ? t("市场脚本") : t("本地脚本")}</strong>
            <span>{scriptView === "market" ? (market?.market.updatedAt ? tf("清单更新时间：{0}", [market.market.updatedAt]) : t("从 GitHub 静态清单加载")) : t("内置、手动和市场安装脚本")}</span>
          </div>
          <span>{scriptView === "market" ? tf("显示 {0} / {1}", [visibleMarketScripts.length, marketScripts.length]) : tf("显示 {0} / {1}", [visibleLocalScripts.length, scripts.length])}</span>
        </div>
        {scriptView === "market" ? (
          visibleMarketScripts.length ? <div className="script-market-grid script-market-scroll">{visibleMarketScripts.map((script) => <MarketScriptCard key={script.id} script={script} actions={actions} />)}</div> : <div className="deck-empty-state"><Search className="h-5 w-5" /><strong>{t("没有匹配的市场脚本")}</strong><span>{market?.status === "failed" ? market.message : t("调整搜索词或筛选条件。")}</span></div>
        ) : (
          <div className="script-local-table">
            <div className="script-local-table-head"><span>{t("名称")}</span><span>{t("来源")}</span><span>{t("状态")}</span><span>{t("运行状态")}</span><span>{t("操作")}</span></div>
            <div className="script-local-table-body">{visibleLocalScripts.length ? visibleLocalScripts.map((script) => <ScriptRow key={script.key} script={script} actions={actions} />) : <div className="deck-empty-state"><FileCode2 className="h-5 w-5" /><strong>{t("没有匹配的本地脚本")}</strong><span>{t("调整搜索词或筛选条件。")}</span></div>}</div>
          </div>
        )}
      </section>
      <div className="deck-save-bar script-status-bar">
        <div><span className={inventory?.enabled === false ? "" : "ready"} aria-hidden="true" /><div><strong>{inventory?.enabled === false ? t("本地脚本整体已关闭") : t("本地脚本整体已启用")}</strong><small>{tf("已安装 {0} 个市场脚本", [installedCount])}</small></div></div>
        <Button onClick={() => void actions.refreshScriptMarket()} variant="secondary"><RefreshCw className="h-4 w-4" />{t("刷新全部")}</Button>
      </div>
    </div>
  );
}

function SessionsScreen({
  settings,
  form,
  sessions,
  providerSyncProgress,
  providerSyncTargets,
  selectedProviderSyncTarget,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  form: BackendSettings;
  sessions: LocalSessionsResult | null;
  providerSyncProgress: ProviderSyncProgress;
  providerSyncTargets: ProviderSyncTargetsResult | null;
  selectedProviderSyncTarget: string;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const items = sessions?.sessions ?? [];
  const activeCount = items.filter((item) => !item.archived).length;
  const archivedCount = items.length - activeCount;
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState<SessionListFilter>("all");
  const [sessionSort, setSessionSort] = useState<SessionListSort>("newest");
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionPageSize, setSessionPageSize] = useState(10);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectCurrentPageRef = useRef<HTMLInputElement>(null);
  const searchQuery = sessionSearch.trim().toLowerCase();
  const filteredSessions = useMemo(() => {
    const filtered = items.filter((session) => {
      const matchesFilter =
        sessionFilter === "all" ||
        (sessionFilter === "active" && !session.archived) ||
        (sessionFilter === "archived" && session.archived);
      if (!matchesFilter) return false;
      if (!searchQuery) return true;
      return [session.title, session.id, session.cwd, session.modelProvider]
        .some((value) => value.toLowerCase().includes(searchQuery));
    });
    return filtered.sort((left, right) => {
      if (left.updatedAtMs === right.updatedAtMs) return left.id.localeCompare(right.id);
      if (left.updatedAtMs === null) return 1;
      if (right.updatedAtMs === null) return -1;
      return sessionSort === "newest"
        ? right.updatedAtMs - left.updatedAtMs
        : left.updatedAtMs - right.updatedAtMs;
    });
  }, [items, searchQuery, sessionFilter, sessionSort]);
  const pageCount = Math.max(1, Math.ceil(filteredSessions.length / sessionPageSize));
  const currentPage = Math.min(sessionPage, pageCount);
  const pageStartIndex = (currentPage - 1) * sessionPageSize;
  const visibleSessions = filteredSessions.slice(pageStartIndex, pageStartIndex + sessionPageSize);
  const pageStart = filteredSessions.length ? pageStartIndex + 1 : 0;
  const pageEnd = Math.min(pageStartIndex + sessionPageSize, filteredSessions.length);
  const selectedSessions = useMemo(() => items.filter((session) => selectedSessionIds.has(session.id)), [items, selectedSessionIds]);
  const selectedCount = selectedSessions.length;
  const selectedOnPageCount = visibleSessions.filter((session) => selectedSessionIds.has(session.id)).length;
  const allCurrentPageSelected = visibleSessions.length > 0 && selectedOnPageCount === visibleSessions.length;
  const allFilteredSelected = filteredSessions.length > 0 && filteredSessions.every((session) => selectedSessionIds.has(session.id));
  const databaseState = !sessions ? "waiting" : isSuccessStatus(sessions.status) ? "ok" : "failed";
  const databaseStatus =
    databaseState === "ok"
      ? t("会话库正常")
      : databaseState === "failed"
        ? t("会话库读取失败")
        : t("等待读取会话库");
  const databasePath = sessions?.dbPath || sessions?.dbPaths?.[0] || "~/.codex/sqlite/*.db";
  const paginationItems = useMemo<Array<number | string>>(() => {
    if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const pages = Array.from(new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]))
      .filter((page) => page >= 1 && page <= pageCount)
      .sort((left, right) => left - right);
    const result: Array<number | string> = [];
    pages.forEach((page, index) => {
      const previous = pages[index - 1];
      if (previous && page - previous > 1) result.push(`ellipsis-${previous}`);
      result.push(page);
    });
    return result;
  }, [currentPage, pageCount]);

  useEffect(() => {
    const itemIds = new Set(items.map((session) => session.id));
    setSelectedSessionIds((current) => {
      const next = new Set(Array.from(current).filter((id) => itemIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  useEffect(() => {
    setSessionPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    if (selectCurrentPageRef.current) {
      selectCurrentPageRef.current.indeterminate = selectedOnPageCount > 0 && !allCurrentPageSelected;
    }
  }, [allCurrentPageSelected, selectedOnPageCount]);

  const toggleSessionSelection = (sessionId: string, checked: boolean) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  };

  const toggleCurrentPageSelection = () => {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      visibleSessions.forEach((session) => {
        if (allCurrentPageSelected) {
          next.delete(session.id);
        } else {
          next.add(session.id);
        }
      });
      return next;
    });
  };

  const selectAllFilteredSessions = () => setSelectedSessionIds(new Set(filteredSessions.map((session) => session.id)));
  const clearSelectedSessions = () => setSelectedSessionIds(new Set());

  const deleteSelectedSessions = async () => {
    setBulkDeleting(true);
    try {
      await actions.deleteLocalSessions(selectedSessions);
    } finally {
      setBulkDeleting(false);
    }
  };

  const changeProviderSyncTarget = (provider: string) => {
    const next = { ...form, providerSyncLastSelectedProvider: provider };
    actions.setProviderSyncTarget(provider);
    onFormChange(next);
    void actions.saveSettingsValue(next, true);
  };

  const changeAutoRepair = (checked: boolean) => {
    const next = { ...form, providerSyncEnabled: checked };
    onFormChange(next);
    void actions.saveSettingsValue(next, true);
  };

  const changeSessionFilter = (next: SessionListFilter) => {
    setSessionFilter(next);
    setSessionPage(1);
  };

  return (
    <>
      <Panel className="session-control-panel">
        <CardContent className="session-control-content">
          <div className="session-cockpit-toolbar">
            <label className="session-search-field">
              <Search aria-hidden="true" className="h-4 w-4" />
              <Input
                aria-label={t("搜索会话")}
                onChange={(event) => {
                  setSessionSearch(event.currentTarget.value);
                  setSessionPage(1);
                }}
                placeholder={t("搜索标题、项目路径、会话 ID 或 Provider...")}
                type="search"
                value={sessionSearch}
              />
            </label>
            <div aria-label={t("会话状态筛选")} className="session-filter-group" role="group">
              <Button onClick={() => changeSessionFilter("all")} size="sm" variant={sessionFilter === "all" ? "secondary" : "ghost"}>
                {tf("全部 ({0})", [items.length])}
              </Button>
              <Button onClick={() => changeSessionFilter("active")} size="sm" variant={sessionFilter === "active" ? "secondary" : "ghost"}>
                {tf("未归档 ({0})", [activeCount])}
              </Button>
              <Button onClick={() => changeSessionFilter("archived")} size="sm" variant={sessionFilter === "archived" ? "secondary" : "ghost"}>
                {tf("已归档 ({0})", [archivedCount])}
              </Button>
            </div>
            <label className="session-toolbar-select-wrap session-sync-target" title={t("同步目标")}>
              <Link2 aria-hidden="true" className="h-4 w-4" />
              <select
                aria-label={t("同步目标")}
                className="session-toolbar-select"
                disabled={providerSyncProgress.active || !(providerSyncTargets?.targets ?? []).length}
                onChange={(event) => changeProviderSyncTarget(event.currentTarget.value)}
                value={selectedProviderSyncTarget}
              >
                {(providerSyncTargets?.targets ?? []).map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.id}{t("（")}{providerSyncTargetLabel(target)}{t("）")}
                  </option>
                ))}
                {!(providerSyncTargets?.targets ?? []).length ? <option value="">{t("当前配置 provider")}</option> : null}
              </select>
            </label>
            <label className="session-toolbar-select-wrap session-sort-target" title={t("排序方式")}>
              <ArrowDownWideNarrow aria-hidden="true" className="h-4 w-4" />
              <select
                aria-label={t("排序方式")}
                className="session-toolbar-select"
                onChange={(event) => {
                  setSessionSort(event.currentTarget.value as SessionListSort);
                  setSessionPage(1);
                }}
                value={sessionSort}
              >
                <option value="newest">{t("最近更新")}</option>
                <option value="oldest">{t("最早更新")}</option>
              </select>
            </label>
            <div className="session-toolbar-actions">
              <Button aria-label={t("刷新会话")} onClick={() => void actions.refreshLocalSessions()} size="icon" title={t("刷新会话")} variant="outline">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button disabled={providerSyncProgress.active} onClick={() => void actions.syncProvidersNow()}>
                <Wrench className="h-4 w-4" />
                {providerSyncProgress.active ? t("正在修复…") : t("修复历史会话")}
              </Button>
            </div>
          </div>
          <div className="session-control-meta">
            <div className="session-database-status" data-status={databaseState}>
              <Database aria-hidden="true" className="h-4 w-4" />
              <span>{t("数据库")}</span>
              <code title={databasePath}>{databasePath}</code>
              <span className="session-database-health">
                <i aria-hidden="true" />
                {databaseStatus}
              </span>
            </div>
            <label className="session-auto-repair">
              <input
                checked={form.providerSyncEnabled}
                onChange={(event) => changeAutoRepair(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>{t("启动前自动修复")}</span>
            </label>
          </div>
          {providerSyncProgress.active ? (
            <div className="provider-sync-progress session-repair-progress" data-active="true">
              <div className="provider-sync-progress-head">
                <strong>{t("正在修复历史会话")}</strong>
                <span>{providerSyncProgress.percent}%</span>
              </div>
              <div
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={providerSyncProgress.percent}
                className="provider-sync-progress-bar"
                role="progressbar"
              >
                <div className="provider-sync-progress-fill" style={{ width: `${providerSyncProgress.percent}%` }} />
              </div>
              <small>{providerSyncProgress.message}</small>
            </div>
          ) : null}
        </CardContent>
      </Panel>
      <Panel className="session-table-panel">
        <CardHeader className="session-table-head">
          <div className="session-table-title">
            <CardTitle>{t("本地会话")}</CardTitle>
            <CardDescription>
              {tf("{0} 个会话", [filteredSessions.length])} · {sessionSort === "newest" ? t("按更新时间倒序显示") : t("按更新时间正序显示")}
            </CardDescription>
          </div>
          <div className="session-selection-toolbar">
            <span>{tf("已选择 {0} 个会话", [selectedCount])}</span>
            <Button disabled={!filteredSessions.length || allFilteredSelected || bulkDeleting} onClick={selectAllFilteredSessions} size="sm" variant="ghost">
              {tf("全选筛选结果 ({0})", [filteredSessions.length])}
            </Button>
            <Button disabled={!selectedCount || bulkDeleting} onClick={clearSelectedSessions} size="sm" variant="ghost">
              {t("清空选择")}
            </Button>
            <Button className="session-bulk-delete" disabled={!selectedCount || bulkDeleting} onClick={() => void deleteSelectedSessions()} size="sm" variant="outline">
              <Trash2 className="h-4 w-4" />
              {bulkDeleting ? t("正在删除…") : t("删除已选")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="session-table-content">
          <div aria-label={t("本地会话")} className="session-table" role="table">
            <div className="session-table-row session-table-header" role="row">
              <div className="session-checkbox-cell" role="columnheader">
                <input
                  aria-label={t("选择当前页")}
                  checked={allCurrentPageSelected}
                  disabled={!visibleSessions.length}
                  onChange={toggleCurrentPageSelection}
                  ref={selectCurrentPageRef}
                  type="checkbox"
                />
              </div>
              <div role="columnheader">{t("会话")}</div>
              <div role="columnheader">Provider</div>
              <div role="columnheader">{t("状态")}</div>
              <div role="columnheader">{t("更新时间")}</div>
              <div aria-label={t("操作")} role="columnheader" />
            </div>
            {visibleSessions.map((session) => {
              const selected = selectedSessionIds.has(session.id);
              const provider = session.modelProvider || t("provider 未记录");
              const providerMark = Array.from(session.modelProvider.trim()).slice(0, 2).join("").toUpperCase() || "--";
              return (
                <div className="session-table-row" data-selected={selected} key={session.id} role="row">
                  <label className="session-checkbox-cell" title={t("选择会话")}>
                    <input
                      aria-label={tf("选择会话 {0}", [session.title || session.id])}
                      checked={selected}
                      onChange={(event) => toggleSessionSelection(session.id, event.currentTarget.checked)}
                      type="checkbox"
                    />
                  </label>
                  <div className="session-main-cell" role="cell">
                    <strong title={session.title || t("未命名会话")}>{session.title || t("未命名会话")}</strong>
                    <span title={`${session.cwd || t("未记录项目路径")} · ${session.id}`}>
                      {session.cwd || t("未记录项目路径")} · {session.id}
                    </span>
                  </div>
                  <div className="session-provider-cell" role="cell" title={provider}>
                    <span className="session-provider-mark">{providerMark}</span>
                    <span>{provider}</span>
                  </div>
                  <div className="session-status-cell" role="cell">
                    <UiBadge className={session.archived ? "session-status archived" : "session-status active"} variant="secondary">
                      {session.archived ? t("已归档") : t("未归档")}
                    </UiBadge>
                  </div>
                  <div className="session-time-cell" role="cell">
                    {session.updatedAtMs === null ? t("更新时间未知") : formatTime(session.updatedAtMs)}
                  </div>
                  <div className="session-action-cell" role="cell">
                    <Button
                      aria-label={tf("删除会话 {0}", [session.title || session.id])}
                      className="session-delete-button"
                      onClick={() => void actions.deleteLocalSession(session)}
                      size="icon"
                      title={t("删除会话")}
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {!visibleSessions.length ? (
              <div className="session-table-empty">
                {items.length ? t("没有匹配的会话") : t("未读取到本地会话，或当前 SQLite 会话库不存在。")}
              </div>
            ) : null}
          </div>
          <div className="session-table-note">
            <Info aria-hidden="true" className="h-4 w-4" />
            <span>{t("删除会创建本地备份；如果 Codex App 正在使用该会话，建议先关闭对应会话窗口再操作。")}</span>
          </div>
          <div className="session-pagination">
            <div className="session-pagination-summary">
              <span>{tf("第 {0}-{1} 条，共 {2} 条", [pageStart, pageEnd, filteredSessions.length])}</span>
              <label>
                <span>{t("每页")}</span>
                <select
                  aria-label={t("每页条数")}
                  onChange={(event) => {
                    setSessionPageSize(Number(event.currentTarget.value));
                    setSessionPage(1);
                  }}
                  value={sessionPageSize}
                >
                  {[10, 20, 50].map((size) => <option key={size} value={size}>{size} {t("条/页")}</option>)}
                </select>
              </label>
            </div>
            <nav aria-label={t("会话分页")} className="session-page-controls">
              <Button aria-label={t("首页")} disabled={currentPage === 1} onClick={() => setSessionPage(1)} size="icon" title={t("首页")} variant="ghost">
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button aria-label={t("上一页")} disabled={currentPage === 1} onClick={() => setSessionPage((page) => Math.max(1, page - 1))} size="icon" title={t("上一页")} variant="ghost">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="session-page-numbers">
                {paginationItems.map((item) => typeof item === "number" ? (
                  <Button
                    aria-current={item === currentPage ? "page" : undefined}
                    className="session-page-number"
                    key={item}
                    onClick={() => setSessionPage(item)}
                    size="icon"
                    variant={item === currentPage ? "secondary" : "ghost"}
                  >
                    {item}
                  </Button>
                ) : <span aria-hidden="true" key={item}>…</span>)}
              </div>
              <span className="session-page-position">{tf("第 {0} / {1} 页", [currentPage, pageCount])}</span>
              <Button aria-label={t("下一页")} disabled={currentPage === pageCount} onClick={() => setSessionPage((page) => Math.min(pageCount, page + 1))} size="icon" title={t("下一页")} variant="ghost">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button aria-label={t("末页")} disabled={currentPage === pageCount} onClick={() => setSessionPage(pageCount)} size="icon" title={t("末页")} variant="ghost">
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </nav>
          </div>
        </CardContent>
      </Panel>
    </>
  );
}

function MaintenanceScreen({
  overview,
  watcher,
  settings,
  launchForm,
  onLaunchFormChange,
  removeOwnedData,
  onRemoveOwnedDataChange,
  actions,
}: {
  overview: OverviewResult | null;
  watcher: WatcherResult | null;
  settings: SettingsResult | null;
  launchForm: { appPath: string; debugPort: string; helperPort: string };
  onLaunchFormChange: (next: { appPath: string; debugPort: string; helperPort: string }) => void;
  removeOwnedData: boolean;
  onRemoveOwnedDataChange: (value: boolean) => void;
  actions: Actions;
}) {
  const savedCodexAppPath = settings?.settings.codexAppPath ?? "";
  const [maintenanceSection, setMaintenanceSection] = useState<"health" | "entrypoints" | "watcher" | "application" | "launch" | "legacyImport">("health");
  const maintenanceSections: Array<DeckSectionOption<typeof maintenanceSection>> = [
    { id: "health", label: t("检查与修复"), detail: t("应用、入口和接管状态"), icon: Stethoscope },
    { id: "entrypoints", label: t("入口管理"), detail: t("安装、修复与卸载"), icon: Link2 },
    { id: "watcher", label: t("自动接管"), detail: t("Watcher 生命周期"), icon: ShieldCheck },
    { id: "application", label: t("Codex 应用路径"), detail: t("识别和保存应用位置"), icon: AppWindow },
    { id: "launch", label: t("手动启动"), detail: t("路径覆盖与调试端口"), icon: Play },
    { id: "legacyImport", label: t("Legacy 导入"), detail: t("预览、事务与安全应用"), icon: Database },
  ];
  const maintenanceStates = [
    overview?.codex_app.status === "found",
    overview?.silent_shortcut.status === "installed",
    watcher?.enabled === true,
  ];
  const readyMaintenanceCount = maintenanceStates.filter(Boolean).length;
  return (
    <div className="deck-page deck-settings-page maintenance-deck-page">
      <section className={`maintenance-status-band ${readyMaintenanceCount === maintenanceStates.length ? "ready" : "attention"}`}>
        <span className="maintenance-status-icon"><Stethoscope className="h-5 w-5" /></span>
        <div>
          <strong>{readyMaintenanceCount === maintenanceStates.length ? t("安装与接管状态正常") : t("存在需要维护的项目")}</strong>
          <small>{tf("{0} / {1} 项检查通过", [readyMaintenanceCount, maintenanceStates.length])}</small>
        </div>
        <Button onClick={() => void actions.checkHealth()} variant="outline"><RefreshCw className="h-4 w-4" />{t("重新检查")}</Button>
      </section>
      <div className="deck-settings-layout">
        <DeckSectionNav active={maintenanceSection} label={t("安装维护分类")} onChange={setMaintenanceSection} options={maintenanceSections} />
        <div className="maintenance-workspace">
      {maintenanceSection === "health" ? (
      <Panel>
        <CardHead title={t("检查与修复")} detail={t("检查入口、Codex 应用和 Watcher 状态")} />
        <CardContent>
          <div className="status-table">
            <StatusRow title={t("Codex 应用")} status={overview?.codex_app.status} path={overview?.codex_app.path} />
            <StatusRow title={t("Codex Deck 入口")} status={overview?.silent_shortcut.status} path={overview?.silent_shortcut.path} />
            <StatusRow title={t("Watcher 自动接管")} status={watcher?.enabled ? "ok" : "disabled"} path={watcher?.disabled_flag} />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.checkHealth()}>{t("检查")}</Button>
            <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>{t("修复快捷方式")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      ) : null}
      {maintenanceSection === "entrypoints" ? (
      <Panel>
        <CardHead title={t("入口管理")} detail={t("快捷方式写入系统实际桌面位置，不使用写死桌面路径")} />
        <CardContent>
          <label className="check-row">
            <input checked={removeOwnedData} onChange={(event) => onRemoveOwnedDataChange(event.currentTarget.checked)} type="checkbox" />
            <span>{t("卸载时移除 Codex Deck 托管数据")}</span>
          </label>
          <Toolbar>
            <Button onClick={() => void actions.installEntrypoints()}>{t("安装入口")}</Button>
            <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>{t("修复入口")}</Button>
          </Toolbar>
          <div className="maintenance-danger-zone">
            <div><strong>{t("危险操作")}</strong><small>{t("卸载入口可能同时移除 Codex Deck 托管数据，请先确认上方选项。")}</small></div>
            <Button variant="outline" onClick={() => void actions.uninstallEntrypoints()}><Trash2 className="h-4 w-4" />{t("卸载入口")}</Button>
          </div>
        </CardContent>
      </Panel>
      ) : null}
      {maintenanceSection === "watcher" ? (
      <Panel>
        <CardHead title={t("自动接管")} detail={t("Watcher 用于保持 Codex Deck 接管状态")} />
        <CardContent>
          <Toolbar>
            <Button variant="secondary" onClick={() => void actions.installWatcher()}>{t("安装 watcher")}</Button>
            <Button variant="secondary" onClick={() => void actions.uninstallWatcher()}>{t("移除 watcher")}</Button>
            <Button variant="secondary" onClick={() => void actions.enableWatcher()}>{t("启用")}</Button>
            <Button variant="secondary" onClick={() => void actions.disableWatcher()}>{t("禁用")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      ) : null}
      {maintenanceSection === "application" ? (
      <Panel>
        <CardHead title={t("Codex 应用路径")} detail={t("免安装版或解包版只需要选择一次，之后静默启动会自动复用")} />
        <CardContent>
          <div className="status-table">
            <StatusRow title={t("保存路径")} status={savedCodexAppPath ? "ok" : "not_checked"} path={savedCodexAppPath || null} />
            <StatusRow title={t("当前识别")} status={overview?.codex_app.status} path={overview?.codex_app.path} />
          </div>
          <Field label={t("保存的应用路径")}>
            <Input
              value={settings?.settings.codexAppPath ?? ""}
              placeholder={t("选择 Codex.exe、Codex.app、app 目录或解包目录")}
              readOnly
            />
          </Field>
          <Toolbar>
            <Button onClick={() => void actions.chooseCodexAppPath("folder")}>{t("选择应用目录")}</Button>
            <Button variant="secondary" onClick={() => void actions.chooseCodexAppPath("file")}>{t("选择 Codex.exe")}</Button>
            <Button variant="secondary" onClick={() => void actions.clearCodexAppPath()}>{t("清除保存路径")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      ) : null}
      {maintenanceSection === "launch" ? (
      <Panel>
        <CardHead title={t("手动启动")} detail={t("应用路径留空时使用已保存路径；没有保存路径时使用自动探测")} />
        <CardContent>
          <Field label={t("应用路径覆盖")}>
            <Input
              value={launchForm.appPath}
              onChange={(event) => onLaunchFormChange({ ...launchForm, appPath: event.currentTarget.value })}
              placeholder={savedCodexAppPath || t("例如 C:\\Program Files\\WindowsApps\\OpenAI.Codex...\\app")}
            />
          </Field>
          <div className="form-row">
            <Field label={t("Debug 端口")}>
              <Input
                value={launchForm.debugPort}
                onChange={(event) => onLaunchFormChange({ ...launchForm, debugPort: event.currentTarget.value })}
              />
            </Field>
            <Field label={t("Helper 端口")}>
              <Input
                value={launchForm.helperPort}
                onChange={(event) => onLaunchFormChange({ ...launchForm, helperPort: event.currentTarget.value })}
              />
            </Field>
          </div>
          <Toolbar>
            <Button onClick={() => void actions.launch()}>{t("启动 Codex")}</Button>
            <Button variant="secondary" onClick={() => void actions.saveManualCodexAppPath()}>
              {t("保存为默认路径")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      ) : null}
      {maintenanceSection === "legacyImport" ? <LegacyImportPanel actions={actions} /> : null}
        </div>
      </div>
      <div className="deck-save-bar maintenance-footer-bar">
        <div><span className={overview?.codex_app.status === "found" ? "ready" : ""} aria-hidden="true" /><div><strong>{t("当前 Codex 应用")}</strong><small>{overview?.codex_app.path || savedCodexAppPath || t("尚未识别应用路径")}</small></div></div>
        <Button onClick={() => void actions.launch()}><Rocket className="h-4 w-4" />{t("启动 Codex")}</Button>
      </div>
    </div>
  );
}

function LegacyImportPanel({ actions }: { actions: Actions }) {
  const [sourcePath, setSourcePath] = useState("");
  const [preview, setPreview] = useState<LegacyImportPreviewResult | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [transaction, setTransaction] = useState<LegacyImportTransaction | null>(null);
  const [applyResult, setApplyResult] = useState<LegacyImportApplyResult | null>(null);
  const [rollbackResult, setRollbackResult] = useState<LegacyImportRollbackResult | null>(null);
  const [working, setWorking] = useState(false);
  const previewValue = preview?.preview ?? null;
  const automaticItems = previewValue?.items.filter(legacyImportItemCanAutoApply) ?? [];
  const selectedAutoCount = automaticItems.filter((item) => selectedItemIds.includes(item.id)).length;
  const visibleItems = previewValue?.items.slice(0, 80) ?? [];
  const hiddenItemCount = Math.max(0, (previewValue?.items.length ?? 0) - visibleItems.length);
  const hasPreview = Boolean(previewValue);
  const canPrepare = Boolean(previewValue?.found && previewValue.items.length);

  const chooseSource = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("选择 Legacy 数据目录"),
      });
      if (typeof selected === "string" && selected.trim()) {
        setSourcePath(selected.trim());
        setPreview(null);
        setTransaction(null);
        setApplyResult(null);
        setRollbackResult(null);
      }
    } catch (error) {
      await actions.showMessage(t("Legacy 数据目录"), tf("打开选择器失败：{0}", [stringifyError(error)]), "failed");
    }
  };

  const runPreview = async () => {
    if (working) return;
    setWorking(true);
    try {
      const result = await actions.previewLegacyImport(sourcePath);
      if (result) {
        const nextPreview = result.preview;
        setPreview(result);
        setTransaction(null);
        setApplyResult(null);
        setRollbackResult(null);
        setSelectedItemIds(nextPreview.items.filter(legacyImportItemCanAutoApply).map((item) => item.id));
      }
    } finally {
      setWorking(false);
    }
  };

  const toggleItem = (item: LegacyImportItem, checked: boolean) => {
    if (!legacyImportItemCanAutoApply(item)) return;
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (checked) next.add(item.id);
      else next.delete(item.id);
      return Array.from(next);
    });
  };

  const selectAllAutomatic = (checked: boolean) => {
    setSelectedItemIds(checked ? automaticItems.map((item) => item.id) : []);
  };

  const prepareTransaction = async () => {
    if (!previewValue || working) return;
    const transactionItemIds = legacyImportSelectedIdsForTransaction(previewValue, selectedItemIds);
    if (!transactionItemIds.length) {
      await actions.showMessage(t("Legacy 导入事务"), t("没有可写入事务的项目。"), "failed");
      return;
    }
    setWorking(true);
    try {
      const result = await actions.prepareLegacyImportTransaction(sourcePath, transactionItemIds);
      if (result?.transaction) {
        setTransaction(result.transaction);
        setApplyResult(null);
        setRollbackResult(null);
      }
    } finally {
      setWorking(false);
    }
  };

  const applyTransaction = async () => {
    if (!transaction || working) return;
    const confirmed = window.confirm(
      t("应用 Legacy 导入事务？\n\n这只会写入 Codex Deck 设置；Legacy 源目录不会被修改。Secrets、外部路径和可执行项不会自动导入。"),
    );
    if (!confirmed) return;
    setWorking(true);
    try {
      const result = await actions.applyLegacyImportTransaction(transaction.transactionRoot);
      if (result?.result) {
        setApplyResult(result.result);
        setRollbackResult(null);
      }
    } finally {
      setWorking(false);
    }
  };

  const rollbackTransaction = async () => {
    if (!transaction || working) return;
    const confirmed = window.confirm(
      t("回滚 Legacy 导入事务？\n\n这会把 Codex Deck 设置恢复到准备事务时的本地快照；不会修改 Legacy 源目录。"),
    );
    if (!confirmed) return;
    setWorking(true);
    try {
      const result = await actions.rollbackLegacyImportTransaction(transaction.transactionRoot);
      if (result?.result) setRollbackResult(result.result);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Panel className="legacy-import-panel">
      <CardHead title={t("Legacy 导入")} detail={t("从旧数据目录生成只读预览，再通过事务导入低风险配置。")} />
      <CardContent>
        <div className="legacy-import-source">
          <Field label={t("Legacy 数据目录")}>
            <Input
              value={sourcePath}
              onChange={(event) => {
                setSourcePath(event.currentTarget.value);
                setPreview(null);
                setTransaction(null);
                setApplyResult(null);
                setRollbackResult(null);
              }}
              placeholder={t("留空则使用用户目录下的 .codex-deck")}
            />
          </Field>
          <Toolbar>
            <Button disabled={working} onClick={() => void chooseSource()} variant="secondary">
              <Database className="h-4 w-4" />
              {t("选择目录")}
            </Button>
            <Button disabled={working} onClick={() => void runPreview()}>
              <Search className="h-4 w-4" />
              {t("生成预览")}
            </Button>
          </Toolbar>
        </div>

        {!hasPreview ? (
          <div className="deck-empty-state legacy-import-empty">
            <ShieldCheck className="h-5 w-5" />
            <strong>{t("尚未生成 Legacy 导入预览")}</strong>
            <span>{t("预览只读取目录结构和设置键，不会修改 Legacy，也不会导入真实数据。")}</span>
          </div>
        ) : null}

        {previewValue ? (
          <>
            <div className="legacy-import-summary metric-list">
              <Metric label={t("源目录")} value={previewValue.found ? t("已发现") : t("未发现")} />
              <Metric label={t("可自动导入")} value={String(previewValue.summary.automaticItems)} />
              <Metric label={t("需确认")} value={String(previewValue.summary.confirmationItems)} />
              <Metric label={t("Secrets")} value={String(previewValue.summary.secretItems)} />
              <Metric label={t("默认排除")} value={String(previewValue.summary.excludedItems)} />
              <Metric label={t("冲突")} value={String(previewValue.summary.conflicts)} />
            </div>

            {!previewValue.found ? (
              <div className="deck-empty-state legacy-import-empty">
                <ShieldAlert className="h-5 w-5" />
                <strong>{t("未发现 Legacy 数据目录")}</strong>
                <span>{previewValue.sourceRoot}</span>
              </div>
            ) : (
              <>
                <div className="legacy-import-selectbar">
                  <label className="check-row">
                    <input
                      checked={automaticItems.length > 0 && selectedAutoCount === automaticItems.length}
                      disabled={!automaticItems.length || working}
                      onChange={(event) => selectAllAutomatic(event.currentTarget.checked)}
                      type="checkbox"
                    />
                    <span>{tf("已选择 {0} / {1} 个低风险配置项", [selectedAutoCount, automaticItems.length])}</span>
                  </label>
                  <UiBadge variant="secondary">{t("需确认项只入 ledger，不自动写入")}</UiBadge>
                </div>
                <div className="legacy-import-list">
                  {visibleItems.map((item) => {
                    const canAutoApply = legacyImportItemCanAutoApply(item);
                    return (
                      <label className={`legacy-import-row ${canAutoApply ? "" : "locked"}`} key={item.id}>
                        {canAutoApply ? (
                          <input
                            checked={selectedItemIds.includes(item.id)}
                            disabled={working}
                            onChange={(event) => toggleItem(item, event.currentTarget.checked)}
                            type="checkbox"
                          />
                        ) : (
                          <ShieldAlert className="h-4 w-4" />
                        )}
                        <span>
                          <strong>{legacyImportItemTitle(item)}</strong>
                          <small>{legacyImportItemDetail(item)}</small>
                        </span>
                        <Badge status={canAutoApply ? "ok" : item.requiresConfirmation ? "not_checked" : "disabled"} />
                      </label>
                    );
                  })}
                </div>
                {hiddenItemCount > 0 ? <div className="legacy-import-note">{tf("另有 {0} 个条目未在当前列表展开。", [hiddenItemCount])}</div> : null}
                <LegacyImportEvidence preview={previewValue} />
                <Toolbar>
                  <Button disabled={!canPrepare || working} onClick={() => void prepareTransaction()}>
                    <Download className="h-4 w-4" />
                    {t("准备事务")}
                  </Button>
                  <Button disabled={!transaction || working} onClick={() => void applyTransaction()} variant="secondary">
                    <CheckCircle2 className="h-4 w-4" />
                    {t("应用事务")}
                  </Button>
                  <Button disabled={!transaction || !applyResult || working} onClick={() => void rollbackTransaction()} variant="outline">
                    <ArrowLeft className="h-4 w-4" />
                    {t("回滚事务")}
                  </Button>
                </Toolbar>
              </>
            )}

            {transaction ? (
              <div className="legacy-import-transaction">
                <strong>{t("事务已准备")}</strong>
                <code>{transaction.transactionRoot}</code>
                <small>{tf("Ledger 条目：{0}", [transaction.ledger.entries.length])}</small>
              </div>
            ) : null}

            {applyResult ? (
              <div className="legacy-import-result metric-list">
                <Metric label={t("已导入")} value={String(applyResult.imported)} />
                <Metric label={t("待确认")} value={String(applyResult.pendingConfirmation)} />
                <Metric label={t("跳过")} value={String(applyResult.skipped)} />
                <Metric label={t("失败")} value={String(applyResult.failed)} />
              </div>
            ) : null}

            {rollbackResult ? (
              <div className="legacy-import-result metric-list">
                <Metric label={t("已恢复")} value={rollbackResult.restored ? t("是") : t("否")} />
                <Metric label={t("校验备份")} value={rollbackResult.backupSha256Verified ? t("通过") : t("失败")} />
                <Metric label={t("已标记回滚")} value={String(rollbackResult.entriesMarkedRolledBack)} />
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Panel>
  );
}

function LegacyImportEvidence({ preview }: { preview: LegacyImportPreview }) {
  const conflicts = preview.conflicts.slice(0, 4);
  const excluded = preview.excluded.slice(0, 6);
  if (!conflicts.length && !excluded.length) return null;
  return (
    <div className="legacy-import-evidence">
      {conflicts.length ? (
        <div>
          <strong>{t("冲突")}</strong>
          {conflicts.map((conflict) => (
            <small key={conflict.id}>{conflict.message}</small>
          ))}
        </div>
      ) : null}
      {excluded.length ? (
        <div>
          <strong>{t("默认排除")}</strong>
          {excluded.map((item) => (
            <small key={item.id}>
              {legacyImportCategoryLabel(item.category)} · {item.sizeBytes ? formatBytes(item.sizeBytes) : t("未读取内容")}
            </small>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AboutScreen({
  overview,
  update,
  updateInstallProgress,
  logs,
  diagnostics,
  actions,
}: {
  overview: OverviewResult | null;
  update: UpdateResult | null;
  updateInstallProgress: TaskProgress;
  logs: LogsResult | null;
  diagnostics: DiagnosticsResult | null;
  actions: Actions;
}) {
  const [aboutView, setAboutView] = useState<"overview" | "updates" | "logs" | "diagnostics">("overview");
  const aboutViews = [
    { id: "overview" as const, label: t("产品信息"), icon: Info },
    { id: "updates" as const, label: t("版本更新"), icon: CircleArrowUp },
    { id: "logs" as const, label: t("最近日志"), icon: FileCode2 },
    { id: "diagnostics" as const, label: t("诊断报告"), icon: Stethoscope },
  ];
  return (
    <div className="deck-page about-deck-page">
      <section className="about-brand-band">
        <img alt="Codex Deck" src={codexDeckLogo} />
        <div className="about-brand-copy">
          <span>{t("Codex 管理控制台")}</span>
          <h2>Codex Deck</h2>
          <p>{t("本地 Codex 增强、供应商管理和运行维护工具")}</p>
        </div>
        <div className="about-version-block">
          <small>{t("当前版本")}</small>
          <strong>{overview?.current_version ?? update?.currentVersion ?? "-"}</strong>
          <Badge status={update?.updateAvailable ? "missing" : "ok"} />
        </div>
        <div className="about-brand-actions">
          <Button onClick={() => void actions.openExternalUrl("https://github.com/nanzheyin/-codexplus")} variant="secondary"><ExternalLink className="h-4 w-4" />GitHub</Button>
          <Button onClick={() => void actions.openExternalUrl("https://github.com/nanzheyin/-codexplus/issues")} variant="outline"><MessageCircle className="h-4 w-4" />{t("反馈问题")}</Button>
        </div>
      </section>
      <nav aria-label={t("关于页面视图")} className="deck-tabs about-view-tabs">
        {aboutViews.map((view) => {
          const Icon = view.icon;
          return <button aria-current={aboutView === view.id ? "page" : undefined} className={aboutView === view.id ? "active" : ""} key={view.id} onClick={() => setAboutView(view.id)} type="button"><Icon className="h-4 w-4" /><span><strong>{view.label}</strong></span></button>;
        })}
      </nav>
      {aboutView === "overview" ? (
      <Panel>
        <CardHead title={t("关于 Codex Deck")} detail={t("本地 Codex 增强、管理工具和安装包维护")} />
        <CardContent>
          <div className="metric-list">
            <Metric label={t("Codex Deck 版本")} value={overview?.current_version ?? update?.currentVersion ?? "-"} />
            <Metric label={t("Codex 版本")} value={overview?.codex_version ?? t("未检测到")} />
            <Metric label={t("项目地址")} value="github.com/nanzheyin/-codexplus" />
          </div>
          <p className="about-disclaimer">{t("第三方非官方 Codex 管理工具，与 OpenAI 无隶属或背书关系。")}</p>
          <Toolbar>
            <Button onClick={() => void actions.openExternalUrl("https://github.com/nanzheyin/-codexplus")} variant="secondary">
              <ExternalLink className="h-4 w-4" />
              {t("打开项目主页")}
            </Button>
            <Button onClick={() => void actions.openExternalUrl("https://github.com/nanzheyin/-codexplus/issues")} variant="secondary">
              <ExternalLink className="h-4 w-4" />
              {t("反馈问题")}
            </Button>
            <Button onClick={() => void actions.openExternalUrl("https://discord.gg/y96kX7A76v")} variant="secondary">
              <MessageCircle className="h-4 w-4" />
              Discord
            </Button>
            <Button onClick={() => void actions.openExternalUrl("https://t.me/CodexPlusPlus")} variant="secondary">
              <MessageCircle className="h-4 w-4" />
              Telegram
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      ) : null}
      {aboutView === "updates" ? (
      <Panel>
        <CardHead title={t("GitHub Release 更新")} detail={tf("当前版本 {0}", [overview?.current_version ?? update?.currentVersion ?? "-"])} />
        <CardContent>
          <div className="metric-list">
            <Metric label={t("状态")} value={update?.status ?? "not_checked"} />
            <Metric label={t("最新版本")} value={update?.latestVersion ?? t("未检查")} />
            <Metric label={t("资源")} value={update?.assetName ?? "-"} />
            <Metric label={t("进度")} value={`${update?.progress ?? 0}%`} />
          </div>
          <Textarea className="log-view" readOnly value={update?.releaseSummary || update?.message || t("尚未检查 GitHub Release；更新会下载并启动安装包。")} />
          <TaskProgressBox completedTitle={t("上次更新结果")} progress={updateInstallProgress} title={t("安装包更新进度")} />
          <Toolbar>
            <Button onClick={() => void actions.checkUpdate()}>{t("检查更新")}</Button>
            <Button disabled={updateInstallProgress.active} variant="secondary" onClick={() => void actions.performUpdate()}>
              {updateInstallProgress.active ? t("正在下载安装包…") : t("下载并运行安装包")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      ) : null}
      {aboutView === "logs" ? <LogsPanel logs={logs} actions={actions} /> : null}
      {aboutView === "diagnostics" ? <DiagnosticsPanel diagnostics={diagnostics} actions={actions} /> : null}
      <div className="about-community-bar">
        <span>{t("第三方非官方 Codex 管理工具，与 OpenAI 无隶属或背书关系。")}</span>
        <div>
          <Button onClick={() => void actions.openExternalUrl("https://discord.gg/y96kX7A76v")} size="sm" variant="ghost"><MessageCircle className="h-4 w-4" />Discord</Button>
          <Button onClick={() => void actions.openExternalUrl("https://t.me/CodexPlusPlus")} size="sm" variant="ghost"><MessageCircle className="h-4 w-4" />Telegram</Button>
        </div>
      </div>
    </div>
  );
}

type SettingsSection = "general" | "vision" | "stepwise" | "appearance" | "launch";

function SettingsScreen({
  settings,
  theme,
  form,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  theme: Theme;
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const settingsSections: Array<DeckSectionOption<SettingsSection>> = [
    { id: "general", label: t("基础设置"), detail: t("主题与测试模型"), icon: Settings },
    { id: "vision", label: t("视觉模型中转（VL）"), detail: t("图片理解与降级处理"), icon: AppWindow },
    { id: "stepwise", label: "Stepwise", detail: t("建议生成服务配置"), icon: Workflow },
    { id: "appearance", label: t("背景外观"), detail: t("覆盖图片与透明度"), icon: LayoutGrid },
    { id: "launch", label: t("启动参数"), detail: t("Codex App 额外参数"), icon: Rocket },
  ];
  const activeSettingsSection = settingsSections.find((section) => section.id === settingsSection) ?? settingsSections[0];
  const normalizedPersistedSettings = settings ? normalizeSettings(settings.settings) : null;
  const settingsDirty = normalizedPersistedSettings ? JSON.stringify(form) !== JSON.stringify(normalizedPersistedSettings) : false;
  return (
    <div className="deck-page deck-settings-page settings-deck-page" data-active-section={settingsSection}>
      <section className="settings-file-status">
        <span className="settings-file-status-icon"><Settings className="h-5 w-5" /></span>
        <div><strong>{t("Codex Deck 设置")}</strong><small title={settings?.settings_path}>{settings?.settings_path || t("等待读取设置文件")}</small></div>
        <Badge status={settingsDirty ? "missing" : "ok"} />
      </section>
      <div className="deck-settings-layout">
        <DeckSectionNav active={settingsSection} label={t("设置分类")} onChange={setSettingsSection} options={settingsSections} />
        <div className="settings-page-workspace">
      <Panel className="settings-primary-panel">
        <CardHead title={activeSettingsSection.label} detail={activeSettingsSection.detail} />
        <CardContent className="settings-primary-content">
          <div className="basic-settings-list">
            <div className="theme-row">
              <div>
                <strong>{t("界面主题")}</strong>
                <span>{t("当前为")}{theme === "dark" ? t("深色") : t("浅色")}{t("模式。")}</span>
              </div>
              <Button variant="secondary" onClick={actions.toggleTheme}>{t("切换主题")}</Button>
            </div>
            <label className="theme-row settings-test-model-row">
              <strong>{t("供应商测试模型")}</strong>
              <Input
                className="settings-test-model-input"
                value={form.relayTestModel}
                onChange={(event) => onFormChange({ ...form, relayTestModel: event.currentTarget.value })}
                placeholder={t("例如 gpt-5.4-mini")}
              />
            </label>
          </div>
          <div className="settings-block vision-relay-settings-block">
            <div className="section-title">{t("视觉模型中转（VL）")}</div>
            <p className="field-hint">
              {t("纯文本模型（如 DeepSeek-V4/GLM-5.2等）默认不识别图片。开启后，Codex Deck 会先调此处配置的视觉模型 API 把图片翻译为文字，再交给纯文本模型；VL 不可用时自动降级为丢弃图片。")}
              {t("上下文窗口特指调用视觉模型的窗口长度，窗口范围内的图片及文字整体发给视觉模型调用 VL；0 表示不限制。此设置只影响 VL 处理范围，不影响主对话的压缩阈值。")}
            </p>
            <label className="switch-row">
              <input
                checked={form.visionRelay.enabled}
                onChange={(event) => onFormChange({ ...form, visionRelay: { ...form.visionRelay, enabled: event.currentTarget.checked } })}
                type="checkbox"
              />
              <span>
                <strong>{t("启用视觉模型中转")}</strong>
                <span className="field-hint">{t("关闭时，纯文本模型（模型列表里勾选「只支持文本」的）会丢弃图片，视觉模型保留原图")}</span>
              </span>
            </label>
            <Field label={t("上游协议")}>
              <span className="field-hint">{t("VL 模型自身的 API 协议，与主中转协议无关；仅 Chat Completions 格式的请求会触发 VL 处理")}</span>
              <div className="protocol-options">
                <button
                  className={`protocol-option ${form.visionRelay.protocol === "responses" ? "active" : ""}`}
                  disabled={!form.visionRelay.enabled}
                  onClick={() => onFormChange({ ...form, visionRelay: { ...form.visionRelay, protocol: "responses" } })}
                  type="button"
                >
                  Responses API
                </button>
                <button
                  className={`protocol-option ${form.visionRelay.protocol === "chatCompletions" ? "active" : ""}`}
                  disabled={!form.visionRelay.enabled}
                  onClick={() => onFormChange({ ...form, visionRelay: { ...form.visionRelay, protocol: "chatCompletions" } })}
                  type="button"
                >
                  Chat Completions
                </button>
              </div>
            </Field>
            <div className="form-row">
              <Field label="Base URL">
                <Input
                  disabled={!form.visionRelay.enabled}
                  onChange={(event) => onFormChange({ ...form, visionRelay: { ...form.visionRelay, baseUrl: event.currentTarget.value } })}
                  placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                  value={form.visionRelay.baseUrl}
                />
              </Field>
              <Field label="Model">
                <Input
                  disabled={!form.visionRelay.enabled}
                  onChange={(event) => onFormChange({ ...form, visionRelay: { ...form.visionRelay, model: event.currentTarget.value } })}
                  placeholder={t("例如 qwen-vl-plus / kimi-2.6 / gpt-4o-mini")}
                  value={form.visionRelay.model}
                />
              </Field>
            </div>
            <Field label="API Key">
              <Input
                disabled={!form.visionRelay.enabled}
                onChange={(event) => onFormChange({ ...form, visionRelay: { ...form.visionRelay, apiKey: event.currentTarget.value } })}
                type="password"
                value={form.visionRelay.apiKey}
              />
            </Field>
            <Field label={t("最大回复 token")}>
              <Input
                disabled={!form.visionRelay.enabled}
                onChange={(event) => onFormChange({ ...form, visionRelay: { ...form.visionRelay, maxTokens: Number(event.currentTarget.value.replace(/[^\d]/g, "")) || 256 } })}
                placeholder="256"
                type="number"
                value={form.visionRelay.maxTokens}
              />
            </Field>
            <Field label={t("上下文窗口（token）")}>
              <Input
                disabled={!form.visionRelay.enabled}
                onChange={(event) => onFormChange({ ...form, visionRelay: { ...form.visionRelay, contextWindow: Number(event.currentTarget.value.replace(/[^\d]/g, "")) } })}
                placeholder="留空不限制"
                type="number"
                value={form.visionRelay.contextWindow || ""}
              />
            </Field>
          </div>
          <div className="settings-block stepwise-settings-block">
            <div className="section-title">Stepwise</div>
            <div className="stepwise-settings-section">{t("连接")}</div>
            <div className="form-row">
              <Field label="Base URL">
                <Input
                  value={form.codexAppStepwiseBaseUrl}
                  onChange={(event) => onFormChange({ ...form, codexAppStepwiseBaseUrl: event.currentTarget.value })}
                  placeholder="https://api.example.com/v1"
                />
              </Field>
              <Field label="Model">
                <Input
                  value={form.codexAppStepwiseModel}
                  onChange={(event) => onFormChange({ ...form, codexAppStepwiseModel: event.currentTarget.value })}
                  placeholder={t("例如 gpt-5.4-mini")}
                />
              </Field>
            </div>
            <Field label="API Key">
              <Input
                type="password"
                value={form.codexAppStepwiseApiKey}
                onChange={(event) => onFormChange({ ...form, codexAppStepwiseApiKey: event.currentTarget.value })}
              />
            </Field>
            <details className="stepwise-advanced">
              <summary>{t("高级参数")}</summary>
              <div className="form-row">
                <Field label={t("API Key 环境变量")}>
                  <Input
                    value={form.codexAppStepwiseApiKeyEnv}
                    onChange={(event) => onFormChange({ ...form, codexAppStepwiseApiKeyEnv: event.currentTarget.value })}
                  />
                </Field>
                <Field label={t("最多建议数")}>
                  <Input
                    max={6}
                    min={0}
                    type="number"
                    value={form.codexAppStepwiseMaxItems}
                    onChange={(event) =>
                      onFormChange({ ...form, codexAppStepwiseMaxItems: clampNumber(Number(event.currentTarget.value), 0, 6) })
                    }
                  />
                </Field>
              </div>
              <div className="form-row">
                <Field label={t("超时毫秒")}>
                  <Input
                    min={1000}
                    type="number"
                    value={form.codexAppStepwiseTimeoutMs}
                    onChange={(event) =>
                      onFormChange({ ...form, codexAppStepwiseTimeoutMs: clampNumber(Number(event.currentTarget.value), 1000, 60000) })
                    }
                  />
                </Field>
                <Field label={t("最大输入字符")}>
                  <Input
                    min={1000}
                    type="number"
                    value={form.codexAppStepwiseMaxInputChars}
                    onChange={(event) =>
                      onFormChange({ ...form, codexAppStepwiseMaxInputChars: clampNumber(Number(event.currentTarget.value), 1000, 24000) })
                    }
                  />
                </Field>
              </div>
              <Field label={t("最大输出 tokens")}>
                <Input
                  min={100}
                  type="number"
                  value={form.codexAppStepwiseMaxOutputTokens}
                  onChange={(event) =>
                    onFormChange({ ...form, codexAppStepwiseMaxOutputTokens: clampNumber(Number(event.currentTarget.value), 100, 4000) })
                  }
                />
              </Field>
            </details>
            <div className="toolbar stepwise-settings-actions">
              <Button variant="secondary" onClick={() => void actions.testStepwiseSettings(form)}>{t("测试连接")}</Button>
            </div>
          </div>
          <div className="settings-block image-overlay-settings-block">
            <label className="check-row">
              <input
                checked={form.codexAppImageOverlayEnabled}
                onChange={(event) =>
                  onFormChange({ ...form, codexAppImageOverlayEnabled: event.currentTarget.checked })
                }
                type="checkbox"
              />
              <span>{t("启用 Codex 图片覆盖层")}</span>
            </label>
            <div className="form-row">
              <Field label={t("覆盖图片")}>
                <Input
                  value={form.codexAppImageOverlayPath}
                  onChange={(event) => onFormChange({ ...form, codexAppImageOverlayPath: event.currentTarget.value })}
                  placeholder={t("选择 png / jpg / webp / gif / bmp")}
                />
              </Field>
              <Toolbar>
                <Button variant="secondary" onClick={() => void actions.chooseImageOverlayPath()}>
                  {t("选择图片")}
                </Button>
              </Toolbar>
            </div>
            <Field label={tf("透明度 {0}%", [form.codexAppImageOverlayOpacity])}>
              <Input
                min={1}
                max={100}
                type="range"
                value={form.codexAppImageOverlayOpacity}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    codexAppImageOverlayOpacity: clampNumber(Number(event.currentTarget.value), 1, 100),
                  })
                }
              />
            </Field>
            <Field label={t("背景适配方式")}>
              <select
                className="select-input"
                value={form.codexAppImageOverlayFitMode}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    codexAppImageOverlayFitMode: event.currentTarget.value as ImageOverlayFitMode,
                  })
                }
              >
                <option value="fill">{t("填充")}</option>
                <option value="fit">{t("适应")}</option>
                <option value="stretch">{t("拉伸")}</option>
                <option value="tile">{t("平铺")}</option>
                <option value="center">{t("居中")}</option>
              </select>
            </Field>
          </div>
          <div className="toolbar settings-appearance-actions">
            <Button variant="secondary" onClick={() => void actions.resetImageOverlaySettings()}>
              {t("重置背景")}
            </Button>
          </div>
        </CardContent>
      </Panel>
      <Panel className="settings-launch-panel">
        <CardHead title={t("Codex 启动参数")} detail={t("启动 Codex App 时追加到默认 CDP 参数后。留空则保持默认启动行为。")} />
        <CardContent>
          <Field label={t("额外参数")}>
            <Textarea
              className="launch-args-input"
              placeholder="--force_high_performance_gpu"
              spellCheck={false}
              value={codexExtraArgsToInput(form.codexExtraArgs)}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  codexExtraArgs: inputToCodexExtraArgs(event.currentTarget.value),
                })
              }
            />
          </Field>
          <p className="field-hint">{t("每行一个参数，例如 --force_high_performance_gpu。不需要填写 open 或 --args。")}</p>
        </CardContent>
      </Panel>
        </div>
      </div>
      <div className="deck-save-bar settings-save-bar">
        <div>
          <span className={settingsDirty ? "" : "ready"} aria-hidden="true" />
          <div><strong>{settingsDirty ? t("存在未保存更改") : t("设置已同步")}</strong><small>{activeSettingsSection.label}</small></div>
        </div>
        <Button disabled={!settingsDirty && Boolean(settings)} onClick={() => void actions.saveSettings()}><Save className="h-4 w-4" />{t("保存设置")}</Button>
      </div>
    </div>
  );
}

function LogsPanel({ logs, actions }: { logs: LogsResult | null; actions: Actions }) {
  const lines = splitLogLines(logs?.text ?? "");
  return (
    <Panel>
      <CardHead title={t("最近日志")} detail={logs?.path ?? ""} />
      <CardContent>
        <div className="log-lines">
          {lines.length ? (
            lines.map((line, index) => (
              <div className="log-line" key={`${index}-${line.slice(0, 12)}`}>
                <span>{index + 1}</span>
                <code>{line || " "}</code>
              </div>
            ))
          ) : (
            <div className="empty">{t("暂无日志。")}</div>
          )}
        </div>
        <Toolbar>
          <Button onClick={() => void actions.refreshLogs()}>{t("刷新")}</Button>
          <Button variant="secondary" onClick={() => void actions.copyLogs()}>
            {t("复制")}
          </Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function DiagnosticsPanel({ diagnostics, actions }: { diagnostics: DiagnosticsResult | null; actions: Actions }) {
  return (
    <Panel>
      <CardHead title={t("诊断报告")} detail={t("包含版本、路径、设置和平台信息")} />
      <CardContent>
        <Textarea className="log-view tall" readOnly value={diagnostics?.report ?? t("尚未生成诊断报告。")} />
        <Toolbar>
          <Button onClick={() => void actions.refreshDiagnostics()}>{t("重新生成")}</Button>
          <Button variant="secondary" onClick={() => void actions.copyDiagnostics()}>
            {t("复制报告")}
          </Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function RelayProfileList({
  form,
  localRelayEnabled,
  profiles,
  view,
  reorderEnabled,
  onFormChange,
  onEdit,
  disabled = false,
  actions,
}: {
  form: BackendSettings;
  localRelayEnabled: boolean;
  profiles: RelayProfile[];
  view: RelayListView;
  reorderEnabled: boolean;
  onFormChange: (value: BackendSettings) => void;
  onEdit: (id: string) => void;
  disabled?: boolean;
  actions: Actions;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    if (!reorderEnabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = reorderRelayProfiles(form, String(active.id), String(over.id));
    if (next !== form) onFormChange(next);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={profiles.map((profile) => profile.id)} strategy={view === "grid" ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={`relay-profile-list ${view}-view`}>
          {profiles.map((profile) => (
            <SortableRelayProfileCard
              actions={actions}
              form={form}
              localRelayEnabled={localRelayEnabled}
              key={profile.id}
              onEdit={onEdit}
              onFormChange={onFormChange}
              disabled={disabled}
              profile={profile}
              reorderEnabled={reorderEnabled}
              view={view}
            />
          ))}
          {!profiles.length ? <div className="relay-profile-empty">{t("没有匹配的供应商")}</div> : null}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRelayProfileCard({
  form,
  localRelayEnabled,
  profile,
  view,
  reorderEnabled,
  onFormChange,
  onEdit,
  disabled = false,
  actions,
}: {
  form: BackendSettings;
  localRelayEnabled: boolean;
  profile: RelayProfile;
  view: RelayListView;
  reorderEnabled: boolean;
  onFormChange: (value: BackendSettings) => void;
  onEdit: (id: string) => void;
  disabled?: boolean;
  actions: Actions;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: profile.id,
    disabled: !reorderEnabled,
  });
  const selectedDirectProvider = profile.id === form.activeRelayId;
  const active = selectedDirectProvider && !localRelayEnabled;
  const latencyTarget = relayProfileLatencyTarget(profile);
  const [latency, setLatency] = useState<{ status: "idle" | "loading" | "ok" | "failed"; latencyMs: number | null }>({
    status: latencyTarget ? "loading" : "idle",
    latencyMs: null,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const refreshLatency = async () => {
    if (!latencyTarget) {
      setLatency({ status: "idle", latencyMs: null });
      return;
    }
    setLatency({ status: "loading", latencyMs: null });
    const result = await actions.measureRelayLatency(latencyTarget);
    setLatency(
      result && isSuccessStatus(result.status) && result.latencyMs !== null
        ? { status: "ok", latencyMs: result.latencyMs }
        : { status: "failed", latencyMs: null },
    );
  };

  useEffect(() => {
    let active = true;
    if (!latencyTarget) {
      setLatency({ status: "idle", latencyMs: null });
      return () => {
        active = false;
      };
    }
    setLatency({ status: "loading", latencyMs: null });
    void actions.measureRelayLatency(latencyTarget).then((result) => {
      if (!active) return;
      setLatency(
        result && isSuccessStatus(result.status) && result.latencyMs !== null
          ? { status: "ok", latencyMs: result.latencyMs }
          : { status: "failed", latencyMs: null },
      );
    });
    return () => {
      active = false;
    };
  }, [latencyTarget]);

  const aggregateProfile = isAggregateRelayProfile(profile);
  const aggregateCandidates = aggregateProfile ? aggregateMemberCandidates(form, profile.id) : [];
  const aggregateConfig = aggregateProfile ? normalizeAggregateConfig(profile.aggregate, aggregateCandidates) : null;
  const memberCount = aggregateConfig?.members.length ?? 0;
  const candidateCount = aggregateCandidates.length;
  const memberCoverage = candidateCount ? Math.round((memberCount / candidateCount) * 100) : memberCount ? 100 : 0;
  const modelCount = relayProfileModelCount(profile);
  const baseUrl = profile.protocol === "chatCompletions"
    ? profile.upstreamBaseUrl || profile.baseUrl
    : profile.baseUrl || profile.upstreamBaseUrl;
  const latencyLabel = latency.status === "loading"
    ? "..."
    : latency.status === "ok" && latency.latencyMs !== null
      ? tf("{0} ms", [latency.latencyMs])
      : latency.status === "failed"
        ? t("不可用")
        : "--";
  const latencyTone = latency.status === "failed"
    ? "bad"
    : latency.status === "ok" && latency.latencyMs !== null
      ? latency.latencyMs <= 450 ? "good" : latency.latencyMs <= 900 ? "warn" : "bad"
      : "muted";
  const latencyMeter = relayLatencyHealthPercent(latency.status, latency.latencyMs);
  const actionButtons = (
    <>
      <Button
        aria-label={disabled ? t("供应商切换不可用") : active ? t("当前正在使用") : selectedDirectProvider ? t("当前直接供应商") : t("设为直接供应商")}
        className={`relay-use-button ${active ? "active" : ""}`}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          const previousActiveRelayId = form.activeRelayId;
          const next = syncLegacyRelayFields({ ...form, activeRelayId: profile.id });
          void actions.switchRelayProfile(next, previousActiveRelayId);
        }}
        size={view === "grid" ? "icon" : "sm"}
        title={disabled ? t("供应商切换不可用") : active ? t("当前正在使用") : selectedDirectProvider ? t("当前直接供应商") : t("设为直接供应商")}
        variant={selectedDirectProvider ? "secondary" : "outline"}
      >
        {selectedDirectProvider ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {view === "list" ? active ? t("使用中") : selectedDirectProvider ? t("直接供应商") : t("设为直接") : null}
      </Button>
      <span className="relay-card-extra">
        <Button
          aria-label={aggregateProfile ? t("聚合供应商会在真实对话中轮转成员，请测试成员供应商") : t("发送 hi 测试")}
          disabled={aggregateProfile}
          onClick={(event) => {
            event.stopPropagation();
            if (aggregateProfile) return;
            void actions.testRelayProfile(profile);
          }}
          size="icon"
          title={aggregateProfile ? t("聚合供应商会在真实对话中轮转成员，请测试成员供应商") : t("发送 hi 测试")}
          variant="ghost"
        >
          <TestTube className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t("编辑")}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(profile.id);
          }}
          size="icon"
          title={t("编辑")}
          variant="ghost"
        >
          <Edit3 className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t("复制")}
          onClick={(event) => {
            event.stopPropagation();
            onFormChange(duplicateRelayProfile(form, profile.id));
          }}
          size="icon"
          title={t("复制")}
          variant="ghost"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t("删除供应商")}
          disabled={form.relayProfiles.length <= 1}
          onClick={(event) => {
            event.stopPropagation();
            onFormChange(removeRelayProfile(form, profile.id));
          }}
          size="icon"
          title={t("删除供应商")}
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </span>
    </>
  );

  if (view === "list") {
    return (
      <div
        className={`relay-profile-card list-view ${active ? "active" : ""} ${isDragging ? "dragging" : ""}`}
        data-relay-profile-id={profile.id}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEdit(profile.id);
        }}
        ref={setNodeRef}
        style={style}
        tabIndex={0}
      >
        <button
          aria-label={t("拖动排序")}
          className="relay-drag"
          disabled={!reorderEnabled}
          title={t("拖动排序")}
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="relay-index" title={profile.name || t("未命名供应商")}>
          {providerInitial(profile.name)}
        </span>
        <span className="relay-summary">
          <strong>{profile.name || t("未命名供应商")}</strong>
          <small>{relayModeLabel(profile.relayMode)} · {relayProtocolLabel(profile.protocol)} · {relayProfileConfigBrief(profile)}</small>
        </span>
        <button
          className={`relay-latency ${latency.status}`}
          disabled={!latencyTarget || latency.status === "loading"}
          onClick={(event) => {
            event.stopPropagation();
            void refreshLatency();
          }}
          title={latencyTarget ? t("重新检测延迟") : t("此供应商没有单一目标 URL")}
          type="button"
        >
          <Gauge className="h-4 w-4" />
          <span>{latencyLabel}</span>
        </button>
        <span className="relay-card-actions">{actionButtons}</span>
      </div>
    );
  }

  return (
    <div
      className={`relay-profile-card grid-view ${active ? "active" : ""} ${isDragging ? "dragging" : ""}`}
      data-relay-profile-id={profile.id}
      onKeyDown={(event) => {
        if (event.key === "Enter") onEdit(profile.id);
      }}
      ref={setNodeRef}
      style={style}
      tabIndex={0}
    >
      <div className="relay-card-head">
        <button
          aria-label={t("拖动排序")}
          className="relay-drag"
          disabled={!reorderEnabled}
          title={t("拖动排序")}
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className={`relay-index ${aggregateProfile ? "aggregate" : ""}`} title={profile.name || t("未命名供应商")}>
          {providerInitial(profile.name)}
        </span>
        <span className="relay-summary">
          <strong>{profile.name || t("未命名供应商")}</strong>
          <small>{aggregateProfile && aggregateConfig ? aggregateStrategyLabel(aggregateConfig.strategy) : relayProtocolLabel(profile.protocol)}</small>
        </span>
        <span className="relay-card-badges">
          {active ? <span className="relay-card-badge current">{t("使用中")}</span> : selectedDirectProvider ? <span className="relay-card-badge current">{t("直接供应商")}</span> : null}
          <span className={`relay-card-badge ${aggregateProfile ? "aggregate" : "mode"}`}>
            {aggregateProfile ? t("聚合") : relayModeLabel(profile.relayMode)}
          </span>
        </span>
      </div>

      <div className="relay-card-details">
        {aggregateProfile && aggregateConfig ? (
          <>
            <div className="relay-card-detail">
              <span><Workflow className="h-4 w-4" />{t("策略")}</span>
              <strong>{aggregateStrategyLabel(aggregateConfig.strategy)}</strong>
            </div>
            <div className="relay-card-detail">
              <span><Users className="h-4 w-4" />{t("成员供应商")}</span>
              <strong>{tf("{0} 个成员", [memberCount])}</strong>
            </div>
            <div className="relay-card-detail">
              <span><ShieldCheck className="h-4 w-4" />{t("成员配置")}</span>
              <strong>{memberCount} / {candidateCount}</strong>
            </div>
          </>
        ) : (
          <>
            <div className="relay-card-detail">
              <span><Network className="h-4 w-4" />{t("协议")}</span>
              <strong>{relayProtocolLabel(profile.protocol)}</strong>
            </div>
            <div className="relay-card-detail">
              <span><Link2 className="h-4 w-4" />{t("Base URL")}</span>
              <code title={baseUrl || t("未填写 URL")}>{baseUrl || t("未填写 URL")}</code>
            </div>
            <div className="relay-card-detail">
              <span><Boxes className="h-4 w-4" />{t("模型配置")}</span>
              <strong>{modelCount ? tf("{0} 个模型", [modelCount]) : t("未配置")}</strong>
            </div>
          </>
        )}
      </div>

      <div className="relay-card-health">
        <div className="relay-card-health-head">
          <span>{aggregateProfile ? t("成员配置") : t("连接延迟")}</span>
          {aggregateProfile ? (
            <strong className={memberCount ? "good" : "bad"}>{memberCount} / {candidateCount}</strong>
          ) : (
            <button
              className={latencyTone}
              disabled={!latencyTarget || latency.status === "loading"}
              onClick={(event) => {
                event.stopPropagation();
                void refreshLatency();
              }}
              title={latencyTarget ? t("重新检测延迟") : t("此供应商没有单一目标 URL")}
              type="button"
            >
              {latencyLabel}
            </button>
          )}
        </div>
        <div className="relay-card-meter" aria-hidden="true">
          <span
            className={aggregateProfile ? memberCount ? "good" : "bad" : latencyTone}
            style={{ width: `${aggregateProfile ? memberCoverage : latencyMeter}%` }}
          />
        </div>
      </div>

      <div className="relay-card-footer">
        <span className="relay-card-check-time">
          <Clock3 className="h-4 w-4" />
          {aggregateProfile
            ? tf("{0} 个成员", [memberCount])
            : latency.status === "loading"
              ? t("正在检测")
              : latency.status === "failed"
                ? t("检测失败")
                : latency.status === "ok"
                  ? t("刚刚检测")
                  : t("未检测")}
        </span>
        <span className="relay-card-actions">{actionButtons}</span>
      </div>
    </div>
  );
}

function MarketScriptCard({ script, actions }: { script: ScriptMarketItem; actions: Actions }) {
  const status = script.updateAvailable ? t("可更新") : script.installed ? tf("已安装 {0}", [script.installedVersion]) : t("未安装");
  return (
    <div className="script-market-card">
      <div className="script-market-title">
        <div>
          <strong>{script.name}</strong>
          <span>{script.author || t("未知作者")}</span>
        </div>
        <UiBadge variant={script.updateAvailable ? "default" : script.installed ? "secondary" : "outline"}>{status}</UiBadge>
      </div>
      <p className="script-market-description">{script.description || t("暂无描述。")}</p>
      <div className="script-market-tags">
        <span className="script-market-tag">v{script.version}</span>
        {script.tags.map((tag) => (
          <span className="script-market-tag" key={tag}>{tag}</span>
        ))}
      </div>
      <div className="script-market-actions">
        <Button onClick={() => void actions.installMarketScript(script.id)} size="sm">
          <Download className="h-4 w-4" />
          {script.updateAvailable ? t("更新") : script.installed ? t("重新安装") : t("安装")}
        </Button>
        {script.homepage ? (
          <Button onClick={() => void actions.openExternalUrl(script.homepage)} size="sm" variant="secondary">
            <ExternalLink className="h-4 w-4" />
            {t("主页")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RelayProfileDetail({
  profile,
  relayFiles,
  form,
  isNew = false,
  localRelayEnabled = false,
  onBack,
  onFormChange,
  onSaved,
  actions,
}: {
  profile: RelayProfile;
  relayFiles: RelayFilesResult | null;
  form: BackendSettings;
  isNew?: boolean;
  localRelayEnabled?: boolean;
  onBack: () => void;
  onFormChange: (value: BackendSettings) => void | Promise<void>;
  onSaved?: () => void;
  actions: Actions;
}) {
  const [draft, setDraft] = useState<RelayProfile>(profile);
  const [modelWindowRows, setModelWindowRows] = useState<ModelWindowRow[]>(
    modelWindowRowsFromProfile(
      profile.modelList,
      profile.modelWindows || "",
      profile.modelImageSupport || "",
      profile.modelReasoningSupport || "",
    ),
  );
  const isActive = !isNew && profile.id === form.activeRelayId;
  const profileUsesLiveFiles = relayProfileUsesLiveFiles(profile);
  useEffect(() => {
    const nextDraft = isAggregateRelayProfile(profile)
      ? normalizeAggregateRelayProfile(profile, form)
      : deriveRelayProfileFromFiles(
          isActive && profileUsesLiveFiles && relayFiles
            ? {
              ...profile,
              configContents: relayFiles.configContents,
              authContents: relayFiles.authContents,
            }
            : profile,
        );
    setDraft(nextDraft);
    setModelWindowRows(
      modelWindowRowsFromProfile(
        nextDraft.modelList,
        nextDraft.modelWindows || "",
        nextDraft.modelImageSupport || "",
        nextDraft.modelReasoningSupport || "",
      ),
    );
  }, [profile.id, profile.modelList, profile.modelWindows, profileUsesLiveFiles, isActive, isNew, relayFiles?.configContents, relayFiles?.authContents]);
  const validationError = isAggregateRelayProfile(draft) ? aggregateRelayProfileValidation(draft) : null;
  const draftWithModelRows = () => {
    const serializedRows = serializeModelWindowRows(modelWindowRows);
    return {
      ...draft,
      modelList: serializedRows.modelList,
      modelWindows: serializedRows.modelWindows,
      modelImageSupport: serializedRows.modelImageSupport,
      modelReasoningSupport: serializedRows.modelReasoningSupport,
    };
  };
  const saveDraft = async () => {
    if (validationError) return;
    const draftWithWindows = draftWithModelRows();
    const normalizedDraft = isAggregateRelayProfile(draftWithWindows) ? normalizeAggregateRelayProfile(draftWithWindows, form) : deriveRelayProfileFromFiles(draftWithWindows);
    const next = isNew
      ? addRelayProfile(form, normalizedDraft)
      : updateRelayProfile(form, profile.id, normalizedDraft);
    await onFormChange(next);
    if (!localRelayEnabled && isActive && relayProfileUsesLiveFiles(normalizedDraft)) {
      await actions.saveRelayFile(
        "config",
        effectiveRelayConfigPreview(normalizedDraft, form, normalizedDraft),
        true,
      );
      await actions.saveRelayFile("auth", normalizedDraft.authContents, true);
    }
    onSaved?.();
  };
  const switchDraft = () => {
    if (isNew || !form.relayProfilesEnabled) return;
    const draftWithWindows = draftWithModelRows();
    const normalizedDraft = isAggregateRelayProfile(draftWithWindows) ? normalizeAggregateRelayProfile(draftWithWindows, form) : deriveRelayProfileFromFiles(draftWithWindows);
    const previousActiveRelayId = form.activeRelayId;
    const next = syncLegacyRelayFields({
      ...form,
      relayProfiles: form.relayProfiles.map((item) => (item.id === profile.id ? normalizedDraft : item)),
      activeRelayId: profile.id,
    });
    void actions.switchRelayProfile(next, previousActiveRelayId);
  };
  return (
    <div className="relay-detail-page" key={profile.id}>
      <div className="relay-detail-sticky">
        <Toolbar>
          <Button onClick={onBack} variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            {t("返回列表")}
          </Button>
          <Button disabled={!!validationError} onClick={() => void saveDraft()} title={validationError || t("保存")}>
            <Save className="h-4 w-4" />
            {t("保存")}
          </Button>
        </Toolbar>
      </div>
        <RelayProfileEditor profile={draft} form={form} isNew={isNew} localRelayEnabled={localRelayEnabled} onFormChange={onFormChange} onProfileChange={setDraft} onSwitch={switchDraft} actions={actions} modelWindowRows={modelWindowRows} setModelWindowRows={setModelWindowRows} />
      {isAggregateRelayProfile(draft) ? null : (
      <RelayFileEditors
        contextProfile={profile}
        profile={draft}
        form={form}
        isActive={isActive}
        profileId={profile.id}
        onFormChange={onFormChange}
        onProfileChange={setDraft}
        actions={actions}
      />
      )}
    </div>
  );
}

function ContextScreen({
  form,
  liveEntries,
  relayFiles,
  onFormChange,
  actions,
}: {
  form: BackendSettings;
  liveEntries: CodexContextEntries | null;
  relayFiles: RelayFilesResult | null;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  return (
    <Panel className="context-screen-panel" fill>
      <CardContent className="context-screen-content">
        <RelayContextManager
          form={normalizeSettings(form)}
          liveEntries={liveEntries}
          relayFiles={relayFiles}
          onFormChange={onFormChange}
          actions={actions}
        />
      </CardContent>
    </Panel>
  );
}

function RelayProfileEditor({
  profile,
  form,
  isNew = false,
  localRelayEnabled = false,
  onFormChange,
  onProfileChange,
  onSwitch,
  actions,
  modelWindowRows,
  setModelWindowRows,
}: {
  profile: RelayProfile;
  form: BackendSettings;
  isNew?: boolean;
  localRelayEnabled?: boolean;
  onFormChange: (value: BackendSettings) => void;
  onProfileChange: (value: RelayProfile) => void;
  onSwitch: () => void;
  actions: Actions;
  modelWindowRows: ModelWindowRow[];
  setModelWindowRows: (value: ModelWindowRow[]) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [doctorResult, setDoctorResult] = useState<ProviderDoctorResult | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [doctorRunning, setDoctorRunning] = useState(false);
  if (isAggregateRelayProfile(profile)) {
    return (
      <AggregateRelayProfileEditor
        profile={profile}
        form={form}
        isNew={isNew}
        onProfileChange={onProfileChange}
      />
    );
  }

  const showApiFields = profile.relayMode !== "official" || profile.officialMixApiKey;
  const showProviderTools = showApiFields || isOAuthRelayProfile(profile);
  const updateDraft = (patch: Partial<RelayProfile>) => {
    onProfileChange(applyRelayProfilePatchToFiles(profile, patch, { allowGenerateFiles: isNew }));
  };
  const updateModelWindowRow = (index: number, patch: Partial<ModelWindowRow>) => {
    setModelWindowRows(
      modelWindowRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };
  const removeModelWindowRow = (index: number) => {
    const nextRows = modelWindowRows.filter((_, rowIndex) => rowIndex !== index);
    setModelWindowRows(nextRows.length ? nextRows : [{ model: "", window: "", textOnly: false, noReasoning: false }]);
  };
  const addModelWindowRows = (rows: ModelWindowRow[]) => {
    setModelWindowRows(mergeModelWindowRows(modelWindowRows, rows));
  };
  const runProviderDoctor = async () => {
    setDoctorOpen(true);
    setDoctorRunning(true);
    setDoctorResult(null);
    const serializedRows = serializeModelWindowRows(modelWindowRows);
    const result = await actions.diagnoseRelayProfile(
      deriveRelayProfileFromFiles({
        ...profile,
        modelList: serializedRows.modelList,
        modelWindows: serializedRows.modelWindows,
        modelImageSupport: serializedRows.modelImageSupport,
      modelReasoningSupport: serializedRows.modelReasoningSupport,
      }),
    );
    setDoctorResult(result);
    setDoctorRunning(false);
  };
  return (
    <div className="relay-profile-editor">
      <div className="relay-editor-head">
        <div>
          <strong>{profile.name || t("未命名供应商")}</strong>
          <span>{relayProfileEditorStatus(profile, form, isNew)}</span>
        </div>
        {isNew ? null : (
          <Button
            disabled={!form.relayProfilesEnabled || actions.relaySwitching}
            onClick={onSwitch}
            title={!form.relayProfilesEnabled ? t("供应商配置总开关已关闭") : actions.relaySwitching ? t("供应商切换中") : undefined}
            variant={profile.id === form.activeRelayId ? "secondary" : "default"}
          >
            {actions.relaySwitching
              ? t("切换中")
              : profile.id === form.activeRelayId
                ? localRelayEnabled ? t("直接供应商") : t("使用中")
                : t("设为直接供应商")}
          </Button>
        )}
      </div>
      {isNew ? (
        <ProviderPresetSelector
          onSelect={(patch: PresetPatch) => {
            updateDraft(patch as unknown as Partial<RelayProfile>);
          }}
        />
      ) : null}
      <div className="relay-fields">
        <Field className="relay-field-name" label={t("名称")}>
          <Input
            value={profile.name}
            onChange={(event) => updateDraft({ name: event.currentTarget.value })}
          />
        </Field>
        <Field className="relay-field-mode" label={t("接入模式")}>
          <select
            className="field-select"
            value={profile.relayMode}
            onChange={(event) => {
              const relayMode = event.currentTarget.value as RelayMode;
              updateDraft(relayMode === "official" ? { relayMode, officialMixApiKey: false } : { relayMode });
            }}
          >
            <option value="official">{t("官方登录")}</option>
            <option value="pureApi">{t("纯 API")}</option>
          </select>
        </Field>
        <Field className="relay-field-config-model" label={t("配置模型")}>
          <Input
            value={profile.model}
            onChange={(event) => updateDraft({ model: event.currentTarget.value })}
            placeholder={t("例如 deepseek-v4-pro")}
          />
          <p className="field-hint">
            {t("默认启动 Codex 时使用的模型名，请勿带后缀；上下文窗口请在下方「模型列表」中按模型单独配置。")}
          </p>
        </Field>
        <Field className="relay-field-goals" label={t("Codex 目标")}>
          <label className="inline-check">
            <input
              checked={configHasCodexGoalsFeature(profile.configContents)}
              onChange={(event) =>
                updateDraft({
                  configContents: setCodexGoalsFeatureInConfig(profile.configContents, event.currentTarget.checked),
                })
              }
              type="checkbox"
            />
            <span>{t("启用目标功能")}</span>
          </label>
          <label className="inline-check">
            <input
              checked={form.codexAppGoalResumeGuard}
              onChange={(event) => onFormChange({ ...form, codexAppGoalResumeGuard: event.currentTarget.checked })}
              type="checkbox"
            />
            <span>{t("启用目标续跑保护")}</span>
          </label>
          <p className="field-hint">
            {t("检测到目标上下文时，Codex Deck 会在中转请求中追加续跑保护提示，减少压缩后重做旧任务。")}
          </p>
        </Field>
        <div className="relay-advanced-toggle">
          <Button
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((current) => !current)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Settings className="h-4 w-4" />
            {t("更多选项")}
          </Button>
        </div>
        {showAdvanced ? (
          <div className="relay-advanced-fields">
            <Field className="relay-field-test-model" label={t("测试模型")}>
              <Input
                value={profile.testModel}
                onChange={(event) => updateDraft({ testModel: event.currentTarget.value })}
                placeholder={tf("留空使用默认：{0}", [form.relayTestModel || defaultSettings.relayTestModel])}
              />
            </Field>
            <Field className="relay-field-context-window" label={t("上下文大小")}>
              <Input
                inputMode="numeric"
                value={profile.contextWindow}
                onChange={(event) => updateDraft({ contextWindow: event.currentTarget.value.replace(/[^\d]/g, "") })}
                placeholder={t("留空不改写，例如 200000")}
              />
            </Field>
            <Field className="relay-field-auto-compact" label={t("压缩上下文大小")}>
              <Input
                inputMode="numeric"
                value={profile.autoCompactLimit}
                onChange={(event) => updateDraft({ autoCompactLimit: event.currentTarget.value.replace(/[^\d]/g, "") })}
                placeholder={t("留空不改写，例如 160000")}
              />
            </Field>
          </div>
        ) : null}
        {profile.relayMode === "official" ? (
          <Field className="relay-field-official-key" label="API Key">
            <label className="inline-check">
              <input
                checked={profile.officialMixApiKey}
                onChange={(event) => updateDraft({ officialMixApiKey: event.currentTarget.checked })}
                type="checkbox"
              />
              <span>{t("混入 API KEY")}</span>
            </label>
          </Field>
        ) : null}
        {showApiFields ? (
          <div className="relay-api-fields">
            <Field className="relay-field-base-url" label="Base URL">
              <Input
                value={profile.baseUrl}
                onChange={(event) => updateDraft({ baseUrl: event.currentTarget.value })}
                placeholder={t("填写中转服务 Base URL")}
              />
            </Field>
            <Field className="relay-field-key" label="Key">
              <Input
                type="password"
                value={profile.apiKey}
                onChange={(event) => updateDraft({ apiKey: event.currentTarget.value })}
                placeholder={t("输入中转服务的 API Key")}
              />
            </Field>
            <Field className="relay-field-protocol" label={t("上游协议")}>
              <div className="protocol-options">
                <button
                  className={`protocol-option ${profile.protocol === "responses" ? "active" : ""}`}
                  onClick={() => updateDraft({ protocol: "responses" })}
                  type="button"
                >
                  Responses API
                </button>
                <button
                  className={`protocol-option ${profile.protocol === "chatCompletions" ? "active" : ""}`}
                  onClick={() => updateDraft({ protocol: "chatCompletions" })}
                  type="button"
                >
                  Chat Completions
                </button>
              </div>
            </Field>
          </div>
        ) : null}
        {showProviderTools ? (
          <div className="provider-doctor">
            <div className="provider-doctor-head">
              <div>
                <strong>Provider Doctor</strong>
                <span>{t("检查配置、模型列表和一次真实请求，定位供应商不可用原因。")}</span>
              </div>
              <Button onClick={() => void runProviderDoctor()} size="sm" type="button" variant="secondary">
                <Stethoscope className="h-4 w-4" />
                {t("诊断供应商")}
              </Button>
            </div>
            <span>{doctorResult?.summary ?? t("点击后会打开诊断弹框，按步骤检查供应商。")}</span>
          </div>
        ) : null}
        {showProviderTools ? (
          <Field className="relay-field-model-list" label={t("模型列表")}>
            <div className="relay-model-row-editor">
              <div className="relay-model-row relay-model-row-head">
                <span>{t("模型名称")}</span>
                <span>{t("上下文窗口")}</span>
                <span>{t("只支持文本")}</span>
                <span>{t("不支持推理")}</span>
                <span />
              </div>
              {modelWindowRows.map((row, index) => (
                <div className="relay-model-row" key={`${index}-${row.model}`}>
                  <Input
                    value={row.model}
                    onChange={(event) => updateModelWindowRow(index, { model: event.currentTarget.value })}
                    placeholder="deepseek/deepseek-v4-flash"
                  />
                  <Input
                    value={row.window}
                    onChange={(event) => updateModelWindowRow(index, { window: event.currentTarget.value })}
                    placeholder="1M"
                  />
                  <label className="relay-model-image-support">
                    <input
                      checked={row.textOnly}
                      disabled={!row.model.trim()}
                      onChange={(event) => updateModelWindowRow(index, { textOnly: event.currentTarget.checked })}
                      title={t("仅 Chat Completions 协议生效：标记为纯文本模型（DeepSeek-V4/GLM-5.2 等），Codex Deck 在转发前静默丢弃 input_image；务必同时在 Codex Deck 设置中配置支持图片输入的模型以解析 input_image")}
                      type="checkbox"
                    />
                  </label>
                  <label className="relay-model-image-support">
                    <input
                      checked={row.noReasoning}
                      disabled={!row.model.trim()}
                      onChange={(event) => updateModelWindowRow(index, { noReasoning: event.currentTarget.checked })}
                      title={t("勾选以标记为不支持 reasoning 的模型（如 kimi-2.6 on Ark），Codex Deck 会在透传前剥除 reasoning 字段")}
                      type="checkbox"
                    />
                  </label>
                  <Button
                    aria-label={t("删除模型")}
                    onClick={() => removeModelWindowRow(index)}
                    size="icon"
                    title={t("删除模型")}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="relay-model-list-tools">
              <Button
                onClick={() => setModelWindowRows([...modelWindowRows, { model: "", window: "", textOnly: false, noReasoning: false }])}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Plus className="h-4 w-4" />
                {t("添加模型")}
              </Button>
              <Button
                onClick={async () => {
                  const serializedRows = serializeModelWindowRows(modelWindowRows);
                  const models = await actions.fetchRelayProfileModels({
                    ...profile,
                    modelList: serializedRows.modelList,
                    modelWindows: serializedRows.modelWindows,
                    modelImageSupport: serializedRows.modelImageSupport,
                    modelReasoningSupport: serializedRows.modelReasoningSupport,
                  });
                  if (models?.length) {
                    addModelWindowRows(models.map((model) => ({ model, window: "", textOnly: false, noReasoning: false })));
                  }
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Download className="h-4 w-4" />
                {t("从上游获取")}
              </Button>
            </div>
            <p className="field-hint">
              {t("每行一个模型；上下文窗口可填")} <code>1M</code>{t("、")}<code>200K</code> {t("或")} <code>1000000</code>{t("，留空表示使用 Codex 默认长度。")}
              <br />
              {t("以下仅在选择 Chat Completions 协议时生效：勾选「只支持文本」可标记为纯文本模型（DeepSeek-V4/GLM-5.2等），Codex Deck 会在转发前静默丢弃 input_image；务必同时在 Codex Deck 设置中配置支持图片输入的模型，input_image 将由该模型解析。")}
            </p>
          </Field>
        ) : null}
        {showProviderTools ? (
          <Field className="relay-field-user-agent" label="User-Agent">
            <Input
              value={profile.userAgent}
              onChange={(event) => updateDraft({ userAgent: event.currentTarget.value })}
              placeholder={t("留空使用默认值")}
            />
          </Field>
        ) : null}
      </div>
      {showApiFields && profile.protocol === "chatCompletions" ? (
        <div className="hint-line relay-protocol-hint">
          <MessageCircle className="h-4 w-4" />
          <span>{t("此上游会通过本地 127.0.0.1:57321 转成 Responses API，需要从 Codex Deck 启动 Codex。")}</span>
        </div>
      ) : null}
      <div className="hint-line relay-protocol-hint">
        <ShieldCheck className="h-4 w-4" />
        <span>{relayProfileModeHelp(profile)}</span>
      </div>
      {doctorOpen ? (
        <ProviderDoctorModal
          result={doctorResult}
          running={doctorRunning}
          onClose={() => {
            if (!doctorRunning) setDoctorOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function AggregateRelayProfileEditor({
  profile,
  form,
  isNew = false,
  onProfileChange,
}: {
  profile: RelayProfile;
  form: BackendSettings;
  isNew?: boolean;
  onProfileChange: (value: RelayProfile) => void;
}) {
  const candidates = aggregateMemberCandidates(form, profile.id);
  const aggregate = normalizeAggregateConfig(profile.aggregate, candidates);
  const memberIds = new Set(aggregate.members.map((member) => member.profileId));
  const updateAggregate = (nextAggregate: RelayAggregateConfig) => {
    onProfileChange(normalizeAggregateRelayProfile({ ...profile, aggregate: nextAggregate }, form));
  };
  const toggleMember = (profileId: string, checked: boolean) => {
    const members = checked
      ? [...aggregate.members, { profileId, weight: 1 }]
      : aggregate.members.filter((member) => member.profileId !== profileId);
    updateAggregate({ ...aggregate, members });
  };
  const updateWeight = (profileId: string, weight: number) => {
    updateAggregate({
      ...aggregate,
      members: aggregate.members.map((member) =>
        member.profileId === profileId ? { ...member, weight: clampAggregateWeight(weight) } : member,
      ),
    });
  };
  const totalWeight = aggregate.members.reduce((total, member) => total + clampAggregateWeight(member.weight), 0);

  return (
    <div className="relay-profile-editor aggregate-editor">
      <div className="relay-editor-head">
        <div>
          <strong>{profile.name || t("未命名聚合供应商")}</strong>
          <span>{isNew ? t("选择已有供应商作为成员，保存后写入 settings payload") : t("聚合配置只引用已有供应商，不复制 Key 和配置文件")}</span>
        </div>
        <UiBadge variant="secondary">{t("聚合")}</UiBadge>
      </div>
      <div className="relay-fields aggregate-fields">
        <Field className="relay-field-name" label={t("名称")}>
          <Input
            value={profile.name}
            onChange={(event) => onProfileChange({ ...profile, name: event.currentTarget.value })}
            placeholder={t("例如 主力聚合池")}
          />
        </Field>
        <Field className="relay-field-test-model" label={t("测试模型")}>
          <Input
            value={profile.testModel}
            onChange={(event) => onProfileChange({ ...profile, testModel: event.currentTarget.value })}
            placeholder={tf("留空使用默认：{0}", [form.relayTestModel || defaultSettings.relayTestModel])}
          />
        </Field>
        <Field className="aggregate-strategy-field" label={t("聚合策略")}>
          <select
            className="field-select"
            value={aggregate.strategy}
            onChange={(event) => updateAggregate({ ...aggregate, strategy: event.currentTarget.value as RelayAggregateStrategy })}
          >
            {aggregateStrategyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="aggregate-strategy-grid">
        {aggregateStrategyOptions.map((option) => (
          <button
            className={`mode-option aggregate-strategy-option ${aggregate.strategy === option.value ? "active" : ""}`}
            key={option.value}
            onClick={() => updateAggregate({ ...aggregate, strategy: option.value })}
            type="button"
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
      <div className="aggregate-members">
        <div className="aggregate-members-head">
          <div>
            <strong>{t("成员供应商")}</strong>
            <span>{t("只能勾选已填写 Base URL / Key 的 API 供应商，聚合供应商不会作为成员。")}</span>
          </div>
          <UiBadge variant="outline">{aggregate.members.length} / {candidates.length}</UiBadge>
        </div>
        {candidates.length ? (
          <div className="aggregate-member-list">
            {candidates.map((candidate) => {
              const member = aggregate.members.find((item) => item.profileId === candidate.id);
              const checked = memberIds.has(candidate.id);
              return (
                <label className={`aggregate-member-row ${checked ? "selected" : ""}`} key={candidate.id}>
                  <input
                    checked={checked}
                    onChange={(event) => toggleMember(candidate.id, event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span className="aggregate-member-summary">
                    <strong>{candidate.name || t("未命名供应商")}</strong>
                    <small>{relayModeLabel(candidate.relayMode)} · {relayProtocolLabel(candidate.protocol)} · {relayProfileConfigBrief(candidate)}</small>
                  </span>
                  <span className="aggregate-weight-box">
                    <span>{t("权重")}</span>
                    <Input
                      disabled={!checked}
                      min={1}
                      onChange={(event) => updateWeight(candidate.id, Number.parseInt(event.currentTarget.value, 10))}
                      type="number"
                      value={String(member?.weight ?? 1)}
                    />
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="empty">{t("先添加至少 1 个已填写 Base URL / Key 的 API 供应商，再创建聚合供应商。")}</div>
        )}
      </div>
      <div className="relay-grid compact aggregate-preview">
        <Metric label={t("策略")} value={aggregateStrategyLabel(aggregate.strategy)} />
        <Metric label={t("成员数量")} value={tf("{0} 个", [aggregate.members.length])} />
        <Metric label={t("总权重")} value={`${totalWeight}`} />
        <Metric label={t("序列化字段")} value="aggregate.strategy / aggregate.members" />
      </div>
      <div className="hint-line relay-protocol-hint">
        <ShieldCheck className="h-4 w-4" />
        <span>{aggregateStrategyHelp(aggregate.strategy)}</span>
      </div>
    </div>
  );
}

function RelayContextManager({
  form,
  liveEntries,
  relayFiles,
  onFormChange,
  actions,
}: {
  form: BackendSettings;
  liveEntries: CodexContextEntries | null;
  relayFiles: RelayFilesResult | null;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const entries = contextEntriesWithLiveEntries(form, liveEntries);
  const [activeKind, setActiveKind] = useState<ContextKind>("mcp");
  const [editor, setEditor] = useState<{ kind: ContextKind; entry?: CodexContextEntry } | null>(null);
  const [contextSearch, setContextSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContextStatusFilter>("all");
  const [contextSort, setContextSort] = useState<ContextListSort>("config");
  const [contextPage, setContextPage] = useState(1);
  const [contextPageSize, setContextPageSize] = useState(10);
  const [busyEntryKey, setBusyEntryKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const allKindEntries = contextEntriesByKind(entries, activeKind);
  const searchQuery = contextSearch.trim().toLocaleLowerCase();
  const filteredEntries = allKindEntries
    .filter((entry) => {
      if (statusFilter === "enabled" && !entry.enabled) return false;
      if (statusFilter === "disabled" && entry.enabled) return false;
      if (!searchQuery) return true;
      return [entry.id, entry.title, entry.summary, entry.tomlBody, contextKindLabel(entry.kind)]
        .some((value) => value.toLocaleLowerCase().includes(searchQuery));
    })
    .sort((left, right) => {
      if (contextSort === "name") return (left.title || left.id).localeCompare(right.title || right.id);
      if (contextSort === "enabled" && left.enabled !== right.enabled) return left.enabled ? -1 : 1;
      return allKindEntries.indexOf(left) - allKindEntries.indexOf(right);
    });
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / contextPageSize));
  const currentPage = Math.min(contextPage, pageCount);
  const pageStartIndex = (currentPage - 1) * contextPageSize;
  const visibleEntries = filteredEntries.slice(pageStartIndex, pageStartIndex + contextPageSize);
  const pageStart = filteredEntries.length ? pageStartIndex + 1 : 0;
  const pageEnd = Math.min(pageStartIndex + contextPageSize, filteredEntries.length);
  const label = contextKindLabel(activeKind);
  const activeOption = contextKindOptions.find((option) => option.kind === activeKind) ?? contextKindOptions[0];
  const ActiveKindIcon = activeOption.icon;
  const paginationItems = useMemo<Array<number | string>>(() => {
    if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const pages = Array.from(new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]))
      .filter((page) => page >= 1 && page <= pageCount)
      .sort((left, right) => left - right);
    const result: Array<number | string> = [];
    pages.forEach((page, index) => {
      const previous = pages[index - 1];
      if (previous && page - previous > 1) result.push(`ellipsis-${previous}`);
      result.push(page);
    });
    return result;
  }, [currentPage, pageCount]);

  useEffect(() => {
    if (contextPage > pageCount) setContextPage(pageCount);
  }, [contextPage, pageCount]);

  const syncContextSettings = async (next: BackendSettings) => {
    const syncResult = await actions.syncLiveContextEntries(next, true);
    if (syncResult && isSuccessStatus(syncResult.status)) {
      await actions.refreshRelayFiles(true);
    }
    return !!syncResult && isSuccessStatus(syncResult.status);
  };

  const saveEntry = async (kind: ContextKind, id: string, tomlBody: string) => {
    const next = await actions.upsertContextEntry(form, kind, id, tomlBody);
    if (!next) return false;
    onFormChange(next);
    await syncContextSettings(next);
    setEditor(null);
    setActiveKind(kind);
    setContextPage(1);
    return true;
  };

  const toggleContextEntryEnabled = async (entry: CodexContextEntry) => {
    const entryKey = `${entry.kind}-${entry.id}`;
    if (busyEntryKey) return;
    setBusyEntryKey(entryKey);
    try {
      const nextBody = setContextEntryEnabled(entry.tomlBody, !entry.enabled);
      const next = await actions.upsertContextEntry(form, entry.kind, entry.id, nextBody);
      if (!next) return;
      onFormChange(next);
      await syncContextSettings(next);
    } finally {
      setBusyEntryKey(null);
    }
  };

  const deleteEntry = async (entry: CodexContextEntry) => {
    const entryName = entry.title || entry.id;
    if (!window.confirm(tf("删除工具“{0}”？此操作会从全局配置中移除该条目。", [entryName]))) return;
    const entryKey = `${entry.kind}-${entry.id}`;
    if (busyEntryKey) return;
    setBusyEntryKey(entryKey);
    try {
      const next = await actions.deleteContextEntry(form, entry.kind, entry.id);
      if (!next) return;
      onFormChange(next);
      await syncContextSettings(next);
      if (editor?.entry?.id === entry.id && editor.kind === entry.kind) setEditor(null);
    } finally {
      setBusyEntryKey(null);
    }
  };

  const refreshContextEntries = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await actions.refreshLiveContextEntries();
    } finally {
      setRefreshing(false);
    }
  };

  const changeActiveKind = (kind: ContextKind) => {
    setActiveKind(kind);
    setContextPage(1);
    if (editor && editor.kind !== kind) setEditor(null);
  };

  return (
    <div className="context-manager">
      <div className="context-manager-head">
        <div>
          <strong>{t("Codex 工具与插件")}</strong>
          <span>{t("MCP、Skills、Plugins 作为全局配置独立管理，切换任意供应商都会合并。")}</span>
        </div>
        <div className="context-manager-head-actions">
          <Button
            aria-label={t("刷新工具与插件")}
            disabled={refreshing}
            onClick={() => void refreshContextEntries()}
            size="icon"
            title={t("刷新工具与插件")}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "context-refreshing" : ""}`} />
          </Button>
          <Button onClick={() => setEditor({ kind: activeKind })} size="sm">
            <Plus className="h-4 w-4" />
            {t("新增工具")}
          </Button>
        </div>
      </div>
      <div aria-label={t("工具类型")} className="context-kind-tabs" role="tablist">
        {contextKindOptions.map((option) => {
          const kindEntries = contextEntriesByKind(entries, option.kind);
          const enabledCount = kindEntries.filter((entry) => entry.enabled).length;
          const KindIcon = option.icon;
          return (
          <button
            aria-selected={activeKind === option.kind}
            className={`context-kind-tab ${activeKind === option.kind ? "active" : ""}`}
            key={option.kind}
            onClick={() => changeActiveKind(option.kind)}
            role="tab"
            type="button"
          >
            <span className="context-kind-tab-copy">
              <span className="context-kind-icon"><KindIcon className="h-4 w-4" /></span>
              <span><strong>{option.label}</strong><small>{option.detail}</small></span>
            </span>
            <span className="context-kind-count">
              <strong>{kindEntries.length}</strong>
              <small>{tf("已启用 {0}", [enabledCount])}</small>
            </span>
          </button>
          );
        })}
      </div>
      <div className="context-toolbar">
        <label className="context-search-field">
          <Search aria-hidden="true" className="h-4 w-4" />
          <Input
            aria-label={t("搜索工具")}
            onChange={(event) => {
              setContextSearch(event.currentTarget.value);
              setContextPage(1);
            }}
            placeholder={t("搜索名称、说明或配置内容...")}
            type="search"
            value={contextSearch}
          />
        </label>
        <label className="context-toolbar-select-wrap">
          <Filter aria-hidden="true" className="h-4 w-4" />
          <select
            aria-label={t("工具状态筛选")}
            className="context-toolbar-select"
            onChange={(event) => {
              setStatusFilter(event.currentTarget.value as ContextStatusFilter);
              setContextPage(1);
            }}
            value={statusFilter}
          >
            <option value="all">{t("全部状态")}</option>
            <option value="enabled">{t("已启用")}</option>
            <option value="disabled">{t("已禁用")}</option>
          </select>
        </label>
        <label className="context-toolbar-select-wrap">
          <ArrowDownWideNarrow aria-hidden="true" className="h-4 w-4" />
          <select
            aria-label={t("排序方式")}
            className="context-toolbar-select"
            onChange={(event) => {
              setContextSort(event.currentTarget.value as ContextListSort);
              setContextPage(1);
            }}
            value={contextSort}
          >
            <option value="config">{t("配置顺序")}</option>
            <option value="name">{t("按名称")}</option>
            <option value="enabled">{t("启用优先")}</option>
          </select>
        </label>
        <span className="context-toolbar-count">{tf("共 {0} 个工具", [filteredEntries.length])}</span>
      </div>
      <div className={`context-workspace ${editor ? "with-editor" : ""}`}>
        <div className="context-table-panel">
          <div className="context-table-header" role="row">
            <span>{t("工具名称")}</span>
            <span>{t("类型")}</span>
            <span>{t("状态")}</span>
            <span>{t("操作")}</span>
          </div>
          <div className="context-table-body">
            {visibleEntries.length ? visibleEntries.map((entry) => {
              const entryOption = contextKindOptions.find((option) => option.kind === entry.kind) ?? activeOption;
              const EntryIcon = entryOption.icon;
              const entryKey = `${entry.kind}-${entry.id}`;
              const entryBusy = busyEntryKey === entryKey;
              return (
                <div className="context-table-row" key={entryKey}>
                  <div className="context-entry-main">
                    <span className="context-entry-icon" data-kind={entry.kind}><EntryIcon className="h-4 w-4" /></span>
                    <span className="context-entry-copy">
                      <strong title={entry.title || entry.id}>{entry.title || entry.id}</strong>
                      <small title={entry.summary || entry.tomlBody}>{entry.summary || t("暂无描述。")}</small>
                    </span>
                  </div>
                  <span className="context-entry-type" data-kind={entry.kind}>{entryOption.label}</span>
                  <div className="context-entry-status">
                    <button
                      aria-checked={entry.enabled}
                      aria-label={`contextEnabledSwitch-${entry.kind}-${entry.id}`}
                      className={`context-enabled-switch ${entry.enabled ? "active" : ""}`}
                      disabled={entryBusy}
                      onClick={() => void toggleContextEntryEnabled(entry)}
                      role="switch"
                      title={entry.enabled ? t("禁用此扩展项") : t("启用此扩展项")}
                      type="button"
                    >
                      <span className="context-switch-track" aria-hidden="true"><span className="context-switch-thumb" /></span>
                    </button>
                    <small>{entry.enabled ? t("已启用") : t("已禁用")}</small>
                  </div>
                  <div className="context-entry-actions">
                    <Button disabled={entryBusy} onClick={() => setEditor({ kind: entry.kind, entry })} size="icon" title={t("编辑扩展项")} variant="ghost">
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button className="context-entry-delete" disabled={entryBusy} onClick={() => void deleteEntry(entry)} size="icon" title={t("删除扩展项")} variant="ghost">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            }) : (
              <div className="context-empty-state">
                <span className="context-entry-icon" data-kind={activeKind}><ActiveKindIcon className="h-5 w-5" /></span>
                <strong>{searchQuery || statusFilter !== "all" ? t("没有匹配的工具") : `${t("暂无")}${label}`}</strong>
                <span>{searchQuery || statusFilter !== "all" ? t("请调整搜索词或筛选条件。") : `${t("可以从通用配置文件或这里新增。")}`}</span>
                <Button onClick={() => setEditor({ kind: activeKind })} size="sm" variant="outline">
                  <Plus className="h-4 w-4" />
                  {t("新增")}{label}
                </Button>
              </div>
            )}
          </div>
          <div className="context-pagination">
            <div className="context-pagination-summary">
              <span>{tf("第 {0}-{1} 条，共 {2} 条", [pageStart, pageEnd, filteredEntries.length])}</span>
              <label>
                <span>{t("每页")}</span>
                <select
                  aria-label={t("每页条数")}
                  onChange={(event) => {
                    setContextPageSize(Number(event.currentTarget.value));
                    setContextPage(1);
                  }}
                  value={contextPageSize}
                >
                  {[10, 20, 50].map((size) => <option key={size} value={size}>{size} {t("条/页")}</option>)}
                </select>
              </label>
            </div>
            <nav aria-label={t("工具分页")} className="context-page-controls">
              <Button aria-label={t("首页")} disabled={currentPage === 1} onClick={() => setContextPage(1)} size="icon" title={t("首页")} variant="ghost"><ChevronsLeft className="h-4 w-4" /></Button>
              <Button aria-label={t("上一页")} disabled={currentPage === 1} onClick={() => setContextPage((page) => Math.max(1, page - 1))} size="icon" title={t("上一页")} variant="ghost"><ChevronLeft className="h-4 w-4" /></Button>
              <div className="context-page-numbers">
                {paginationItems.map((item) => typeof item === "number" ? (
                  <Button aria-current={item === currentPage ? "page" : undefined} key={item} onClick={() => setContextPage(item)} size="icon" variant={item === currentPage ? "secondary" : "ghost"}>{item}</Button>
                ) : <span aria-hidden="true" key={item}>…</span>)}
              </div>
              <span className="context-page-position">{tf("第 {0} / {1} 页", [currentPage, pageCount])}</span>
              <Button aria-label={t("下一页")} disabled={currentPage === pageCount} onClick={() => setContextPage((page) => Math.min(pageCount, page + 1))} size="icon" title={t("下一页")} variant="ghost"><ChevronRight className="h-4 w-4" /></Button>
              <Button aria-label={t("末页")} disabled={currentPage === pageCount} onClick={() => setContextPage(pageCount)} size="icon" title={t("末页")} variant="ghost"><ChevronsRight className="h-4 w-4" /></Button>
            </nav>
          </div>
        </div>
        {editor ? (
          <ContextEntryEditor
            entry={editor.entry}
            key={`${editor.kind}-${editor.entry?.id ?? "new"}`}
            kind={editor.kind}
            onCancel={() => setEditor(null)}
            onSave={saveEntry}
          />
        ) : null}
      </div>
      <div className={`context-sync-status ${liveEntries ? "ready" : "waiting"}`}>
        <span aria-hidden="true" />
        <div>
          <strong>{liveEntries ? t("配置已同步到当前 Codex") : t("等待读取当前 Codex 配置")}</strong>
          <small title={relayFiles?.configPath}>{relayFiles?.configPath || t("切换供应商时会自动写入 config.toml")}</small>
        </div>
      </div>
    </div>
  );
}

function ContextEntryEditor({
  kind,
  entry,
  onCancel,
  onSave,
}: {
  kind: ContextKind;
  entry?: CodexContextEntry;
  onCancel: () => void;
  onSave: (kind: ContextKind, id: string, tomlBody: string) => Promise<boolean>;
}) {
  const [draftKind, setDraftKind] = useState<ContextKind>(entry?.kind ?? kind);
  const [id, setId] = useState(entry?.id ?? "");
  const [tomlBody, setTomlBody] = useState(entry?.tomlBody ?? "");
  const [saving, setSaving] = useState(false);
  const canSave = id.trim().length > 0;
  const editorLabel = contextKindLabel(draftKind);
  const editorOption = contextKindOptions.find((option) => option.kind === draftKind) ?? contextKindOptions[0];
  const EditorIcon = editorOption.icon;

  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave(draftKind, id.trim(), tomlBody);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside aria-labelledby="context-editor-title" className="context-editor" role="dialog">
      <div className="context-editor-head">
        <div>
          <span className="context-entry-icon" data-kind={draftKind}><EditorIcon className="h-4 w-4" /></span>
          <span>
            <strong id="context-editor-title">{entry ? t("编辑") : t("新增")}{editorLabel}</strong>
            <small>{t("保存后会同步到当前 Codex 配置")}</small>
          </span>
        </div>
        <Button aria-label={t("关闭编辑器")} onClick={onCancel} size="icon" title={t("关闭编辑器")} variant="ghost"><X className="h-4 w-4" /></Button>
      </div>
      <div className="context-editor-body">
        <Field label={t("类型")}>
          <select
            className="field-select"
            disabled={!!entry}
            value={draftKind}
            onChange={(event) => setDraftKind(event.currentTarget.value as ContextKind)}
          >
            {contextKindOptions.map((option) => (
              <option key={option.kind} value={option.kind}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="ID">
          <Input
            disabled={!!entry}
            value={id}
            onChange={(event) => setId(event.currentTarget.value.trim())}
            placeholder={t("例如 context7")}
          />
        </Field>
      <Field label={t("TOML 配置体")} className="context-editor-config-field">
        <Textarea
          className="context-editor-textarea"
          value={tomlBody}
          onChange={(event) => setTomlBody(event.currentTarget.value)}
          placeholder={t("只填写表头下面的内容，例如：\ncommand = \"npx\"\nargs = [\"-y\", \"@upstash/context7-mcp\"]")}
          spellCheck={false}
        />
      </Field>
      <div className="context-editor-preview">
        <Info aria-hidden="true" className="h-4 w-4" />
        <span><strong>{t("配置预览")}</strong><small>{t("启用后会在所有供应商切换后的 config.toml 中合并此工具。")}</small></span>
      </div>
      </div>
      <div className="context-editor-actions">
        <Button onClick={onCancel} size="sm" variant="secondary">{t("取消")}</Button>
        <Button disabled={!canSave || saving} onClick={() => void submit()} size="sm">
          <Save className="h-4 w-4" />
          {saving ? t("正在保存…") : t("保存扩展项")}
        </Button>
      </div>
    </aside>
  );
}

function SyncedTextarea({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const isFocusedRef = useRef(false);
  const latestExternalValueRef = useRef(value);

  useEffect(() => {
    latestExternalValueRef.current = value;
    if (!isFocusedRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  return (
    <Textarea
      className={className}
      value={localValue}
      onBlur={() => {
        isFocusedRef.current = false;
        setLocalValue(latestExternalValueRef.current);
      }}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setLocalValue(next);
        onValueChange(next);
      }}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      spellCheck={false}
    />
  );
}

function RelayFileEditors({
  contextProfile,
  profile,
  form,
  isActive,
  profileId,
  onFormChange,
  onProfileChange,
  actions,
}: {
  contextProfile: RelayProfile;
  profile: RelayProfile;
  form: BackendSettings;
  isActive: boolean;
  profileId: string;
  onFormChange: (value: BackendSettings) => void;
  onProfileChange: (value: RelayProfile) => void;
  actions: Actions;
}) {
  const configPreview = effectiveRelayConfigPreview(profile, form, contextProfile);
  const entries = contextEntriesForProfile(form, contextProfile);
  return (
    <div className="relay-file-grid">
      <div className="relay-file-panel">
        <div className="relay-file-head">
          <div>
            <strong>{t("config.toml 预览")}</strong>
            <span>{isActive ? t("当前供应商切换后会写入的预览；上下文开关变化会立即反映") : t("切换到此供应商时会写入的预览；上下文开关变化会立即反映")}</span>
          </div>
        </div>
        <SyncedTextarea
          className="relay-file-textarea"
          value={configPreview}
          onValueChange={(value) => {
            const withoutCommon = stripCommonConfigTextFallback(
              value,
              relayCombinedCommonConfig(form),
            );
            const configContents = stripContextEntriesFromConfig(withoutCommon, entries);
            onProfileChange(deriveRelayProfileFromFiles({
              ...profile,
              configContents,
            }));
          }}
        />
      </div>
      <div className="relay-file-panel">
        <div className="relay-file-head">
          <div>
            <strong>{t("通用配置文件")}</strong>
            <span>{t("只保留非 MCP、Skills、Plugins 的跨供应商配置；工具与插件在独立页面管理。")}</span>
          </div>
          <Button
            onClick={async () => {
              const extracted = await actions.extractRelayCommonConfig(profile.configContents || "");
              if (!extracted) return;
              const split = splitContextConfigText(extracted.commonConfigContents || "");
              if (!split.common.trim() && !split.context.trim()) {
                await actions.showMessage(t("通用配置文件"), t("当前供应商 config.toml 里没有可提取的通用配置。"), "failed");
                return;
              }
              const promotedProfile = {
                ...profile,
                configContents: extracted.profileConfigContents,
              };
              const next = syncLegacyRelayFields({
                ...form,
                relayCommonConfigContents: split.common,
                relayContextConfigContents: joinTomlSectionsRootFirst([form.relayContextConfigContents || "", split.context]),
                relayProfiles: form.relayProfiles.map((item) => (item.id === profileId ? promotedProfile : item)),
              });
              onFormChange(next);
              onProfileChange(promotedProfile);
              await actions.saveSettingsValue(next, false);
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Download className="h-4 w-4" />
            {t("提取当前供应商配置")}
          </Button>
        </div>
        <SyncedTextarea
          className="relay-file-textarea"
          value={form.relayCommonConfigContents}
          onValueChange={(value) => onFormChange({ ...form, relayCommonConfigContents: value })}
        />
      </div>
      <div className="relay-file-panel">
        <div className="relay-file-head">
          <div>
            <strong>auth.json</strong>
            <span>{isActive ? t("当前使用中：打开时从 ~/.codex/auth.json 回填，保存后会作为此供应商 auth 存档") : t("切换到此供应商时会写入 ~/.codex/auth.json")}</span>
          </div>
        </div>
        <SyncedTextarea
          className="relay-file-textarea"
          value={profile.authContents}
          onValueChange={(value) => onProfileChange(deriveRelayProfileFromFiles({ ...profile, authContents: value }))}
        />
      </div>
    </div>
  );
}

function ProviderDoctorModal({
  result,
  running,
  onClose,
}: {
  result: ProviderDoctorResult | null;
  running: boolean;
  onClose: () => void;
}) {
  const steps = providerDoctorSteps(result, running);
  const doneCount = steps.filter((step) => step.state === "ok" || step.state === "warning" || step.state === "failed").length;
  const progress = Math.round((doneCount / steps.length) * 100);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card provider-doctor-modal">
        <div className="modal-head">
          <div>
            <h2>Provider Doctor</h2>
            <p>{running ? t("正在诊断供应商，请稍候。") : result?.summary ?? t("诊断已完成。")}</p>
          </div>
          <UiBadge variant={result && !isSuccessStatus(result.status) ? "outline" : "secondary"}>
            {running ? t("诊断中") : result && !isSuccessStatus(result.status) ? t("异常") : t("完成")}
          </UiBadge>
        </div>
        <div className="provider-doctor-progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} role="progressbar">
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className="provider-doctor-step-list">
          {steps.map((step) => (
            <div className={`provider-doctor-step ${step.state}`} key={step.id}>
              <span className="provider-doctor-step-icon">
                {step.state === "running" ? (
                  <RefreshCw className="h-4 w-4" />
                ) : step.state === "ok" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : step.state === "warning" ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : step.state === "failed" ? (
                  <Info className="h-4 w-4" />
                ) : (
                  <span />
                )}
              </span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
            </div>
          ))}
        </div>
        {result?.recommendation ? <p className="provider-doctor-recommendation">{result.recommendation}</p> : null}
        <div className="modal-actions">
          <Button disabled={running} onClick={onClose} variant="secondary">
            {running ? t("诊断中") : t("关闭")}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ProviderDoctorStepState = "pending" | "running" | "ok" | "warning" | "failed";

function providerDoctorSteps(
  result: ProviderDoctorResult | null,
  running: boolean,
): Array<{ id: string; title: string; detail: string; state: ProviderDoctorStepState }> {
  const base = [
    { id: "config", title: t("配置完整性"), pending: t("等待检查 Base URL / API Key。") },
    { id: "models", title: t("模型列表"), pending: t("等待检查 /v1/models。") },
    { id: "request", title: t("真实请求"), pending: t("等待发送一次测试请求。") },
    { id: "recommendation", title: t("处理建议"), pending: t("等待生成建议。") },
  ];
  if (!result) {
    return base.map((step, index) => ({
      id: step.id,
      title: step.title,
      detail: index === 0 && running ? t("正在检查配置完整性…") : step.pending,
      state: index === 0 && running ? "running" : "pending",
    }));
  }
  const checks = new Map(result.checks.map((check) => [check.id, check]));
  return base.map((step) => {
    if (step.id === "recommendation") {
      return {
        id: step.id,
        title: step.title,
        detail: result.recommendation || step.pending,
        state: result.status === "failed" ? "warning" : "ok",
      };
    }
    const check = checks.get(step.id);
    if (!check) {
      return {
        id: step.id,
        title: step.title,
        detail: step.id === "models" || step.id === "request" ? t("该步骤未执行。") : step.pending,
        state: "pending",
      };
    }
    return {
      id: step.id,
      title: check.title || step.title,
      detail: check.detail,
      state: check.status === "ok" ? "ok" : check.status === "warning" ? "warning" : "failed",
    };
  });
}

function ModeSelector({ launchMode, actions }: { launchMode: LaunchMode; actions: Actions }) {
  return (
    <div className="mode-grid">
      <button
        className={`mode-option ${launchMode === "relay" ? "active" : ""}`}
        onClick={() => void actions.setLaunchMode("relay")}
        type="button"
      >
        <strong>{t("兼容增强")}</strong>
        <span>{t("适合官方登录或官方混入 API Key；保留会话删除、导出、项目移动和用户脚本，关闭插件市场相关增强。")}</span>
      </button>
      <button
        className={`mode-option ${launchMode === "patch" ? "active" : ""}`}
        onClick={() => void actions.setLaunchMode("patch")}
        type="button"
      >
        <strong>{t("完整增强")}</strong>
        <span>{t("适合纯 API；启用插件市场、会话删除导出、项目移动等全部页面能力。")}</span>
      </button>
    </div>
  );
}

function FeatureItem({ title, detail, enabled }: { title: string; detail: string; enabled: boolean }) {
  return (
    <div className="feature-item">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <Badge status={enabled ? "ok" : "disabled"} />
    </div>
  );
}

function FeatureGroup({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <section className="feature-group">
      <div className="feature-group-head">
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <div className="feature-switch-grid">{children}</div>
    </section>
  );
}

function FeatureToggle({
  title,
  detail,
  checked,
  disabled = false,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`feature-toggle ${disabled ? "disabled" : ""}`}>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <Badge status={!disabled && checked ? "ok" : "disabled"} />
    </label>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function GuideList({ items }: { items: string[] }) {
  return (
    <div className="guide-list">
      {items.map((item, index) => (
        <div className="guide-step" key={item}>
          <span>{index + 1}</span>
          <p>{item}</p>
        </div>
      ))}
    </div>
  );
}

function NoticeDialog({
  notice,
  onClose,
}: {
  notice: { title: string; message: string; status?: Status };
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className={`toast-card ${notice.status === "failed" ? "failed" : ""}`}>
        <div className="toast-progress" />
        <div className="toast-icon">
          {notice.status === "failed" ? <Bell className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </div>
        <div className="toast-body">
          <h2>{notice.title}</h2>
          <p>{notice.message}</p>
        </div>
        <button className="toast-close" onClick={onClose} type="button">×</button>
      </div>
    </div>
  );
}

function ConfirmDialog({
  confirm,
  onConfirm,
  onCancel,
}: {
  confirm: { title: string; message: string; confirmText: string; cancelText: string };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card confirm-modal">
        <div className="modal-head">
          <div>
            <h2>{confirm.title}</h2>
          </div>
          <button className="toast-close" onClick={onCancel} type="button">×</button>
        </div>
        <div className="confirm-modal-body">
          <p className="modal-message">{confirm.message}</p>
        </div>
        <Toolbar>
          <Button onClick={onConfirm}>
            <Trash2 className="h-4 w-4" />
            {confirm.confirmText}
          </Button>
          <Button onClick={onCancel} variant="secondary">{confirm.cancelText}</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function SessionIndexCleanupDialog({
  request,
  onConfirm,
  onCancel,
}: {
  request: { candidates: SessionIndexCleanupCandidate[] };
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const allSelected = request.candidates.length > 0 && selectedIds.size === request.candidates.length;
  const toggleCandidate = (id: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card session-index-cleanup-modal">
        <div className="modal-head">
          <div>
            <h2>{t("清理幽灵任务索引")}</h2>
            <p className="modal-message">
              {tf("发现 {0} 条仅存在于 session_index.jsonl、未在本地数据库或 rollout 中找到来源的候选记录。它们也可能是云端或尚未落盘的任务，请逐项核对。任务标题仅用于预览，实际按 thread ID 与数据来源判断。清理前请先完全退出 Codex App / ChatGPT。", [request.candidates.length])}
            </p>
          </div>
          <button className="toast-close" onClick={onCancel} type="button">×</button>
        </div>
        <label className="session-index-cleanup-select-all">
          <input
            checked={allSelected}
            onChange={(event) => {
              setSelectedIds(event.target.checked ? new Set(request.candidates.map((candidate) => candidate.id)) : new Set());
            }}
            type="checkbox"
          />
          <span>{t("选择全部候选记录")}</span>
        </label>
        <div className="session-index-cleanup-list">
          {request.candidates.map((candidate) => (
            <label className="session-index-cleanup-item" key={candidate.id}>
              <input
                checked={selectedIds.has(candidate.id)}
                onChange={(event) => toggleCandidate(candidate.id, event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>{candidate.threadName || t("未命名任务")}</strong>
                <code>{candidate.id}</code>
                <small>{candidate.updatedAt}</small>
              </span>
            </label>
          ))}
        </div>
        <Toolbar>
          <Button disabled={selectedIds.size === 0} onClick={() => onConfirm(Array.from(selectedIds))}>
            <Trash2 className="h-4 w-4" />
            {tf("确认清理 {0} 条", [selectedIds.size])}
          </Button>
          <Button onClick={onCancel} variant="secondary">{t("取消")}</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function PendingProviderImportDialog({
  request,
  onConfirm,
  onDismiss,
}: {
  request: ProviderImportRequest;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card provider-import-modal">
        <div className="modal-head">
          <div>
            <h2>{t("导入 Codex Deck 供应商")}</h2>
            <p>{t("检测到来自网页的供应商配置导入请求，确认后会写入本机 Codex Deck 管理工具。")}</p>
          </div>
          <button className="toast-close" onClick={onDismiss} type="button">×</button>
        </div>
        <div className="metric-list">
          <Metric label={t("名称")} value={request.name || t("未命名供应商")} />
          <Metric label="Base URL" value={request.baseUrl || t("未填写")} />
          <Metric label={t("协议")} value={providerImportWireApiLabel(request.wireApi)} />
          <Metric label={t("模式")} value={providerImportRelayModeLabel(request.relayMode)} />
          <Metric label="API Key" value={maskSecret(request.apiKey)} />
        </div>
        <Toolbar>
          <Button onClick={onConfirm}>
            <Download className="h-4 w-4" />
            {t("确认导入")}
          </Button>
          <Button onClick={onDismiss} variant="secondary">{t("取消")}</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function TaskProgressBox({ progress, title, completedTitle = t("上次修复结果") }: { progress: TaskProgress; title: string; completedTitle?: string }) {
  if (!progress.active && progress.percent <= 0) return null;
  return (
    <div className="provider-sync-progress task-progress" data-active={progress.active}>
      <div className="provider-sync-progress-head">
        <strong>{progress.active ? title : completedTitle}</strong>
        <span>{progress.percent}%</span>
      </div>
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percent}
        className="provider-sync-progress-bar"
        role="progressbar"
      >
        <div className="provider-sync-progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <small>{progress.message}</small>
    </div>
  );
}

function Panel({ children, fill = false, className = "" }: { children: React.ReactNode; fill?: boolean; className?: string }) {
  return (
    <Card className={`panel ${fill ? "fill" : ""} ${className}`}>
      {children}
    </Card>
  );
}

function CardHead({ title, detail }: { title: string; detail: string }) {
  return (
    <CardHeader className="panel-head">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{detail}</CardDescription>
    </CardHeader>
  );
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <Label className={`field ${className}`}>
      <span>{label}</span>
      {children}
    </Label>
  );
}

function StatusRow({ title, status = "unknown", path }: { title: string; status?: string; path?: string | null }) {
  return (
    <div className="status-row">
      <span>{title}</span>
      <Badge status={status} />
      <code>{path || t("未记录路径")}</code>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  return <UiBadge className={statusClass(status)} variant="secondary">{statusLabel(status)}</UiBadge>;
}

function LatestLaunch({ status }: { status: LaunchStatus | null }) {
  if (!status) return <div className="empty">{t("暂无启动状态。")}</div>;
  return (
    <div className="metric-list">
      <Metric label={t("状态")} value={status.status} />
      <Metric label={t("消息")} value={status.message} />
      <Metric label="Debug" value={String(status.debug_port ?? "-")} />
      <Metric label="Helper" value={String(status.helper_port ?? "-")} />
      <Metric label={t("时间")} value={formatTime(status.started_at_ms)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScriptRow({ script, actions }: { script: NonNullable<UserScriptInventory["scripts"]>[number]; actions: Actions }) {
  const source = script.market_id ? tf("市场 · {0}", [script.version || t("未知版本")]) : script.source === "builtin" ? t("内置") : t("用户");
  const canDelete = script.source === "user";
  return (
    <div className="table-row">
      <span>{script.name}</span>
      <span>{source}</span>
      <span>{script.enabled ? t("启用") : t("关闭")}</span>
      <span>{script.status}</span>
      <div className="script-row-actions">
        <Button onClick={() => void actions.setUserScriptEnabled(script.key, !script.enabled)} size="sm" variant="secondary">
          {script.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          {script.enabled ? t("禁用") : t("启用")}
        </Button>
        {canDelete ? (
          <Button onClick={() => void actions.deleteUserScript(script.key)} size="sm" variant="outline">
            <Trash2 className="h-4 w-4" />
            {t("删除")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function routeTitle(route: Route) {
  return routes.find((item) => item.id === route)?.label ?? t("概览");
}

function routeSubtitle(route: Route) {
  const subtitles: Record<Route, string> = {
    overview: t("检查问题、启动与快速修复"),
    relay: t("管理 API 供应商、协议、Key 与配置文件"),
    sessions: t("查看、删除和修复 Codex 本地会话"),
    context: t("独立管理 MCP、Skills、Plugins"),
    enhance: t("会话删除、导出、项目移动和脚本能力"),
    userScripts: t("内置和用户自定义脚本清单"),
    maintenance: t("入口安装、修复、Watcher 与手动启动"),
    about: t("版本信息、项目链接、GitHub Release 更新、日志与诊断"),
    settings: t("主题和启动参数"),
  };
  return subtitles[route];
}

const contextKindOptions: Array<{ kind: ContextKind; label: string; tableName: string; detail: string; icon: LucideIcon }> = [
  { kind: "mcp", label: "MCP", tableName: "mcp_servers", detail: t("运行服务"), icon: Network },
  { kind: "skill", label: "Skills", tableName: "skills", detail: t("工作流技能"), icon: Workflow },
  { kind: "plugin", label: t("插件"), tableName: "plugins", detail: t("扩展能力"), icon: Boxes },
];

function contextKindLabel(kind: ContextKind) {
  return contextKindOptions.find((option) => option.kind === kind)?.label ?? t("扩展项");
}

function contextEntriesFromSettings(settings: BackendSettings): CodexContextEntries {
  const commonConfig = normalizeDuplicateTomlTables(settings.relayContextConfigContents || "");
  return {
    mcpServers: parseContextEntries(commonConfig, "mcp", "mcp_servers"),
    skills: parseContextEntries(commonConfig, "skill", "skills"),
    plugins: parseContextEntries(commonConfig, "plugin", "plugins"),
  };
}

function contextEntriesWithLiveEntries(settings: BackendSettings, liveEntries: CodexContextEntries | null): CodexContextEntries {
  const commonEntries = contextEntriesFromSettings(settings);
  if (!liveEntries) return commonEntries;
  const liveByKind: Record<ContextKind, Map<string, CodexContextEntry>> = {
    mcp: new Map(liveEntries.mcpServers.map((entry) => [entry.id, entry])),
    skill: new Map(liveEntries.skills.map((entry) => [entry.id, entry])),
    plugin: new Map(liveEntries.plugins.map((entry) => [entry.id, entry])),
  };
  return {
    mcpServers: mergeLiveContextEntries(commonEntries.mcpServers, liveByKind.mcp),
    skills: mergeLiveContextEntries(commonEntries.skills, liveByKind.skill),
    plugins: mergeLiveContextEntries(commonEntries.plugins, liveByKind.plugin),
  };
}

function mergeLiveContextEntries(entries: CodexContextEntry[], liveEntries: Map<string, CodexContextEntry>): CodexContextEntry[] {
  const uniqueEntries = dedupeContextEntryList(entries);
  const merged = uniqueEntries.map((entry) => {
    const live = liveEntries.get(entry.id);
    return withLiveEntryState(entry, live);
  });
  const knownIds = new Set(uniqueEntries.map((entry) => entry.id));
  for (const liveEntry of liveEntries.values()) {
    if (!knownIds.has(liveEntry.id)) merged.push(liveEntry);
  }
  return merged;
}

function withLiveEntryState(entry: CodexContextEntry, live?: CodexContextEntry): CodexContextEntry {
  return live ? { ...entry, enabled: live.enabled } : { ...entry, enabled: false };
}

function contextEntriesForProfile(settings: BackendSettings, profile: RelayProfile): CodexContextEntries {
  return filterContextEntriesBySelection(contextEntriesFromSettings(settings), profile.contextSelection);
}

function contextEntriesFromConfig(configContents: string): CodexContextEntries {
  return {
    mcpServers: parseContextEntries(configContents, "mcp", "mcp_servers"),
    skills: parseContextEntries(configContents, "skill", "skills"),
    plugins: parseContextEntries(configContents, "plugin", "plugins"),
  };
}

function mergeContextEntries(primary: CodexContextEntries, secondary: CodexContextEntries): CodexContextEntries {
  return {
    mcpServers: mergeContextEntryList(primary.mcpServers, secondary.mcpServers),
    skills: mergeContextEntryList(primary.skills, secondary.skills),
    plugins: mergeContextEntryList(primary.plugins, secondary.plugins),
  };
}

function mergeContextEntryList(primary: CodexContextEntry[], secondary: CodexContextEntry[]): CodexContextEntry[] {
  return dedupeContextEntryList([...primary, ...secondary]);
}

function dedupeContextEntryList(entries: CodexContextEntry[]): CodexContextEntry[] {
  const byId = new Map<string, CodexContextEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values());
}

function parseContextEntries(commonConfig: string, kind: ContextKind, tableName: string): CodexContextEntry[] {
  const anyHeaderPattern = /^\s*\[[^\]]+\]\s*$/;
  const entries = new Map<string, CodexContextEntry>();
  let currentId: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (!currentId) return;
    const tomlBody = ensureTrailingNewline(body.join("\n").trimEnd());
    entries.set(currentId, {
      id: currentId,
      kind,
      title: currentId,
      summary: contextEntrySummary(tomlBody),
      tomlBody,
      enabled: contextEntryEnabled(tomlBody),
    });
  };

  for (const line of commonConfig.split(/\r?\n/)) {
    const path = tomlTablePathFromLine(line);
    if (path?.[0] === tableName && path.length >= 2) {
      const id = path[1];
      if (currentId === id && path.length > 2) {
        body.push(`[${path.slice(2).map(tomlKey).join(".")}]`);
        continue;
      }
      flush();
      currentId = id;
      body = [];
      continue;
    }
    if (currentId && anyHeaderPattern.test(line)) {
      flush();
      currentId = null;
      body = [];
      continue;
    }
    if (currentId) body.push(line);
  }
  flush();

  return Array.from(entries.values());
}

function tomlTablePathFromLine(line: string): string[] | null {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  if (!match) return null;
  return parseTomlDottedPath(match[1].trim());
}

function parseTomlDottedPath(path: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of path) {
    if (quote) {
      if (quote === '"' && escaping) {
        current += char;
        escaping = false;
      } else if (quote === '"' && char === "\\") {
        escaping = true;
      } else if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ".") {
      if (!current.trim()) return null;
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (quote || escaping || !current.trim()) return null;
  parts.push(current.trim());
  return parts;
}

function contextEntrySummary(tomlBody: string) {
  return tomlBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !/^enabled\s*=/.test(line))
    ?.slice(0, 96) ?? "";
}

function contextEntryEnabled(tomlBody: string) {
  return !tomlBody.split(/\r?\n/).some((line) => /^\s*enabled\s*=\s*false\s*(#.*)?$/i.test(line));
}

function setContextEntryEnabled(tomlBody: string, enabled: boolean) {
  const lines = tomlBody.trimEnd().split(/\r?\n/);
  const nextValue = `enabled = ${enabled ? "true" : "false"}`;
  let replaced = false;
  const next = lines.map((line) => {
    if (/^\s*enabled\s*=/.test(line)) {
      replaced = true;
      return nextValue;
    }
    return line;
  });
  if (!replaced) next.unshift(nextValue);
  return ensureTrailingNewline(next.join("\n").trimEnd());
}

function ensureTrailingNewline(value: string) {
  return value.trim() ? `${value}\n` : "";
}

function unquoteTomlKey(key: string) {
  if (key.length >= 2 && ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))) {
    return key.slice(1, -1);
  }
  return key;
}

function contextEntriesByKind(entries: CodexContextEntries, kind: ContextKind): CodexContextEntry[] {
  if (kind === "mcp") return dedupeContextEntryList(entries.mcpServers);
  if (kind === "skill") return dedupeContextEntryList(entries.skills);
  return dedupeContextEntryList(entries.plugins);
}

function filterContextEntriesBySelection(entries: CodexContextEntries, selection: RelayContextSelection): CodexContextEntries {
  const selected = {
    mcp: new Set(selection.mcpServers.map((id) => id.trim()).filter(Boolean)),
    skill: new Set(selection.skills.map((id) => id.trim()).filter(Boolean)),
    plugin: new Set(selection.plugins.map((id) => id.trim()).filter(Boolean)),
  };
  return {
    mcpServers: entries.mcpServers.filter((entry) => selected.mcp.has(entry.id)),
    skills: entries.skills.filter((entry) => selected.skill.has(entry.id)),
    plugins: entries.plugins.filter((entry) => selected.plugin.has(entry.id)),
  };
}

function configHasCodexGoalsFeature(configContents: string): boolean {
  let inFeatures = false;
  for (const line of configContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[features\]$/.test(trimmed)) {
      inFeatures = true;
      continue;
    }
    if (inFeatures && /^\[[^\]]+\]$/.test(trimmed)) {
      inFeatures = false;
    }
    if (inFeatures && /^goals\s*=\s*true\b/.test(trimmed)) {
      return true;
    }
  }
  return false;
}

function setCodexGoalsFeatureInConfig(configContents: string, enabled: boolean): string {
  const lines = configContents.split(/\r?\n/);
  const next: string[] = [];
  let inFeatures = false;
  let sawFeatures = false;
  let featuresHasGoals = false;

  const maybeInsertGoals = () => {
    if (enabled && sawFeatures && !featuresHasGoals) {
      next.push("goals = true");
      featuresHasGoals = true;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[features\]$/.test(trimmed)) {
      if (inFeatures) maybeInsertGoals();
      inFeatures = true;
      sawFeatures = true;
      featuresHasGoals = false;
      next.push(line);
      continue;
    }
    if (inFeatures && /^\[[^\]]+\]$/.test(trimmed)) {
      maybeInsertGoals();
      inFeatures = false;
    }
    if (inFeatures && /^goals\s*=/.test(trimmed)) {
      if (enabled && !featuresHasGoals) {
        next.push("goals = true");
        featuresHasGoals = true;
      }
      continue;
    }
    next.push(line);
  }

  if (inFeatures) maybeInsertGoals();
  if (enabled && !sawFeatures) {
    const trimmed = ensureTrailingNewline(next.join("\n").trimEnd());
    return joinTomlSections([trimmed, "[features]\ngoals = true"]);
  }

  return ensureTrailingNewline(next.join("\n").trimEnd());
}

function effectiveRelayConfigPreview(profile: RelayProfile, settings: BackendSettings, contextProfile = profile): string {
  const entries = contextEntriesForProfile(settings, contextProfile);
  const isolatedConfig = stripContextEntriesFromConfig(profile.configContents, entries);
  const configWithLimits = applyContextLimitPreview(isolatedConfig, profile);
  return joinTomlSectionsRootFirst([configWithLimits, settings.relayCommonConfigContents || "", selectedContextConfigToml(entries)]);
}

function selectedContextConfigToml(entries: CodexContextEntries): string {
  const sections: string[] = [];
  for (const option of contextKindOptions) {
    for (const entry of dedupeContextEntryList(contextEntriesByKind(entries, option.kind))) {
      if (!entry.enabled) continue;
      sections.push(contextEntryToTomlSection(option.tableName, entry));
    }
  }
  return ensureTrailingNewline(sections.join("\n\n"));
}

function allContextConfigToml(entries: CodexContextEntries): string {
  const sections: string[] = [];
  for (const option of contextKindOptions) {
    for (const entry of dedupeContextEntryList(contextEntriesByKind(entries, option.kind))) {
      sections.push(contextEntryToTomlSection(option.tableName, entry));
    }
  }
  return ensureTrailingNewline(sections.join("\n\n"));
}

function contextEntryToTomlSection(tableName: string, entry: CodexContextEntry): string {
  const parentHeader = `[${tableName}.${tomlKey(entry.id)}]`;
  const body = entry.tomlBody
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => relativeContextSubtableToAbsolute(line, tableName, entry.id))
    .join("\n");
  return `${parentHeader}\n${body}`;
}

function relativeContextSubtableToAbsolute(line: string, tableName: string, id: string): string {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  if (!match) return line;
  const subtable = match[1].trim();
  if (!subtable || subtable.includes(".")) return line;
  return `[${tableName}.${tomlKey(id)}.${tomlKey(subtable)}]`;
}

function syncLiveConfigContextState(liveConfigContents: string, settings: BackendSettings): string {
  const entries = contextEntriesFromSettings(settings);
  const withoutManaged = stripContextEntriesFromConfig(liveConfigContents, entries);
  return joinTomlSectionsRootFirst([withoutManaged, selectedContextConfigToml(entries)]);
}

function relayCombinedCommonConfig(settings: BackendSettings): string {
  return joinTomlSectionsRootFirst([settings.relayCommonConfigContents || "", settings.relayContextConfigContents || ""]);
}

function splitContextConfigText(configContents: string): { common: string; context: string } {
  const entries = contextEntriesFromConfig(configContents);
  return {
    common: stripContextEntriesFromConfig(configContents, entries),
    context: allContextConfigToml(entries),
  };
}

function stripContextEntriesFromConfig(configContents: string, entries: CodexContextEntries): string {
  const knownIds: Record<ContextKind, Set<string>> = {
    mcp: new Set(entries.mcpServers.map((entry) => entry.id)),
    skill: new Set(entries.skills.map((entry) => entry.id)),
    plugin: new Set(entries.plugins.map((entry) => entry.id)),
  };
  const lines = configContents.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const contextHeader = contextHeaderFromLine(line);
    if (contextHeader) {
      skipping = knownIds[contextHeader.kind].has(contextHeader.id);
    } else if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      skipping = false;
    }
    if (!skipping) kept.push(line);
  }

  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function stripCommonConfigTextFallback(configContents: string, commonConfig: string): string {
  const anchors = commonConfigAnchors(commonConfig);
  if (!anchors.rootKeys.size && !anchors.tableHeaders.size) return ensureTrailingNewline(configContents.trimEnd());

  const kept: string[] = [];
  let skippingTable = false;

  for (const line of configContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      skippingTable = anchors.tableHeaders.has(trimmed);
      if (skippingTable) continue;
    }
    if (skippingTable) continue;
    const key = tomlRootKeyFromLine(trimmed);
    if (key && anchors.rootKeys.has(key)) continue;
    kept.push(line);
  }

  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function commonConfigAnchors(commonConfig: string): { rootKeys: Set<string>; tableHeaders: Set<string> } {
  const rootKeys = new Set<string>();
  const tableHeaders = new Set<string>();
  let inRoot = true;

  for (const line of commonConfig.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      inRoot = false;
      tableHeaders.add(trimmed);
      continue;
    }
    if (inRoot) {
      const key = tomlRootKeyFromLine(trimmed);
      if (key) rootKeys.add(key);
    }
  }

  return { rootKeys, tableHeaders };
}

function tomlRootKeyFromLine(line: string): string | null {
  if (!line || line.startsWith("#")) return null;
  const index = line.indexOf("=");
  if (index < 0) return null;
  const key = line.slice(0, index).trim();
  return key || null;
}

function contextHeaderFromLine(line: string): { kind: ContextKind; id: string } | null {
  const path = tomlTablePathFromLine(line);
  if (!path || path.length !== 2) return null;
  const option = contextKindOptions.find((item) => item.tableName === path[0]);
  return option ? { kind: option.kind, id: path[1] } : null;
}

function applyContextLimitPreview(configContents: string, profile: RelayProfile): string {
  const replacements: Array<[string, string]> = [
    ["model_context_window", profile.contextWindow],
    ["model_auto_compact_token_limit", profile.autoCompactLimit],
  ];
  let lines = configContents.split(/\r?\n/);

  for (const [key, value] of replacements) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    let replaced = false;
    lines = lines.map((line) => {
      if (!replaced && new RegExp(`^\\s*${key}\\s*=`).test(line)) {
        replaced = true;
        return `${key} = ${trimmed}`;
      }
      return line;
    });
    if (!replaced) {
      const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
      const insertAt = firstTable >= 0 ? firstTable : lines.length;
      lines.splice(insertAt, 0, `${key} = ${trimmed}`);
    }
  }

  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function removeRootTomlKey(contents: string, key: string): string {
  const lines: string[] = [];
  let inRoot = true;
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) inRoot = false;
    if (inRoot && new RegExp(`^\\s*${key}\\s*=`).test(line)) continue;
    lines.push(line);
  }
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function joinTomlSections(sections: string[]): string {
  return ensureTrailingNewline(
    sections
      .map((section) => section.trim())
      .filter(Boolean)
      .join("\n\n"),
  );
}

function joinTomlSectionsRootFirst(sections: string[]): string {
  const rootParts: string[] = [];
  const tableParts: string[] = [];

  for (const section of sections) {
    const { root, tables } = splitTomlRootAndTables(section);
    if (root.trim()) rootParts.push(root.trim());
    if (tables.trim()) tableParts.push(tables.trim());
  }

  return normalizeDuplicateTomlTables(joinTomlSections([...dedupeTomlRootLines(rootParts), ...tableParts]));
}

function normalizeDuplicateTomlTables(contents: string): string {
  const seenHeaders = new Set<string>();
  const kept: string[] = [];
  let skipping = false;

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      skipping = seenHeaders.has(trimmed);
      seenHeaders.add(trimmed);
      if (skipping) continue;
    }
    if (!skipping) kept.push(line);
  }

  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function dedupeTomlRootLines(rootParts: string[]): string[] {
  const rootLines = rootParts
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const rootSeen = new Set<string>();
  const kept: string[] = [];

  for (let index = rootLines.length - 1; index >= 0; index -= 1) {
    const line = rootLines[index];
    const key = tomlRootKeyFromLine(line.trim());
    if (key) {
      if (rootSeen.has(key)) continue;
      rootSeen.add(key);
    }
    kept.push(line);
  }

  const normalized = kept.reverse().join("\n").trim();
  return normalized ? [normalized] : [];
}

function splitTomlRootAndTables(section: string): { root: string; tables: string } {
  const lines = section.trim().split(/\r?\n/);
  const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  if (firstTable < 0) return { root: lines.join("\n"), tables: "" };
  return {
    root: lines.slice(0, firstTable).join("\n"),
    tables: lines.slice(firstTable).join("\n"),
  };
}

function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${tomlString(key)}"`;
}

function contextSelectionIds(selection: RelayContextSelection, kind: ContextKind): string[] {
  if (kind === "mcp") return selection.mcpServers;
  if (kind === "skill") return selection.skills;
  return selection.plugins;
}

function setContextSelectionId(selection: RelayContextSelection, kind: ContextKind, id: string, checked: boolean): RelayContextSelection {
  const next = {
    mcpServers: [...selection.mcpServers],
    skills: [...selection.skills],
    plugins: [...selection.plugins],
  };
  const list = contextSelectionIds(next, kind);
  const normalizedId = id.trim();
  const exists = list.includes(normalizedId);
  if (checked && normalizedId && !exists) list.push(normalizedId);
  if (!checked && exists) list.splice(list.indexOf(normalizedId), 1);
  return next;
}

function removeContextSelectionFromSettings(settings: BackendSettings, kind: ContextKind, id: string): BackendSettings {
  return {
    ...settings,
    relayProfiles: settings.relayProfiles.map((profile) => ({
      ...profile,
      contextSelection: setContextSelectionId(profile.contextSelection, kind, id, false),
    })),
  };
}

function contextSelectionForAllEntries(settings: BackendSettings): RelayContextSelection {
  const entries = contextEntriesFromSettings(settings);
  return {
    mcpServers: entries.mcpServers.map((entry) => entry.id),
    skills: entries.skills.map((entry) => entry.id),
    plugins: entries.plugins.map((entry) => entry.id),
  };
}

function relayProfileEditorStatus(profile: RelayProfile, form: BackendSettings, isNew: boolean) {
  if (isNew) return t("新建供应商需要先保存到列表");
  if (!form.relayProfilesEnabled) return t("供应商配置总开关已关闭；当前只保存配置，不写入 Codex live 文件");
  return profile.id === form.activeRelayId ? t("当前正在使用") : t("编辑后保存列表，再切换模式时会使用新配置");
}

function providerInitial(name: string) {
  const trimmed = (name || t("供应商")).trim();
  return Array.from(trimmed)[0]?.toUpperCase() || t("供");
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    found: t("已找到"),
    missing: t("缺失"),
    installed: t("已安装"),
    ok: t("正常"),
    running: t("运行中"),
    failed: t("失败"),
    archived: t("已归档"),
    accepted: t("已受理"),
    not_checked: t("未检查"),
    not_implemented: t("未实现"),
    disabled: t("已禁用"),
    unknown: t("未知"),
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (["found", "installed", "ok", "running"].includes(status)) return "good";
  if (["failed", "missing"].includes(status)) return "bad";
  return "warn";
}

function isSuccessStatus(status?: Status) {
  return status === "ok" || status === "accepted";
}

function legacyImportItemCanAutoApply(item: LegacyImportItem) {
  return item.group === "nonSensitiveConfig" && !item.requiresConfirmation;
}

function legacyImportSelectedIdsForTransaction(preview: LegacyImportPreview, selectedItemIds: string[]) {
  const selected = new Set(selectedItemIds);
  for (const item of preview.items) {
    if (item.requiresConfirmation) selected.add(item.id);
  }
  return Array.from(selected);
}

function legacyImportItemTitle(item: LegacyImportItem) {
  return `${legacyImportGroupLabel(item.group)} · ${item.sourceKey || item.id}`;
}

function legacyImportItemDetail(item: LegacyImportItem) {
  return `${legacyImportActionLabel(item.action)} · ${item.target} · ${legacyImportRiskLabel(item.risk)}`;
}

function legacyImportGroupLabel(group: string) {
  const labels: Record<string, string> = {
    nonSensitiveConfig: t("非敏感配置"),
    executableOrExternal: t("外部路径/可执行项"),
    secret: t("Secret"),
    runtimeOrCache: t("运行缓存"),
    codexNativeSession: t("Codex 原生会话"),
    conflict: t("冲突"),
  };
  return labels[group] ?? group;
}

function legacyImportActionLabel(action: string) {
  const labels: Record<string, string> = {
    convertAutomatically: t("自动转换"),
    convertProviderWithoutSecrets: t("导入供应商骨架"),
    convertAggregateProviderWithoutSecrets: t("导入聚合供应商骨架"),
    requiresUserConfirmation: t("需要确认"),
    importSecretWithConfirmation: t("待安全确认"),
  };
  return labels[action] ?? action;
}

function legacyImportRiskLabel(risk: string) {
  const labels: Record<string, string> = {
    low: t("低风险"),
    externalPath: t("外部路径"),
    secret: t("敏感凭据"),
    executableConfig: t("可执行配置"),
  };
  return labels[risk] ?? risk;
}

function legacyImportCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    runtimeOrCache: t("运行缓存"),
    codexNativeSession: t("Codex 原生会话"),
    defaultExcluded: t("默认排除"),
  };
  return labels[category] ?? category;
}

function truncateSessionDeletePreview(value: string) {
  const normalized = value.trim();
  return normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;
}

function healthItems(overview: OverviewResult | null) {
  return [
    {
      title: t("Codex 应用"),
      status: overview?.codex_app.status ?? "not_checked",
      ok: overview?.codex_app.status === "found",
      detail: overview?.codex_app.path || t("尚未检查 Codex 应用路径。"),
    },
    {
      title: t("Codex Deck 入口"),
      status: overview?.silent_shortcut.status ?? "not_checked",
      ok: overview?.silent_shortcut.status === "installed",
      detail: overview?.silent_shortcut.path || t("缺少 Codex Deck 入口时可在安装维护页修复。"),
    },
  ];
}

function normalizeSettings(settings: BackendSettings): BackendSettings {
  const backendAggregates = new Map(
    (settings.aggregateRelayProfiles ?? []).map((aggregate) => [aggregate.id, aggregate] as const),
  );
  const splitCommon = splitContextConfigText(settings.relayCommonConfigContents || "");
  const relayCommonConfigContents = splitCommon.common;
  const relayContextConfigContents = joinTomlSectionsRootFirst([
    settings.relayContextConfigContents || "",
    splitCommon.context,
  ]);
  const defaultContextSelection = contextSelectionForAllEntries({
    ...settings,
    relayCommonConfigContents,
    relayContextConfigContents,
  });
  const profiles =
    settings.relayProfiles?.length
      ? settings.relayProfiles.map((profile) =>
          normalizeRelayProfile(hydrateAggregateRelayProfile(profile, backendAggregates.get(profile.id)), defaultContextSelection),
        )
      : [
          {
            id: settings.activeRelayId || "default",
            name: t("默认中转"),
            model: "",
            baseUrl: settings.relayBaseUrl || defaultSettings.relayBaseUrl,
            upstreamBaseUrl: settings.relayBaseUrl || defaultSettings.relayBaseUrl,
            apiKey: settings.relayApiKey || "",
            protocol: "responses" as RelayProtocol,
            relayMode: "official" as RelayMode,
            officialMixApiKey: false,
            testModel: "",
            configContents: "",
            authContents: "",
            useCommonConfig: true,
            contextSelection: defaultContextSelection,
            contextSelectionInitialized: true,
            contextWindow: "",
            autoCompactLimit: "",
            modelList: "",
            modelWindows: "",
            stripImages: false,
            modelImageSupport: "",
      modelReasoningSupport: "",
            userAgent: "",
          },
        ];
  const activeRelayId = profiles.some((profile) => profile.id === settings.activeRelayId)
    ? settings.activeRelayId
    : profiles[0]?.id || "default";
  return syncLegacyRelayFields({
    ...defaultSettings,
    ...settings,
    relayProfilesEnabled: settings.relayProfilesEnabled !== false,
    computerUseGuardEnabled: settings.computerUseGuardEnabled === true,
    codexAppGoalResumeGuard: settings.codexAppGoalResumeGuard === true,
    codexAppImageOverlayOpacity: clampNumber(settings.codexAppImageOverlayOpacity || 35, 1, 100),
    codexAppImageOverlayFitMode: normalizeImageOverlayFitMode(settings.codexAppImageOverlayFitMode),
    codexAppStepwiseMaxItems: clampNumber(settings.codexAppStepwiseMaxItems ?? 6, 0, 6),
    visionRelay: {
      enabled: settings.visionRelay?.enabled === true,
      model: settings.visionRelay?.model || "",
      apiKey: settings.visionRelay?.apiKey || "",
      baseUrl: settings.visionRelay?.baseUrl || "",
      // 默认 chatCompletions：旧 settings.json 不带 protocol 字段时
      // 反序列化得到的也是 ChatCompletions，向后兼容
      protocol: settings.visionRelay?.protocol || "chatCompletions",
      maxTokens: settings.visionRelay?.maxTokens || 256,
      contextWindow: settings.visionRelay?.contextWindow || 0,
    },
    codexAppStepwiseMaxInputChars: clampNumber(settings.codexAppStepwiseMaxInputChars || 6000, 1000, 24000),
    codexAppStepwiseMaxOutputTokens: clampNumber(settings.codexAppStepwiseMaxOutputTokens || 500, 100, 4000),
    codexAppStepwiseTimeoutMs: clampNumber(settings.codexAppStepwiseTimeoutMs || 8000, 1000, 60000),
    relayCommonConfigContents,
    relayContextConfigContents,
    relayProfiles: profiles,
    activeRelayId,
  });
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeImageOverlayFitMode(value: string | undefined): ImageOverlayFitMode {
  return value === "fill" || value === "fit" || value === "stretch" || value === "tile" || value === "center"
    ? value
    : "fit";
}

function codexExtraArgsToInput(args: string[] | undefined) {
  return (args ?? []).join("\n");
}

function inputToCodexExtraArgs(value: string) {
  return value === "" ? [] : value.split(/\r?\n/);
}

function normalizeRelayProfile(profile: RelayProfile, defaultContextSelection = emptyContextSelection()): RelayProfile {
  const legacyMixedApi = profile.relayMode === "mixedApi";
  if (profile.relayMode === "aggregate" || profile.aggregate) {
    return normalizeAggregateRelayProfile(
      {
        ...profile,
        model: profile.model || "",
        baseUrl: "",
        upstreamBaseUrl: "",
        apiKey: "",
        protocol: "responses",
        relayMode: "aggregate",
        officialMixApiKey: false,
        testModel: profile.testModel || "",
        configContents: "",
        authContents: "",
        useCommonConfig: profile.useCommonConfig !== false,
        contextSelection: profile.contextSelectionInitialized
          ? normalizeContextSelection(profile.contextSelection)
          : normalizeContextSelection(undefined, defaultContextSelection),
        contextSelectionInitialized: true,
        contextWindow: "",
        autoCompactLimit: "",
        modelList: "",
        modelWindows: "",
        stripImages: false,
        modelImageSupport: "",
      modelReasoningSupport: "",
      },
      null,
    );
  }
  const relayMode = normalizeRelayMode(profile.relayMode);
  const officialMixApiKey = profile.officialMixApiKey === true || legacyMixedApi;
  let normalized: RelayProfile = {
    ...profile,
    model: profile.model || "",
    baseUrl: profile.baseUrl || defaultSettings.relayBaseUrl,
    upstreamBaseUrl: profile.upstreamBaseUrl || profile.baseUrl || "",
    apiKey: profile.apiKey || "",
    protocol: profile.protocol === "chatCompletions" ? "chatCompletions" : "responses",
    relayMode,
    officialMixApiKey,
    testModel: profile.testModel || "",
    configContents: relayMode === "official" && !officialMixApiKey ? "" : profile.configContents || "",
    authContents: relayMode === "official" && !officialMixApiKey ? buildOfficialRelayAuthJson(profile.authContents || "") : profile.authContents || "",
    useCommonConfig: profile.useCommonConfig !== false,
    contextSelection: profile.contextSelectionInitialized
      ? normalizeContextSelection(profile.contextSelection)
      : normalizeContextSelection(undefined, defaultContextSelection),
    contextSelectionInitialized: true,
    contextWindow: profile.contextWindow || "",
    autoCompactLimit: profile.autoCompactLimit || "",
    modelList: profile.modelList || "",
    modelWindows: profile.modelWindows || "",
    stripImages: profile.stripImages ?? false,
    modelImageSupport: profile.modelImageSupport ?? "",
    modelReasoningSupport: profile.modelReasoningSupport ?? "",
    userAgent: profile.userAgent || "",
    aggregate: null,
  };
  return relayProfileUsesLiveFiles(normalized) ? deriveRelayProfileFromFiles(normalized) : normalized;
}

function hydrateAggregateRelayProfile(profile: RelayProfile, aggregate: AggregateRelayProfile | undefined): RelayProfile {
  if (!aggregate) return profile;
  return {
    ...profile,
    name: profile.name || aggregate.name,
    relayMode: "aggregate",
    aggregate: {
      strategy: aggregate.strategy,
      members: aggregate.members.map((member) => ({
        profileId: member.relayId,
        weight: clampAggregateWeight(member.weight),
      })),
    },
  };
}

function activeRelayProfile(settings: BackendSettings): RelayProfile {
  return (
    settings.relayProfiles.find((profile) => profile.id === settings.activeRelayId) ||
    settings.relayProfiles[0] ||
    defaultSettings.relayProfiles[0]
  );
}

function relayProtocolLabel(protocol: RelayProtocol): string {
  return protocol === "chatCompletions" ? t("Chat Completions 转 Responses") : "Responses API";
}

function ccsProviderSummary(result: CcsProvidersResult | null): string {
  if (!result) return t("读取 ~/.cc-switch/cc-switch.db");
  if (!isSuccessStatus(result.status)) return result.message || t("读取 cc-switch 供应商失败。");
  const count = result.providers.length;
  return count ? tf("发现 {0} 个 Codex 供应商", [count]) : t("未发现可导入供应商");
}

function normalizeRelayMode(mode: RelayMode | undefined): RelayMode {
  if (mode === "aggregate") return mode;
  if (mode === "pureApi") return mode;
  return "official";
}

function normalizeContextSelection(
  selection?: Partial<RelayContextSelection>,
  fallback: RelayContextSelection = emptyContextSelection(),
): RelayContextSelection {
  if (!selection) {
    return {
      mcpServers: [...fallback.mcpServers],
      skills: [...fallback.skills],
      plugins: [...fallback.plugins],
    };
  }
  return {
    mcpServers: Array.isArray(selection?.mcpServers) ? selection.mcpServers.map(String) : [],
    skills: Array.isArray(selection?.skills) ? selection.skills.map(String) : [],
    plugins: Array.isArray(selection?.plugins) ? selection.plugins.map(String) : [],
  };
}

function relayModeLabel(mode: RelayMode): string {
  if (mode === "aggregate") return t("聚合供应商");
  if (mode === "pureApi") return t("纯 API");
  return t("官方登录");
}

function providerImportWireApiLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "chat" || normalized === "chat_completions" || normalized === "chat-completions") {
    return "Chat Completions";
  }
  return "Responses";
}

function providerImportRelayModeLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "official") return t("官方登录");
  if (normalized === "mixedapi" || normalized === "mixed-api" || normalized === "mixed_api") return t("混入 API");
  if (normalized === "aggregate") return t("聚合供应商");
  return t("纯 API");
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return t("未填写");
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function relayProfileConfigBrief(profile: RelayProfile): string {
  if (isAggregateRelayProfile(profile)) {
    const aggregate = normalizeAggregateConfig(profile.aggregate, []);
    return tf("{0} · {1} 个成员", [aggregateStrategyLabel(aggregate.strategy), aggregate.members.length]);
  }
  if (profile.relayMode === "official") return profile.officialMixApiKey ? t("混入 API Key") : t("不写 API 文件");
  return profile.baseUrl || t("未填写 URL");
}

function relayProfileModelCount(profile: RelayProfile): number {
  const models = profile.modelList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (models.length) return models.length;
  return profile.model.trim() ? 1 : 0;
}

function relayLatencyHealthPercent(status: "idle" | "loading" | "ok" | "failed", latencyMs: number | null): number {
  if (status === "failed") return 12;
  if (status !== "ok" || latencyMs === null) return 36;
  return Math.max(18, Math.min(100, Math.round(100 - latencyMs / 15)));
}

function relayProfileLatencyTarget(profile: RelayProfile): string {
  if (isAggregateRelayProfile(profile)) return "";
  if (profile.relayMode === "official" && !profile.officialMixApiKey) return "";
  if (profile.protocol === "chatCompletions") {
    return (profile.upstreamBaseUrl || profile.baseUrl).trim();
  }
  return profile.baseUrl.trim();
}

function relayProfileModeHelp(profile: RelayProfile): string {
  if (isAggregateRelayProfile(profile)) {
    return t("聚合供应商只保存成员和策略配置，成员来自已有 API 供应商；切为当前后会通过本地协议代理轮转请求。");
  }
  if (profile.relayMode === "official") {
    if (profile.officialMixApiKey) {
      return t("此供应商会保留官方登录模式，并把请求混入当前 API Key；Codex 增强仍使用兼容模式。");
    }
    return t("此供应商会切回官方登录模式，使用 ChatGPT 官方账号，不写入 API Key。");
  }
  if (profile.relayMode === "pureApi") {
    return t("此供应商会同时写入 config.toml 和 auth.json；API Key 也会注入到 provider bearer token。");
  }
  return t("此供应商会保留官方登录模式，并把请求混入当前 API Key；Codex 增强仍使用兼容模式。");
}

function relayProfileReadinessText(profile: RelayProfile, relay: RelayResult | null): string {
  if (isAggregateRelayProfile(profile)) {
    const aggregate = normalizeAggregateConfig(profile.aggregate, []);
    return tf("聚合供应商已配置为{0}，包含 {1} 个成员；真实对话会走本地代理轮转。", [aggregateStrategyLabel(aggregate.strategy), aggregate.members.length]);
  }
  if (profile.relayMode === "official") {
    if (profile.officialMixApiKey) {
      const hasApiFields = profile.baseUrl.trim() && profile.apiKey.trim();
      if (!relay?.authenticated && !hasApiFields) return t("当前未登录官方账号，也未配置混入 API 的 Base URL / Key。");
      if (!relay?.authenticated) return t("当前未登录官方账号；官方登录混入 API Key 需要先登录官方账号。");
      if (!hasApiFields) return t("当前还没有填写混入 API 的 Base URL / Key。");
      return tf("官方登录已就绪：{0}，会混入当前 API Key。", [relay.accountLabel || t("已登录")]);
    }
    return relay?.authenticated
      ? tf("官方账号已登录：{0}。", [relay.accountLabel || relay.authSource || t("已检测")])
      : t("当前未登录官方账号；切到官方登录模式后仍需要先在 Codex/ChatGPT 登录。");
  }
  const hasFiles = profile.configContents.trim() && profile.authContents.trim();
  if (!hasFiles) return t("当前供应商还没有完整 config.toml / API Key 存档。");
  if (relay && !relay.configured) return t("纯 API 配置未完整写入：请检查此供应商是否有 OPENAI_API_KEY，且 config.toml 是否包含 model_provider / provider / base_url。");
  return t("纯 API 就绪：会同时写入 config.toml 和 auth.json。");
}

function relayProfileSwitchCommand(profile: RelayProfile): "clear_relay_injection" | "apply_relay_injection" | "apply_pure_api_injection" {
  if (isAggregateRelayProfile(profile)) return "apply_relay_injection";
  if (profile.relayMode === "pureApi") return "apply_pure_api_injection";
  if (profile.relayMode === "official" && !profile.officialMixApiKey) return "clear_relay_injection";
  if (profile.configContents.trim()) return "apply_relay_injection";
  return profile.officialMixApiKey ? "apply_relay_injection" : "clear_relay_injection";
}

function withGeneratedRelayFiles(profile: RelayProfile): RelayProfile {
  if (isAggregateRelayProfile(profile)) {
    return { ...profile, configContents: "", authContents: "", aggregate: normalizeAggregateConfig(profile.aggregate, []) };
  }
  if (profile.relayMode === "official") {
    return {
      ...profile,
      configContents: profile.officialMixApiKey ? buildRelayConfigToml(profile, { includeBearerToken: true }) : "",
      authContents: profile.authContents || "",
    };
  }
  return {
    ...profile,
    configContents: buildRelayConfigToml(profile, { includeBearerToken: false }),
    authContents: buildRelayAuthJson(profile),
  };
}

function buildRelayConfigToml(
  profile: Pick<RelayProfile, "model" | "baseUrl" | "upstreamBaseUrl" | "apiKey" | "protocol">,
  options: { includeBearerToken: boolean },
): string {
  const baseUrl = profile.protocol === "chatCompletions" ? PROTOCOL_PROXY_BASE_URL : profile.baseUrl.trim();
  const apiKey = profile.apiKey.trim();
  const rootLines = [
    profile.model.trim() ? `model = "${tomlString(profile.model.trim())}"` : null,
    'model_provider = "custom"',
    "",
  ].filter((line): line is string => line !== null);
  return [
    ...rootLines,
    "[model_providers.custom]",
    'name = "custom"',
    'wire_api = "responses"',
    "requires_openai_auth = true",
    `base_url = "${tomlString(baseUrl)}"`,
    options.includeBearerToken && apiKey ? `experimental_bearer_token = "${tomlString(apiKey)}"` : null,
    "",
  ].filter((line): line is string => line !== null).join("\n");
}

function buildRelayAuthJson(profile: Pick<RelayProfile, "apiKey">): string {
  return `${JSON.stringify({ OPENAI_API_KEY: profile.apiKey.trim() }, null, 2)}\n`;
}

function buildOfficialRelayAuthJson(contents: string): string {
  const trimmed = contents.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    delete parsed.OPENAI_API_KEY;
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch {
    return "";
  }
}

function deriveRelayProfileFromFiles(profile: RelayProfile): RelayProfile {
  if (isAggregateRelayProfile(profile)) {
    return normalizeAggregateRelayProfile(profile, null);
  }
  const configContents = profile.configContents || "";
  const authContents = profile.relayMode === "official" ? buildOfficialRelayAuthJson(profile.authContents || "") : profile.authContents || "";
  const configBaseUrl = codexBaseUrlFromConfig(configContents);
  const chatUpstreamBaseUrl = rootTomlStringValue(configContents, CHAT_UPSTREAM_BASE_URL_KEY);
  const isProxyConfig = configBaseUrl === PROTOCOL_PROXY_BASE_URL;
  const upstreamBaseUrl = profile.upstreamBaseUrl || chatUpstreamBaseUrl || (configBaseUrl && !isProxyConfig ? configBaseUrl : profile.baseUrl || "");
  const configApiKey = codexExperimentalBearerTokenFromConfig(configContents);
  const configModel = codexModelFromConfig(configContents);
  // 如果用户输入了带后缀的模型名，优先保留在界面的「配置模型」字段中；
  // config.toml 里实际写的是剥离后缀的 slug（由 applyRelayProfilePatchToFiles 处理）。
  const model = /\[.+\]$/.test(profile.model.trim()) ? profile.model.trim() : configModel;
  return {
    ...profile,
    model,
    baseUrl: upstreamBaseUrl,
    upstreamBaseUrl,
    apiKey: profile.relayMode === "official"
      ? configApiKey || profile.apiKey || ""
      : codexApiKeyFromAuth(authContents) || configApiKey || "",
    contextWindow: codexTopLevelIntFromConfig(configContents, "model_context_window"),
    autoCompactLimit: codexTopLevelIntFromConfig(configContents, "model_auto_compact_token_limit"),
    configContents,
    authContents,
  };
}

function applyRelayProfilePatchToFiles(
  profile: RelayProfile,
  patch: Partial<RelayProfile>,
  options: { allowGenerateFiles?: boolean } = {},
): RelayProfile {
  let next: RelayProfile = { ...profile, ...patch };
  if (isAggregateRelayProfile(next)) {
    return normalizeAggregateRelayProfile(next, null);
  }
  const shouldHaveFiles =
    next.relayMode !== "official" || next.officialMixApiKey || next.configContents.trim() || next.authContents.trim();
  const needsAuthFile = next.relayMode === "pureApi";
  if (options.allowGenerateFiles && shouldHaveFiles && (!next.configContents.trim() || (needsAuthFile && !next.authContents.trim()))) {
    next = withGeneratedRelayFiles(next);
  }

  if ("model" in patch) {
    // 模型后缀（如 [1M]）仅供 CodexPlusPlus 内部使用，写入 config.toml 前需剥离，
    // 否则 codex 会按带后缀的字符串去匹配 catalog slug，导致窗口回退到默认值。
    const { slug } = parseModelSuffix(patch.model || "");
    next.configContents = setRootTomlStringKey(next.configContents, "model", slug);
  }
  if ("apiKey" in patch) {
    if (next.relayMode === "pureApi") {
      next.authContents = setAuthOpenAiApiKey(next.authContents, patch.apiKey || "");
      next.configContents = removeCodexExperimentalBearerToken(next.configContents);
    } else {
      next.configContents = setCodexExperimentalBearerToken(next.configContents, patch.apiKey || "");
    }
  }
  if ("baseUrl" in patch) {
    next.upstreamBaseUrl = patch.baseUrl || "";
  }
  if ("upstreamBaseUrl" in patch) {
    next.baseUrl = patch.upstreamBaseUrl || "";
  }
  if ("baseUrl" in patch || "upstreamBaseUrl" in patch || "protocol" in patch) {
    const baseUrlForConfig = next.protocol === "chatCompletions" ? PROTOCOL_PROXY_BASE_URL : next.upstreamBaseUrl || next.baseUrl;
    next.configContents = setCodexProviderStringKey(next.configContents, "base_url", baseUrlForConfig);
    next.configContents = removeRootTomlKey(next.configContents, CHAT_UPSTREAM_BASE_URL_KEY);
  }
  if ("contextWindow" in patch) {
    next.configContents = setRootTomlIntKey(next.configContents, "model_context_window", patch.contextWindow || "");
  }
  if ("autoCompactLimit" in patch) {
    next.configContents = setRootTomlIntKey(
      next.configContents,
      "model_auto_compact_token_limit",
      patch.autoCompactLimit || "",
    );
  }
  if ("relayMode" in patch || "officialMixApiKey" in patch) {
    if (next.relayMode === "official" && !next.officialMixApiKey) {
      next.configContents = "";
      next.authContents = buildOfficialRelayAuthJson(next.authContents);
    } else if (options.allowGenerateFiles && (!next.configContents.trim() || (next.relayMode === "pureApi" && !next.authContents.trim()))) {
      next = withGeneratedRelayFiles(next);
    }
  }

  return deriveRelayProfileFromFiles(next);
}

function codexModelFromConfig(contents: string): string {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("[")) break;
    const match = /^model\s*=\s*(["'])(.*)\1\s*$/.exec(trimmed);
    if (match) return match[2].replace(/\\(["'\\])/g, "$1");
  }
  return "";
}

/// 解析模型后缀语法，如 deepseek-v4-flash[1M] -> { slug: "deepseek-v4-flash", window: 1000000 }
/// 非法或没有后缀时返回原串作为 slug。
function parseModelSuffix(raw: string): { slug: string; window?: number } {
  const trimmed = raw.trim();
  const match = /^(.*?)\[(\d+(?:[KkMm])?)\]$/.exec(trimmed);
  if (!match) return { slug: trimmed };
  const inner = match[2];
  const numPart = inner.replace(/[KkMm]$/, "");
  const multiplier = inner.endsWith("K") || inner.endsWith("k") ? 1_000
    : inner.endsWith("M") || inner.endsWith("m") ? 1_000_000
    : 1;
  const window = Number.parseInt(numPart, 10) * multiplier;
  if (!Number.isFinite(window) || window <= 0) return { slug: trimmed };
  return { slug: match[1].trim(), window };
}

function codexBaseUrlFromConfig(contents: string): string {
  return codexProviderStringFromConfig(contents, "base_url");
}

function codexExperimentalBearerTokenFromConfig(contents: string): string {
  return codexProviderStringFromConfig(contents, "experimental_bearer_token");
}

function codexProviderStringFromConfig(contents: string, key: string): string {
  const provider = rootTomlStringValue(contents, "model_provider");
  const targetSection = provider ? `model_providers.${provider}` : "";
  const lines = contents.split(/\r?\n/);
  let currentSection = "";
  const matches: string[] = [];

  for (const line of lines) {
    const section = tomlSectionName(line);
    if (section !== null) {
      currentSection = section;
      continue;
    }
    const value = tomlStringAssignmentValue(line, key);
    if (value === null) continue;
    if (targetSection && currentSection === targetSection) return value;
    if (!currentSection || !currentSection.startsWith("model_providers.")) matches.push(value);
  }

  return matches.length === 1 ? matches[0] : "";
}

function codexApiKeyFromAuth(contents: string): string {
  try {
    const parsed = JSON.parse(contents || "{}") as { OPENAI_API_KEY?: unknown };
    return typeof parsed.OPENAI_API_KEY === "string" ? parsed.OPENAI_API_KEY : "";
  } catch {
    return "";
  }
}

function codexTopLevelIntFromConfig(contents: string, key: string): string {
  const topLevel = splitTomlRootAndTables(contents).root;
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*(?:#.*)?$`);
  for (const line of topLevel.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match) return match[1];
  }
  return "";
}

function rootTomlStringValue(contents: string, key: string): string {
  const topLevel = splitTomlRootAndTables(contents).root;
  for (const line of topLevel.split(/\r?\n/)) {
    const value = tomlStringAssignmentValue(line, key);
    if (value !== null) return value;
  }
  return "";
}

function tomlSectionName(line: string): string | null {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  return match ? match[1].trim() : null;
}

function tomlStringAssignmentValue(line: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*([\"'])(.*)\\1\\s*(?:#.*)?$`).exec(line.trim());
  if (!match) return null;
  return match[2].replace(/\\(["'\\])/g, "$1");
}

function setAuthOpenAiApiKey(contents: string, apiKey: string): string {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(contents || "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  parsed.OPENAI_API_KEY = apiKey.trim();
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function setRootTomlStringKey(contents: string, key: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return removeRootTomlKey(contents, key);
  return setRootTomlLine(contents, key, `${key} = "${tomlString(trimmed)}"`);
}

function setRootTomlIntKey(contents: string, key: string, value: string): string {
  const trimmed = value.replace(/[^\d]/g, "");
  if (!trimmed) return removeRootTomlKey(contents, key);
  return setRootTomlLine(contents, key, `${key} = ${trimmed}`);
}

function setRootTomlLine(contents: string, key: string, lineText: string): string {
  const lines = contents.split(/\r?\n/);
  const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  const rootEnd = firstTable >= 0 ? firstTable : lines.length;
  for (let index = 0; index < rootEnd; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) {
      lines[index] = lineText;
      return ensureTrailingNewline(lines.join("\n").trimEnd());
    }
  }
  const insertAt = key === "model" ? 0 : rootEnd;
  lines.splice(insertAt, 0, lineText);
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function setCodexProviderStringKey(contents: string, key: string, value: string): string {
  const provider = rootTomlStringValue(contents, "model_provider") || "custom";
  let next = contents;
  if (!rootTomlStringValue(next, "model_provider")) {
    next = setRootTomlStringKey(next, "model_provider", provider);
  }
  next = ensureCodexProviderDefaults(next, provider);
  return setTomlSectionStringKey(next, `model_providers.${provider}`, key, value);
}

function setCodexExperimentalBearerToken(contents: string, apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed
    ? setCodexProviderStringKey(contents, "experimental_bearer_token", trimmed)
    : removeCodexExperimentalBearerToken(contents);
}

function removeCodexExperimentalBearerToken(contents: string): string {
  const provider = rootTomlStringValue(contents, "model_provider") || "custom";
  return removeTomlSectionKey(contents, `model_providers.${provider}`, "experimental_bearer_token");
}

function ensureCodexProviderDefaults(contents: string, provider: string): string {
  let next = contents;
  const section = `model_providers.${provider}`;
  next = setTomlSectionStringKey(next, section, "name", provider);
  next = setTomlSectionStringKey(next, section, "wire_api", "responses");
  return setTomlSectionBoolKey(next, section, "requires_openai_auth", true);
}

function setTomlSectionBoolKey(contents: string, sectionName: string, key: string, value: boolean): string {
  return setTomlSectionRawKey(contents, sectionName, key, value ? "true" : "false");
}

function setTomlSectionStringKey(contents: string, sectionName: string, key: string, value: string): string {
  return setTomlSectionRawKey(contents, sectionName, key, `"${tomlString(value.trim())}"`);
}

function setTomlSectionRawKey(contents: string, sectionName: string, key: string, value: string): string {
  const lines = contents.split(/\r?\n/);
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const section = tomlSectionName(lines[index]);
    if (section === null) continue;
    if (sectionStart >= 0) {
      sectionEnd = index;
      break;
    }
    if (section === sectionName) sectionStart = index;
  }
  if (sectionStart < 0) {
    const prefix = ensureTrailingNewline(lines.join("\n").trimEnd()).trimEnd();
    return joinTomlSections([prefix, `[${sectionName}]\n${key} = ${value}`]);
  }
  const replacement = `${key} = ${value}`;
  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) {
      lines[index] = replacement;
      return ensureTrailingNewline(lines.join("\n").trimEnd());
    }
  }
  let insertAt = sectionEnd;
  while (insertAt > sectionStart + 1 && lines[insertAt - 1].trim() === "") insertAt -= 1;
  lines.splice(insertAt, 0, replacement);
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function removeTomlSectionKey(contents: string, sectionName: string, key: string): string {
  const lines = contents.split(/\r?\n/);
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const section = tomlSectionName(lines[index]);
    if (section === null) continue;
    if (sectionStart >= 0) {
      sectionEnd = index;
      break;
    }
    if (section === sectionName) sectionStart = index;
  }
  if (sectionStart < 0) return contents;
  const next = lines.filter((line, index) => {
    if (index <= sectionStart || index >= sectionEnd) return true;
    return !new RegExp(`^\\s*${key}\\s*=`).test(line);
  });
  return ensureTrailingNewline(next.join("\n").trimEnd());
}

function relayProfileSwitchValidation(profile: RelayProfile): string | null {
  if (isAggregateRelayProfile(profile)) {
    return aggregateRelayProfileValidation(profile);
  }
  if (profile.relayMode === "official" && !profile.officialMixApiKey) return null;
  if (!profile.configContents.trim()) {
    return tf("供应商「{0}」缺少独立 config.toml，已停止切换，避免继续显示上一套配置文件。请先在该供应商详情里保存 config.toml。", [profile.name || profile.id]);
  }
  if (profile.relayMode !== "official" || !authJsonHasOpenAiApiKey(profile.authContents)) return null;
  return t("官方混合 API 不应在 auth.json 中保存 OPENAI_API_KEY。请清理此供应商的 auth.json 后再切换。");
}

function relayProfileUsesLiveFiles(profile: RelayProfile): boolean {
  return profile.relayMode !== "official" || profile.officialMixApiKey;
}

function authJsonHasOpenAiApiKey(contents: string): boolean {
  const trimmed = contents.trim();
  if (!trimmed) return false;
  try {
    const value = JSON.parse(trimmed);
    return !!value && typeof value === "object" && typeof value.OPENAI_API_KEY === "string" && value.OPENAI_API_KEY.trim().length > 0;
  } catch {
    return /"OPENAI_API_KEY"\s*:/.test(trimmed);
  }
}

function tomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function syncLegacyRelayFields(settings: BackendSettings): BackendSettings {
  const relayProfiles = settings.relayProfiles.map((profile) =>
    isAggregateRelayProfile(profile) ? normalizeAggregateRelayProfile(profile, { ...settings, relayProfiles: settings.relayProfiles }) : deriveRelayProfileFromFiles(profile),
  );
  const active = activeRelayProfile({ ...settings, relayProfiles });
  const aggregateRelayProfiles = normalizeAggregateProfilesFromRelayProfiles(relayProfiles);
  const activeAggregateRelayId = isAggregateRelayProfile(active) ? active.id : "";
  return {
    ...settings,
    relayProfiles,
    activeRelayId: active.id,
    relayBaseUrl: isAggregateRelayProfile(active) ? PROTOCOL_PROXY_BASE_URL : active.baseUrl,
    relayApiKey: active.apiKey,
    aggregateRelayProfiles,
    activeAggregateRelayId,
  };
}

function normalizeAggregateProfilesFromRelayProfiles(profiles: RelayProfile[]): AggregateRelayProfile[] {
  const candidates = profiles.filter((profile) => !isAggregateRelayProfile(profile));
  return profiles.filter(isAggregateRelayProfile).map((profile) => {
    const aggregate = normalizeAggregateConfig(profile.aggregate, candidates);
    return {
      id: profile.id,
      name: profile.name || t("聚合供应商"),
      strategy: aggregate.strategy,
      members: aggregate.members.map((member) => ({
        relayId: member.profileId,
        weight: clampAggregateWeight(member.weight),
      })),
    };
  });
}
function updateRelayProfile(settings: BackendSettings, id: string, patch: Partial<RelayProfile>): BackendSettings {
  if (patch.relayMode === "aggregate" || patch.aggregate) {
    return syncLegacyRelayFields({
      ...settings,
      relayProfiles: settings.relayProfiles.map((profile) =>
        profile.id === id ? normalizeAggregateRelayProfile({ ...profile, ...patch }, settings) : profile,
      ),
    });
  }
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles: settings.relayProfiles.map((profile) => {
      if (profile.id !== id) return profile;
      return deriveRelayProfileFromFiles({ ...profile, ...patch });
    }),
  });
}

function createRelayProfile(settings: BackendSettings): RelayProfile {
  const id = `relay-${Date.now().toString(36)}`;
  const contextSelection = contextSelectionForAllEntries(settings);
  const next = {
    id,
    name: tf("API Key 供应商 {0}", [settings.relayProfiles.filter((profile) => !isAggregateRelayProfile(profile)).length + 1]),
    model: "",
    baseUrl: defaultSettings.relayBaseUrl,
    upstreamBaseUrl: defaultSettings.relayBaseUrl,
    apiKey: "",
    protocol: "responses" as RelayProtocol,
    relayMode: "pureApi" as RelayMode,
    officialMixApiKey: false,
    testModel: "",
    configContents: "",
    authContents: "",
    useCommonConfig: true,
    contextSelection,
    contextSelectionInitialized: true,
    contextWindow: "",
    autoCompactLimit: "",
    modelList: "",
    modelWindows: "",
    stripImages: false,
    modelImageSupport: "",
      modelReasoningSupport: "",
    userAgent: "",
  };
  return withGeneratedRelayFiles(next);
}

function createAggregateRelayProfile(settings: BackendSettings): RelayProfile {
  const id = `aggregate-${Date.now().toString(36)}`;
  const contextSelection = contextSelectionForAllEntries(settings);
  const candidates = aggregateMemberCandidates(settings, id);
  return normalizeAggregateRelayProfile(
    {
      id,
      name: tf("聚合供应商 {0}", [settings.relayProfiles.filter(isAggregateRelayProfile).length + 1]),
      model: "",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      protocol: "responses",
      relayMode: "aggregate",
      officialMixApiKey: false,
      testModel: "",
      configContents: "",
      authContents: "",
      useCommonConfig: true,
      contextSelection,
      contextSelectionInitialized: true,
      contextWindow: "",
      autoCompactLimit: "",
      modelList: "",
      modelWindows: "",
      stripImages: false,
      modelImageSupport: "",
      modelReasoningSupport: "",
      userAgent: "",
      aggregate: {
        strategy: "failover",
        members: candidates.slice(0, 1).map((profile) => ({ profileId: profile.id, weight: 1 })),
      },
    },
    settings,
  );
}

function addRelayProfile(settings: BackendSettings, profile: RelayProfile): BackendSettings {
  const nextWithFiles = isAggregateRelayProfile(profile)
    ? normalizeAggregateRelayProfile(profile, settings)
    : deriveRelayProfileFromFiles(
        profile.configContents.trim() || profile.authContents.trim() ? profile : withGeneratedRelayFiles(profile),
      );
  const activeId = settings.relayProfiles.some((item) => item.id === settings.activeRelayId)
    ? settings.activeRelayId
    : activeRelayProfile(settings).id;
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles: [...settings.relayProfiles, nextWithFiles],
    activeRelayId: activeId,
  });
}

function duplicateRelayProfile(settings: BackendSettings, id: string): BackendSettings {
  const sourceIndex = settings.relayProfiles.findIndex((profile) => profile.id === id);
  const source = settings.relayProfiles[sourceIndex] || activeRelayProfile(settings);
  const nextId = `relay-${Date.now().toString(36)}`;
  const next = {
    ...source,
    id: nextId,
    name: tf("{0} 副本", [source.name || t("未命名供应商")]),
  };
  const normalizedNext = isAggregateRelayProfile(next) ? normalizeAggregateRelayProfile(next, settings) : next;
  const relayProfiles = [...settings.relayProfiles];
  relayProfiles.splice(sourceIndex >= 0 ? sourceIndex + 1 : relayProfiles.length, 0, normalizedNext);
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles,
  });
}

function reorderRelayProfiles(settings: BackendSettings, sourceId: string, targetId: string): BackendSettings {
  if (sourceId === targetId) return settings;
  const sourceIndex = settings.relayProfiles.findIndex((profile) => profile.id === sourceId);
  const targetIndex = settings.relayProfiles.findIndex((profile) => profile.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return settings;
  const relayProfiles = [...settings.relayProfiles];
  const [moved] = relayProfiles.splice(sourceIndex, 1);
  relayProfiles.splice(targetIndex, 0, moved);
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles,
  });
}

function removeRelayProfile(settings: BackendSettings, id: string): BackendSettings {
  const profiles = settings.relayProfiles.filter((profile) => profile.id !== id);
  const scrubbedProfiles = profiles.map((profile) =>
    isAggregateRelayProfile(profile)
      ? normalizeAggregateRelayProfile(
          {
            ...profile,
            aggregate: {
              ...normalizeAggregateConfig(profile.aggregate, []),
              members: normalizeAggregateConfig(profile.aggregate, []).members.filter((member) => member.profileId !== id),
            },
          },
          { ...settings, relayProfiles: profiles },
        )
      : profile,
  );
  return syncLegacyRelayFields({
    ...settings,
    relayProfiles: scrubbedProfiles.length ? scrubbedProfiles : defaultSettings.relayProfiles,
    activeRelayId: settings.activeRelayId === id ? scrubbedProfiles[0]?.id || "default" : settings.activeRelayId,
  });
}

const aggregateStrategyOptions: Array<{ value: RelayAggregateStrategy; label: string; description: string }> = [
  {
    value: "failover",
    label: t("失败切换"),
    description: t("按成员顺序请求，失败后切到下一个供应商。"),
  },
  {
    value: "conversationRoundRobin",
    label: t("按对话轮转"),
    description: t("同一对话保持一个成员，不同对话依次分配。"),
  },
  {
    value: "requestRoundRobin",
    label: t("按请求轮转"),
    description: t("每次请求按成员顺序切换，适合均匀摊请求量。"),
  },
  {
    value: "weightedRoundRobin",
    label: t("权重轮转"),
    description: t("按成员权重分配请求，权重越高承担越多。"),
  },
];

function isAggregateRelayProfile(profile: Pick<RelayProfile, "relayMode" | "aggregate">): boolean {
  return profile.relayMode === "aggregate" || !!profile.aggregate;
}

function normalizeAggregateRelayProfile(profile: RelayProfile, settings: BackendSettings | null): RelayProfile {
  const candidates = settings ? aggregateMemberCandidates(settings, profile.id) : [];
  const aggregate = normalizeAggregateConfig(profile.aggregate, candidates);
  return {
    ...profile,
    baseUrl: "",
    upstreamBaseUrl: "",
    apiKey: "",
    protocol: "responses",
    relayMode: "aggregate",
    officialMixApiKey: false,
    configContents: "",
    authContents: "",
    aggregate,
  };
}

function normalizeAggregateConfig(
  aggregate: RelayAggregateConfig | null | undefined,
  candidates: RelayProfile[],
): RelayAggregateConfig {
  const candidateIds = new Set(candidates.map((profile) => profile.id));
  const seen = new Set<string>();
  const strategy: RelayAggregateStrategy =
    aggregate?.strategy && aggregateStrategyOptions.some((option) => option.value === aggregate.strategy)
      ? aggregate.strategy
      : "failover";
  const members = (aggregate?.members ?? [])
    .filter((member) => member.profileId && !seen.has(member.profileId))
    .filter((member) => !candidateIds.size || candidateIds.has(member.profileId))
    .map((member) => {
      seen.add(member.profileId);
      return { profileId: member.profileId, weight: clampAggregateWeight(member.weight) };
    });
  return { strategy, members };
}

function aggregateMemberCandidates(settings: BackendSettings, aggregateId: string): RelayProfile[] {
  return settings.relayProfiles.filter(
    (profile) => profile.id !== aggregateId && !isAggregateRelayProfile(profile) && isApiRelayProfile(profile),
  );
}

function isApiRelayProfile(profile: RelayProfile): boolean {
  return Boolean(profile.baseUrl.trim() && profile.apiKey.trim());
}

function isOAuthRelayProfile(profile: RelayProfile): boolean {
  if (profile.relayMode !== "official" || profile.officialMixApiKey) return false;
  try {
    const auth = JSON.parse(profile.authContents);
    const tokens = auth?.tokens ?? auth;
    return typeof tokens?.access_token === "string" && tokens.access_token.trim().length > 0;
  } catch {
    return false;
  }
}

function relayProfileCanJoinLocalPool(profile: RelayProfile): boolean {
  return isOAuthRelayProfile(profile) || isApiRelayProfile(profile);
}

function relayCredentialLabel(profile: RelayProfile): string {
  if (isOAuthRelayProfile(profile)) return t("OAuth");
  return t("API Key");
}

function clampAggregateWeight(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(999, Math.round(value)));
}

function aggregateStrategyLabel(strategy: RelayAggregateStrategy): string {
  return aggregateStrategyOptions.find((option) => option.value === strategy)?.label ?? t("失败切换");
}

function aggregateStrategyHelp(strategy: RelayAggregateStrategy): string {
  if (strategy === "failover") return t("失败切换会保留成员顺序，优先使用第一个可用供应商。");
  if (strategy === "conversationRoundRobin") return t("按对话轮转会让同一对话尽量保持固定成员，降低上下文漂移。");
  if (strategy === "requestRoundRobin") return t("按请求轮转会逐请求切换成员，适合供应商能力接近的场景。");
  return t("权重轮转会读取每个成员的权重值，权重越高的成员获得更多请求。");
}

function aggregateRelayProfileValidation(profile: RelayProfile): string | null {
  const aggregate = normalizeAggregateConfig(profile.aggregate, []);
  return aggregate.members.length >= 1 ? null : t("聚合供应商至少需要勾选 1 个已填写 Base URL / Key 的 API 供应商。");
}

function numberOrDefault(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitLogLines(text: string) {
  return text.trimEnd().split(/\r?\n/).filter((line, index, lines) => line.length > 0 || index < lines.length - 1);
}

function formatTime(value: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

function formatDuration(startedAtMs: number): string {
  if (!startedAtMs) return "-";
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < 0) return formatTime(startedAtMs);
  const mins = Math.floor(elapsed / 60000);
  if (mins < 1) return t("刚刚启动");
  if (mins < 60) return tf("已运行 {0} 分钟", [mins]);
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return tf("已运行 {0} 小时 {1} 分钟", [hours, remainMins]);
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function loadInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem("codex-plus-theme") === "light" ? "light" : "dark";
}

function loadInitialRoute(): Route {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  if (params.get("showUpdate") === "1" || window.location.hash === "#about") {
    return "about";
  }
  return "overview";
}
