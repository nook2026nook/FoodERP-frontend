import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Formulation vault token: kept in memory only, so a page reload locks the vault again.
let vaultToken = null;
export const setVaultToken = (token) => { vaultToken = token; };
export const hasVaultToken = () => Boolean(vaultToken);

// Request interceptor to add JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (vaultToken) {
    config.headers['x-vault-token'] = vaultToken;
  }
  return config;
});

// Response interceptor to handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.code === 'VAULT_LOCKED') {
      vaultToken = null;
    }
    // A wrong passcode is also a 401; it must not sign the user out.
    if (error.response?.status === 401 && !error.config?.keepSessionOn401) {
      // Token expired or invalid - redirect to login
      localStorage.removeItem('erp_jwt_token');
      localStorage.removeItem('erp_current_user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authAPI = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }, { keepSessionOn401: true }),

  getCurrentUser: () =>
    api.get('/auth/me'),

  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }, { keepSessionOn401: true })
};

/** Readable message from an API error. */
// The API sends `error` as a string; proxies/hosts (e.g. Vercel 404s) send { code, message }.
export const errorMessage = (e, fallback) => {
  const err = e?.response?.data?.error;
  if (typeof err === 'string') return err;
  if (err && typeof err.message === 'string') return err.message;
  return fallback;
};

// Formulation vault endpoints
export const vaultAPI = {
  status: () => api.get('/vault/status'),
  unlock: (passcode) => api.post('/vault/unlock', { passcode }, { keepSessionOn401: true }),
  changePasscode: (currentPasscode, newPasscode) =>
    api.post('/vault/change-passcode', { currentPasscode, newPasscode }, { keepSessionOn401: true })
};

// Suppliers endpoints
export const suppliersAPI = {
  getAll: () => api.get('/suppliers'),
  create: (data) => api.post('/suppliers', data),
  delete: (id) => api.delete(`/suppliers/${id}`)
};

// Master Items endpoints
export const itemsAPI = {
  getAll: (category) =>
    api.get('/items', { params: category ? { category } : {} }),
  create: (data) => api.post('/items', data),
  update: (id, data) => api.put(`/items/${id}`, data),
  delete: (id) => api.delete(`/items/${id}`)
};

// Warehouse Lots endpoints
export const lotsAPI = {
  getAll: (activeOnly = false) =>
    api.get('/lots', { params: { active_only: activeOnly } }),
  receive: (data) => api.post('/lots/receive', data),
  update: (id, data) => api.put(`/lots/${id}`, data),
  delete: (id) => api.delete(`/lots/${id}`)
};

// Recipes endpoints (all but options need the vault token)
export const recipesAPI = {
  options: () => api.get('/recipes/options'),
  getAll: () => api.get('/recipes'),
  getById: (id) => api.get(`/recipes/${id}`),
  preview: (data) => api.post('/recipes/preview', data),
  create: (data) => api.post('/recipes', data),
  update: (id, data) => api.put(`/recipes/${id}`, data),
  delete: (id) => api.delete(`/recipes/${id}`)
};

// Production Batches endpoints
export const batchesAPI = {
  getAll: () => api.get('/batches'),
  getById: (id) => api.get(`/batches/${id}`),
  bakingRequirements: (params) => api.get('/batches/baking-requirements', { params }),
  packagingRequirements: (id, counts) => api.get(`/batches/${id}/packaging-requirements`, { params: counts }),
  plan: (data) => api.post('/batches/plan', data),
  saveBaking: (data) => api.post('/batches/baking', data),
  savePackaging: (id, data) => api.put(`/batches/${id}/packaging`, data),
  setStatus: (id, status, note) => api.patch(`/batches/${id}/status`, { status, note }),
  delete: (id) => api.delete(`/batches/${id}`)
};

// Shipments endpoints
export const shipmentsAPI = {
  getAll: (params) => api.get('/shipments', { params }),
  create: (data) => api.post('/shipments', data),
  delete: (id) => api.delete(`/shipments/${id}`)
};

// Finished goods (ready-to-ship) endpoints
export const inventoryAPI = {
  readyToShip: () => api.get('/inventory/ready-to-ship'),
  batches: (params) => api.get('/inventory/batches', { params }),
  openBox: (batchId, format, boxes) => api.post('/inventory/open-box', { batch_id: batchId, format, boxes })
};

// Reports endpoints
export const reportsAPI = {
  getShipments: (timeframe) =>
    api.get('/reports/shipments', { params: { timeframe } }),
  getWastage: () => api.get('/reports/wastage'),
  getInventoryValue: () => api.get('/reports/inventory-value')
};

// FSMA mock recall endpoints
export const recallAPI = {
  search: (q) => api.get('/recall/search', { params: { q } }),
  byBatch: (batchNumber) => api.get(`/recall/batch/${encodeURIComponent(batchNumber)}`),
  byLot: (lotNumber) => api.get(`/recall/lot/${encodeURIComponent(lotNumber)}`)
};

// QuickBooks endpoints
export const qboAPI = {
  getStatus: () => api.get('/qbo/status'),
  // The server issues a one-time state; the browser then goes to Intuit's consent page.
  connect: async () => {
    const { data } = await api.post('/qbo/connect-url');
    window.location.href = data.url;
  },
  disconnect: () => api.post('/qbo/disconnect'),
  syncInvoices: () => api.post('/qbo/sync-invoices'),
  setSyncStartDate: (startDate, removeEarlier = false) =>
    api.put('/qbo/sync-start-date', { start_date: startDate || null, remove_earlier: removeEarlier }),
  getItems: () => api.get('/qbo/items'),
  getItemMappings: () => api.get('/qbo/item-mappings'),
  createMapping: (data) => api.post('/qbo/item-mappings', data),
  deleteMapping: (id) => api.delete(`/qbo/item-mappings/${id}`),
  getSyncLog: () => api.get('/qbo/sync-log'),
  openLines: () => api.get('/shipments/open-lines'),
  allocateLine: (lineId, batchId) => api.post(`/shipments/lines/${lineId}/allocate`, { batch_id: batchId || null }),
  releaseLine: (lineId) => api.post(`/shipments/lines/${lineId}/release`)
};

// Admin endpoints
export const adminAPI = {
  getUsers: () => api.get('/admin/users'),
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  exportDatabase: () => api.get('/admin/export'),
  importDatabase: (data) => api.post('/admin/import', data)
};

export default api;
