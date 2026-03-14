import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { PrivateRoute } from './components/Auth/PrivateRoute';
import { ScrollToTop } from './components/ScrollToTop';
import LoginUnificado from './pages/LoginUnificado';
import { PrimeiroLogin } from './pages/PrimeiroLogin';
import { DashboardEmpresa } from './pages/DashboardEmpresa';
import { DashboardAtendente } from './pages/DashboardAtendente';
import ChatPage from './pages/ChatPage';
import BotBuilder from './pages/BotBuilder';
import TemplateManager from './pages/TemplateManager';
import ContatosPage from './pages/ContatosPage';
import ClientesPage from './pages/ClientesPage';
import AgendaPage from './pages/AgendaPage';
import AgendamentosPage from './pages/AgendamentosPage';
import KanbanPage from './pages/KanbanPage';
import IAConfigPage from './pages/IAConfigPage';
import EnvioMassaPage from './pages/EnvioMassaPage';
import ProcessosPage from './pages/ProcessosPage';
import CadastroEmpresa from './pages/CadastroEmpresa';
import ConfirmarEmail from './pages/ConfirmarEmail';
import ConfigurarWhatsApp from './pages/ConfigurarWhatsApp';
import PerfilWhatsApp from './pages/PerfilWhatsApp';
import AdminPanel from './pages/AdminPanel';
import Portfolio from './pages/Portfolio';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import DataDeletion from './pages/DataDeletion';
import ConviteAniversario from './pages/ConviteAniversario';
import DevLogin from './pages/DevLogin';
import DevCadastro from './pages/DevCadastro';
import DevDashboard from './pages/DevDashboard';
import Pricing from './pages/Pricing';
import EsqueciSenha from './pages/EsqueciSenha';
import RedefinirSenha from './pages/RedefinirSenha';
import DevEsqueciSenha from './pages/DevEsqueciSenha';
import DevRedefinirSenha from './pages/DevRedefinirSenha';
import DevConfirmarEmail from './pages/DevConfirmarEmail';
import TrackingConfigPage from './pages/TrackingConfigPage';
import SetoresPage from './pages/SetoresPage';

function AppRoutes() {
  const location = useLocation();
  return (
    <>
      <ScrollToTop />
      <div key={location.key} className="page-transition">
        <Routes>
        {/* Rotas Públicas - Portfolio (Estático) */}
        <Route path="/" element={<Portfolio />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/termos" element={<Terms />} />
        <Route path="/data" element={<DataDeletion />} />
        <Route path="/aniversario" element={<ConviteAniversario />} />

        {/* Rotas Públicas - Sistema (Dinâmico) */}
        <Route path="/login" element={<LoginUnificado />} />
        <Route path="/cadastro" element={<CadastroEmpresa />} />
        <Route path="/confirmar-email" element={<ConfirmarEmail />} />
        <Route path="/planos" element={<Pricing />} />

        {/* Rotas Públicas - Recuperação de senha */}
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />

        {/* Rotas Públicas - Dev */}
        <Route path="/dev/login" element={<DevLogin />} />
        <Route path="/dev/cadastro" element={<DevCadastro />} />
        <Route path="/dev/esqueci-senha" element={<DevEsqueciSenha />} />
        <Route path="/dev/redefinir-senha" element={<DevRedefinirSenha />} />
        <Route path="/dev/confirmar-email" element={<DevConfirmarEmail />} />

        {/* Redirects das rotas antigas para o novo login */}
        <Route path="/empresa/login" element={<Navigate to="/login" replace />} />
        <Route path="/atendente/login" element={<Navigate to="/login" replace />} />

        {/* Rota de Primeiro Login (apenas atendente) */}
        <Route
          path="/atendente/primeiro-login"
          element={
            <PrivateRoute allowedRoles={['atendente']}>
              <PrimeiroLogin />
            </PrivateRoute>
          }
        />

        {/* Rotas Protegidas - Atendente */}
        <Route
          path="/atendente/dashboard"
          element={
            <PrivateRoute allowedRoles={['atendente']}>
              <DashboardAtendente />
            </PrivateRoute>
          }
        />

        <Route
          path="/atendente/chat"
          element={
            <PrivateRoute allowedRoles={['atendente']}>
              <ChatPage />
            </PrivateRoute>
          }
        />

        {/* Rotas Protegidas - Empresa */}
        <Route
          path="/empresa/dashboard"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <DashboardEmpresa />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/chat"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <ChatPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/bot-builder"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <BotBuilder />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/templates"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <TemplateManager />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/contatos"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <ContatosPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/clientes"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <ClientesPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/agenda"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <AgendaPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/agendamentos"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <AgendamentosPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/kanban"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <KanbanPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/ia-config"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <IAConfigPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/empresa/envio-massa"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <EnvioMassaPage />
            </PrivateRoute>
          }
        />

        {/* Processos Judiciais */}
        <Route
          path="/empresa/processos"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <ProcessosPage />
            </PrivateRoute>
          }
        />

        {/* Tracking & Conversões */}
        <Route
          path="/empresa/tracking"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <TrackingConfigPage />
            </PrivateRoute>
          }
        />

        {/* Setores e Especialidades */}
        <Route
          path="/empresa/setores"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <SetoresPage />
            </PrivateRoute>
          }
        />

        {/* Configurar WhatsApp (Embedded Signup) */}
        <Route
          path="/empresa/configurar-whatsapp"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <ConfigurarWhatsApp />
            </PrivateRoute>
          }
        />

        {/* Perfil WhatsApp Business */}
        <Route
          path="/empresa/perfil-whatsapp"
          element={
            <PrivateRoute allowedRoles={['empresa']}>
              <PerfilWhatsApp />
            </PrivateRoute>
          }
        />

        {/* Rotas Protegidas - Dev */}
        <Route
          path="/dev/dashboard"
          element={
            <PrivateRoute allowedRoles={['dev']}>
              <DevDashboard />
            </PrivateRoute>
          }
        />

        {/* Admin Panel */}
        <Route
          path="/admin/painel"
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <AdminPanel />
            </PrivateRoute>
          }
        />

        {/* Redirect catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
      <LanguageProvider>
        <AppRoutes />
      </LanguageProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
