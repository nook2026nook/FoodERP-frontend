import Icon from './Icon';

export default function Header({ activeTab, ingredientSubTab, currentUser, onLogout }) {
  const getTitle = () => {
    if (activeTab === 'dashboard') return 'Plant Operations & Compliance Dashboard';
    if (activeTab === 'ingredients_hub') {
      const subTitles = {
        baking: '🌾 Baking Ingredients',
        packaging: '📦 Packaging Ingredients',
        suppliers: '🚚 Suppliers',
        master_catalog: '📋 Master Catalog'
      };
      return (
        <span className="truncate block">
          Ingredients Hub • <span className="text-emerald-600">{subTitles[ingredientSubTab]}</span>
        </span>
      );
    }
    if (activeTab === 'receiving') return 'Receive Ingredients (Dock Inbound & Lot Pricing)';
    if (activeTab === 'recipes') return 'Formulations, Batch Costing & Distributor Margins';
    if (activeTab === 'production') return 'Production Runs & Live Packaging Delta';
    if (activeTab === 'shipping') return 'Shipping & QuickBooks Integration';
    if (activeTab === 'ready_to_ship') return 'Ready to Ship (Finished Goods Inventory)';
    if (activeTab === 'reports') return 'Production & Shipping Reports';
    if (activeTab === 'wastage') return 'Wastage, Scrap & Yield Variance Log';
    if (activeTab === 'recall') return 'FSMA Mock Recall Audit Dossier';
    return '';
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 flex-shrink-0 shadow-sm">
      <div className="flex items-center space-x-3 truncate">
        <h2 className="text-xs sm:text-base font-bold text-slate-800 truncate">
          {getTitle()}
        </h2>
      </div>

      <div className="flex items-center space-x-3 flex-shrink-0">
        <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-300">
          <Icon name="UserCheck" size={14} className="text-emerald-600" />
          <div className="text-left hidden sm:block">
            <div className="text-[11px] font-bold text-slate-800 leading-tight">
              {currentUser.name}
            </div>
            <div className="text-[9px] font-semibold text-slate-500 uppercase">
              {currentUser.role}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="ml-2 text-[11px] bg-slate-800 text-white hover:bg-slate-700 px-2.5 py-1 rounded-lg font-bold transition"
            title="Log Out"
          >
            Log Out
          </button>
        </div>
      </div>
    </header>
  );
}
