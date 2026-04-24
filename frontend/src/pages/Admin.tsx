import { ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'

interface AdminUser {
  id: string
  email: string
  created_at: string
  route_count: number
  is_admin: boolean
}

interface CheckLog {
  id: string
  route_id: string
  origin: string
  destination: string
  date_from: string
  date_to: string
  checked_at: string
  outbound_price: number | null
  inbound_price: number | null
  total_price: number | null
  flights_found: boolean
  price_goal_reached: boolean
  available_goal_reached: boolean
  error: string | null
}

interface RunGroup {
  runTime: string
  logs: CheckLog[]
}

function groupIntoRuns(logs: CheckLog[]): RunGroup[] {
  if (logs.length === 0) return []
  const groups: RunGroup[] = []
  let current: CheckLog[] = [logs[0]]
  for (let i = 1; i < logs.length; i++) {
    const gap = Math.abs(
      new Date(logs[i - 1].checked_at).getTime() -
      new Date(logs[i].checked_at).getTime()
    ) / 60000
    if (gap <= 2) {
      current.push(logs[i])
    } else {
      groups.push({ runTime: current[0].checked_at, logs: current })
      current = [logs[i]]
    }
  }
  groups.push({ runTime: current[0].checked_at, logs: current })
  return groups
}

function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const slice = items.slice((safePage - 1) * pageSize, safePage * pageSize)
  return { page: safePage, setPage, totalPages, slice }
}

function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  const { t } = useTranslation()
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
      <button
        onClick={() => setPage(page - 1)}
        disabled={page === 1}
        className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {t('admin.prev')}
      </button>
      <span className="text-xs">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => setPage(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {t('admin.next')}
      </button>
    </div>
  )
}

export default function Admin() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [logs, setLogs] = useState<CheckLog[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{ routes_checked: number } | null>(null)
  const [runError, setRunError] = useState('')
  const [error, setError] = useState('')
  const [openRuns, setOpenRuns] = useState<Set<string>>(new Set())
  const [adminTogglingId, setAdminTogglingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => {
        if (r.status === 401 || r.status === 403) { navigate('/search'); return null }
        return r.json()
      })
      .then(data => { if (data) setUsers(data) })
      .catch(() => setError(t('admin.failedToLoadUsers')))
      .finally(() => setLoadingUsers(false))

    fetch('/api/admin/logs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setLogs(data))
      .catch(() => {})
      .finally(() => setLoadingLogs(false))
  }, [navigate, t])

  async function handleRunCheck() {
    setRunning(true)
    setRunResult(null)
    setRunError('')
    try {
      const res = await fetch('/api/admin/run-check', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? t('common.somethingWentWrong'))
      setRunResult(data)
      const logsRes = await fetch('/api/admin/logs', { credentials: 'include' })
      if (logsRes.ok) setLogs(await logsRes.json())
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
    } finally {
      setRunning(false)
    }
  }

  async function handleToggleAdmin(user: AdminUser) {
    setAdminTogglingId(user.id)
    const method = user.is_admin ? 'DELETE' : 'PUT'
    try {
      const res = await fetch(`/api/admin/users/${user.id}/make-admin`, { method, credentials: 'include' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.detail ?? t('admin.failedToUpdateAdmin'))
        return
      }
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_admin: !u.is_admin } : u))
    } catch {
      setError(t('admin.failedToUpdateAdmin'))
    } finally {
      setAdminTogglingId(null)
    }
  }

  function toggleRun(runTime: string) {
    setOpenRuns(prev => {
      const next = new Set(prev)
      next.has(runTime) ? next.delete(runTime) : next.add(runTime)
      return next
    })
  }

  function fmt(n: number | null) {
    return n != null ? `€${n.toFixed(2)}` : '—'
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString(i18n.language, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => b.route_count - a.route_count),
    [users]
  )

  const runs = useMemo(() => groupIntoRuns(logs), [logs])

  const userPagination = usePagination(sortedUsers, 5)
  const runPagination = usePagination(runs, 5)

  return (
    <div className="min-h-screen bg-brand-50 dark:bg-gray-950">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">

        {/* Header + run button */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.panel')}</h1>
            <p className="text-gray-500 text-sm mt-0.5 dark:text-gray-400">{t('admin.panelSubtitle')}</p>
          </div>

          <div className="flex items-center gap-3">
            {runResult && (
              <span className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
                {t('admin.checkComplete', { n: runResult.routes_checked, count: runResult.routes_checked })}
              </span>
            )}
            {runError && (
              <span className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                {runError}
              </span>
            )}
            <button
              onClick={handleRunCheck}
              disabled={running}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition"
            >
              {running
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Play className="w-4 h-4" />}
              {running ? t('admin.running') : t('admin.runCheck')}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Users */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 dark:text-white">
            {t('admin.users')}
            {!loadingUsers && (
              <span className="ml-2 text-sm font-normal text-gray-400 dark:text-gray-500">{users.length}</span>
            )}
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden dark:bg-gray-900 dark:border-gray-800">
            {loadingUsers ? (
              <div className="h-32 animate-pulse" />
            ) : users.length === 0 ? (
              <p className="text-gray-400 text-sm p-8 text-center dark:text-gray-500">{t('admin.noUsers')}</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide dark:border-gray-800 dark:text-gray-400">
                      <th className="px-5 py-3">{t('admin.colEmail')}</th>
                      <th className="px-5 py-3">{t('admin.colJoined')}</th>
                      <th className="px-5 py-3 text-right">{t('admin.colSavedSearches')}</th>
                      <th className="px-5 py-3 text-center">{t('admin.colAdmin')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userPagination.slice.map(u => (
                      <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition dark:border-gray-800 dark:hover:bg-gray-800">
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{u.email}</td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{fmtDate(u.created_at)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-semibold ${u.route_count > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-600'}`}>
                            {u.route_count}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <button
                            role="switch"
                            aria-checked={u.is_admin}
                            aria-label={u.is_admin ? t('admin.revokeAdmin') : t('admin.makeAdmin')}
                            onClick={() => handleToggleAdmin(u)}
                            disabled={adminTogglingId === u.id}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                              u.is_admin ? 'bg-brand-600 dark:bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                              u.is_admin ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination
                  page={userPagination.page}
                  totalPages={userPagination.totalPages}
                  setPage={userPagination.setPage}
                />
              </>
            )}
          </div>
        </section>

        {/* Scheduler logs */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 dark:text-white">
            {t('admin.logs')}
            {!loadingLogs && (
              <span className="ml-2 text-sm font-normal text-gray-400 dark:text-gray-500">
                {t('admin.runCount', { n: runs.length, count: runs.length })}
                {logs.length === 200 ? t('admin.last200') : ''}
              </span>
            )}
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden dark:bg-gray-900 dark:border-gray-800">
            {loadingLogs ? (
              <div className="h-32 animate-pulse" />
            ) : runs.length === 0 ? (
              <p className="text-gray-400 text-sm p-8 text-center dark:text-gray-500">
                {t('admin.noLogsYet')}
              </p>
            ) : (
              <>
                {runPagination.slice.map(run => {
                  const isOpen = openRuns.has(run.runTime)
                  const goalsReached = run.logs.filter(l => l.price_goal_reached || l.available_goal_reached).length
                  const errors = run.logs.filter(l => l.error).length
                  return (
                    <div key={run.runTime} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                      {/* Run header row */}
                      <button
                        onClick={() => toggleRun(run.runTime)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition text-left dark:hover:bg-gray-800"
                      >
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 dark:text-gray-500" />
                          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 dark:text-gray-500" />}
                        <span className="font-medium text-gray-900 text-sm min-w-[160px] dark:text-white">
                          {fmtDate(run.runTime)}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t('admin.routesCount', { n: run.logs.length, count: run.logs.length })}
                        </span>
                        {goalsReached > 0 && (
                          <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
                            {t('admin.goalsReached', { n: goalsReached, count: goalsReached })}
                          </span>
                        )}
                        {errors > 0 && (
                          <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                            {t('admin.errorsCount', { n: errors, count: errors })}
                          </span>
                        )}
                      </button>

                      {/* Expanded log rows */}
                      {isOpen && (
                        <div className="border-t border-gray-50 overflow-x-auto dark:border-gray-800">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide dark:bg-gray-800 dark:text-gray-400">
                                <th className="px-5 py-2.5">{t('admin.colRoute')}</th>
                                <th className="px-5 py-2.5">{t('admin.colDates')}</th>
                                <th className="px-5 py-2.5 text-right">{t('admin.colOutbound')}</th>
                                <th className="px-5 py-2.5 text-right">{t('admin.colInbound')}</th>
                                <th className="px-5 py-2.5 text-right">{t('admin.colTotal')}</th>
                                <th className="px-5 py-2.5 text-center">{t('admin.colPriceGoal')}</th>
                                <th className="px-5 py-2.5 text-center">{t('admin.colAvailGoal')}</th>
                                <th className="px-5 py-2.5">{t('admin.colError')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.logs.map(log => (
                                <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50 transition dark:border-gray-800 dark:hover:bg-gray-800">
                                  <td className="px-5 py-2.5 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                                    {log.origin} → {log.destination}
                                  </td>
                                  <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap text-xs dark:text-gray-400">
                                    {log.date_from}<br />{log.date_to}
                                  </td>
                                  <td className="px-5 py-2.5 text-right text-gray-700 dark:text-gray-300">{fmt(log.outbound_price)}</td>
                                  <td className="px-5 py-2.5 text-right text-gray-700 dark:text-gray-300">{fmt(log.inbound_price)}</td>
                                  <td className="px-5 py-2.5 text-right font-medium text-gray-900 dark:text-white">{fmt(log.total_price)}</td>
                                  <td className="px-5 py-2.5 text-center">
                                    {log.price_goal_reached
                                      ? <span className="text-green-600 font-semibold dark:text-green-400">✓</span>
                                      : <span className="text-gray-300 dark:text-gray-600">—</span>}
                                  </td>
                                  <td className="px-5 py-2.5 text-center">
                                    {log.available_goal_reached
                                      ? <span className="text-green-600 font-semibold dark:text-green-400">✓</span>
                                      : <span className="text-gray-300 dark:text-gray-600">—</span>}
                                  </td>
                                  <td className="px-5 py-2.5 text-red-500 text-xs max-w-[160px] truncate dark:text-red-400">
                                    {log.error ?? ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
                <Pagination
                  page={runPagination.page}
                  totalPages={runPagination.totalPages}
                  setPage={runPagination.setPage}
                />
              </>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
