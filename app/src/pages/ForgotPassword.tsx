import { useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './Auth.module.css'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Failed to send reset email')
      setSent(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>sulla</div>

        {sent ? (
          <>
            <div className={styles.successIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <h1 className={styles.title}>Check your email</h1>
            <p className={styles.subtitle}>
              We sent a reset link to <strong>{email}</strong>
            </p>
            <Link to="/login" className={styles.backLink}>Back to sign in</Link>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Reset your password</h1>
            <p className={styles.subtitle}>Enter your email and we'll send you a reset link</p>

            <form onSubmit={handleSubmit} className={styles.form}>
              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              <button className={styles.submitBtn} type="submit" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <p className={styles.footer}>
              Remember your password? <Link to="/login" className={styles.link}>Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
