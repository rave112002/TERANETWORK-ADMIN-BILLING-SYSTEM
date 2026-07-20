import { SearchOutlined } from "@ant-design/icons";

import { Input } from "antd";

const SearchInput = ({ placeholder, onChange }) => {
  return (
    <div className="w-full max-w-75">
      <Input
        size="middle"
        placeholder={placeholder || "Search"}
        className="rounded-md border border-geyser"
        prefix={<SearchOutlined className="text-[#9F9F9F]" />}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
};

export default SearchInput;
