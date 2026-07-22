import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import { runDiscovery, importItem } from "@services/api/discoveryApi";
import {
  DISCOVERY_RUNS_KEY,
  DISCOVERY_ITEMS_KEY,
} from "@services/query/useDiscoveryQuery";

/** Run a discovery sweep. On success, refreshes the runs list. */
export const useRunDiscovery = (args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn: runDiscovery,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: DISCOVERY_RUNS_KEY });
      const s = data?.data?.summary;
      messageApi?.open({
        type: "success",
        content: s
          ? `Discovery complete — ${s.new} new, ${s.matched} matched, ${s.orphaned} orphaned`
          : "Discovery complete",
      });
      args.onSuccess?.(data, params, context);
    },
    onError: (error) => {
      const content =
        error?.response?.data?.message || "Discovery run failed.";
      messageApi?.open({ type: "error", content });
      args.onError?.(error);
    },
  });
};

/** Import a staged item. On success, refreshes the staged items + runs. */
export const useImportItem = (args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn: importItem,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: DISCOVERY_ITEMS_KEY });
      queryClient.invalidateQueries({ queryKey: DISCOVERY_RUNS_KEY });
      messageApi?.open({ type: "success", content: "Item imported" });
      args.onSuccess?.(data, params, context);
    },
    onError: (error) => {
      const content = error?.response?.data?.message || "Import failed.";
      messageApi?.open({ type: "error", content });
      args.onError?.(error);
    },
  });
};
