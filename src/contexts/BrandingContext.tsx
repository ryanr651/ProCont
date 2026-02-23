import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface BrandingData {
  nome_empresa: string | null;
  cnpj_empresa: string | null;
  logo_url: string | null;
  telefone_fixo: string | null;
}

interface UserRole {
  role: 'master' | 'funcionario';
  isActive: boolean;
  masterId: string | null;
}

interface BrandingContextType {
  branding: BrandingData | null;
  userRole: UserRole | null;
  loading: boolean;
  isMaster: boolean;
  refetchBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBranding = async () => {
    if (!user) {
      setBranding(null);
      setUserRole(null);
      setLoading(false);
      return;
    }

    try {
      // Fetch role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('master_id, status')
        .eq('user_id', user.id)
        .single();

      const role = (roleData?.role as 'master' | 'funcionario') || 'master';
      const masterId = profileData?.master_id || null;
      const isActive = profileData?.status === 'active';

      setUserRole({ role, isActive, masterId });

      // Get branding from the master (self if master, or master_id if funcionario)
      const brandingUserId = role === 'funcionario' && masterId ? masterId : user.id;

      const { data: brandingData } = await supabase
        .from('master_branding')
        .select('nome_empresa, cnpj_empresa, logo_url, telefone_fixo')
        .eq('user_id', brandingUserId)
        .single();

      setBranding(brandingData || null);
    } catch (err) {
      console.error('Error fetching branding:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, [user]);

  const isMaster = userRole?.role === 'master';

  return (
    <BrandingContext.Provider value={{ branding, userRole, loading, isMaster, refetchBranding: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}
