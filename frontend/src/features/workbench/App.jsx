import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Button,
  Caption1,
  Checkbox,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Field,
  FluentProvider,
  Input,
  Option,
  Dropdown,
  Radio,
  RadioGroup,
  Spinner,
  Switch,
  Tab,
  TabList,
  Textarea,
  Toast,
  ToastBody,
  Toaster,
  ToastTitle,
  useToastController,
  webDarkTheme,
  webLightTheme,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Tooltip,
  Label,
  ProgressBar,
} from '@fluentui/react-components'
import 'monaco-editor/esm/nls.messages.zh-cn.js'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import {
  AddRegular,
  ArrowClockwiseRegular,
  CheckmarkCircleRegular,
  CopyRegular,
  ArrowDownloadRegular,
  ArrowUpRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  ChevronDownRegular,
  CodeRegular,
  DeleteRegular,
  DocumentRegular,
  EditRegular,
  FolderOpenRegular,
  FolderRegular,
  PlayRegular,
  PlugConnectedRegular,
  SearchRegular,
  SaveRegular,
  SettingsRegular,
  StickerRegular,
  DismissRegular,
  CheckRegular,
  WrenchRegular,
  StorageRegular,
  ArrowLeftRegular,
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
} from '@fluentui/react-icons'
import './App.css'
import EmptyState from '../../components/EmptyState'
import KeyValueEditor from '../../components/KeyValueEditor'
import { hasBackend, invokeBackend } from '../../services/backend'
import {
  createCollectionFolder,
  createCollectionRequest,
  createDefaultBootstrap,
  createServerDraft,
  createWorkspaceTab,
  createWorkspaceSlot,
  getDefaultWorkspaceSlots,
  modes,
  newFormDataPair,
  newCookieItem,
  newCookieScope,
  newPair,
  parseJson,
  prettyJson,
  transports,
} from './lib/defaults'
import { tryImportCurl } from '../http/curl'
import { generateHttpSnippet, generateMcpSnippet } from '../snippets/snippets'

const DIALOG_RESET_DELAY = 180
const OPERATION_SUCCESS_DELAY = 1200
const BOOTSTRAP_TIMEOUT = 12000
const AUTO_SAVE_DELAY = 450

window.MonacoEnvironment = {
  ...(window.MonacoEnvironment || {}),
  locale: 'zh-cn',
  getWorker(_, label) {
    const workerByLabel = {
      json: jsonWorker,
      css: cssWorker,
      scss: cssWorker,
      less: cssWorker,
      html: htmlWorker,
      handlebars: htmlWorker,
      razor: htmlWorker,
      typescript: tsWorker,
      javascript: tsWorker,
    }
    const WorkerCtor = workerByLabel[label] || editorWorker
    return new WorkerCtor()
  },
}

loader.config({
  monaco,
})

loader.init().catch((error) => {
  console.error('[monaco] loader init failed', error)
})

const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const httpEditorTabs = ['params', 'headers', 'auth', 'body']
const httpEditorTabLabels = { params: '参数', headers: '请求头', auth: '认证', body: '请求体' }
const httpBodyModes = ['none', 'form-data', 'x-www-form-urlencoded', 'raw', 'binary']
const httpBodyModeLabels = {
  none: '空',
  'form-data': '表单数据',
  'x-www-form-urlencoded': 'x-www-form-urlencoded',
  raw: '原始类型',
  binary: '二进制',
}
const rawTypeOptions = ['text', 'javascript', 'json', 'html', 'xml']
const rawTypeLabels = {
  text: 'Text',
  javascript: 'JavaScript',
  json: 'JSON',
  html: 'HTML',
  xml: 'XML',
}
const rawTypeLanguageMap = {
  text: 'plaintext',
  javascript: 'javascript',
  json: 'json',
  html: 'html',
  xml: 'xml',
}
const collectionRootValue = '__root__'
const snippetLanguages = {
  http: ['curl', 'fetch', 'go', 'python', 'axios'],
  mcp: ['json', 'typescript', 'python'],
}
const sidebarMinWidth = 280
const sidebarMaxWidth = sidebarMinWidth * 2
const sidebarCollapsedWidth = 72

function App() {
  const toasterId = 'mcp-server-refresh-toaster'
  const { dispatchToast } = useToastController(toasterId)
  const [bootstrap, setBootstrap] = useState(createDefaultBootstrap())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [modalNoticeDialog, setModalNoticeDialog] = useState({ open: false, title: '', message: '' })
  const [loadError, setLoadError] = useState('')
  const [bootstrapReady, setBootstrapReady] = useState(false)
  const [fatalErrorDialog, setFatalErrorDialog] = useState('')
  const [workspaceSlots, setWorkspaceSlots] = useState(getDefaultWorkspaceSlots())
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(workspaceSlots[0]?.id || '')
  const [sidebarTab, setSidebarTab] = useState('collections')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(sidebarMinWidth)
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const [sidebarTransitioning, setSidebarTransitioning] = useState(false)
  const [sidebarFloatingTab, setSidebarFloatingTab] = useState('')
  const [expandedFolders, setExpandedFolders] = useState({})
  const [collectionSaveDialogOpen, setCollectionSaveDialogOpen] = useState(false)
  const [collectionSaveDraft, setCollectionSaveDraft] = useState({ name: '', folderId: collectionRootValue })
  const [collectionFolderKeyword, setCollectionFolderKeyword] = useState('')
  const [collectionSaveSource, setCollectionSaveSource] = useState(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameTarget, setRenameTarget] = useState(null)
  const [inlineRenameFolder, setInlineRenameFolder] = useState({ id: '', draft: '' })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [collectionContextMenu, setCollectionContextMenu] = useState(null)
  const [tabContextMenu, setTabContextMenu] = useState(null)
  const [collectionDragState, setCollectionDragState] = useState({ draggedId: '', targetId: '', position: '' })
  const [httpEditorTab, setHttpEditorTab] = useState('params')
  const [mcpInspectorTab, setMcpInspectorTab] = useState('tool')
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false)
  const [cookieHostInput, setCookieHostInput] = useState('')
  const [cookieScopesDraft, setCookieScopesDraft] = useState([])
  const [activeCookieEditor, setActiveCookieEditor] = useState(null)
  const [serverDialogOpen, setServerDialogOpen] = useState(false)
  const [serverDraft, setServerDraft] = useState(createServerDraft())
  const [serverDeleteTarget, setServerDeleteTarget] = useState(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [discoveries, setDiscoveries] = useState({})
  const [promptViews, setPromptViews] = useState({})
  const [resourceReader, setResourceReader] = useState(null)
  const [serverStatuses, setServerStatuses] = useState({})
  const [serverRefreshError, setServerRefreshError] = useState(null)
  const [serverRefreshErrorOpen, setServerRefreshErrorOpen] = useState(false)
  const [historyContextMenu, setHistoryContextMenu] = useState(null)
  const [historyDeleteDialog, setHistoryDeleteDialog] = useState(null)
  const [toolFilterByTab, setToolFilterByTab] = useState({})
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState('general')
  const [workspaceEnabled, setWorkspaceEnabled] = useState(false)
  const [gitEnabled, setGitEnabled] = useState(false)
  const [workspaceTableSearch, setWorkspaceTableSearch] = useState('')
  const [workspaceTablePage, setWorkspaceTablePage] = useState(1)
  const [workspaceEditDialogOpen, setWorkspaceEditDialogOpen] = useState(false)
  const [workspaceEditErrors, setWorkspaceEditErrors] = useState({ path: '', gitUrl: '', gitBranch: '' })
  const [workspaceEditDraft, setWorkspaceEditDraft] = useState({
    id: '',
    name: '',
    description: '',
    creator: '',
    path: '',
    mode: 'create',
    importSource: 'local',
    gitUrl: '',
    gitBranch: '',
    includeHistoryInGit: false,
    isNew: false,
  })
  const [mockWorkspaces, setMockWorkspaces] = useState([])
  const [workspaceDeleteDialogOpen, setWorkspaceDeleteDialogOpen] = useState(false)
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState(null)
  const [deleteWorkspaceLocalFiles, setDeleteWorkspaceLocalFiles] = useState(false)
  const [workspaceLimitDialogOpen, setWorkspaceLimitDialogOpen] = useState(false)
  const [workspaceLimitMessage, setWorkspaceLimitMessage] = useState('您的工作空间使用量已满。')
  const [workspaceImporting, setWorkspaceImporting] = useState(false)
  const [workspaceImportResultDialog, setWorkspaceImportResultDialog] = useState({
    open: false,
    title: '',
    message: '',
  })
  const [gitCheck, setGitCheck] = useState({ available: false, version: '', error: '' })
  const [pushDialogOpen, setPushDialogOpen] = useState(false)
  const [pushPreview, setPushPreview] = useState({ workspaceId: '', branch: 'main', remote: '', changes: [] })
  const [pushNote, setPushNote] = useState('')
  const [pushPreviewLoadingWorkspaceId, setPushPreviewLoadingWorkspaceId] = useState('')
  const [pushingWorkspaceId, setPushingWorkspaceId] = useState('')
  const [lastPushedWorkspaceId, setLastPushedWorkspaceId] = useState('')
  const [closeConfirmDialog, setCloseConfirmDialog] = useState({ open: false, message: '', canSaveAndClose: false })
  const [themeColorContextMenu, setThemeColorContextMenu] = useState(null)
  const [themeColorDraft, setThemeColorDraft] = useState('#0f6cbd')
  const [editorSplitByMode, setEditorSplitByMode] = useState({
    [modes.http]: 0.56,
    [modes.mcp]: 0.56,
  })
  const [editorResizing, setEditorResizing] = useState(false)
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false)
  const [workspaceSearch, setWorkspaceSearch] = useState('')
  const [workspaceOperationState, setWorkspaceOperationState] = useState({
    updatingId: null,
    updatedId: null,
  })
  const [workspaceSwitchingId, setWorkspaceSwitchingId] = useState('')
  const requestEditorRef = useRef(null)
  const tabsContainerRef = useRef(null)
  const activeRequestRef = useRef(null)
  const closeConfirmActionRef = useRef(null)
  const closeConfirmSaveActionRef = useRef(null)
  const collectionSaveAfterActionRef = useRef(null)
  const splitDragRef = useRef(null)
  const sidebarResizeRef = useRef(null)
  const sidebarTransitionTimerRef = useRef(null)
  const statusMessageChangedAtRef = useRef(0)
  const modalActivatedAtRef = useRef(0)
  const dialogResetTimersRef = useRef({})
  const previousServerProbeSignaturesRef = useRef({})
  const [activeRequest, setActiveRequest] = useState(null)

  function useDialogReset(dialogName, isOpen) {
    useEffect(() => {
      if (isOpen) {
        if (dialogResetTimersRef.current[dialogName]) {
          clearTimeout(dialogResetTimersRef.current[dialogName])
          delete dialogResetTimersRef.current[dialogName]
        }
        return
      }

      if (!dialogResetTimersRef.current[dialogName]) {
        dialogResetTimersRef.current[dialogName] = setTimeout(() => {
          delete dialogResetTimersRef.current[dialogName]
        }, DIALOG_RESET_DELAY)
      }

      return () => {
        if (dialogResetTimersRef.current[dialogName]) {
          clearTimeout(dialogResetTimersRef.current[dialogName])
          delete dialogResetTimersRef.current[dialogName]
        }
      }
    }, [dialogName, isOpen])

    return Boolean(dialogResetTimersRef.current[dialogName])
  }

  function reportFatalError(error, title = '严重错误') {
    const message = String(error?.message || error)
    const text = `${title}: ${message}`
    setLoadError(text)
    setFatalErrorDialog(text)
  }

  function isWorkspaceUpdating(workspaceId) {
    return workspaceOperationState.updatingId === workspaceId
  }

  function isWorkspaceUpdated(workspaceId) {
    return workspaceOperationState.updatedId === workspaceId
  }

  function setWorkspaceUpdating(workspaceId) {
    setWorkspaceOperationState({ updatingId: workspaceId, updatedId: null })
  }

  function setWorkspaceUpdated(workspaceId) {
    setWorkspaceOperationState({ updatingId: null, updatedId: workspaceId })
    setTimeout(() => {
      setWorkspaceOperationState({ updatingId: null, updatedId: null })
    }, OPERATION_SUCCESS_DELAY)
  }

  function setWorkspaceOperationError() {
    setWorkspaceOperationState({ updatingId: null, updatedId: null })
  }

  function buildExpandedFoldersState(nextBootstrap, preferredWorkspaceId = '') {
    const workspaceId = preferredWorkspaceId
      || nextBootstrap.workspaceManager?.activeWorkspaceId
      || nextBootstrap.activeWorkspace?.id
      || activeWorkspaceId
      || 'default'
    const folderIds = collectFolderIds(nextBootstrap.collections.items)
    const persisted = nextBootstrap.settings?.collectionFolderExpanded?.[workspaceId] || {}
    const nextExpanded = {}
    folderIds.forEach((id) => {
      nextExpanded[id] = Boolean(persisted[id])
    })
    return nextExpanded
  }

  function syncWorkspaceManagerState(nextBootstrap, preferredWorkspaceId = '') {
    const manager = nextBootstrap.workspaceManager || {}
    const workspaces = manager.workspaces || []
    const nextActiveWorkspaceId = preferredWorkspaceId || manager.activeWorkspaceId || workspaces[0]?.id || ''
    setWorkspaceSlots(workspaces)
    setMockWorkspaces(workspaces)
    setActiveWorkspaceId(nextActiveWorkspaceId)
    setWorkspaceEnabled(Boolean(manager.multiWorkspaceEnabled))
    setGitEnabled(Boolean(manager.gitEnabled))
    return nextActiveWorkspaceId
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrapApp() {
      if (!hasBackend()) {
        setLoadError('Wails 后端在浏览器预览中不可用。UI 当前使用本地模拟状态运行。')
        setLoading(false)
        return
      }

      try {
        const data = await invokeBackend('LoadBootstrapData')
        if (!cancelled) {
          const normalizedData = normalizeBootstrap(data)
          const nextActiveWorkspaceId = syncWorkspaceManagerState(normalizedData)
          setLoadError('')
          setBootstrap(normalizedData)
          setExpandedFolders(buildExpandedFoldersState(normalizedData, nextActiveWorkspaceId))
          setBootstrapReady(true)
        }
      } catch (error) {
        if (!cancelled) {
          reportFatalError(error, '加载工作区失败')
          setBootstrapReady(false)
        }
      } finally {
        window.clearTimeout(watchdog)
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    const watchdog = window.setTimeout(() => {
      if (cancelled) {
        return
      }
      console.error('[bootstrap] timeout waiting LoadBootstrapData', {
        hasBackend: hasBackend(),
      })
      reportFatalError('LoadBootstrapData 超时，请检查后端是否卡住。', '加载工作区失败')
      setBootstrapReady(false)
      setLoading(false)
    }, BOOTSTRAP_TIMEOUT)

    bootstrapApp()
    return () => {
      cancelled = true
      window.clearTimeout(watchdog)
    }
  }, [])

  useEffect(() => {
    if (loading || !bootstrapReady || !!loadError || !hasBackend()) {
      return undefined
    }

    const timer = setTimeout(() => {
      Promise.all([
        invokeBackend('SaveWorkspace', bootstrap.workspace),
        invokeBackend('SaveCollections', bootstrap.collections),
        invokeBackend('SaveMCPServers', bootstrap.mcpServers),
        invokeBackend('SaveSettings', bootstrap.settings),
      ]).catch((error) => {
        reportFatalError(error, '自动保存失败')
      })
    }, AUTO_SAVE_DELAY)

    return () => clearTimeout(timer)
  }, [bootstrap, loading, bootstrapReady, loadError])

  useEffect(() => {
    const folderIds = collectFolderIds(bootstrap.collections.items)
    const workspaceId = activeWorkspaceId || bootstrap.activeWorkspace?.id || 'default'
    const persisted = bootstrap.settings?.collectionFolderExpanded?.[workspaceId] || {}
    setExpandedFolders(() => {
      const next = {}
      folderIds.forEach((id) => {
        next[id] = Boolean(persisted[id])
      })
      return next
    })
  }, [bootstrap.collections.items, bootstrap.settings?.collectionFolderExpanded, activeWorkspaceId, bootstrap.activeWorkspace?.id])

  useEffect(() => {
    syncWorkspaceManagerState(bootstrap)
  }, [bootstrap.workspaceManager])

  useEffect(() => {
    if (!hasBackend()) {
      return
    }
    invokeBackend('CheckGitAvailable')
      .then((result) => setGitCheck(result || { available: false, version: '', error: '' }))
      .catch((error) => setGitCheck({ available: false, version: '', error: String(error?.message || error) }))
  }, [])

  const activeTab = useMemo(
    () => bootstrap.workspace.tabs.find((tab) => tab.id === bootstrap.workspace.activeTabId) || bootstrap.workspace.tabs[0],
    [bootstrap.workspace],
  )
  const settingsForm = bootstrap.settings
  const resolvedTheme = useMemo(() => resolveThemeMode(settingsForm.themeMode), [settingsForm.themeMode])
  const fluentTheme = useMemo(() => buildFluentTheme(resolvedTheme, settingsForm.themeColor), [resolvedTheme, settingsForm.themeColor])
  const appThemeVars = useMemo(() => buildBrandCSSVars(settingsForm.themeColor), [settingsForm.themeColor])
  const activeSplitRatio = editorSplitByMode[activeTab?.mode || modes.http] ?? 0.56
  const normalizedThemeColorDraft = useMemo(() => normalizeHexColor(themeColorDraft), [themeColorDraft])
  const normalizedActiveThemeColor = useMemo(() => normalizeHexColor(settingsForm.themeColor), [settingsForm.themeColor])
  const themeDraftExists = useMemo(
    () => settingsForm.themeColors.map((color) => normalizeHexColor(color)).includes(normalizedThemeColorDraft),
    [settingsForm.themeColors, normalizedThemeColorDraft],
  )
  const themeDraftIsActive = normalizedActiveThemeColor === normalizedThemeColorDraft
  const editorBodyStyle = useMemo(
    () => ({ flexGrow: activeSplitRatio, flexBasis: 0, minHeight: 0 }),
    [activeSplitRatio],
  )
  const responseBodyStyle = useMemo(
    () => ({ flexGrow: 1 - activeSplitRatio, flexBasis: 0, minHeight: 0 }),
    [activeSplitRatio],
  )
  const isHttpRequestActive = activeRequest?.kind === 'http' && activeRequest?.tabID === activeTab?.id
  const isMcpRequestActive = activeRequest?.kind === 'mcp' && activeRequest?.tabID === activeTab?.id
  const autoHttpFields = buildHttpAutoFields(activeTab?.http)
  const workspaceMaxCount = Math.max(1, Number(bootstrap.workspaceManager?.maxWorkspaceCount) || 3)
  const workspaceUsagePercent = Math.min(100, (mockWorkspaces.length / workspaceMaxCount) * 100)
  const effectiveSidebarWidth = sidebarCollapsed ? sidebarCollapsedWidth : sidebarWidth
  const sidebarQuickTabs = useMemo(() => ([
    { value: 'collections', label: '收藏集', icon: <FolderRegular /> },
    { value: 'servers', label: 'MCP 服务器', icon: <PlugConnectedRegular /> },
    { value: 'history', label: '历史记录', icon: <StorageRegular /> },
  ]), [])

  useEffect(() => {
    if (!activeTab || activeTab.mode !== modes.http) {
      return
    }
    const syncedURL = syncURLWithQueryRows(activeTab.http.url, activeTab.http.query, activeTab.http)
    if (syncedURL === activeTab.http.url) {
      return
    }
    patchActiveTab((tab) => {
      tab.http.url = syncedURL
      return tab
    })
  }, [activeTab?.id, activeTab?.mode, activeTab?.lastUpdatedAt])

  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container || !bootstrap.workspace.activeTabId) {
      return
    }

    const activeTabElement = container.querySelector(`[data-tab-id="${bootstrap.workspace.activeTabId}"]`)
    if (!activeTabElement) {
      return
    }

    activeTabElement.scrollIntoView({ block: 'nearest', inline: 'end' })
  }, [bootstrap.workspace.activeTabId, bootstrap.workspace.tabs.length])

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        openSaveCurrentDialog()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab])

  useEffect(() => {
    const language = resolveLanguageDetection(settingsForm.languageDetection)
    document.documentElement.lang = language
  }, [settingsForm.languageDetection])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.style.setProperty('color-scheme', resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    const stripFindWidgetTooltips = () => {
      document.querySelectorAll('.monaco-editor .find-widget [title], .monaco-editor .find-widget [aria-label]').forEach((node) => {
        node.removeAttribute('title')
        node.removeAttribute('aria-label')
      })
    }

    stripFindWidgetTooltips()

    const observer = new MutationObserver(() => {
      stripFindWidgetTooltips()
    })

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'class'],
    })

    const timer = window.setInterval(stripFindWidgetTooltips, 250)

    return () => {
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [])

  useContextMenuDismiss(Boolean(tabContextMenu), '.tab-context-menu', () => setTabContextMenu(null))
  useContextMenuDismiss(Boolean(collectionContextMenu), '.collection-context-menu', () => setCollectionContextMenu(null))

  useEffect(() => {
    if (!editorResizing) {
      return undefined
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max)
    }

    function handlePointerMove(event) {
      const drag = splitDragRef.current
      if (!drag) {
        return
      }

      const topSpace = event.clientY - drag.containerTop - drag.tabHeight
      const minRatio = drag.minEditorBody / drag.availableHeight
      const maxRatio = 1 - drag.minResponseBody / drag.availableHeight
      const boundedMaxRatio = Math.max(minRatio, maxRatio)
      const nextRatio = clamp(topSpace / drag.availableHeight, minRatio, boundedMaxRatio)

      setEditorSplitByMode((previous) => ({
        ...previous,
        [drag.mode]: nextRatio,
      }))
    }

    function handlePointerUp() {
      splitDragRef.current = null
      setEditorResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [editorResizing])

  useEffect(() => {
    if (!sidebarResizing) {
      return undefined
    }

    function handlePointerMove(event) {
      const drag = sidebarResizeRef.current
      if (!drag) {
        return
      }
      const nextWidth = Math.min(Math.max(event.clientX - drag.left, sidebarMinWidth), sidebarMaxWidth)
      setSidebarWidth(nextWidth)
    }

    function handlePointerUp() {
      sidebarResizeRef.current = null
      setSidebarResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [sidebarResizing])

  useEffect(() => {
    if (!sidebarCollapsed) {
      setSidebarFloatingTab('')
    }
  }, [sidebarCollapsed])

  useEffect(() => () => {
    if (sidebarTransitionTimerRef.current) {
      clearTimeout(sidebarTransitionTimerRef.current)
    }
  }, [])

  useEffect(() => {
    setThemeColorDraft(normalizeHexColor(settingsForm.themeColor))
  }, [settingsDialogOpen, settingsForm.themeColor])

  useContextMenuDismiss(Boolean(historyContextMenu), '.history-context-menu', () => setHistoryContextMenu(null))

  const enabledMcpServers = useMemo(
    () => bootstrap.mcpServers.servers.filter((server) => !server.disabled),
    [bootstrap.mcpServers.servers],
  )

  const currentServer = useMemo(
    () => enabledMcpServers.find((server) => server.id === activeTab?.mcp?.serverId),
    [enabledMcpServers, activeTab],
  )

  const serverProbeSignatures = useMemo(() => {
    const signatures = {}
    bootstrap.mcpServers.servers.forEach((server) => {
      signatures[server.id] = [
        server.name,
        server.transport,
        server.command,
        (server.args || []).join('\n'),
        server.cwd,
        server.endpoint,
        JSON.stringify(server.headers || []),
        JSON.stringify(server.env || []),
        String(server.timeoutMs),
        server.disabled ? '1' : '0',
      ].join('|')
    })
    return signatures
  }, [bootstrap.mcpServers.servers])

  const currentDiscovery = discoveries[currentServer?.id] || {
    tools: currentServer?.toolCache || [],
    prompts: currentServer?.promptCache || [],
    resources: currentServer?.resourceCache || [],
  }
  const currentTools = currentDiscovery.tools || []
  const selectedTool = useMemo(
    () => currentTools.find((tool) => tool.name === activeTab?.mcp?.toolName),
    [currentTools, activeTab],
  )
  const activeToolFilter = toolFilterByTab[activeTab?.id] || ''
  const filteredTools = useMemo(() => {
    const rawKeyword = activeToolFilter.trim()
    const keyword = rawKeyword.toLowerCase()
    if (!keyword) {
      return currentTools
    }

    const hasExactToolName = currentTools.some((tool) => {
      const label = (tool.title || tool.name || '').trim().toLowerCase()
      const name = (tool.name || '').trim().toLowerCase()
      return rawKeyword.toLowerCase() === label || rawKeyword.toLowerCase() === name
    })
    if (hasExactToolName) {
      return currentTools
    }

    return currentTools.filter((tool) => {
      const label = (tool.title || tool.name || '').toLowerCase()
      const name = (tool.name || '').toLowerCase()
      return label.includes(keyword) || name.includes(keyword)
    })
  }, [currentTools, activeToolFilter])
  const toolComboboxValue = activeToolFilter || (selectedTool ? (selectedTool.title || selectedTool.name) : '')
  const collectionFolderOptions = useMemo(
    () => buildFolderOptions(bootstrap.collections.items),
    [bootstrap.collections.items],
  )
  const collectionFolderKeywordNormalized = collectionFolderKeyword.trim().toLowerCase()
  const filteredCollectionFolderOptions = useMemo(() => {
    if (!collectionFolderKeywordNormalized) {
      return collectionFolderOptions
    }
    return collectionFolderOptions.filter((folder) => folder.searchText.includes(collectionFolderKeywordNormalized))
  }, [collectionFolderOptions, collectionFolderKeywordNormalized])
  const rootFolderSearchText = '收藏集根目录 根目录 root'
  const showCollectionRootOption = !collectionFolderKeywordNormalized || rootFolderSearchText.includes(collectionFolderKeywordNormalized)

  const currentSnippet = useMemo(() => {
    if (!activeTab) {
      return ''
    }
    if (activeTab.mode === modes.http) {
      return generateHttpSnippet(activeTab.http, bootstrap.settings.httpCodeLanguage)
    }
    return generateMcpSnippet(activeTab.mcp, currentServer, bootstrap.settings.mcpCodeLanguage)
  }, [activeTab, bootstrap.settings, currentServer])

  const allHistory = useMemo(
    () => [...(bootstrap.history.http.items || []), ...(bootstrap.history.mcp.items || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [bootstrap.history],
  )

  const groupedHistory = useMemo(() => groupHistoryByDay(allHistory), [allHistory])

  useEffect(() => {
    setServerStatuses((previous) => {
      const next = {}
      bootstrap.mcpServers.servers.forEach((server) => {
        next[server.id] = previous[server.id] || createServerStatus('unknown')
      })
      return next
    })
  }, [bootstrap.mcpServers.servers])

  useEffect(() => {
    if (loading || !hasBackend()) {
      return
    }

    const currentSignatures = serverProbeSignatures
    const currentServerIds = Object.keys(currentSignatures)
    if (!currentServerIds.length) {
      previousServerProbeSignaturesRef.current = currentSignatures
      return
    }

    const previousSignatures = previousServerProbeSignaturesRef.current
    const changedServerIds = currentServerIds.filter((serverId) => previousSignatures[serverId] !== currentSignatures[serverId])
    previousServerProbeSignaturesRef.current = currentSignatures

    if (!changedServerIds.length) {
      return
    }

    void probeServersStatus(changedServerIds, { selectFirstTool: true })
  }, [loading, serverProbeSignatures])

  function setWorkspace(updater) {
    setBootstrap((previous) => ({
      ...previous,
      workspace: typeof updater === 'function' ? updater(previous.workspace) : updater,
    }))
  }

  function setCollections(updater) {
    setBootstrap((previous) => ({
      ...previous,
      collections: typeof updater === 'function' ? updater(previous.collections) : updater,
    }))
  }

  function setServers(updater) {
    setBootstrap((previous) => ({
      ...previous,
      mcpServers: typeof updater === 'function' ? updater(previous.mcpServers) : updater,
    }))
  }

  function setSettings(updater) {
    setBootstrap((previous) => ({
      ...previous,
      settings: typeof updater === 'function' ? updater(previous.settings) : updater,
    }))
  }

  async function handleWorkspaceUpdate(workspaceId) {
    if (!hasBackend()) {
      return
    }
    setWorkspaceUpdating(workspaceId)
    try {
      const result = await invokeBackend('PullWorkspace', workspaceId)
      if (workspaceId === activeWorkspaceId) {
        setWorkspaceSwitchingId(workspaceId)
        const next = await invokeBackend('SwitchWorkspace', workspaceId)
        const normalized = normalizeBootstrap(next)
        const nextActiveWorkspaceId = syncWorkspaceManagerState(normalized, workspaceId)
        setBootstrap(normalized)
        setExpandedFolders(buildExpandedFoldersState(normalized, nextActiveWorkspaceId))
      }
      setWorkspaceUpdated(workspaceId)
    } catch (error) {
      setWorkspaceOperationError()
      setStatusMessage(`更新失败：${String(error?.message || error)}`)
    } finally {
      setWorkspaceSwitchingId('')
    }
  }

  const modalActive = Boolean(
    settingsDialogOpen
    || workspaceEditDialogOpen
    || workspaceDeleteDialogOpen
    || workspaceLimitDialogOpen
    || workspaceImportResultDialog.open
    || pushDialogOpen
    || serverDialogOpen
    || closeConfirmDialog.open
    || collectionSaveDialogOpen
    || cookieDialogOpen
    || Boolean(serverDeleteTarget)
    || renameDialogOpen
    || deleteDialogOpen
    || serverRefreshErrorOpen
    || Boolean(fatalErrorDialog)
    || Boolean(historyDeleteDialog)
    || importDialogOpen
    || Boolean(resourceReader)
  )

  useEffect(() => {
    statusMessageChangedAtRef.current = Date.now()
  }, [statusMessage])

  useEffect(() => {
    if (!modalActive) {
      return
    }
    modalActivatedAtRef.current = Date.now()
  }, [modalActive])

  useEffect(() => {
    const message = String(statusMessage || '').trim()
    const isProgressOrInputHint = message.startsWith('正在') || message.startsWith('请先')
    const handledByOtherDialog = Boolean(
      (serverRefreshError?.message && message.includes(String(serverRefreshError.message)))
      || (fatalErrorDialog && (message.includes(fatalErrorDialog) || fatalErrorDialog.includes(message))),
    )
    const isStaleStatusFromBeforeModal = statusMessageChangedAtRef.current < modalActivatedAtRef.current

    if (!message || !modalActive || modalNoticeDialog.open || handledByOtherDialog || isProgressOrInputHint || isStaleStatusFromBeforeModal) {
      return
    }
    const title = message.includes('失败') || message.includes('错误') ? '操作失败' : '提示'
    setModalNoticeDialog({ open: true, title, message })
    setStatusMessage('')
  }, [statusMessage, modalActive, modalNoticeDialog.open, serverRefreshError, fatalErrorDialog])

  useDialogReset('workspaceDelete', workspaceDeleteDialogOpen)
  useDialogReset('delete', deleteDialogOpen)
  useDialogReset('workspaceEdit', workspaceEditDialogOpen)
  useDialogReset('closeConfirm', closeConfirmDialog.open)
  useDialogReset('workspaceImportResult', workspaceImportResultDialog.open)
  useDialogReset('modalNotice', modalNoticeDialog.open)
  useDialogReset('serverRefreshError', serverRefreshErrorOpen)

  function isWorkspacePushBusy(workspaceId) {
    return pushPreviewLoadingWorkspaceId === workspaceId || pushingWorkspaceId === workspaceId
  }

  const globalLoadingMessage = loading
    ? '正在加载 Post MCP 工作区...'
    : workspaceSwitchingId
      ? '正在切换工作空间...'
      : ''
  const globalLoadingActive = Boolean(globalLoadingMessage)

  async function handleWorkspaceSwitch(workspaceId) {
    if (workspaceId === activeWorkspaceId) {
      return
    }
    if (!hasBackend()) {
      setActiveWorkspaceId(workspaceId)
      return
    }
    try {
      setWorkspaceSwitchingId(workspaceId)
      setWorkspaceUpdating(workspaceId)
      setWorkspaceDropdownOpen(false)
      setWorkspaceSearch('')
      const next = await invokeBackend('SwitchWorkspace', workspaceId)
      const normalized = normalizeBootstrap(next)
      const nextActiveWorkspaceId = syncWorkspaceManagerState(normalized, workspaceId)
      setBootstrap(normalized)
      setExpandedFolders(buildExpandedFoldersState(normalized, nextActiveWorkspaceId))
      setStatusMessage('已切换工作空间。')
    } catch (error) {
      setStatusMessage(`切换工作空间失败：${String(error?.message || error)}`)
    } finally {
      setWorkspaceSwitchingId('')
      setWorkspaceOperationError()
    }
  }

  async function syncWorkspaceFeatureSettings(patch) {
    const next = {
      multiWorkspaceEnabled: patch.multiWorkspaceEnabled ?? workspaceEnabled,
      gitEnabled: patch.gitEnabled ?? gitEnabled,
    }
    setWorkspaceEnabled(next.multiWorkspaceEnabled)
    setGitEnabled(next.gitEnabled)
    if (!hasBackend()) {
      return
    }
    try {
      const manager = await invokeBackend('UpdateWorkspaceFeatureSettings', next)
      setBootstrap((previous) => ({ ...previous, workspaceManager: manager }))
    } catch (error) {
      setStatusMessage(`更新工作空间设置失败：${String(error?.message || error)}`)
    }
  }

  function openWorkspaceConfigDialog(workspace) {
    setWorkspaceDropdownOpen(false)
    setWorkspaceSearch('')
    setWorkspaceEditErrors({ path: '', gitUrl: '', gitBranch: '' })
    setWorkspaceEditDraft({ ...workspace, mode: 'create', isNew: false })
    setWorkspaceEditDialogOpen(true)
  }

  function openWorkspaceDeleteDialog(workspace) {
    setWorkspaceDropdownOpen(false)
    setWorkspaceSearch('')
    setWorkspaceDeleteTarget(workspace)
    setDeleteWorkspaceLocalFiles(false)
    setWorkspaceDeleteDialogOpen(true)
  }

  function openWorkspaceLimitDialog(message = `您的工作空间使用量已满（${mockWorkspaces.length}/${workspaceMaxCount}）。`) {
    setWorkspaceLimitMessage(message)
    setWorkspaceLimitDialogOpen(true)
  }

  function openCreateWorkspaceDialog(options = {}) {
    if (options.closeDropdown) {
      setWorkspaceDropdownOpen(false)
      setWorkspaceSearch('')
    }
    if (mockWorkspaces.length >= workspaceMaxCount) {
      openWorkspaceLimitDialog()
      return
    }
    setWorkspaceEditErrors({ path: '', gitUrl: '', gitBranch: '' })
    setWorkspaceEditDraft({
      id: '',
      name: '',
      description: '',
      creator: '',
      path: '',
      mode: 'create',
      importSource: 'local',
      gitUrl: '',
      gitBranch: '',
      includeHistoryInGit: false,
      isNew: true,
    })
    setWorkspaceEditDialogOpen(true)
  }

  function closeWorkspaceDeleteDialog() {
    setWorkspaceDeleteDialogOpen(false)
  }

  async function confirmDeleteWorkspace() {
    if (!workspaceDeleteTarget) {
      return
    }

    if (!hasBackend()) {
      setBootstrap((previous) => {
        const currentManager = previous.workspaceManager || {}
        const nextWorkspaces = (currentManager.workspaces || []).filter((item) => item.id !== workspaceDeleteTarget.id)
        const nextActiveWorkspaceId =
          currentManager.activeWorkspaceId === workspaceDeleteTarget.id
            ? (nextWorkspaces[0]?.id || '')
            : currentManager.activeWorkspaceId
        return {
          ...previous,
          workspaceManager: {
            ...currentManager,
            workspaces: nextWorkspaces,
            activeWorkspaceId: nextActiveWorkspaceId,
          },
        }
      })
      closeWorkspaceDeleteDialog()
      setStatusMessage('工作空间已删除。')
      return
    }

    try {
      const result = await invokeBackend('DeleteWorkspace', {
        id: workspaceDeleteTarget.id,
        deleteLocalFiles: Boolean(deleteWorkspaceLocalFiles),
      })
      if (result?.manager) {
        setBootstrap((previous) => ({ ...previous, workspaceManager: result.manager }))
      }
      closeWorkspaceDeleteDialog()
      if (result?.fileDeleteError) {
        setStatusMessage(`工作空间已从配置删除，${result.fileDeleteError}`)
      } else {
        setStatusMessage('工作空间已删除。')
      }
    } catch (error) {
      setStatusMessage(`删除工作空间失败：${String(error?.message || error)}`)
    }
  }

  async function openPushPreview(workspace) {
    if (!hasBackend()) {
      return
    }
    setPushPreviewLoadingWorkspaceId(workspace.id)
    try {
      const preview = await invokeBackend('PreviewWorkspacePush', workspace.id)
      setPushPreview(preview || { workspaceId: workspace.id, branch: 'main', remote: workspace.gitUrl || '', changes: [] })
      setPushNote('')
      setPushDialogOpen(true)
    } catch (error) {
      setStatusMessage(`读取推送预览失败：${String(error?.message || error)}`)
    } finally {
      setPushPreviewLoadingWorkspaceId('')
    }
  }

  async function submitPushWorkspace() {
    if (!hasBackend()) {
      return
    }
    const paths = (pushPreview.changes || []).filter((item) => item.selected).map((item) => item.path)
    const pushedWorkspaceId = pushPreview.workspaceId || '__pushing__'
    setPushingWorkspaceId(pushedWorkspaceId)
    try {
      const result = await invokeBackend('PushWorkspaceChanges', {
        workspaceId: pushPreview.workspaceId,
        branch: pushPreview.branch,
        message: pushNote,
        paths,
      })
      setStatusMessage(result?.summary || '推送完成。')
      setPushDialogOpen(false)
      setLastPushedWorkspaceId(pushPreview.workspaceId)
      setTimeout(() => setLastPushedWorkspaceId(''), OPERATION_SUCCESS_DELAY)
    } catch (error) {
      setStatusMessage(`推送失败：${String(error?.message || error)}`)
    } finally {
      setPushingWorkspaceId('')
    }
  }

  function updateSettings(patch) {
    setSettings((settings) => ({ ...settings, ...patch }))
  }

  function patchActiveTab(mutator) {
    if (!activeTab) {
      return
    }

    setWorkspace((workspace) => ({
      ...workspace,
      tabs: workspace.tabs.map((tab) => {
        if (tab.id !== activeTab.id) {
          return tab
        }

        const nextTab = mutator({ ...tab })
        return {
          ...nextTab,
          dirty: true,
          lastUpdatedAt: new Date().toISOString(),
          title: deriveTabTitle(nextTab, bootstrap.mcpServers.servers, bootstrap.collections.items),
        }
      }),
    }))
  }

  function patchTabByID(tabID, mutator) {
    if (!tabID) {
      return
    }

    setWorkspace((workspace) => ({
      ...workspace,
      tabs: workspace.tabs.map((tab) => {
        if (tab.id !== tabID) {
          return tab
        }

        const nextTab = mutator({ ...tab })
        return {
          ...nextTab,
          dirty: true,
          lastUpdatedAt: new Date().toISOString(),
          title: deriveTabTitle(nextTab, bootstrap.mcpServers.servers, bootstrap.collections.items),
        }
      }),
    }))
  }

  function beginCancelableRequest(kind, tabID) {
    const token = `${Date.now()}-${Math.random()}`
    const request = { token, kind, tabID, cancelled: false }
    activeRequestRef.current = request
    setActiveRequest(request)
    setBusy(true)
    return request
  }

  function isRequestCancelled(request) {
    const current = activeRequestRef.current
    if (!request) {
      return true
    }
    if (request.cancelled) {
      return true
    }
    if (!current) {
      return true
    }
    return current.token !== request.token || current.cancelled
  }

  function finishCancelableRequest(request) {
    if (activeRequestRef.current?.token !== request?.token) {
      return
    }
    activeRequestRef.current = null
    setActiveRequest(null)
    setBusy(false)
  }

  function cancelActiveRequest() {
    if (!activeRequestRef.current) {
      return
    }
    activeRequestRef.current = {
      ...activeRequestRef.current,
      cancelled: true,
    }
    setStatusMessage('已取消当前请求。')
    setActiveRequest(null)
    setBusy(false)
  }

  function addTab(mode = modes.http, seed) {
    const tab = seed ? normalizeTab(seed) : createWorkspaceTab(mode, bootstrap.mcpServers.servers)
    setWorkspace((workspace) => ({
      ...workspace,
      activeTabId: tab.id,
      tabs: [...workspace.tabs, tab],
    }))
  }

  function requestCloseConfirm(message, onConfirm, onSaveAndClose) {
    closeConfirmActionRef.current = onConfirm
    closeConfirmSaveActionRef.current = onSaveAndClose || null
    setCloseConfirmDialog({ open: true, message, canSaveAndClose: typeof onSaveAndClose === 'function' })
  }

  function dismissCloseConfirm() {
    closeConfirmActionRef.current = null
    closeConfirmSaveActionRef.current = null
    setCloseConfirmDialog((current) => ({ ...current, open: false, canSaveAndClose: false }))
  }

  function confirmClose() {
    const action = closeConfirmActionRef.current
    dismissCloseConfirm()
    if (typeof action === 'function') {
      action()
    }
  }

  function confirmSaveAndClose() {
    const action = closeConfirmSaveActionRef.current
    dismissCloseConfirm()
    if (typeof action === 'function') {
      action()
    }
  }

  function saveTabThenClose(tab, onDone) {
    if (!tab) {
      return
    }
    if (tab.linkedNodeId) {
      setCollections((store) => ({
        ...store,
        items: updateCollectionNode(store.items, tab.linkedNodeId, (node) => ({
          ...node,
          request: {
            mode: tab.mode,
            http: tab.http,
            mcp: tab.mcp,
          },
        })),
      }))
      onDone?.()
      return
    }

    collectionSaveAfterActionRef.current = onDone || null
    openCollectionSaveDialog({
      name: tab.title || (tab.mode === modes.http ? '新建 HTTP 请求' : '新建 MCP 调用'),
      mode: tab.mode,
      payload: tab,
      tabId: tab.id,
    })
  }

  function saveLinkedTabsThenClose(tabIDs, onDone) {
    const targets = bootstrap.workspace.tabs.filter((tab) => tabIDs.includes(tab.id) && shouldPromptSaveForTab(tab, bootstrap.collections.items))
    if (!targets.length) {
      onDone?.()
      return
    }
    setCollections((store) => {
      let items = store.items
      targets.forEach((tab) => {
        if (!tab.linkedNodeId) {
          return
        }
        items = updateCollectionNode(items, tab.linkedNodeId, (node) => ({
          ...node,
          request: {
            mode: tab.mode,
            http: tab.http,
            mcp: tab.mcp,
          },
        }))
      })
      return {
        ...store,
        items,
      }
    })
    onDone?.()
  }

  function closeTab(tabId, force = false) {
    const tab = bootstrap.workspace.tabs.find((item) => item.id === tabId)
    const pendingSave = shouldPromptSaveForTab(tab, bootstrap.collections.items)
    if (!force && settingsForm.askOnCloseUnsaved && pendingSave) {
      requestCloseConfirm(
        `Tab \"${tab?.title || '未命名请求'}\" 有未保存改动，是否继续关闭？`,
        () => closeTab(tabId, true),
        () => saveTabThenClose(tab, () => closeTab(tabId, true)),
      )
      return
    }

    setWorkspace((workspace) => {
      const tabs = workspace.tabs.filter((tab) => tab.id !== tabId)
      if (!tabs.length) {
        const fallback = createWorkspaceTab(modes.http, bootstrap.mcpServers.servers)
        return {
          ...workspace,
          activeTabId: fallback.id,
          tabs: [fallback],
        }
      }

      return {
        ...workspace,
        activeTabId: workspace.activeTabId === tabId ? tabs[Math.max(0, tabs.length - 1)].id : workspace.activeTabId,
        tabs,
      }
    })
  }

  function openTabContextMenu(event, tab) {
    event.preventDefault()
    event.stopPropagation()
    setWorkspace((workspace) => ({ ...workspace, activeTabId: tab.id }))
    setTabContextMenu({ x: event.clientX, y: event.clientY, tabId: tab.id })
  }

  function duplicateTab(tabId) {
    const source = bootstrap.workspace.tabs.find((tab) => tab.id === tabId)
    if (!source) {
      return
    }

    const nextTab = normalizeTab({
      ...source,
      linkedHistoryId: '',
      linkedNodeId: '',
      dirty: true,
      title: `${source.title || deriveTabTitle(source, bootstrap.mcpServers.servers, bootstrap.collections.items)} - 副本`,
    })
    nextTab.id = createWorkspaceTab(source.mode, bootstrap.mcpServers.servers).id
    nextTab.lastUpdatedAt = new Date().toISOString()
    addTab(source.mode, nextTab)
  }

  function closeOtherTabs(tabId, force = false) {
    const protectedTabs = bootstrap.workspace.tabs.filter((tab) => tab.id !== tabId)
    const unsavedTabs = protectedTabs.filter((tab) => shouldPromptSaveForTab(tab, bootstrap.collections.items))
    const unsavedCount = unsavedTabs.length
    if (!force && settingsForm.askOnCloseUnsaved && unsavedCount > 0) {
      const allLinked = unsavedTabs.every((tab) => Boolean(tab.linkedNodeId))
      requestCloseConfirm(
        `将关闭的标签页中有 ${unsavedCount} 个未保存改动，是否继续？`,
        () => closeOtherTabs(tabId, true),
        allLinked ? () => saveLinkedTabsThenClose(protectedTabs.map((tab) => tab.id), () => closeOtherTabs(tabId, true)) : null,
      )
      return
    }

    setWorkspace((workspace) => {
      const target = workspace.tabs.find((tab) => tab.id === tabId)
      if (!target) {
        return workspace
      }
      return {
        ...workspace,
        activeTabId: target.id,
        tabs: [target],
      }
    })
  }

  function closeAllTabs(force = false) {
    const unsavedTabs = bootstrap.workspace.tabs.filter((tab) => shouldPromptSaveForTab(tab, bootstrap.collections.items))
    const unsavedCount = unsavedTabs.length
    if (!force && settingsForm.askOnCloseUnsaved && unsavedCount > 0) {
      const allLinked = unsavedTabs.every((tab) => Boolean(tab.linkedNodeId))
      requestCloseConfirm(
        `当前有 ${unsavedCount} 个未保存改动的标签页，是否继续关闭全部？`,
        () => closeAllTabs(true),
        allLinked ? () => saveLinkedTabsThenClose(bootstrap.workspace.tabs.map((tab) => tab.id), () => closeAllTabs(true)) : null,
      )
      return
    }

    const fallback = createWorkspaceTab(modes.http, bootstrap.mcpServers.servers)
    setWorkspace((workspace) => ({
      ...workspace,
      activeTabId: fallback.id,
      tabs: [fallback],
    }))
  }

  function runTabMenuAction(action) {
    if (!tabContextMenu?.tabId) {
      return
    }

    const { tabId } = tabContextMenu
    setTabContextMenu(null)

    switch (action) {
      case 'new':
        addTab(modes.http)
        break
      case 'duplicate':
        duplicateTab(tabId)
        break
      case 'close':
        closeTab(tabId)
        break
      case 'force-close':
        closeTab(tabId, true)
        break
      case 'close-others':
        closeOtherTabs(tabId)
        break
      case 'close-all':
        closeAllTabs()
        break
      default:
        break
    }
  }

  function switchMode(nextMode) {
    patchActiveTab((tab) => {
      tab.mode = nextMode
      if (nextMode === modes.mcp && !tab.mcp.serverId) {
        tab.mcp.serverId = enabledMcpServers[0]?.id || ''
      }
      return tab
    })
  }

  function updateHttpRequest(path, value) {
    patchActiveTab((tab) => {
      tab.http = updateNested(tab.http, path, value)
      return tab
    })
  }

  function handleHttpURLChange(value) {
    patchActiveTab((tab) => {
      const nextURL = String(value || '')
      const parsedQueryRows = parseQueryRowsFromURL(nextURL)
      tab.http.url = nextURL
      if (parsedQueryRows) {
        tab.http.query = filterOutAutoQueryRows(parsedQueryRows, tab.http)
      }
      return tab
    })
  }

  function handleHttpQueryChange(rows) {
    patchActiveTab((tab) => {
      const nextRows = (rows || []).map((item) => ({ ...newPair(), ...item }))
      tab.http.query = nextRows
      tab.http.url = syncURLWithQueryRows(tab.http.url, nextRows, tab.http)
      return tab
    })
  }

  function handleHttpAuthChange(path, value) {
    patchActiveTab((tab) => {
      tab.http.auth = updateNested(tab.http.auth, path, value)
      tab.http.url = syncURLWithQueryRows(tab.http.url, tab.http.query, tab.http)
      return tab
    })
  }

  function toggleHttpAutoField(fieldID, enabled) {
    patchActiveTab((tab) => {
      const disabled = new Set(tab.http.disabledAutoFields || [])
      const normalizedFieldID = normalizeAutoFieldKey(fieldID)
      if (enabled) {
        disabled.delete(normalizedFieldID)
      } else {
        disabled.add(normalizedFieldID)
      }
      tab.http.disabledAutoFields = [...disabled]
      tab.http.url = syncURLWithQueryRows(tab.http.url, tab.http.query, tab.http)
      return tab
    })
  }

  function updateMcpRequest(path, value) {
    patchActiveTab((tab) => {
      tab.mcp = updateNested(tab.mcp, path, value)
      return tab
    })
  }

  function openCookieDialog() {
    if (!activeTab || activeTab.mode !== modes.http) {
      return
    }
    setCookieScopesDraft(normalizeCookieScopes(activeTab.http.cookieScopes))
    setCookieHostInput('')
    setActiveCookieEditor(null)
    setCookieDialogOpen(true)
  }

  function addCookieScopeCard() {
    const host = cookieHostInput.trim()
    if (!host) {
      setStatusMessage('请先输入 Host。')
      return
    }
    setCookieScopesDraft((previous) => {
      if (previous.some((scope) => String(scope.host || '').trim().toLowerCase() === host.toLowerCase())) {
        return previous
      }
      return [...previous, { ...newCookieScope(host), host }]
    })
    setCookieHostInput('')
  }

  function addCookieTag(scopeID) {
    setCookieScopesDraft((previous) => previous.map((scope) => (
      scope.id === scopeID
        ? { ...scope, cookies: [...(scope.cookies || []), newCookieItem('cookie_name', '')] }
        : scope
    )))
  }

  function removeCookieTag(scopeID, cookieID) {
    setCookieScopesDraft((previous) => previous.map((scope) => (
      scope.id === scopeID
        ? { ...scope, cookies: (scope.cookies || []).filter((cookie) => cookie.id !== cookieID) }
        : scope
    )))
    if (activeCookieEditor?.scopeID === scopeID && activeCookieEditor?.cookieID === cookieID) {
      setActiveCookieEditor(null)
    }
  }

  function activateCookieEditor(scopeID, cookieID) {
    const scope = cookieScopesDraft.find((item) => item.id === scopeID)
    const cookie = scope?.cookies?.find((item) => item.id === cookieID)
    if (!cookie) {
      return
    }
    setActiveCookieEditor({
      scopeID,
      cookieID,
      text: `${cookie.name || ''}=${cookie.value || ''}`,
    })
  }

  function saveActiveCookieEditor() {
    if (!activeCookieEditor) {
      return
    }
    const parsed = parseCookieDraftText(activeCookieEditor.text)
    if (!parsed) {
      setStatusMessage('Cookie 格式错误，请使用 name=value。')
      return
    }
    setCookieScopesDraft((previous) => previous.map((scope) => (
      scope.id !== activeCookieEditor.scopeID
        ? scope
        : {
            ...scope,
            cookies: (scope.cookies || []).map((cookie) => (
              cookie.id === activeCookieEditor.cookieID
                ? { ...cookie, name: parsed.name, value: parsed.value }
                : cookie
            )),
          }
    )))
    setActiveCookieEditor(null)
  }

  function saveCookieDialog() {
    patchActiveTab((tab) => {
      tab.http.cookieScopes = normalizeCookieScopes(cookieScopesDraft)
      return tab
    })
    setCookieDialogOpen(false)
    setActiveCookieEditor(null)
    setStatusMessage('Cookies 已更新。')
  }

  function patchServerStatus(serverId, patch) {
    setServerStatuses((previous) => ({
      ...previous,
      [serverId]: {
        ...(previous[serverId] || createServerStatus('unknown')),
        ...patch,
      },
    }))
  }

  function applyDiscovery(serverId, discovery, options = {}) {
    setDiscoveries((previous) => ({ ...previous, [serverId]: discovery }))
    setServers((store) => ({
      ...store,
      servers: store.servers.map((server) =>
        server.id === serverId
          ? {
              ...server,
              toolCache: discovery.tools || [],
              promptCache: discovery.prompts || [],
              resourceCache: discovery.resources || [],
            }
          : server,
      ),
    }))

    if (options.selectFirstTool && activeTab?.mcp?.serverId === serverId && !activeTab.mcp.toolName && discovery.tools?.length) {
      updateMcpRequest('toolName', discovery.tools[0].name)
    }
  }

  function openRefreshErrorDialog(serverName, message) {
    setServerRefreshError({
      title: `刷新 MCP 工具失败${serverName ? ` - ${serverName}` : ''}`,
      message,
    })
    setServerRefreshErrorOpen(true)
  }

  function showRefreshSuccessToast(serverName, toolCount) {
    dispatchToast(
      <Toast>
        <ToastTitle>刷新工具成功</ToastTitle>
        <ToastBody>{`服务器 ${serverName || '未命名服务器'} 共有 ${toolCount} 个工具`}</ToastBody>
      </Toast>,
      { intent: 'success', timeout: 3000 },
    )
  }

  async function probeServerStatus(serverId, options = {}) {
    if (!serverId || !hasBackend()) {
      return null
    }

    const { manualRefresh = false, showStatusMessage = false, selectFirstTool = false } = options
    const server = bootstrap.mcpServers.servers.find((item) => item.id === serverId)
    const serverName = server?.name || '未命名服务器'
    let phase = 'connect'

    if (server?.disabled) {
      patchServerStatus(serverId, createServerStatus('unknown', '服务器已禁用。'))
      return { ok: false, phase: 'disabled', error: '服务器已禁用。' }
    }

    patchServerStatus(serverId, createServerStatus('checking', '正在检测 MCP 状态...'))

    try {
      const testResult = await invokeBackend('TestMCPServer', serverId)
      if (!testResult?.success) {
        const message = testResult?.error || '连接失败'
        patchServerStatus(serverId, createServerStatus('error', message))
        if (showStatusMessage && !manualRefresh) {
          setStatusMessage(`${serverName} 连接失败：${message}`)
        }
        if (manualRefresh) {
          openRefreshErrorDialog(serverName, message)
        }
        return { ok: false, phase, error: message }
      }

      phase = 'discover'
      const discovery = await invokeBackend('DiscoverMCPServer', serverId)
      applyDiscovery(serverId, discovery, { selectFirstTool })

      if (discovery?.error) {
        patchServerStatus(serverId, createServerStatus('warning', discovery.error, discovery.tools?.length || 0))
        if (showStatusMessage && !manualRefresh) {
          setStatusMessage(`${serverName} 已连接，但 TOOL/LIST 失败：${discovery.error}`)
        }
        if (manualRefresh) {
          openRefreshErrorDialog(serverName, discovery.error)
        }
        return { ok: false, phase, error: discovery.error }
      }

      const toolCount = discovery?.tools?.length || 0
      patchServerStatus(serverId, createServerStatus('success', '', toolCount))
      if (showStatusMessage) {
        setStatusMessage(`${serverName} 已连接，共发现 ${toolCount} 个工具。`)
      }
      if (manualRefresh) {
        showRefreshSuccessToast(serverName, toolCount)
      }
      return { ok: true, discovery }
    } catch (error) {
      const message = String(error?.message || error)
      const status = phase === 'discover' ? 'warning' : 'error'
      patchServerStatus(serverId, createServerStatus(status, message))
      if (showStatusMessage && !manualRefresh) {
        setStatusMessage(message)
      }
      if (manualRefresh) {
        openRefreshErrorDialog(serverName, message)
      }
      return { ok: false, phase, error: message }
    }
  }

  async function probeServersStatus(serverIds, options = {}) {
    const uniqueServerIds = [...new Set(serverIds.filter(Boolean))]
    if (!uniqueServerIds.length) {
      return
    }

    await Promise.allSettled(uniqueServerIds.map((serverId) => probeServerStatus(serverId, options)))
  }

  async function probeAllServersStatus() {
    const serverIds = bootstrap.mcpServers.servers.map((server) => server.id)
    await probeServersStatus(serverIds, { selectFirstTool: true })
  }

  async function sendHttpRequest() {
    if (!activeTab?.http?.url) {
      setStatusMessage('请先输入请求 URL 再发送。')
      return
    }

    const request = beginCancelableRequest('http', activeTab.id)
    const requestPayload = buildEffectiveHttpRequest(activeTab.http)
    setStatusMessage('正在发送 HTTP 请求...')
    try {
      const response = await invokeBackend('ExecuteHTTP', requestPayload)
      if (isRequestCancelled(request)) {
        return
      }
      patchTabByID(request.tabID, (tab) => {
        tab.lastHttp = response
        return tab
      })
      await refreshBootstrap()
      if (isRequestCancelled(request)) {
        return
      }
      setStatusMessage(`HTTP ${response.statusCode || '请求完成'} 耗时 ${response.durationMs} ms`)
    } catch (error) {
      if (isRequestCancelled(request)) {
        return
      }
      setStatusMessage(String(error?.message || error))
    } finally {
      finishCancelableRequest(request)
    }
  }

  async function discoverServer(serverId = activeTab?.mcp?.serverId) {
    const targetServer = bootstrap.mcpServers.servers.find((server) => server.id === serverId)
    if (!serverId || !targetServer) {
      setStatusMessage('请先选择 MCP 服务器再刷新工具。')
      return
    }

    setBusy(true)
    setStatusMessage('正在刷新 MCP 工具...')
    try {
      await probeServerStatus(serverId, {
        manualRefresh: true,
        showStatusMessage: true,
        selectFirstTool: true,
      })
    } finally {
      setBusy(false)
    }
  }

  async function runMcpTool() {
    if (!currentServer || !activeTab?.mcp?.toolName) {
      setStatusMessage('请先选择 MCP 服务器和工具再运行。')
      return
    }

    const request = beginCancelableRequest('mcp', activeTab.id)
    const payload = {
      serverId: activeTab.mcp.serverId,
      toolName: activeTab.mcp.toolName,
      argumentsJson: activeTab.mcp.argumentsJson || '{}',
    }
    setStatusMessage('正在运行 MCP 工具...')
    try {
      const response = await invokeBackend('ExecuteMCPTool', payload)
      if (isRequestCancelled(request)) {
        return
      }
      patchTabByID(request.tabID, (tab) => {
        tab.lastMcp = response
        return tab
      })
      await refreshBootstrap()
      if (isRequestCancelled(request)) {
        return
      }
      setStatusMessage(`${response.isError ? '工具执行失败' : '工具执行完成'} 耗时 ${response.durationMs} ms`)
    } catch (error) {
      if (isRequestCancelled(request)) {
        return
      }
      setStatusMessage(String(error?.message || error))
    } finally {
      finishCancelableRequest(request)
    }
  }

  async function inspectPrompt() {
    if (!activeTab?.mcp?.serverId || !activeTab?.mcp?.promptName) {
      setStatusMessage('请先选择提示词后再检查。')
      return
    }

    setBusy(true)
    try {
      const response = await invokeBackend('GetMCPPrompt', {
        serverId: activeTab.mcp.serverId,
        promptName: activeTab.mcp.promptName,
        arguments: {},
        argumentsJson: activeTab.mcp.promptArgs || '{}',
      })
      setPromptViews((previous) => ({ ...previous, [activeTab.id]: response }))
      setStatusMessage(`提示词 ${activeTab.mcp.promptName} 已渲染。`)
    } catch (error) {
      setStatusMessage(String(error?.message || error))
    } finally {
      setBusy(false)
    }
  }

  async function inspectResource(uri) {
    if (!activeTab?.mcp?.serverId || !uri) {
      return
    }

    setBusy(true)
    try {
      const response = await invokeBackend('ReadMCPResource', activeTab.mcp.serverId, uri)
      setResourceReader(response)
      setStatusMessage(`资源 ${uri} 已加载。`)
    } catch (error) {
      setStatusMessage(String(error?.message || error))
    } finally {
      setBusy(false)
    }
  }

  async function saveServerDraft() {
    const nextServer = {
      ...serverDraft,
      args: typeof serverDraft.args === 'string' ? splitLines(serverDraft.args) : serverDraft.args,
      headers: normalizePairs(serverDraft.headers),
      env: normalizePairs(serverDraft.env),
    }

    const nextStore = (() => {
      const exists = bootstrap.mcpServers.servers.some((server) => server.id === nextServer.id)
      return {
        ...bootstrap.mcpServers,
        servers: exists
          ? bootstrap.mcpServers.servers.map((server) => (server.id === nextServer.id ? nextServer : server))
          : [...bootstrap.mcpServers.servers, nextServer],
      }
    })()

    if (!hasBackend()) {
      setServers(nextStore)
      setServerDialogOpen(false)
      setStatusMessage(`已保存 MCP 服务器 ${nextServer.name || '草稿'}。`)
      return
    }

    if (nextServer.disabled) {
      setServers(nextStore)
      setServerDialogOpen(false)
      setStatusMessage(`已保存 MCP 服务器 ${nextServer.name || '草稿'}。`)
      patchServerStatus(nextServer.id, createServerStatus('unknown', nextServer.disabled ? '服务器已禁用。' : '等待检测...'))
      return
    }

    try {
      await invokeBackend('SaveMCPServers', nextStore)
      setServers(nextStore)
      setServerDialogOpen(false)
      setStatusMessage(`已保存 MCP 服务器 ${nextServer.name || '草稿'}。`)
      await probeServerStatus(nextServer.id, { selectFirstTool: true, showStatusMessage: true })
    } catch (error) {
      const message = String(error?.message || error)
      patchServerStatus(nextServer.id, createServerStatus('error', message))
      reportFatalError(error, '保存 MCP 服务器失败')
    }
  }

  function confirmDeleteServer() {
    if (!serverDeleteTarget) {
      return
    }

    setServers((store) => ({
      ...store,
      servers: store.servers.filter((item) => item.id !== serverDeleteTarget.id),
    }))
    setStatusMessage(`已删除 MCP 服务器 ${serverDeleteTarget.name || '未命名服务器'}。`)
    setServerDeleteTarget(null)
  }

  async function importServers() {
    if (!importText.trim()) {
      setImportError('请先粘贴 MCP JSON。')
      return
    }

    setBusy(true)
    setImportError('')
    try {
      const result = await invokeBackend('ImportMCPServers', importText)
      setBootstrap((previous) => ({ ...previous, mcpServers: normalizeServerStore(result.servers) }))
      setImportDialogOpen(false)
      setImportText('')
      setImportError('')
      setStatusMessage(result.warnings?.length ? result.warnings.join(' | ') : `已导入 ${result.added?.length || 0} 个 MCP 服务器。`)
    } catch (error) {
      const message = String(error?.message || error)
      setImportError(message)
      setStatusMessage(message)
    } finally {
      setBusy(false)
    }
  }

  async function testServer(serverId) {
    setBusy(true)
    try {
      await probeServerStatus(serverId, { showStatusMessage: true, selectFirstTool: true })
    } finally {
      setBusy(false)
    }
  }

  async function refreshBootstrap() {
    if (!hasBackend()) {
      return
    }
    try {
      const data = await invokeBackend('LoadBootstrapData')
      setLoadError('')
      setBootstrapReady(true)
      setBootstrap((previous) => ({
        ...normalizeBootstrap(data),
        workspace: previous.workspace,
      }))
    } catch (error) {
      reportFatalError(error, '刷新数据失败')
      throw error
    }
  }

  function openCollectionSaveDialog(source) {
    if (!source) {
      return
    }

    setCollectionSaveSource(source)
    setCollectionSaveDraft({
      name: source.name,
      folderId: collectionRootValue,
    })
    setCollectionFolderKeyword('')
    setCollectionSaveDialogOpen(true)
  }

  function openSaveCurrentDialog() {
    if (!activeTab) {
      return
    }

    if (activeTab.linkedNodeId) {
      const linkedNode = findCollectionNode(bootstrap.collections.items, activeTab.linkedNodeId)
      if (linkedNode?.type === 'request') {
        setCollections((store) => ({
          ...store,
          items: updateCollectionNode(store.items, activeTab.linkedNodeId, (node) => ({
            ...node,
            request: {
              mode: activeTab.mode,
              http: activeTab.http,
              mcp: activeTab.mcp,
            },
          })),
        }))
        setStatusMessage(`已保存到收藏：${linkedNode.name}。`)
        return
      }
    }

    openCollectionSaveDialog({
      name: activeTab.title || (activeTab.mode === modes.http ? '新建 HTTP 请求' : '新建 MCP 调用'),
      mode: activeTab.mode,
      payload: activeTab,
      tabId: activeTab.id,
    })
  }

  function saveCurrentToCollection() {
    if (!collectionSaveSource) {
      return
    }

    const sourceTabId = String(collectionSaveSource.tabId || '')
    const node = createCollectionRequest(
      collectionSaveDraft.name.trim() || collectionSaveSource.name,
      collectionSaveSource.mode,
      collectionSaveSource.payload,
    )
    setCollections((store) => ({
      ...store,
      items: insertNodeIntoFolder(store.items, collectionSaveDraft.folderId, node),
    }))
    if (collectionSaveDraft.folderId && collectionSaveDraft.folderId !== collectionRootValue) {
      setExpandedFolders((previous) => ({ ...previous, [collectionSaveDraft.folderId]: true }))
      persistFolderExpandedState(collectionSaveDraft.folderId, true)
    }
    if (sourceTabId) {
      setWorkspace((workspace) => ({
        ...workspace,
        tabs: workspace.tabs.map((tab) => (tab.id === sourceTabId
          ? {
            ...tab,
            linkedNodeId: node.id,
            title: node.name,
            lastUpdatedAt: new Date().toISOString(),
          }
          : tab)),
      }))
    }
    setCollectionSaveDialogOpen(false)
    setCollectionFolderKeyword('')
    setCollectionSaveSource(null)
    setStatusMessage(`已将 ${node.name} 保存到收藏集。`)

    const afterAction = collectionSaveAfterActionRef.current
    collectionSaveAfterActionRef.current = null
    if (typeof afterAction === 'function') {
      afterAction()
    }
  }

  function addCollectionFolder(parentId = collectionRootValue) {
    setCollectionContextMenu(null)
    const folder = createCollectionFolder()
    setCollections((store) => ({
      ...store,
      items: insertNodeIntoFolder(store.items, parentId, folder),
    }))
    setExpandedFolders((previous) => ({ ...previous, [folder.id]: false, ...(parentId !== collectionRootValue ? { [parentId]: true } : {}) }))
    persistFolderExpandedState(folder.id, false)
    if (parentId !== collectionRootValue) {
      persistFolderExpandedState(parentId, true)
    }
    setInlineRenameFolder({ id: folder.id, draft: folder.name || '新建文件夹' })
  }

  function startInlineRenameFolder(node) {
    if (!node || node.type !== 'folder') {
      return
    }
    setCollectionContextMenu(null)
    setInlineRenameFolder({ id: node.id, draft: node.name || '' })
  }

  function cancelInlineRenameFolder() {
    setInlineRenameFolder({ id: '', draft: '' })
  }

  function confirmInlineRenameFolder() {
    if (!inlineRenameFolder.id) {
      return
    }
    const nextName = String(inlineRenameFolder.draft || '').trim()
    if (!nextName) {
      setStatusMessage('名称不能为空。')
      return
    }
    setCollections((store) => ({
      ...store,
      items: renameCollectionNode(store.items, inlineRenameFolder.id, nextName),
    }))
    setInlineRenameFolder({ id: '', draft: '' })
    setStatusMessage(`已重命名为 ${nextName}。`)
  }

  function openRenameDialog(node) {
    if (node?.type === 'folder') {
      startInlineRenameFolder(node)
      return
    }
    setCollectionContextMenu(null)
    setRenameTarget(node)
    setRenameDraft(node.name || '')
    setRenameDialogOpen(true)
  }

  function confirmRenameCollectionNode() {
    if (!renameTarget) {
      return
    }

    const nextName = renameDraft.trim()
    if (!nextName) {
      setStatusMessage('名称不能为空。')
      return
    }

    setCollections((store) => ({
      ...store,
      items: renameCollectionNode(store.items, renameTarget.id, nextName),
    }))
    setRenameDialogOpen(false)
    setRenameTarget(null)
    setRenameDraft('')
    setStatusMessage(`已重命名为 ${nextName}。`)
  }

  function handleCollectionContextMenu(event, node) {
    event.preventDefault()
    event.stopPropagation()
    setCollectionContextMenu({ x: event.clientX, y: event.clientY, node })
  }

  function deleteCollectionEntry(node) {
    setCollectionContextMenu(null)
    setDeleteTarget(node)
    setDeleteDialogOpen(true)
  }

  function confirmDeleteCollectionEntry() {
    if (!deleteTarget) {
      return
    }

    setCollections((store) => ({
      ...store,
      items: deleteCollectionNode(store.items, deleteTarget.id),
    }))
    if (deleteTarget.type === 'folder' && deleteTarget.id === inlineRenameFolder.id) {
      setInlineRenameFolder({ id: '', draft: '' })
    }
    setDeleteDialogOpen(false)
    setStatusMessage(deleteTarget.type === 'folder' ? `已删除文件夹 ${deleteTarget.name}。` : `已删除收藏 ${deleteTarget.name}。`)
    setDeleteTarget(null)
  }

  function persistFolderExpandedState(folderId, expanded) {
    const workspaceID = activeWorkspaceId || bootstrap.activeWorkspace?.id || 'default'
    setSettings((settings) => {
      const byWorkspace = { ...(settings.collectionFolderExpanded || {}) }
      const workspaceMap = { ...(byWorkspace[workspaceID] || {}) }
      workspaceMap[folderId] = Boolean(expanded)
      byWorkspace[workspaceID] = workspaceMap
      return {
        ...settings,
        collectionFolderExpanded: byWorkspace,
      }
    })
  }

  function toggleCollectionFolder(folderId) {
    const nextExpanded = !Boolean(expandedFolders[folderId])
    setExpandedFolders((previous) => ({ ...previous, [folderId]: nextExpanded }))
    persistFolderExpandedState(folderId, nextExpanded)
  }

  function handleCollectionDragStart(nodeId) {
    setCollectionDragState({ draggedId: nodeId, targetId: '', position: '' })
  }

  function handleCollectionDragOver(event, node) {
    if (!collectionDragState.draggedId || collectionDragState.draggedId === node.id) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const offsetY = event.clientY - rect.top
    let position = 'after'

    if (node.type === 'folder' && offsetY > rect.height * 0.28 && offsetY < rect.height * 0.72) {
      position = 'inside'
    } else if (offsetY < rect.height / 2) {
      position = 'before'
    }

    setCollectionDragState((previous) =>
      previous.targetId === node.id && previous.position === position
        ? previous
        : { ...previous, targetId: node.id, position },
    )
  }

  function handleCollectionRootDragOver(event) {
    if (!collectionDragState.draggedId || event.target !== event.currentTarget) {
      return
    }

    event.preventDefault()
    setCollectionDragState((previous) => ({ ...previous, targetId: collectionRootValue, position: 'root' }))
  }

  function handleCollectionDrop(event, targetId, position) {
    event.preventDefault()
    event.stopPropagation()
    if (!collectionDragState.draggedId) {
      return
    }

    setCollections((store) => ({
      ...store,
      items: moveCollectionNode(store.items, collectionDragState.draggedId, targetId, position),
    }))
    if (position === 'inside' && targetId !== collectionRootValue) {
      setExpandedFolders((previous) => ({ ...previous, [targetId]: true }))
      persistFolderExpandedState(targetId, true)
    }
    setCollectionDragState({ draggedId: '', targetId: '', position: '' })
  }

  function clearCollectionDragState() {
    setCollectionDragState({ draggedId: '', targetId: '', position: '' })
  }

  function openCollectionRequest(node) {
    if (!node || node.type === 'folder') {
      return
    }

    const existingTab = bootstrap.workspace.tabs.find((tab) => tab.linkedNodeId === node.id)
    if (existingTab && !settingsForm.alwaysOpenInNewTab) {
      setWorkspace((workspace) => ({
        ...workspace,
        activeTabId: existingTab.id,
      }))
      return
    }

    addTab(node.request?.mode || modes.http, {
      ...createWorkspaceTab(node.request?.mode || modes.http),
      linkedNodeId: node.id,
      title: node.name,
      mode: node.request?.mode || modes.http,
      http: node.request?.http,
      mcp: node.request?.mcp,
    })
  }

  async function resolveHistoryItem(item) {
    if (!item) {
      return null
    }
    if (!hasBackend()) {
      return item
    }
    const detail = await invokeBackend('LoadHistoryItem', item.mode || modes.http, item.id)
    return detail || item
  }

  function handleHistoryContextMenu(event, target) {
    event.preventDefault()
    event.stopPropagation()
    setHistoryContextMenu({ x: event.clientX, y: event.clientY, target })
  }

  function openHistoryDeleteDialog(target) {
    setHistoryContextMenu(null)
    setHistoryDeleteDialog(target)
  }

  async function addHistoryItemToCollection(item) {
    setHistoryContextMenu(null)
    try {
      const detailedItem = await resolveHistoryItem(item)
      const request = buildCollectionRequestFromHistory(detailedItem, bootstrap.mcpServers.servers)
      if (!request) {
        setStatusMessage('该历史记录无法添加到收藏。')
        return
      }

      openCollectionSaveDialog(request)
    } catch (error) {
      setStatusMessage(String(error?.message || error))
    }
  }

  async function confirmDeleteHistory() {
    if (!historyDeleteDialog) {
      return
    }
    const target = historyDeleteDialog

    try {
      if (hasBackend()) {
        if (target.type === 'item') {
          await invokeBackend('DeleteHistoryItem', target.item.id)
        } else if (target.type === 'day') {
          await invokeBackend('DeleteHistoryDay', target.dayKey)
        } else if (target.type === 'all') {
          await invokeBackend('ClearHistory')
        }
        await refreshBootstrap()
      } else {
        setBootstrap((previous) => {
          const nextHistory = { ...previous.history }
          if (target.type === 'item') {
            nextHistory.http = {
              ...nextHistory.http,
              items: nextHistory.http.items.filter((item) => item.id !== target.item.id),
            }
            nextHistory.mcp = {
              ...nextHistory.mcp,
              items: nextHistory.mcp.items.filter((item) => item.id !== target.item.id),
            }
          } else if (target.type === 'day') {
            nextHistory.http = {
              ...nextHistory.http,
              items: nextHistory.http.items.filter((item) => historyDayKey(item.timestamp) !== target.dayKey),
            }
            nextHistory.mcp = {
              ...nextHistory.mcp,
              items: nextHistory.mcp.items.filter((item) => historyDayKey(item.timestamp) !== target.dayKey),
            }
          } else if (target.type === 'all') {
            nextHistory.http = {
              ...nextHistory.http,
              items: [],
            }
            nextHistory.mcp = {
              ...nextHistory.mcp,
              items: [],
            }
          }
          return {
            ...previous,
            history: nextHistory,
          }
        })
      }
      setStatusMessage(describeHistoryDeleteSuccess(target))
      setHistoryDeleteDialog(null)
    } catch (error) {
      setStatusMessage(String(error?.message || error))
    }
  }

  async function replayHistory(item) {
    let detailedItem = item
    try {
      detailedItem = await resolveHistoryItem(item)
    } catch (error) {
      setStatusMessage(String(error?.message || error))
      return
    }
    const summary = parseJson(detailedItem?.summaryJson || '{}', {})
    const existingTab = bootstrap.workspace.tabs.find((tab) => tab.linkedHistoryId === item.id)

    if (existingTab && !settingsForm.alwaysOpenInNewTab) {
      setWorkspace((workspace) => ({
        ...workspace,
        activeTabId: existingTab.id,
      }))
      return
    }

    if (detailedItem.mode === modes.http && summary.request) {
      addTab(modes.http, {
        ...createWorkspaceTab(modes.http, bootstrap.mcpServers.servers),
        title: detailedItem.title,
        mode: modes.http,
        linkedHistoryId: item.id,
        http: summary.request,
        lastHttp: summary.response,
      })
      return
    }

    if (detailedItem.mode === modes.mcp && summary.request) {
      addTab(modes.mcp, {
        ...createWorkspaceTab(modes.mcp, bootstrap.mcpServers.servers),
        title: detailedItem.title,
        mode: modes.mcp,
        linkedHistoryId: item.id,
        mcp: {
          serverId: summary.request.serverId,
          toolName: summary.request.toolName,
          argumentsJson: summary.request.argumentsJson,
          promptArgs: '{}',
          promptName: '',
          resourceUri: '',
        },
        lastMcp: summary.response,
      })
    }
  }

  useEffect(() => {
    setWorkspace((workspace) => ({
      ...workspace,
      tabs: workspace.tabs.map((tab) => {
        if (!tab.linkedNodeId) {
          return tab
        }
        const linkedNode = findCollectionNode(bootstrap.collections.items, tab.linkedNodeId)
        if (!linkedNode || linkedNode.type !== 'request') {
          return tab
        }
        return {
          ...tab,
          title: deriveTabTitle(tab, bootstrap.mcpServers.servers, bootstrap.collections.items),
        }
      }),
    }))
  }, [bootstrap.collections.items, bootstrap.mcpServers.servers])

  function handleUrlPaste(event) {
    const pastedText = event.clipboardData?.getData('text')
    if (!pastedText || !pastedText.trim().startsWith('curl ')) {
      return
    }

    event.preventDefault()
    try {
      const importedRequest = tryImportCurl(pastedText)
      if (!importedRequest) {
        return
      }
      patchActiveTab((tab) => {
        tab.http = importedRequest
        tab.title = importedRequest.url || 'Imported cURL'
        return tab
      })
      setStatusMessage('已检测到 cURL 命令并导入到 HTTP 请求编辑器。')
    } catch (error) {
      setStatusMessage(`cURL 解析失败：${String(error?.message || error)}`)
    }
  }

  function startEditorSplitDrag(event) {
    const container = requestEditorRef.current
    if (!container || !activeTab) {
      return
    }

    const tabList = container.querySelector('.fui-TabList')
    const responseShell = container.querySelector('.response-shell')
    const responseHead = responseShell?.querySelector('.response-head')
    const tabHeight = tabList?.offsetHeight || 44
    const dividerHeight = 8
    const availableHeight = container.clientHeight - tabHeight - dividerHeight

    if (availableHeight <= 80) {
      return
    }

    let minResponseBody = 52
    if (responseShell && responseHead) {
      const style = window.getComputedStyle(responseShell)
      const shellGap = parseFloat(style.gap || '0') || 0
      const paddingTop = parseFloat(style.paddingTop || '0') || 0
      const paddingBottom = parseFloat(style.paddingBottom || '0') || 0
      minResponseBody = Math.ceil(responseHead.offsetHeight + shellGap + paddingTop + paddingBottom)
    }

    splitDragRef.current = {
      mode: activeTab.mode,
      containerTop: container.getBoundingClientRect().top,
      tabHeight,
      availableHeight,
      minEditorBody: 0,
      minResponseBody: Math.min(minResponseBody, Math.max(40, availableHeight - 20)),
    }

    setEditorResizing(true)
    event.preventDefault()
  }

  function beginSidebarResize(event) {
    if (sidebarCollapsed) {
      return
    }

    sidebarResizeRef.current = {
      left: event.currentTarget.parentElement.getBoundingClientRect().left,
    }
    setSidebarResizing(true)
    event.preventDefault()
  }

  function toggleSidebarCollapsed(nextCollapsed) {
    if (nextCollapsed === sidebarCollapsed) {
      return
    }

    if (sidebarTransitionTimerRef.current) {
      clearTimeout(sidebarTransitionTimerRef.current)
    }

    if (!nextCollapsed) {
      setSidebarFloatingTab('')
    }

    setSidebarTransitioning(true)
    setSidebarCollapsed(nextCollapsed)
    sidebarTransitionTimerRef.current = setTimeout(() => {
      setSidebarTransitioning(false)
      sidebarTransitionTimerRef.current = null
    }, 240)
  }

  function renderSidebarPanelContent(targetTab, options = {}) {
    const panelClassName = options.floating ? 'sidebar-tab-panel sidebar-tab-panel-floating' : 'sidebar-tab-panel'

    return (
      <div className={panelClassName}>
        {targetTab === 'collections' && (
          <>
            <div className="section-toolbar">
              <Button size="small" icon={<SaveRegular />} onClick={openSaveCurrentDialog}>
                保存当前
              </Button>
              <Button size="small" onClick={() => addCollectionFolder()}>
                新建文件夹
              </Button>
            </div>
            <div className={`stack-list collection-tree-root ${collectionDragState.targetId === collectionRootValue ? 'root-drop-active' : ''}`} onDragOver={handleCollectionRootDragOver} onDrop={(event) => handleCollectionDrop(event, collectionRootValue, 'root')}>
              <CollectionTree
                nodes={bootstrap.collections.items}
                expandedFolders={expandedFolders}
                dragState={collectionDragState}
                renamingFolderId={inlineRenameFolder.id}
                renamingFolderDraft={inlineRenameFolder.draft}
                onContextMenu={handleCollectionContextMenu}
                onDragEnd={clearCollectionDragState}
                onDragOver={handleCollectionDragOver}
                onDragStart={handleCollectionDragStart}
                onDrop={handleCollectionDrop}
                onOpenRequest={openCollectionRequest}
                onRenameFolderCancel={cancelInlineRenameFolder}
                onRenameFolderChange={(value) => setInlineRenameFolder((current) => ({ ...current, draft: value }))}
                onRenameFolderConfirm={confirmInlineRenameFolder}
                onToggleFolder={toggleCollectionFolder}
              />
            </div>
          </>
        )}

        {targetTab === 'servers' && (
          <>
            <div className="section-toolbar">
              <Button size="small" icon={<AddRegular />} onClick={() => { setServerDraft(createServerDraft()); setServerDialogOpen(true) }}>
                添加
              </Button>
              <Button size="small" icon={<ArrowDownloadRegular />} onClick={() => { setImportError(''); setImportDialogOpen(true) }}>
                导入 JSON
              </Button>
            </div>
            <div className="stack-list">
              {bootstrap.mcpServers.servers.map((server) => {
                const status = serverStatuses[server.id] || createServerStatus('unknown')

                return (
                  <div className="list-card" key={server.id}>
                    <div className="list-card-main">
                      <strong>{server.name || '未命名服务器'}</strong>
                      <Caption1>{server.transport}</Caption1>
                    </div>
                    <div className="list-card-actions">
                      <Button
                        size="small"
                        appearance="subtle"
                        className={`mcp-server-status-button mcp-server-status-button-${status.state}`}
                        icon={<PlugConnectedRegular />}
                        onClick={() => testServer(server.id)}
                        title={describeServerStatus(status)}
                      />
                      <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={() => discoverServer(server.id)} />
                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<EditRegular />}
                        onClick={() => { setServerDraft({ ...server, args: server.args || [], headers: normalizePairs(server.headers), env: normalizePairs(server.env) }); setServerDialogOpen(true) }}
                        title="编辑"
                      />
                      <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => setServerDeleteTarget(server)} />
                    </div>
                  </div>
                )
              })}
              {!bootstrap.mcpServers.servers.length && <EmptyState text="注册一个 MCP 服务器以解锁工具调试、提示检查和资源浏览功能。" />}
            </div>
          </>
        )}

        {targetTab === 'history' && (
          <>
            <div className="section-toolbar">
              <Button size="small" appearance="secondary" icon={<DeleteRegular />} onClick={() => openHistoryDeleteDialog({ type: 'all' })} disabled={!allHistory.length}>
                删除全部
              </Button>
            </div>
            <div className="stack-list">
              {!!groupedHistory.length && (
                <Accordion className="history-accordion" collapsible multiple defaultOpenItems={groupedHistory.map((group) => group.dayKey)}>
                  {groupedHistory.map((group) => (
                    <AccordionItem key={group.dayKey} value={group.dayKey}>
                      <AccordionHeader onContextMenu={(event) => handleHistoryContextMenu(event, { type: 'day', dayKey: group.dayKey, label: group.label })}>
                        <div className="history-day-header">
                          <span>{group.label}</span>
                          <Badge appearance="outline">{group.items.length}</Badge>
                        </div>
                      </AccordionHeader>
                      <AccordionPanel>
                        <div className="history-day-list">
                          {group.items.map((item) => (
                            <button
                              className="history-row"
                              key={item.id}
                              onClick={() => replayHistory(item)}
                              onContextMenu={(event) => handleHistoryContextMenu(event, { type: 'item', item })}
                            >
                              <HistoryTitle item={item} servers={bootstrap.mcpServers.servers} collections={bootstrap.collections.items} />
                            </button>
                          ))}
                        </div>
                      </AccordionPanel>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
              {!allHistory.length && <EmptyState text="请求和 MCP 执行历史记录将显示在这里。" />}
            </div>
          </>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <FluentProvider theme={fluentTheme}>
        <div className="splash-screen" style={appThemeVars}>
          <Spinner label="正在加载 Post MCP 工作区..." />
        </div>
      </FluentProvider>
    )
  }

  return (
    <FluentProvider theme={fluentTheme}>
      <div className="app-shell" style={{ ...appThemeVars, '--sidebar-width': `${effectiveSidebarWidth}px` }}>
        <aside className={`sidebar-panel ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarResizing ? 'resizing' : ''} ${sidebarTransitioning ? 'is-transitioning' : ''}`.trim()}>
          {!sidebarCollapsed ? (
            <div className="sidebar-expanded-shell">
              <div className="sidebar-header">
                <div className="workspace-dropdown-container">
                  {!workspaceEnabled ? (
                    <>
                      <img src="/appicon.png" alt="PostMCP" className="workspace-app-icon" />
                      <div className="workspace-title-static">PostMCP</div>
                    </>
                  ) : (
                    <>
                      <img src="/appicon.png" alt="PostMCP" className="workspace-app-icon" />
                      <Popover open={workspaceDropdownOpen} onOpenChange={(_, data) => setWorkspaceDropdownOpen(data.open)} positioning={{ position: 'below', align: 'start' }}>
                        <PopoverTrigger disableButtonStyle>
                          <button className="workspace-dropdown-trigger" onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}>
                            <span className="workspace-dropdown-icon"><WrenchRegular /></span>
                            <span className="workspace-dropdown-content">
                              <span className="workspace-dropdown-label">工作空间</span>
                              <span className="workspace-dropdown-value">
                                {workspaceSlots.find((ws) => ws.id === activeWorkspaceId)?.name || '默认'}
                              </span>
                            </span>
                            <span className={`workspace-dropdown-arrow ${workspaceDropdownOpen ? 'open' : ''}`}><ChevronDownRegular /></span>
                          </button>
                        </PopoverTrigger>
                        <PopoverSurface className="workspace-dropdown-surface">
                          <div className="workspace-dropdown-header">
                            <div className="workspace-dropdown-search-row">
                              <div className="workspace-search-wrapper">
                                <SearchRegular className="workspace-search-icon" />
                                <Input
                                  className="workspace-search-input"
                                  placeholder="搜索工作空间..."
                                  value={workspaceSearch}
                                  onChange={(_, data) => setWorkspaceSearch(data.value)}
                                />
                              </div>
                              <Button
                                size="small"
								style={{"minWidth":"30px"}}
                                appearance="primary"
                                icon={<AddRegular />}
                                className="workspace-dropdown-add-btn"
                                title="新增工作区"
                                aria-label="新增工作区"
                                onClick={() => openCreateWorkspaceDialog({ closeDropdown: true })}
                              />
                            </div>
                          </div>
                          <Divider />
                          <div className="workspace-dropdown-list">
                            {workspaceSlots
                              .filter((ws) => ws.name.toLowerCase().includes(workspaceSearch.toLowerCase()))
                              .slice(0, 5)
                              .map((workspace) => (
                                <div
                                  key={workspace.id}
                                  className={`workspace-dropdown-item ${workspace.id === activeWorkspaceId ? 'active' : ''}`}
                                  onClick={() => {
                                    handleWorkspaceSwitch(workspace.id)
                                  }}
                                >
                                  <span className="workspace-item-icon"><WrenchRegular /></span>
                                  <div className="workspace-item-content">
                                    <span className="workspace-item-name">{workspace.name}</span>
                                    {workspace.path && <span className="workspace-item-path">{workspace.path}</span>}
                                  </div>
                                  <div className="workspace-item-actions">
                                    {workspace.id === activeWorkspaceId && gitEnabled && (
                                      <>
                                        <button
                                          className={`workspace-item-action-btn ${isWorkspacePushBusy(workspace.id) ? 'updating' : ''}`}
                                          title={isWorkspacePushBusy(workspace.id) ? '正在处理推送…' : '推送'}
                                          disabled={workspaceOperationState.updatingId !== null || !workspace.gitUrl || isWorkspacePushBusy(workspace.id)}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            openPushPreview(workspace)
                                          }}
                                        >
                                          {isWorkspacePushBusy(workspace.id) ? (
                                            <span className="update-icon-wrapper rotating">
                                              <ArrowClockwiseRegular />
                                            </span>
                                          ) : (
                                            <ArrowUpRegular />
                                          )}
                                        </button>
                                        <button
                                          className={`workspace-item-action-btn ${isWorkspaceUpdating(workspace.id) ? 'updating' : ''}`}
                                          title="拉取"
                                          disabled={workspaceOperationState.updatingId !== null || !workspace.gitUrl}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleWorkspaceUpdate(workspace.id)
                                          }}
                                        >
                                          {isWorkspaceUpdating(workspace.id) ? (
                                            <span className="update-icon-wrapper rotating">
                                              <ArrowClockwiseRegular />
                                            </span>
                                          ) : isWorkspaceUpdated(workspace.id) ? (
                                            <span className="update-icon-success">
                                              <CheckmarkCircleRegular />
                                            </span>
                                          ) : (
                                            <ArrowClockwiseRegular />
                                          )}
                                        </button>
                                      </>
                                    )}
                                    <button
                                      className="workspace-item-action-btn"
                                      title="配置"
                                      disabled={workspaceOperationState.updatingId !== null || workspace.readOnly}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openWorkspaceConfigDialog(workspace)
                                      }}
                                    >
                                      <SettingsRegular />
                                    </button>
                                  </div>
                                  {workspace.id === activeWorkspaceId && <CheckRegular className="workspace-item-check" />}
                                </div>
                              ))}
                            {workspaceSlots.filter((ws) => ws.name.toLowerCase().includes(workspaceSearch.toLowerCase())).length === 0 && (
                              <div className="workspace-dropdown-empty">暂无匹配的工作空间</div>
                            )}
                          </div>
                        </PopoverSurface>
                      </Popover>
                    </>
                  )}
                </div>
              </div>

              <div className="sidebar-content-shell">
                <TabList className="sidebar-tab-list" selectedValue={sidebarTab} onTabSelect={(_, data) => setSidebarTab(data.value)}>
                  <Tab className="sidebar-tab" value="collections">收藏集</Tab>
                  <Tab className="sidebar-tab" value="servers">MCP 服务器</Tab>
                  <Tab className="sidebar-tab" value="history">历史记录</Tab>
                </TabList>
                {renderSidebarPanelContent(sidebarTab)}
              </div>
              <div className="sidebar-bottom-toggle">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<PanelLeftContractRegular />}
                  className="sidebar-toggle-button"
                  title="折叠侧边栏"
                  aria-label="折叠侧边栏"
                  onClick={() => toggleSidebarCollapsed(true)}
                >
                  收起侧边栏
                </Button>
              </div>
              <div
                className="sidebar-resize-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="调整侧边栏宽度"
                onPointerDown={beginSidebarResize}
              />
            </div>
          ) : (
            <div className="sidebar-collapsed-shell">
              <div className="sidebar-logo-badge" title="PostMCP" aria-hidden="true">
                <img src="/appicon.png" alt="PostMCP" className="workspace-app-icon" />
              </div>

              <div className="sidebar-collapsed-actions">
                {sidebarQuickTabs.map((item) => (
                  <Popover
                    key={item.value}
                    open={sidebarFloatingTab === item.value}
                    onOpenChange={(_, data) => setSidebarFloatingTab(data.open ? item.value : '')}
                    positioning={{ position: 'after', align: 'start', offset: { crossAxis: -8, mainAxis: 12 } }}
                  >
                    <PopoverTrigger disableButtonEnhancement>
                      <button
                        className={`sidebar-collapsed-action-btn ${sidebarFloatingTab === item.value ? 'active' : ''}`}
                        title={item.label}
                        aria-label={item.label}
                        aria-pressed={sidebarFloatingTab === item.value}
                        onClick={() => {
                          setSidebarTab(item.value)
                          setSidebarFloatingTab((current) => (current === item.value ? '' : item.value))
                        }}
                      >
                        {item.icon}
                      </button>
                    </PopoverTrigger>
                    <PopoverSurface className="sidebar-floating-surface" onMouseLeave={() => setSidebarFloatingTab('')}>
                      <div className="sidebar-floating-header">
                        <Body1>{item.label}</Body1>
                      </div>
                      <div className="sidebar-floating-content">
                        {renderSidebarPanelContent(item.value, { floating: true })}
                      </div>
                    </PopoverSurface>
                  </Popover>
                ))}
              </div>

              <div className="sidebar-bottom-toggle sidebar-bottom-toggle-collapsed">
                <button
                  className="sidebar-collapsed-action-btn sidebar-expand-btn"
                  title="展开侧边栏"
                  aria-label="展开侧边栏"
                  onClick={() => {
                    toggleSidebarCollapsed(false)
                  }}
                >
                  <PanelLeftExpandRegular />
                </button>
              </div>
            </div>
          )}
        </aside>

      <main className="workspace-panel">
        <div className="tabs-strip">
          <Button appearance="subtle" size="small" icon={<ChevronLeftRegular />} onClick={() => scrollTabs(tabsContainerRef, -200)} />
          <div className="tabs-container" ref={tabsContainerRef}>
            {bootstrap.workspace.tabs.map((tab) => (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                className={`custom-tab ${bootstrap.workspace.activeTabId === tab.id ? 'active' : ''}`}
                onClick={() => setWorkspace((workspace) => ({ ...workspace, activeTabId: tab.id }))}
                onContextMenu={(event) => openTabContextMenu(event, tab)}
              >
                {settingsForm.showIconsWithTabs && (
                  <span className="tab-mode-icon">{tab.mode === modes.http ? <DocumentRegular /> : <StickerRegular />}</span>
                )}
                <span className="tab-method">{tab.mode === modes.http ? tab.http.method : 'MCP'}</span>
                <span className="tab-url">{tab.title || (tab.mode === modes.http ? (tab.http.url || '新建请求') : (tab.mcp.toolName || '选择工具'))}</span>
                {isCollectionTabDirty(tab, bootstrap.collections.items) && <span className="tab-dirty-indicator">*</span>}
                <span className="tab-close" onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}>×</span>
              </button>
            ))}
          </div>
          <Button appearance="subtle" size="small" icon={<ChevronRightRegular />} onClick={() => scrollTabs(tabsContainerRef, 200)} />
          <div className="tabs-actions">
            <Button appearance="secondary" size="small" icon={<AddRegular />} onClick={() => addTab(modes.http)} title="新建 HTTP" />
          </div>
        </div>

        {!activeTab ? (
          <EmptyState text="创建一个请求标签页以开始调试。" />
        ) : (
          <div className={`editor-shell ${bootstrap.settings.snippetCollapsed ? 'snippet-collapsed' : ''}`}>
            <section className="request-panel">
              <div className="request-toolbar">
                {activeTab.mode === modes.http ? (
                  <>
                    <div className="toolbar-control-group http-toolbar-group">
                      <Field label="模式" className="compact-field">
                        <Dropdown selectedOptions={[activeTab.mode]} value={activeTab.mode.toUpperCase()} onOptionSelect={(_, data) => switchMode(data.optionValue)}>
                          <Option value={modes.http}>HTTP</Option>
                          <Option value={modes.mcp}>MCP</Option>
                        </Dropdown>
                      </Field>

                      <Field label="请求方法" className="compact-field compact-method">
                        <Dropdown selectedOptions={[activeTab.http.method]} value={activeTab.http.method} onOptionSelect={(_, data) => updateHttpRequest('method', data.optionValue)}>
                          {httpMethods.map((method) => (
                            <Option key={method} value={method}>{method}</Option>
                          ))}
                        </Dropdown>
                      </Field>

                      <Field label="请求 URL" className="grow-field">
                        <Input value={activeTab.http.url} onChange={(_, data) => handleHttpURLChange(data.value)} onPaste={handleUrlPaste} placeholder="粘贴 URL 或完整的 curl 命令" />
                      </Field>
                    </div>

                    <Button
                      appearance="primary"
                      className={isHttpRequestActive ? 'request-cancel-button' : undefined}
                      icon={isHttpRequestActive ? undefined : <PlayRegular />}
                      onClick={isHttpRequestActive ? cancelActiveRequest : sendHttpRequest}
                      disabled={busy && !isHttpRequestActive}
                    >
                      {isHttpRequestActive ? '取消' : '发送'}
                    </Button>
                    <Button
                      appearance="subtle"
                      className={`snippet-toggle-button ${bootstrap.settings.snippetCollapsed ? '' : 'snippet-toggle-button-active'}`.trim()}
                      icon={<CodeRegular />}
                      onClick={() => setSettings((settings) => ({ ...settings, snippetCollapsed: !settings.snippetCollapsed }))}
                      title={bootstrap.settings.snippetCollapsed ? '显示代码片段' : '隐藏代码片段'}
                    />
                  </>
                ) : (
                  <>
                    <div className="toolbar-control-group mcp-toolbar-group">
                      <Field label="模式" className="compact-field">
                        <Dropdown selectedOptions={[activeTab.mode]} value={activeTab.mode.toUpperCase()} onOptionSelect={(_, data) => switchMode(data.optionValue)}>
                          <Option value={modes.http}>HTTP</Option>
                          <Option value={modes.mcp}>MCP</Option>
                        </Dropdown>
                      </Field>

                      <Field label="MCP 服务器" className="compact-field grow-field mcp-server-field">
                        <Dropdown className="mcp-server-dropdown" selectedOptions={[activeTab.mcp.serverId]} value={currentServer?.name || '选择服务器'} onOptionSelect={(_, data) => updateMcpRequest('serverId', data.optionValue)}>
                          {enabledMcpServers.map((server) => (
                            <Option key={server.id} value={server.id}>{server.name}</Option>
                          ))}
                        </Dropdown>
                      </Field>

                      <Field label="工具" className="compact-field grow-field mcp-tool-field">
                        <Combobox
                          className="tool-combobox"
                          selectedOptions={activeTab.mcp.toolName ? [activeTab.mcp.toolName] : []}
                          value={toolComboboxValue}
                          placeholder="选择工具"
                          onChange={(event, data) => {
                            if (!activeTab?.id) {
                              return
                            }
                            const nextValue = data?.value ?? event?.target?.value ?? ''
                            setToolFilterByTab((current) => ({ ...current, [activeTab.id]: nextValue }))
                          }}
                          onOptionSelect={(_, data) => {
                            const optionValue = data?.optionValue || ''
                            updateMcpRequest('toolName', optionValue)
                            if (!activeTab?.id) {
                              return
                            }
                            const nextTool = currentTools.find((tool) => tool.name === optionValue)
                            setToolFilterByTab((current) => ({ ...current, [activeTab.id]: nextTool ? (nextTool.title || nextTool.name) : '' }))
                          }}
                          listbox={{ className: 'tool-combobox-listbox' }}
                          disabled={!currentServer}
                        >
                          {filteredTools.map((tool) => (
                            <Option key={tool.name} value={tool.name} text={tool.title || tool.name}>{tool.title || tool.name}</Option>
                          ))}
                        </Combobox>
                      </Field>
                    </div>

                    <Button appearance="secondary" icon={<ArrowClockwiseRegular />} onClick={() => discoverServer()} disabled={!currentServer || busy}>
                      刷新
                    </Button>
                    <Button
                      appearance="primary"
                      className={isMcpRequestActive ? 'request-cancel-button' : undefined}
                      icon={isMcpRequestActive ? undefined : <PlayRegular />}
                      onClick={isMcpRequestActive ? cancelActiveRequest : runMcpTool}
                      disabled={isMcpRequestActive ? false : (!currentServer || !activeTab.mcp.toolName || busy)}
                    >
                      {isMcpRequestActive ? '取消' : '运行'}
                    </Button>
                    <Button
                      appearance="subtle"
                      className={`snippet-toggle-button ${bootstrap.settings.snippetCollapsed ? '' : 'snippet-toggle-button-active'}`.trim()}
                      icon={<CodeRegular />}
                      onClick={() => setSettings((settings) => ({ ...settings, snippetCollapsed: !settings.snippetCollapsed }))}
                      title={bootstrap.settings.snippetCollapsed ? '显示代码片段' : '隐藏代码片段'}
                    />
                  </>
                )}
              </div>

              {activeTab.mode === modes.http ? (
                <div className={`request-editor ${editorResizing ? 'resizing' : ''}`} ref={requestEditorRef}>
                  <div className="http-editor-tabs-bar">
                    <TabList selectedValue={httpEditorTab} onTabSelect={(_, data) => setHttpEditorTab(data.value)}>
                      {httpEditorTabs.map((item) => (
                        <Tab key={item} value={item}>{httpEditorTabLabels[item]}</Tab>
                      ))}
                    </TabList>
                    <Button size="small" appearance="subtle" className="cookie-entry-button" onClick={openCookieDialog}>Cookie</Button>
                  </div>
                  <div className="editor-card" style={editorBodyStyle}>
                    <div className="editor-card-inner">
                      {httpEditorTab === 'params' && (
                        <KeyValueEditor
                          title="查询参数"
                          rows={activeTab.http.query}
                          hiddenRows={autoHttpFields.query}
                          showHiddenButton
                          lockHiddenRowSelection
                          onToggleHiddenRow={toggleHttpAutoField}
                          onChange={handleHttpQueryChange}
                        />
                      )}
                      {httpEditorTab === 'headers' && (
                        <KeyValueEditor
                          title="请求头"
                          rows={activeTab.http.headers}
                          hiddenRows={autoHttpFields.headers}
                          showHiddenButton
                          onToggleHiddenRow={toggleHttpAutoField}
                          onChange={(rows) => updateHttpRequest('headers', rows)}
                        />
                      )}
                      {httpEditorTab === 'auth' && (
                        <HttpAuthEditor auth={activeTab.http.auth} onChange={handleHttpAuthChange} />
                      )}
                      {httpEditorTab === 'body' && (
                        <HttpBodyEditor body={activeTab.http.body} onChange={(path, value) => updateHttpRequest(`body.${path}`, value)} editorSettings={settingsForm} />
                      )}
                    </div>
                  </div>
                  <div className="editor-splitter" onPointerDown={startEditorSplitDrag} role="separator" aria-orientation="horizontal" aria-label="调整请求与响应区域高度" />
                  <div className="response-shell-host" style={responseBodyStyle}>
                    <ResponsePanelHTTP
                      response={activeTab.lastHttp}
                      editorSettings={settingsForm}
                      onOpenResolvedURL={(resolvedURL) => {
                        if (!resolvedURL) {
                          return
                        }
                        const sourceHeaders = settingsForm.retainHeadersOnLinkClick ? (activeTab.http.headers || []) : []
                        addTab(modes.http, {
                          ...createWorkspaceTab(modes.http, bootstrap.mcpServers.servers),
                          mode: modes.http,
                          title: resolvedURL,
                          http: {
                            ...createWorkspaceTab(modes.http, bootstrap.mcpServers.servers).http,
                            method: 'GET',
                            url: resolvedURL,
                            headers: sourceHeaders.map((item) => ({ ...item, id: newPair().id })),
                          },
                        })
                      }}
                    />
                    {isHttpRequestActive && (
                      <div className="response-loading-mask">
                        <Spinner size="medium" label="请求中" />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={`request-editor ${editorResizing ? 'resizing' : ''}`} ref={requestEditorRef}>
                  {!bootstrap.mcpServers.servers.length && <EmptyState text="切换到 MCP 调试模式前，请先注册至少一个 MCP 服务器。" />}
                  {!!bootstrap.mcpServers.servers.length && (
                    <>
                      <TabList selectedValue={mcpInspectorTab} onTabSelect={(_, data) => setMcpInspectorTab(data.value)}>
                        <Tab value="tool">工具表单</Tab>
                        <Tab value="prompts">提示词</Tab>
                        <Tab value="resources">资源</Tab>
                      </TabList>
                      <div className="editor-card" style={editorBodyStyle}>
                        <div className="editor-card-inner">
                          {mcpInspectorTab === 'tool' && (
                            <McpToolEditor
                              tool={currentDiscovery.tools?.find((item) => item.name === activeTab.mcp.toolName)}
                              argumentsJson={activeTab.mcp.argumentsJson}
                              onArgumentsChange={(value) => updateMcpRequest('argumentsJson', value)}
                              editorSettings={settingsForm}
                            />
                          )}
                          {mcpInspectorTab === 'prompts' && (
                            <McpPromptExplorer
                              prompts={currentDiscovery.prompts || []}
                              promptName={activeTab.mcp.promptName}
                              promptArgs={activeTab.mcp.promptArgs}
                              view={promptViews[activeTab.id]}
                              onSelectPrompt={(value) => updateMcpRequest('promptName', value)}
                              onChangeArgs={(value) => updateMcpRequest('promptArgs', value)}
                              onInspect={inspectPrompt}
                            />
                          )}
                          {mcpInspectorTab === 'resources' && (
                            <McpResourceExplorer resources={currentDiscovery.resources || []} onRead={inspectResource} />
                          )}
                        </div>
                      </div>
                      <div className="editor-splitter" onPointerDown={startEditorSplitDrag} role="separator" aria-orientation="horizontal" aria-label="调整请求与响应区域高度" />
                      <div className="response-shell-host" style={responseBodyStyle}>
                        <ResponsePanelMCP response={activeTab.lastMcp} editorSettings={settingsForm} />
                        {isMcpRequestActive && (
                          <div className="response-loading-mask">
                            <Spinner size="medium" label="请求中" />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>

            {!bootstrap.settings.snippetCollapsed && (
              <aside className="snippet-panel">
                <div className="snippet-header">
                  <Caption1>代码片段</Caption1>
                </div>

                <div className="snippet-content">
                  <div className="snippet-language-row">
                    <Field label="代码语言">
                      <Dropdown
                        selectedOptions={[activeTab.mode === modes.http ? bootstrap.settings.httpCodeLanguage : bootstrap.settings.mcpCodeLanguage]}
                        value={activeTab.mode === modes.http ? bootstrap.settings.httpCodeLanguage : bootstrap.settings.mcpCodeLanguage}
                        onOptionSelect={(_, data) =>
                          setSettings((settings) =>
                            activeTab.mode === modes.http
                              ? { ...settings, httpCodeLanguage: data.optionValue }
                              : { ...settings, mcpCodeLanguage: data.optionValue },
                          )
                        }
                      >
                        {snippetLanguages[activeTab.mode].map((language) => (
                          <Option key={language} value={language}>{language}</Option>
                        ))}
                      </Dropdown>
                    </Field>
                    <Tooltip content="复制代码" relationship="label">
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<CopyRegular />}
                        onClick={() => {
                          navigator.clipboard.writeText(currentSnippet)
                          setStatusMessage('代码已复制到剪贴板')
                        }}
                      />
                    </Tooltip>
                  </div>
                  <Textarea className="snippet-textarea" resize="none" value={currentSnippet} readOnly />
                </div>
              </aside>
            )}
          </div>
        )}
      </main>

      <div className="status-bar">
        <span>{loadError || statusMessage || '就绪'}</span>
        {busy && <Field className="status-bar-process" thickness="large" validationState="none">
      <ProgressBar />
    </Field>}
        <Button appearance="subtle" size="small" icon={<SettingsRegular />} onClick={() => setSettingsDialogOpen(true)} title="设置" />
      </div>

      <Toaster toasterId={toasterId} position="top-end" />

      <Dialog open={settingsDialogOpen} onOpenChange={(_, data) => setSettingsDialogOpen(data.open)}>
        <DialogSurface className="settings-dialog-surface">
          <DialogBody>
            <div className="settings-dialog-header">
              <DialogTitle>设置</DialogTitle>
              <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={() => setSettingsDialogOpen(false)} className="settings-dialog-close" />
            </div>
            <DialogContent>
              <TabList selectedValue={settingsTab} onTabSelect={(_, data) => setSettingsTab(data.value)}>
                <Tab value="general">全局设置</Tab>
                <Tab value="theme">主题风格</Tab>
                <Tab value="workspace">工作空间</Tab>
              </TabList>
              <div className="settings-tab-content">
                {settingsTab === 'general' && (
                  <div className="settings-panel">
                    <div className="settings-section">
                      <h3 className="settings-section-title">🧩 请求设置</h3>
                      <div className="settings-grid">
                        <Field label="HTTP 版本">
                          <Dropdown selectedOptions={[settingsForm.httpVersion]} value={settingsForm.httpVersion} onOptionSelect={(_, data) => updateSettings({ httpVersion: data.optionValue })}>
                            <Option value="HTTP/1.1">HTTP/1.1</Option>
                            <Option value="HTTP/2">HTTP/2</Option>
                          </Dropdown>
                        </Field>
                        <Field label="请求超时时间（毫秒）">
                          <Input type="number" value={String(settingsForm.requestTimeout)} onChange={(_, data) => updateSettings({ requestTimeout: Number(data.value || 0) })} />
                        </Field>
                        <Field label="最大响应大小（MB）">
                          <Input type="number" value={String(settingsForm.maxResponseSize)} onChange={(_, data) => updateSettings({ maxResponseSize: Number(data.value || 0) })} />
                        </Field>
                      </div>
                    </div>

                    <div className="settings-section">
                      <h3 className="settings-section-title">📬 头信息设置</h3>
                      <div className="settings-switches">
                        <Switch checked={settingsForm.noCacheHeader} label="发送 no-cache 头" onChange={(_, data) => updateSettings({ noCacheHeader: data.checked })} />
                        <Switch checked={settingsForm.retainHeadersOnLinkClick} label="点击链接时保留头信息" onChange={(_, data) => updateSettings({ retainHeadersOnLinkClick: data.checked })} />
                        <Switch checked={settingsForm.followRedirects} label="自动跟随重定向" onChange={(_, data) => updateSettings({ followRedirects: data.checked })} />
                      </div>
                    </div>

                    <div className="settings-section">
                      <h3 className="settings-section-title">🖥️ 用户界面</h3>
                      <div className="settings-switches">
                        <Switch checked={settingsForm.showIconsWithTabs} label="标签页名称旁显示图标" onChange={(_, data) => updateSettings({ showIconsWithTabs: data.checked })} />
                      </div>
                    </div>

                    <div className="settings-section">
                      <h3 className="settings-section-title">🔐 SSL 证书验证</h3>
                      <div className="settings-switches">
                        <Switch checked={settingsForm.sslVerification} label="SSL 证书验证" onChange={(_, data) => updateSettings({ sslVerification: data.checked })} />
                      </div>
                    </div>

                    <div className="settings-section">
                      <h3 className="settings-section-title">🌍 语言检测</h3>
                      <div className="settings-grid">
                        <Field label="语言检测">
                          <Dropdown selectedOptions={[settingsForm.languageDetection]} value={settingsForm.languageDetection} onOptionSelect={(_, data) => updateSettings({ languageDetection: data.optionValue })}>
                            <Option value="Auto">自动</Option>
                            <Option value="zh-CN">简体中文</Option>
                            <Option value="en-US">英语</Option>
                          </Dropdown>
                        </Field>
                      </div>
                    </div>

                    <div className="settings-section">
                      <h3 className="settings-section-title">🗂️ 标签页与文件行为</h3>
                      <div className="settings-switches">
                        <Switch checked={settingsForm.alwaysOpenInNewTab} label="始终在新标签页打开请求" onChange={(_, data) => updateSettings({ alwaysOpenInNewTab: data.checked })} />
                        <Switch checked={settingsForm.askOnCloseUnsaved} label="关闭未保存标签页时总是询问" onChange={(_, data) => updateSettings({ askOnCloseUnsaved: data.checked })} />
                      </div>
                    </div>

                    <div className="settings-section">
                      <h3 className="settings-section-title">✍️ 编辑器设置</h3>
                      <div className="settings-grid">
                        <Field label="字体家族">
                          <Input value={settingsForm.editorFontFamily} onChange={(_, data) => updateSettings({ editorFontFamily: data.value })} />
                        </Field>
                        <Field label="字体大小（px）">
                          <Input type="number" value={String(settingsForm.editorFontSize)} onChange={(_, data) => updateSettings({ editorFontSize: Number(data.value || 12) })} />
                        </Field>
                        <Field label="缩进空格数">
                          <Input type="number" value={String(settingsForm.editorIndentCount)} onChange={(_, data) => updateSettings({ editorIndentCount: Number(data.value || 4) })} />
                        </Field>
                        <Field label="缩进类型">
                          <RadioGroup value={settingsForm.editorIndentType} onChange={(event, data) => updateSettings({ editorIndentType: data.value || event?.target?.value || 'space' })}>
                            <Radio value="space" label="空格" />
                            <Radio value="tab" label="制表符" />
                          </RadioGroup>
                        </Field>
                      </div>
                    </div>
                  </div>
                )}
                {settingsTab === 'theme' && (
                  <div className="settings-panel">
                    <div className="settings-section">
                      <h3 className="settings-section-title">🎨 主题色</h3>
                      <div className="theme-color-list">
                        {settingsForm.themeColors.map((color) => (
                          <div
                            key={color}
                            className={`theme-color-swatch ${settingsForm.themeColor === color ? 'active' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => updateSettings({ themeColor: color })}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setThemeColorContextMenu({ 
                                color, 
                                x: e.clientX - 110, 
                                y: e.clientY - 80,
                              })
                            }}
                          >
                            {settingsForm.themeColor === color && <CheckRegular className="theme-color-check-icon" />}
                          </div>
                        ))}
                        <label className="theme-color-add theme-color-add-preview" title="选择候选主题色" style={{ backgroundColor: normalizedThemeColorDraft }}>
                          <AddRegular />
                          <input
                            type="color"
                            value={normalizedThemeColorDraft}
                            onChange={(e) => {
                              setThemeColorDraft(normalizeHexColor(e.target.value))
                            }}
                          />
                        </label>
                      </div>
                      <div className="theme-color-picker-actions">
                        <span className="theme-color-draft-label">候选色：{normalizedThemeColorDraft}</span>
                        <Button
                          appearance="primary"
                          onClick={() => {
                            const pickedColor = normalizedThemeColorDraft
                            const normalizedColors = settingsForm.themeColors.map((color) => normalizeHexColor(color))
                            const nextColors = normalizedColors.includes(pickedColor) ? normalizedColors : [...normalizedColors, pickedColor]
                            updateSettings({
                              themeColor: pickedColor,
                              themeColors: nextColors,
                            })
                          }}
                          disabled={themeDraftExists && themeDraftIsActive}
                        >
                          {themeDraftExists
                            ? (themeDraftIsActive ? '当前已使用该颜色' : '应用候选色')
                            : `添加并应用 ${normalizedThemeColorDraft}`}
                        </Button>
                      </div>

                      {themeColorContextMenu && (
                        <>
                          <div
                            className="context-menu-backdrop"
                            onClick={() => setThemeColorContextMenu(null)}
                          />
                          <div
                            className="theme-color-context-menu"
                            style={{ 
                              left: themeColorContextMenu.x, 
                              top: themeColorContextMenu.y,
                              position: 'fixed',
                              zIndex: 100000,
                            }}
                          >
                            <button
                              className="context-menu-item"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateSettings({ themeColor: themeColorContextMenu.color })
                                setThemeColorContextMenu(null)
                              }}
                            >
                              <CheckRegular className="context-menu-icon" />
                              <span>激活主题色</span>
                            </button>
                            <button
                              className="context-menu-item danger"
                              onClick={(e) => {
                                e.stopPropagation()
                                const nextColors = settingsForm.themeColors.filter((c) => c !== themeColorContextMenu.color)
                                updateSettings({
                                  themeColors: nextColors,
                                  themeColor: settingsForm.themeColor === themeColorContextMenu.color ? (nextColors[0] || '#0f6cbd') : settingsForm.themeColor,
                                })
                                setThemeColorContextMenu(null)
                              }}
                            >
                              <DeleteRegular className="context-menu-icon danger" />
                              <span>删除主题色</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="settings-section">
                      <h3 className="settings-section-title">🌓 主题模式</h3>
                      <div className="settings-switches">
                        <RadioGroup value={settingsForm.themeMode} onChange={(event, data) => updateSettings({ themeMode: data.value || event?.target?.value || 'system' })}>
                          <Radio value="system" label="跟随系统" />
                          <Radio value="light" label="亮色" />
                          <Radio value="dark" label="暗色" />
                        </RadioGroup>
                      </div>
                    </div>
                  </div>
                )}
                {settingsTab === 'workspace' && (
                  <div className="settings-panel">
                    <div className="settings-section">
                      <h3 className="settings-section-title">📁 工作空间设置</h3>
                      <div className="settings-switches">
                        <Switch 
                          checked={workspaceEnabled} 
                          label="启用多工作空间支持" 
                          onChange={async (_, data) => {
                            if (!data.checked) {
                              await handleWorkspaceSwitch('default')
                            }
                            syncWorkspaceFeatureSettings({ multiWorkspaceEnabled: data.checked, gitEnabled: gitEnabled && data.checked })
                          }} 
                        />
                        <Switch 
                          checked={gitEnabled} 
                          label={
                            <Tooltip content={gitCheck.available ? `Git 版本：${gitCheck.version}` : `Git 不可用：${gitCheck.error || '未检测到 Git'}`} relationship="label">
                              <span>启用 Git 支持（需要本地已安装 Git）</span>
                            </Tooltip>
                          } 
                          onChange={(_, data) => syncWorkspaceFeatureSettings({ gitEnabled: data.checked, multiWorkspaceEnabled: workspaceEnabled })}
                          disabled={!workspaceEnabled}
                        />
                      </div>
                    </div>

                    <div className={`settings-section ${!workspaceEnabled ? 'disabled-section' : ''}`}>
                      <div className="workspace-table-header">
                        <span className="workspace-table-title">工作空间管理</span>
                        <div className="workspace-search-actions-row">
                          <div className="workspace-search-wrapper">
                            <SearchRegular className="workspace-search-icon" />
                            <Input
                              className="workspace-search-input"
                              placeholder="搜索工作空间..."
                              value={workspaceTableSearch}
                              onChange={(_, data) => {
                                setWorkspaceTableSearch(data.value)
                                setWorkspaceTablePage(1)
                              }}
                            />
                          </div>
                          <Button
                            size="small"
                            appearance="subtle"
                            icon={<SearchRegular />}
                            title="搜索"
                            style={{ color: 'var(--brand)' }}
                          />
                          <Button
                            size="small"
                            appearance="subtle"
                            icon={<AddRegular />}
                            title="添加工作空间"
                            style={{ color: 'var(--brand)' }}
                            onClick={openCreateWorkspaceDialog}
                          />
                        </div>
                      </div>

                      <div className="workspace-table-wrapper">
                        <table className="workspace-table">
                          <thead>
                            <tr>
                              <th>工作空间名称</th>
                              <th>本地目录</th>
                              {gitEnabled && <th>远程 Git 地址</th>}
                              {gitEnabled && <th>Git 分支</th>}
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mockWorkspaces
                              .filter((ws) => ws.name.toLowerCase().includes(workspaceTableSearch.toLowerCase()))
                              .slice((workspaceTablePage - 1) * 10, workspaceTablePage * 10)
                              .map((item) => (
                                <tr key={item.id}>
                                  <td>{item.name}</td>
                                  <td title={item.path}>{item.path}</td>
                                  {gitEnabled && <td title={item.gitUrl}>{item.gitUrl || '-'}</td>}
                                  {gitEnabled && <td title={item.gitBranch}>{!item.gitUrl ? '-' : (item.gitBranch || '-')}</td>}
                                  <td>
                                    <div className="workspace-table-actions">
                                      {gitEnabled && (
                                        <>
                                          <Button
                                            size="small"
                                            appearance="subtle"
                                            icon={
                                              pushingWorkspaceId === item.id ? (
                                                <span className="update-icon-wrapper rotating">
                                                  <ArrowClockwiseRegular />
                                                </span>
                                              ) : lastPushedWorkspaceId === item.id ? (
                                                <span className="update-icon-success">
                                                  <CheckmarkCircleRegular />
                                                </span>
                                              ) : (
                                                <ArrowUpRegular />
                                              )
                                            }
                                            title={pushingWorkspaceId === item.id ? '正在推送…' : '推送'}
                                            disabled={!item.gitUrl || !gitEnabled || pushingWorkspaceId !== ''}
                                            onClick={() => openPushPreview(item)}
                                          />
                                          <Button
                                            size="small"
                                            appearance="subtle"
                                            icon={
                                              isWorkspaceUpdating(item.id) ? (
                                                <span className="update-icon-wrapper rotating">
                                                  <ArrowClockwiseRegular />
                                                </span>
                                              ) : isWorkspaceUpdated(item.id) ? (
                                                <span className="update-icon-success">
                                                  <CheckmarkCircleRegular />
                                                </span>
                                              ) : (
                                                <ArrowClockwiseRegular />
                                              )
                                            }
                                            title={isWorkspaceUpdating(item.id) ? '正在拉取…' : '拉取'}
                                            disabled={!item.gitUrl || !gitEnabled || workspaceOperationState.updatingId !== null}
                                            onClick={() => handleWorkspaceUpdate(item.id)}
                                          />
                                        </>
                                      )}
                                      <Button
                                        size="small"
                                        appearance="subtle"
                                        icon={<SettingsRegular />}
                                        title="配置"
                                        disabled={item.readOnly}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openWorkspaceConfigDialog(item)
                                        }}
                                      />
                                      <Button
                                        size="small"
                                        appearance="subtle"
                                        icon={<DeleteRegular />}
                                        title="删除"
                                        disabled={item.readOnly}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openWorkspaceDeleteDialog(item)
                                        }}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="workspace-pagination">
                        <div className="pagination-buttons">
                          <Button 
                            size="small" 
                            appearance="subtle" 
                            icon={<ChevronLeftRegular />} 
                            disabled={workspaceTablePage === 1}
                            onClick={() => setWorkspaceTablePage(p => p - 1)}
                          />
                          <span className="pagination-info">
                            第 {workspaceTablePage} 页 / 共 {Math.max(1, Math.ceil(mockWorkspaces.filter((ws) => ws.name.toLowerCase().includes(workspaceTableSearch.toLowerCase())).length / 10))} 页
                          </span>
                          <Button 
                            size="small" 
                            appearance="subtle" 
                            icon={<ChevronRightRegular />} 
                            disabled={workspaceTablePage >= Math.max(1, Math.ceil(mockWorkspaces.filter((ws) => ws.name.toLowerCase().includes(workspaceTableSearch.toLowerCase())).length / 10))}
                            onClick={() => setWorkspaceTablePage(p => p + 1)}
                          />
                        </div>
                      </div>

                      <div className="workspace-usage">
                        <div className="workspace-usage-label">
                          <StorageRegular className="workspace-usage-icon" />
                          <span>当前工作空间使用量：{mockWorkspaces.length}/{workspaceMaxCount}</span>
                        </div>
                        <div className="workspace-usage-progress">
                          <div className="workspace-usage-bar" style={{ width: `${workspaceUsagePercent}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={workspaceEditDialogOpen}
        onOpenChange={(_, data) => {
          if (workspaceImporting && !data.open) {
            return
          }
          setWorkspaceEditDialogOpen(data.open)
        }}
      >
        <DialogSurface className="dialog-surface">
          <DialogBody>
            <div className="dialog-header-with-close">
              <DialogTitle>
                {workspaceEditDraft.isNew ? '新增工作空间' : `编辑：${workspaceEditDraft.name}`}
              </DialogTitle>
              <Button
                appearance="subtle"
                size="small"
                icon={<DismissRegular />}
                onClick={() => {
                  setWorkspaceEditDialogOpen(false)
                }}
                className="dialog-close-button"
                disabled={workspaceImporting}
              />
            </div>
            <DialogContent>
              <div className="dialog-grid-single">
                {workspaceEditDraft.isNew && (
                  <Field label="工作空间名称">
                    <Input
                      value={workspaceEditDraft.name}
                      onChange={(_, data) => setWorkspaceEditDraft((current) => ({ ...current, name: data.value }))}
                      placeholder={workspaceEditDraft.mode === 'import' ? '可留空，默认使用目录名称' : '输入工作空间名称'}
                    />
                  </Field>
                )}
                <Field label="描述">
                  <Input
                    value={workspaceEditDraft.description || ''}
                    onChange={(_, data) => setWorkspaceEditDraft((current) => ({ ...current, description: data.value }))}
                    placeholder="工作空间用途说明"
                  />
                </Field>
                <Field label="创建人">
                  <Input
                    value={workspaceEditDraft.creator || ''}
                    onChange={(_, data) => setWorkspaceEditDraft((current) => ({ ...current, creator: data.value }))}
                    placeholder="例如：Alice"
                  />
                </Field>
                {workspaceEditDraft.isNew && (
                  <Field label="创建方式">
                    <RadioGroup
                      value={workspaceEditDraft.mode || 'create'}
                      onChange={(_, data) => {
                        const mode = data.value === 'import' ? 'import' : 'create'
                        setWorkspaceEditDraft((current) => ({
                          ...current,
                          mode,
                          importSource: mode === 'import' ? (current.importSource || 'local') : current.importSource,
                        }))
                      }}
                    >
                      <Radio value="create" label="新建" />
                      <Radio value="import" label="导入" />
                    </RadioGroup>
                  </Field>
                )}
                {workspaceEditDraft.isNew && workspaceEditDraft.mode === 'import' && (
                  <Field label="导入来源">
                    <RadioGroup
                      value={workspaceEditDraft.importSource || 'local'}
                      onChange={(_, data) => {
                        const importSource = data.value === 'remote' ? 'remote' : 'local'
                        if (importSource === 'remote' && !gitEnabled) {
                          return
                        }
                        setWorkspaceEditDraft((current) => ({
                          ...current,
                          importSource,
                          gitUrl: importSource === 'local' ? '' : current.gitUrl,
                          gitBranch: importSource === 'local' ? '' : current.gitBranch,
                        }))
                      }}
                    >
                      <Radio value="local" label="从本地文件夹导入" />
                      <Radio value="remote" label="从远端 Git 地址导入" disabled={!gitEnabled} />
                    </RadioGroup>
                    {!gitEnabled && <Caption1>请先在设置中启用 Git 支持后再使用远端导入。</Caption1>}
                  </Field>
                )}
                <Field
                  label={
                    workspaceEditDraft.isNew && workspaceEditDraft.mode === 'import'
                      ? (workspaceEditDraft.importSource || 'local') === 'remote'
                        ? '本地目录'
                        : '导入目录'
                      : '父目录'
                  }
                  validationState={workspaceEditErrors.path ? 'error' : undefined}
                  validationMessage={workspaceEditErrors.path || undefined}
                >
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Input
                      value={workspaceEditDraft.path}
                      onChange={(_, data) => {
                        setWorkspaceEditDraft((current) => ({ ...current, path: data.value }))
                        setWorkspaceEditErrors((current) => ({ ...current, path: '' }))
                      }}
                      placeholder={
                        workspaceEditDraft.isNew && workspaceEditDraft.mode === 'import'
                          ? (workspaceEditDraft.importSource || 'local') === 'remote'
                            ? '选择本地目录（将克隆远端 Git 仓库到该目录）'
                            : '选择现有工作空间目录（必须非空且已完成初始化）'
                          : '选择父目录（将在该目录下自动创建“工作空间名称”文件夹）'
                      }
                      disabled={!workspaceEditDraft.isNew}
                      style={{ flex: 1 }}
                    />
                    {workspaceEditDraft.isNew && (
                      <Button
                        icon={<FolderOpenRegular />}
                        title="选择文件夹"
                        onClick={async () => {
                          try {
                            const selectedPath = await invokeBackend('SelectFolder')
                            if (selectedPath) {
                              setWorkspaceEditDraft((current) => ({ ...current, path: selectedPath }))
                            }
                          } catch (error) {
                            console.error('选择文件夹失败:', error)
                          }
                        }}
                      />
                    )}
                  </div>
                </Field>
                {!(workspaceEditDraft.isNew && workspaceEditDraft.mode === 'import' && (workspaceEditDraft.importSource || 'local') === 'local') && (
                  <>
                    <Field label="远端地址" validationState={workspaceEditErrors.gitUrl ? 'error' : undefined} validationMessage={workspaceEditErrors.gitUrl || undefined}>
                      <Input
                        value={workspaceEditDraft.gitUrl}
                        onChange={(_, data) => {
                          setWorkspaceEditDraft((current) => ({ ...current, gitUrl: data.value }))
                          setWorkspaceEditErrors((current) => ({ ...current, gitUrl: '' }))
                        }}
                        placeholder="https://github.com/user/repo.git"
                      />
                    </Field>
                    <Field label="Git 分支" validationState={workspaceEditErrors.gitBranch ? 'error' : undefined} validationMessage={workspaceEditErrors.gitBranch || undefined}>
                      <Input
                        value={workspaceEditDraft.gitBranch}
                        onChange={(_, data) => {
                          setWorkspaceEditDraft((current) => ({ ...current, gitBranch: data.value }))
                          setWorkspaceEditErrors((current) => ({ ...current, gitBranch: '' }))
                        }}
                        placeholder="例如：feature/workspace-import"
                      />
                      <Caption1>留空时按 main 处理。</Caption1>
                    </Field>
                  </>
                )}
                <Field>
                  <Switch
                    checked={Boolean(workspaceEditDraft.includeHistoryInGit)}
                    label="允许提交历史记录"
                    onChange={(_, data) => setWorkspaceEditDraft((current) => ({ ...current, includeHistoryInGit: data.checked }))}
                    disabled={!gitEnabled}
                  />
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                disabled={workspaceImporting}
                onClick={async () => {
                  try {
                    if (!hasBackend()) {
                      setWorkspaceEditDialogOpen(false)
                      return
                    }
                    const importSource = workspaceEditDraft.importSource || 'local'
                    const isImportRemote = workspaceEditDraft.isNew && workspaceEditDraft.mode === 'import' && importSource === 'remote'
                    const isImportOperation = workspaceEditDraft.isNew && workspaceEditDraft.mode === 'import'
                    const nextErrors = { path: '', gitUrl: '', gitBranch: '' }
                    if (isImportRemote) {
                      if (!String(workspaceEditDraft.path || '').trim()) {
                        nextErrors.path = '从远端导入时，本地目录不能为空。'
                      }
                      if (!String(workspaceEditDraft.gitUrl || '').trim()) {
                        nextErrors.gitUrl = '从远端导入时，远端地址不能为空。'
                      }
                    }
                    if (nextErrors.path || nextErrors.gitUrl || nextErrors.gitBranch) {
                      setWorkspaceEditErrors(nextErrors)
                      return
                    }
                    setWorkspaceEditErrors({ path: '', gitUrl: '', gitBranch: '' })
                    if (workspaceEditDraft.isNew) {
                      if (mockWorkspaces.length >= workspaceMaxCount) {
                        setWorkspaceEditDialogOpen(false)
                        openWorkspaceLimitDialog()
                        return
                      }
                      if (isImportOperation) {
                        setWorkspaceImporting(true)
                      }
                      const manager = await invokeBackend('CreateWorkspace', {
                        name: workspaceEditDraft.name,
                        description: workspaceEditDraft.description,
                        creator: workspaceEditDraft.creator,
                        path: workspaceEditDraft.path,
                        mode: workspaceEditDraft.mode || 'create',
                        importSource,
                        gitUrl: workspaceEditDraft.gitUrl,
                        gitBranch: workspaceEditDraft.gitBranch,
                        includeHistoryInGit: Boolean(workspaceEditDraft.includeHistoryInGit),
                      })
                      setBootstrap((previous) => ({ ...previous, workspaceManager: manager }))
                      if (isImportOperation) {
                        setWorkspaceImportResultDialog({
                          open: true,
                          title: '导入成功',
                          message: '工作空间导入完成。',
                        })
                      }
                    } else {
                      const manager = await invokeBackend('UpdateWorkspace', {
                        id: workspaceEditDraft.id,
                        name: workspaceEditDraft.name,
                        description: workspaceEditDraft.description,
                        creator: workspaceEditDraft.creator,
                        gitUrl: workspaceEditDraft.gitUrl,
                        gitBranch: workspaceEditDraft.gitBranch,
                        includeHistoryInGit: Boolean(workspaceEditDraft.includeHistoryInGit),
                      })
                      setBootstrap((previous) => ({ ...previous, workspaceManager: manager }))
                    }
                    setWorkspaceEditDialogOpen(false)
                    if (!isImportOperation) {
                      setModalNoticeDialog({ open: true, title: '保存成功', message: '工作空间已保存。' })
                    }
                  } catch (error) {
                    const errorMessage = String(error?.message || error)
                    const importSource = workspaceEditDraft.importSource || 'local'
                    const isImportOperation = workspaceEditDraft.isNew && workspaceEditDraft.mode === 'import' && (importSource === 'local' || importSource === 'remote')
                    const limitMatch = errorMessage.match(/workspace count exceeds limit:\s*(\d+)/i)
                    if (limitMatch) {
                      const backendLimit = Number(limitMatch[1])
                      setWorkspaceEditDialogOpen(false)
                      openWorkspaceLimitDialog(`您的工作空间使用量已满（${mockWorkspaces.length}/${Number.isFinite(backendLimit) ? backendLimit : workspaceMaxCount}）。`)
                      return
                    }
                    if (isImportOperation) {
                      setWorkspaceImportResultDialog({
                        open: true,
                        title: '导入失败',
                        message: `保存工作空间失败：${errorMessage}`,
                      })
                    } else {
                      setModalNoticeDialog({ open: true, title: '保存失败', message: `保存工作空间失败：${errorMessage}` })
                    }
                  } finally {
                    setWorkspaceImporting(false)
                  }
                }}
              >
                {workspaceImporting ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Spinner size="tiny" />
                    导入中...
                  </span>
                ) : '确定'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={workspaceDeleteDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            closeWorkspaceDeleteDialog()
          }
        }}
      >
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>删除工作空间</DialogTitle>
            <DialogContent>
              <div className="dialog-grid dialog-grid-single">
                <Body1>确认删除工作空间“{workspaceDeleteTarget?.name || ''}”吗？</Body1>
                <Checkbox
                  checked={deleteWorkspaceLocalFiles}
                  label="删除本地磁盘文件（包含目录下所有文件）"
                  onChange={(_, data) => setDeleteWorkspaceLocalFiles(Boolean(data.checked))}
                />
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeWorkspaceDeleteDialog}>取消</Button>
              <Button appearance="primary" onClick={confirmDeleteWorkspace}>删除</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={workspaceLimitDialogOpen} onOpenChange={(_, data) => setWorkspaceLimitDialogOpen(data.open)}>
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>工作空间容量已满</DialogTitle>
            <DialogContent>
              <Body1>{workspaceLimitMessage}</Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setWorkspaceLimitDialogOpen(false)}>我知道了</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={workspaceImportResultDialog.open}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setWorkspaceImportResultDialog((current) => ({ ...current, open: false }))
          }
        }}
      >
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>{workspaceImportResultDialog.title || '导入结果'}</DialogTitle>
            <DialogContent>
              <Body1>{workspaceImportResultDialog.message}</Body1>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                onClick={() => setWorkspaceImportResultDialog((current) => ({ ...current, open: false }))}
              >
                我知道了
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={modalNoticeDialog.open}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setModalNoticeDialog((current) => ({ ...current, open: false }))
          }
        }}
      >
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>{modalNoticeDialog.title || '提示'}</DialogTitle>
            <DialogContent>
              <Body1>{modalNoticeDialog.message}</Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setModalNoticeDialog((current) => ({ ...current, open: false }))}>我知道了</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={pushDialogOpen} onOpenChange={(_, data) => setPushDialogOpen(data.open)}>
        <DialogSurface className="dialog-surface">
          <DialogBody>
            <DialogTitle>推送预览</DialogTitle>
            <DialogContent>
              <div className="dialog-grid dialog-grid-single">
                <Caption1>分支：{pushPreview.branch || 'main'}</Caption1>
                <Caption1>远端：{pushPreview.remote || '-'}</Caption1>
                <div className="workspace-push-list">
                  {(pushPreview.changes || []).map((item) => (
                    <label key={`${item.status}-${item.path}`} className="workspace-push-item">
                      <input
                        type="checkbox"
                        checked={item.selected !== false}
                        onChange={(event) => {
                          const checked = event.target.checked
                          setPushPreview((current) => ({
                            ...current,
                            changes: (current.changes || []).map((row) => (row.path === item.path ? { ...row, selected: Boolean(checked) } : row)),
                          }))
                        }}
                      />
                      <Badge appearance={item.status === 'added' ? 'filled' : item.status === 'deleted' ? 'outline' : 'tint'}>
                        {item.status === 'added' ? '新增' : item.status === 'deleted' ? '删除' : '更新'}
                      </Badge>
                      <span className="workspace-push-resource">{item.resource}</span>
                      <Tooltip content={item.path} relationship="label">
                        <code className="workspace-push-path">{item.path}</code>
                      </Tooltip>
                    </label>
                  ))}
                  {!(pushPreview.changes || []).length && <Caption1>没有可推送的变更。</Caption1>}
                </div>
                <Field label="备注（版本信息）">
                  <Textarea value={pushNote} onChange={(_, data) => setPushNote(data.value)} placeholder="例如：feat: 同步 MCP 服务配置" />
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setPushDialogOpen(false)} disabled={Boolean(pushingWorkspaceId)}>取消</Button>
              <Button appearance="primary" onClick={submitPushWorkspace} disabled={Boolean(pushingWorkspaceId) || !(pushPreview.changes || []).some((item) => item.selected !== false)}>
                {pushingWorkspaceId ? '推送中…' : '推送'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={serverDialogOpen} onOpenChange={(_, data) => setServerDialogOpen(data.open)}>
        <DialogSurface className="dialog-surface">
          <DialogBody>
            <DialogTitle>MCP 服务器配置</DialogTitle>
            <DialogContent>
              <div className="dialog-grid">
                <Field label="名称"><Input value={serverDraft.name} onChange={(_, data) => setServerDraft((current) => ({ ...current, name: data.value }))} /></Field>
                <Field label="传输协议">
                  <Dropdown selectedOptions={[serverDraft.transport]} value={serverDraft.transport} onOptionSelect={(_, data) => setServerDraft((current) => ({ ...current, transport: data.optionValue }))}>
                    <Option value={transports.stdio}>stdio</Option>
                    <Option value={transports.sse}>sse</Option>
                    <Option value={transports.streamableHttp}>streamable-http</Option>
                  </Dropdown>
                </Field>
                {serverDraft.transport === transports.stdio ? (
                  <>
                    <Field label="命令"><Input value={serverDraft.command} onChange={(_, data) => setServerDraft((current) => ({ ...current, command: data.value }))} /></Field>
                    <Field label="参数（每行一个）"><Textarea value={Array.isArray(serverDraft.args) ? serverDraft.args.join('\n') : serverDraft.args} onChange={(_, data) => setServerDraft((current) => ({ ...current, args: data.value }))} /></Field>
                    <Field label="工作目录"><Input value={serverDraft.cwd} onChange={(_, data) => setServerDraft((current) => ({ ...current, cwd: data.value }))} /></Field>
                  </>
                ) : (
                  <Field label="端点地址"><Input value={serverDraft.endpoint} onChange={(_, data) => setServerDraft((current) => ({ ...current, endpoint: data.value }))} /></Field>
                )}
                <Field label="超时时间 (ms)"><Input type="number" value={String(serverDraft.timeoutMs || 30000)} onChange={(_, data) => setServerDraft((current) => ({ ...current, timeoutMs: Number(data.value || 30000) }))} /></Field>
                <Field label="启用状态"><Switch checked={!serverDraft.disabled} label={serverDraft.disabled ? '已禁用' : '已启用'} onChange={(_, data) => setServerDraft((current) => ({ ...current, disabled: !data.checked }))} /></Field>
              </div>

              <Divider />
              <div className="server-kv-block">
                <KeyValueEditor title="请求头" rows={serverDraft.headers} onChange={(rows) => setServerDraft((current) => ({ ...current, headers: rows }))} />
              </div>
              {serverDraft.transport === transports.stdio && (
                <div className="server-kv-block">
                  <KeyValueEditor title="环境变量" rows={serverDraft.env} onChange={(rows) => setServerDraft((current) => ({ ...current, env: rows }))} />
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setServerDialogOpen(false)}>取消</Button>
              <Button appearance="primary" onClick={saveServerDraft}>保存</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={closeConfirmDialog.open} onOpenChange={(_, data) => { if (!data.open) { dismissCloseConfirm() } }}>
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>关闭确认</DialogTitle>
            <DialogContent>{closeConfirmDialog.message || '存在未保存改动，是否继续关闭？'}</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={dismissCloseConfirm}>取消</Button>
              <Button appearance="primary" onClick={confirmSaveAndClose} disabled={!closeConfirmDialog.canSaveAndClose}>保存后关闭</Button>
              <Button appearance="primary" className="close-confirm-force-button" onClick={confirmClose}>直接关闭</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={collectionSaveDialogOpen} onOpenChange={(_, data) => {
        setCollectionSaveDialogOpen(data.open)
        if (!data.open) {
          setCollectionFolderKeyword('')
          setCollectionSaveSource(null)
          collectionSaveAfterActionRef.current = null
        }
      }}>
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>保存到收藏夹</DialogTitle>
            <DialogContent>
              <div className="dialog-grid dialog-grid-single">
                <Field label="名称">
                  <Input value={collectionSaveDraft.name} onChange={(_, data) => setCollectionSaveDraft((current) => ({ ...current, name: data.value }))} />
                </Field>
                <Field label="保存位置">
                  <Combobox
                    freeform
                    selectedOptions={[]}
                    value={collectionFolderKeyword}
                    placeholder="输入关键字搜索目录"
                    onChange={(event, data) => {
                      const nextValue = data?.value ?? event?.target?.value ?? ''
                      setCollectionFolderKeyword(nextValue)
                    }}
                    onOptionSelect={(_, data) => {
                      const folderId = data.optionValue || collectionRootValue
                      setCollectionSaveDraft((current) => ({ ...current, folderId }))
                      const selectedFolder = collectionFolderOptions.find((folder) => folder.id === folderId)
                      setCollectionFolderKeyword(selectedFolder ? selectedFolder.name : '收藏集根目录')
                    }}
                  >
                    {showCollectionRootOption && (
                      <Option value={collectionRootValue} text="收藏集根目录">收藏集根目录</Option>
                    )}
                    {filteredCollectionFolderOptions.map((folder) => (
                      <Option key={folder.id} value={folder.id} text={folder.searchText}>
                        {folder.label}
                      </Option>
                    ))}
                    {!showCollectionRootOption && filteredCollectionFolderOptions.length === 0 && (
                      <Option disabled value="__no_match__" text="无匹配目录">无匹配目录</Option>
                    )}
                  </Combobox>
                  <Caption1>当前保存到：{describeCollectionFolder(collectionFolderOptions, collectionSaveDraft.folderId)}</Caption1>
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setCollectionSaveDialogOpen(false)}>取消</Button>
              <Button appearance="primary" onClick={saveCurrentToCollection}>保存</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={cookieDialogOpen}
        onOpenChange={(_, data) => {
          setCookieDialogOpen(data.open)
          if (!data.open) {
            setActiveCookieEditor(null)
          }
        }}
      >
        <DialogSurface className="dialog-surface">
          <DialogBody>
            <DialogTitle>修改 Cookies</DialogTitle>
            <DialogContent>
              <div className="cookie-toolbar">
                <Input
                  value={cookieHostInput}
                  onChange={(_, data) => setCookieHostInput(data.value)}
                  placeholder="输入 Host，例如 www.baidu.com"
                />
                <Button appearance="primary" onClick={addCookieScopeCard}>添加</Button>
              </div>

              <div className="cookie-scope-list">
                {!cookieScopesDraft.length && <EmptyState text="暂无 Host Cookie 卡片，请先添加 Host。" />}
                {cookieScopesDraft.map((scope) => {
                  const cookies = scope.cookies || []
                  return (
                    <div className="cookie-scope-card" key={scope.id}>
                      <div className="cookie-scope-title">{`Host（${scope.host || '未命名'}） ${cookies.length}个Cookies`}</div>
                      <div className="cookie-tags-wrap">
                        {cookies.map((cookie) => {
                          const active = activeCookieEditor?.scopeID === scope.id && activeCookieEditor?.cookieID === cookie.id
                          return (
                            <button
                              key={cookie.id}
                              className={`cookie-tag ${active ? 'active' : ''}`}
                              onClick={() => activateCookieEditor(scope.id, cookie.id)}
                              type="button"
                            >
                              <span>{cookie.name || '(empty)'}</span>
                              <span
                                className="cookie-tag-close"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  removeCookieTag(scope.id, cookie.id)
                                }}
                              >
                                ×
                              </span>
                            </button>
                          )
                        })}
                        <Button size="small" appearance="subtle" onClick={() => addCookieTag(scope.id)}>添加Cookie</Button>
                      </div>
                      {activeCookieEditor?.scopeID === scope.id && (
                        <div className="cookie-editor-box">
                          <Textarea
                            resize="vertical"
                            value={activeCookieEditor.text}
                            onChange={(_, data) => setActiveCookieEditor((previous) => ({ ...previous, text: data.value }))}
                            placeholder="name=value"
                          />
                          <div className="cookie-editor-actions">
                            <Button appearance="secondary" onClick={() => setActiveCookieEditor(null)}>取消</Button>
                            <Button appearance="primary" onClick={saveActiveCookieEditor}>保存</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setCookieDialogOpen(false)}>关闭</Button>
              <Button appearance="primary" onClick={saveCookieDialog}>保存</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!serverDeleteTarget} onOpenChange={(_, data) => { if (!data.open) { setServerDeleteTarget(null) } }}>
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>确认删除 MCP 服务器</DialogTitle>
            <DialogContent>
              <Body1>{`确认删除 MCP 服务器“${serverDeleteTarget?.name || '未命名服务器'}”吗？`}</Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setServerDeleteTarget(null)}>取消</Button>
              <Button appearance="primary" onClick={confirmDeleteServer}>删除</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={(_, data) => setRenameDialogOpen(data.open)}>
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>重命名</DialogTitle>
            <DialogContent>
              <Field label="名称">
                <Input value={renameDraft} onChange={(_, data) => setRenameDraft(data.value)} />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setRenameDialogOpen(false)}>取消</Button>
              <Button appearance="primary" onClick={confirmRenameCollectionNode}>确定</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={(_, data) => { setDeleteDialogOpen(data.open) }}>
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>{deleteTarget?.type === 'folder' ? '确认删除文件夹' : '确认删除收藏'}</DialogTitle>
            <DialogContent>
              <Body1>
                {deleteTarget?.type === 'folder'
                  ? `确认删除文件夹“${deleteTarget?.name || ''}”及其全部内容吗？`
                  : `确认删除收藏“${deleteTarget?.name || ''}”吗？`}
              </Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => { setDeleteDialogOpen(false) }}>取消</Button>
              <Button appearance="primary" onClick={confirmDeleteCollectionEntry}>删除</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={serverRefreshErrorOpen} onOpenChange={(_, data) => { if (!data.open) { setServerRefreshErrorOpen(false) } }}>
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>{serverRefreshError?.title || '刷新 MCP 工具失败'}</DialogTitle>
            <DialogContent>
              <Body1>{serverRefreshError?.message || '未知错误'}</Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setServerRefreshErrorOpen(false)}>知道了</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!fatalErrorDialog} onOpenChange={(_, data) => { if (!data.open) { setFatalErrorDialog('') } }}>
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>发生严重错误</DialogTitle>
            <DialogContent>
              <Body1>{fatalErrorDialog || '未知错误'}</Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setFatalErrorDialog('')}>关闭</Button>
              <Button appearance="primary" onClick={() => window.location.reload()}>重新加载</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!historyDeleteDialog} onOpenChange={(_, data) => { if (!data.open) { setHistoryDeleteDialog(null) } }}>
        <DialogSurface className="dialog-surface dialog-surface-compact">
          <DialogBody>
            <DialogTitle>{describeHistoryDeleteTitle(historyDeleteDialog)}</DialogTitle>
            <DialogContent>
              <Body1>{describeHistoryDeleteBody(historyDeleteDialog)}</Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setHistoryDeleteDialog(null)}>取消</Button>
              <Button appearance="primary" onClick={confirmDeleteHistory}>删除</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {collectionContextMenu && (
        <div className="collection-context-menu" onContextMenu={(event) => event.preventDefault()} style={{ left: collectionContextMenu.x, top: collectionContextMenu.y }}>
          <button className="collection-context-menu-item" onClick={() => openRenameDialog(collectionContextMenu.node)}>
            重命名
          </button>
          {collectionContextMenu.node.type === 'folder' && (
            <button className="collection-context-menu-item" onClick={() => addCollectionFolder(collectionContextMenu.node.id)}>
              新建子文件夹
            </button>
          )}
          <button className="collection-context-menu-item danger" onClick={() => deleteCollectionEntry(collectionContextMenu.node)}>
            {collectionContextMenu.node.type === 'folder' ? '删除文件夹' : '删除收藏'}
          </button>
        </div>
      )}

      {historyContextMenu && (
        <div className="collection-context-menu history-context-menu" onContextMenu={(event) => event.preventDefault()} style={{ left: historyContextMenu.x, top: historyContextMenu.y }}>
          {historyContextMenu.target.type === 'item' && (
            <button className="collection-context-menu-item" onClick={() => addHistoryItemToCollection(historyContextMenu.target.item)}>
              添加到收藏
            </button>
          )}
          <button className="collection-context-menu-item danger" onClick={() => openHistoryDeleteDialog(historyContextMenu.target)}>
            删除
          </button>
        </div>
      )}

      {tabContextMenu && (
        <div className="collection-context-menu tab-context-menu" onContextMenu={(event) => event.preventDefault()} style={{ left: tabContextMenu.x, top: tabContextMenu.y }}>
          <button className="collection-context-menu-item" onClick={() => runTabMenuAction('new')}>新请求</button>
          <button className="collection-context-menu-item" onClick={() => runTabMenuAction('duplicate')}>复制请求</button>
          <div className="tab-context-divider" />
          <button className="collection-context-menu-item" onClick={() => runTabMenuAction('close')}>关闭 Tab</button>
          <button className="collection-context-menu-item" onClick={() => runTabMenuAction('force-close')}>强制关闭 Tab</button>
          <button className="collection-context-menu-item" onClick={() => runTabMenuAction('close-others')}>关闭其他 Tab</button>
          <button className="collection-context-menu-item" onClick={() => runTabMenuAction('close-all')}>关闭所有 Tab</button>
        </div>
      )}

      <Dialog open={importDialogOpen} onOpenChange={(_, data) => { setImportDialogOpen(data.open); if (!data.open) { setImportError('') } }}>
        <DialogSurface className="dialog-surface">
          <DialogBody>
            <DialogTitle>导入 MCP 服务器</DialogTitle>
            <DialogContent>
              <Field label="粘贴 MCP JSON" validationMessage={importError || undefined} validationState={importError ? 'error' : undefined}>
                <Textarea resize="vertical" className="import-textarea" value={importText} onChange={(_, data) => { setImportText(data.value); if (importError) { setImportError('') } }} />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => { setImportDialogOpen(false); setImportError('') }}>取消</Button>
              <Button appearance="primary" onClick={importServers}>导入</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!resourceReader} onOpenChange={(_, data) => { if (!data.open) { setResourceReader(null) } }}>
        <DialogSurface className="dialog-surface dialog-surface-resource-reader">
          <DialogBody>
            <DialogTitle>{resourceReader?.uri || '资源内容'}</DialogTitle>
            <DialogContent>
              <div className="resource-reader-content">{(resourceReader?.contents || []).join('\n\n') || '资源为空。'}</div>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setResourceReader(null)}>关闭</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {globalLoadingActive && (
        <div className="global-loading-overlay" style={appThemeVars}>
          <Spinner label={globalLoadingMessage} />
        </div>
      )}
      </div>
    </FluentProvider>
  )
}

function useContextMenuDismiss(isOpen, menuSelector, onClose) {
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function closeContextMenu(event) {
      if (event?.target?.closest?.(menuSelector)) {
        return
      }
      onClose()
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('pointerdown', closeContextMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeContextMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen, menuSelector, onClose])
}

function scrollTabs(containerRef, delta) {
  const container = containerRef?.current
  if (!container) {
    return
  }
  container.scrollLeft += delta
}

function CollectionTree({
  nodes,
  dragState,
  expandedFolders,
  renamingFolderId,
  renamingFolderDraft,
  onContextMenu,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onOpenRequest,
  onRenameFolderCancel,
  onRenameFolderChange,
  onRenameFolderConfirm,
  onToggleFolder,
}) {
  if (!nodes.length) {
    return <EmptyState text="已保存的 HTTP 请求和 MCP 工具预设将显示在这里。" />
  }

  return nodes.map((node) => (
    <CollectionTreeNode
      key={node.id}
      depth={0}
      dragState={dragState}
      expandedFolders={expandedFolders}
      node={node}
      renamingFolderId={renamingFolderId}
      renamingFolderDraft={renamingFolderDraft}
      onContextMenu={onContextMenu}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
      onOpenRequest={onOpenRequest}
      onRenameFolderCancel={onRenameFolderCancel}
      onRenameFolderChange={onRenameFolderChange}
      onRenameFolderConfirm={onRenameFolderConfirm}
      onToggleFolder={onToggleFolder}
    />
  ))
}

function CollectionTreeNode({
  depth,
  dragState,
  expandedFolders,
  node,
  renamingFolderId,
  renamingFolderDraft,
  onContextMenu,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onOpenRequest,
  onRenameFolderCancel,
  onRenameFolderChange,
  onRenameFolderConfirm,
  onToggleFolder,
}) {
  const isFolder = node.type === 'folder'
  const isRenamingFolder = isFolder && renamingFolderId === node.id
  const expanded = isFolder ? expandedFolders[node.id] !== false : false
  const dragClassName =
    dragState.targetId === node.id
      ? dragState.position === 'inside'
        ? 'drop-inside'
        : dragState.position === 'before'
          ? 'drop-before'
          : 'drop-after'
      : ''

  return (
    <div className="collection-tree-node">
      <div
        className={`collection-tree-row ${dragClassName}`.trim()}
        draggable={!isRenamingFolder}
        onContextMenu={(event) => onContextMenu(event, node)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => onDragOver(event, node)}
        onDragStart={() => onDragStart(node.id)}
        onDrop={(event) => onDrop(event, node.id, dragState.position || (isFolder ? 'inside' : 'after'))}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {isFolder ? (
          <button className="collection-toggle" onClick={() => onToggleFolder(node.id)} onContextMenu={(event) => onContextMenu(event, node)} type="button">
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="collection-toggle-spacer" />
        )}

        {isRenamingFolder ? (
          <div className="collection-node-button is-folder" onContextMenu={(event) => onContextMenu(event, node)}>
            <strong className="collection-node-title" style={{ flex: 1 }}>
              <span className="collection-node-icon">{expanded ? <FolderOpenRegular /> : <FolderRegular />}</span>
              <Input
                autoFocus
                size="small"
                value={renamingFolderDraft}
                onChange={(_, data) => onRenameFolderChange(data.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onRenameFolderConfirm()
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onRenameFolderCancel()
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                style={{ flex: 1 }}
              />
            </strong>
            <div style={{ display: 'inline-flex', gap: '4px', marginLeft: '8px' }}>
              <Button size="small" appearance="subtle" icon={<CheckRegular />} onClick={onRenameFolderConfirm} />
              <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={onRenameFolderCancel} />
            </div>
          </div>
        ) : (
          <button
            className={`collection-node-button ${isFolder ? 'is-folder' : 'is-request'}`}
            onContextMenu={(event) => onContextMenu(event, node)}
            title={node.name}
            onClick={() => {
              if (isFolder) {
                onToggleFolder(node.id)
                return
              }

              onOpenRequest(node)
            }}
            type="button"
          >
            <CollectionNodeTitle node={node} isFolder={isFolder} expanded={expanded} />
          </button>
        )}
      </div>

      {isFolder && expanded && (
        <div className="collection-folder-children">
          {node.children?.length ? (
            node.children.map((child) => (
              <CollectionTreeNode
                key={child.id}
                depth={depth + 1}
                dragState={dragState}
                expandedFolders={expandedFolders}
                node={child}
                renamingFolderId={renamingFolderId}
                renamingFolderDraft={renamingFolderDraft}
                onContextMenu={onContextMenu}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onOpenRequest={onOpenRequest}
                onRenameFolderCancel={onRenameFolderCancel}
                onRenameFolderChange={onRenameFolderChange}
                onRenameFolderConfirm={onRenameFolderConfirm}
                onToggleFolder={onToggleFolder}
              />
            ))
          ) : (
            <div className="collection-folder-empty">空文件夹</div>
          )}
        </div>
      )}
    </div>
  )
}

function CollectionNodeTitle({ node, isFolder, expanded }) {
  if (isFolder) {
    return (
      <strong className="collection-node-title">
        <span className="collection-node-icon">{expanded ? <FolderOpenRegular /> : <FolderRegular />}</span>
        <span>{node.name}</span>
      </strong>
    )
  }

  const mode = node.request?.mode || modes.http
  const accent = mode === modes.http
    ? String(node.request?.http?.method || 'HTTP').toUpperCase()
    : 'MCP'
  return (
    <strong className="collection-node-title">
      <span className="collection-node-icon"><DocumentRegular /></span>
      <span className="history-title-accent">{accent}</span>
      <span>{node.name}</span>
    </strong>
  )
}

function HttpAuthEditor({ auth, onChange }) {
  const authTypeLabels = {
    none: '无认证',
    basic: 'Basic 认证',
    bearer: 'Bearer Token',
    apiKey: 'API Key',
  }

  return (
    <div className="http-auth-layout">
      <aside className="http-auth-sidebar">
        <Field label="Type">
          <Dropdown selectedOptions={[auth.type]} value={authTypeLabels[auth.type] || authTypeLabels.none} onOptionSelect={(_, data) => onChange('type', data.optionValue)}>
            <Option value="none">无认证</Option>
            <Option value="basic">Basic 认证</Option>
            <Option value="bearer">Bearer Token</Option>
            <Option value="apiKey">API Key</Option>
          </Dropdown>
        </Field>
      </aside>

      <div className="http-auth-config">
        {auth.type === 'none' && <Caption1><div className="table-empty-state">本次请求将不会使用任何认证</div></Caption1>}
        {auth.type === 'basic' && (
          <>
		  <div className="http-auth-fields">
            <Field label="用户名"><Input value={auth.username} onChange={(_, data) => onChange('username', data.value)} /></Field>
          </div>
		  <div className="http-auth-fields">
            <Field label="密码"><Input value={auth.password} type="password" onChange={(_, data) => onChange('password', data.value)} /></Field>
          </div>
		  </>
        )}
        {auth.type === 'bearer' && (
          <div className="http-auth-fields">
            <Field label="Bearer Token"><Input value={auth.token} onChange={(_, data) => onChange('token', data.value)} /></Field>
          </div>
        )}
        {auth.type === 'apiKey' && (
		<>
          <div className="http-auth-fields">
            <Field label="键"><Input value={auth.apiKeyKey} onChange={(_, data) => onChange('apiKeyKey', data.value)} /></Field>
		  </div>
		  <div className="http-auth-fields">
            <Field label="值"><Input value={auth.apiKeyValue} onChange={(_, data) => onChange('apiKeyValue', data.value)} /></Field>
          </div>
		  <div className="http-auth-fields">
		    <Field label="添加到">
              <RadioGroup layout="horizontal" value={auth.apiKeyIn || 'header'} onChange={(_, data) => onChange('apiKeyIn', data.value)}>
                <Radio value="header" label="Http头" />
                <Radio value="query" label="请求参数" />
              </RadioGroup>
            </Field>
		  </div>
		 </>
        )}
      </div>
    </div>
  )
}

function HttpBodyEditor({ body, onChange, editorSettings }) {
  const mode = httpBodyModes.includes(body.mode) ? body.mode : 'none'
  const rawType = normalizeRawType(body.rawType)
  const rawEditorRef = useRef(null)

  async function handleBinaryFile(file) {
    const payload = await readFilePayload(file)
    onChange('binaryName', payload.fileName)
    onChange('binaryFile', payload.filePath)
    onChange('binaryBase64', payload.fileBase64)
    if (payload.contentType) {
      onChange('contentType', payload.contentType)
    }
  }

  function handleModeChange(_, data) {
    const nextMode = data.value
    onChange('mode', nextMode)
    if (nextMode === 'raw') {
      onChange('rawType', rawType)
      onChange('contentType', rawTypeToContentType(rawType))
      return
    }
    if (nextMode === 'x-www-form-urlencoded') {
      onChange('contentType', 'application/x-www-form-urlencoded')
    }
  }

  function handleRawTypeChange(_, data) {
    const nextRawType = normalizeRawType(data.optionValue)
    onChange('rawType', nextRawType)
    onChange('contentType', rawTypeToContentType(nextRawType))
  }

  function handleRawFormat() {
    rawEditorRef.current?.getAction('editor.action.formatDocument')?.run()
  }

  return (
    <div className="postman-body-editor">
      <div className="postman-body-topbar">
        <RadioGroup className="postman-body-mode-group" layout="horizontal" value={mode} onChange={handleModeChange}>
          {httpBodyModes.map((item) => <Radio key={item} value={item} label={httpBodyModeLabels[item]} />)}
        </RadioGroup>

        {mode === 'raw' && (
          <div className="raw-body-toolbar">
            <Dropdown selectedOptions={[rawType]} value={rawTypeLabels[rawType]} onOptionSelect={handleRawTypeChange}>
              {rawTypeOptions.map((item) => <Option key={item} value={item}>{rawTypeLabels[item]}</Option>)}
            </Dropdown>
            {rawType !== 'text' && <Button onClick={handleRawFormat}>格式化</Button>}
          </div>
        )}
      </div>

      <div className="postman-body-content">
        {mode === 'none' && (
          <div className="body-empty-state-card">
            这次请求将不带有请求体
          </div>
        )}

        {mode === 'form-data' && (
          <FormDataBodyTable rows={body.formData} onChange={(rows) => onChange('formData', rows)} />
        )}

        {mode === 'x-www-form-urlencoded' && (
          <UrlEncodedBodyTable rows={body.urlEncoded} onChange={(rows) => onChange('urlEncoded', rows)} />
        )}

        {mode === 'raw' && (
          <RawBodyEditor
            rawType={rawType}
            content={body.raw}
            onContentChange={(value) => onChange('raw', value)}
            editorRef={rawEditorRef}
            editorSettings={editorSettings}
          />
        )}

        {mode === 'binary' && (
          <BinaryBodyPicker
            fileName={body.binaryName}
            filePath={body.binaryFile}
            onSelectFile={handleBinaryFile}
            onClear={() => {
              onChange('binaryName', '')
              onChange('binaryFile', '')
              onChange('binaryBase64', '')
            }}
          />
        )}
      </div>
    </div>
  )
}

function FormDataBodyTable({ rows, onChange }) {
  const safeRows = (rows || []).map(normalizeFormDataRow)

  function updateRows(nextRows) {
    onChange(nextRows)
  }

  async function handleFileSelect(index, file) {
    const payload = await readFilePayload(file)
    updateRows(updateArrayRow(safeRows, index, {
      valueType: 'file',
      value: '',
      fileName: payload.fileName,
      filePath: payload.filePath,
      fileBase64: payload.fileBase64,
    }))
  }

  return (
    <div className="body-table-shell">
      <div className="editor-section-header">
        <strong>表单数据</strong>
        <Button size="small" onClick={() => updateRows([...safeRows, newFormDataPair()])}>添加行</Button>
      </div>
      <div className="body-table-grid body-table-head">
        <span>启用</span>
        <span>Key</span>
        <span>Value</span>
        <span />
      </div>
      {!safeRows.length && <div className="table-empty-state">空表格，点击添加行按钮以新增数据。</div>}
      {!!safeRows.length && (
        <div className="body-table-rows">
          {safeRows.map((row, index) => (
            <div className="body-table-grid" key={row.id || index}>
              <input type="checkbox" checked={row.enabled} onChange={(event) => updateRows(updateArrayRow(safeRows, index, { enabled: event.target.checked }))} />
              <div className="body-key-cell">
                <Input value={row.key} placeholder="Key" onChange={(_, data) => updateRows(updateArrayRow(safeRows, index, { key: data.value }))} />
                <Dropdown
                  className="form-data-type-dropdown"
                  selectedOptions={[row.valueType || 'text']}
                  value={row.valueType === 'file' ? '文件' : '文本'}
                  onOptionSelect={(_, data) => {
                    const nextType = data.optionValue === 'file' ? 'file' : 'text'
                    updateRows(updateArrayRow(safeRows, index, {
                      valueType: nextType,
                      value: nextType === 'file' ? '' : row.value,
                      fileName: nextType === 'file' ? row.fileName : '',
                      filePath: nextType === 'file' ? row.filePath : '',
                      fileBase64: nextType === 'file' ? row.fileBase64 : '',
                    }))
                  }}
                >
                  <Option value="text">文本</Option>
                  <Option value="file">文件</Option>
                </Dropdown>
              </div>

              {row.valueType === 'file' ? (
                <BinaryBodyPicker
                  compact
                  fileName={row.fileName}
                  filePath={row.filePath}
                  onSelectFile={(file) => handleFileSelect(index, file)}
                  onClear={() => updateRows(updateArrayRow(safeRows, index, { fileName: '', filePath: '', fileBase64: '' }))}
                />
              ) : (
                <Input value={row.value} placeholder="Value" onChange={(_, data) => updateRows(updateArrayRow(safeRows, index, { value: data.value }))} />
              )}
              <Button appearance="subtle" icon={<DeleteRegular />} onClick={() => updateRows(safeRows.filter((item) => item.id !== row.id))} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UrlEncodedBodyTable({ rows, onChange }) {
  const safeRows = (rows || []).map((item) => ({ ...newPair(), ...item }))

  function updateRows(nextRows) {
    onChange(nextRows)
  }

  return (
    <div className="body-table-shell">
      <div className="editor-section-header">
        <strong>x-www-form-urlencoded</strong>
        <Button size="small" onClick={() => updateRows([...safeRows, newPair()])}>添加行</Button>
      </div>
      <div className="body-table-grid body-table-head">
        <span>启用</span>
        <span>Key</span>
        <span>Value</span>
        <span />
      </div>
      {!safeRows.length && <div className="table-empty-state">空表格，点击添加行按钮以新增数据。</div>}
      {!!safeRows.length && (
        <div className="body-table-rows">
          {safeRows.map((row, index) => (
            <div className="body-table-grid" key={row.id || index}>
              <input type="checkbox" checked={row.enabled} onChange={(event) => updateRows(updateArrayRow(safeRows, index, { enabled: event.target.checked }))} />
              <Input value={row.key} placeholder="Key" onChange={(_, data) => updateRows(updateArrayRow(safeRows, index, { key: data.value }))} />
              <Input value={row.value} placeholder="Value" onChange={(_, data) => updateRows(updateArrayRow(safeRows, index, { value: data.value }))} />
              <Button appearance="subtle" icon={<DeleteRegular />} onClick={() => updateRows(safeRows.filter((item) => item.id !== row.id))} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RawBodyEditor({ rawType, content, onContentChange, editorRef, editorSettings }) {
  const [diagnostics, setDiagnostics] = useState([])
  const language = rawTypeLanguageMap[rawType] || 'plaintext'

  return (
    <div className="raw-body-editor-shell">
      <div className="raw-editor-host">
        <Editor
          height="280px"
          language={language}
          theme={resolveEditorTheme(editorSettings?.themeMode)}
          value={content}
          onChange={(value) => onContentChange(value || '')}
          onValidate={(markers) => setDiagnostics(markers || [])}
          onMount={(editor) => {
            editorRef.current = editor
            disableMonacoFindTooltips(editor)
          }}
          options={buildEditorOptions(editorSettings)}
        />
      </div>
      <Caption1 className={diagnostics.length ? 'raw-diagnostics-error' : 'raw-diagnostics-ok'}>
        {diagnostics.length ? `语法检查发现 ${diagnostics.length} 个问题` : '语法检查通过'}
      </Caption1>
    </div>
  )
}

function BinaryBodyPicker({ fileName, filePath, onSelectFile, onClear, compact = false }) {
  const fileInputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const title = fileName || filePath || '拖动文件到这里，或点击选择文件'
  const fileIcon = resolveFileDisplayIcon(fileName, filePath)

  function pickFile() {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    fileInputRef.current?.click()
  }

  function handleInputChange(event) {
    const file = event.target.files?.[0]
    if (file) {
      onSelectFile(file)
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) {
      onSelectFile(file)
    }
  }

  return (
    <div
      className={`binary-picker ${compact ? 'binary-picker-compact' : ''} ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input ref={fileInputRef} type="file" className="binary-file-input-hidden" onChange={handleInputChange} />
      <strong className="binary-picker-title">
        <span className="binary-picker-file-icon">{fileIcon}</span>
        <span>{title}</span>
      </strong>
      <div className="binary-picker-actions">
        <Button onClick={pickFile}>选择文件</Button>
        {(fileName || filePath) && <Button appearance="subtle" onClick={onClear}>清除</Button>}
      </div>
    </div>
  )
}

function resolveFileDisplayIcon(fileName, filePath) {
  const source = String(fileName || filePath || '').trim().toLowerCase()
  const extension = source.includes('.') ? source.slice(source.lastIndexOf('.') + 1) : ''

  const codeExtensions = new Set(['json', 'xml', 'yaml', 'yml', 'txt', 'md', 'csv', 'log', 'js', 'mjs', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'less', 'sh', 'bat', 'ps1', 'go', 'java', 'kt', 'py', 'rb', 'php', 'c', 'h', 'cpp', 'hpp', 'rs', 'sql'])
  const mediaExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'mp4', 'mov', 'mkv', 'avi', 'mp3', 'wav', 'ogg', 'flac'])
  const archiveExtensions = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'apk', 'iso', 'dmg', 'exe', 'dll', 'bin'])

  if (codeExtensions.has(extension)) {
    return <CodeRegular />
  }
  if (mediaExtensions.has(extension)) {
    return <StickerRegular />
  }
  if (archiveExtensions.has(extension)) {
    return <StorageRegular />
  }
  return <DocumentRegular />
}

async function readFilePayload(file) {
  const filePath = file.path || file.webkitRelativePath || ''
  return {
    fileName: file.name || '',
    filePath,
    fileBase64: await readFileAsBase64(file),
    contentType: file.type || '',
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const markerIndex = result.indexOf('base64,')
      resolve(markerIndex >= 0 ? result.slice(markerIndex + 7) : '')
    }
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function ResponsePanelHTTP({ response, editorSettings, onOpenResolvedURL }) {
  const [responseTab, setResponseTab] = useState('body')
  const [bodyViewMode, setBodyViewMode] = useState('formatted')
  const [formatType, setFormatType] = useState('json')
  const formattedEditorRef = useRef(null)

  const responseSignature = `${response?.requestedAt || ''}|${response?.contentType || ''}|${response?.statusCode || ''}|${response?.body || ''}`

  useEffect(() => {
    if (!response) {
      return
    }
    setBodyViewMode('formatted')
    setFormatType(inferHttpBodyFormat(response))
  }, [responseSignature])

  if (!response) {
    return (
      <div className="response-shell response-shell-mcp">
        <EmptyState
          text="发送 HTTP 请求后，可在此查看状态码、响应头、响应体及大小信息。"
          icon={<DocumentRegular />}
          fill
        />
      </div>
    )
  }

  const responseBodyText = String(response.error || response.body || '')

  async function copyResponseBody() {
    if (!responseBodyText) {
      return
    }
    try {
      await navigator.clipboard.writeText(responseBodyText)
    } catch {
    }
  }

  function searchResponseBody() {
    if (bodyViewMode === 'formatted' && formattedEditorRef.current) {
      formattedEditorRef.current.getAction('actions.find')?.run()
      return
    }
    const keyword = window.prompt('输入要搜索的内容')
    if (!keyword) {
      return
    }
    window.find(keyword)
  }

  function saveResponseBodyToFile() {
    const extension = inferResponseFileExtension(bodyViewMode, formatType, response)
    const blob = new Blob([responseBodyText], { type: response.contentType || 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `http-response-${Date.now()}.${extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="response-shell">
      <div className="response-head">
        <TabList className="response-tab-list" selectedValue={responseTab} onTabSelect={(_, data) => setResponseTab(data.value)}>
          <Tab value="body">响应体</Tab>
          <Tab value="headers">响应头</Tab>
        </TabList>

        <div className="response-metrics">
          <Badge className={`response-metrics-badge ${response.error ? 'is-error' : 'is-ok'}`} appearance={response.error ? 'filled' : 'tint'}>{response.error ? '错误' : response.statusCode}</Badge>
          <span>{response.durationMs} ms</span>
          <span>{response.sizeBytes} 字节</span>
          <span>{response.contentType || '未知内容类型'}</span>
        </div>
      </div>

      <div className="response-content">
        {responseTab === 'body' && (
          <div className="response-body-panel">
            <div className="response-body-toolbar">
              <div className="response-body-toolbar-left">
                <RadioGroup className="response-body-mode-group" layout="horizontal" value={bodyViewMode} onChange={(_, data) => setBodyViewMode(data.value)}>
                  <Radio value="formatted" label="格式化" />
                  <Radio value="raw" label="原样" />
                  <Radio value="preview" label="预览" />
                </RadioGroup>
                {bodyViewMode === 'formatted' && (
                  <Dropdown className="response-format-dropdown" selectedOptions={[formatType]} value={httpFormatLabel(formatType)} onOptionSelect={(_, data) => setFormatType(data.optionValue)}>
                    <Option value="html">HTML</Option>
                    <Option value="xml">XML</Option>
                    <Option value="json">JSON</Option>
                  </Dropdown>
                )}
              </div>

              <div className="response-body-toolbar-actions">
                <Button appearance="subtle" icon={<CopyRegular />} title="复制" aria-label="复制响应体" onClick={copyResponseBody} />
                <Button appearance="subtle" icon={<SearchRegular />} title="搜索" aria-label="搜索响应体" onClick={searchResponseBody} />
                <Button appearance="subtle" icon={<SaveRegular />} title="保存为文件" aria-label="保存响应体为文件" onClick={saveResponseBodyToFile} />
              </div>
            </div>

            {bodyViewMode === 'formatted' && (
              <div className="response-format-host">
                <Editor
                  height="100%"
                  language={formatType}
                  theme={resolveEditorTheme(editorSettings?.themeMode)}
                  value={formatHttpBody(responseBodyText, formatType)}
                  onMount={(editor) => {
                    formattedEditorRef.current = editor
                    disableMonacoFindTooltips(editor)
                  }}
                  options={{
                    ...buildEditorOptions(editorSettings),
                    readOnly: true,
                  }}
                />
              </div>
            )}

            {bodyViewMode === 'raw' && (
              <Textarea resize="none" className="response-textarea" value={responseBodyText} readOnly />
            )}

            {bodyViewMode === 'preview' && (
              <iframe className="response-preview-frame" title="HTTP 响应预览" srcDoc={responseBodyText} />
            )}
          </div>
        )}
        {responseTab === 'headers' && (
          <div className="response-headers-readonly">
            {(response.headers || []).filter(h => h.key).map((header, index) => (
              <div key={index} className="header-row">
                <strong>{header.key}:</strong>
                <span>{header.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function inferHttpBodyFormat(response) {
  const contentType = String(
    response?.contentType
      || (response?.headers || []).find((item) => String(item?.key || '').toLowerCase() === 'content-type')?.value
      || '',
  ).toLowerCase()
  const body = String(response?.body || '').trim()

  if (contentType.includes('json')) {
    return 'json'
  }
  if (contentType.includes('xml')) {
    return 'xml'
  }
  if (contentType.includes('html')) {
    return 'html'
  }
  if (body.startsWith('{') || body.startsWith('[')) {
    return 'json'
  }
  if (body.startsWith('<?xml')) {
    return 'xml'
  }
  if (body.startsWith('<')) {
    return 'html'
  }
  return 'json'
}

function httpFormatLabel(type) {
  if (type === 'html') {
    return 'HTML'
  }
  if (type === 'xml') {
    return 'XML'
  }
  return 'JSON'
}

function inferResponseFileExtension(mode, formatType, response) {
  if (mode === 'formatted') {
    if (formatType === 'html') {
      return 'html'
    }
    if (formatType === 'xml') {
      return 'xml'
    }
    return 'json'
  }
  const inferred = inferHttpBodyFormat(response)
  if (inferred === 'html') {
    return 'html'
  }
  if (inferred === 'xml') {
    return 'xml'
  }
  if (inferred === 'json') {
    return 'json'
  }
  return 'txt'
}

function formatHttpBody(raw, type) {
  const body = String(raw || '')
  if (!body.trim()) {
    return ''
  }
  if (type === 'json') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      return body
    }
  }
  if (type === 'html' || type === 'xml') {
    return formatMarkup(body)
  }
  return body
}

function formatMarkup(source) {
  const text = String(source || '').replace(/>\s+</g, '><').trim()
  if (!text) {
    return ''
  }
  const tokens = text.replace(/</g, '~::~<').replace(/\s*xmlns:/g, ' xmlns:').split('~::~').filter(Boolean)
  let indent = 0
  const lines = []
  tokens.forEach((token) => {
    const value = token.trim()
    if (!value) {
      return
    }
    if (value.startsWith('</')) {
      indent = Math.max(indent - 1, 0)
    }
    lines.push(`${'  '.repeat(indent)}${value}`)
    if (value.startsWith('<') && !value.startsWith('</') && !value.endsWith('/>') && !value.includes('</')) {
      indent += 1
    }
  })
  return lines.join('\n')
}

function disableMonacoFindTooltips(editor) {
  const root = editor?.getDomNode?.()
  if (!root) {
    return
  }

  const clearTitle = (node) => {
    if (!node || node.nodeType !== 1) {
      return
    }
    if (node.matches?.('.find-widget, .find-widget *')) {
      if (node.hasAttribute('title')) {
        node.removeAttribute('title')
      }
      if (node.hasAttribute('aria-label')) {
        node.removeAttribute('aria-label')
      }
    }
    const descendants = node.querySelectorAll?.('.find-widget [title], .find-widget [aria-label]') || []
    descendants.forEach((item) => {
      item.removeAttribute('title')
      item.removeAttribute('aria-label')
    })
  }

  clearTitle(root)

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
        clearTitle(mutation.target)
        return
      }
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => clearTitle(node))
      }
    })
  })

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label'],
  })

  editor.onDidDispose(() => {
    observer.disconnect()
  })
}

function McpToolEditor({ tool, argumentsJson, onArgumentsChange, editorSettings }) {
  const parsed = parseJson(argumentsJson || '{}', {})
  const properties = tool?.inputSchema?.properties || {}
  const argumentsEditorRef = useRef(null)
  const [argumentsDiagnostics, setArgumentsDiagnostics] = useState([])
  const [payloadCodeMode, setPayloadCodeMode] = useState(false)
  const toolPrompt = (() => {
    if (!tool) {
      return ''
    }
    const description = String(tool.description || '').trim()
    if (description) {
      return description
    }
    const title = String(tool.title || '').trim()
    const name = String(tool.name || '').trim()
    if (!title) {
      return ''
    }
    if (!name) {
      return title
    }
    const lowerTitle = title.toLowerCase()
    const lowerName = name.toLowerCase()
    if (!lowerTitle.startsWith(lowerName)) {
      return title
    }
    return title.slice(name.length).replace(/^[:\-\s]+/, '').trim()
  })()

  useEffect(() => {
    setPayloadCodeMode(false)
  }, [tool?.name])

  return (
    <div className="mcp-tool-editor">
      <div className="editor-section-header">
        <div>
          <strong>{tool ? `工具提示词：${toolPrompt || '暂无'}` : '请选择工具'}</strong>
        </div>
      </div>

      <div className="mcp-payload-shell">
        <div className="mcp-payload-header">
          <strong>负载</strong>
          <Switch checked={payloadCodeMode} label={payloadCodeMode ? '代码模式' : '表单模式'} onChange={(_, data) => setPayloadCodeMode(Boolean(data.checked))} />
        </div>

        {!payloadCodeMode && (
          <div className="mcp-payload-body">
            {!!tool && Object.keys(properties).length > 0 && (
              <div className="dialog-grid mcp-tool-form-grid">
                {Object.entries(properties).map(([key, schema]) => (
                  <SchemaField
                    key={key}
                    name={key}
                    schema={schema}
                    value={parsed[key]}
                    onChange={(value) => {
                      const normalizedValue = normalizeMcpFieldValue(schema, value)
                      onArgumentsChange(prettyJson({ ...parsed, [key]: normalizedValue }))
                    }}
                  />
                ))}
              </div>
            )}
            {!!tool && Object.keys(properties).length === 0 && <EmptyState text="当前工具没有可渲染的表单字段。" />}
          </div>
        )}

        {payloadCodeMode && (
          <div className="mcp-payload-body">
            <div className="raw-body-editor-shell">
              <div className="raw-body-toolbar">
                <Button size="small" onClick={() => argumentsEditorRef.current?.getAction('editor.action.formatDocument')?.run()}>格式化</Button>
              </div>
              <div className="raw-editor-host">
                <Editor
                  height="280px"
                  language="json"
                  theme={resolveEditorTheme(editorSettings?.themeMode)}
                  value={argumentsJson || '{}'}
                  onChange={(value) => onArgumentsChange(value || '')}
                  onValidate={(markers) => setArgumentsDiagnostics(markers || [])}
                  onMount={(editor) => {
                    argumentsEditorRef.current = editor
                    disableMonacoFindTooltips(editor)
                  }}
                  options={buildEditorOptions(editorSettings)}
                />
              </div>
              <Caption1 className={argumentsDiagnostics.length ? 'raw-diagnostics-error' : 'raw-diagnostics-ok'}>
                {argumentsDiagnostics.length ? `语法检查发现 ${argumentsDiagnostics.length} 个问题` : '语法检查通过'}
              </Caption1>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SchemaField({ name, schema = {}, value, onChange }) {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type

  if (schema.enum) {
    return (
      <Field label={schema.title || name} hint={schema.description}>
        <Dropdown selectedOptions={[String(value ?? '')]} value={String(value ?? '')} onOptionSelect={(_, data) => onChange(data.optionValue)}>
          {schema.enum.map((item) => <Option key={item} value={String(item)}>{String(item)}</Option>)}
        </Dropdown>
      </Field>
    )
  }

  if (type === 'boolean') {
    return <Field label={schema.title || name} hint={schema.description}><Switch checked={Boolean(value)} onChange={(_, data) => onChange(Boolean(data.checked))} /></Field>
  }

  if (type === 'number' || type === 'integer') {
    return <Field label={schema.title || name} hint={schema.description}><Input type="number" value={value ?? ''} onChange={(_, data) => onChange(data.value === '' ? undefined : Number(data.value))} /></Field>
  }

  if (type === 'object' || type === 'array') {
    return <Field label={schema.title || name} hint={schema.description}><Textarea resize="vertical" value={prettyJson(value ?? (type === 'array' ? [] : {}))} onChange={(_, data) => onChange(parseJson(data.value, type === 'array' ? [] : {}))} /></Field>
  }

  return <Field label={schema.title || name} hint={schema.description}><Input value={value ?? ''} onChange={(_, data) => onChange(data.value)} /></Field>
}

function normalizeMcpFieldValue(schema = {}, value) {
  if (value === undefined || value === null) {
    return undefined
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  const defaultValue = schema.default

  if (defaultValue !== undefined && isSameValue(value, defaultValue)) {
    return undefined
  }

  if (schema.enum) {
    return value === '' ? undefined : value
  }

  if (type === 'string') {
    return value === '' ? undefined : value
  }

  if (type === 'boolean') {
    if (defaultValue !== undefined) {
      return isSameValue(value, defaultValue) ? undefined : Boolean(value)
    }
    return value ? true : undefined
  }

  if (type === 'number' || type === 'integer') {
    if (value === '' || Number.isNaN(value)) {
      return undefined
    }
    return value
  }

  if (type === 'array') {
    if (!Array.isArray(value)) {
      return undefined
    }
    if (!value.length) {
      return undefined
    }
    return value
  }

  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined
    }
    if (!Object.keys(value).length) {
      return undefined
    }
    return value
  }

  return value
}

function isSameValue(left, right) {
  if (left === right) {
    return true
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function McpPromptExplorer({ prompts, promptName, promptArgs, view, onSelectPrompt, onChangeArgs, onInspect }) {
  if (!prompts.length) {
    return <EmptyState text="该工具不包含提示词。" />
  }

  return (
    <div className="mcp-prompt-explorer">
      <Field label="提示词">
        <Dropdown selectedOptions={[promptName]} value={promptName || '选择一个提示词'} onOptionSelect={(_, data) => onSelectPrompt(data.optionValue)}>
          {prompts.map((prompt) => <Option key={prompt.name} value={prompt.name}>{prompt.title || prompt.name}</Option>)}
        </Dropdown>
      </Field>
      <Field label="提示词参数 JSON">
        <Textarea resize="vertical" className="response-textarea" value={promptArgs || '{}'} onChange={(_, data) => onChangeArgs(data.value)} />
      </Field>
      <Button appearance="primary" onClick={onInspect} disabled={!promptName}>渲染提示词</Button>

      {view && (
        <div className="prompt-view">
          <strong>{view.promptName}</strong>
          <Caption1>{view.description}</Caption1>
          <Textarea className="response-textarea" resize="vertical" value={(view.messages || []).join('\n\n')} readOnly />
        </div>
      )}
    </div>
  )
}

function McpResourceExplorer({ resources, onRead }) {
  if (!resources.length) {
    return <EmptyState text="该工具不包含资源。" />
  }

  return (
    <div className="mcp-resource-explorer">
      <div className="stack-list compact-stack">
        {resources.map((resource) => (
          <div className="list-card" key={`${resource.kind}-${resource.uri || resource.uriTemplate || resource.name}`}>
            <div className="list-card-main">
              <strong>{resource.title || resource.name}</strong>
              <Caption1>{resource.uri || resource.uriTemplate || resource.kind}</Caption1>
            </div>
            {!!resource.uri && <Button size="small" onClick={() => onRead(resource.uri)}>读取</Button>}
          </div>
        ))}
      </div>
    </div>
  )
}

function ResponsePanelMCP({ response, editorSettings }) {
  const [bodyViewMode, setBodyViewMode] = useState('text')
  const formattedEditorRef = useRef(null)

  const responseSignature = `${response?.requestedAt || ''}|${response?.toolName || ''}|${response?.isError ? '1' : '0'}|${response?.error || ''}|${response?.structuredContent || ''}`

  useEffect(() => {
    if (!response) {
      return
    }
    setBodyViewMode('text')
  }, [responseSignature])

  if (!response) {
    return (
      <div className="response-shell response-shell-mcp">
        <EmptyState
          text="运行工具后，可在此查看MCP工具响应"
          icon={<StickerRegular />}
          fill
        />
      </div>
    )
  }

  const responseBodyText = buildMcpResponseText(response)
  const jsonBodyText = buildMcpJSONBody(response, responseBodyText)
  const xmlBodyText = buildMcpXMLBody(responseBodyText)
  const activeBody = bodyViewMode === 'json'
    ? jsonBodyText
    : bodyViewMode === 'xml'
      ? xmlBodyText
      : responseBodyText

  async function copyResponseBody() {
    if (!activeBody) {
      return
    }
    try {
      await navigator.clipboard.writeText(activeBody)
    } catch {
    }
  }

  function searchResponseBody() {
    if ((bodyViewMode === 'json' || bodyViewMode === 'xml') && formattedEditorRef.current) {
      formattedEditorRef.current.getAction('actions.find')?.run()
      return
    }
    const keyword = window.prompt('输入要搜索的内容')
    if (!keyword) {
      return
    }
    window.find(keyword)
  }

  function saveResponseBodyToFile() {
    const extension = bodyViewMode === 'json' ? 'json' : bodyViewMode === 'xml' ? 'xml' : 'txt'
    const mimeType = bodyViewMode === 'json'
      ? 'application/json;charset=utf-8'
      : bodyViewMode === 'xml'
        ? 'application/xml;charset=utf-8'
        : 'text/plain;charset=utf-8'
    const blob = new Blob([activeBody], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mcp-response-${Date.now()}.${extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="response-shell response-shell-mcp">
      <div className="response-head response-head-mcp">
        <div className="response-panel-title">MCP服务响应</div>
        <div className="response-metrics">
          <Badge className={`response-metrics-badge ${response.isError ? 'is-error' : 'is-ok'}`} appearance={response.isError ? 'filled' : 'tint'}>{response.isError ? '错误' : '成功'}</Badge>
          <span>{response.durationMs} ms</span>
          <span>{response.toolName}</span>
        </div>
      </div>

      <div className="response-content">
        <div className="response-body-panel">
          <div className="response-body-toolbar">
            <div className="response-body-toolbar-left">
              <RadioGroup className="response-body-mode-group" layout="horizontal" value={bodyViewMode} onChange={(_, data) => setBodyViewMode(data.value)}>
                <Radio value="text" label="Text" />
                <Radio value="json" label="JSON" />
                <Radio value="xml" label="XML" />
              </RadioGroup>
            </div>

            <div className="response-body-toolbar-actions">
              <Button appearance="subtle" icon={<CopyRegular />} title="复制" aria-label="复制响应体" onClick={copyResponseBody} />
              <Button appearance="subtle" icon={<SearchRegular />} title="搜索" aria-label="搜索响应体" onClick={searchResponseBody} />
              <Button appearance="subtle" icon={<SaveRegular />} title="保存为文件" aria-label="保存响应体为文件" onClick={saveResponseBodyToFile} />
            </div>
          </div>

          {bodyViewMode === 'text' && (
            <Textarea resize="none" className="response-textarea" value={responseBodyText} readOnly />
          )}

          {(bodyViewMode === 'json' || bodyViewMode === 'xml') && (
            <div className="response-format-host">
              <Editor
                height="100%"
                language={bodyViewMode === 'xml' ? 'xml' : 'json'}
                theme={resolveEditorTheme(editorSettings?.themeMode)}
                value={formatHttpBody(bodyViewMode === 'xml' ? xmlBodyText : jsonBodyText, bodyViewMode === 'xml' ? 'xml' : 'json')}
                onMount={(editor) => {
                  formattedEditorRef.current = editor
                  disableMonacoFindTooltips(editor)
                }}
                options={{
                  ...buildEditorOptions(editorSettings),
                  readOnly: true,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function buildMcpResponseText(response) {
  const content = Array.isArray(response?.content) ? response.content : []
  const parts = content
    .map((item) => {
      if (item?.type === 'text') {
        return String(item.text || '')
      }
      if (item?.text) {
        return String(item.text)
      }
      if (item?.json) {
        return String(item.json)
      }
      return ''
    })
    .filter(Boolean)

  if (parts.length) {
    return parts.join('\n\n')
  }
  if (response?.error) {
    return String(response.error)
  }
  if (response?.structuredContent) {
    return String(response.structuredContent)
  }
  return ''
}

function buildMcpJSONBody(response, fallbackText = '') {
  const structured = String(response?.structuredContent || '').trim()
  if (structured && structured !== 'null') {
    return structured
  }

  const content = Array.isArray(response?.content) ? response.content : []
  const jsonItems = content
    .map((item) => String(item?.json || '').trim())
    .filter(Boolean)

  if (jsonItems.length === 1) {
    return jsonItems[0]
  }
  if (jsonItems.length > 1) {
    return `[\n${jsonItems.join(',\n')}\n]`
  }

  const text = String(fallbackText || '').trim()
  if (text.startsWith('{') || text.startsWith('[')) {
    return text
  }

  if (response?.error) {
    return JSON.stringify({ error: response.error }, null, 2)
  }
  return text
}

function buildMcpXMLBody(text) {
  return String(text || '')
}

function HistoryTitle({ item, servers, collections }) {
  const title = formatHistoryTitle(item, servers, collections)
  const accent = historyTitleAccent(item, servers, collections)
  const tail = title.startsWith(accent) ? title.slice(accent.length).trimStart() : title

  if (!accent) {
    return <strong>{title}</strong>
  }

  return (
    <strong>
      <span className="history-title-accent">{accent}</span>
      <span>{tail}</span>
    </strong>
  )
}

function normalizeBootstrap(data) {
  const fallback = createDefaultBootstrap()
  const manager = {
    ...fallback.workspaceManager,
    ...(data?.workspaceManager || {}),
    workspaces: (data?.workspaceManager?.workspaces || fallback.workspaceManager.workspaces).map((workspace) => ({
      ...fallback.workspaceManager.workspaces[0],
      ...workspace,
    })),
  }
  const activeWorkspace = {
    ...fallback.activeWorkspace,
    ...(data?.activeWorkspace || {}),
  }
  return {
    ...fallback,
    ...data,
    workspace: {
      ...fallback.workspace,
      ...(data?.workspace || {}),
      tabs: (data?.workspace?.tabs || fallback.workspace.tabs).map(normalizeTab),
    },
    collections: {
      ...fallback.collections,
      ...(data?.collections || {}),
    },
    mcpServers: normalizeServerStore(data?.mcpServers),
    history: {
      http: { ...fallback.history.http, ...(data?.history?.http || {}) },
      mcp: { ...fallback.history.mcp, ...(data?.history?.mcp || {}) },
    },
    settings: normalizeSettings(data?.settings, fallback.settings),
    workspaceManager: manager,
    activeWorkspace: activeWorkspace,
  }
}

function normalizeSettings(settings, fallback) {
  const merged = {
    ...fallback,
    ...(settings || {}),
  }
  const normalizedThemeColors = []
  if (Array.isArray(merged.themeColors)) {
    const seen = new Set()
    merged.themeColors.forEach((item) => {
      if (typeof item !== 'string') {
        return
      }
      const color = normalizeHexColor(item)
      if (seen.has(color)) {
        return
      }
      seen.add(color)
      normalizedThemeColors.push(color)
    })
  }
  const normalizedThemeColor = normalizeHexColor(merged.themeColor)
  const themeColors = normalizedThemeColors.length ? normalizedThemeColors.slice(0, 24) : [...fallback.themeColors]
  if (!themeColors.includes(normalizedThemeColor)) {
    themeColors.push(normalizedThemeColor)
  }
  const collectionFolderExpanded = {}
  if (merged.collectionFolderExpanded && typeof merged.collectionFolderExpanded === 'object') {
    Object.entries(merged.collectionFolderExpanded).forEach(([workspaceID, folderMap]) => {
      if (!workspaceID || !folderMap || typeof folderMap !== 'object') {
        return
      }
      collectionFolderExpanded[workspaceID] = {}
      Object.entries(folderMap).forEach(([folderID, expanded]) => {
        if (!folderID) {
          return
        }
        collectionFolderExpanded[workspaceID][folderID] = Boolean(expanded)
      })
    })
  }
  return {
    ...merged,
    httpVersion: merged.httpVersion === 'HTTP/2' ? 'HTTP/2' : 'HTTP/1.1',
    requestTimeout: Number(merged.requestTimeout || 0),
    maxResponseSize: Number(merged.maxResponseSize || 0),
    editorFontSize: Math.max(10, Number(merged.editorFontSize || 12)),
    editorIndentCount: Math.max(1, Number(merged.editorIndentCount || 4)),
    editorIndentType: merged.editorIndentType === 'tab' ? 'tab' : 'space',
    themeColor: normalizedThemeColor,
    themeMode: ['light', 'dark', 'system'].includes(merged.themeMode) ? merged.themeMode : 'system',
    themeColors,
    languageDetection: ['Auto', 'zh-CN', 'en-US'].includes(merged.languageDetection) ? merged.languageDetection : 'Auto',
    collectionFolderExpanded,
  }
}

function resolveLanguageDetection(value) {
  if (value === 'zh-CN' || value === 'en-US') {
    return value
  }
  return (navigator.language || 'zh-CN').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function resolveThemeMode(value) {
  if (value === 'light' || value === 'dark') {
    return value
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function hexToRGBA(hexColor, alpha) {
  const source = String(hexColor || '').trim().replace('#', '')
  if (source.length !== 6) {
    return `rgba(15, 108, 189, ${alpha})`
  }
  const r = Number.parseInt(source.slice(0, 2), 16)
  const g = Number.parseInt(source.slice(2, 4), 16)
  const b = Number.parseInt(source.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function buildBrandCSSVars(themeColor) {
  const brand = normalizeHexColor(themeColor)
  return {
    '--brand': brand,
    '--brand-soft': hexToRGBA(brand, 0.16),
    '--brand-border': hexToRGBA(brand, 0.4),
    '--brand-hover': shadeHexColor(brand, -0.08),
    '--brand-pressed': shadeHexColor(brand, -0.16),
    '--brand-subtle': hexToRGBA(brand, 0.1),
    '--brand-contrast': '#ffffff',
  }
}

function buildFluentTheme(mode, themeColor) {
  const brand = normalizeHexColor(themeColor)
  const base = mode === 'dark' ? webDarkTheme : webLightTheme
  const theme = {
    ...base,
    colorBrandBackground: brand,
    colorBrandBackgroundHover: shadeHexColor(brand, -0.08),
    colorBrandBackgroundPressed: shadeHexColor(brand, -0.16),
    colorBrandBackground2: hexToRGBA(brand, mode === 'dark' ? 0.28 : 0.18),
    colorBrandBackgroundInverted: brand,
    colorBrandForeground1: brand,
    colorBrandForeground2: shadeHexColor(brand, -0.08),
    colorBrandForegroundLink: brand,
    colorBrandForegroundLinkHover: shadeHexColor(brand, -0.08),
    colorBrandForegroundLinkPressed: shadeHexColor(brand, -0.16),
    colorBrandStroke1: brand,
    colorCompoundBrandBackground: brand,
    colorCompoundBrandBackgroundHover: shadeHexColor(brand, -0.08),
    colorCompoundBrandBackgroundPressed: shadeHexColor(brand, -0.16),
    colorCompoundBrandStroke: brand,
    colorCompoundBrandStrokeHover: shadeHexColor(brand, -0.08),
    colorCompoundBrandStrokePressed: shadeHexColor(brand, -0.16),
    colorCompoundBrandForeground1: '#ffffff',
  }

  if (mode === 'dark') {
    theme.colorNeutralForeground1 = '#e2e8f0'
    theme.colorNeutralForeground2 = '#cbd5e1'
    theme.colorNeutralForeground3 = '#94a3b8'
    theme.colorNeutralBackground1 = '#0f172a'
    theme.colorNeutralBackground2 = '#111827'
    theme.colorNeutralBackground3 = '#1f2937'
    theme.colorNeutralBackground4 = '#334155'
    theme.colorNeutralStroke1 = '#334155'
  }

  return theme
}

function normalizeHexColor(value) {
  const source = String(value || '').trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(source)) {
    return '#0f6cbd'
  }
  return source.toLowerCase()
}

function shadeHexColor(hexColor, ratio) {
  const value = normalizeHexColor(hexColor)
  const channels = [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)].map((item) => Number.parseInt(item, 16))
  const shaded = channels.map((channel) => {
    const target = ratio < 0 ? 0 : 255
    const delta = Math.round((target - channel) * Math.abs(ratio))
    return clampColor(channel + (ratio < 0 ? -delta : delta))
  })
  return `#${shaded.map((item) => item.toString(16).padStart(2, '0')).join('')}`
}

function clampColor(value) {
  return Math.min(255, Math.max(0, value))
}

function resolveEditorTheme(themeMode) {
  return resolveThemeMode(themeMode) === 'dark' ? 'vs-dark' : 'vs'
}

function buildEditorOptions(settings = {}) {
  const tabSize = Math.max(1, Number(settings.editorIndentCount || 4))
  return {
    automaticLayout: true,
    minimap: { enabled: false },
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    fixedOverflowWidgets: true,
    scrollbar: { alwaysConsumeMouseWheel: false },
    scrollBeyondLastLine: false,
    fontFamily: settings.editorFontFamily || "IBMPlexMono, 'Courier New', monospace",
    fontSize: Math.max(10, Number(settings.editorFontSize || 12)),
    tabSize,
    insertSpaces: settings.editorIndentType !== 'tab',
  }
}

function shouldPromptSaveForTab(tab, collections = []) {
  if (!tab) {
    return false
  }
  if (tab.linkedNodeId) {
    return isCollectionTabDirty(tab, collections)
  }
  return Boolean(tab.dirty)
}

function normalizeServerStore(store) {
  const fallback = createDefaultBootstrap().mcpServers
  return {
    ...fallback,
    ...(store || {}),
    servers: (store?.servers || []).map((server) => ({
      ...createServerDraft(),
      ...server,
      headers: normalizePairs(server.headers),
      env: normalizePairs(server.env),
      toolCache: server.toolCache || [],
      promptCache: server.promptCache || [],
      resourceCache: server.resourceCache || [],
    })),
  }
}

function normalizeTab(tab) {
  const fallback = createWorkspaceTab(tab?.mode)
  return {
    ...fallback,
    ...tab,
    http: {
      ...fallback.http,
      ...(tab?.http || {}),
      query: normalizePairs(tab?.http?.query),
      headers: normalizePairs(tab?.http?.headers),
      auth: normalizeHttpAuth(tab?.http?.auth, fallback.http.auth),
      disabledAutoFields: normalizeAutoFieldList(tab?.http?.disabledAutoFields).filter((item) => !String(item).startsWith('query:')),
      cookieScopes: normalizeCookieScopes(tab?.http?.cookieScopes),
      body: normalizeHttpBody(tab?.http?.body, fallback.http.body),
    },
    mcp: {
      ...fallback.mcp,
      ...(tab?.mcp || {}),
    },
  }
}

function normalizeHttpAuth(auth, fallbackAuth = {}) {
  const merged = {
    ...fallbackAuth,
    ...(auth || {}),
  }
  return {
    ...merged,
    type: ['none', 'basic', 'bearer', 'apiKey'].includes(merged.type) ? merged.type : 'none',
    apiKeyIn: merged.apiKeyIn === 'query' ? 'query' : 'header',
  }
}

function normalizeAutoFieldList(items = []) {
  return [...new Set((items || []).map((item) => normalizeAutoFieldKey(item)).filter(Boolean))]
}

function normalizeCookieScopes(scopes = []) {
  return (scopes || [])
    .map((scope) => ({
      ...newCookieScope(),
      ...scope,
      host: String(scope?.host || '').trim(),
      cookies: normalizeCookieItems(scope?.cookies),
    }))
    .filter((scope) => scope.host)
}

function normalizeCookieItems(items = []) {
  return (items || [])
    .map((item) => ({
      ...newCookieItem(),
      ...item,
      name: String(item?.name || '').trim(),
      value: String(item?.value || ''),
      enabled: item?.enabled !== false,
    }))
    .filter((item) => item.name)
}

function parseCookieDraftText(value) {
  const text = String(value || '').trim()
  const separatorIndex = text.indexOf('=')
  if (separatorIndex <= 0) {
    return null
  }
  const name = text.slice(0, separatorIndex).trim()
  if (!name) {
    return null
  }
  return {
    name,
    value: text.slice(separatorIndex + 1).trim(),
  }
}

function normalizeHttpBody(body, fallbackBody) {
  const merged = {
    ...fallbackBody,
    ...(body || {}),
  }
  const normalizedMode = merged.mode === 'json' ? 'raw' : merged.mode
  const normalizedRawType = merged.mode === 'json' ? 'json' : normalizeRawType(merged.rawType)
  const normalizedContentType = normalizeBodyContentType(normalizedMode, normalizedRawType, merged.contentType)

  return {
    ...merged,
    mode: httpBodyModes.includes(normalizedMode) ? normalizedMode : 'none',
    rawType: normalizedRawType,
    contentType: normalizedContentType,
    formData: normalizeFormDataRows((body?.formData || []).map(normalizeFormDataRow)),
    urlEncoded: normalizePairs(body?.urlEncoded),
  }
}

function normalizeFormDataRow(row = {}) {
  return {
    ...newFormDataPair(),
    ...row,
    valueType: row?.valueType === 'file' ? 'file' : 'text',
  }
}

function normalizePairs(items = []) {
  return (items || [])
    .map((item) => ({
      ...newPair(),
      ...item,
    }))
    .filter((item) => {
      const key = String(item?.key || '').trim()
      const value = String(item?.value || '').trim()
      return key || value
    })
}

function normalizeFormDataRows(items = []) {
  return (items || [])
    .map(normalizeFormDataRow)
    .filter((item) => {
      const key = String(item?.key || '').trim()
      const textValue = String(item?.value || '').trim()
      const fileValue = String(item?.fileName || item?.filePath || '').trim()
      return key || textValue || fileValue
    })
}

function normalizeRawType(rawType) {
  return rawTypeOptions.includes(rawType) ? rawType : 'json'
}

function normalizeBodyContentType(mode, rawType, currentValue = '') {
  if (mode === 'x-www-form-urlencoded') {
    return 'application/x-www-form-urlencoded'
  }
  if (mode !== 'raw') {
    return currentValue || 'application/json'
  }
  const fallback = rawTypeToContentType(rawType)
  return currentValue || fallback
}

function rawTypeToContentType(rawType) {
  switch (rawType) {
    case 'javascript':
      return 'application/javascript'
    case 'json':
      return 'application/json'
    case 'html':
      return 'text/html'
    case 'xml':
      return 'application/xml'
    case 'text':
    default:
      return 'text/plain'
  }
}

function buildEffectiveHttpRequest(http = {}) {
  const normalized = {
    ...http,
    query: normalizePairs(http.query),
    headers: normalizePairs(http.headers),
    disabledAutoFields: normalizeAutoFieldList(http.disabledAutoFields).filter((item) => !String(item).startsWith('query:')),
  }
  return normalized
}

function parseQueryRowsFromURL(urlText = '') {
  const value = String(urlText || '').trim()
  if (!value) {
    return []
  }
  try {
    const parsed = new URL(value)
    const rows = []
    parsed.searchParams.forEach((entryValue, key) => {
      rows.push(newPair(key, entryValue))
    })
    return rows
  } catch {
    return null
  }
}

function syncURLWithQueryRows(currentURL = '', queryRows = [], http = {}) {
  const value = String(currentURL || '').trim()
  if (!value) {
    return currentURL
  }
  try {
    const parsed = new URL(value)
    const params = new URLSearchParams()
    const autoQueryRows = (buildHttpAutoFields(http).query || []).filter((item) => item.enabled)
    autoQueryRows.forEach((row) => {
      const key = String(row?.key || '').trim()
      if (!key) {
        return
      }
      params.set(key, String(row?.value || ''))
    })
    enabledQueryPairs(queryRows).forEach((row) => {
      const key = String(row?.key || '').trim()
      if (!key) {
        return
      }
      params.set(key, String(row?.value || ''))
    })
    parsed.search = params.toString()
    return parsed.toString()
  } catch {
    return currentURL
  }
}

function enabledQueryPairs(rows = []) {
  return normalizePairs(rows).filter((row) => row.enabled !== false && String(row.key || '').trim())
}

function filterOutAutoQueryRows(rows = [], http = {}) {
  const autoQueryRows = (buildHttpAutoFields(http).query || []).filter((item) => item.enabled)
  if (!autoQueryRows.length) {
    return rows
  }
  return rows.filter((row) => !autoQueryRows.some((autoRow) => (
    normalizeAutoFieldKey(row?.key) === normalizeAutoFieldKey(autoRow?.key)
      && String(row?.value || '') === String(autoRow?.value || '')
  )))
}

function buildHttpAutoFields(http = {}) {
  const disabled = new Set(normalizeAutoFieldList(http?.disabledAutoFields))
  const auth = http?.auth || {}
  const rows = {
    headers: [],
    query: [],
  }

  const normalizedAuthType = String(auth.type || 'none')
  if (normalizedAuthType === 'basic') {
    const username = String(auth.username || '').trim()
    const password = String(auth.password || '')
    if (username && password) {
      const value = `Basic ${safeBase64(`${auth.username || ''}:${auth.password || ''}`)}`
      rows.headers.push(createHiddenPair('Authorization', value, 'header:authorization', disabled, { forceEnabled: true, locked: true }))
    }
  }

  if (normalizedAuthType === 'bearer') {
    const token = String(auth.token || '').trim()
    if (token) {
      rows.headers.push(createHiddenPair('Authorization', `Bearer ${token}`, 'header:authorization', disabled, { forceEnabled: true, locked: true }))
    }
  }

  if (normalizedAuthType === 'apiKey') {
    const key = String(auth.apiKeyKey || '').trim()
    const value = String(auth.apiKeyValue || '').trim()
    if (key && value) {
      const autoFieldKey = normalizeAutoFieldKey(key)
      const target = auth.apiKeyIn === 'query' ? 'query' : 'header'
      const id = `${target}:${autoFieldKey}`
      if (target === 'query') {
        rows.query.push(createHiddenPair(key, value, id, disabled, { forceEnabled: true, locked: true }))
      } else {
        rows.headers.push(createHiddenPair(key, value, id, disabled, { forceEnabled: true, locked: true }))
      }
    }
  }

  const bodyMode = http?.body?.mode || 'none'
  if (bodyMode !== 'none' && bodyMode !== '') {
    const rawType = normalizeRawType(http?.body?.rawType)
    const contentTypeValue = normalizeBodyContentType(bodyMode, rawType, http?.body?.contentType)
    if (contentTypeValue) {
      rows.headers.push(createHiddenPair('Content-Type', contentTypeValue, 'header:content-type', disabled))
    }
  }

  return rows
}

function createHiddenPair(key, value, hiddenFieldID, disabledSet, options = {}) {
  const { forceEnabled = false, locked = false } = options
  return {
    ...newPair(key, value),
    hiddenFieldId: hiddenFieldID,
    enabled: forceEnabled ? true : !disabledSet.has(normalizeAutoFieldKey(hiddenFieldID)),
    locked,
  }
}

function normalizeAutoFieldKey(value) {
  return String(value || '').trim().toLowerCase()
}

function safeBase64(value) {
  try {
    const bytes = new TextEncoder().encode(String(value || ''))
    let binary = ''
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return btoa(binary)
  } catch {
    return btoa(String(value || ''))
  }
}

function updateNested(source, path, value) {
  const keys = path.split('.')
  const root = { ...source }
  let cursor = root
  while (keys.length > 1) {
    const key = keys.shift()
    cursor[key] = { ...cursor[key] }
    cursor = cursor[key]
  }
  cursor[keys[0]] = value
  return root
}

function updateArrayRow(rows, index, patch) {
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
}

function isCollectionTabDirty(tab, collections = []) {
  if (!tab?.linkedNodeId) {
    return false
  }

  const linkedNode = findCollectionNode(collections, tab.linkedNodeId)
  if (!linkedNode || linkedNode.type !== 'request') {
    return false
  }

  const normalizedTab = normalizeTab({
    mode: tab.mode,
    http: tab.http,
    mcp: tab.mcp,
  })
  const normalizedNode = normalizeTab({
    mode: linkedNode.request?.mode || modes.http,
    http: linkedNode.request?.http,
    mcp: linkedNode.request?.mcp,
  })

  return !isSameValue(
    {
      mode: normalizedTab.mode,
      http: normalizedTab.http,
      mcp: normalizedTab.mcp,
    },
    {
      mode: normalizedNode.mode,
      http: normalizedNode.http,
      mcp: normalizedNode.mcp,
    },
  )
}

function deriveTabTitle(tab, servers, collections = []) {
  if (tab.linkedNodeId) {
    const linkedNode = findCollectionNode(collections, tab.linkedNodeId)
    if (linkedNode?.type === 'request' && linkedNode.name) {
      return linkedNode.name
    }
  }

  if (tab.mode === modes.http) {
    return tab.http.name || tab.http.url || '新建 HTTP 请求'
  }

  const serverName = servers.find((server) => server.id === tab.mcp.serverId)?.name || 'MCP'
  return tab.mcp.toolName ? `${serverName} / ${tab.mcp.toolName}` : `${serverName} / 工具`
}

function splitLines(value) {
  return value.split('\n').map((entry) => entry.trim()).filter(Boolean)
}

function createServerStatus(state = 'unknown', message = '', toolCount = 0) {
  return {
    state,
    message,
    toolCount,
  }
}

function describeServerStatus(status) {
  switch (status?.state) {
    case 'checking':
      return '检测中'
    case 'error':
      return status.message ? `连接失败: ${status.message}` : '连接失败'
    case 'warning':
      return status.message ? `已连接，TOOL/LIST 失败: ${status.message}` : '已连接，TOOL/LIST 失败'
    case 'success':
      return `连接正常，工具 ${status.toolCount || 0} 个`
    default:
      return status?.message || '状态未知'
  }
}

function historyDayKey(timestamp) {
  return String(timestamp || '').slice(0, 10)
}

function formatHistoryDayLabel(dayKey) {
  if (!dayKey) {
    return '未知日期'
  }

  const today = new Date()
  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')
  if (dayKey === todayKey) {
    return '今天'
  }

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = [yesterday.getFullYear(), String(yesterday.getMonth() + 1).padStart(2, '0'), String(yesterday.getDate()).padStart(2, '0')].join('-')
  if (dayKey === yesterdayKey) {
    return '昨天'
  }

  const date = new Date(`${dayKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return dayKey
  }

  const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayLabels[date.getDay()]}`
}

function groupHistoryByDay(items) {
  const groups = []
  const map = new Map()

  items.forEach((item) => {
    const dayKey = historyDayKey(item.timestamp)
    if (!map.has(dayKey)) {
      const group = { dayKey, label: formatHistoryDayLabel(dayKey), items: [] }
      map.set(dayKey, group)
      groups.push(group)
    }
    map.get(dayKey).items.push(item)
  })

  return groups
}

function extractHistoryRequest(item) {
  const summary = parseJson(item.summaryJson || '{}', {})
  return summary.request || null
}

function formatHistoryTitle(item, servers = [], collections = []) {
  const request = extractHistoryRequest(item)
  const collectionName = findCollectionRequestNameByHistory(item, collections)

  if (collectionName) {
    return collectionName
  }

  if (item.mode === modes.http) {
    const method = request?.method || item.title?.split(' ')[0] || 'HTTP'
    const url = stripLeadingHTTPMethod(request?.url || item.title || '未命名请求')
    return `${method} ${url}`
  }

  const serverName = servers.find((server) => server.id === request?.serverId)?.name || item.title?.split(' / ')[0] || 'MCP'
  const toolName = request?.toolName || item.title?.split(' / ')[1] || '工具'
  return `MCP ${serverName} ${toolName}`
}

function historyTitleAccent(item, servers = [], collections = []) {
  const request = extractHistoryRequest(item)

  if (item.mode === modes.http) {
    const method = String(request?.method || item.title?.split(' ')[0] || '').toUpperCase()
    return httpMethods.includes(method) ? method : ''
  }

  return 'MCP'
}

function stripLeadingHTTPMethod(value) {
  const text = String(value || '').trim()
  if (!text) {
    return text
  }
  const parts = text.split(/\s+/)
  if (parts.length < 2) {
    return text
  }
  const first = parts[0].toUpperCase()
  if (!httpMethods.includes(first)) {
    return text
  }
  return parts.slice(1).join(' ')
}

function buildCollectionRequestFromHistory(item, servers = []) {
  const request = extractHistoryRequest(item)
  if (!request) {
    return null
  }

  if (item.mode === modes.http) {
    return {
      name: formatHistoryTitle(item, servers),
      mode: modes.http,
      payload: {
        http: request,
      },
    }
  }

  if (item.mode === modes.mcp) {
    return {
      name: formatHistoryTitle(item, servers),
      mode: modes.mcp,
      payload: {
        mcp: {
          serverId: request.serverId,
          toolName: request.toolName,
          argumentsJson: request.argumentsJson || '{}',
          promptName: '',
          promptArgs: '{}',
          resourceUri: '',
        },
      },
    }
  }

  return null
}

function findCollectionRequestNameByHistory(item, collections = []) {
  const request = extractHistoryRequest(item)
  if (!request) {
    return ''
  }
  return findCollectionRequestName(collections, item.mode, request)
}

function findCollectionRequestName(nodes = [], mode, request) {
  for (const node of nodes) {
    if (node.type === 'folder') {
      const childName = findCollectionRequestName(node.children || [], mode, request)
      if (childName) {
        return childName
      }
      continue
    }

    if (node.type !== 'request' || node.request?.mode !== mode) {
      continue
    }

    if (mode === modes.http) {
      const targetMethod = String(request?.method || '').toUpperCase()
      const targetURL = String(request?.url || '').trim()
      const nodeMethod = String(node.request?.http?.method || '').toUpperCase()
      const nodeURL = String(node.request?.http?.url || '').trim()
      if (targetMethod && targetURL && targetMethod === nodeMethod && targetURL === nodeURL) {
        return node.name || ''
      }
      continue
    }

    if (mode === modes.mcp) {
      const targetServerID = String(request?.serverId || '')
      const targetToolName = String(request?.toolName || '')
      const nodeServerID = String(node.request?.mcp?.serverId || '')
      const nodeToolName = String(node.request?.mcp?.toolName || '')
      if (targetServerID && targetToolName && targetServerID === nodeServerID && targetToolName === nodeToolName) {
        return node.name || ''
      }
    }
  }

  return ''
}

function describeHistoryDeleteTitle(target) {
  if (!target) {
    return '删除历史记录'
  }

  if (target.type === 'item') {
    return '删除历史记录'
  }
  if (target.type === 'day') {
    return '删除当天历史记录'
  }
  return '删除全部历史记录'
}

function describeHistoryDeleteBody(target) {
  if (!target) {
    return '确认删除历史记录吗？'
  }

  if (target.type === 'item') {
    return `确认删除“${formatHistoryTitle(target.item)}”吗？`
  }
  if (target.type === 'day') {
    return `确认删除 ${target.label || target.dayKey} 的全部历史记录吗？`
  }
  return '确认删除全部历史记录吗？该操作不可恢复。'
}

function describeHistoryDeleteSuccess(target) {
  if (!target) {
    return '已删除历史记录。'
  }

  if (target.type === 'item') {
    return '已删除历史记录。'
  }
  if (target.type === 'day') {
    return `已删除 ${target.label || target.dayKey} 的全部历史记录。`
  }
  return '已删除全部历史记录。'
}

function collectFolderIds(nodes) {
  return nodes.flatMap((node) => {
    if (node.type !== 'folder') {
      return []
    }
    return [node.id, ...collectFolderIds(node.children || [])]
  })
}

function buildFolderOptions(nodes, parentNames = [], depth = 0) {
  return nodes.flatMap((node) => {
    if (node.type !== 'folder') {
      return []
    }

    const nextParentNames = [...parentNames, node.name]
    const pathLabel = `收藏集根目录 / ${nextParentNames.join(' / ')}`
    const label = `${'  '.repeat(depth)}${node.name}`

    return [
      {
        id: node.id,
        name: node.name,
        label,
        pathLabel,
        searchText: `${node.name} ${pathLabel}`.toLowerCase(),
      },
      ...buildFolderOptions(node.children || [], nextParentNames, depth + 1),
    ]
  })
}

function describeCollectionFolder(folders, folderId) {
  if (!folderId || folderId === collectionRootValue) {
    return '收藏集根目录'
  }

  const folder = folders.find((item) => item.id === folderId)
  return folder?.name || '收藏集根目录'
}

function findCollectionNode(nodes, nodeId) {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node
    }
    if (node.type === 'folder') {
      const child = findCollectionNode(node.children || [], nodeId)
      if (child) {
        return child
      }
    }
  }

  return null
}

function renameCollectionNode(nodes, nodeId, name) {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, name }
    }
    if (node.type !== 'folder') {
      return node
    }
    return { ...node, children: renameCollectionNode(node.children || [], nodeId, name) }
  })
}

function updateCollectionNode(nodes, nodeId, updater) {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return updater(node)
    }
    if (node.type === 'folder') {
      return { ...node, children: updateCollectionNode(node.children || [], nodeId, updater) }
    }
    return node
  })
}

function deleteCollectionNode(nodes, nodeId) {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      if (node.type !== 'folder') {
        return node
      }
      return { ...node, children: deleteCollectionNode(node.children || [], nodeId) }
    })
}

function insertNodeIntoFolder(nodes, folderId, newNode) {
  if (!folderId || folderId === collectionRootValue) {
    return [...nodes, newNode]
  }

  return nodes.map((node) => {
    if (node.type !== 'folder') {
      return node
    }
    if (node.id === folderId) {
      return { ...node, children: [...(node.children || []), newNode] }
    }
    return { ...node, children: insertNodeIntoFolder(node.children || [], folderId, newNode) }
  })
}

function removeCollectionNode(nodes, nodeId) {
  let removed = null
  const nextNodes = []

  for (const node of nodes) {
    if (node.id === nodeId) {
      removed = node
      continue
    }

    if (node.type === 'folder') {
      const result = removeCollectionNode(node.children || [], nodeId)
      if (result.removed) {
        removed = result.removed
        nextNodes.push({ ...node, children: result.nodes })
        continue
      }
    }

    nextNodes.push(node)
  }

  return { nodes: nextNodes, removed }
}

function insertCollectionNode(nodes, targetId, newNode, position) {
  const nextNodes = []
  let inserted = false

  for (const node of nodes) {
    if (node.id === targetId) {
      if (position === 'before') {
        nextNodes.push(newNode, node)
      } else if (position === 'after') {
        nextNodes.push(node, newNode)
      } else if (position === 'inside' && node.type === 'folder') {
        nextNodes.push({ ...node, children: [...(node.children || []), newNode] })
      } else {
        nextNodes.push(node)
      }
      inserted = true
      continue
    }

    if (node.type === 'folder') {
      const result = insertCollectionNode(node.children || [], targetId, newNode, position)
      if (result.inserted) {
        nextNodes.push({ ...node, children: result.nodes })
        inserted = true
        continue
      }
    }

    nextNodes.push(node)
  }

  return { nodes: nextNodes, inserted }
}

function moveCollectionNode(nodes, draggedId, targetId, position) {
  if (!draggedId || draggedId === targetId) {
    return nodes
  }

  const draggedNode = findCollectionNode(nodes, draggedId)
  if (!draggedNode) {
    return nodes
  }

  if (draggedNode.type === 'folder' && targetId !== collectionRootValue && findCollectionNode(draggedNode.children || [], targetId)) {
    return nodes
  }

  const removed = removeCollectionNode(nodes, draggedId)
  if (!removed.removed) {
    return nodes
  }

  if (targetId === collectionRootValue || position === 'root') {
    return [...removed.nodes, removed.removed]
  }

  const inserted = insertCollectionNode(removed.nodes, targetId, removed.removed, position)
  return inserted.inserted ? inserted.nodes : nodes
}

export default App
