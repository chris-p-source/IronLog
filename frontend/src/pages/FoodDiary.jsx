import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScanLine, Search, Plus, Trash2, ChevronLeft, ChevronRight, Settings, X, Loader, Bookmark, BookmarkCheck } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../api';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDate(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function displayDate(dateStr) {
  const today = todayStr();
  const yesterday = offsetDate(today, -1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function MacroBar({ label, value, goal, color }) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  return (
    <div className="macro-bar-row">
      <div className="macro-bar-header">
        <span className="macro-bar-label">{label}</span>
        <span className="macro-bar-value" style={{ color }}>
          {Math.round(value)}{goal > 0 ? <span className="macro-bar-goal">/{goal}g</span> : 'g'}
        </span>
      </div>
      <div className="macro-bar-track">
        <div className="macro-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Barcode scanner modal ──────────────────────────────────────────────────
function ScannerModal({ onResult, onClose }) {
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  const [error, setError] = useState(null);
  const hasScanned = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    html5QrRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 140 } },
      (decodedText) => {
        if (hasScanned.current) return;
        hasScanned.current = true;
        scanner.stop().catch(() => {});
        onResult(decodedText);
      },
      () => {}
    ).catch(err => {
      setError('Camera access denied. Please allow camera permissions and try again.');
      console.error(err);
    });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="modal-overlay" style={{ alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div className="scanner-modal" onClick={e => e.stopPropagation()}>
        <div className="scanner-modal-header">
          <span className="scanner-modal-title">Scan Barcode</span>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="scanner-viewfinder">
          <div id="qr-reader" ref={scannerRef} style={{ width: '100%' }} />
          {!error && (
            <div className="scanner-overlay-frame">
              <div className="scanner-overlay-line" />
            </div>
          )}
          {error && <div className="scanner-error">{error}</div>}
        </div>
        <p className="scanner-hint">Point your camera at a product barcode</p>
      </div>
    </div>
  );
}

// ── Add food modal (search + confirm + manual) ─────────────────────────────
function AddFoodModal({ mealKey, mealLabel, prefillProduct, savedFoods, onSaveFood, onUnsaveFood, onAdd, onClose }) {
  const [mode, setMode] = useState(prefillProduct ? 'confirm' : 'search');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(prefillProduct || null);
  const [servingG, setServingG] = useState('100');
  const [searchErr, setSearchErr] = useState(null);
  const [savingFood, setSavingFood] = useState(false);

  // When a scanned product is prefilled, go straight to confirm
  useEffect(() => {
    if (prefillProduct) {
      setSelected(prefillProduct);
      setServingG(String(prefillProduct.serving_size_g || 100));
      setMode('confirm');
    }
  }, [prefillProduct]);

  const searchOFF = async (q) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearchErr(null);
    setResults([]);
    try {
      const res = await api.get(`/nutrition/search?q=${encodeURIComponent(q.trim())}`);
      const products = res.data;
      setResults(products);
      if (products.length === 0) setSearchErr('No results found. Try a different name or log manually.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Search failed. Please try again.';
      setSearchErr(msg);
    }
    setSearching(false);
  };

  const macroAt = (per100, serving) => parseFloat(((per100 * serving) / 100).toFixed(1));

  const confirmedEntry = () => {
    if (!selected) return null;
    const g = parseFloat(servingG) || 100;
    return {
      meal_type: mealKey,
      food_name: selected.food_name,
      brand: selected.brand || null,
      barcode: selected.barcode || null,
      serving_size_g: g,
      calories: macroAt(selected.calories_per100 || 0, g),
      protein_g: macroAt(selected.protein_per100 || 0, g),
      carbs_g: macroAt(selected.carbs_per100 || 0, g),
      fat_g: macroAt(selected.fat_per100 || 0, g),
      fibre_g: macroAt(selected.fibre_per100 || 0, g),
    };
  };

  // Find if current selected food is already saved
  const savedMatch = selected
    ? savedFoods.find(sf =>
        (sf.barcode && selected.barcode && sf.barcode === selected.barcode) ||
        (sf.food_name === selected.food_name && sf.brand === (selected.brand || null))
      )
    : null;

  const handleToggleSave = async () => {
    if (!selected) return;
    setSavingFood(true);
    try {
      if (savedMatch) {
        await onUnsaveFood(savedMatch.id);
      } else {
        await onSaveFood({
          food_name: selected.food_name,
          brand: selected.brand || null,
          barcode: selected.barcode || null,
          serving_size_g: parseFloat(servingG) || 100,
          calories_per100: selected.calories_per100 || 0,
          protein_per100: selected.protein_per100 || 0,
          carbs_per100: selected.carbs_per100 || 0,
          fat_per100: selected.fat_per100 || 0,
          fibre_per100: selected.fibre_per100 || 0,
        });
      }
    } catch {}
    setSavingFood(false);
  };

  const goToConfirm = (food) => {
    setSelected(food);
    setServingG(String(food.serving_size_g || 100));
    setMode('confirm');
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-end', zIndex: 300 }} onClick={onClose}>
      <div className="modal-sheet" style={{ maxHeight: '85dvh', minHeight: '50dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />

        {mode === 'search' && (
          <>
            <div className="modal-header">
              <div className="modal-title">Add to {mealLabel}</div>
              <button className="modal-close" onClick={onClose}><X size={18} /></button>
            </div>

            <div className="search-bar" style={{ marginBottom: 12 }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                className="search-input"
                placeholder="Search food name…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchOFF(query)}
                autoFocus
              />
              {query.length > 0 && (
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flexShrink: 0, padding: '5px 12px' }}
                  onClick={() => searchOFF(query)}
                >
                  Go
                </button>
              )}
            </div>

            {/* Saved foods shown when no search has been performed */}
            {!searching && results.length === 0 && !searchErr && savedFoods.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div className="saved-foods-heading">
                  <Bookmark size={13} />
                  <span>Saved Foods</span>
                </div>
                {savedFoods.map(sf => (
                  <div key={sf.id} className="food-result-row saved-food-row" onClick={() => goToConfirm(sf)}>
                    <div className="food-result-name">{sf.food_name}</div>
                    {sf.brand && <div className="food-result-brand">{sf.brand}</div>}
                    <div className="food-result-macros">
                      <span>{Math.round(sf.calories_per100)}kcal</span>
                      <span>P {parseFloat(sf.protein_per100).toFixed(1)}g</span>
                      <span>C {parseFloat(sf.carbs_per100).toFixed(1)}g</span>
                      <span>F {parseFloat(sf.fat_per100).toFixed(1)}g</span>
                      <span className="food-result-per">per 100g</span>
                    </div>
                  </div>
                ))}
                <div className="saved-foods-divider" />
              </div>
            )}

            {searching && <div className="loading" style={{ padding: '20px 0' }}><Loader size={18} className="spin" /> Searching…</div>}
            {searchErr && <div className="empty-state" style={{ paddingTop: 16 }}><p>{searchErr}</p></div>}

            {results.map((p, i) => (
              <div key={i} className="food-result-row" onClick={() => goToConfirm(p)}>
                <div className="food-result-name">{p.food_name}</div>
                {p.brand && <div className="food-result-brand">{p.brand}</div>}
                <div className="food-result-macros">
                  <span>{Math.round(p.calories_per100)}kcal</span>
                  <span>P {p.protein_per100}g</span>
                  <span>C {p.carbs_per100}g</span>
                  <span>F {p.fat_per100}g</span>
                  <span className="food-result-per">per 100g</span>
                </div>
              </div>
            ))}

            {/* Manual entry fallback */}
            <button
              className="btn-cancel-workout"
              style={{ marginTop: 8 }}
              onClick={() => { setSelected(null); setMode('manual'); }}
            >
              + Enter manually
            </button>
          </>
        )}

        {mode === 'confirm' && selected && (
          <>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setMode('search')}>
                <ChevronLeft size={20} />
              </button>
              <div className="modal-title" style={{ flex: 1, textAlign: 'center' }}>Confirm Serving</div>
              {/* Bookmark / save toggle */}
              <button
                className="modal-close"
                onClick={handleToggleSave}
                disabled={savingFood}
                title={savedMatch ? 'Remove from saved' : 'Save food'}
                style={{ color: savedMatch ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {savedMatch ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
              </button>
              <button className="modal-close" onClick={onClose}><X size={18} /></button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 2 }}>{selected.food_name}</div>
              {selected.brand && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selected.brand}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Serving size (g)</label>
              <input
                className="form-input"
                type="number"
                min={1}
                step={1}
                value={servingG}
                onChange={e => setServingG(e.target.value)}
              />
            </div>

            {/* Live macro preview */}
            {(() => {
              const g = parseFloat(servingG) || 0;
              const cal = macroAt(selected.calories_per100 || 0, g);
              const pro = macroAt(selected.protein_per100 || 0, g);
              const carb = macroAt(selected.carbs_per100 || 0, g);
              const fat = macroAt(selected.fat_per100 || 0, g);
              return (
                <div className="confirm-macro-grid">
                  <div className="confirm-macro-cell">
                    <div className="confirm-macro-value">{Math.round(cal)}</div>
                    <div className="confirm-macro-label">kcal</div>
                  </div>
                  <div className="confirm-macro-cell">
                    <div className="confirm-macro-value" style={{ color: '#e63030' }}>{pro}g</div>
                    <div className="confirm-macro-label">Protein</div>
                  </div>
                  <div className="confirm-macro-cell">
                    <div className="confirm-macro-value" style={{ color: '#f0b429' }}>{carb}g</div>
                    <div className="confirm-macro-label">Carbs</div>
                  </div>
                  <div className="confirm-macro-cell">
                    <div className="confirm-macro-value" style={{ color: '#7c5cfc' }}>{fat}g</div>
                    <div className="confirm-macro-label">Fat</div>
                  </div>
                </div>
              );
            })()}

            <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 16 }} onClick={() => onAdd(confirmedEntry())}>
              Add to {mealLabel}
            </button>
          </>
        )}

        {mode === 'manual' && (
          <ManualEntryForm
            mealKey={mealKey}
            mealLabel={mealLabel}
            onAdd={onAdd}
            onBack={() => setMode('search')}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function ManualEntryForm({ mealKey, mealLabel, onAdd, onBack, onClose }) {
  const [fields, setFields] = useState({ food_name: '', brand: '', serving_size_g: '100', calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '' });
  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));

  const handleAdd = () => {
    if (!fields.food_name.trim()) return;
    onAdd({
      meal_type: mealKey,
      food_name: fields.food_name.trim(),
      brand: fields.brand.trim() || null,
      serving_size_g: parseFloat(fields.serving_size_g) || 100,
      calories: parseFloat(fields.calories) || null,
      protein_g: parseFloat(fields.protein_g) || null,
      carbs_g: parseFloat(fields.carbs_g) || null,
      fat_g: parseFloat(fields.fat_g) || null,
      fibre_g: parseFloat(fields.fibre_g) || null,
    });
  };

  return (
    <>
      <div className="modal-header">
        <button className="modal-close" onClick={onBack}><ChevronLeft size={20} /></button>
        <div className="modal-title" style={{ flex: 1, textAlign: 'center' }}>Manual Entry</div>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="form-group">
        <label className="form-label">Food name *</label>
        <input className="form-input" value={fields.food_name} onChange={e => set('food_name', e.target.value)} placeholder="e.g. Chicken breast" autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label">Brand (optional)</label>
        <input className="form-input" value={fields.brand} onChange={e => set('brand', e.target.value)} placeholder="e.g. Tesco" />
      </div>
      <div className="form-group">
        <label className="form-label">Serving size (g)</label>
        <input className="form-input" type="number" min={1} value={fields.serving_size_g} onChange={e => set('serving_size_g', e.target.value)} />
      </div>
      <div className="manual-macro-grid">
        {[['calories', 'Calories (kcal)'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)'], ['fibre_g', 'Fibre (g)']].map(([k, label]) => (
          <div key={k} className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">{label}</label>
            <input className="form-input" type="number" min={0} step={0.1} value={fields[k]} onChange={e => set(k, e.target.value)} placeholder="0" />
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-block btn-lg" onClick={handleAdd} disabled={!fields.food_name.trim()}>
        Add to {mealLabel}
      </button>
    </>
  );
}

// ── Goals modal ────────────────────────────────────────────────────────────
function GoalsModal({ goals, onSave, onClose }) {
  const [fields, setFields] = useState({
    calories: String(goals?.calories || ''),
    protein_g: String(goals?.protein_g || ''),
    carbs_g: String(goals?.carbs_g || ''),
    fat_g: String(goals?.fat_g || ''),
  });
  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    onSave({
      calories: parseInt(fields.calories) || null,
      protein_g: parseInt(fields.protein_g) || null,
      carbs_g: parseInt(fields.carbs_g) || null,
      fat_g: parseInt(fields.fat_g) || null,
    });
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-end', zIndex: 300 }} onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">Daily Nutrition Goals</div>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        {[['calories', 'Calories (kcal)'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)']].map(([k, label]) => (
          <div key={k} className="form-group">
            <label className="form-label">{label}</label>
            <input className="form-input" type="number" min={0} value={fields[k]} onChange={e => set(k, e.target.value)} placeholder="Leave blank to hide" />
          </div>
        ))}
        <button className="btn btn-primary btn-block" onClick={handleSave}>Save Goals</button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function FoodDiary() {
  const [date, setDate] = useState(todayStr());
  const [logs, setLogs] = useState([]);
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savedFoods, setSavedFoods] = useState([]);

  const [showScanner, setShowScanner] = useState(false);
  const [scanTarget, setScanTarget] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanProduct, setScanProduct] = useState(null);

  const [addTarget, setAddTarget] = useState(null);
  const [showGoals, setShowGoals] = useState(false);

  // Load goals + saved foods once
  useEffect(() => {
    api.get('/nutrition/goals').then(r => setGoals(r.data)).catch(() => {});
    api.get('/nutrition/saved').then(r => setSavedFoods(r.data)).catch(() => {});
  }, []);

  // Load logs when date changes
  useEffect(() => {
    setLoading(true);
    api.get(`/nutrition/logs?date=${date}`)
      .then(r => { setLogs(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [date]);

  // ── Totals ──
  const total = logs.reduce((acc, l) => ({
    calories: acc.calories + (parseFloat(l.calories) || 0),
    protein_g: acc.protein_g + (parseFloat(l.protein_g) || 0),
    carbs_g: acc.carbs_g + (parseFloat(l.carbs_g) || 0),
    fat_g: acc.fat_g + (parseFloat(l.fat_g) || 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

  const logsByMeal = MEAL_KEYS.reduce((acc, k) => {
    acc[k] = logs.filter(l => l.meal_type === k);
    return acc;
  }, {});

  // ── Barcode scan flow ──
  const handleScan = (mealKey, mealLabel) => {
    setScanTarget({ mealKey, mealLabel });
    setShowScanner(true);
  };

  const handleBarcode = async (code) => {
    setShowScanner(false);
    setScanLoading(true);
    try {
      const res = await api.get(`/nutrition/barcode/${encodeURIComponent(code)}`);
      setScanProduct(res.data);
      setAddTarget(scanTarget);
    } catch (err) {
      if (err.response?.status === 404) {
        alert('Product not found in database. You can add it manually.');
      } else {
        alert('Failed to look up product. Please try again.');
      }
      setAddTarget(scanTarget);
    }
    setScanLoading(false);
  };

  // ── Add food entry ──
  const handleAdd = async (entry) => {
    if (!entry) return;
    try {
      const res = await api.post('/nutrition/logs', { ...entry, date });
      setLogs(l => [...l, res.data]);
    } catch { alert('Failed to save entry.'); }
    setAddTarget(null);
    setScanProduct(null);
  };

  // ── Delete entry ──
  const handleDelete = async (id) => {
    try {
      await api.delete(`/nutrition/logs/${id}`);
      setLogs(l => l.filter(e => e.id !== id));
    } catch { alert('Failed to delete entry.'); }
  };

  // ── Save / unsave food ──
  const handleSaveFood = async (food) => {
    const res = await api.post('/nutrition/saved', food);
    setSavedFoods(sf => [res.data, ...sf]);
    return res.data;
  };

  const handleUnsaveFood = async (id) => {
    await api.delete(`/nutrition/saved/${id}`);
    setSavedFoods(sf => sf.filter(f => f.id !== id));
  };

  // ── Save goals ──
  const handleSaveGoals = async (g) => {
    try {
      const res = await api.put('/nutrition/goals', g);
      setGoals(res.data);
    } catch { alert('Failed to save goals.'); }
    setShowGoals(false);
  };

  const isToday = date === todayStr();

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Nutrition</h1>
        <button className="icon-btn" onClick={() => setShowGoals(true)} title="Set goals">
          <Settings size={18} />
        </button>
      </div>

      {/* Date navigator */}
      <div className="date-nav">
        <button className="date-nav-btn" onClick={() => setDate(d => offsetDate(d, -1))}>
          <ChevronLeft size={18} />
        </button>
        <span className="date-nav-label">{displayDate(date)}</span>
        <button className="date-nav-btn" onClick={() => setDate(d => offsetDate(d, 1))} disabled={isToday}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Macro summary */}
      <div className="macro-summary-card">
        <div className="macro-calories-row">
          <span className="macro-calories-value">{Math.round(total.calories)}</span>
          <span className="macro-calories-unit">kcal{goals?.calories ? ` / ${goals.calories}` : ''}</span>
        </div>
        <MacroBar label="Protein" value={total.protein_g} goal={goals?.protein_g || 0} color="#e63030" />
        <MacroBar label="Carbs"   value={total.carbs_g}   goal={goals?.carbs_g || 0}   color="#f0b429" />
        <MacroBar label="Fat"     value={total.fat_g}     goal={goals?.fat_g || 0}     color="#7c5cfc" />
      </div>

      {/* Meal sections */}
      {scanLoading && (
        <div className="loading" style={{ marginBottom: 12 }}>
          <Loader size={16} className="spin" /> Looking up product…
        </div>
      )}

      {MEALS.map((label, i) => {
        const key = MEAL_KEYS[i];
        const entries = logsByMeal[key] || [];
        const mealCal = entries.reduce((a, e) => a + (parseFloat(e.calories) || 0), 0);

        return (
          <div key={key} className="meal-section">
            <div className="meal-section-header">
              <div>
                <span className="meal-section-title">{label}</span>
                {mealCal > 0 && <span className="meal-section-cal">{Math.round(mealCal)} kcal</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="meal-add-btn"
                  onClick={() => handleScan(key, label)}
                  title="Scan barcode"
                >
                  <ScanLine size={15} />
                </button>
                <button
                  className="meal-add-btn"
                  onClick={() => { setScanProduct(null); setAddTarget({ mealKey: key, mealLabel: label }); }}
                  title="Search food"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="meal-empty">Nothing logged yet</div>
            ) : (
              entries.map(e => (
                <div key={e.id} className="food-log-row">
                  <div className="food-log-info">
                    <div className="food-log-name">{e.food_name}</div>
                    <div className="food-log-meta">
                      {e.serving_size_g ? `${e.serving_size_g}g` : ''}
                      {e.brand ? ` · ${e.brand}` : ''}
                    </div>
                    <div className="food-log-macros">
                      {e.calories != null && <span>{Math.round(e.calories)} kcal</span>}
                      {e.protein_g != null && <span style={{ color: '#e63030' }}>P {parseFloat(e.protein_g).toFixed(1)}g</span>}
                      {e.carbs_g != null && <span style={{ color: '#f0b429' }}>C {parseFloat(e.carbs_g).toFixed(1)}g</span>}
                      {e.fat_g != null && <span style={{ color: '#7c5cfc' }}>F {parseFloat(e.fat_g).toFixed(1)}g</span>}
                    </div>
                  </div>
                  <button className="food-log-delete" onClick={() => handleDelete(e.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        );
      })}

      {/* Modals */}
      {showScanner && (
        <ScannerModal
          onResult={handleBarcode}
          onClose={() => setShowScanner(false)}
        />
      )}

      {addTarget && (
        <AddFoodModal
          mealKey={addTarget.mealKey}
          mealLabel={addTarget.mealLabel}
          prefillProduct={scanProduct}
          savedFoods={savedFoods}
          onSaveFood={handleSaveFood}
          onUnsaveFood={handleUnsaveFood}
          onAdd={handleAdd}
          onClose={() => { setAddTarget(null); setScanProduct(null); }}
        />
      )}

      {showGoals && (
        <GoalsModal
          goals={goals}
          onSave={handleSaveGoals}
          onClose={() => setShowGoals(false)}
        />
      )}
    </div>
  );
}
