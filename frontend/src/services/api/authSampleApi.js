import { defaultAxios, httpMethod } from "./axios";

export const adminLoginApi = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, "/api/admin/auth/login", {
    data: body,
  });
  return res.data;
};
