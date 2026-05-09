export default function PageLoader({ message = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

export function SkeletonRow({ cols = 4 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
        </td>
      ))}
    </tr>
  );
}
