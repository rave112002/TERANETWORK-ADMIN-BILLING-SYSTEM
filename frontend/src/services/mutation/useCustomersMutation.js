import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@services/api/customersApi";
import { CUSTOMERS_QUERY_KEY } from "@services/query/useCustomersQuery";

const useCustomerMutation = (mutationFn, successMessage, args = {}) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn,
    onSuccess: (data, params, context) => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
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

export const useCreateCustomer = (args) =>
  useCustomerMutation(createCustomer, "Customer created", args);

export const useUpdateCustomer = (args) =>
  useCustomerMutation(updateCustomer, "Customer updated", args);

export const useDeleteCustomer = (args) =>
  useCustomerMutation(deleteCustomer, "Customer deactivated", args);
