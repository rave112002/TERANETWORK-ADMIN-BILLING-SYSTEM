import { useQuery } from "@tanstack/react-query";
import { listCustomers } from "@services/api/customersApi";

export const CUSTOMERS_QUERY_KEY = ["cms", "customers"];

/**
 * Read hook for customers. We fetch a large page so the client-side table
 * (search/sort via useTableColumns) works over the full set. For very large
 * datasets we'd switch to server-side search/pagination.
 */
export const useCustomers = () =>
  useQuery({
    queryKey: CUSTOMERS_QUERY_KEY,
    queryFn: () => listCustomers({ params: { limit: 100, offset: 0 } }),
    select: (res) => res?.data?.items ?? [],
  });
