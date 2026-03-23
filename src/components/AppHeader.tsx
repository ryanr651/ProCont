import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import {
  LogOut,
  Upload,
  Building2,
  Settings,
  Users,
  BarChart3,
  Home,
  Crown,
} from "lucide-react";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const { branding, isMaster } = useBranding();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/", label: "Início", icon: Home, roles: ["master", "funcionario"], public: true },
    { path: "/empresas", label: "Empresas", icon: Building2, roles: ["master", "funcionario"], public: false },
    { path: "/upload", label: "Upload", icon: Upload, roles: ["master", "funcionario"], public: false },
    { path: "/perfil-empresa", label: "Perfil Empresa", icon: Settings, roles: ["master"], public: false },
    { path: "/gerenciar-usuarios", label: "Usuários", icon: Users, roles: ["master"], public: false },
    { path: "/planos", label: "Planos", icon: Crown, roles: ["master", "funcionario"], public: true },
  ];

  const visibleItems = navItems.filter((item) => {
    if (!user) return item.public;
    return isMaster ? true : item.roles.includes("funcionario");
  });

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="container mx-auto px-6 py-3 flex items-center justify-between">
        {/* Left: Logo or Branding */}
        <div className="flex items-center gap-3">
          {branding?.logo_url ? (
            <Link to="/" className="flex items-center gap-2">
              <img
                src={branding.logo_url}
                alt={branding.nome_empresa || "Logo"}
                className="h-9 object-contain"
              />
              {branding.nome_empresa && (
                <span className="font-display font-bold text-lg hidden md:inline">
                  {branding.nome_empresa}
                </span>
              )}
            </Link>
          ) : (
            <Link to="/">
              <Logo size="sm" />
            </Link>
          )}
        </div>

        {/* Center: Nav links */}
        <div className="hidden md:flex items-center gap-1">
          {visibleItems.map((item) => (
            <Link key={item.path} to={item.path}>
              <Button
                variant={isActive(item.path) ? "default" : "ghost"}
                size="sm"
                className="text-xs"
              >
                <item.icon className="w-3.5 h-3.5 mr-1.5" />
                {item.label}
              </Button>
            </Link>
          ))}
        </div>

        {/* Right: Theme + Auth */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          ) : (
            <Link to="/auth">
              <Button variant="default" size="sm">
                Entrar
              </Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
