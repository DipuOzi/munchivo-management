import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTranslation } from '../lib/i18n.jsx'
import logoUrl from '/images/munchivo-logo.svg'

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const { t, lang, setLanguage } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')

  if (!loading && user) {
    const from = location.state?.from?.pathname || '/'
    return <Navigate to={from} replace />
  }

  function validate() {
    const next = {}
    if (!email.trim()) {
      next.email = t('Email is required.')
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = t('Enter a valid email address.')
    }
    if (!password) {
      next.password = t('Password is required.')
    } else if (password.length < 6) {
      next.password = t('Password must be at least 6 characters.')
    }
    return next
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError('')

    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      await login(email.trim(), password)
      const from = location.state?.from?.pathname || '/'
      navigate(from, { replace: true })
    } catch (err) {
      setServerError(
        err.message === 'Failed to fetch'
          ? t('Cannot reach the server. Is the API server running?')
          : err.message || t('Something went wrong. Please try again.'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__lang">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setLanguage(lang === 'en' ? 'bn' : 'en')}
            aria-label={t('Toggle language')}
          >
            {lang === 'en' ? 'বাংলা' : 'English'}
          </button>
        </div>

        <div className="login__brand">
          <img className="login__logo" src={logoUrl} alt={t('Munchivo logo')} />
          <div>
            <h1>
              {t('Munchivo')} <em>{t('Management')}</em>
            </h1>
          </div>
          <p className="login__tagline">
            {t('Business, inventory & financial control')}
          </p>
        </div>

        <span className="login__subtitle">{t('Partner sign in')}</span>

        <form className="login__form" onSubmit={handleSubmit} noValidate>
          {serverError && (
            <div className="alert alert--error" role="alert">
              {serverError}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="login-email">
              {t('Email')}
            </label>
            <input
              id="login-email"
              className="field__control"
              type="email"
              autoComplete="email"
              placeholder="you@munchivo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <span className="field__error">{errors.email}</span>}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="login-password">
              {t('Password')}
            </label>
            <div className="login__password">
              <input
                id="login-password"
                className="field__control"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(errors.password)}
                style={{ paddingRight: 76 }}
              />
              <button
                type="button"
                className="login__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('Hide password') : t('Show password')}
              >
                {showPassword ? t('Hide') : t('Show')}
              </button>
            </div>
            {errors.password && (
              <span className="field__error">{errors.password}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn--primary login__submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner" aria-hidden="true" />
                {t('Signing in…')}
              </>
            ) : (
              t('Sign in')
            )}
          </button>
        </form>

        <p className="login__footnote">
          {t('Internal use only · Access restricted to Munchivo partners')}
        </p>
      </div>
    </div>
  )
}
