import { LoadingState } from "@/components/loading-state";

export default function AppLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingState label="Loading portal workspace" />
    </div>
  );
}
