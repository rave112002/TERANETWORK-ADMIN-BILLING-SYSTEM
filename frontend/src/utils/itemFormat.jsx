import { Typography } from "antd";

export const viewHandlerCopyable = (value) =>
  value ? <Typography.Text copyable>{value}</Typography.Text> : "N/A";
