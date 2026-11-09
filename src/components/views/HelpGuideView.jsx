import { useMemo, useState } from 'react';
import Icon from '../Icon';
import ExportDropdownMenu, { downloadCSV, todayStamp } from '../PageExport';

const guideData = [
  {
    id: 'quickstart',
    category: 'workflow',
    title: '1. End-to-End Manufacturing Workflow (Quick Start)',
    icon: 'PlayCircle',
    keywords: ['workflow', 'quickstart', 'overview', 'steps', 'process', 'flow', 'cycle', 'production', 'start', 'begin', 'guide'],
    summary: 'The standard 6-step sequential flow from receiving raw ingredients to dispatching finished goods and auditing batches.',
    content: [
      { subtitle: 'Step 1: Setup Master Catalogs', text: 'Register all raw baking ingredients (oats, almonds, honey, etc.) and packaging supplies (575g/312g bags, 12-pack master boxes) with pack weights and costs in the Ingredients & Catalogs Hub.', actionTab: 'ingredients_hub', subTab: 'baking', actionLabel: 'Go to Catalogs' },
      { subtitle: 'Step 2: Inbound Truck Receiving & Lot Tagging', text: 'Log inbound delivery trucks at the dock. Enter supplier lot numbers, date received, dock temperature, and net kilogram weight. The system creates unique tracking lots for full traceability.', actionTab: 'receiving', actionLabel: 'Go to Receiving' },
      { subtitle: 'Step 3: Define Recipes, BOM & 3-Tier Pricing', text: 'Unlock the Formulations Vault with the formulation passcode. Configure recipe ingredient gram weights, outer packaging materials, labor costs, expected wastage %, and set Manufacturer, Distributor, and Retailer gross margin targets.', actionTab: 'recipes', actionLabel: 'Go to Formulations' },
      { subtitle: 'Step 4: Execute Batch Baking & Packaging Runs', text: 'Select formulation and scaling factor (bins/batches). Allocate ingredient lot numbers with FIFO automatic deduction and lot splitting. Record final packaged units into 575g and 312g master cases (12 pk) and loose bags.', actionTab: 'production', actionLabel: 'Go to Production' },
      { subtitle: 'Step 5: Fulfill Orders, Shipping & QuickBooks Invoicing', text: 'Check Ready-to-Ship inventory matrix. In Shipping, select finished batch, assign customer, invoice number, and unit wholesale price. Sync invoices with QuickBooks Online.', actionTab: 'shipping', actionLabel: 'Go to Shipping' },
      { subtitle: 'Step 6: Auditing, Scrap Logs & FSMA Mock Recall', text: 'Inspect yield variances and dough scrap in the Wastage Log. For FDA/CFIA food safety inspections, run a 2-minute mock recall trace forward to customers and backward to millers.', actionTab: 'recall', actionLabel: 'Go to Mock Recall' }
    ]
  },
  {
    id: 'dashboard_sop',
    category: 'modules',
    title: 'Module 1: Operations Dashboard SOP',
    icon: 'LayoutDashboard',
    keywords: ['dashboard', 'valuation', 'inventory value', 'kpi', 'summary', 'stock', 'overview', 'financials', 'money', 'worth'],
    summary: 'Real-time plant KPIs, total raw and finished inventory valuation, active lot inventory, and plant status.',
    content: [
      { subtitle: 'Financial Valuation Metric', text: 'The dashboard automatically computes Total Inventory Value by aggregating (1) remaining raw ingredient lot weights multiplied by their cost-per-kg, and (2) active finished goods boxes and bags valued by their net unit cost plus master packaging costs.' },
      { subtitle: 'Active Lot Inventory Table', text: 'Displays all active lots in stock, supplier details, date received, initial kg received, and remaining kg left. When a lot reaches 0 kg, it is flagged as depleted.' },
      { subtitle: 'Quick Actions & Exports', text: 'Use the top-right Export button to download a live CSV inventory summary or print a clean audit summary PDF.', actionTab: 'dashboard', actionLabel: 'Open Dashboard' }
    ]
  },
  {
    id: 'catalogs_sop',
    category: 'modules',
    title: 'Module 2: Ingredients & Catalogs Hub SOP',
    icon: 'Wheat',
    keywords: ['catalogs', 'baking', 'packaging', 'supplier', 'raw materials', 'items', 'cost per kg', 'pack size', 'oats', 'almonds', 'honey', 'vendor', 'specs', 'specification'],
    summary: 'Master registries for baking ingredients, packaging materials, specification attachments, and approved suppliers.',
    content: [
      { subtitle: 'Baking Ingredients Catalog', text: 'Add raw ingredients with item code (e.g. BAKE-01), description (e.g. Rolled Oats), pack size in kg (e.g. 25 kg bag), cost per pack ($45.00), and primary supplier. The ERP automatically computes Unit Cost per Kilogram ($1.80/kg).' },
      { subtitle: 'Packaging Materials Catalog', text: 'Define primary packaging (575g / 312g barrier bags) and secondary packaging (12-pack master shippers, carton dividers, pallet wrap). Specify pack quantity and cost per pack to derive accurate unit packaging costs.' },
      { subtitle: 'Suppliers Registry', text: 'Maintain an approved vendor list (e.g. Approved Commercial Miller, EcoBox Packaging) to enforce CFIA/FDA approved-supplier verification standards.', actionTab: 'ingredients_hub', subTab: 'baking', actionLabel: 'Manage Catalogs' }
    ]
  },
  {
    id: 'receiving_sop',
    category: 'modules',
    title: 'Module 3: Inbound Dock Receiving SOP',
    icon: 'Download',
    keywords: ['receiving', 'dock', 'intake', 'truck', 'lot', 'supplier lot', 'weight', 'temperature', 'inspection', 'inbound', 'delivery', 'pallet'],
    summary: 'Receiving dock inspection, supplier lot recording, net kg weight verification, and inventory lot generation.',
    content: [
      { subtitle: 'Truck Arrival Inspection', text: 'Check delivery seal, sanitize dock bay, and inspect truck condition. Verify that ingredients arrive undamaged and packaging is free from pest contamination or moisture.' },
      { subtitle: 'Logging New Inbound Lots', text: 'Select the catalog ingredient, enter the supplier lot code (or generate an internal lot code like OATS-901), specify total net received weight in kilograms, and date received. Saving this immediately updates raw inventory balances.' },
      { subtitle: 'Traceability Principle', text: 'Never mix multiple supplier lots into one inventory record. Each physical pallet or batch must have its own distinct Lot ID to preserve 100% FSMA forward and backward traceability.', actionTab: 'receiving', actionLabel: 'Receive Stock' }
    ]
  },
  {
    id: 'recipes_sop',
    category: 'modules',
    title: 'Module 4: Formulations & Costing Vault SOP',
    icon: 'FlaskConical',
    keywords: ['recipes', 'formulation', 'passcode', 'pin', 'vault', 'bom', 'margins', 'costing', 'pricing', 'labor', 'wastage', 'retailer', 'distributor', 'manufacturer'],
    summary: 'Passcode-protected formulation vault, bill of materials (BOM), baking wastage factor, and 3-tier margin pricing.',
    content: [
      { subtitle: 'Passcode Security Vault', text: 'Proprietary baking formulas are locked behind the formulation passcode. Administrators can update this passcode at any time to prevent unauthorized alteration of recipes.' },
      { subtitle: 'Baking BOM Configuration', text: 'Specify ingredients and exact grams required per standard batch (e.g. 15,000g Oats, 5,000g Almonds, 3,000g Honey = 23,000g total baking dough). Add packaging items for 575g and 312g formats.' },
      { subtitle: 'Wastage & Labor Allocation', text: 'Enter expected baking shrinkage/evaporation (e.g. 2.5% wastage) and fixed labor cost per batch (e.g. $150.00). The system computes net batch cost, raw dough cost per gram, and unit product cost for both 575g and 312g sizes.' },
      { subtitle: '3-Tier Margin Pricing Engine', text: 'Configure Manufacturer Margin % (e.g. 40%), Distributor Margin % (e.g. 20%), and Retailer Margin % (e.g. 35%). The system calculates recommended wholesale, distributor, and MSRP retail prices automatically.', actionTab: 'recipes', actionLabel: 'Open Formulations' }
    ]
  },
  {
    id: 'production_sop',
    category: 'modules',
    title: 'Module 5: Production & Packaging Batch Execution SOP',
    icon: 'Cpu',
    keywords: ['production', 'baking', 'batch', 'packaging', 'bins', 'scaling', 'fifo', 'lot deduction', 'splits', 'bags', 'boxes', '575g', '312g'],
    summary: 'Baking batch scaling, multi-lot split allocation, FIFO ingredient deductions, and finished packaging records.',
    content: [
      { subtitle: 'Batch Setup & Recipe Scaling', text: 'Assign a unique Batch Number (e.g. BATCH-261020-101), select the formulation, and specify scale basis (e.g. 20 batches / 40 bins). The ERP calculates exact required kilograms for every ingredient.' },
      { subtitle: 'FIFO Lot Split Allocation', text: 'Allocate ingredient lots to fulfill required weights. If an older lot has only 16.5 kg remaining and 25 kg is required, use Lot Splitting: deduct 16.5 kg from the older lot and 8.5 kg from the newer lot. Deductions take effect immediately upon batch completion.' },
      { subtitle: 'Packaging Split Matrix', text: 'Record output: specify how many 575g Master Boxes (12 pk), loose 575g bags, 312g Master Boxes (12 pk), and loose 312g bags were packed. The system updates Ready-to-Ship finished inventory instantly.', actionTab: 'production', actionLabel: 'Run Production' }
    ]
  },
  {
    id: 'ready_to_ship_sop',
    category: 'modules',
    title: 'Module 6: Ready to Ship Inventory Matrix SOP',
    icon: 'PackageCheck',
    keywords: ['ready to ship', 'finished goods', 'inventory', 'stock matrix', 'boxes', 'bags', 'warehouse', 'cartons', 'cases', '12 pk'],
    summary: 'Real-time finished goods warehouse ledger tracking master cases and loose retail bags in stock.',
    content: [
      { subtitle: 'Produced vs. Dispatched Balances', text: 'Tracks cumulative master cases produced from baking runs minus cases dispatched to customers. Automatically calculates net remaining inventory in stock.' },
      { subtitle: 'Separate 575g and 312g Tracking', text: 'Distinguishes between full 12-pack master cartons and individual loose retail bags for both 575g Family Size and 312g Snack Size SKUs.' },
      { subtitle: 'Inventory Audit & Export', text: 'Allows warehouse managers to print physical count sheets or export live finished goods inventory to Excel/CSV for month-end reconciliation.', actionTab: 'ready_to_ship', actionLabel: 'View Finished Stock' }
    ]
  },
  {
    id: 'shipping_sop',
    category: 'modules',
    title: 'Module 7: Shipping & QuickBooks Online Sync SOP',
    icon: 'Send',
    keywords: ['shipping', 'dispatch', 'quickbooks', 'qbo', 'invoice', 'customer', 'delivery', 'sync', 'accounting', 'reports'],
    summary: 'Customer order dispatching, invoice assignment, shipping logs, and QuickBooks Online sync tracking.',
    content: [
      { subtitle: 'Dispatching an Order', text: 'Select the batch to pull from, enter the customer name (e.g. Whole Foods Market, Metro Distributing), enter the Invoice Number, specify quantity of units shipped, and confirmed unit price.' },
      { subtitle: 'Inventory Deduction on Dispatch', text: 'Shipping records automatically deduct packed cartons from the Ready to Ship inventory ledger and update the total warehouse valuation.' },
      { subtitle: 'QuickBooks Online Sync & Reports', text: 'Connect QuickBooks Online (administrator), map products, then sync invoices. Use the Reports & Dispatches module to filter shipments by date or customer and export accounting CSVs.', actionTab: 'shipping', actionLabel: 'Log Shipment' }
    ]
  },
  {
    id: 'wastage_sop',
    category: 'modules',
    title: 'Module 8: Wastage & Yield Variance Audit SOP',
    icon: 'AlertTriangle',
    keywords: ['wastage', 'variance', 'scrap', 'yield', 'dough', 'loss', 'shrinkage', 'cost of waste', 'audit', 'delta'],
    summary: 'Production yield audits, dough scrap monitoring, package defect tracking, and financial loss variance.',
    content: [
      { subtitle: 'Yield & Shrinkage Monitoring', text: 'Calculates the difference between theoretical ingredient input weight and actual packaged finished goods weight. Accounts for oven evaporation and conveyor fines.' },
      { subtitle: 'Dough Scrap & Package Waste Valuation', text: 'Logs burnt dough, dropped trays, mislabeled bags, or crushed boxes. Computes the exact dollar cost of waste per batch to identify cost-saving opportunities.' },
      { subtitle: 'Net vs. Gross Batch Cost', text: 'Differentiates gross batch cost from net usable product cost, ensuring accurate wholesale margin protection.', actionTab: 'wastage', actionLabel: 'Audit Wastage' }
    ]
  },
  {
    id: 'recall_sop',
    category: 'modules',
    title: 'Module 9: FSMA Mock Recall Dossier SOP (2-Minute Audit)',
    icon: 'ShieldAlert',
    keywords: ['recall', 'fsma', 'fda', 'cfia', 'mock recall', 'audit', 'traceability', 'mass balance', 'recovery', 'containment', 'dossier'],
    summary: 'Regulatory compliance mock recall audit tool completing 100% two-way traceability in under 2 minutes.',
    content: [
      { subtitle: 'Initiating a Mock Recall Trace', text: 'Select either a suspect raw ingredient lot (backward trace from miller) or a finished production batch (forward trace to retail customers). The engine instantly queries all related records.' },
      { subtitle: 'Mass Balance & Recovery Rate', text: 'Computes total kg received = (kg in remaining raw stock) + (kg in warehouse finished goods) + (kg shipped to customers) + (kg logged as waste/scrap). Yields a precise Recovery Rate % (target > 99.5%).' },
      { subtitle: 'Inspector Audit Packet Generation', text: 'Click Print / Save PDF to generate a timestamped FSMA/CFIA Mock Recall Dossier containing supplier lot credentials, batch logs, affected customer list, invoice numbers, and mass balance summary in seconds.', actionTab: 'recall', actionLabel: 'Run Mock Recall' }
    ]
  },
  {
    id: 'security_sop',
    category: 'modules',
    title: 'Module 10: User Management, Roles & Data Backup SOP',
    icon: 'Users',
    keywords: ['users', 'roles', 'permissions', 'admin', 'password', 'backup', 'restore', 'json', 'security', 'login'],
    summary: 'Role-based access control (RBAC), user accounts and passwords, and JSON backup/restore.',
    content: [
      { subtitle: 'User Roles', text: 'Administrator: full access. Production Operator: operations modules. Quality Assurance (QA): quality & recall. Shipping Clerk: dispatch & reports. View-Only Guest: read-only dashboards. Each user can also be given a custom list of visible menus.' },
      { subtitle: 'Managing Users', text: 'Administrators can click Manage Users & Permissions in the sidebar to add staff, reset passwords, or customize which menu tabs each user is allowed to view.' },
      { subtitle: 'JSON Backup & Data Recovery', text: 'Administrators can click Backup / Import in the sidebar to export a full JSON snapshot of ERP data or restore from a previous snapshot.' }
    ]
  },
  {
    id: 'faqs',
    category: 'faq',
    title: 'Frequently Asked Questions (FAQs) & Troubleshooting',
    icon: 'HelpCircle',
    keywords: ['faq', 'troubleshooting', 'passcode reset', 'lot depletion', 'negative stock', 'error', 'print', 'pdf', 'excel', 'csv'],
    summary: 'Common operational questions, troubleshooting solutions, and best manufacturing practices.',
    content: [
      { subtitle: 'Q: How do I change the Formulations Vault passcode?', text: 'A: Once unlocked, administrators can change the passcode anytime in the Formulations & Costing module.' },
      { subtitle: 'Q: What should I do if an ingredient lot runs out mid-batch?', text: 'A: Use the Lot Splitting feature in the Production module. Allocate the remainder of the expiring lot, then add an additional split line to pull the remaining weight from the next chronological lot.' },
      { subtitle: 'Q: How do I print clean PDF audit reports without sidebar buttons?', text: 'A: Click Export -> Print / Save PDF on any module. Built-in print CSS automatically hides menus, sidebars, and buttons, formatting tables cleanly for paper or PDF export.' },
      { subtitle: 'Q: How do I back up or transfer ERP data?', text: 'A: An administrator clicks Backup / Import in the sidebar to download a complete JSON backup file, and uploads it there to restore.' },
      { subtitle: 'Q: Why is a module missing from my left sidebar?', text: 'A: Your user role may not have permission for that tab. Ask an Administrator to enable the module under Manage Users & Permissions.' }
    ]
  },
  {
    id: 'glossary',
    category: 'standards',
    title: 'Food Safety, Traceability & Inventory Glossary',
    icon: 'BookOpen',
    keywords: ['glossary', 'definitions', 'fifo', 'bom', 'fsma', 'cfia', 'fda', 'lot code', 'mass balance', 'terms', 'meaning'],
    summary: 'Standard industry definitions and regulatory compliance terms used throughout the ERP.',
    content: [
      { subtitle: 'BOM (Bill of Materials)', text: 'The comprehensive recipe manifest listing all raw ingredients in grams and packaging items (bags, master boxes) required to produce a single standard batch.' },
      { subtitle: 'FIFO (First In, First Out)', text: 'The inventory management rule where older ingredient lots received first must be consumed before newer lots to prevent ingredient staleness and spoilage.' },
      { subtitle: 'FSMA (Food Safety Modernization Act)', text: 'FDA/CFIA regulatory framework mandating preventative controls and verifiable one-step-forward, one-step-backward lot traceability for food manufacturers.' },
      { subtitle: 'Mass Balance Recovery Rate', text: 'Formula: [(Stock In Hand + Finished Goods Packed + Shipped Goods + Recorded Scrap) / Total Raw Inbound Lot Weight] x 100%. Regulators expect ~100% accountability during recall audits.' },
      { subtitle: 'Lot Code', text: 'A unique alphanumeric identifier assigned to a specific delivery of raw materials or batch of finished products to trace manufacturing history from dock to consumer.' }
    ]
  }
];

const CATEGORIES = [
  { id: 'all', label: 'All Topics', icon: 'Layers' },
  { id: 'workflow', label: '6-Step Workflow', icon: 'PlayCircle' },
  { id: 'modules', label: 'Module SOPs', icon: 'Cpu' },
  { id: 'faq', label: 'FAQs & Troubleshooting', icon: 'HelpCircle' },
  { id: 'standards', label: 'Glossary & Standards', icon: 'BookOpen' }
];

const QUICK_NAV = [
  { tab: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { tab: 'ingredients_hub', subTab: 'baking', label: 'Ingredients', icon: 'Wheat' },
  { tab: 'receiving', label: 'Receiving Dock', icon: 'Download' },
  { tab: 'recipes', label: 'Formulations', icon: 'FlaskConical' },
  { tab: 'production_planning', label: 'Planning', icon: 'Calculator' },
  { tab: 'production', label: 'Production', icon: 'Cpu' },
  { tab: 'ready_to_ship', label: 'Finished Stock', icon: 'PackageCheck' },
  { tab: 'shipping', label: 'Shipping (QBO)', icon: 'Send' },
  { tab: 'wastage', label: 'Wastage Log', icon: 'AlertTriangle' },
  { tab: 'recall', label: 'Mock Recall', icon: 'ShieldAlert' },
  { tab: 'reports', label: 'Reports', icon: 'BarChart2' }
];

export default function HelpGuideView({ allowedMenus = [], onNavigate }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedSection, setExpandedSection] = useState(null);

  const go = (tab, subTab) => {
    if (allowedMenus.includes(tab)) onNavigate(tab, subTab);
  };

  const filteredGuides = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return guideData.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q)) ||
        item.content.some((c) => c.subtitle.toLowerCase().includes(q) || c.text.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, activeCategory]);

  const handleExportGuideCSV = () => {
    const rows = [['Module / SOP', 'Topic', 'Details', 'Category']];
    guideData.forEach((g) => g.content.forEach((c) => rows.push([g.title, c.subtitle, c.text, g.category])));
    downloadCSV(`Nature_Mix_ERP_Full_SOP_Manual_${todayStamp()}.csv`, rows);
  };

  return (
    <div className="space-y-6 max-w-6xl pb-16">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold border border-emerald-500/30 mb-2">
                <Icon name="BookOpen" size={14} />
                <span>Official Knowledge Base &amp; System SOP Manual</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">How to Use Nature&apos;s Mix ERP</h2>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
                Complete end-to-end user manual, manufacturing SOPs, 3-tier pricing guides, and regulatory mock recall instructions. Fully searchable across all words and topics.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              <ExportDropdownMenu onExportExcel={handleExportGuideCSV} onPrintPDF={() => window.print()} label="Export Guide" />
            </div>
          </div>

          <div className="pt-2 no-print">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Icon name="Search" size={18} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guide by any word (e.g. lot, FIFO, passcode, QuickBooks, BOM, recall, 575g, variance, dock)..."
                className="w-full pl-10 pr-24 py-3 bg-white/10 hover:bg-white/15 focus:bg-white text-white focus:text-slate-900 placeholder:text-slate-400 rounded-2xl border border-white/20 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 text-xs sm:text-sm font-medium transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-3 flex items-center text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 my-auto rounded-lg transition"
                >
                  Clear
                </button>
              )}
            </div>
            {searchQuery && (
              <div className="text-[11px] font-semibold text-emerald-300 mt-2 flex items-center gap-1.5">
                <Icon name="CheckCircle" size={13} />
                <span>Found {filteredGuides.length} section{filteredGuides.length === 1 ? '' : 's'} matching &ldquo;{searchQuery}&rdquo;</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-print">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap border ${
              activeCategory === cat.id
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
          >
            <Icon name={cat.icon} size={14} className={activeCategory === cat.id ? 'text-emerald-400' : 'text-slate-400'} />
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2 no-print">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Icon name="Zap" size={12} className="text-amber-500" />
          <span>Quick Navigation: Jump Directly to Any Module</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_NAV.filter((m) => allowedMenus.includes(m.tab)).map((m) => (
            <button
              key={m.tab + (m.subTab || '')}
              onClick={() => go(m.tab, m.subTab)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-slate-200/60"
            >
              <Icon name={m.icon} size={12} className="text-slate-500" />
              <span>{m.label} &rarr;</span>
            </button>
          ))}
        </div>
      </div>

      {filteredGuides.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm space-y-3">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <Icon name="SearchX" size={24} />
          </div>
          <h4 className="text-base font-bold text-slate-800">No matching topics found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No guides matched your search term &ldquo;{searchQuery}&rdquo;. Try searching for keywords like receiving, FIFO, batch, QuickBooks, passcode, or recall.
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
          >
            Reset Search Filter
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGuides.map((section) => {
            const closed = expandedSection === `closed_${section.id}`;
            const isExpanded = !closed && (expandedSection === section.id || searchQuery.length > 0 || section.id === 'quickstart');
            return (
              <div key={section.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow transition overflow-hidden">
                <div
                  onClick={() => setExpandedSection(isExpanded ? `closed_${section.id}` : section.id)}
                  className="p-5 flex items-start justify-between gap-4 cursor-pointer select-none bg-slate-50/50 hover:bg-slate-50 transition border-b border-slate-100"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                      <Icon name={section.icon || 'FileText'} size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">{section.category}</span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {section.content.length} Topic{section.content.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-1">{section.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{section.summary}</p>
                    </div>
                  </div>
                  <div className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition flex-shrink-0">
                    <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size={18} />
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-5 space-y-4 divide-y divide-slate-100">
                    {section.content.map((item, idx) => (
                      <div key={idx} className={idx > 0 ? 'pt-4 space-y-1.5' : 'space-y-1.5'}>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                            <span>{item.subtitle}</span>
                          </h4>
                          {item.actionTab && allowedMenus.includes(item.actionTab) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                go(item.actionTab, item.subTab);
                              }}
                              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1 flex-shrink-0 no-print"
                            >
                              <span>{item.actionLabel || 'Go to Module'}</span>
                              <Icon name="ArrowRight" size={12} />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed pl-3.5">{item.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-slate-900 text-slate-200 rounded-2xl p-6 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <Icon name="ShieldCheck" size={18} />
          <h4 className="text-sm font-bold text-white">FSMA &amp; CFIA Plant Compliance Checklist</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {[
            ['1. Inbound Receiving', 'Always tag supplier lot code, delivery date, weight, and check temperature before acceptance.'],
            ['2. Batch Baking Runs', 'Enforce FIFO lot allocation. Record packaging output into 575g / 312g cases for accurate stock matrices.'],
            ['3. Annual Mock Recalls', 'Audit forward and backward traces twice per year. Ensure mass balance recovery exceeds 99%.']
          ].map(([t, d]) => (
            <div key={t} className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-1">
              <div className="font-bold text-white">{t}</div>
              <div className="text-slate-400 text-[11px]">{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
