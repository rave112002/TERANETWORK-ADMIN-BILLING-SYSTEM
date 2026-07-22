import { useQuery } from "@tanstack/react-query";
import { getDryRun } from "@services/api/systemApi";

export const DRY_RUN_QUERY_KEY = ["system", "dry-run"];

/** Current DRY_RUN kill-switch state (boolean). */
export const useDryRun = () =>
  useQuery({
    queryKey: DRY_RUN_QUERY_KEY,
    queryFn: getDryRun,
    select: (res) => res?.data?.enabled ?? false,
  });
