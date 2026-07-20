import { useContext } from "react";
import { MessageContext } from "@helpers/message-context";
import {
  addAnnouncementApi,
  editAnnouncementApi,
} from "@hooks/api/api-announcement";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const useAddAnnouncementMutation = (args) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);
  return useMutation({
    mutationFn: ({ body }) => {
      return addAnnouncementApi(body);
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
      if (args?.onSuccess) {
        args.onSuccess(data, params, context);
      }
      queryClient.invalidateQueries({
        queryKey: ["GET Announcements"],
      });
      messageApi.open({
        type: "success",
        content: data?.message,
      });
    },
  });
};

export const useEditAnnouncementMutation = (args) => {
  const queryClient = useQueryClient();
  const messageApi = useContext(MessageContext);
  return useMutation({
    mutationFn: ({ body, params }) => {
      return editAnnouncementApi({ body, params });
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
      if (args?.onSuccess) {
        args.onSuccess(data, params, context);
      }
      queryClient.invalidateQueries({
        queryKey: ["GET Announcements"],
      });
      messageApi.open({
        type: "success",
        content: data?.message,
      });
    },
  });
};
