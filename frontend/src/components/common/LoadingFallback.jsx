import { Spin } from "antd";

export const ComponentLoader = () => {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spin size="large" />
    </div>
  );
};

export const PageLoader = () => {
  return (
    <div className="flex items-center justify-center h-64">
      <Spin size="large" />
    </div>
  );
};
