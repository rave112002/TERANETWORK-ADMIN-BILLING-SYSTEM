import { defaultAxios, httpMethod } from "./axios";

const BASE = "/api/v1/network/splitters";

export const listSplitters = async ({ params } = {}) => {
  const res = await defaultAxios(httpMethod.GET, BASE, { params });
  return res.data;
};

export const createSplitter = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, BASE, { data: body });
  return res.data;
};

export const updateSplitter = async ({ id, body }) => {
  const res = await defaultAxios(httpMethod.PATCH, `${BASE}/${id}`, {
    data: body,
  });
  return res.data;
};

export const deleteSplitter = async ({ id }) => {
  const res = await defaultAxios(httpMethod.DELETE, `${BASE}/${id}`);
  return res.data;
};
