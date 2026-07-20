import React from "react";
import { Button, Form, Input } from "antd";
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  UserOutlined,
} from "@ant-design/icons";

const Login = () => {
  return (
    <div className="h-dvh bg-[#308a4e] flex flex-col justify-center items-center">
      <div className="bg-white px-12 py-10 rounded-2xl font-bold text-3xl shadow-xl flex-col gap-4 flex w-96">
        <span className="w-full justify-center flex">Login</span>
        <Form>
          <Form.Item
            name="username"
            rules={[{ required: true, message: "Please input your username!" }]}
          >
            <Input
              className="py-2!"
              prefix={<UserOutlined />}
              placeholder="Username"
              // disabled={isLoading}
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              {
                required: true,
                message: "Please input your password!",
              },
            ]}
            className="mb-8"
          >
            <Input.Password
              className="py-2!"
              prefix={<LockOutlined />}
              // disabled={isLoading}
              placeholder="Password"
              // suffix={<EyeInvisibleOutlined />}
              iconRender={(e) =>
                e ? <EyeInvisibleOutlined /> : <EyeOutlined />
              }
            />
          </Form.Item>
          <div className="w-full bg-amber-200">
            <Button
              type="primary"
              className="w-full font-bold"
              href="/admin/dashboard"
            >
              Login
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
};

export default Login;
