import { rbLogo } from "@assets/images";
import { buildMenuItems } from "@utils/buildMenuItems";
import { Button, Layout, Menu } from "antd";
import { Content, Header } from "antd/es/layout/layout";
import Sider from "antd/es/layout/Sider";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

const CMSLayout = ({ menu = [] }) => {
  const location = useLocation();
  const menuItems = buildMenuItems(menu);

  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");

  useEffect(() => {
    const pathName = location.pathname.split("/").pop();
    setSelectedKey(pathName);
  }, [location.pathname]);

  return (
    <Layout className="h-screen">
      <Header
        className="bg-b-primary h-16 px-12 items-center flex justify-between"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.3)", zIndex: 1 }}
      >
        <div className=" w-full h-full items-center grid grid-cols-3 p-0">
          <span className=""></span>
          <span className=" text-xl text-center font-bold text-white text-shadow-md">
            HEADER
          </span>
          <div className=" flex gap-4 justify-end">
            <Button
              type="text"
              className="text-lg text-white font-semibold hover:bg-transparent!"
            >
              User
            </Button>

            <Button
              type="text"
              className="text-lg text-white font-semibold hover:bg-transparent!"
            >
              Logout
            </Button>
          </div>
        </div>
      </Header>
      <Layout>
        <Sider
          width={300}
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          className="bg-white h-full w-full overflow-auto"
          style={{
            boxShadow: "2px 0 8px rgba(0, 0, 0, 0.15)",
            zIndex: 1,
          }}
        >
          <div className="flex flex-col  items-center">
            <div
              className={`
                  my-8 rounded-2xl flex justify-center items-center overflow-hidden
                  transition-all ease-in-out
                  ${collapsed ? "h-16 w-16 duration-300" : "h-40 w-40 duration-700"}
                `}
            >
              <img
                src={rbLogo}
                alt="logo"
                className="w-full h-full object-contain transition-opacity duration-300"
              />
            </div>

            <Menu
              selectedKeys={[selectedKey]}
              mode="inline"
              inlineCollapsed={false}
              items={menuItems}
              className="p-0 w-full text-base"
            />
          </div>
        </Sider>
        <Content className="bg-white p-2 h-full w-full overflow-auto">
          <Outlet />
        </Content>
      </Layout>
      {/* <Footer>Footer</Footer> */}
    </Layout>
  );
};

export default CMSLayout;
