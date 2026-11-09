import Icon from './Icon';

const PLANT_MENUS = ['receiving', 'recipes', 'production_planning', 'production', 'ready_to_ship', 'shipping', 'reports', 'wastage', 'recall'];

export default function Sidebar({
  activeTab,
  ingredientSubTab,
  currentUser,
  isMobileMenuOpen,
  onNavClick,
  onOpenUserMgmt,
  onOpenBackup
}) {
  const menus = Array.isArray(currentUser.allowedMenus) ? currentUser.allowedMenus : [];
  const can = (id) => currentUser.role === 'Administrator' || menus.includes(id);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col justify-between flex-shrink-0 shadow-2xl transition-transform duration-300 lg:static lg:translate-x-0 ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div>
        {/* Brand Header */}
        <div className="hidden lg:flex p-5 border-b border-slate-800 items-center space-x-3 bg-slate-950/40">
          <div className="h-11 px-3 bg-white rounded-xl flex items-center justify-center shadow-md">
            <img
              src="/Logo.png"
              alt="Nature's Mix"
              className="h-7 object-contain"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://placehold.co/140x45/1e293b/ffffff?text=Nature%27s+Mix';
              }}
            />
          </div>
          <div>
            <h1 className="text-white font-extrabold text-xs tracking-tight leading-tight">
              Production Batch & Traceability
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] font-semibold text-emerald-400">Database online</span>
            </div>
            <div className="text-[10px] font-semibold text-slate-400 mt-0.5">Author: <span className="text-slate-200 font-bold">John Gaya</span></div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-140px)] lg:max-h-[calc(100vh-210px)] mt-16 lg:mt-0">
          {can('dashboard') && (
            <>
              <SectionLabel first>Overview</SectionLabel>
              <NavButton icon="LayoutDashboard" label="Operations Dashboard" active={activeTab === 'dashboard'} onClick={() => onNavClick('dashboard')} color="emerald" />
            </>
          )}

          {can('ingredients_hub') && (
            <>
              <SectionLabel>Master Catalogs</SectionLabel>
              <NavButton icon="Wheat" label="🌾 Baking Ingredients" active={activeTab === 'ingredients_hub' && ingredientSubTab === 'baking'} onClick={() => onNavClick('ingredients_hub', 'baking')} color="amber" />
              <NavButton icon="Box" label="📦 Packaging Ingredients" active={activeTab === 'ingredients_hub' && ingredientSubTab === 'packaging'} onClick={() => onNavClick('ingredients_hub', 'packaging')} color="blue" />
              <NavButton icon="Truck" label="🚚 Manage Suppliers" active={activeTab === 'ingredients_hub' && ingredientSubTab === 'suppliers'} onClick={() => onNavClick('ingredients_hub', 'suppliers')} color="slate" />
              <NavButton icon="Layers" label="📋 Master Catalog" active={activeTab === 'ingredients_hub' && ingredientSubTab === 'master_catalog'} onClick={() => onNavClick('ingredients_hub', 'master_catalog')} color="emerald" />
            </>
          )}

          {PLANT_MENUS.some(can) && <SectionLabel>Plant Operations</SectionLabel>}

          {can('receiving') && <NavButton icon="Download" label="Receive Ingredients (Dock)" active={activeTab === 'receiving'} onClick={() => onNavClick('receiving')} color="emerald" />}
          {can('recipes') && (
            <NavButton icon="FlaskConical" label="Formulations & Costing" badge="A–Z" active={activeTab === 'recipes'} onClick={() => onNavClick('recipes')} color="emerald" />
          )}
          {can('production_planning') && <NavButton icon="Calculator" label="Production Planning" active={activeTab === 'production_planning'} onClick={() => onNavClick('production_planning')} color="emerald" />}
          {can('production') && <NavButton icon="Cpu" label="Production & Packaging" active={activeTab === 'production'} onClick={() => onNavClick('production')} color="emerald" />}
          {can('ready_to_ship') && <NavButton icon="PackageCheck" label="Ready to Ship Inventory" active={activeTab === 'ready_to_ship'} onClick={() => onNavClick('ready_to_ship')} color="blue" />}
          {can('shipping') && <NavButton icon="Send" label="Shipping & QuickBooks" active={activeTab === 'shipping'} onClick={() => onNavClick('shipping')} color="emerald" />}
          {can('reports') && <NavButton icon="BarChart2" label="Reports & Dispatches" active={activeTab === 'reports'} onClick={() => onNavClick('reports')} color="indigo" />}
          {can('wastage') && <NavButton icon="AlertTriangle" label="Wastage & Variance Log" active={activeTab === 'wastage'} onClick={() => onNavClick('wastage')} color="orange" />}
          {can('recall') && <NavButton icon="ShieldAlert" label="FSMA Mock Recall Dossier" active={activeTab === 'recall'} onClick={() => onNavClick('recall')} color="rose" />}

          {can('help') && (
            <>
              <SectionLabel>Support & Documentation</SectionLabel>
              <NavButton icon="HelpCircle" label="Help & End-to-End Tutorial" active={activeTab === 'help'} onClick={() => onNavClick('help')} color="sky" />
            </>
          )}
        </nav>
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 space-y-2">
        {currentUser.role === 'Administrator' && (
          <button
            onClick={onOpenUserMgmt}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition font-medium border border-slate-700"
          >
            <Icon name="Users" size={14} />
            <span>Manage Users & Permissions</span>
          </button>
        )}
        {currentUser.role === 'Administrator' && (
          <button
            onClick={onOpenBackup}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition font-medium border border-slate-700"
          >
            <Icon name="HardDrive" size={14} />
            <span>Backup / Import</span>
          </button>
        )}
        <div className="pt-1.5 text-center text-[10px] text-slate-400 font-medium border-t border-slate-800/80">
          Author: <span className="text-white font-bold">John Gaya</span>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ children, first }) {
  return (
    <div className={`text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 ${first ? 'py-1.5' : 'pt-3 pb-1'}`}>
      {children}
    </div>
  );
}

function NavButton({ icon, label, active, onClick, color, badge }) {
  const colorClasses = {
    emerald: active ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
    amber: active ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
    blue: active ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
    slate: active ? 'bg-slate-700 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
    indigo: active ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
    orange: active ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
    rose: active ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
    sky: active ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center ${badge ? 'justify-between' : 'space-x-3'} px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${colorClasses[color]}`}
    >
      <div className="flex items-center space-x-3 truncate">
        <Icon name={icon} size={16} />
        <span className="truncate">{label}</span>
      </div>
      {badge && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">{badge}</span>}
    </button>
  );
}
