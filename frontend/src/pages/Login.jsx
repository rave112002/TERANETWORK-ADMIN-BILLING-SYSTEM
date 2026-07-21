import { Button, Form, Input } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import { useLoginMutation } from "@services/mutation/useAuthMutation";
import { redirectTo } from "@utils/redirectTo";
import { useEffect } from "react";

const Login = () => {
  const navigate = useNavigate();

  const [loginForm] = Form.useForm();

  const loginMutation = useLoginMutation({
    onSuccess: () => {
      // Return the user to where they were headed, or the dashboard.
      const dest = redirectTo.consume() || "/dashboard";
      navigate(dest, { replace: true });
    },
  });

  const onFinish = (values) => {
    loginMutation.mutate(values);
  };

  useEffect(() => {
    loginForm.setFieldValue({
      email: "admin@teranetwork.local",
      password: "Admin123!",
    });
  }, []);

  return (
    <div className="min-h-dvh bg-platinum flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-platinum p-8">
        {/* Brand mark */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-11 w-11 rounded-xl bg-jet flex items-center justify-center">
            <span className="text-white text-lg font-bold">T</span>
          </div>
          <h1 className="text-xl font-semibold text-jet">TeraNetwork</h1>
          <p className="text-sm text-graphite mt-1">Admin &amp; Billing</p>
        </div>

        <Form
          form={loginForm}
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
          disabled={loginMutation.isPending}
        >
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: "Email is required" },
              { type: "email", message: "Enter a valid email" },
            ]}
          >
            <Input
              size="large"
              prefix={<MailOutlined className="text-ash" />}
              placeholder="you@teranetwork.local"
              autoComplete="email"
            />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Password is required" }]}
            className="mb-6"
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined className="text-ash" />}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loginMutation.isPending}
          >
            Sign in
          </Button>
        </Form>
      </div>
    </div>
  );
};

export default Login;
