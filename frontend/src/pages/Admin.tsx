import { Play, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
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
      // Refresh logs after run
      const logsRes = await fetch('/api/admin/logs', { credentials: 'include' })
      if (logsRes.ok) setLogs(await logsRes.json())
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setRunning(false)
    }
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Joined</th>
                    <th className="px-5 py-3 text-right">Saved searches</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
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
            )}
          </div>
        </section>

        {/* Scheduler logs */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Scheduler logs
            {!loadingLogs && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                {logs.length}{logs.length === 200 ? ' (last 200)' : ''}
              </span>
            )}
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            {loadingLogs ? (
              <div className="h-32 animate-pulse" />
            ) : logs.length === 0 ? (
              <p className="text-gray-400 text-sm p-8 text-center">
                No scheduler logs yet. Run the check or wait for the hourly job.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3">Route</th>
                    <th className="px-5 py-3">Dates</th>
                    <th className="px-5 py-3">Checked</th>
                    <th className="px-5 py-3 text-right">Outbound</th>
                    <th className="px-5 py-3 text-right">Inbound</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-center">Price goal</th>
                    <th className="px-5 py-3 text-center">Avail. goal</th>
                    <th className="px-5 py-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                      <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {log.origin} → {log.destination}
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {log.date_from}<br />{log.date_to}
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {fmtDate(log.checked_at)}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-700">{fmt(log.outbound_price)}</td>
                      <td className="px-5 py-3 text-right text-gray-700">{fmt(log.inbound_price)}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">{fmt(log.total_price)}</td>
                      <td className="px-5 py-3 text-center">
                        {log.price_goal_reached
                          ? <span className="text-green-600 font-semibold">✓</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {log.available_goal_reached
                          ? <span className="text-green-600 font-semibold">✓</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-red-500 text-xs max-w-[160px] truncate">
                        {log.error ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
