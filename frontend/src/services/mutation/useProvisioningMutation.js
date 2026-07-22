import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import { deactivateOnu, activateOnu, statusOnu } from "@services/api/provisioningApi";
import { ONUS_QUERY_KEY } from "@services/query/useOnusQuery";
import { ACTION_LOGS_QUERY_KEY } from "@services/query/useActionLogsQuery";

/**
 * Shared mutation for the manual ONU actions. On success it refreshes the ONU
 * list + action logs and shows a "queued" message (the worker does the actual
 * device work asynchronously).
 */
const useProvisioningMutation = (mutationFn, successMessage, args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: ONUS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ACTION_LOGS_QUERY_KEY });
      // The server returns { deduped } when a job was already queued.
      const deduped = data?.data?.deduped;
      messageApi?.open({
        type: deduped ? "warning" : "success",
        content: deduped ? "A job was already queued for this ONU" : successMessage,
      });
      args.onSuccess?.(data, params, context);
    },
    onError: (error) => {
      const content =
        error?.response?.data?.message || "Something went wrong. Please try again.";
      messageApi?.open({ type: "error", content });
      args.onError?.(error);
    },
  });
};

export const useDeactivateOnu = (args) =>
  useProvisioningMutation(deactivateOnu, "Deactivate job queued", args);
export const useActivateOnu = (args) =>
  useProvisioningMutation(activateOnu, "Activate job queued", args);
export const useStatusOnu = (args) =>
  useProvisioningMutation(statusOnu, "Status read queued", args);
