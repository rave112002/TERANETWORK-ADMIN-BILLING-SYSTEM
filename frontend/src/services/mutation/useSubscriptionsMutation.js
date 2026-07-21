import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import {
  createSubscription,
  updateSubscription,
  changeSubscriptionStatus,
} from "@services/api/subscriptionsApi";
import { SUBSCRIPTIONS_QUERY_KEY } from "@services/query/useSubscriptionsQuery";

const useSubscriptionMutation = (mutationFn, successMessage, args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_QUERY_KEY });
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

export const useCreateSubscription = (args) =>
  useSubscriptionMutation(createSubscription, "Subscription created", args);
export const useUpdateSubscription = (args) =>
  useSubscriptionMutation(updateSubscription, "Subscription updated", args);
export const useChangeSubscriptionStatus = (args) =>
  useSubscriptionMutation(
    changeSubscriptionStatus,
    "Subscription status updated",
    args,
  );
