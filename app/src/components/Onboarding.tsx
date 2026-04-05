import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import styles from './Onboarding.module.css'

type Step = 'welcome' | 'account' | 'org'

export default function Onboarding() {
  const { register } = useAuth()
  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleFinish() {
    if (!name || !email || !password || !orgName) return
    setError('')
    setLoading(true)
    try {
      await register(name, email, password, orgName)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} />

      <div className={styles.modal}>
        {/* Progress dots */}
        <div className={styles.progress}>
          <div className={`${styles.dot} ${step === 'welcome' ? styles.active : ''} ${step !== 'welcome' ? styles.done : ''}`} />
          <div className={styles.line} />
          <div className={`${styles.dot} ${step === 'account' ? styles.active : ''} ${step === 'org' ? styles.done : ''}`} />
          <div className={styles.line} />
          <div className={`${styles.dot} ${step === 'org' ? styles.active : ''}`} />
        </div>

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div className={styles.stepContent}>
            <div className={styles.logo}>sulla</div>
            <h1 className={styles.title}>Welcome to Sulla Video</h1>
            <p className={styles.subtitle}>
              AI-powered video editing, right from your desktop.
              Edit by transcript, auto-remove fillers, generate clips — let Sulla handle the tedious parts.
            </p>

            <div className={styles.features}>
              <div className={styles.feature}>
                <div className={styles.featureIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </div>
                <div>
                  <div className={styles.featureTitle}>Edit by transcript</div>
                  <div className={styles.featureDesc}>Delete words from the text, they disappear from the video</div>
                </div>
              </div>
              <div className={styles.feature}>
                <div className={styles.featureIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                </div>
                <div>
                  <div className={styles.featureTitle}>AI-powered cleanup</div>
                  <div className={styles.featureDesc}>Remove fillers, trim silence, enhance audio in one click</div>
                </div>
              </div>
              <div className={styles.feature}>
                <div className={styles.featureIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M10 2v20"/><path d="M2 12h8"/></svg>
                </div>
                <div>
                  <div className={styles.featureTitle}>Auto-generate clips</div>
                  <div className={styles.featureDesc}>Sulla finds the best moments and formats them for social</div>
                </div>
              </div>
            </div>

            <button className={styles.primaryBtn} onClick={() => setStep('account')}>
              Get Started
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        )}

        {/* Step: Account */}
        {step === 'account' && (
          <div className={styles.stepContent}>
            <h1 className={styles.title}>Create your account</h1>
            <p className={styles.subtitle}>This stays local on your machine.</p>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>Full Name</label>
                <input
                  className={styles.input}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jonathon Byrdziak"
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  minLength={8}
                />
              </div>
            </div>

            <div className={styles.btnRow}>
              <button className={styles.backBtn} onClick={() => setStep('welcome')}>Back</button>
              <button
                className={styles.primaryBtn}
                onClick={() => { if (name && email && password.length >= 8) setStep('org'); else setError('Please fill in all fields (password min 8 chars)') }}
              >
                Continue
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* Step: Organization */}
        {step === 'org' && (
          <div className={styles.stepContent}>
            <h1 className={styles.title}>Name your workspace</h1>
            <p className={styles.subtitle}>You can invite team members later.</p>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>Organization Name</label>
                <input
                  className={styles.input}
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="My Company"
                  autoFocus
                />
                <span className={styles.hint}>This is where your projects and templates will live</span>
              </div>
            </div>

            <div className={styles.orgPreview}>
              <div className={styles.orgIcon}>{orgName ? orgName.charAt(0).toUpperCase() : 'M'}</div>
              <div>
                <div className={styles.orgName}>{orgName || 'My Company'}</div>
                <div className={styles.orgMeta}>1 member · Free plan</div>
              </div>
            </div>

            <div className={styles.btnRow}>
              <button className={styles.backBtn} onClick={() => setStep('account')}>Back</button>
              <button
                className={styles.primaryBtn}
                onClick={handleFinish}
                disabled={!orgName || loading}
              >
                {loading ? 'Setting up...' : 'Launch Sulla Video'}
                {!loading && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
