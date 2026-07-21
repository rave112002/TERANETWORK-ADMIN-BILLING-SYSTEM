import { defaultAxios, httpMethod } from "./axios";

const BASE = "/api/v1/cms/subscriptions";

/** GET subscriptions. Supports ?customer_id=&status=&limit=&offset=.
 * Returns body: { ..., data: { items, total, limit, offset } } */
export const listSubscriptions = async ({ params } = {}) => {
  const res = await defaultAxios(httpMethod.GET, BASE, { params });
  return res.data;
};

export const createSubscription = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, BASE, { data: body });
  return res.data;
};

export const updateSubscription = async ({ id, body }) => {
  const res = await defaultAxios(httpMethod.PATCH, `${BASE}/${id}`, {
    data: body,
  });
  return res.data;
};

/** POST /:id/status — move the subscription through its lifecycle. */
export const changeSubscriptionStatus = async ({ id, status }) => {
  const res = await defaultAxios(httpMethod.POST, `${BASE}/${id}/status`, {
    data: { status },
  });
  return res.data;
};
