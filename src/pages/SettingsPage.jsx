import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { formatDate } from '../shared/dates.js'

const TABS = [
  { id: 'profile', label: 'Your profile' },
  { id: 'business', label: 'Business' },
  { id: 'password', label: 'Password' },
  { id: 'team', label: 'Team' },
]

const TIMEZONES = [
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'UTC',
]

const ROLE_LABEL = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const [tab, setTab] = useState('profile')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api('/api/settings'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function flash(message) {
    setNotice(message)
    setError('')
    window.setTimeout(() => setNotice(''), 4000)
  }

  return (
    <>
      <div>
        <h1>Settings</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Manage your account, business details and alert preferences.
        </p>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {notice && <div className="alert alert--success">{notice}</div>}

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`settings-tabs__btn${tab === t.id ? ' is-active' : ''}`}
            onClick={() => {
              setTab(t.id)
              setError('')
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="card">
          <div className="empty">Loading settings…</div>
        </div>
      ) : (
        <>
          {tab === 'profile' && (
            <ProfileForm
              profile={{ ...data.profile, ...(user || {}) }}
              onSaved={async (message) => {
                await refreshUser()
                await load()
                flash(message)
              }}
              onError={setError}
            />
          )}

          {tab === 'business' && (
            <BusinessForm
              business={data.business}
              onSaved={async (message) => {
                await load()
                flash(message)
              }}
              onError={setError}
            />
          )}

          {tab === 'password' && (
            <PasswordForm
              onSaved={() => flash('Password updated. Other devices were signed out.')}
              onError={setError}
            />
          )}

          {tab === 'team' && <TeamList team={data.team} currentUserId={user?.id} />}
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function ProfileForm({ profile, onSaved, onError }) {
  const [form, setForm] = useState({
    name: profile.name || '',
    email: profile.email || '',
  })
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    onError('')
    if (!form.name.trim()) return onError('Name is required.')
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      return onError('Enter a valid email address.')
    }
    setSaving(true)
    try {
      await api('/api/settings/profile', { method: 'PATCH', body: form })
      await onSaved('Profile updated.')
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card__title">
        <h3>Your profile</h3>
        <span className="badge badge--neutral">
          {ROLE_LABEL[profile.role] || profile.role || 'Owner'}
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label className="field__label">Full name *</label>
            <input
              className="field__control"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Email address *</label>
            <input
              className="field__control"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
          <div className="field field--full">
            <p className="settings-hint">
              This email is used to sign in. Changing it takes effect immediately;
              your current session stays active.
            </p>
          </div>
        </div>

        <div className="modal__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function BusinessForm({ business, onSaved, onError }) {
  const [form, setForm] = useState({
    businessName: business.businessName || '',
    legalName: business.legalName || '',
    phone: business.phone || '',
    address: business.address || '',
    timezone: business.timezone || 'Asia/Dhaka',
    expiryAlertDays: business.expiryAlertDays ?? 7,
    receiptFooter: business.receiptFooter || '',
  })
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    onError('')
    if (!form.businessName.trim()) return onError('Business name is required.')
    const days = Number(form.expiryAlertDays)
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      return onError('Expiry alert days must be between 1 and 60.')
    }
    setSaving(true)
    try {
      await api('/api/settings/business', {
        method: 'PATCH',
        body: { ...form, expiryAlertDays: days },
      })
      await onSaved('Business settings saved.')
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card__title">
        <h3>Business details</h3>
        <span className="badge badge--neutral">BDT · ৳</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label className="field__label">Business name *</label>
            <input
              className="field__control"
              value={form.businessName}
              onChange={(e) => set('businessName', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Legal / registered name</label>
            <input
              className="field__control"
              value={form.legalName}
              onChange={(e) => set('legalName', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Phone</label>
            <input
              className="field__control"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+880 1XXX XXXXXX"
            />
          </div>
          <div className="field">
            <label className="field__label">Timezone</label>
            <select
              className="field__control"
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="field field--full">
            <label className="field__label">Address</label>
            <textarea
              className="field__control"
              rows="2"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Expiry alert window (days)</label>
            <input
              className="field__control"
              type="number"
              min="1"
              max="60"
              step="1"
              value={form.expiryAlertDays}
              onChange={(e) => set('expiryAlertDays', e.target.value)}
            />
            <p className="settings-hint">
              Stock is flagged when it expires within this many days. Used by
              the dashboard, expiry page and the daily alert job.
            </p>
          </div>
          <div className="field">
            <label className="field__label">Currency</label>
            <input className="field__control" value="BDT — Bangladeshi Taka" disabled />
          </div>
          <div className="field field--full">
            <label className="field__label">Receipt footer</label>
            <input
              className="field__control"
              value={form.receiptFooter}
              onChange={(e) => set('receiptFooter', e.target.value)}
              placeholder="Thank you for choosing Munchivo!"
            />
          </div>
        </div>

        <div className="modal__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save business settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function PasswordForm({ onSaved, onError }) {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    onError('')
    if (!form.currentPassword || !form.newPassword) {
      return onError('Fill in both password fields.')
    }
    if (form.newPassword.length < 8) {
      return onError('New password must be at least 8 characters.')
    }
    if (form.newPassword !== form.confirmPassword) {
      return onError('New password and confirmation do not match.')
    }
    setSaving(true)
    try {
      await api('/api/settings/password', {
        method: 'POST',
        body: {
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        },
      })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      onSaved()
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card__title">
        <h3>Change password</h3>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">Current password *</label>
            <input
              className="field__control"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => set('currentPassword', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">New password *</label>
            <input
              className="field__control"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => set('newPassword', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Confirm new password *</label>
            <input
              className="field__control"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => set('confirmPassword', e.target.value)}
            />
          </div>
          <div className="field field--full">
            <p className="settings-hint">
              Use at least 8 characters. For security, all other signed-in
              devices are logged out after the change.
            </p>
          </div>
        </div>

        <div className="modal__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function TeamList({ team, currentUserId }) {
  return (
    <div className="card card--flush">
      <div className="card__title" style={{ padding: '20px 20px 0' }}>
        <h3>Team accounts</h3>
        <span className="badge badge--neutral">
          {team.length} account{team.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {team.map((member) => (
              <tr key={member.id}>
                <td>
                  <strong>{member.name}</strong>
                  {member.id === currentUserId && (
                    <> <span className="badge badge--success">You</span></>
                  )}
                </td>
                <td>{member.email}</td>
                <td>{ROLE_LABEL[member.role] || member.role}</td>
                <td>
                  {member.isActive ? (
                    <span className="badge badge--success">Active</span>
                  ) : (
                    <span className="badge badge--neutral">Disabled</span>
                  )}
                </td>
                <td>{formatDate(member.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        <p className="settings-hint">
          Accounts are provisioned with the <code>npm run setup:partners</code>{' '}
          script. Each partner signs in with their own email and password.
        </p>
      </div>
    </div>
  )
}
