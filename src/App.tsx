import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PDV from "./pages/PDV/PDV";
import Transferencia from "./pages/Transferencia/Transferencia";
import Entrada from "./pages/Entrada/Entrada";
import "./App.css";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="app-container">

          {/* Sidebar de navegação */}
          <nav className="sidebar">
            <div className="sidebar-logo">
              <span>SUN</span>
            </div>
            <NavLink
              to="/"
              className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}
            >
              🛒 PDV
            </NavLink>
            <NavLink
              to="/transferencia"
              className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}
            >
              🔀 Transferência
            </NavLink>
            <NavLink
              to="/entrada"
              className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}
            >
              📥 Entrada
            </NavLink>
          </nav>

          {/* Conteúdo principal */}
          <main className="main-content">
            <Routes>
              <Route path="/"              element={<PDV />} />
              <Route path="/transferencia" element={<Transferencia />} />
              <Route path="/entrada"       element={<Entrada />} />
            </Routes>
          </main>

        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;