import { defaultAxios, httpMethod } from "./axios";

/**
 * POST /api/v1/auth/login
 * @param {{ body: { email: string, password: string } }} args
 * @returns {Promise<object>} The response body: { success, message, data: { accessToken, refreshToken, user } }
 */
export const loginApi = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, "/api/v1/auth/login", {
    data: body,
  });
  return res.data;
};

/**
 * GET /api/v1/auth/me — the current authenticated user.
 */
export const meApi = async () => {
  const res = await defaultAxios(httpMethod.GET, "/api/v1/auth/me");
  return res.data;
};
