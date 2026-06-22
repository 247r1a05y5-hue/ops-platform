'use client';
import { useState, useEffect, useCallback } from 'react';
import { useUI } from '@/context/UIContext';
import { Search, Plus, Package, FileText, Briefcase, Download, Eye, Edit, Trash2, Star, Grid, List, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type CatalogItem = {
  _id: string;
  id?: number;
  name: string;
  category: string;
  type: 'Product' | 'Service' | 'Document' | 'Template';
  price?: string;
  status: 'Active' | 'Draft' | 'Archived';
  description: string;
  tags: string[];
  rating?: number;
  updatedAt?: string;
  createdAt?: string;
};

export default function Catalog() {
  const { showToast } = useUI();
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState('All');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'Product'|'Service'|'Document'|'Template'>('Product');
  const [newPrice, setNewPrice] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/catalog', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (data.success) setItems(data.items);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const types = ['All', 'Product', 'Service', 'Document', 'Template'];

  const filtered = items.filter(i => {
    if (activeType !== 'All' && i.type !== activeType) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const typeColor = (type: string) => {
    switch (type) {
      case 'Product': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20';
      case 'Service': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20';
      case 'Document': return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20';
      default: return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20';
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20';
      case 'Draft': return 'text-secondary bg-surface border-border';
      default: return 'text-red-500 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20';
    }
  };

  const handleDelete = async (id: string) => {
    setItems(prev => prev.filter(i => i._id !== id)); // optimistic
    try {
      const res = await fetch(`/api/catalog/${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast('Item removed from catalog', 'success');
      } else {
        showToast(data.error || 'Delete failed', 'error');
        fetchItems(); // revert
      }
    } catch { fetchItems(); }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-base text-primary overflow-hidden transition-colors min-h-screen">

      {/* Header */}
      <div className="p-8 pb-6 shrink-0 border-b border-border bg-base z-10">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Catalog</h1>
            <p className="text-secondary text-sm font-medium">Manage your products, services, documents, and templates in one place.</p>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-[0_4px_14px_rgba(16,185,129,0.25)] hover:bg-emerald-600 transition-all active:scale-95">
            <Plus size={16} /> Add to Catalog
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Products', count: items.filter(i => i.type === 'Product').length, icon: Package, color: 'text-emerald-500' },
            { label: 'Services', count: items.filter(i => i.type === 'Service').length, icon: Briefcase, color: 'text-blue-500' },
            { label: 'Documents', count: items.filter(i => i.type === 'Document').length, icon: FileText, color: 'text-orange-500' },
            { label: 'Templates', count: items.filter(i => i.type === 'Template').length, icon: Grid, color: 'text-purple-500' },
          ].map((s, i) => (
            <div key={i} className="p-4 rounded-2xl border border-border bg-surface flex items-center gap-4 shadow-sm cursor-pointer hover:border-accent/40 transition-all" onClick={() => setActiveType(s.label.replace('s', ''))}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color} bg-current/10`}>
                <s.icon size={16} className={s.color} />
              </div>
              <div>
                <div className="text-xl font-bold text-primary">{s.count}</div>
                <div className="text-[10px] font-bold text-tertiary uppercase tracking-widest">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters + Search + View Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex bg-surface border border-border rounded-xl p-1 shadow-inner">
            {types.map(t => (
              <button key={t} onClick={() => setActiveType(t)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeType === t ? 'bg-base text-accent shadow-sm ring-1 ring-border/50' : 'text-secondary hover:text-primary'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search catalog..."
                className="bg-surface border border-border rounded-xl pl-9 pr-4 py-1.5 text-xs w-56 focus:outline-none focus:border-accent transition-all text-primary font-medium shadow-sm" />
            </div>
            <div className="flex bg-surface border border-border rounded-xl p-1 shadow-inner">
              <button onClick={() => setView('grid')} className={`p-1.5 rounded-lg transition-all ${view === 'grid' ? 'bg-base text-accent shadow-sm' : 'text-secondary hover:text-primary'}`}><Grid size={16}/></button>
              <button onClick={() => setView('list')} className={`p-1.5 rounded-lg transition-all ${view === 'list' ? 'bg-base text-accent shadow-sm' : 'text-secondary hover:text-primary'}`}><List size={16}/></button>
            </div>
          </div>
        </div>
      </div>

      {/* Catalog Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-base/30 shadow-inner">

        {/* Grid View */}
        {view === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence>
              {filtered.map((item, i) => (
                <motion.div key={item.id} layout initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}} transition={{delay: i * 0.05}}
                  className="p-6 rounded-2xl border border-border bg-surface shadow-sm hover:shadow-md hover:border-accent/40 transition-all group flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-bold text-[9px] uppercase tracking-wider ${typeColor(item.type)}`}>
                      {item.type}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${statusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-primary mb-2 group-hover:text-accent transition-colors leading-snug">{item.name}</h3>
                  <p className="text-[11px] text-secondary font-semibold leading-relaxed mb-4 flex-1">{item.description}</p>

                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {item.tags.map(tag => (
                      <span key={tag} className="text-[9px] font-bold text-tertiary bg-base border border-border px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <div>
                      {item.price && <div className="text-sm font-bold text-accent">{item.price}</div>}
                      {item.rating && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-500 mt-0.5">
                          <Star size={10} fill="currentColor" /> {item.rating}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => showToast(`Preview not available yet`, 'info')} className="p-1.5 text-secondary hover:text-accent bg-base border border-border rounded-lg transition-colors" title="View"><Eye size={14}/></button>
                      <button onClick={() => showToast(`Editing ${item.name}`, 'info')} className="p-1.5 text-secondary hover:text-blue-500 bg-base border border-border rounded-lg transition-colors" title="Edit"><Edit size={14}/></button>
                      <button onClick={() => handleDelete(item._id)} className="p-1.5 text-secondary hover:text-red-500 bg-base border border-border rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {filtered.length === 0 && (
              <div className="col-span-4 py-24 text-center text-secondary font-bold uppercase tracking-widest text-[10px]">No items match your search.</div>
            )}
          </div>
        )}

        {/* List View */}
        {view === 'list' && (
          <div className="rounded-2xl border border-border bg-base shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface border-b border-border text-secondary font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4 text-accent">Price</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence>
                  {filtered.map(item => (
                    <motion.tr key={item.id} layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                      className="hover:bg-surface/50 transition-colors group" >
                      <td className="px-6 py-4">
                        <div className="font-bold text-primary group-hover:text-accent transition-colors">{item.name}</div>
                        <div className="text-[10px] text-tertiary mt-0.5">{item.tags.join(', ')}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border font-bold text-[9px] uppercase tracking-wider ${typeColor(item.type)}`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[11px] font-bold text-secondary uppercase tracking-wider">{item.category}</td>
                      <td className="px-6 py-4 font-bold text-accent">{item.price || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border font-bold text-[9px] uppercase tracking-wider ${statusColor(item.status)}`}>{item.status}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); showToast(`Downloading ${item.name}`, 'info'); }} className="p-1.5 text-secondary hover:text-accent bg-base border border-border rounded-lg" title="Download"><Download size={14}/></button>
                          <button onClick={e => { e.stopPropagation(); showToast(`Editing ${item.name}`, 'info'); }} className="p-1.5 text-secondary hover:text-blue-500 bg-base border border-border rounded-lg"><Edit size={14}/></button>
                          <button onClick={e => { e.stopPropagation(); handleDelete(item._id); }} className="p-1.5 text-secondary hover:text-red-500 bg-base border border-border rounded-lg"><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add to Catalog Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-surface w-full max-w-lg rounded-3xl border border-border shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-base/50">
                <h2 className="text-base font-bold">Add to Catalog</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surface rounded-xl text-secondary hover:text-primary transition-colors"><X size={18}/></button>
              </div>
              <div className="p-8 flex flex-col gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Name</label>
                  <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Growth Plan" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent text-primary text-sm font-medium" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Type</label>
                    <select value={newType} onChange={e=>setNewType(e.target.value as 'Product' | 'Service' | 'Document' | 'Template')} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent text-primary text-sm font-bold appearance-none">
                      <option>Product</option><option>Service</option><option>Document</option><option>Template</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Price</label>
                    <input type="text" value={newPrice} onChange={e=>setNewPrice(e.target.value)} placeholder="e.g. $29/mo" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent text-primary text-sm font-medium" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Description</label>
                  <textarea rows={3} value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="Brief description..." className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent text-primary text-sm font-medium resize-none" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-base/50">
                <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-xs font-bold text-secondary hover:text-primary">Cancel</button>
                <button onClick={async () => {
                  if(!newName){showToast('Enter item name','warning');return;}
                  try {
                    const res = await fetch('/api/catalog', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ name: newName, type: newType, price: newPrice || '', description: newDesc || '', category: 'General' }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setItems(prev => [data.item, ...prev]);
                      setIsModalOpen(false);
                      setNewName(''); setNewPrice(''); setNewDesc('');
                      showToast(`"${newName}" added!`, 'success');
                    } else { showToast(data.error || 'Failed to add item', 'error'); }
                  } catch { showToast('Network error', 'error'); }
                }} className="px-10 py-2.5 bg-accent text-white font-bold rounded-2xl hover:bg-emerald-600 shadow-lg active:scale-95 transition-all text-xs">Save Item</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
