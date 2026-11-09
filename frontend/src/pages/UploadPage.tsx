import CheckCircle from '@mui/icons-material/CheckCircle'
import CloseRounded from '@mui/icons-material/CloseRounded'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined'
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined'
import TaskAltRounded from '@mui/icons-material/TaskAltRounded'
import { Alert, Button, CircularProgress, FormControl, FormHelperText, IconButton, LinearProgress, MenuItem, Paper, Select, Typography } from '@mui/material'
import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { Link as RouterLink } from 'react-router'
import { errorMessage } from '../api/client'
import { discardUpload, getServiceTypes, submitRequest, uploadFile, type ServiceType, type UploadedFile } from '../api/requests'
import { PageHeader } from '../components/AppShell'
import { cx } from '../lib/cx'
import { formatDateTime } from '../lib/format'

const MAX_MB = 100
const MAX_FILES = 200
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/jpeg,image/png,image/tiff'
const EXTENSIONS = /\.(pdf|jpe?g|png|tiff?)$/i

interface Entry {
  key: string
  file: File
  state: 'uploading' | 'done' | 'error'
  progress: number
  uploaded?: UploadedFile
  error?: string
  controller?: AbortController
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

// Checked again on the server (by content, not name); this only gives an instant answer.
function precheck(file: File): string | null {
  if (!EXTENSIONS.test(file.name)) return 'Unsupported format. Use PDF, JPG, PNG or TIFF.'
  if (file.size === 0) return 'The file is empty.'
  if (file.size > MAX_MB * 1024 * 1024) return `File is larger than ${MAX_MB} MB.`
  return null
}

let nextKey = 0

export function UploadPage() {
  const [services, setServices] = useState<ServiceType[] | null>(null)
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [serviceId, setServiceId] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [dragging, setDragging] = useState(false)
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ id: string; expectedAt: string; files: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()
  const entriesRef = useRef(entries)
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  useEffect(() => {
    getServiceTypes()
      .then(setServices)
      .catch((err: unknown) => setServicesError(errorMessage(err)))
  }, [])

  // Leaving the page stops uploads that are still running.
  useEffect(() => () => entriesRef.current.forEach((e) => e.controller?.abort()), [])

  const patch = (key: string, change: Partial<Entry>) => setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...change } : e)))

  const addFiles = (files: FileList | File[]) => {
    setSubmitError(null)
    const room = MAX_FILES - entriesRef.current.length
    const incoming = Array.from(files).slice(0, Math.max(0, room))
    if (files.length > incoming.length) setSubmitError(`A request can hold up to ${MAX_FILES} files.`)

    const added: Entry[] = incoming.map((file) => {
      const problem = precheck(file)
      return problem
        ? { key: String(nextKey++), file, state: 'error', progress: 0, error: problem }
        : { key: String(nextKey++), file, state: 'uploading', progress: 0, controller: new AbortController() }
    })
    setEntries((list) => [...list, ...added])

    for (const entry of added) {
      if (entry.state !== 'uploading') continue
      uploadFile(entry.file, (progress) => patch(entry.key, { progress }), entry.controller!.signal)
        .then((uploaded) => patch(entry.key, { state: 'done', progress: 100, uploaded, controller: undefined }))
        .catch((err: unknown) => {
          if (entry.controller!.signal.aborted) return
          patch(entry.key, { state: 'error', error: errorMessage(err), controller: undefined })
        })
    }
  }

  const remove = (entry: Entry) => {
    entry.controller?.abort()
    if (entry.uploaded) void discardUpload(entry.uploaded.id).catch(() => undefined)
    setEntries((list) => list.filter((e) => e.key !== entry.key))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!submitting && e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  const ready = entries.filter((e) => e.state === 'done')
  const uploading = entries.some((e) => e.state === 'uploading')
  const failed = entries.filter((e) => e.state === 'error').length
  const serviceMissing = touched && !serviceId

  const submit = async () => {
    setTouched(true)
    setSubmitError(null)
    if (!serviceId) return
    if (!ready.length) return setSubmitError('Add at least one file to submit.')
    if (failed) return setSubmitError('Remove the files that could not be uploaded, then submit.')
    setSubmitting(true)
    try {
      const result = await submitRequest(
        serviceId,
        ready.map((e) => e.uploaded!.id),
      )
      setSubmitted({ ...result, files: ready.length })
      setEntries([])
    } catch (err) {
      setSubmitError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setSubmitted(null)
    setServiceId('')
    setTouched(false)
  }

  return (
    <>
      <PageHeader
        title="Upload & Configure"
        subtitle="Select the required service and upload the client files for processing. Files will be automatically allocated to reviewers based on availability and workload."
      />
      <Paper elevation={0} className="upload-card">
        {submitted ? (
          <Submitted request={submitted} onAnother={reset} />
        ) : (
          <>
            {servicesError && (
              <Alert severity="error" className="upload-alert--top">
                {servicesError}
              </Alert>
            )}
            <FormControl fullWidth error={serviceMissing} required>
              <Typography id={labelId} component="label" className="upload-label">
                Processing Service{' '}
                <span aria-hidden className="upload-label__required">
                  *
                </span>
              </Typography>
              <Select
                className="upload-service"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                onClose={() => setTouched(true)}
                displayEmpty
                disabled={!services || submitting}
                IconComponent={KeyboardArrowDown}
                inputProps={{ 'aria-labelledby': labelId, 'aria-required': true }}
                renderValue={(id) =>
                  id ? (
                    services?.find((s) => s.id === id)?.name
                  ) : (
                    <span className="upload-placeholder">{services ? 'Select a processing service' : 'Loading services…'}</span>
                  )
                }
                MenuProps={{ slotProps: { paper: { className: 'upload-service-menu' } } }}
              >
                {services?.map((s) => (
                  <MenuItem key={s.id} value={s.id} className="upload-service-option">
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
              {serviceMissing && <FormHelperText className="upload-service-help">Select a processing service.</FormHelperText>}
            </FormControl>

            <div
              onDragOver={(e) => {
                e.preventDefault()
                if (!submitting) setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cx('upload-drop', dragging && 'upload-drop--active')}
            >
              <CloudUploadOutlined aria-hidden className="upload-drop__icon" />
              <Typography className="upload-drop__title">Drag and drop files here</Typography>
              <Typography className="upload-note upload-drop__or">or</Typography>
              <Button variant="outlined" onClick={() => inputRef.current?.click()} disabled={submitting} className="btn-secondary-lg upload-browse">
                Browse Files
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <Typography className="upload-drop__formats">
                Supported formats: PDF, JPG, PNG, TIFF | Maximum file size: {MAX_MB} MB per file
              </Typography>
            </div>

            {entries.length > 0 && <FileList entries={entries} onRemove={remove} disabled={submitting} />}

            {submitError && (
              <Alert severity="error" className="upload-alert--submit">
                {submitError}
              </Alert>
            )}

            <div className="upload-actions">
              {uploading && (
                <Typography role="status" className="upload-note">
                  Uploading files…
                </Typography>
              )}
              <Button
                variant="contained"
                size="large"
                onClick={() => void submit()}
                disabled={submitting || uploading}
                startIcon={submitting ? <CircularProgress size={17} color="inherit" /> : <FileUploadOutlined />}
                className="btn-primary-lg upload-submit"
              >
                {submitting ? 'Submitting…' : 'Upload & Submit'}
              </Button>
            </div>
          </>
        )}
      </Paper>
    </>
  )
}

function FileList({ entries, onRemove, disabled }: { entries: Entry[]; onRemove: (e: Entry) => void; disabled: boolean }) {
  const done = entries.filter((e) => e.state === 'done').length
  return (
    <div className="upload-files">
      <Typography className="upload-note upload-files__count">
        {done} of {entries.length} {entries.length === 1 ? 'file' : 'files'} uploaded
      </Typography>
      <ul className="upload-files__list" aria-label="Selected files">
        {entries.map((e) => {
          const isPdf = /\.pdf$/i.test(e.file.name)
          const Icon = isPdf ? PictureAsPdfOutlined : ImageOutlined
          return (
            <li key={e.key} className="upload-file" data-state={e.state} data-kind={isPdf ? 'pdf' : 'image'}>
              <Icon aria-hidden className="upload-file__icon" />
              <div className="upload-file__body">
                <div className="upload-file__head">
                  <Typography noWrap title={e.file.name} className="upload-file__name">
                    {e.file.name}
                  </Typography>
                  <Typography className="upload-file__small upload-file__size">{formatSize(e.file.size)}</Typography>
                </div>
                {e.state === 'uploading' && (
                  <div className="upload-file__progress">
                    <LinearProgress variant="determinate" value={e.progress} aria-label={`Uploading ${e.file.name}`} className="upload-file__bar" />
                    <Typography className="upload-file__small upload-file__percent">{e.progress}%</Typography>
                  </div>
                )}
                {e.state === 'done' && (
                  <Typography className="upload-file__small upload-file__status">
                    <CheckCircle /> Uploaded
                    {e.uploaded?.pages ? ` · ${e.uploaded.pages} ${e.uploaded.pages === 1 ? 'page' : 'pages'}` : ''}
                  </Typography>
                )}
                {e.state === 'error' && (
                  <Typography role="alert" className="upload-file__small upload-file__status upload-file__status--error">
                    <ErrorOutline /> {e.error}
                  </Typography>
                )}
              </div>
              <IconButton aria-label={`Remove ${e.file.name}`} onClick={() => onRemove(e)} disabled={disabled} size="small" className="upload-file__remove">
                <CloseRounded />
              </IconButton>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Submitted({ request, onAnother }: { request: { id: string; expectedAt: string; files: number }; onAnother: () => void }) {
  return (
    <div role="status" className="upload-done">
      <TaskAltRounded aria-hidden className="upload-done__icon" />
      <Typography component="h2" variant="h5" className="upload-done__title">
        Request {request.id} submitted
      </Typography>
      <Typography className="upload-done__text">
        {request.files} {request.files === 1 ? 'file was' : 'files were'} received. Expected completion: {formatDateTime(request.expectedAt)}.
      </Typography>
      <div className="upload-done__actions">
        <Button component={RouterLink} to={`/workflow?request=${request.id}`} variant="contained" size="large" className="btn-primary-lg">
          Track progress
        </Button>
        <Button component={RouterLink} to="/dashboard" variant="outlined" size="large" className="btn-secondary-lg">
          Go to Dashboard
        </Button>
        <Button onClick={onAnother} variant="outlined" size="large" className="btn-secondary-lg">
          Submit another request
        </Button>
      </div>
    </div>
  )
}
