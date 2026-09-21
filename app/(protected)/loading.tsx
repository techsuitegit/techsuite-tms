import { LoadingSpinner } from "@/app/ui/components/loading-spinner";

export default function ProtectedLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <LoadingSpinner label="Loading…" />
    </div>
  );
}
