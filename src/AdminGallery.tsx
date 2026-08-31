import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CircleNotch, DownloadSimple, WarningCircle, MagnifyingGlass, ArrowsClockwise } from '@phosphor-icons/react';
import { api, type PublicUser } from './lib/api';

// Same shape as the personal history item, plus the creator's display name —
// in a cross-user gallery you want a human name next to the address.
export interface AdminRenderItem {
  id: string;
  topic: string;
  variation: 'baseline' | 'tuned' | 'reimagined';
  engine: 'openai' | 'gemini';
  visual_rhetoric: string | null;
  source_name: string | null;
  created_at: number;
  project_id: string | null;
  creator_email: string;
  creator_name: string | null;
  image_url: string;
  settings: Record<string, any>;
}

interface Props {
  users: PublicUser[];
}

const PAGE_SIZE = 60;

const variationBadge = (v: AdminRenderItem['variation']) =>
  v === 'baseline' ? 'bg-zinc-950 text-white' :
  v === 'tuned' ? 'bg-amber-500 text-white' : 'bg-purple-500 text-white';

const engineBadge = (e: AdminRenderItem['engine']) =>
  e === 'openai' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white';

const AdminGallery: React.FC<Props> = ({ users }) => {
  const [items, setItems] = useState<AdminRenderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AdminRenderItem | null>(null);

  // Filters
  const [userFilter, setUserFilter] = useState('');
  const [engineFilter, setEngineFilter] = useState('');
  const [variationFilter, setVariationFilter] = useState('');
  const [search, setSearch] = useState('');
  // Committed search term — typing shouldn't fire a query per keystroke.
  const [appliedSearch, setAppliedSearch] = useState('');

  const buildQuery = useCallback((offset: number) => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (userFilter) p.set('user', userFilter);
    if (engineFilter) p.set('engine', engineFilter);
    if (variationFilter) p.set('variation', variationFilter);
    if (appliedSearch) p.set('q', appliedSearch);
    return p.toString();
  }, [userFilter, engineFilter, variationFilter, appliedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<{ renders: AdminRenderItem[]; total: number }>(
        `/api/admin/renders?${buildQuery(0)}`
      );
      setItems(data.renders);
      setTotal(data.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to load renders.');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await api.get<{ renders: AdminRenderItem[]; total: number }>(
        `/api/admin/renders?${buildQuery(items.length)}`
      );
      setItems(prev => [...prev, ...data.renders]);
      setTotal(data.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to load more.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDownload = async (item: AdminRenderItem) => {
    const res = await fetch(item.image_url, { credentials: 'include' });
    if (!res.ok) { setError('Could not download that image.'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const who = item.creator_email.split('@')[0];
    a.download = `${who}-${item.topic.slice(0, 40).replace(/[^a-z0-9]+/gi, '-')}-${item.variation}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setUserFilter('');
    setEngineFilter('');
    setVariationFilter('');
    setSearch('');
    setAppliedSearch('');
  };

  const filtersActive = !!(userFilter || engineFilter || variationFilter || appliedSearch);
  const selectCls = 'bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-950/10';

  return (
    <section className="flex flex-col gap-5">
      {/* Filter bar */}
      <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)} className={selectCls} title="Filter by who made it">
          <option value="">Everyone</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </select>

        <select value={engineFilter} onChange={e => setEngineFilter(e.target.value)} className={selectCls} title="Filter by model">
          <option value="">Both models</option>
          <option value="openai">GPT (gpt-image-2)</option>
          <option value="gemini">Gemini (Nano Banana)</option>
        </select>

        <select value={variationFilter} onChange={e => setVariationFilter(e.target.value)} className={selectCls} title="Filter by variant type">
          <option value="">All variants</option>
          <option value="baseline">Baseline</option>
          <option value="tuned">Tuned</option>
          <option value="reimagined">Reimagined</option>
        </select>

        <form
          onSubmit={e => { e.preventDefault(); setAppliedSearch(search.trim()); }}
          className="flex items-center gap-1.5 flex-1 min-w-[200px]"
        >
          <div className="relative flex-1">
            <MagnifyingGlass className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search prompts…"
              className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-2.5 py-1.5 text-[12px] text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-950/10"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg">
            Search
          </button>
        </form>

        {filtersActive && (
          <button onClick={resetFilters} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 flex items-center gap-1" title="Clear all filters">
            <ArrowsClockwise weight="bold" className="w-3 h-3" /> Reset
          </button>
        )}

        <span className="text-[10px] font-mono text-zinc-400 ml-auto whitespace-nowrap">
          {loading ? '…' : `${items.length} of ${total}`}
        </span>
      </div>

      {error && (
        <div className="px-4 py-3 border border-red-200 bg-red-50 rounded-lg flex items-center gap-2">
          <WarningCircle weight="fill" className="w-4 h-4 text-red-600 shrink-0" />
          <span className="text-[13px] text-red-700">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <CircleNotch weight="bold" className="w-8 h-8 text-zinc-400 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-24 text-zinc-500">
          <p className="text-lg font-medium text-zinc-600 mb-2">No renders match those filters</p>
          <p className="text-sm">Clear the filters to see everything the team has made.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map(item => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(item)}
                  onKeyDown={e => { if (e.key === 'Enter') setSelected(item); }}
                  className="w-full aspect-[4/3] bg-zinc-100 overflow-hidden relative cursor-pointer"
                >
                  <img src={item.image_url} alt={item.topic} loading="lazy" className="w-full h-full object-cover" />
                  <div className={`absolute top-2 left-2 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${variationBadge(item.variation)}`}>{item.variation}</div>
                  <div className={`absolute top-2 right-2 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${engineBadge(item.engine)}`}>{item.engine === 'openai' ? 'GPT' : 'GEM'}</div>
                </div>
                <div className="p-3 flex flex-col gap-1.5">
                  <p className="text-[11px] text-zinc-900 font-medium line-clamp-2 leading-snug" title={item.topic}>{item.topic}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-mono text-zinc-500 truncate" title={item.creator_email}>
                      {item.creator_name || item.creator_email.split('@')[0]} · {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    <button onClick={() => handleDownload(item)} className="text-zinc-400 hover:text-zinc-900 p-1 rounded hover:bg-zinc-100 transition-colors shrink-0" title="Download PNG">
                      <DownloadSimple className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {items.length < total && (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2.5 border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 text-[11px] font-bold uppercase tracking-widest rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore && <CircleNotch className="w-3.5 h-3.5 animate-spin" />}
                Load {Math.min(PAGE_SIZE, total - items.length)} more
              </button>
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {selected && (
        <div onClick={() => setSelected(null)} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6 cursor-pointer">
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl overflow-hidden max-w-5xl w-full max-h-[90vh] flex flex-col cursor-default">
            <img src={selected.image_url} alt={selected.topic} className="w-full h-auto object-contain max-h-[65vh] bg-zinc-100" />
            <div className="p-4 flex flex-col gap-3 border-t border-zinc-200 bg-white overflow-y-auto">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-900">{selected.topic}</p>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {selected.creator_name ? `${selected.creator_name} · ` : ''}{selected.creator_email} · {new Date(selected.created_at).toLocaleString()}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {selected.variation} · {selected.engine}
                    {selected.visual_rhetoric ? ` · ${selected.visual_rhetoric}` : ''}
                    {selected.source_name ? ` · source: ${selected.source_name}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => handleDownload(selected)} className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white text-[11px] font-bold uppercase tracking-wide rounded">Download PNG</button>
                  <button onClick={() => setSelected(null)} className="px-3 py-1.5 border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-[11px] font-bold uppercase tracking-wide rounded">Close</button>
                </div>
              </div>
              {selected.settings && Object.keys(selected.settings).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-100">
                  {Object.entries(selected.settings)
                    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !Array.isArray(v))
                    .map(([k, v]) => (
                      <span key={k} className="text-[9px] font-mono bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">
                        {k}: {String(v)}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminGallery;
