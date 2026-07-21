import { defaultAxios, httpMethod } from "./axios";

const BASE = "/api/v1/network/naps";

export const listNaps = async ({ params } = {}) => {
  const res = await defaultAxios(httpMethod.GET, BASE, { params });
  return res.data;
};

export const createNap = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, BASE, { data: body });
  return res.data;
};

export const updateNap = async ({ id, body }) => {
  const res = await defaultAxios(httpMethod.PATCH, `${BASE}/${id}`, {
    data: body,
  });
  return res.data;
};

export const deleteNap = async ({ id }) => {
  const res = await defaultAxios(httpMethod.DELETE, `${BASE}/${id}`);
  return res.data;
};
