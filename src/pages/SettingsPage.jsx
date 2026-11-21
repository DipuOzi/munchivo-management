import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
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
  const { t } = useTranslation()
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
        <h1>{t('Settings')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t('Manage your account, business details and alert preferences.')}
        </p>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {notice && <div className="alert alert--success">{notice}</div>}

      <div className="settings-tabs" role="tablist" aria-label={t('Settings sections')}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`settings-tabs__btn${tab === item.id ? ' is-active' : ''}`}
            onClick={() => {
              setTab(item.id)
              setError('')
            }}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="card">
          <div className="empty">{t('Loading settings…')}</div>
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
              onSaved={() => flash(t('Password updated. Other devices were signed out.'))}
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
  const { t } = useTranslation()
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
    if (!form.name.trim()) return onError(t('Name is required.'))
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      return onError(t('Enter a valid email address.'))
    }
    setSaving(true)
    try {
      await api('/api/settings/profile', { method: 'PATCH', body: form })
      await onSaved(t('Profile updated.'))
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card__title">
        <h3>{t('Your profile')}</h3>
        <span className="badge badge--neutral">
          {t(ROLE_LABEL[profile.role] || profile.role || 'Owner')}
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label className="field__label">{t('Full name *')}</label>
            <input
              className="field__control"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Email address *')}</label>
            <input
              className="field__control"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
          <div className="field field--full">
            <p className="settings-hint">
              {t(
                'This email is used to sign in. Changing it takes effect immediately; your current session stays active.',
              )}
            </p>
          </div>
        </div>

        <div className="modal__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('Saving…') : t('Save profile')}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function BusinessForm({ business, onSaved, onError }) {
  const { t } = useTranslation()
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
    if (!form.businessName.trim()) return onError(t('Business name is required.'))
    const days = Number(form.expiryAlertDays)
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      return onError(t('Expiry alert days must be between 1 and 60.'))
    }
    setSaving(true)
    try {
      await api('/api/settings/business', {
        method: 'PATCH',
        body: { ...form, expiryAlertDays: days },
      })
      await onSaved(t('Business settings saved.'))
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card__title">
        <h3>{t('Business details')}</h3>
        <span className="badge badge--neutral">BDT · ৳</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label className="field__label">{t('Business name *')}</label>
            <input
              className="field__control"
              value={form.businessName}
              onChange={(e) => set('businessName', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Legal / registered name')}</label>
            <input
              className="field__control"
              value={form.legalName}
              onChange={(e) => set('legalName', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Phone')}</label>
            <input
              className="field__control"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+880 1XXX XXXXXX"
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Timezone')}</label>
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
            <label className="field__label">{t('Address')}</label>
            <textarea
              className="field__control"
              rows="2"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Expiry alert window (days)')}</label>
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
              {t(
                'Stock is flagged when it expires within this many days. Used by the dashboard, expiry page and the daily alert job.',
              )}
            </p>
          </div>
          <div className="field">
            <label className="field__label">{t('Currency')}</label>
            <input className="field__control" value={t('BDT — Bangladeshi Taka')} disabled />
          </div>
          <div className="field field--full">
            <label className="field__label">{t('Receipt footer')}</label>
            <input
              className="field__control"
              value={form.receiptFooter}
              onChange={(e) => set('receiptFooter', e.target.value)}
              placeholder={t('Thank you for choosing Munchivo!')}
            />
          </div>
        </div>

        <div className="modal__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('Saving…') : t('Save business settings')}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function PasswordForm({ onSaved, onError }) {
  const { t } = useTranslation()
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
      return onError(t('Fill in both password fields.'))
    }
    if (form.newPassword.length < 8) {
      return onError(t('New password must be at least 8 characters.'))
    }
    if (form.newPassword !== form.confirmPassword) {
      return onError(t('New password and confirmation do not match.'))
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
        <h3>{t('Change password')}</h3>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">{t('Current password *')}</label>
            <input
              className="field__control"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => set('currentPassword', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('New password *')}</label>
            <input
              className="field__control"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => set('newPassword', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Confirm new password *')}</label>
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
              {t(
                'Use at least 8 characters. For security, all other signed-in devices are logged out after the change.',
              )}
            </p>
          </div>
        </div>

        <div className="modal__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('Updating…') : t('Update password')}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function TeamList({ team, currentUserId }) {
  const { t, locale } = useTranslation()
  return (
    <div className="card card--flush">
      <div className="card__title" style={{ padding: '20px 20px 0' }}>
        <h3>{t('Team accounts')}</h3>
        <span className="badge badge--neutral">
          {t(team.length === 1 ? '{count} account' : '{count} accounts', {
            count: team.length,
          })}
        </span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Name')}</th>
              <th>{t('Email')}</th>
              <th>{t('Role')}</th>
              <th>{t('Status')}</th>
              <th>{t('Added')}</th>
            </tr>
          </thead>
          <tbody>
            {team.map((member) => (
              <tr key={member.id}>
                <td>
                  <strong>{member.name}</strong>
                  {member.id === currentUserId && (
                    <> <span className="badge badge--success">{t('You')}</span></>
                  )}
                </td>
                <td>{member.email}</td>
                <td>{t(ROLE_LABEL[member.role] || member.role)}</td>
                <td>
                  {member.isActive ? (
                    <span className="badge badge--success">{t('Active')}</span>
                  ) : (
                    <span className="badge badge--neutral">{t('Disabled')}</span>
                  )}
                </td>
                <td>{formatDate(member.createdAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        <p className="settings-hint">
          {t(
            'Accounts are provisioned with the npm run setup:partners script. Each partner signs in with their own email and password.',
          )}
        </p>
      </div>
    </div>
  )
}
