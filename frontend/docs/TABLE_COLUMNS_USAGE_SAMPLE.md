# `useTableColumns` — Usage Guide

## Installation / Import

```js
import useTableColumns, {
  useDataBasedFilters,
  COLUMN_SORTER_TYPES,
} from "@hooks/useTableColumns";
```

---

## 1. Basic Column with Search & Sort

The most common case — a plain text column with a search dropdown and alphabetical sorting.

```jsx
const MyTable = ({ data }) => {
  const { createColumn } = useTableColumns();

  const columns = [
    createColumn({ title: "Name", key: "name" }),
    createColumn({ title: "Department", key: "department" }),
    createColumn({ title: "Email", key: "email" }),
  ];

  return <Table dataSource={data} columns={columns} rowKey="id" />;
};
```

---

## 2. Column with Numeric Sorting

Pass `sortType` to switch the sorter strategy.

```jsx
const columns = [
  createColumn({
    title: "Age",
    key: "age",
    sortType: COLUMN_SORTER_TYPES.NUMBER,
  }),
  createColumn({
    title: "Salary",
    key: "salary",
    sortType: COLUMN_SORTER_TYPES.NUMBER,
  }),
];
```

---

## 3. Column with Date Sorting

```jsx
createColumn({
  title: "Created At",
  key: "createdAt",
  sortType: COLUMN_SORTER_TYPES.DATE,
  render: (date) => dayjs(date).format("MMM D, YYYY"),
});
```

---

## 4. Custom Render Function

Pass a `render` prop to take full control of cell rendering.  
Search highlight still works — combine with `renderInputSearch` (see §6).

```jsx
createColumn({
  title: "Status",
  key: "status",
  render: (value) => (
    <Tag color={value === "active" ? "green" : "red"}>
      {value.toUpperCase()}
    </Tag>
  ),
});
```

---

## 5. Disable Search or Sort

```jsx
// Sort only, no search dropdown
createColumn({ title: "Score", key: "score", isSearch: false });

// Search only, no sort arrow
createColumn({ title: "Notes", key: "notes", isSort: false });

// Plain column — no search, no sort
createColumn({ title: "ID", key: "id", isSearch: false, isSort: false });
```

---

## 6. Search Highlight with `renderInputSearch`

Pair `getColumnSearchProps` (bundled inside `createColumn`) with `renderInputSearch`
to highlight matched text in the cell.

```jsx
const { createColumn, renderInputSearch } = useTableColumns();

const columns = [
  createColumn({
    title: "Employee Name",
    key: "name",
    // Spread the render prop that adds yellow highlight on match
    ...renderInputSearch("name"),
  }),

  // With a copy-to-clipboard icon
  createColumn({
    title: "Email",
    key: "email",
    ...renderInputSearch("email", true), // isCopyable = true
  }),
];
```

---

## 7. Fixed (Pinned) Column

```jsx
createColumn({
  title: "Employee ID",
  key: "employeeId",
  fixed: true, // pins to the left
});
```

> **Note:** When using fixed columns, set `scroll={{ x: "max-content" }}` on `<Table>`.

---

## 8. Extra Ant Design Column Props

Any additional props are forwarded directly to the column definition via `...extraProps`.

```jsx
createColumn({
  title: "Description",
  key: "description",
  width: 300,
  ellipsis: true,
  align: "center",
});
```

---

## 9. `useDataBasedFilters` — Filters from Live Data

Use this hook when you want filter options to reflect the actual values in the dataset
rather than a hard-coded list.

### Basic usage (auto-labels from data)

```jsx
const { data, loading } = useFetchEmployees();
const { createColumn } = useTableColumns();

const departmentFilters = useDataBasedFilters(data, "department");

const columns = [
  createColumn({
    title: "Department",
    key: "department",
    isSearch: false, // disable text search — we're using dropdown filters
    ...departmentFilters, // spreads: filters, onFilter, filterSearch, filterMode
  }),
];
```

### With a value mapping (raw value → display label)

Useful when the field stores a code/enum but you want to show a human-readable label.

```jsx
const STATUS_LABELS = {
  A: "Active",
  I: "Inactive",
  P: "Pending",
};

const statusFilters = useDataBasedFilters(data, "statusCode", {
  valueMapping: STATUS_LABELS,
});

createColumn({
  title: "Status",
  key: "statusCode",
  isSearch: false,
  ...statusFilters,
  render: (code) => STATUS_LABELS[code] ?? code,
});
```

### With a custom filter function

```jsx
const salaryFilters = useDataBasedFilters(data, "salaryBand", {
  customFilter: (value, record) => record.salaryBand >= value, // range comparison instead of exact match
});
```

### With a value transformer (no mapping, just format the label)

```jsx
const dateFilters = useDataBasedFilters(data, "hireYear", {
  transformValue: (year) => `FY ${year}`,
});
```

---

## 10. Full Example — Employee Table

```jsx
import { Table, Tag } from "antd";
import useTableColumns, {
  useDataBasedFilters,
  COLUMN_SORTER_TYPES,
} from "@hooks/useTableColumns";

const ROLE_LABELS = { admin: "Admin", user: "User", viewer: "Viewer" };

const EmployeeTable = ({ data, loading }) => {
  const { createColumn, renderInputSearch } = useTableColumns();

  const roleFilters = useDataBasedFilters(data, "role", {
    valueMapping: ROLE_LABELS,
  });

  const columns = [
    // Fixed ID column — no search/sort needed
    createColumn({
      title: "ID",
      key: "id",
      fixed: true,
      isSearch: false,
      isSort: false,
      width: 80,
    }),

    // Searchable name with highlight
    createColumn({
      title: "Full Name",
      key: "fullName",
      ...renderInputSearch("fullName"),
    }),

    // Searchable + copyable email with highlight
    createColumn({
      title: "Email",
      key: "email",
      ...renderInputSearch("email", true),
    }),

    // Numeric sort, no search
    createColumn({
      title: "Age",
      key: "age",
      sortType: COLUMN_SORTER_TYPES.NUMBER,
      isSearch: false,
      width: 80,
    }),

    // Data-driven dropdown filters for role
    createColumn({
      title: "Role",
      key: "role",
      isSearch: false,
      ...roleFilters,
      render: (value) => <Tag>{ROLE_LABELS[value] ?? value}</Tag>,
    }),

    // Date column
    createColumn({
      title: "Hired",
      key: "hiredAt",
      sortType: COLUMN_SORTER_TYPES.DATE,
      isSearch: false,
      render: (d) => dayjs(d).format("MMM D, YYYY"),
    }),
  ];

  return (
    <Table
      rowKey="id"
      dataSource={data}
      columns={columns}
      loading={loading}
      scroll={{ x: "max-content" }}
    />
  );
};

export default EmployeeTable;
```

---

## API Reference

### `useTableColumns()` — returns

| Name                                        | Type       | Description                                                  |
| ------------------------------------------- | ---------- | ------------------------------------------------------------ |
| `createColumn(config)`                      | `Function` | Builds a full Ant Design column definition                   |
| `getColumnSearchProps(dataIndex)`           | `Function` | Returns raw search filter props (used inside `createColumn`) |
| `renderInputSearch(dataIndex, isCopyable?)` | `Function` | Returns a `render` prop with search highlight                |

### `createColumn(config)` — config options

| Prop            | Type                  | Default           | Description                                            |
| --------------- | --------------------- | ----------------- | ------------------------------------------------------ |
| `title`         | `string`              | —                 | Column header label                                    |
| `key`           | `string`              | —                 | Column key; also used as `dataIndex` by default        |
| `className`     | `string`              | `null`            | Optional CSS class                                     |
| `keyIsData`     | `boolean`             | `true`            | Set `dataIndex = key` when `true`                      |
| `render`        | `Function`            | Decoded text span | Custom cell render function                            |
| `isSearch`      | `boolean`             | `true`            | Attach text-search filter dropdown                     |
| `isSort`        | `boolean`             | `true`            | Attach sorter                                          |
| `sortType`      | `COLUMN_SORTER_TYPES` | `STRING`          | Sort strategy                                          |
| `sortOptions`   | `Object`              | `{}`              | `{ customCompare, nullsLast }` passed to `buildSorter` |
| `fixed`         | `boolean`             | `null`            | Pin column to left when truthy                         |
| `...extraProps` | `any`                 | —                 | Forwarded directly to the column definition            |

### `useDataBasedFilters(data, field, options?)` — options

| Option           | Type       | Default     | Description                         |
| ---------------- | ---------- | ----------- | ----------------------------------- |
| `valueMapping`   | `Object`   | `{}`        | `{ rawValue: displayLabel }` map    |
| `customFilter`   | `Function` | exact match | Custom `onFilter(value, record)`    |
| `transformValue` | `Function` | identity    | Format label when no mapping exists |

### `COLUMN_SORTER_TYPES`

| Key      | Use for                      |
| -------- | ---------------------------- |
| `STRING` | Text / alphanumeric          |
| `NUMBER` | Integer / float              |
| `DATE`   | Date strings or Date objects |
