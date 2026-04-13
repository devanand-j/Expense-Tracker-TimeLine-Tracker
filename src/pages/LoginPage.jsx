import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const { dark } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { data, error } = await signInWithGoogle();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (data?.url) window.location.href = data.url;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f1f1f1] px-4 dark:bg-[#1f1f1f]">
      <div className="login-card w-full max-w-md rounded-md border border-[#dddddd] bg-white p-8 shadow-card dark:border-[#444] dark:bg-[#2b2b2b]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-teal text-white">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-teal">Team Portal</p>
            <h1 className="text-xl font-bold text-black dark:text-white">Timeline & Expense Tracker</h1>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-black dark:text-white">Welcome back</h2>
        <p className="mt-2 text-sm text-[#555555] dark:text-[#c4c4c4]">
          Sign in to track your time, manage expenses, and view reports.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {['Timeline', 'Expenses', 'Reports'].map((f) => (
            <span key={f} className="rounded-full border border-[#dddddd] bg-[#f1f1f1] px-3 py-1 text-xs font-semibold text-[#555555] dark:border-[#444] dark:bg-[#3a3a3a] dark:text-[#e5e5e5]">
              {f}
            </span>
          ))}
        </div>

        <button
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-md border border-[#038a5c] bg-[#04AA6D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#038a5c] disabled:opacity-60"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>Redirecting to Google…</span>
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

        <p className="mt-6 text-center text-xs text-[#777] dark:text-[#aaa]">
          By signing in, you agree to your organization&apos;s usage policies.
        </p>
      </div>
    </div>
  );
}
