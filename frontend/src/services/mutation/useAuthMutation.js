import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MessageContext } from "@helpers/message-context";
import { loginApi } from "@services/api/authApi";
import { useAuthStore } from "@store/useAuthStore";

/**
 * Login mutation. On success, stores the access token + user in the auth store.
 * Pass { onSuccess, onError } to hook into the caller's own handling (e.g. navigation).
 */
export const useLoginMutation = (args = {}) => {
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  const messageApi = useContext(MessageContext);

  return useMutation({
    mutationFn: (payload) => loginApi({ body: payload }),

    onSuccess: (data, params, context) => {
      // Backend shape: { success, message, data: { accessToken, refreshToken, user } }
      const accessToken = data?.data?.accessToken;
      const user = data?.data?.user;

      setAuth({ token: accessToken, user });
      queryClient.clear(); // drop any cached queries from a previous session

      messageApi?.open({ type: "success", content: "Signed in" });

      args.onSuccess?.(data, params, context);
    },

    onError: (error) => {
      const content =
        error?.response?.data?.message || "Sign in failed. Please try again.";
      messageApi?.open({ type: "error", content });
      args.onError?.(error);
    },
  });
};
