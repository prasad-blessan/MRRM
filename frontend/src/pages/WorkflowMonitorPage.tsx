import ArticleOutlined from '@mui/icons-material/ArticleOutlined'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import FolderOutlined from '@mui/icons-material/FolderOutlined'
import NoteAltOutlined from '@mui/icons-material/NoteAltOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import SyncRounded from '@mui/icons-material/SyncRounded'
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined'
import {
  Alert,
  Button,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { errorMessage } from '../api/client'
import {
  downloadRequest,
  getRequest,
  listRequests,
  STATUS_META,
  type RequestDetail,
  type RequestRow,
  type RequestStatus,
  type StageState,
} from '../api/requests'
import { PageHeader } from '../components/AppShell'
import { cx } from '../lib/cx'
import { formatDate, formatDateTime } from '../lib/format'

// The workflow advances in the background; keep the tracker current without a manual reload.
const REFRESH_MS = 30_000

// Client-facing copy per stage (prototype workflow-monitor.html). No reviewer names (AC-TRK-02).
const STAGE_INFO: { icon: ReactNode; text: string }[] = [
  { icon: <NoteAltOutlined />, text: 'Files automatically allocated to reviewers based on availability and workload.' },
  { icon: <DescriptionOutlined />, text: 'Indexing, bookmarking, TOC and document preparation.' },
  { icon: <ArticleOutlined />, text: 'Generating summaries as per service requirements.' },
  { icon: <VerifiedUserOutlined />, text: 'Quality checks, validation and corrections.' },
  { icon: <FolderOutlined />, text: 'Output generation and deliverable readiness.' },
]

const STATE_LABEL: Record<StageState, string> = { completed: 'Completed', active: 'In Progress', pending: 'Pending' }

const CLOSED: RequestStatus[] = ['DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED']

// TRK-04: exception statuses show their client-visible meaning while they apply.
const NOTICES: Partial<Record<RequestStatus, { tone: 'warning' | 'error'; text: string }>> = {
  ON_HOLD: { tone: 'warning', text: 'This request is on hold. Processing will resume once the hold is cleared; the expected delivery date moves by the paused time.' },
  REWORK: { tone: 'warning', text: 'Quality checks found items to correct. The request is being reworked before delivery.' },
  REJECTED: { tone: 'error', text: 'This request was rejected and will not be processed. You can submit a new request from Upload & Configure.' },
  CANCELLED: { tone: 'error', text: 'This request was cancelled and will not be processed.' },
}


function StageStateIcon({ state }: { state: StageState }) {
  if (state === 'completed') return <CheckCircleRounded />
  if (state === 'active') return <SyncRounded className="wf-stage__spin" />
  return <ScheduleOutlined />
}

function Stepper({ request }: { request: RequestDetail }) {
  return (
    <ol className="wf-stepper" aria-label="Workflow stages">
      {request.stages.map((s, i) => (
        <li key={s.name} className="wf-step" data-state={s.state} aria-current={s.state === 'active' ? 'step' : undefined}>
          <span className="wf-step__circle">{s.state === 'completed' ? <CheckRounded /> : i + 1}</span>
          <span className="wf-step__title">
            {i + 1}. {s.name}
          </span>
          <span className="wf-step__state">{STATE_LABEL[s.state]}</span>
          {s.completedAt && <span className="wf-step__time">{formatDateTime(s.completedAt)}</span>}
        </li>
      ))}
    </ol>
  )
}

function StageCards({ request }: { request: RequestDetail }) {
  return (
    <div className="wf-stages">
      {request.stages.map((s, i) => (
        <div key={s.name} className="wf-stages__item">
          {i > 0 && <ChevronRightRounded aria-hidden className="wf-stages__chevron" />}
          <Paper elevation={0} className="wf-stage" data-state={s.state}>
            <span className="wf-stage__icon">{STAGE_INFO[i]?.icon}</span>
            <Typography component="h3" className="wf-stage__title">
              {i + 1}. {s.name}
            </Typography>
            <Typography className="wf-stage__text">{STAGE_INFO[i]?.text}</Typography>
            <div className="wf-stage__progress">
              <progress className="wf-stage__bar" value={s.progress} max={100} aria-label={`${s.name} progress`} />
              <b className="wf-stage__percent">{s.progress}%</b>
            </div>
            <span className="wf-stage__badge">
              <StageStateIcon state={s.state} />
              {STATE_LABEL[s.state]}
            </span>
          </Paper>
        </div>
      ))}
    </div>
  )
}

function InfoStrip({ request }: { request: RequestDetail }) {
  // Third value sizes the cell: grow = widest (service names), wide = date and time, narrow = a count.
  const cells: [string, string, ('grow' | 'wide' | 'narrow')?][] = [
    ['Request ID', request.id],
    ['Documents', `${request.documents.length} ${request.documents.length === 1 ? 'File' : 'Files'}`],
    ['Pages', request.pages.toLocaleString('en-US'), 'narrow'],
    ['Services Selected', request.service, 'grow'],
    // Non-breaking space: on narrow screens the time wraps as a whole ("07:45 PM"), never before AM/PM.
    ['Uploaded On', formatDateTime(request.receivedAt).replace(/ (AM|PM)$/, ' $1'), 'wide'],
  ]
  // TRK-02: expected delivery is not shown once the request is closed.
  if (!CLOSED.includes(request.status)) cells.push(['Expected Delivery', formatDate(request.expectedAt)])
  return (
    <Paper elevation={0} className="wf-strip">
      <dl className="wf-strip__list">
        {cells.map(([label, value, size]) => (
          <div key={label} className={cx('wf-strip__cell', size && `wf-strip__cell--${size}`)}>
            <dt className="wf-strip__label">{label}</dt>
            <dd className="wf-strip__value">{value}</dd>
          </div>
        ))}
      </dl>
    </Paper>
  )
}

export function WorkflowMonitorPage() {
  const [params, setParams] = useSearchParams()
  const [requests, setRequests] = useState<RequestRow[] | null>(null)
  const [detail, setDetail] = useState<RequestDetail | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  // Requests for the picker; without ?request= the most recent open one is shown.
  useEffect(() => {
    listRequests({ sort: 'receivedAt', order: 'desc', pageSize: 100 })
      .then((page) => setRequests(page.items))
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const fallback = requests?.find((r) => !CLOSED.includes(r.status))?.id ?? requests?.[0]?.id
  const code = params.get('request') ?? fallback

  const load = useCallback(() => {
    if (!code) return
    setLoading(true)
    getRequest(code)
      .then((d) => {
        setDetail(d)
        setError('')
        setLoadedAt(new Date())
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [code])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  async function onDownload() {
    if (!detail) return
    setDownloading(true)
    try {
      await downloadRequest(detail.id)
      load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  const shown = detail && detail.id === code?.toUpperCase() ? detail : null
  const notice = shown && NOTICES[shown.status]
  const ready = shown && (shown.status === 'DELIVERED' || shown.status === 'COMPLETED')
  const empty = requests !== null && requests.length === 0

  return (
    <>
      <div className="wf-head">
        <PageHeader title="Workflow Monitor" subtitle="Track the processing status of uploaded files across the end-to-end workflow." />
        {!empty && (
          <div className="wf-head__tools">
            <TextField
              select
              size="small"
              label="Request"
              className="wf-picker"
              value={requests && code ? code.toUpperCase() : ''}
              onChange={(e) => setParams({ request: e.target.value })}
              disabled={!requests}
            >
              {requests?.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.id} · {STATUS_META[r.status].label}
                </MenuItem>
              ))}
              {requests && code && !requests.some((r) => r.id === code.toUpperCase()) && (
                <MenuItem value={code.toUpperCase()}>{code.toUpperCase()}</MenuItem>
              )}
            </TextField>
            <Paper elevation={0} className="wf-refresh">
              {/* A click spins the icon at least one full turn (the reload is often instant), then stops once loading ends. */}
              <IconButton
                aria-label="Refresh"
                onClick={() => {
                  if (spinning) return
                  setSpinning(true)
                  load()
                }}
                onAnimationIteration={() => {
                  if (!loading) setSpinning(false)
                }}
                className={cx('wf-refresh__btn', spinning && 'is-spinning')}
              >
                <SyncRounded />
              </IconButton>
              <span className="wf-refresh__text">
                Last updated: {loadedAt ? `${formatDateTime(loadedAt.toISOString())}` : '—'}
              </span>
            </Paper>
          </div>
        )}
      </div>

      {error && (
        <Alert severity="error" className="wf-alert">
          {error}
        </Alert>
      )}

      {empty && (
        <Paper elevation={0} className="wf-empty">
          <Typography className="wf-empty__text">You have no requests yet. Submit one from Upload &amp; Configure to track it here.</Typography>
        </Paper>
      )}

      {!shown && !empty && !error && (
        <div className="wf-loading" aria-busy>
          <Skeleton variant="rounded" height={88} />
          <Skeleton variant="rounded" height={140} />
          <Skeleton variant="rounded" height={320} />
        </div>
      )}

      {shown && (
        <>
          <InfoStrip request={shown} />

          {notice && (
            <Alert severity={notice.tone} icon={<ErrorOutlineOutlined />} className="wf-alert">
              <strong>{STATUS_META[shown.status].label}.</strong> {notice.text}
            </Alert>
          )}

          <Stepper request={shown} />
          <StageCards request={shown} />

          {ready && (
            <div className="wf-banner">
              <span className="wf-banner__msg">
                <CheckCircleRounded />
                All stages completed – final output is ready.
              </span>
              <Button
                variant="contained"
                size="large"
                className="btn-primary-lg"
                startIcon={downloading ? <CircularProgress size={17} color="inherit" /> : <DownloadOutlined />}
                onClick={onDownload}
                disabled={downloading}
              >
                Download output
              </Button>
            </div>
          )}

        </>
      )}
    </>
  )
}
