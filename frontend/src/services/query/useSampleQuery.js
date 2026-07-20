import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnnouncementsApi } from "@hooks/api/api-announcement";
import { useAnnouncementStore } from "@hooks/store/use-news-updates-store";

export const useGetAnnouncementsQuery = () => {
  const { setAnnouncements } = useAnnouncementStore();

  const query = useQuery({
    queryKey: ["GET Announcements"],
    queryFn: getAnnouncementsApi,
  });

  useEffect(() => {
    if (query.isSuccess) {
      setAnnouncements(query.data || []);
    }
  }, [query.isSuccess, query.data]);

  //  return query if not using useAnnouncementStore, otherwise return nothing since the data is stored in the store and can be accessed using useAnnouncementStore
  //   return useQuery({
  //     queryKey: ["GET announcements"],
  //     queryFn: getAnnouncementsApi,
  //   });
};
