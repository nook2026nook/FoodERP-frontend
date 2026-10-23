import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, PackageOpen, PackageCheck } from 'lucide-react';
import { inventoryAPI, errorMessage } from '../../api/client';
import { StatusPill, money } from '../ui';

const OPEN_BOX_ROLES = ['Administrator', 'Production Operator', 'Shipping Clerk'];
const FORMATS = [
  ['575g', 'text-indigo-800 bg-indigo-50', 'text-indigo-700'],
  ['312g', 'text-emerald-800 bg-emerald-50', 'text-emerald-700']
];

export default function ReadyToShipView({ currentUserRole, showToast }) {
  const canOpenBoxes = OPEN_BOX_ROLES.includes(currentUserRole);
  const [data, setData] = useState({ products: [], total_value: 0 });
  const [batches, setBatches] = useState([]);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    try {
      const [rts, b] = await Promise.all([inventoryAPI.readyToShip(), inventoryAPI.batches()]);
      setData(rts.data);
      setBatches(b.data);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load finished goods'), 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openBox = async (b) => {
    if (!window.confirm(`Open 1 box of ${b.format} from batch ${b.batch_number}? It becomes 12 loose bags.`)) return;
    try {
      await inventoryAPI.openBox(b.batch_id, b.format, 1);
      showToast(`Opened 1 box from ${b.batch_number}`);
      await load();
    } catch (e) {
      showToast(errorMessage(e, 'Failed to open box'), 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-1">
            <PackageCheck size={18} className="text-blue-600" />
            Ready to Ship Inventory (Finished Goods Valuation)
          </h3>
          <p className="text-xs text-slate-500">Released stock only. Master box valuation: (bag cost × 12) + outer box cost, × boxes in stock.</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl text-right">
          <span className="text-[10px] font-bold text-emerald-800 uppercase block">Total finished goods stock value</span>
          <span className="text-lg font-black text-emerald-700 tabular-nums">{money(data.total_value)}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 border-r border-slate-200">Product Flavor</th>
                {FORMATS.map(([f, tone]) => (
                  <th key={f} className="px-6 py-2 text-center border-r border-slate-200 last:border-r-0" colSpan="2">
                    <div className={`${tone} py-1 rounded`}>{f} Format Inventory &amp; Valuation</div>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-slate-200 text-[10px] text-slate-400">
                <th className="px-6 py-2 border-r border-slate-200" />
                <th className="px-6 py-2 text-center">Boxes &amp; Box Valuation</th>
                <th className="px-6 py-2 text-center border-r border-slate-200">Loose Bags &amp; Cost</th>
                <th className="px-6 py-2 text-center">Boxes &amp; Box Valuation</th>
                <th className="px-6 py-2 text-center">Loose Bags &amp; Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.products.map((p) => {
                const isOpen = expanded[p.recipe_id];
                const productBatches = batches.filter((b) => b.recipe_id === p.recipe_id);
                return (
                  <Fragment key={p.recipe_id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-6 py-4 border-r border-slate-200">
                        <button onClick={() => setExpanded((x) => ({ ...x, [p.recipe_id]: !isOpen }))} className="flex items-center gap-1 font-bold text-slate-900 text-sm text-left" aria-expanded={Boolean(isOpen)}>
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{p.recipe_name}
                        </button>
                        <div className="text-[10px] font-bold text-emerald-700 mt-0.5 tabular-nums">Total value: {money(p.total_value)}</div>
                      </td>
                      {FORMATS.map(([f, , strong]) => {
                        const s = p.formats[f];
                        if (!s) return <Fragment key={f}><td className="px-6 py-4 text-center text-slate-300">—</td><td className="px-6 py-4 text-center text-slate-300 border-r border-slate-200">—</td></Fragment>;
                        return (
                          <Fragment key={f}>
                            <td className="px-6 py-4 text-center tabular-nums">
                              <div className={`text-base font-black ${strong}`}>{s.boxes} boxes</div>
                              <div className="text-[11px] font-mono font-bold text-slate-800">{money(s.box_value)}</div>
                              <div className="text-[9px] text-slate-500">(@ {money(s.box_cost)}/box = [{money(s.bag_cost)} × 12] + {money(s.outer_box_cost)})</div>
                              {s.awaiting_qa_boxes > 0 && <div className="text-[10px] text-amber-700 font-bold mt-1">+{s.awaiting_qa_boxes} awaiting QA</div>}
                            </td>
                            <td className="px-6 py-4 text-center border-r border-slate-200 tabular-nums">
                              <div className="text-sm font-bold text-slate-700">{s.bags} bags</div>
                              <div className="text-[10px] font-mono text-slate-500">{money(s.bag_value)}</div>
                              <div className="text-[9px] text-slate-400">(@ {money(s.bag_cost)}/bag)</div>
                              {s.awaiting_qa_bags > 0 && <div className="text-[10px] text-amber-700 font-bold mt-1">+{s.awaiting_qa_bags} awaiting QA</div>}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={5} className="px-6 py-3">
                          <table className="w-full text-xs">
                            <thead className="text-[10px] uppercase text-slate-500">
                              <tr><th className="text-left py-1">Batch</th><th className="text-left">Produced</th><th className="text-left">Format</th><th className="text-left">Status</th><th className="text-right">Boxes</th><th className="text-right">Loose bags</th>{canOpenBoxes && <th />}</tr>
                            </thead>
                            <tbody>
                              {productBatches.map((b) => (
                                <tr key={`${b.batch_id}-${b.format}`} className="border-t border-slate-200">
                                  <td className="py-1.5 font-mono font-bold">{b.batch_number}</td>
                                  <td>{b.production_date}</td>
                                  <td>{b.format}</td>
                                  <td><StatusPill status={b.status} /></td>
                                  <td className="text-right tabular-nums">{b.boxes_on_hand}</td>
                                  <td className="text-right tabular-nums">{b.bags_on_hand}</td>
                                  {canOpenBoxes && (
                                    <td className="text-right">
                                      {b.boxes_on_hand > 0 && (
                                        <button onClick={() => openBox(b)} className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900">
                                          <PackageOpen size={13} /> Open a box
                                        </button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                              {productBatches.length === 0 && <tr><td colSpan={7} className="py-2 text-slate-400">No stock left in any batch.</td></tr>}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {data.products.length === 0 && (
                <tr><td colSpan="5" className="text-center py-10 text-slate-400">No finished goods inventory recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
