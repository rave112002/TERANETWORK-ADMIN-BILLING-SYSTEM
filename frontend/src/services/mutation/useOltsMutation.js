import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import { createOlt, updateOlt, deleteOlt } from "@services/api/oltsApi";
import { OLTS_QUERY_KEY } from "@services/query/useOltsQuery";

const useOltMutation = (mutationFn, successMessage, args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: OLTS_QUERY_KEY });
      messageApi?.open({ type: "success", content: successMessage });
      args.onSuccess?.(data, params, context);
    },
    onError: (error) => {
      const content =
        error?.response?.data?.message ||
        "Something went wrong. Please try again.";
      messageApi?.open({ type: "error", content });
      args.onError?.(error);
    },
  });
};

export const useCreateOlt = (args) =>
  useOltMutation(createOlt, "OLT created", args);
export const useUpdateOlt = (args) =>
  useOltMutation(updateOlt, "OLT updated", args);
export const useDeleteOlt = (args) =>
  useOltMutation(deleteOlt, "OLT retired", args);
