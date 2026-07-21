import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import { createPlan, updatePlan, deletePlan } from "@services/api/plansApi";
import { PLANS_QUERY_KEY } from "@services/query/usePlansQuery";

/**
 * Shared factory: builds a plans mutation that, on success, invalidates the
 * plans list (triggering a refetch) and shows a success message.
 */
const usePlanMutation = (mutationFn, successMessage, args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
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

export const useCreatePlan = (args) =>
  usePlanMutation(createPlan, "Plan created", args);

export const useUpdatePlan = (args) =>
  usePlanMutation(updatePlan, "Plan updated", args);

export const useDeletePlan = (args) =>
  usePlanMutation(deletePlan, "Plan deactivated", args);
