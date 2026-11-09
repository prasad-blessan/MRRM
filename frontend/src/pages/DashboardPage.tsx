import CheckRounded from '@mui/icons-material/CheckRounded'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import FilterListOff from '@mui/icons-material/FilterListOff'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import MoreVert from '@mui/icons-material/MoreVert'
import SyncOutlined from '@mui/icons-material/SyncOutlined'
import TextSnippetOutlined from '@mui/icons-material/TextSnippetOutlined'
import {
  Alert,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { errorMessage } from '../api/client'
import {
  CANCELLABLE,
  cancelRequest,
  downloadRequest,
  isNewDeliverable,
  getSummary,
  listRequests,
  type ListQuery,
  type RequestRow,
  type RequestSort,
  type RequestSummary,
  type SortOrder,
  type StatusGroup,
} from '../api/requests'
import { useAuth } from '../auth/context'
import { PageHeader } from '../components/AppShell'
import { RequestTableCard, StatusChip, type Column } from '../components/RequestTable'
import { cx } from '../lib/cx'
import { filesLabel, formatDate, formatDateTime, useDebounced } from '../lib/format'

const ROWS = 5
// The workflow advances in the background; keep the dashboard current without a manual reload.
const REFRESH_MS = 30_000

type TileGroup = Exclude<StatusGroup, 'closed'> | 'all'

// Tile colours are set per data-tile in the stylesheet (.dash-tile).
const TILES: { group: TileGroup; key: keyof RequestSummary; label: string; caption: string; icon: ReactNode }[] = [
  { group: 'all', key: 'total', label: 'Total Requests', caption: 'All submitted requests', icon: <TextSnippetOutlined /> },
  { group: 'inProgress', key: 'inProgress', label: 'In Progress', caption: 'Currently processing', icon: <SyncOutlined /> },
  { group: 'completed', key: 'completed', label: 'Completed', caption: 'Delivered to your team', icon: <CheckRounded /> },
  { group: 'pending', key: 'pending', label: 'Pending', caption: 'Awaiting processing', icon: <ErrorOutlineOutlined /> },
]

const GROUP_LABEL: Record<TileGroup, string> = { all: 'All', inProgress: 'In Progress', completed: 'Completed', pending: 'Pending' }

function StatTiles({ summary, active, onSelect }: { summary: RequestSummary | null; active: TileGroup; onSelect: (g: TileGroup) => void }) {
  return (
    <div className="dash-tiles">
      {TILES.map((t) => {
        const selected = active === t.group && t.group !== 'all'
        return (
          // DSH-02: a tile filters the Recent Requests list.
          <ButtonBase
            key={t.key}
            onClick={() => onSelect(selected ? 'all' : t.group)}
            aria-pressed={active === t.group}
            aria-label={`${t.label}: ${summary ? summary[t.key] : 'loading'}. Show ${GROUP_LABEL[t.group].toLowerCase()} requests`}
            data-tile={t.group}
            className={cx('dash-tile', selected && 'dash-tile--selected')}
          >
            <div className="dash-tile__icon">{t.icon}</div>
            <div className="dash-tile__text">
              <Typography className="dash-tile__label">{t.label}</Typography>
              <Typography className="dash-tile__value">{summary ? summary[t.key] : '–'}</Typography>
              <Typography className="dash-tile__caption">{t.caption}</Typography>
            </div>
          </ButtonBase>
        )
      })}
    </div>
  )
}

function useRequestList(query: ListQuery, refresh: number) {
  const [state, setState] = useState<{ rows: RequestRow[] | null; total: number; error: string | null }>({ rows: null, total: 0, error: null })
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify(query)

  useEffect(() => {
    let live = true
    listRequests(JSON.parse(key) as ListQuery)
      .then((page) => live && setState({ rows: page.items, total: page.total, error: null }))
      .catch((err: unknown) => live && setState((s) => ({ ...s, rows: s.rows ?? [], error: errorMessage(err) })))
    return () => {
      live = false
    }
  }, [key, refresh, retry])

  return { ...state, retry: () => setRetry((n) => n + 1) }
}

function useSort(initial: RequestSort) {
  const [sort, setSort] = useState<{ sort: RequestSort; order: SortOrder }>({ sort: initial, order: 'desc' })
  const toggle = (next: RequestSort) =>
    setSort((s) => (s.sort === next ? { sort: next, order: s.order === 'desc' ? 'asc' : 'desc' } : { sort: next, order: 'desc' }))
  return [sort, toggle] as const
}

function RowMenu({ row, onCancel }: { row: RequestRow; onCancel?: (row: RequestRow) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconButton aria-label={`More actions for ${row.id}`} aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} className="dash-row-menu">
        <MoreVert />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} className="dash-menu">
        <MenuItem component={RouterLink} to={`/workflow?request=${row.id}`}>
          View details
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null)
            void navigator.clipboard?.writeText(row.id)
          }}
        >
          Copy request ID
        </MenuItem>
        {onCancel && CANCELLABLE.includes(row.status) && (
          <MenuItem
            onClick={() => {
              setAnchor(null)
              onCancel(row)
            }}
            className="dash-menu-danger"
          >
            Cancel request
          </MenuItem>
        )}
      </Menu>
    </>
  )
}

function primaryAction(row: RequestRow) {
  if (row.status === 'DELIVERED' || row.status === 'COMPLETED') return { label: 'View Summary', to: `/outputs?request=${row.id}` }
  if (row.status === 'RECEIVED' || row.status === 'ON_HOLD' || row.status === 'REJECTED' || row.status === 'CANCELLED')
    return { label: 'View Details', to: `/workflow?request=${row.id}` }
  return { label: 'View Progress', to: `/workflow?request=${row.id}` }
}

const idCell = (row: RequestRow) => (
  <Typography component="span" className="dash-id">
    {row.id}
  </Typography>
)

export function DashboardPage() {
  const { user } = useAuth()
  const isClient = user?.role === 'CLIENT_USER'
  const [refresh, setRefresh] = useState(0)
  const [summary, setSummary] = useState<RequestSummary | null>(null)
  const [group, setGroup] = useState<TileGroup>('all')
  const [recentSearch, setRecentSearch] = useState('')
  const [doneSearch, setDoneSearch] = useState('')
  const [recentSort, toggleRecentSort] = useSort('receivedAt')
  const [doneSort, toggleDoneSort] = useSort('completedAt')
  const [cancelling, setCancelling] = useState<RequestRow | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState<ReadonlySet<string>>(new Set())
  const reload = useCallback(() => setRefresh((n) => n + 1), [])

  useEffect(() => {
    const id = setInterval(reload, REFRESH_MS)
    return () => clearInterval(id)
  }, [reload])

  useEffect(() => {
    let live = true
    getSummary()
      .then((s) => live && setSummary(s))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [refresh])

  const recentQ = useDebounced(recentSearch.trim())
  const doneQ = useDebounced(doneSearch.trim())
  // Completed requests move to Completed Deliverables, so Recent Requests leaves them out unless the Completed tile asks for them.
  const recent = useRequestList(
    { q: recentQ, ...(group === 'all' ? { exclude: 'completed' } : { group }), ...recentSort, pageSize: ROWS },
    refresh,
  )
  const done = useRequestList({ q: doneQ, group: 'completed', ...doneSort, pageSize: ROWS }, refresh)

  const recentColumns: Column[] = [
    { key: 'id', label: 'Request ID', sort: 'id', render: idCell },
    { key: 'received', label: 'Date Submitted', sort: 'receivedAt', render: (r) => formatDate(r.receivedAt) },
    { key: 'docs', label: 'Documents', render: (r) => filesLabel(r.documents) },
    { key: 'service', label: 'Services Selected', render: (r) => <ServiceText name={r.service} /> },
    { key: 'status', label: 'Status', sort: 'status', render: (r) => <StatusChip status={r.status} /> },
    { key: 'updated', label: 'Last Updated', sort: 'updatedAt', render: (r) => formatDateTime(r.updatedAt) },
    { key: 'action', label: 'Action', render: (r) => <Actions row={r} onCancel={isClient ? setCancelling : undefined} /> },
  ]

  const doneColumns: Column[] = [
    { key: 'id', label: 'Request ID', sort: 'id', render: (r) => <DeliverableId row={r} downloaded={downloaded.has(r.id)} /> },
    { key: 'completed', label: 'Completed On', sort: 'completedAt', render: (r) => (r.deliveredAt ? formatDateTime(r.deliveredAt) : '—') },
    { key: 'docs', label: 'Documents', render: (r) => filesLabel(r.documents) },
    { key: 'service', label: 'Services Selected', render: (r) => <ServiceText name={r.service} /> },
    {
      key: 'output',
      label: 'Output Type',
      render: () => (
        <span className="dash-output">
          <DescriptionOutlined />
          Summary
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      render: (r) => (
        <div className="dash-actions">
          <DownloadButton row={r} busy={downloading === r.id} onDownload={(row) => void download(row)} />
          <RowMenu row={r} />
        </div>
      ),
    },
  ]

  // A finished download hides the "New" marker at once; the next reload shows the request as Completed.
  const download = async (row: RequestRow) => {
    if (downloading) return
    setDownloading(row.id)
    try {
      await downloadRequest(row.id)
      setDownloaded((prev) => new Set(prev).add(row.id))
      setNotice({ ok: true, text: `${row.id} downloaded.` })
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    } finally {
      setDownloading(null)
    }
    reload()
  }

  const confirmCancel = async () => {
    if (!cancelling) return
    const code = cancelling.id
    setCancelling(null)
    try {
      await cancelRequest(code)
      setNotice({ ok: true, text: `${code} was cancelled.` })
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) })
    }
    reload()
  }

  const recentEmpty =
    recentQ || group !== 'all' ? (
      'No requests match your filter.'
    ) : summary && summary.total > 0 ? (
      'No open requests. Completed requests are listed under Completed Deliverables.'
    ) : (
      <>
        No requests yet.{' '}
        {isClient && (
          <Link component={RouterLink} to="/upload" className="dash-link-strong">
            Upload files to submit your first request
          </Link>
        )}
      </>
    )

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Manage your medical records review requests." />
      <StatTiles summary={summary} active={group} onSelect={setGroup} />

      <div className="dash-tables">
        <RequestTableCard
          title="Recent Requests"
          description="View the status of your most recent medical records review requests."
          searchLabel="Search requests"
          search={recentSearch}
          onSearch={setRecentSearch}
          viewAll={{ to: group === 'all' ? '/records' : `/records?group=${group}`, label: 'View All Requests' }}
          columns={recentColumns}
          rows={recent.rows}
          error={recent.error}
          onRetry={recent.retry}
          {...recentSort}
          onSort={toggleRecentSort}
          empty={recentEmpty}
          filterNote={
            group !== 'all' && (
              <Chip
                icon={<FilterListOff />}
                label={`Showing ${GROUP_LABEL[group]} · Clear filter`}
                onClick={() => setGroup('all')}
                className="dash-filter-chip"
              />
            )
          }
          footer={<TableFooter shown={recent.rows?.length ?? 0} total={recent.total} />}
        />
        <RequestTableCard
          title="Completed Deliverables"
          description="Access your finalized summaries and source-linked medical records."
          searchLabel="Search deliverables"
          search={doneSearch}
          onSearch={setDoneSearch}
          viewAll={{ to: '/outputs', label: 'View All Deliverables' }}
          columns={doneColumns}
          rows={done.rows}
          error={done.error}
          onRetry={done.retry}
          {...doneSort}
          onSort={toggleDoneSort}
          empty={doneQ ? 'No deliverables match your search.' : 'Completed outputs will appear here once a request is delivered.'}
          footer={<TableFooter shown={done.rows?.length ?? 0} total={done.total} />}
        />
      </div>

      <Dialog open={!!cancelling} onClose={() => setCancelling(null)}>
        <DialogTitle>Cancel {cancelling?.id}?</DialogTitle>
        <DialogContent>
          <DialogContentText>The request will not be processed and its files will not be reviewed. This cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelling(null)}>Keep request</Button>
          <Button color="error" variant="contained" onClick={() => void confirmCancel()}>
            Cancel request
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!notice} autoHideDuration={6000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={notice?.ok ? 'success' : 'error'} onClose={() => setNotice(null)} variant="filled">
          {notice?.text}
        </Alert>
      </Snackbar>
    </>
  )
}

function ServiceText({ name }: { name: string }) {
  return (
    <span title={name} className="dash-service">
      {name}
    </span>
  )
}

// "New" = delivered but not downloaded yet; it disappears after the first download.
function DeliverableId({ row, downloaded }: { row: RequestRow; downloaded: boolean }) {
  const fresh = isNewDeliverable(row) && !downloaded
  return (
    <span className="dash-id-cell">
      {idCell(row)}
      {fresh && (
        <span className="dash-new" role="status" aria-label={`${row.id} not downloaded yet`} title="Not downloaded yet">
          New
        </span>
      )}
    </span>
  )
}

function DownloadButton({ row, busy, onDownload }: { row: RequestRow; busy: boolean; onDownload: (row: RequestRow) => void }) {
  return (
    <Button
      variant="outlined"
      onClick={() => onDownload(row)}
      disabled={busy}
      startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <DownloadOutlined />}
      aria-label={`Download output for ${row.id}`}
      className="btn-sm dash-action"
    >
      {busy ? 'Preparing…' : 'Download'}
    </Button>
  )
}

function Actions({ row, onCancel }: { row: RequestRow; onCancel?: (row: RequestRow) => void }) {
  const action = primaryAction(row)
  return (
    <div className="dash-actions">
      <Button component={RouterLink} to={action.to} variant="outlined" aria-label={`${action.label} for ${row.id}`} className="btn-sm dash-action">
        {action.label}
      </Button>
      <RowMenu row={row} onCancel={onCancel} />
    </div>
  )
}

function TableFooter({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null
  return (
    <Typography className="dash-table-footer">
      Showing {shown} of {total}
    </Typography>
  )
}
