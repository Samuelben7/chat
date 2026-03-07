import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('empresa' | 'atendente' | 'admin' | 'dev')[];
}

export const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <p>Carregando...</p>
      </div>
    );
  }

  if (!user) {
    // Não autenticado, redirecionar para página inicial
    return <Navigate to="/" replace />;
  }

  // Verificar se role é permitida
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'admin') {
      return <Navigate to="/admin/painel" replace />;
    } else if (user.role === 'empresa') {
      return <Navigate to="/empresa/dashboard" replace />;
    } else if (user.role === 'dev') {
      return <Navigate to="/dev/dashboard" replace />;
    } else {
      return <Navigate to="/atendente/chat" replace />;
    }
  }

  // Autenticado e com role permitida
  return <>{children}</>;
};
