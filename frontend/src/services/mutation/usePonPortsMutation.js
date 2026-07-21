import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import {
  createPonPort,
  updatePonPort,
  deletePonPort,
} from "@services/api/ponPortsApi";
import { PON_PORTS_QUERY_KEY } from "@services/query/usePonPortsQuery";

const usePonPortMutation = (mutationFn, successMessage, args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: PON_PORTS_QUERY_KEY });
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

export const useCreatePonPort = (args) =>
  usePonPortMutation(createPonPort, "PON port created", args);
export const useUpdatePonPort = (args) =>
  usePonPortMutation(updatePonPort, "PON port updated", args);
export const useDeletePonPort = (args) =>
  usePonPortMutation(deletePonPort, "PON port deleted", args);
