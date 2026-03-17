import { useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, App as AntApp, Layout, Menu, Typography } from "antd";
import type { MenuProps } from "antd";
import ptBR from "antd/locale/pt_BR";
import { pdvTheme } from "./theme";
import PDV from "./pages/PDV/PDV";
import Produtos from "./pages/Produtos/Produtos";
import Entrada from "./pages/Entrada/Entrada";

const { Sider, Content } = Layout;
const { Text } = Typography;

const queryClient = new QueryClient();

// Tokens locais
const C = {
  amber:   "#F59E0B",
  siderBg: "#1A1A2E",  // fundo escuro da sidebar — contraste com conteúdo claro
} as const;

const MENU_ITEMS: MenuProps["items"] = [
  { key: "/",         icon: <span>🛒</span>, label: "PDV"      },
  { key: "/produtos", icon: <span>📦</span>, label: "Produtos" },
  { key: "/entrada",  icon: <span>📥</span>, label: "Entrada"  },
];

// Componente interno — precisa estar dentro do BrowserRouter para usar useNavigate/useLocation
function AppLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: "100vh" }}>

      {/* ── Sidebar ── */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={200}
        style={{
          background:  C.siderBg,
          borderRight: "1px solid #263349",
        }}
      >
        {/* Logo */}
        <div style={{
          height:         64,
          display:        "flex",
          alignItems:     "center",
          justifyContent: collapsed ? "center" : "flex-start",
          padding:        collapsed ? 0 : "0 24px",
          borderBottom:   "1px solid #263349",
          flexShrink:     0,
        }}>
          <Text strong style={{
            color:         C.amber,
            fontSize:      collapsed ? 20 : 22,
            fontWeight:    700,
            letterSpacing: 1,
          }}>
            {collapsed ? "W" : "WMS"}
          </Text>
        </div>

        {/* Navegação */}
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[location.pathname]}
          onClick={({ key }) => navigate(key)}
          items={MENU_ITEMS}
          style={{ background: "transparent", border: "none", marginTop: 8 }}
        />
      </Sider>

      {/* ── Conteúdo principal ── */}
      <Layout style={{ background: "#F8FAFC" }}>
        <Content style={{ padding: 24, overflow: "auto" }}>
          <Routes>
            <Route path="/"         element={<PDV />}      />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/entrada"  element={<Entrada />}  />
          </Routes>
        </Content>
      </Layout>

    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={pdvTheme} locale={ptBR}>
        <AntApp>
          <BrowserRouter>
            <AppLayout />
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}