import { useQuery } from "@tanstack/react-query";
import { listSubscriptions } from "@services/api/subscriptionsApi";

export const SUBSCRIPTIONS_QUERY_KEY = ["cms", "subscriptions"];

export const useSubscriptions = () =>
  useQuery({
    queryKey: SUBSCRIPTIONS_QUERY_KEY,
    queryFn: () => listSubscriptions({ params: { limit: 100, offset: 0 } }),
    select: (res) => res?.data?.items ?? [],
  });
