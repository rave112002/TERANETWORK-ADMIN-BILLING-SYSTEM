import { FileSearchOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Input, Space, Typography } from "antd";
import { useMemo, useRef, useState } from "react";
import Highlighter from "react-highlight-words";
import { heDecode } from "@utils/he-decode";
import { decodeHtmlEntities } from "@utils/formatData";
import { buildSorter, COLUMN_SORTER_TYPES } from "@utils/sortHelpers";

// ─── Constants ────────────────────────────────────────────────────────────────
const HIGHLIGHT_STYLE = { backgroundColor: "#ffc069", padding: 0 };

// ─── useDataBasedFilters (standalone, Rules-of-Hooks safe) ────────────────────
export const useDataBasedFilters = (data, field, options = {}) => {
  const {
    valueMapping = {},
    customFilter,
    transformValue = (v) => v,
  } = options;

  return useMemo(() => {
    if (!data) return {};

    const uniqueValues = [...new Set(data.map((item) => item[field]))].filter(
      (value) => value !== null && value !== undefined,
    );

    const hasMapping = Object.keys(valueMapping).length > 0;

    const filters = uniqueValues.map((value) => ({
      text: hasMapping
        ? (valueMapping[value] ?? transformValue(value))
        : heDecode(value),
      value: hasMapping ? value : heDecode(value),
    }));

    const onFilter = hasMapping
      ? (customFilter ?? ((value, record) => record[field] === value))
      : (value, record) => record[field] === value;

    return {
      filters,
      onFilter,
      filterSearch: true,
      filterMode: "menu",
      filtered: true,
    };
  }, [data, field, valueMapping, customFilter, transformValue]);
};

// ─── useTableColumns (main hook) ──────────────────────────────────────────────
const useTableColumns = () => {
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const searchInput = useRef(null);

  // ── Search handlers ──────────────────────────────────────────────────────

  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters, selectedKeys, confirm, dataIndex) => {
    clearFilters();
    setSearchText("");
    confirm();
    setSearchedColumn(dataIndex);
  };

  // ── Column search props ──────────────────────────────────────────────────
  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
      close,
    }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<SearchOutlined />}
            style={{ width: 90 }}
            onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
          >
            Search
          </Button>
          <Button
            size="small"
            style={{ width: 90 }}
            onClick={() =>
              clearFilters &&
              handleReset(clearFilters, selectedKeys, confirm, dataIndex)
            }
          >
            Reset
          </Button>
          {/* Filter: applies filter but keeps the dropdown open */}
          <Button
            type="link"
            size="small"
            onClick={() => {
              confirm({ closeDropdown: false });
              setSearchText(selectedKeys[0]);
              setSearchedColumn(dataIndex);
            }}
          >
            Filter
          </Button>
          <Button type="link" size="small" onClick={close}>
            Close
          </Button>
        </Space>
      </div>
    ),

    filterIcon: (filtered) =>
      filtered ? (
        <FileSearchOutlined style={{ fontSize: 18 }} />
      ) : (
        <SearchOutlined style={{ fontSize: 18, color: "green" }} />
      ),

    onFilter: (value, record) =>
      record[dataIndex]
        ?.toString()
        ?.toUpperCase()
        ?.includes(value.toUpperCase()),

    filterDropdownProps: {
      onOpenChange: (visible) => {
        if (visible) setTimeout(() => searchInput.current?.select(), 100);
      },
    },
  });

  // ── Highlighted render ───────────────────────────────────────────────────
  const renderInputSearch = (dataIndex, isCopyable = false) => ({
    render: (text) => {
      const decoded = decodeHtmlEntities(text ? text.toString() : "");

      if (searchedColumn !== dataIndex) {
        return decodeHtmlEntities(text, isCopyable);
      }

      const highlighter = (
        <Highlighter
          highlightStyle={HIGHLIGHT_STYLE}
          searchWords={[searchText]}
          autoEscape
          textToHighlight={decoded}
        />
      );

      return isCopyable ? (
        <Space>
          {highlighter}
          <Typography.Text copyable={{ text: decoded }} />
        </Space>
      ) : (
        highlighter
      );
    },
  });

  // ── Column builder ───────────────────────────────────────────────────────
  const createColumn = ({
    title,
    key,
    className = null,
    keyIsData = true,
    render = null,
    isSearch = true,
    isSort = true,
    sortType = COLUMN_SORTER_TYPES.STRING,
    sortOptions = {},
    fixed = null,
    ...extraProps
  }) => ({
    title,
    key,
    className,
    filterSearch: isSearch,
    ...(isSearch && getColumnSearchProps(key)),
    render: render ?? ((data) => <span>{decodeHtmlEntities(data)}</span>),
    ...(isSort && {
      sorter: buildSorter(key, { type: sortType, ...sortOptions }),
    }),
    ...(keyIsData && { dataIndex: key }),
    ...(fixed && { fixed: "left" }),
    ...extraProps,
  });

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    getColumnSearchProps,
    renderInputSearch,
    createColumn,
  };
};

export default useTableColumns;
export { COLUMN_SORTER_TYPES };
