type LoadingSpinnerProps = {
  inline?: boolean;
  label?: string;
};

export function LoadingSpinner({
  inline = false,
  label = "Loading...",
}: LoadingSpinnerProps) {
  const content = (
    <div className="flex items-center gap-3">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-primary" />
      <span className="text-sm text-zinc-600">{label}</span>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-zinc-200 bg-white">
      {content}
    </div>
  );
}
