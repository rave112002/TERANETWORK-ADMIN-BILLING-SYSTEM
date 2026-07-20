import { heDecode } from "@helpers/he-decode";
import { useMemo } from "react";

export const useDataBasedFilters = (data, field, options = {}) => {
  const {
    valueMapping = {},
    customFilter,
    transformValue = (v) => v,
  } = options;

  return useMemo(() => {
    if (!data) return {};

    // const uniqueValues = [...new Set(data.map((item) => item[field]))].filter(
    //   Boolean
    // );
    const uniqueValues = [...new Set(data.map((item) => item[field]))].filter(
      (value) => value !== null && value !== undefined,
    );

    const getFilterConfig = () => {
      if (Object.keys(valueMapping).length > 0) {
        return {
          filters: uniqueValues.map((value) => ({
            text: valueMapping[value] || transformValue(value),
            value: value,
          })),
          onFilter:
            customFilter || ((value, record) => record[field] === value),
        };
      }

      return {
        filters: uniqueValues.map((value) => ({
          text: heDecode(value),
          value: heDecode(value),
        })),
        onFilter: (value, record) => record[field] === value,
      };
    };

    return {
      ...getFilterConfig(),
      filterSearch: true,
      filterMode: "menu",
      filtered: true,
    };
  }, [data, field, valueMapping, customFilter, transformValue]);
};
