import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import {
  createSplitter,
  updateSplitter,
  deleteSplitter,
} from "@services/api/splittersApi";
import { SPLITTERS_QUERY_KEY } from "@services/query/useSplittersQuery";

const useSplitterMutation = (mutationFn, successMessage, args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: SPLITTERS_QUERY_KEY });
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

export const useCreateSplitter = (args) =>
  useSplitterMutation(createSplitter, "Splitter created", args);
export const useUpdateSplitter = (args) =>
  useSplitterMutation(updateSplitter, "Splitter updated", args);
export const useDeleteSplitter = (args) =>
  useSplitterMutation(deleteSplitter, "Splitter deleted", args);
