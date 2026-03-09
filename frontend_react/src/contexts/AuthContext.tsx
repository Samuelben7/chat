import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface User {
  email: string;
  empresa_id: number;
  role: 'empresa' | 'atendente' | 'admin' | 'dev';
  atendente_id?: number;
  dev_id?: number;
  primeiro_login: boolean;
}

interface AuthContextData {
  user: User | null;
  token: string | null;
  loading: boolean;
  loginEmpresa: (email: string, senha: string) => Promise<void>;
  loginAtendente: (email: string, senha: string) => Promise<void>;
  loginDev: (email: string, senha: string) => Promise<void>;
  trocarSenha: (novaSenha: string) => Promise<void>;
  esqueciSenha: (email: string) => Promise<void>;
  redefinirSenha: (token: string, novaSenha: string) => Promise<void>;
  devEsqueciSenha: (email: string) => Promise<void>;
  devRedefinirSenha: (token: string, novaSenha: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Carregar token do localStorage ao iniciar
  useEffect(() => {
    const loadStorageData = async () => {
      const storedToken = localStorage.getItem('@WhatsApp:token');
      const storedUser = localStorage.getItem('@WhatsApp:user');

      if (storedToken && storedUser) {
        try {
          // Validar token com backend
          api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
          const response = await api.get('/auth/verify');

          setToken(storedToken);
          setUser(response.data);
        } catch (error) {
          // Token inválido, limpar storage
          localStorage.removeItem('@WhatsApp:token');
          localStorage.removeItem('@WhatsApp:user');
        }
      }

      setLoading(false);
    };

    loadStorageData();
  }, []);

  // Login de Empresa
  const loginEmpresa = async (email: string, senha: string) => {
    try {
      const response = await api.post('/auth/empresa/login', { email, senha });
      const { access_token, role, empresa_id, primeiro_login } = response.data;

      const userData: User = {
        email,
        empresa_id,
        role,
        primeiro_login,
      };

      // Salvar no localStorage
      localStorage.setItem('@WhatsApp:token', access_token);
      localStorage.setItem('@WhatsApp:user', JSON.stringify(userData));

      // Configurar header Authorization
      api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      setToken(access_token);
      setUser(userData);

      // Admin vai direto para o painel de administração
      if (role === 'admin') {
        navigate('/admin/painel');
        return;
      }

      // Verificar se tem parâmetro next na URL
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');

      if (next === 'configurar-whatsapp') {
        try {
          const statusRes = await api.get('/auth/empresa/whatsapp-status');
          if (!statusRes.data.conectado) {
            navigate('/empresa/configurar-whatsapp');
            return;
          }
        } catch {
          navigate('/empresa/configurar-whatsapp');
          return;
        }
      }

      // Redirecionar para dashboard
      navigate('/empresa/dashboard');
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Erro ao fazer login');
    }
  };

  // Login de Atendente
  const loginAtendente = async (email: string, senha: string) => {
    try {
      const response = await api.post('/auth/atendente/login', { email, senha });
      const { access_token, role, empresa_id, atendente_id, primeiro_login } = response.data;

      const userData: User = {
        email,
        empresa_id,
        role,
        atendente_id,
        primeiro_login,
      };

      // Salvar no localStorage
      localStorage.setItem('@WhatsApp:token', access_token);
      localStorage.setItem('@WhatsApp:user', JSON.stringify(userData));

      // Configurar header Authorization
      api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      setToken(access_token);
      setUser(userData);

      // Redirecionar
      if (primeiro_login) {
        navigate('/atendente/primeiro-login');
      } else {
        navigate('/atendente/dashboard');
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Erro ao fazer login');
    }
  };

  // Login de Dev
  const loginDev = async (email: string, senha: string) => {
    try {
      const response = await api.post('/auth/dev/login', { email, senha });
      const { access_token, dev_id, status: devStatus, trial_fim } = response.data;

      const userData: User = {
        email,
        empresa_id: 0,
        role: 'dev',
        dev_id,
        primeiro_login: false,
      };

      localStorage.setItem('@WhatsApp:token', access_token);
      localStorage.setItem('@WhatsApp:user', JSON.stringify(userData));
      api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      setToken(access_token);
      setUser(userData);

      // Trial vencido ou conta bloqueada → vai para planos
      const trialExpirado = devStatus === 'trial' && trial_fim && new Date(trial_fim) < new Date();
      if (devStatus === 'blocked' || trialExpirado) {
        navigate('/planos?tipo=dev');
        return;
      }

      navigate('/dev/dashboard');
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Erro ao fazer login');
    }
  };

  // Trocar senha (primeiro login)
  const trocarSenha = async (novaSenha: string) => {
    try {
      const response = await api.post('/auth/atendente/trocar-senha', {
        senha_nova: novaSenha,
      });

      const { access_token, role, empresa_id, atendente_id } = response.data;

      const userData: User = {
        email: user?.email || '',
        empresa_id,
        role,
        atendente_id,
        primeiro_login: false,
      };

      // Atualizar localStorage
      localStorage.setItem('@WhatsApp:token', access_token);
      localStorage.setItem('@WhatsApp:user', JSON.stringify(userData));

      // Configurar header Authorization
      api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      setToken(access_token);
      setUser(userData);

      // Redirecionar para chat
      navigate('/atendente/chat');
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Erro ao trocar senha');
    }
  };

  // Esqueci senha (empresa/atendente)
  const esqueciSenha = async (email: string) => {
    try {
      await api.post('/auth/esqueci-senha', { email });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Erro ao solicitar recuperação de senha');
    }
  };

  // Redefinir senha (empresa/atendente)
  const redefinirSenha = async (token: string, novaSenha: string) => {
    try {
      await api.post('/auth/redefinir-senha', { token, nova_senha: novaSenha });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Erro ao redefinir senha');
    }
  };

  // Esqueci senha (dev)
  const devEsqueciSenha = async (email: string) => {
    try {
      await api.post('/auth/dev/esqueci-senha', { email });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Erro ao solicitar recuperação de senha');
    }
  };

  // Redefinir senha (dev)
  const devRedefinirSenha = async (token: string, novaSenha: string) => {
    try {
      await api.post('/auth/dev/redefinir-senha', { token, nova_senha: novaSenha });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Erro ao redefinir senha');
    }
  };

  // Logout
  const logout = () => {
    localStorage.removeItem('@WhatsApp:token');
    localStorage.removeItem('@WhatsApp:user');
    delete api.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    navigate('/');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        loginEmpresa,
        loginAtendente,
        loginDev,
        trocarSenha,
        esqueciSenha,
        redefinirSenha,
        devEsqueciSenha,
        devRedefinirSenha,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
