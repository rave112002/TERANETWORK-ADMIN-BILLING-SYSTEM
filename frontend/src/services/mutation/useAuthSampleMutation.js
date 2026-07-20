import { MessageContext } from "@helpers/message-context";
import { adminLoginApi } from "@hooks/api/api-auth";
import { useAuthStore } from "@hooks/store/use-auth-store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";

export const useCreateLoginMutation = (args) => {
  const queryClient = useQueryClient();
  const {
    setIsAuthenticated,
    setToken,
    setUserData,
    setRoles,
    setPermissions,
  } = useAuthStore();
  const messageApi = useContext(MessageContext);
  return useMutation({
    mutationFn: (createLoginPayload) => {
      return adminLoginApi({ body: createLoginPayload });
    },
    onError: (error) => {
      if (error) {
        messageApi.open({
          type: "error",
          content: error.response?.data?.message || "An error occurred",
        });
      } else {
        messageApi.open({
          type: "error",
          content: "An error occurred",
        });
      }
      if (args?.onError) {
        args.onError(error);
      }
    },
    onSuccess: (data, params, context) => {
      if (data) {
        setUserData(data?.data);
        setToken(data.token);
        setIsAuthenticated(true);
        setRoles(data?.data?.roles);
        setPermissions(data?.permissions);
        queryClient.clear();
        // queryClient.invalidateQueries();
        // queryClient.refetchQueries();
      }
      if (args?.onSuccess) {
        args.onSuccess(data, params, context);
      }
      messageApi.open({
        type: "success",
        content: "Login successful",
      });
    },

    // ...args, OVER RIDE
  });
};
