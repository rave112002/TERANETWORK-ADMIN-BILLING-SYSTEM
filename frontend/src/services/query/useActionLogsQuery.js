import { useQuery } from "@tanstack/react-query";
import { listActionLogs } from "@services/api/provisioningApi";

export const ACTION_LOGS_QUERY_KEY = ["network", "onu-action-logs"];

/**
 * Fetch one ONU's device-action history. `enabled` lets the caller only load it
 * when the log drawer is actually open.
 */
export const useActionLogs = (onuId, enabled = true) =>
  useQuery({
    queryKey: [...ACTION_LOGS_QUERY_KEY, onuId],
    queryFn: () => listActionLogs({ id: onuId, params: { limit: 100 } }),
    select: (res) => res?.data ?? [],
    enabled: !!onuId && enabled,
  });
