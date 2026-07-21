import { useQuery } from "@tanstack/react-query";
import { listPlans } from "@services/api/plansApi";

// The cache key for the plans list. Mutations invalidate this to refetch.
export const PLANS_QUERY_KEY = ["cms", "plans"];

/**
 * Read hook for the plans list. React Query caches the result under
 * PLANS_QUERY_KEY and handles loading/error state for us.
 */
export const usePlans = () =>
  useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: listPlans,
    // The API returns { success, message, data }, so expose just the array.
    select: (res) => res?.data ?? [],
  });
