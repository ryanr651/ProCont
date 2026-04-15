import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Showcase from "./pages/Showcase";
import Upload from "./pages/Upload";
import Resultado from "./pages/Resultado";
import CadastroEmpresa from "./pages/CadastroEmpresa";
import Empresas from "./pages/Empresas";
import PerfilEmpresa from "./pages/PerfilEmpresa";
import GerenciarUsuarios from "./pages/GerenciarUsuarios";
import Planos from "./pages/Planos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      storageKey="procont-theme"
      disableTransitionOnChange={false}
    >
      <AuthProvider>
        <BrandingProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/showcase" element={<Showcase />} />
                <Route 
                  path="/upload" 
                  element={
                    <ProtectedRoute>
                      <Upload />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/resultado" 
                  element={
                    <ProtectedRoute>
                      <Resultado />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/cadastro-empresa" 
                  element={
                    <ProtectedRoute>
                      <CadastroEmpresa />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/empresas" 
                  element={
                    <ProtectedRoute>
                      <Empresas />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/perfil-empresa" 
                  element={
                    <ProtectedRoute>
                      <PerfilEmpresa />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/gerenciar-usuarios" 
                  element={
                    <ProtectedRoute>
                      <GerenciarUsuarios />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/planos" 
                  element={<Planos />} 
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </BrandingProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
