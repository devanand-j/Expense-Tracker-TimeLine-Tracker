import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  { icon: '⏱', label: 'Timesheet Tracking', desc: 'Log daily hours by project with approval workflow' },
  { icon: '💸', label: 'Expense Management', desc: 'Submit receipts and track reimbursements' },
  { icon: '📅', label: 'Leave Requests', desc: 'Apply for leave and get notified instantly' },
  { icon: '📊', label: 'Reports & Analytics', desc: 'Export PDF/Excel reports for any date range' }
];

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { data, error } = await signInWithGoogle();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (data?.url) window.location.href = data.url;
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-[#04AA6D] via-[#038a5c] to-[#026b47] p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">VSeek Team Tracker</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Everything your<br />team needs,<br />in one place.
          </h1>
          <p className="mt-4 text-lg text-white/75 leading-relaxed">
            Track time, manage expenses, and streamline approvals — all with real-time visibility.
          </p>

          <div className="mt-10 space-y-4">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-xl">
                  {f.icon}
                </div>
                <div>
                  <p className="font-semibold">{f.label}</p>
                  <p className="text-sm text-white/65">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-white/50">© {new Date().getFullYear()} VSeek Team Tracker. All rights reserved.</p>
      </div>

      {/* Right panel — login */}
      <div className="flex flex-1 items-center justify-center bg-[#f0f4f8] dark:bg-[#0f172a] px-6 py-12">
        <div className="login-card w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-teal shadow-teal">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white">VSeek Team Tracker</span>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card-lg dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal dark:bg-teal/20">
              <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse-soft" />
              Secure Sign In
            </div>

            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Welcome back
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Sign in with your organization Google account to continue.
            </p>

            <button
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow-md disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  <span>Redirecting…</span>
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <div className="mt-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-700" />
              <span className="text-xs text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-700" />
            </div>

            <div className="mt-6 rounded-xl bg-slate-50 dark:bg-slate-700/50 p-4">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">What you get access to:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {['Timesheets', 'Expenses', 'Leave Requests', 'Reports'].map((f) => (
                  <div key={f} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <svg className="h-3 w-3 text-teal shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-500">
              By signing in, you agree to your organization&apos;s usage policies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
