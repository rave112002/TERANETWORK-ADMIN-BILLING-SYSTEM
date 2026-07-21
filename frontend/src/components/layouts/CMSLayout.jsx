import { Button, Layout, Menu } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { buildMenuItems } from "@utils/buildMenuItems";
import { useAuthStore } from "@store/useAuthStore";

const { Header, Sider, Content } = Layout;

const CMSLayout = ({ menu = [] }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const menuItems = buildMenuItems(menu);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [openKeys, setOpenKeys] = useState([]);

  useEffect(() => {
    const pathName = location.pathname.split("/").pop();
    setSelectedKey(pathName);

    // If the selected item lives inside a group, open that group.
    const parent = menu.find((m) =>
      m.children?.some((c) => c.value === pathName),
    );
    if (parent) {
      setOpenKeys((prev) =>
        prev.includes(parent.value) ? prev : [...prev, parent.value],
      );
    }
  }, [location.pathname, menu]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <Layout className="h-screen">
      <Sider
        width={240}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
      >
        {/* Brand */}
        <div className="h-16 flex items-center gap-2 px-4 border-b border-graphite">
          <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center shrink-0">
            <span className="text-jet font-bold">T</span>
          </div>
          {!collapsed && (
            <span className="text-white font-semibold tracking-tight">
              TeraNetwork
            </span>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          items={menuItems}
          className="border-0 mt-2"
        />
      </Sider>

      <Layout>
        <Header className="!bg-white border-b border-platinum !px-6 flex items-center justify-between">
          <span className="text-graphite font-medium">
            {/* Simple breadcrumb-ish current section */}
            {selectedKey
              ? selectedKey.charAt(0).toUpperCase() + selectedKey.slice(1)
              : ""}
          </span>

          <div className="flex items-center gap-4">
            <span className="text-sm text-graphite">
              {user?.name} <span className="text-ash">({user?.email})</span>
            </span>
            <Button
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              type="text"
              className="!text-jet"
            >
              Logout
            </Button>
          </div>
        </Header>

        <Content className="bg-[#f5f5f5] overflow-auto">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default CMSLayout;
