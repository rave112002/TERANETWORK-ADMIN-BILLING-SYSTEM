import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import { createOnu, updateOnu, deleteOnu } from "@services/api/onusApi";
import { ONUS_QUERY_KEY } from "@services/query/useOnusQuery";

const useOnuMutation = (mutationFn, successMessage, args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: ONUS_QUERY_KEY });
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

export const useCreateOnu = (args) =>
  useOnuMutation(createOnu, "ONU created", args);
export const useUpdateOnu = (args) =>
  useOnuMutation(updateOnu, "ONU updated", args);
export const useDeleteOnu = (args) =>
  useOnuMutation(deleteOnu, "ONU deleted", args);
