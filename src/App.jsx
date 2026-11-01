import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authAPI } from './api/client';
import LoginModal from './components/LoginModal';
import ChangePasswordScreen from './components/ChangePasswordScreen';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';
import Icon from './components/Icon';
import { PageExportProvider } from './components/PageExport';
import LegalPages, { LEGAL_PATHS } from './components/LegalPages';

// Import all view components
import DashboardView from './components/views/DashboardView';
import IngredientsHubView from './components/views/IngredientsHubView';
import ReceivingView from './components/views/ReceivingView';
import RecipesView from './components/views/RecipesView';
import ProductionView from './components/views/ProductionView';
import ShippingView from './components/views/ShippingView';
import ReadyToShipView from './components/views/ReadyToShipView';
import ReportsView from './components/views/ReportsView';
import WastageView from './components/views/WastageView';
import RecallView from './components/views/RecallView';
import HelpGuideView from './components/views/HelpGuideView';
import UserManagementModal from './components/modals/UserManagementModal';
import BackupModal from './components/modals/BackupModal';

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem('erp_current_user');
    return stored ? JSON.parse(stored) : null;
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [ingredientSubTab, setIngredientSubTab] = useState('baking');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMgmtOpen, setIsUserMgmtOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Stable identity: views list it as an effect dependency when loading data.
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Back from Intuit: /?qbo=connected, /?qbo=error&message=..., or the app's Launch (qbo=launch)
  // and Disconnect (qbo=disconnected) URLs.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('qbo');
    if (!result) return;
    window.history.replaceState(null, '', window.location.pathname);
    setActiveTab('shipping');
    if (result === 'connected') showToast('QuickBooks connected. Map your products, then sync invoices.');
    else if (result === 'launch') showToast('Opened from QuickBooks. Use the QuickBooks panel to connect or sync.');
    else if (result === 'disconnected') showToast('QuickBooks was disconnected. An administrator can connect it again here.');
    else showToast(params.get('message') || 'QuickBooks connection failed', 'error');
  }, [showToast]);

  const handleLogin = (userData) => {
    setCurrentUser(userData.user);
    localStorage.setItem('erp_current_user', JSON.stringify(userData.user));
    localStorage.setItem('erp_jwt_token', userData.token);
    showToast(`Welcome back, ${userData.user.name}!`);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('erp_current_user');
    localStorage.removeItem('erp_jwt_token');
    setActiveTab('dashboard');
  };

  const allowedMenus = currentUser
    ? (currentUser.role === 'Administrator'
      ? ['dashboard', 'ingredients_hub', 'receiving', 'recipes', 'production', 'ready_to_ship', 'shipping', 'reports', 'wastage', 'recall', 'help']
      : (currentUser.allowedMenus || []))
    : [];

  // Land on the first accessible module if the current one is not permitted.
  useEffect(() => {
    if (allowedMenus.length > 0 && !allowedMenus.includes(activeTab)) setActiveTab(allowedMenus[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, activeTab]);

  const handleNavClick = (tab, subTab = null) => {
    setActiveTab(tab);
    if (subTab) setIngredientSubTab(subTab);
    setIsMobileMenuOpen(false);
  };

  // Public legal pages (no login) for the Intuit app listing
  const legalPath = window.location.pathname.replace(/\/+$/, '');
  if (LEGAL_PATHS.includes(legalPath)) return <LegalPages path={legalPath} />;

  // Redirect to login if not authenticated
  if (!currentUser) {
    return <LoginModal onLogin={handleLogin} />;
  }

  if (currentUser.forcePasswordReset) {
    return (
      <ChangePasswordScreen
        user={currentUser}
        onLogout={handleLogout}
        onChanged={(data) => {
          setCurrentUser(data.user);
          localStorage.setItem('erp_current_user', JSON.stringify(data.user));
          localStorage.setItem('erp_jwt_token', data.token);
          showToast('Password changed');
        }}
      />
    );
  }

  return (
    <PageExportProvider>
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-slate-100">
      {/* Mobile Top Bar */}
      <div className="lg:hidden bg-slate-900 text-white h-16 flex items-center justify-between px-4 flex-shrink-0 z-30 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="h-9 px-2.5 bg-white rounded-lg flex items-center justify-center shadow">
            <img
              src="/Logo.png"
              alt="Nature's Mix"
              className="h-6 object-contain"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://placehold.co/120x40/1e293b/ffffff?text=Nature%27s+Mix';
              }}
            />
          </div>
          <span className="font-extrabold text-xs tracking-tight">
            Production Batch & Traceability ERP
          </span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
          aria-label="Toggle Navigation Menu"
        >
          {isMobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        ingredientSubTab={ingredientSubTab}
        currentUser={currentUser}
        isMobileMenuOpen={isMobileMenuOpen}
        onNavClick={handleNavClick}
        onOpenUserMgmt={() => setIsUserMgmtOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      {/* Mobile backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-950/50 z-30 lg:hidden backdrop-blur-sm"
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          activeTab={activeTab}
          ingredientSubTab={ingredientSubTab}
          currentUser={currentUser}
          onLogout={handleLogout}
        />

        <div id="printable-page-container" className="flex-1 overflow-y-auto p-4 sm:p-8">
          {allowedMenus.length > 0 && !allowedMenus.includes(activeTab) && (
            <div className="max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-lg space-y-4">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-200">
                <Icon name="Lock" size={32} />
              </div>
              <h3 className="text-base font-black text-slate-800">Module Access Restricted</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your assigned account role <b>({currentUser.role})</b> does not have permission to access this menu. Please contact your Plant Administrator.
              </p>
              <button
                onClick={() => setActiveTab(allowedMenus[0] || 'dashboard')}
                className="px-5 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl shadow transition hover:bg-slate-800"
              >
                Return to Accessible Menu &rarr;
              </button>
            </div>
          )}

          {allowedMenus.includes('dashboard') && activeTab === 'dashboard' && (
            <DashboardView
              setActiveTab={setActiveTab}
              setIngredientSubTab={setIngredientSubTab}
              showToast={showToast}
            />
          )}

          {allowedMenus.includes('ingredients_hub') && activeTab === 'ingredients_hub' && (
            <IngredientsHubView
              ingredientSubTab={ingredientSubTab}
              setIngredientSubTab={setIngredientSubTab}
              currentUserRole={currentUser.role}
              showToast={showToast}
            />
          )}

          {allowedMenus.includes('receiving') && activeTab === 'receiving' && (
            <ReceivingView
              currentUserRole={currentUser.role}
              showToast={showToast}
              onGoToIngredients={() => {
                setActiveTab('ingredients_hub');
                setIngredientSubTab('baking');
              }}
            />
          )}

          {allowedMenus.includes('recipes') && activeTab === 'recipes' && (
            <RecipesView
              currentUserRole={currentUser.role}
              showToast={showToast}
            />
          )}

          {allowedMenus.includes('production') && activeTab === 'production' && (
            <ProductionView
              currentUserRole={currentUser.role}
              showToast={showToast}
            />
          )}

          {allowedMenus.includes('shipping') && activeTab === 'shipping' && (
            <ShippingView
              currentUserRole={currentUser.role}
              showToast={showToast}
            />
          )}

          {allowedMenus.includes('ready_to_ship') && activeTab === 'ready_to_ship' && (
            <ReadyToShipView
              currentUserRole={currentUser.role}
              showToast={showToast}
            />
          )}

          {allowedMenus.includes('reports') && activeTab === 'reports' && (
            <ReportsView showToast={showToast} />
          )}

          {allowedMenus.includes('wastage') && activeTab === 'wastage' && (
            <WastageView showToast={showToast} />
          )}

          {allowedMenus.includes('recall') && activeTab === 'recall' && (
            <RecallView showToast={showToast} />
          )}

          {allowedMenus.includes('help') && activeTab === 'help' && (
            <HelpGuideView allowedMenus={allowedMenus} onNavigate={handleNavClick} />
          )}

          <footer className="mt-8 pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 max-w-6xl">
            <div className="flex items-center gap-2">
              <img src="/Logo.png" alt="Nature's Mix" className="h-5 object-contain" />
              <span className="font-semibold text-slate-700">Production Batch &amp; Traceability ERP</span>
            </div>
            <div className="font-semibold text-slate-600 mt-1 sm:mt-0">
              Author: <span className="font-extrabold text-slate-900">John Gaya</span>
            </div>
          </footer>
        </div>
      </main>

      {/* Modals */}
      {isUserMgmtOpen && currentUser.role === 'Administrator' && (
        <UserManagementModal
          showToast={showToast}
          onClose={() => setIsUserMgmtOpen(false)}
        />
      )}

      {isBackupOpen && currentUser.role === 'Administrator' && (
        <BackupModal
          onClose={() => setIsBackupOpen(false)}
          showToast={showToast}
        />
      )}

      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
    </PageExportProvider>
  );
}

export default App;
