export default function ConsoleLoading() {
  return (
    <div className="space-y-10 animate-pulse" aria-busy="true" aria-label="Loading page">
      <div className="space-y-3">
        <div className="h-3.5 w-32 rounded-full bg-fill" />
        <div className="h-11 w-72 max-w-full rounded-2xl bg-fill" />
      </div>
      <div className="surface-soft grid gap-6 px-7 py-6 sm:grid-cols-3">
        <div className="space-y-2">
          <div className="h-8 w-16 rounded-lg bg-fill-2" />
          <div className="h-3.5 w-28 rounded-full bg-fill-2" />
        </div>
        <div className="space-y-2">
          <div className="h-8 w-16 rounded-lg bg-fill-2" />
          <div className="h-3.5 w-28 rounded-full bg-fill-2" />
        </div>
        <div className="space-y-2">
          <div className="h-8 w-16 rounded-lg bg-fill-2" />
          <div className="h-3.5 w-28 rounded-full bg-fill-2" />
        </div>
      </div>
      <div className="card p-6 space-y-4">
        <div className="h-4 w-48 rounded-full bg-fill" />
        <div className="h-10 w-full rounded-xl bg-fill" />
        <div className="h-10 w-full rounded-xl bg-fill" />
        <div className="h-10 w-5/6 rounded-xl bg-fill" />
      </div>
    </div>
  );
}
