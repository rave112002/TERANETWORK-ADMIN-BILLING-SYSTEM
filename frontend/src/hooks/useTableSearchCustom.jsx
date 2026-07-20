import { useEffect, useState } from "react";

const useTableSearchCustom = () => {
  const [columns, setColumns] = useState([]);
  const [searchTerm, setSearchTerm] = useState();
  const [defaultData, setDefaultData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);

  useEffect(() => {
    setFilteredData(defaultData);
  }, [defaultData]);

  const handleSearch = (value) => {
    if (value.trim() === "") {
      setFilteredData(defaultData);
      return;
    }
    setSearchTerm(value);

    const lowerValue = value.toLowerCase();

    const searchableKeys = columns
      .filter((col) => col.dataIndex)
      .map((col) => col.dataIndex);

    const filtered = defaultData.filter((item) =>
      searchableKeys.some((key) =>
        String(item[key]).toLowerCase().includes(lowerValue)
      )
    );

    setFilteredData(filtered);
  };

  return { handleSearch, filteredData, setDefaultData, searchTerm, setColumns };
};

export default useTableSearchCustom;
