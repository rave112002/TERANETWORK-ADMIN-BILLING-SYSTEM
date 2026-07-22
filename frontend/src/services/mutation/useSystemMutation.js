import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import { setDryRun } from "@services/api/systemApi";
import { DRY_RUN_QUERY_KEY } from "@services/query/useSystemQuery";

/** Toggle the DRY_RUN kill switch (super_admin). Refreshes the state on success. */
export const useSetDryRun = (args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn: setDryRun,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: DRY_RUN_QUERY_KEY });
      messageApi?.open({
        type: "success",
        content: data?.data?.enabled ? "Dry-run mode enabled" : "Dry-run mode disabled",
      });
      args.onSuccess?.(data, params, context);
    },
    onError: (error) => {
      const content =
        error?.response?.data?.message || "Could not change dry-run mode.";
      messageApi?.open({ type: "error", content });
      args.onError?.(error);
    },
  });
};
