import "@ant-design/v5-patch-for-react-19";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { App as AntApp, ConfigProvider } from "antd";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
    },
  },
});

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            // Jet Black primary — minimalist, monochrome.
            colorPrimary: "#1a1a1a",
            colorLink: "#1a1a1a",
            colorTextBase: "#1a1a1a",
            fontFamily: "Satoshi, sans-serif",
            borderRadius: 8,
            controlHeight: 38,
          },
          components: {
            // Keep buttons crisp and quiet, matching the clean aesthetic.
            Button: {
              primaryShadow: "none",
              fontWeight: 500,
            },
            Layout: {
              headerBg: "#1a1a1a",
              siderBg: "#1a1a1a",
              bodyBg: "#f5f5f5",
            },
            Menu: {
              darkItemBg: "#1a1a1a",
              darkItemSelectedBg: "#353a3e",
            },
          },
        }}
      >
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  </BrowserRouter>,
);
