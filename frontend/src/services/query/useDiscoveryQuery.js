import { useQuery } from "@tanstack/react-query";
import { listRuns, listRunItems } from "@services/api/discoveryApi";

export const DISCOVERY_RUNS_KEY = ["discovery", "runs"];
export const DISCOVERY_ITEMS_KEY = ["discovery", "items"];

/** Recent discovery runs. */
export const useDiscoveryRuns = () =>
  useQuery({
    queryKey: DISCOVERY_RUNS_KEY,
    queryFn: listRuns,
    select: (res) => res?.data ?? [],
  });

/** Staged items for a run, filtered by bucket ('new'|'matched'|'orphaned'|undefined). */
export const useDiscoveryItems = (runId, bucket) =>
  useQuery({
    queryKey: [...DISCOVERY_ITEMS_KEY, runId, bucket ?? "all"],
    queryFn: () => listRunItems({ runId, params: bucket ? { bucket } : {} }),
    select: (res) => res?.data ?? [],
    enabled: !!runId,
  });
