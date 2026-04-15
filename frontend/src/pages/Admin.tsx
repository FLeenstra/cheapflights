import { ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'

interface AdminUser {
  id: string
  email: string
  created_at: string
  route_count: number
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
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
      <button
        onClick={() => setPage(page - 1)}
        disabled={page === 1}
        className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Prev
      </button>
      <span className="text-xs">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => setPage(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Next
      </button>
    </div>
  )
}

export default function Admin() {
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

  useEffect(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => {
        if (r.status === 401 || r.status === 403) { navigate('/search'); return null }
        return r.json()
      })
      .then(data => { if (data) setUsers(data) })
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoadingUsers(false))

    fetch('/api/admin/logs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setLogs(data))
      .catch(() => {})
      .finally(() => setLoadingLogs(false))
  }, [navigate])

  async function handleRunCheck() {
    setRunning(true)
    setRunResult(null)
    setRunError('')
    try {
      const res = await fetch('/api/admin/run-check', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Run failed')
      setRunResult(data)
      const logsRes = await fetch('/api/admin/logs', { credentials: 'include' })
      if (logsRes.ok) setLogs(await logsRes.json())
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setRunning(false)
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
    return new Date(iso).toLocaleString('en-GB', {
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
    <div className="min-h-screen bg-brand-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">

        {/* Header + run button */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin panel</h1>
            <p className="text-gray-500 text-sm mt-0.5">Scheduler logs, users, and manual controls</p>
          </div>

          <div className="flex items-center gap-3">
            {runResult && (
              <span className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
                Checked {runResult.routes_checked} route{runResult.routes_checked !== 1 ? 's' : ''}
              </span>
            )}
            {runError && (
              <span className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
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
              {running ? 'Running…' : 'Run check now'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Users */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Users
            {!loadingUsers && (
              <span className="ml-2 text-sm font-normal text-gray-400">{users.length}</span>
            )}
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {loadingUsers ? (
              <div className="h-32 animate-pulse" />
            ) : users.length === 0 ? (
              <p className="text-gray-400 text-sm p-8 text-center">No users yet.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
                      <th className="px-5 py-3">Email</th>
                      <th className="px-5 py-3">Joined</th>
                      <th className="px-5 py-3 text-right">Saved searches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userPagination.slice.map(u => (
                      <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                        <td className="px-5 py-3 font-medium text-gray-900">{u.email}</td>
                        <td className="px-5 py-3 text-gray-500">{fmtDate(u.created_at)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-semibold ${u.route_count > 0 ? 'text-brand-600' : 'text-gray-400'}`}>
                            {u.route_count}
                          </span>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Scheduler logs
            {!loadingLogs && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                {runs.length} run{runs.length !== 1 ? 's' : ''}
                {logs.length === 200 ? ' (last 200 entries)' : ''}
              </span>
            )}
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {loadingLogs ? (
              <div className="h-32 animate-pulse" />
            ) : runs.length === 0 ? (
              <p className="text-gray-400 text-sm p-8 text-center">
                No scheduler logs yet. Run the check or wait for the hourly job.
              </p>
            ) : (
              <>
                {runPagination.slice.map(run => {
                  const isOpen = openRuns.has(run.runTime)
                  const goalsReached = run.logs.filter(l => l.price_goal_reached || l.available_goal_reached).length
                  const errors = run.logs.filter(l => l.error).length
                  return (
                    <div key={run.runTime} className="border-b border-gray-100 last:border-0">
                      {/* Run header row */}
                      <button
                        onClick={() => toggleRun(run.runTime)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition text-left"
                      >
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                        <span className="font-medium text-gray-900 text-sm min-w-[160px]">
                          {fmtDate(run.runTime)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {run.logs.length} route{run.logs.length !== 1 ? 's' : ''} checked
                        </span>
                        {goalsReached > 0 && (
                          <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                            {goalsReached} goal{goalsReached !== 1 ? 's' : ''} reached
                          </span>
                        )}
                        {errors > 0 && (
                          <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                            {errors} error{errors !== 1 ? 's' : ''}
                          </span>
                        )}
                      </button>

                      {/* Expanded log rows */}
                      {isOpen && (
                        <div className="border-t border-gray-50 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-5 py-2.5">Route</th>
                                <th className="px-5 py-2.5">Dates</th>
                                <th className="px-5 py-2.5 text-right">Outbound</th>
                                <th className="px-5 py-2.5 text-right">Inbound</th>
                                <th className="px-5 py-2.5 text-right">Total</th>
                                <th className="px-5 py-2.5 text-center">Price goal</th>
                                <th className="px-5 py-2.5 text-center">Avail. goal</th>
                                <th className="px-5 py-2.5">Error</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.logs.map(log => (
                                <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50 transition">
                                  <td className="px-5 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                                    {log.origin} → {log.destination}
                                  </td>
                                  <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                                    {log.date_from}<br />{log.date_to}
                                  </td>
                                  <td className="px-5 py-2.5 text-right text-gray-700">{fmt(log.outbound_price)}</td>
                                  <td className="px-5 py-2.5 text-right text-gray-700">{fmt(log.inbound_price)}</td>
                                  <td className="px-5 py-2.5 text-right font-medium text-gray-900">{fmt(log.total_price)}</td>
                                  <td className="px-5 py-2.5 text-center">
                                    {log.price_goal_reached
                                      ? <span className="text-green-600 font-semibold">✓</span>
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-5 py-2.5 text-center">
                                    {log.available_goal_reached
                                      ? <span className="text-green-600 font-semibold">✓</span>
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-5 py-2.5 text-red-500 text-xs max-w-[160px] truncate">
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
