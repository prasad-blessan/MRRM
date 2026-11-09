import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import CheckCircle from '@mui/icons-material/CheckCircle'
import ChevronRight from '@mui/icons-material/ChevronRight'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import Search from '@mui/icons-material/Search'
import UnfoldMore from '@mui/icons-material/UnfoldMore'
import {
  Alert,
  Button,
  ButtonBase,
  InputAdornment,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { STATUS_META, type RequestRow, type RequestSort, type RequestStatus, type SortOrder } from '../api/requests'
import { cx } from '../lib/cx'

// Colours come from data-tone (see .status-chip in the stylesheet).
export function StatusChip({ status }: { status: RequestStatus }) {
  const { label, tone } = STATUS_META[status]
  const icon = tone === 'done' ? <CheckCircle /> : tone === 'pending' ? <ScheduleOutlined /> : <span className="status-chip__dot" />
  return (
    <span className="status-chip" data-tone={tone}>
      {icon}
      {label}
    </span>
  )
}

export interface Column {
  key: string
  label: string
  sort?: RequestSort
  render: (row: RequestRow) => ReactNode
}

interface Props {
  title: string
  description: string
  searchLabel: string
  search: string
  onSearch: (q: string) => void
  viewAll: { to: string; label: string }
  columns: Column[]
  rows: RequestRow[] | null
  error: string | null
  onRetry: () => void
  sort: RequestSort
  order: SortOrder
  onSort: (sort: RequestSort) => void
  empty: ReactNode
  filterNote?: ReactNode
  footer?: ReactNode
}

export function RequestTableCard(props: Props) {
  const { title, description, columns, rows, sort, order } = props
  const headingId = `${title.replace(/\W+/g, '-').toLowerCase()}-heading`

  return (
    <Paper component="section" aria-labelledby={headingId} elevation={0} className="rt-card">
      <div className="rt-head">
        <div className="rt-head__text">
          <Typography id={headingId} component="h2" variant="h5" className="rt-title">
            {title}
          </Typography>
          <Typography className="rt-description">{description}</Typography>
        </div>
        <div className="rt-tools">
          <TextField
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder={`${props.searchLabel}...`}
            className="rt-search"
            slotProps={{
              htmlInput: { 'aria-label': props.searchLabel, maxLength: 100 },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button component={RouterLink} to={props.viewAll.to} variant="outlined" endIcon={<ChevronRight />} className="btn-secondary-lg rt-view-all">
            {props.viewAll.label}
          </Button>
        </div>
      </div>

      {props.filterNote}

      {props.error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={props.onRetry}>
              Retry
            </Button>
          }
        >
          {props.error}
        </Alert>
      ) : (
        <TableContainer className="rt-container">
          <Table aria-labelledby={headingId} className="rt-table">
            <TableHead>
              <TableRow>
                {columns.map((c) => {
                  const active = c.sort === sort
                  const Arrow = !active ? UnfoldMore : order === 'asc' ? ArrowUpward : ArrowDownward
                  return (
                    <TableCell key={c.key} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {c.sort ? (
                        <ButtonBase onClick={() => props.onSort(c.sort!)} className={cx('rt-sort', active && 'rt-sort--active')}>
                          {c.label}
                          <Arrow className="rt-sort__arrow" />
                        </ButtonBase>
                      ) : (
                        c.label
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows === null
                ? [0, 1, 2, 3].map((i) => (
                    <TableRow key={i}>
                      {columns.map((c) => (
                        <TableCell key={c.key}>
                          <Skeleton width="70%" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map((row) => (
                    <TableRow key={row.id} hover>
                      {columns.map((c) => (
                        <TableCell key={c.key}>{c.render(row)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
              {rows?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="rt-empty">
                    {props.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {props.footer}
    </Paper>
  )
}
