import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, App as AntApp } from "antd";
import ptBR from "antd/locale/pt_BR";
import { pdvTheme } from "./theme";
import PDV from "./pages/PDV/PDV";
import Produtos from "./pages/Produtos/Produtos";
import Entrada from "./pages/Entrada/Entrada";
import "./App.css";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={pdvTheme} locale={ptBR}>
        <AntApp>
          <BrowserRouter>
            <div className="app-container">
              <nav className="sidebar">
                <div className="sidebar-logo">
                  <span>WMS</span>
                </div>
                <NavLink
                  to="/"
                  className={({ isActive }) =>
                    isActive ? "nav-item active" : "nav-item"
                  }
                >
                  🛒 PDV
                </NavLink>
                <NavLink
                  to="/produtos"
                  className={({ isActive }) =>
                    isActive ? "nav-item active" : "nav-item"
                  }
                >
                  📦 Produtos
                </NavLink>
                <NavLink
                  to="/entrada"
                  className={({ isActive }) =>
                    isActive ? "nav-item active" : "nav-item"
                  }
                >
                  📥 Entrada
                </NavLink>
              </nav>

              <main className="main-content">
                <Routes>
                  <Route path="/"         element={<PDV />} />
                  <Route path="/produtos" element={<Produtos />} />
                  <Route path="/entrada"  element={<Entrada />} />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;