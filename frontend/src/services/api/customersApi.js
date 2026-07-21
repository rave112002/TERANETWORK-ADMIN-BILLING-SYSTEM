import { defaultAxios, httpMethod } from "./axios";

const BASE = "/api/v1/cms/customers";

/**
 * GET customers. The backend supports ?search=&limit=&offset=.
 * Returns body: { success, message, data: { items, total, limit, offset } }
 */
export const listCustomers = async ({ params } = {}) => {
  const res = await defaultAxios(httpMethod.GET, BASE, { params });
  return res.data;
};

export const createCustomer = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, BASE, { data: body });
  return res.data;
};

export const updateCustomer = async ({ id, body }) => {
  const res = await defaultAxios(httpMethod.PATCH, `${BASE}/${id}`, {
    data: body,
  });
  return res.data;
};

export const deleteCustomer = async ({ id }) => {
  const res = await defaultAxios(httpMethod.DELETE, `${BASE}/${id}`);
  return res.data;
};
