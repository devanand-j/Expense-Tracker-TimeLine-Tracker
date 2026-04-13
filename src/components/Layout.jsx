import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NAV_ICONS = {
  '/dashboard': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  '/timeline': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  '/expenses': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  '/reports': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  '/admin': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
};

export default function Layout({ children }) {
  const { profile, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();

  const navItems = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/timeline', label: 'Timeline' },
    { to: '/expenses', label: 'Expenses' },
    { to: '/reports', label: 'Reports' }
  ];

  if (profile?.role === 'admin') {
    navItems.push({ to: '/admin', label: 'Admin Panel' });
  }

  const initials = profile?.name
    ? profile.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div className="min-h-screen bg-[#f1f1f1] dark:bg-[#1f1f1f]">
      <header className="sticky top-0 z-30 border-b border-[#dddddd] bg-white/95 shadow-sm backdrop-blur dark:border-[#444444] dark:bg-[#2b2b2b]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2.5 text-ink">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal text-white shadow shadow-teal/30">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-base font-bold dark:text-white">Team Tracker</span>
          </Link>

          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={toggle}
              aria-pressed={dark}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="group flex items-center gap-2 rounded-full border border-[#dddddd] bg-white px-2 py-1.5 shadow-sm transition hover:border-[#04AA6D]/40 hover:bg-[#f1f1f1] dark:border-[#444444] dark:bg-[#2b2b2b] dark:hover:border-[#04AA6D]/40 dark:hover:bg-[#303030]"
            >
              <span className="relative flex h-8 w-14 items-center rounded-full bg-[#f1f1f1] p-1 transition-colors duration-300 dark:bg-[#1f1f1f]">
                <span
                  className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-700 shadow-md transition-transform duration-300 ease-out dark:bg-[#444444] dark:text-white ${
                    dark ? 'translate-x-6' : 'translate-x-0'
                  }`}
                >
                  {dark ? (
                    <span aria-hidden="true" className="text-sm leading-none">🌙</span>
                  ) : (
                    <span aria-hidden="true" className="text-sm leading-none">☀️</span>
                  )}
                </span>
              </span>
            </button>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
                {initials}
              </div>
              <span className="font-medium text-slate-700 dark:text-slate-200">{profile?.name}</span>
              <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-semibold capitalize text-teal dark:bg-teal/20">
                {profile?.role}
              </span>
            </div>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              onClick={async () => { await signOut(); navigate('/login'); }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
        <aside className="card h-fit p-2 dark:border-[#444444] dark:bg-[#2b2b2b]">
          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-teal text-white shadow-sm shadow-teal/30'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`
                }
              >
                {NAV_ICONS[item.to]}
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
