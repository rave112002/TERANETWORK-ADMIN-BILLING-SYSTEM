import { defaultAxios, axiosMultipart, httpMethod } from "./axios";

const baseApi = "/api/admin/news-updates";

export const getAnnouncementsApi = async () => {
  const res = await defaultAxios(
    httpMethod.GET,
    baseApi + "/announcements/getAnnouncements",
  );
  return res.data;
};

export const addAnnouncementApi = async (body) => {
  const res = await axiosMultipart(
    httpMethod.POST,
    baseApi + "/announcements/addAnnouncements",
    {
      data: body,
    },
  );
  return res.data;
};

export const editAnnouncementApi = async ({ body, params }) => {
  const res = await axiosMultipart(
    httpMethod.PATCH,
    baseApi + `/announcements/editAnnouncements/${params}`,
    {
      data: body,
    },
  );
  return res.data;
};
