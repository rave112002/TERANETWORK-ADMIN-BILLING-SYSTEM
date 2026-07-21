import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import { createNap, updateNap, deleteNap } from "@services/api/napsApi";
import { NAPS_QUERY_KEY } from "@services/query/useNapsQuery";

const useNapMutation = (mutationFn, successMessage, args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: NAPS_QUERY_KEY });
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

export const useCreateNap = (args) =>
  useNapMutation(createNap, "NAP created", args);
export const useUpdateNap = (args) =>
  useNapMutation(updateNap, "NAP updated", args);
export const useDeleteNap = (args) =>
  useNapMutation(deleteNap, "NAP deleted", args);
