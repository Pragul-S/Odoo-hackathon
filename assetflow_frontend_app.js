const API_BASE = '/api';

// Frontend Application State
const state = {
    currentUser: null,
    currentView: 'dashboard',
    assets: [],
    searchQuery: '',
    filterCategory: '',
    filterStatus: '',
    departments: [],
    categories: [],
    allocations: [],
    bookings: [],
    maintenanceRequests: [],
    auditCycles: [],
    notifications: [],
    activityLogs: [],
    activeAdminTab: 'departments'
};

const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'], description: 'Real-time KPI overview for assets, bookings, returns, and maintenance.' },
    { id: 'assets', label: 'Asset Directory', icon: 'fa-box', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'], description: 'Register, search, and track assets through their lifecycle states.' },
    { id: 'allocations', label: 'Allocations & Transfers', icon: 'fa-arrow-right-arrow-left', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'], description: 'Allocate assets, approve transfers, and capture returns with conflict prevention.' },
    { id: 'bookings', label: 'Resource Booking', icon: 'fa-calendar-check', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'], description: 'Book shared resources by time slot with overlap validation and calendar visibility.' },
    { id: 'maintenance', label: 'Maintenance', icon: 'fa-wrench', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'], description: 'Raise, review, approve, and resolve maintenance requests with asset status updates.' },
    { id: 'audit', label: 'Asset Audit', icon: 'fa-clipboard-check', roles: ['Admin', 'Asset Manager', 'Department Head'], description: 'Run audit cycles, assign auditors, and flag discrepancies for follow-up.' },
    { id: 'reports', label: 'Reports & Analytics', icon: 'fa-chart-column', roles: ['Admin', 'Asset Manager', 'Department Head'], description: 'Monitor utilization, maintenance trends, bookings, and department-level summaries.' },
    { id: 'notifications', label: 'Activity Logs & Notifications', icon: 'fa-bell', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'], description: 'View alerts, assignment history, approval activity, and operational audit logs.' },
    { id: 'admin', label: 'Organization Setup', icon: 'fa-gear', roles: ['Admin'], description: 'Maintain departments, categories, and the employee directory with role promotion.' },
];

// Show Loading Spinner Overlay
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) overlay.classList.remove('hide');
    else overlay.classList.add('hide');
}

// Fetch all database records for state sync
async function loadData() {
    if (!state.currentUser) return;
    showLoading(true);
    try {
        await Promise.all([
            fetchAssets(),
            fetchDepartments(),
            fetchCategories(),
            fetchAllocations(),
            fetchBookings(),
            fetchMaintenanceRequests(),
            fetchAuditCycles(),
            fetchNotifications(),
            fetchLogs()
        ]);
        renderCurrentView();
    } catch (error) {
        console.error('Data load error:', error);
    } finally {
        showLoading(false);
    }
}

// API Fetch wrappers
async function fetchAssets() {
    const res = await fetch(`${API_BASE}/assets`);
    state.assets = await res.json();
}
async function fetchDepartments() {
    const res = await fetch(`${API_BASE}/admin/departments`);
    state.departments = await res.json();
}
async function fetchCategories() {
    const res = await fetch(`${API_BASE}/admin/categories`);
    state.categories = await res.json();
}
async function fetchAllocations() {
    const res = await fetch(`${API_BASE}/allocations`);
    state.allocations = await res.json();
}
async function fetchBookings() {
    const res = await fetch(`${API_BASE}/bookings`);
    state.bookings = await res.json();
}
async function fetchMaintenanceRequests() {
    const res = await fetch(`${API_BASE}/maintenance`);
    state.maintenanceRequests = await res.json();
}
async function fetchAuditCycles() {
    const res = await fetch(`${API_BASE}/audits`);
    state.auditCycles = await res.json();
}
async function fetchNotifications() {
    const res = await fetch(`${API_BASE}/notifications?userId=${state.currentUser.id}`);
    state.notifications = await res.json();
}
async function fetchLogs() {
    const res = await fetch(`${API_BASE}/logs`);
    state.activityLogs = await res.json();
}

function showAppShell() {
    document.getElementById('auth-screen').classList.add('hide');
    document.getElementById('app-shell').classList.remove('hide');
}

function showAuthScreen() {
    document.getElementById('auth-screen').classList.remove('hide');
    document.getElementById('app-shell').classList.add('hide');
}

function signOut() {
    state.currentUser = null;
    localStorage.removeItem('assetflow-remembered-login');
    showAuthScreen();
    setAuthMode('login');
    document.getElementById('header-title').innerText = 'Dashboard';
    document.getElementById('current-user-name').innerText = 'Loading...';
    document.getElementById('current-user-role').innerText = '...';
}

function loadRememberedLogin() {
    const saved = localStorage.getItem('assetflow-remembered-login');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            document.getElementById('login-email').value = parsed.email || '';
            document.getElementById('login-password').value = parsed.password || '';
            document.getElementById('remember-me').checked = true;
            return;
        } catch (e) {
            localStorage.removeItem('assetflow-remembered-login');
        }
    }
    // Prefill default admin login for convenience
    document.getElementById('login-email').value = 'sarah@assetflow.com';
    document.getElementById('login-password').value = 'demo123';
    document.getElementById('remember-me').checked = true;
}

async function attemptAutoLogin() {
    const saved = localStorage.getItem('assetflow-remembered-login');
    if (!saved) return;
    try {
        const parsed = JSON.parse(saved);
        await loginUser(parsed.email, parsed.password, true);
    } catch (e) {
        localStorage.removeItem('assetflow-remembered-login');
    }
}

async function loginUser(email, password, isAuto = false) {
    showLoading(true);
    document.getElementById('login-error-container').classList.add('hide');
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Authentication failed');

        state.currentUser = data;
        showAppShell();
        renderHeader();
        renderSidebar();
        navigateTo('dashboard');
        await loadData();
    } catch (err) {
        if (!isAuto) {
            const errBox = document.getElementById('login-error-container');
            const errText = document.getElementById('login-error-text');
            errText.innerText = err.message;
            errBox.classList.remove('hide');
        }
    } finally {
        showLoading(false);
    }
}

function togglePasswordVisibility() {
    const passwordField = document.getElementById('login-password');
    const toggleButton = document.getElementById('btn-toggle-password');
    const isPasswordHidden = passwordField.type === 'password';

    passwordField.type = isPasswordHidden ? 'text' : 'password';
    toggleButton.innerHTML = isPasswordHidden
        ? '<i class="fa-solid fa-eye-slash"></i>'
        : '<i class="fa-solid fa-eye"></i>';
}

function setAuthMode(mode) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const forgotForm = document.getElementById('forgot-password-form');
    const resetForm = document.getElementById('reset-password-form');
    const loginBtn = document.getElementById('btn-show-login');
    const signupBtn = document.getElementById('btn-show-signup');

    loginForm.classList.toggle('hide', mode !== 'login');
    signupForm.classList.toggle('hide', mode !== 'signup');
    forgotForm.classList.toggle('hide', mode !== 'forgot');
    resetForm.classList.toggle('hide', mode !== 'reset');

    loginBtn.classList.toggle('bg-blue-600', mode === 'login');
    loginBtn.classList.toggle('text-white', mode === 'login');
    signupBtn.classList.toggle('bg-blue-600', mode === 'signup');
    signupBtn.classList.toggle('text-white', mode === 'signup');
}

function renderSidebar() {
    if (!state.currentUser) return;
    const navContainer = document.getElementById('sidebar-nav');
    navContainer.innerHTML = '';

    navItems.forEach(item => {
        if (!item.roles.includes(state.currentUser.role)) return;

        const isActive = state.currentView === item.id;
        const button = document.createElement('button');
        button.className = `w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1 ${isActive ? 'tab-active' : 'tab-inactive'}`;
        button.innerHTML = `<i class="fa-solid ${item.icon} w-5 h-5 mr-3 flex items-center justify-center"></i> ${item.label}`;
        button.onclick = () => navigateTo(item.id);
        navContainer.appendChild(button);
    });
}

function renderHeader() {
    if (!state.currentUser) return;
    document.getElementById('current-user-name').innerText = state.currentUser.name;
    document.getElementById('current-user-role').innerText = state.currentUser.role;

    // Load active roles view switcher
    const switcher = document.getElementById('role-switcher');
    switcher.innerHTML = '';
    
    const viewOptions = [
        { id: state.currentUser.id, label: `${state.currentUser.name} (${state.currentUser.role})` }
    ];
    
    // Admins can see the simulation options to evaluate department heads or asset managers
    if (state.currentUser.role === 'Admin') {
        viewOptions.push(
            { id: 'sim-manager', label: 'Simulate Asset Manager' },
            { id: 'sim-head', label: 'Simulate Dept Head' },
            { id: 'sim-employee', label: 'Simulate Employee' }
        );
    }

    viewOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.id;
        option.innerText = opt.label;
        switcher.appendChild(option);
    });
}

function canViewAssetDetails(asset) {
    if (!state.currentUser || !asset) return false;
    if (['Admin', 'Asset Manager'].includes(state.currentUser.role)) return true;
    return asset.department_id === state.currentUser.department_id;
}

function formatDateLabel(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}

function navigateTo(viewId) {
    if (!state.currentUser) {
        showAuthScreen();
        return;
    }
    state.currentView = viewId;
    document.getElementById('header-title').innerText = navItems.find(item => item.id === viewId)?.label || viewId;
    document.querySelectorAll('.view-section').forEach(section => section.classList.add('hide'));

    const viewElement = document.getElementById(`view-${viewId}`);
    if (viewElement) {
        viewElement.classList.remove('hide');
    } else {
        document.getElementById('view-placeholder').classList.remove('hide');
        document.getElementById('placeholder-title').innerText = navItems.find(item => item.id === viewId).label;
    }

    renderSidebar();
    renderCurrentView();
}

function renderCurrentView() {
    if (state.currentView === 'dashboard') renderDashboard();
    else if (state.currentView === 'assets') renderAssetsTable();
    else if (state.currentView === 'allocations') renderAllocations();
    else if (state.currentView === 'bookings') renderBookings();
    else if (state.currentView === 'maintenance') renderMaintenance();
    else if (state.currentView === 'audit') renderAudit();
    else if (state.currentView === 'reports') renderReports();
    else if (state.currentView === 'notifications') renderNotifications();
    else if (state.currentView === 'admin') renderAdminContent();
}

// ==========================================
// 2. DASHBOARD VIEW
// ==========================================
async function renderDashboard() {
    try {
        const res = await fetch(`${API_BASE}/dashboard/stats`);
        const data = await res.json();
        const { stats, overdueList } = data;

        document.getElementById('dashboard-stats').innerHTML = `
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center">
                <div class="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center text-green-600 mr-4"><i class="fa-solid fa-boxes-stacked text-xl"></i></div>
                <div><div class="text-xs text-slate-500 font-semibold uppercase">Assets Available</div><div class="text-2xl font-bold text-slate-900">${stats.available}</div></div>
            </div>
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center">
                <div class="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mr-4"><i class="fa-solid fa-hand-holding-hand text-xl"></i></div>
                <div><div class="text-xs text-slate-500 font-semibold uppercase">Assets Allocated</div><div class="text-2xl font-bold text-slate-900">${stats.allocated}</div></div>
            </div>
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center">
                <div class="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 mr-4"><i class="fa-solid fa-wrench text-xl"></i></div>
                <div><div class="text-xs text-slate-500 font-semibold uppercase">Maintenance Today</div><div class="text-2xl font-bold text-slate-900">${stats.underMaint}</div></div>
            </div>
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center">
                <div class="w-12 h-12 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 mr-4"><i class="fa-solid fa-calendar-check text-xl"></i></div>
                <div><div class="text-xs text-slate-500 font-semibold uppercase">Active Bookings</div><div class="text-2xl font-bold text-slate-900">${stats.activeBookings}</div></div>
            </div>
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center">
                <div class="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 mr-4"><i class="fa-solid fa-arrow-right-arrow-left text-xl"></i></div>
                <div><div class="text-xs text-slate-500 font-semibold uppercase">Pending Transfers</div><div class="text-2xl font-bold text-slate-900">${stats.pendingTransfers}</div></div>
            </div>
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center">
                <div class="w-12 h-12 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600 mr-4"><i class="fa-solid fa-hourglass-half text-xl"></i></div>
                <div><div class="text-xs text-slate-500 font-semibold uppercase">Upcoming Returns</div><div class="text-2xl font-bold text-slate-900">${stats.upcomingReturns}</div></div>
            </div>
        `;

        // Render activity logs list
        const activityList = document.getElementById('recent-activity-list');
        activityList.innerHTML = '';
        if (state.activityLogs.length === 0) {
            activityList.innerHTML = '<p class="text-slate-400 text-sm">No activity recorded yet.</p>';
        } else {
            state.activityLogs.forEach(log => {
                const dateLabel = new Date(log.created_at).toLocaleTimeString();
                activityList.innerHTML += `
                    <div class="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0">
                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mt-0.5"><i class="fa-solid fa-history text-xs"></i></div>
                        <div>
                            <p class="text-sm text-slate-800"><strong>${log.userName || 'System'}</strong>: ${log.action} for <strong>${log.target}</strong>. <span class="text-slate-500">${log.details || ''}</span></p>
                            <p class="text-xs text-slate-400 mt-1">${dateLabel}</p>
                        </div>
                    </div>
                `;
            });
        }

        // Render overdue returns attention panel
        const attentionList = document.getElementById('overdue-attention-list');
        attentionList.innerHTML = '';
        if (overdueList.length === 0) {
            attentionList.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-slate-400 text-center py-6">
                    <i class="fa-solid fa-circle-check text-green-500 text-3xl mb-2"></i>
                    <p class="text-sm font-semibold">No Overdue Returns</p>
                    <p class="text-xs">All asset allocations are within expected return windows.</p>
                </div>
            `;
        } else {
            overdueList.forEach(item => {
                attentionList.innerHTML += `
                    <div class="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3 shadow-xs">
                        <i class="fa-solid fa-triangle-exclamation text-red-600 mt-0.5 text-sm"></i>
                        <div class="flex-1 min-w-0">
                            <h4 class="text-xs font-bold text-red-800 uppercase">Return Overdue</h4>
                            <p class="text-sm text-red-700 font-semibold truncate">${item.tag} - ${item.assetName}</p>
                            <p class="text-xs text-red-500 mt-0.5">Held by ${item.assigneeName} • Due: ${formatDateLabel(item.expected_return_date)}</p>
                        </div>
                    </div>
                `;
            });
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// 3. ORGANIZATION SETUP (Admin)
// ==========================================
async function renderAdminContent() {
    const adminList = document.getElementById('admin-departments-list');
    const categoryList = document.getElementById('admin-categories-list');
    const employeeList = document.getElementById('admin-employees-list');
    const depHeadSelect = document.getElementById('dep-head');
    const depParentSelect = document.getElementById('dep-parent');
    const formAssetOwner = document.getElementById('form-asset-owner');

    // Load active users dropdown
    depHeadSelect.innerHTML = '<option value="">Select Department Head</option>';
    formAssetOwner.innerHTML = '<option value="">Unassigned</option>';
    
    // Fetch employees from backend to list
    const empRes = await fetch(`${API_BASE}/admin/employees`);
    const employees = await empRes.json();

    employees.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.innerText = `${user.name} (${user.role})`;
        depHeadSelect.appendChild(option);

        const ownerOpt = option.cloneNode(true);
        formAssetOwner.appendChild(ownerOpt);
    });

    // Parent department select options
    depParentSelect.innerHTML = '<option value="">No Parent</option>';
    state.departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept.id;
        option.innerText = dept.name;
        depParentSelect.appendChild(option);
    });

    // Render Departments
    adminList.innerHTML = state.departments.map(dept => {
        const head = dept.headName || 'No assigned head';
        const parent = dept.parentName ? ` (Sub of ${dept.parentName})` : '';
        return `
            <div class="rounded-xl border border-slate-200 p-4 bg-slate-50 flex items-center justify-between shadow-xs">
                <div>
                    <div class="text-sm font-bold text-slate-900">${dept.name}${parent}</div>
                    <div class="text-xs text-slate-500">Head: ${head} • Status: <span class="${dept.status === 'Active' ? 'text-green-600' : 'text-slate-400'} font-semibold">${dept.status}</span></div>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="editDepartment(${dept.id}, '${dept.name}', ${dept.head_user_id || 'null'}, ${dept.parent_id || 'null'}, '${dept.status}')" class="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border text-xs font-semibold rounded-md transition-colors"><i class="fa-solid fa-edit mr-1"></i>Edit</button>
                </div>
            </div>
        `;
    }).join('');

    // Render Categories
    categoryList.innerHTML = state.categories.map(cat => `
        <div class="rounded-xl border border-slate-200 p-4 bg-slate-50 flex items-center justify-between shadow-xs">
            <div>
                <div class="text-sm font-bold text-slate-900">${cat.name}</div>
                <div class="text-xs text-slate-500">Custom Fields: ${cat.fields || 'None'}</div>
            </div>
            <div class="flex gap-2">
                <button type="button" onclick="editCategory(${cat.id}, '${cat.name}', '${cat.fields || ''}')" class="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border text-xs font-semibold rounded-md transition-colors"><i class="fa-solid fa-edit mr-1"></i>Edit</button>
            </div>
        </div>
    `).join('');

    // Render Employees Directory
    employeeList.innerHTML = employees.map(user => {
        const isPending = user.status === 'Pending Approval';
        const statusColor = user.status === 'Active' ? 'bg-green-100 text-green-700' : user.status === 'Inactive' ? 'bg-slate-100 text-slate-600' : 'bg-yellow-100 text-yellow-700';
        return `
            <div class="rounded-xl border border-slate-200 p-4 bg-slate-50 flex flex-col gap-3 md:flex-row md:items-center md:justify-between shadow-xs">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-slate-900">${user.name}</span>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${statusColor}">${user.status}</span>
                    </div>
                    <div class="text-xs text-slate-500 mt-0.5">${user.email} • Dept: ${user.departmentName || 'General'} • Role: <strong class="text-slate-700">${user.role}</strong></div>
                </div>
                <div class="flex gap-2 flex-wrap">
                    ${isPending
                        ? `<button type="button" onclick="approveEmployee(${user.id})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors">Approve Signup</button>`
                        : `<button type="button" onclick="promoteEmployee(${user.id}, 'Department Head')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors">Promote Dept Head</button>
                           <button type="button" onclick="promoteEmployee(${user.id}, 'Asset Manager')" class="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors">Promote Manager</button>
                           <button type="button" onclick="toggleEmployeeStatus(${user.id}, '${user.status === 'Active' ? 'Inactive' : 'Active'}')" class="px-3 py-1.5 bg-white border hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-colors">${user.status === 'Active' ? 'Deactivate' : 'Activate'}</button>`
                    }
                </div>
            </div>
        `;
    }).join('');

    // Toggle active admin panels
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.adminTab === state.activeAdminTab);
    });

    document.querySelectorAll('.admin-tab-panel').forEach(panel => {
        panel.classList.toggle('hide', panel.id !== `admin-tab-${state.activeAdminTab}`);
    });
}

// Department editing helper
window.editDepartment = function(id, name, headId, parentId, status) {
    document.getElementById('dep-edit-id').value = id;
    document.getElementById('dep-name').value = name;
    document.getElementById('dep-head').value = headId || '';
    document.getElementById('dep-parent').value = parentId || '';
    document.getElementById('dep-status').value = status;
    document.getElementById('dep-form-title').innerText = 'Modify Department';
};

// Category editing helper
window.editCategory = function(id, name, fields) {
    document.getElementById('cat-edit-id').value = id;
    document.getElementById('cat-name').value = name;
    document.getElementById('cat-fields').value = fields;
    document.getElementById('cat-form-title').innerText = 'Modify Category';
};

// Employee setup operations
window.approveEmployee = async function(id) {
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/admin/employees/${id}/approve`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Could not approve signup');
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
};

window.promoteEmployee = async function(id, role) {
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/admin/employees/${id}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
        });
        if (!res.ok) throw new Error('Promotion failed');
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
};

window.toggleEmployeeStatus = async function(id, status) {
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/admin/employees/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!res.ok) throw new Error('Status update failed');
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
};

// ==========================================
// 4. ASSET DIRECTORY VIEW & REGISTER
// ==========================================
function renderAssetsTable() {
    const btnAdd = document.getElementById('btn-open-modal');
    if (['Admin', 'Asset Manager'].includes(state.currentUser.role)) {
        btnAdd.classList.remove('hide');
    } else {
        btnAdd.classList.add('hide');
    }

    // Populate category filters and register dropdowns
    const filterCat = document.getElementById('filter-category');
    const formCat = document.getElementById('form-asset-category');
    const allocAsset = document.getElementById('allocation-asset');
    const maintAsset = document.getElementById('maintenance-asset');
    const bookResource = document.getElementById('booking-resource');

    const catOptions = state.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    filterCat.innerHTML = '<option value="">All Categories</option>' + catOptions;
    formCat.innerHTML = catOptions;

    // Filtered list
    const query = state.searchQuery.toLowerCase();
    const catFilter = document.getElementById('filter-category').value;
    const statusFilter = document.getElementById('filter-status').value;

    const filtered = state.assets.filter(asset => {
        if (!canViewAssetDetails(asset)) return false;
        
        const owner = (asset.allocatedToName || (asset.shared ? 'Shared Resource' : 'Available')).toLowerCase();
        const matchesQuery = 
            asset.name.toLowerCase().includes(query) ||
            asset.tag.toLowerCase().includes(query) ||
            asset.serial.toLowerCase().includes(query) ||
            asset.location.toLowerCase().includes(query) ||
            owner.includes(query);

        const matchesCat = !catFilter || asset.categoryName === catFilter;
        const matchesStatus = !statusFilter || asset.status === statusFilter;

        return matchesQuery && matchesCat && matchesStatus;
    });

    // Populate drop selectors in forms with relevant assets
    // Allocations: Available assets
    allocAsset.innerHTML = state.assets
        .filter(a => a.status === 'Available' && !a.shared)
        .map(a => `<option value="${a.id}">${a.tag} • ${a.name}</option>`).join('');

    // Maintenance: All assets
    maintAsset.innerHTML = state.assets
        .map(a => `<option value="${a.id}">${a.tag} • ${a.name}</option>`).join('');

    // Bookings: Shared Bookable assets
    bookResource.innerHTML = state.assets
        .filter(a => a.shared)
        .map(a => `<option value="${a.id}">${a.name} (${a.location})</option>`).join('');

    const tbody = document.getElementById('assets-table-body');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-sm text-slate-500 text-center font-medium">No assets matching the query could be found.</td></tr>';
        return;
    }

    filtered.forEach(asset => {
        let statusClass = 'bg-slate-100 text-slate-700 border-slate-200';
        if (asset.status === 'Available') statusClass = 'bg-green-100 text-green-700 border-green-200';
        else if (asset.status === 'Allocated') statusClass = 'bg-blue-100 text-blue-700 border-blue-200';
        else if (asset.status === 'Reserved') statusClass = 'bg-violet-100 text-violet-700 border-violet-200';
        else if (asset.status === 'Under Maintenance') statusClass = 'bg-amber-100 text-amber-700 border-amber-200';
        else if (asset.status === 'Lost') statusClass = 'bg-red-100 text-red-700 border-red-200';
        else if (['Retired', 'Disposed'].includes(asset.status)) statusClass = 'bg-rose-100 text-rose-700 border-rose-200';

        const owner = asset.shared ? 'Shared Resource' : (asset.allocatedToName || 'Available');

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors align-top cursor-pointer';
        row.innerHTML = `
            <td class="px-6 py-4 text-sm font-semibold text-slate-900 font-mono">${asset.tag}</td>
            <td class="px-6 py-4 text-sm text-slate-700">
                <div class="font-bold text-slate-900">${asset.name}</div>
                <div class="text-xs text-slate-400 font-mono mt-0.5">Serial: ${asset.serial}</div>
            </td>
            <td class="px-6 py-4 text-sm text-slate-600">${asset.categoryName || 'General'}</td>
            <td class="px-6 py-4 text-sm text-slate-700 font-semibold">${owner}</td>
            <td class="px-6 py-4 text-sm text-slate-600">${asset.condition}</td>
            <td class="px-6 py-4 text-sm">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusClass}">${asset.status}</span>
            </td>
            <td class="px-6 py-4 text-sm text-slate-600">${asset.location}</td>
            <td class="px-6 py-4 text-sm text-center">
                <button type="button" onclick="viewAssetDetails(${asset.id}); event.stopPropagation();" class="text-blue-600 hover:text-blue-800 font-bold"><i class="fa-solid fa-info-circle mr-1"></i>Logs</button>
            </td>
        `;
        row.onclick = () => viewAssetDetails(asset.id);
        tbody.appendChild(row);
    });
}

// Show asset histories overlay modal
window.viewAssetDetails = async function(id) {
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/assets/${id}/history`);
        const data = await res.json();

        const asset = state.assets.find(a => a.id === id);
        if (!asset) return;

        document.getElementById('detail-title').innerText = `${asset.name} Details`;
        document.getElementById('detail-tag-label').innerText = asset.tag;

        document.getElementById('detail-meta-container').innerHTML = `
            <div><strong>Asset Name:</strong><br>${asset.name}</div>
            <div><strong>Tag / Serial:</strong><br>${asset.tag} / ${asset.serial}</div>
            <div><strong>Category:</strong><br>${asset.categoryName || 'General'}</div>
            <div><strong>Condition:</strong><br>${asset.condition}</div>
            <div><strong>Warranty Expiration:</strong><br>${formatDateLabel(asset.warranty_expiry_date)}</div>
            <div><strong>Acquisition Cost:</strong><br>$${Number(asset.cost).toLocaleString()}</div>
            <div><strong>Current Location:</strong><br>${asset.location}</div>
            <div><strong>Lifecycle State:</strong><br>${asset.status}</div>
        `;

        // Timelines
        const allocHistory = document.getElementById('detail-allocation-history');
        allocHistory.innerHTML = '';
        if (data.allocations.length === 0) {
            allocHistory.innerHTML = '<p class="text-slate-400">No allocation logs found.</p>';
        } else {
            data.allocations.forEach(item => {
                const date = new Date(item.allocated_at).toLocaleDateString();
                const returnDate = item.returned_at ? new Date(item.returned_at).toLocaleDateString() : 'Active';
                allocHistory.innerHTML += `
                    <div class="border-l-2 border-blue-500 pl-3 py-1 relative">
                        <div class="w-2.5 h-2.5 rounded-full bg-blue-500 absolute -left-[6px] top-2"></div>
                        <p class="font-bold text-slate-800">${item.assigneeName} (${item.departmentName || 'General'})</p>
                        <p class="text-slate-500">Period: ${date} to ${returnDate} • Check-out condition: ${item.condition_out} • Notes: ${item.return_notes || 'None'}</p>
                    </div>
                `;
            });
        }

        const maintHistory = document.getElementById('detail-maintenance-history');
        maintHistory.innerHTML = '';
        if (data.maintenance.length === 0) {
            maintHistory.innerHTML = '<p class="text-slate-400">No repair logs found.</p>';
        } else {
            data.maintenance.forEach(item => {
                const date = new Date(item.date).toLocaleDateString();
                maintHistory.innerHTML += `
                    <div class="border-l-2 border-amber-500 pl-3 py-1 relative">
                        <div class="w-2.5 h-2.5 rounded-full bg-amber-500 absolute -left-[6px] top-2"></div>
                        <p class="font-bold text-slate-800">${item.issue} (${date})</p>
                        <p class="text-slate-500">Cost: $${Number(item.cost).toLocaleString()} • Technician: ${item.resolved_by_tech || 'Unassigned'}</p>
                    </div>
                `;
            });
        }

        document.getElementById('asset-details-modal').classList.remove('hide');
    } catch (e) {
        console.error(e);
    } finally {
        showLoading(false);
    }
};

// QR simulation
document.getElementById('btn-simulate-qr').addEventListener('click', () => {
    if (state.assets.length === 0) return;
    const randomAsset = state.assets[Math.floor(Math.random() * state.assets.length)];
    document.getElementById('asset-search').value = randomAsset.tag;
    state.searchQuery = randomAsset.tag;
    renderAssetsTable();
});

// Category selection container visibility toggle
document.getElementById('form-asset-status').addEventListener('change', (e) => {
    const ownerContainer = document.getElementById('form-asset-owner-container');
    if (e.target.value === 'Allocated') {
        ownerContainer.classList.remove('hide');
    } else {
        ownerContainer.classList.add('hide');
    }
});

// ==========================================
// 5. ALLOCATIONS & RETURN FLOW
// ==========================================
function renderAllocations() {
    const list = document.getElementById('allocation-list');
    list.innerHTML = '';

    const activeAlloc = state.allocations.filter(al => al.status === 'Active');
    if (activeAlloc.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-sm font-semibold text-center py-6">No active allocations.</p>';
    } else {
        activeAlloc.forEach(item => {
            const date = new Date(item.allocated_at).toLocaleDateString();
            const today = new Date();
            const isOverdue = item.expected_return_date && new Date(item.expected_return_date) < today;

            list.innerHTML += `
                <div class="rounded-xl border border-slate-200 p-4 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between shadow-xs">
                    <div>
                        <div class="text-sm font-bold text-slate-900">${item.tag} — ${item.assetName}</div>
                        <div class="text-xs text-slate-500 mt-0.5">Assigned to ${item.assigneeName} (${item.departmentName || 'General'}) • Allocated on ${date}</div>
                        ${item.expected_return_date 
                            ? `<div class="text-xs mt-1 font-semibold ${isOverdue ? 'text-red-600' : 'text-slate-500'}">Expected Return: ${formatDateLabel(item.expected_return_date)} ${isOverdue ? '(Overdue)' : ''}</div>`
                            : ''
                        }
                    </div>
                    <button type="button" onclick="openReturnModal(${item.asset_id})" class="mt-3 md:mt-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"><i class="fa-solid fa-inbox-in mr-1"></i>Check In Returned</button>
                </div>
            `;
        });
    }

    // Render transfers
    renderTransfers();
}

window.openReturnModal = function(assetId) {
    document.getElementById('return-asset-id').value = assetId;
    document.getElementById('return-notes').value = '';
    document.getElementById('return-asset-modal').classList.remove('hide');
};

// Handle return check-in submit
document.getElementById('return-asset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const assetId = document.getElementById('return-asset-id').value;
    const checkInNotes = document.getElementById('return-notes').value.trim();
    const returnCondition = document.getElementById('return-condition').value;

    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/allocations/return`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                assetId,
                checkInNotes,
                returnCondition,
                actionedBy: state.currentUser.id
            })
        });

        if (!res.ok) throw new Error('Return check-in failed');
        document.getElementById('return-asset-modal').classList.add('hide');
        await loadData();
    } catch (err) {
        alert(err.message);
    } finally {
        showLoading(false);
    }
});

// Transfer submission trigger on conflict
document.getElementById('btn-submit-transfer').addEventListener('click', async () => {
    const assetId = document.getElementById('conflict-asset-id').value;
    const requestedBy = document.getElementById('conflict-assignee-id').value;
    const currentHolderId = document.getElementById('conflict-holder-id').value;
    const targetDepartmentName = document.getElementById('conflict-department').value;

    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/transfers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                assetId,
                requestedBy,
                currentHolderId,
                targetAssigneeId: requestedBy,
                targetDepartmentName
            })
        });

        if (!res.ok) throw new Error('Failed to raise transfer request.');
        document.getElementById('transfer-conflict-modal').classList.add('hide');
        alert('Transfer request raised successfully and routed for approval.');
        await loadData();
    } catch (err) {
        alert(err.message);
    } finally {
        showLoading(false);
    }
});

// Render transfers queue
async function renderTransfers() {
    const list = document.getElementById('transfer-list');
    list.innerHTML = '';

    const res = await fetch(`${API_BASE}/transfers`);
    const requests = await res.json();

    if (requests.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-sm font-semibold text-center py-6">No transfer requests pending.</p>';
        return;
    }

    requests.forEach(tr => {
        const isManager = ['Admin', 'Asset Manager', 'Department Head'].includes(state.currentUser.role);
        const isPending = tr.status === 'Pending';
        list.innerHTML += `
            <div class="rounded-xl border border-slate-200 p-4 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between shadow-xs">
                <div>
                    <div class="text-sm font-bold text-slate-900">${tr.tag} — ${tr.assetName}</div>
                    <div class="text-xs text-slate-500 mt-0.5">Transfer requested from <strong>${tr.holderName}</strong> to <strong>${tr.targetName}</strong> (${tr.targetDepartmentName || 'General'})</div>
                    <div class="text-xs mt-1">Requested by: ${tr.requesterName} • Status: <span class="font-bold text-amber-600">${tr.status}</span></div>
                </div>
                ${isManager && isPending
                    ? `<div class="flex gap-2 mt-3 md:mt-0">
                           <button type="button" onclick="actionTransfer(${tr.id}, 'Approved')" class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors">Approve</button>
                           <button type="button" onclick="actionTransfer(${tr.id}, 'Rejected')" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors">Reject</button>
                       </div>`
                    : ''
                }
            </div>
        `;
    });
}

window.actionTransfer = async function(id, status) {
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/transfers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, actionedBy: state.currentUser.id })
        });
        if (!res.ok) throw new Error('Transfer action failed');
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
};

// Automatically populate department on assignee select in allocation form
document.getElementById('allocation-assignee').addEventListener('change', async (e) => {
    const usersRes = await fetch(`${API_BASE}/admin/employees`);
    const users = await usersRes.json();
    const user = users.find(u => u.id == e.target.value);
    document.getElementById('allocation-department').value = user ? (user.departmentName || 'General') : '';
});

// ==========================================
// 6. RESOURCE BOOKING VIEW
// ==========================================
function renderBookings() {
    const list = document.getElementById('booking-list');
    list.innerHTML = '';

    if (state.bookings.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-sm font-semibold text-center py-6">No scheduled bookings found.</p>';
        return;
    }

    state.bookings.forEach(bk => {
        const date = new Date(bk.booking_date).toLocaleDateString();
        const start = bk.start_time.substring(0, 5);
        const end = bk.end_time.substring(0, 5);
        const isOwner = bk.booked_by === state.currentUser.id;
        const isManager = ['Admin', 'Asset Manager'].includes(state.currentUser.role);
        const isUpcoming = bk.status === 'Upcoming';

        let statusColor = 'bg-slate-100 text-slate-700 border-slate-200';
        if (bk.status === 'Ongoing') statusColor = 'bg-blue-100 text-blue-700 border-blue-200';
        else if (bk.status === 'Completed') statusColor = 'bg-green-100 text-green-700 border-green-200';
        else if (bk.status === 'Cancelled') statusColor = 'bg-red-100 text-red-700 border-red-200';

        list.innerHTML += `
            <div class="rounded-xl border border-slate-200 p-4 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between shadow-xs">
                <div>
                    <div class="text-sm font-bold text-slate-900">${bk.resourceName}</div>
                    <div class="text-xs text-slate-500 mt-0.5">Date: ${date} • Hours: ${start} - ${end}</div>
                    <div class="text-xs mt-1">Booked by: ${bk.bookedByName} • State: <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor}">${bk.status}</span></div>
                </div>
                <div class="flex gap-2 mt-3 md:mt-0">
                    ${isUpcoming && (isOwner || isManager)
                        ? `<button type="button" onclick="updateBookingStatus(${bk.id}, 'Ongoing')" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors">Check In</button>
                           <button type="button" onclick="updateBookingStatus(${bk.id}, 'Cancelled')" class="px-2.5 py-1 bg-white border hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition-colors">Cancel</button>`
                        : ''
                    }
                    ${bk.status === 'Ongoing' && (isOwner || isManager)
                        ? `<button type="button" onclick="updateBookingStatus(${bk.id}, 'Completed')" class="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors">Release</button>`
                        : ''
                    }
                </div>
            </div>
        `;
    });
}

window.updateBookingStatus = async function(id, status) {
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/bookings/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, actionedBy: state.currentUser.id })
        });
        if (!res.ok) throw new Error('Status transition failed');
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
};

// ==========================================
// 7. MAINTENANCE VIEW
// ==========================================
function renderMaintenance() {
    const list = document.getElementById('maintenance-list');
    list.innerHTML = '';

    if (state.maintenanceRequests.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-sm font-semibold text-center py-6">No maintenance tickets raised.</p>';
        return;
    }

    state.maintenanceRequests.forEach(ticket => {
        const isManager = ['Admin', 'Asset Manager'].includes(state.currentUser.role);
        const date = new Date(ticket.created_at).toLocaleDateString();

        let priorityColor = 'bg-slate-100 text-slate-700';
        if (ticket.priority === 'High') priorityColor = 'bg-red-100 text-red-700';
        else if (ticket.priority === 'Medium') priorityColor = 'bg-yellow-100 text-yellow-700';

        list.innerHTML += `
            <div class="rounded-xl border border-slate-200 p-4 bg-slate-50 flex flex-col gap-3 shadow-xs">
                <div class="flex justify-between items-start gap-4">
                    <div>
                        <div class="text-sm font-bold text-slate-900">${ticket.tag} — ${ticket.assetName}</div>
                        <div class="text-xs text-slate-500">Requester: ${ticket.requesterName} • Date: ${date}</div>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${priorityColor}">${ticket.priority} Priority</span>
                </div>
                <div class="text-sm text-slate-600 bg-white border p-3 rounded-lg font-medium">${ticket.issue}</div>
                <div class="flex items-center justify-between text-xs border-t pt-3">
                    <div>Status: <span class="font-bold text-amber-600 uppercase">${ticket.status}</span> • Tech: ${ticket.technician}</div>
                    <div class="flex gap-2">
                        ${isManager && ticket.status === 'Pending'
                            ? `<button type="button" onclick="workflowMaintenance(${ticket.id}, 'Approved')" class="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition-colors">Approve</button>
                               <button type="button" onclick="workflowMaintenance(${ticket.id}, 'Rejected')" class="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition-colors">Reject</button>`
                            : ''
                        }
                        ${isManager && ticket.status === 'Approved'
                            ? `<button type="button" onclick="assignTechnician(${ticket.id})" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-colors">Assign Technician</button>`
                            : ''
                        }
                        ${isManager && ticket.status === 'Technician Assigned'
                            ? `<button type="button" onclick="workflowMaintenance(${ticket.id}, 'In Progress')" class="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-white rounded text-xs font-bold transition-colors">Start Repair</button>`
                            : ''
                        }
                        ${isManager && ticket.status === 'In Progress'
                            ? `<button type="button" onclick="resolveMaintenance(${ticket.id}, '${ticket.technician}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-colors">Resolve</button>`
                            : ''
                        }
                    </div>
                </div>
            </div>
        `;
    });
}

window.workflowMaintenance = async function(id, status, extra = {}) {
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/maintenance/${id}/workflow`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status,
                actionedBy: state.currentUser.id,
                ...extra
            })
        });
        if (!res.ok) throw new Error('Workflow transition failed');
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
};

window.assignTechnician = function(id) {
    const tech = prompt('Enter name of the technician to assign:');
    if (!tech) return;
    workflowMaintenance(id, 'Technician Assigned', { technician: tech });
};

window.resolveMaintenance = function(id, technician) {
    const cost = prompt('Enter repair cost ($):', '0.00');
    if (cost === null) return;
    workflowMaintenance(id, 'Resolved', { technician, cost: parseFloat(cost) || 0.00 });
};

// ==========================================
// 8. ASSET AUDIT CYCLE
// ==========================================
function renderAudit() {
    const list = document.getElementById('audit-cycle-list');
    const audSelect = document.getElementById('audit-auditors');
    list.innerHTML = '';

    audSelect.innerHTML = '';
    // Load users in auditor multiselect
    state.departments.forEach(dept => {
        // Mock load from active employees
    });

    // Auditor select dropdown load
    fetch(`${API_BASE}/admin/employees`)
        .then(res => res.json())
        .then(users => {
            audSelect.innerHTML = users.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('');
        });

    if (state.auditCycles.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-sm font-semibold text-center py-6">No audit cycles started.</p>';
        return;
    }

    state.auditCycles.forEach(cycle => {
        const start = new Date(cycle.start_date).toLocaleDateString();
        const end = new Date(cycle.end_date).toLocaleDateString();
        const auditors = cycle.auditors.map(a => a.name).join(', ');
        const isOpen = cycle.status === 'Open';

        list.innerHTML += `
            <div class="rounded-xl border border-slate-200 p-4 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between shadow-xs">
                <div>
                    <div class="text-sm font-bold text-slate-900">Scope: ${cycle.scope_type} — ${cycle.scope_value}</div>
                    <div class="text-xs text-slate-500 mt-0.5">Timeline: ${start} to ${end} • Auditors: ${auditors}</div>
                    <div class="text-xs mt-1">Status: <span class="font-bold uppercase ${isOpen ? 'text-green-600' : 'text-slate-400'}">${cycle.status}</span></div>
                </div>
                ${isOpen
                    ? `<button type="button" onclick="runAuditCycle(${cycle.id}, '${cycle.scope_type}', '${cycle.scope_value}', '${start}', '${end}')" class="mt-3 md:mt-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors"><i class="fa-solid fa-list-check mr-1"></i>Auditor View</button>`
                    : ''
                }
            </div>
        `;
    });
}

// Open evaluation modal
let activeAuditCycleId = null;
window.runAuditCycle = async function(cycleId, scopeType, scopeValue, start, end) {
    activeAuditCycleId = cycleId;
    document.getElementById('audit-exec-scope').innerText = `Scope: ${scopeType} — ${scopeValue}`;
    document.getElementById('audit-exec-dates').innerText = `Timeline: ${start} - ${end}`;
    
    await loadAuditChecklist(cycleId);
    document.getElementById('audit-execution-modal').classList.remove('hide');
};

async function loadAuditChecklist(cycleId) {
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/audits/${cycleId}/items`);
        const items = await res.json();

        const tbody = document.getElementById('audit-exec-table-body');
        tbody.innerHTML = '';

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-slate-400 text-center">No assets found matching this cycle\'s scope.</td></tr>';
            return;
        }

        items.forEach(item => {
            let statusColor = 'text-slate-700 bg-slate-100 border-slate-300';
            if (item.status === 'Verified') statusColor = 'text-green-700 bg-green-50 border-green-300';
            else if (item.status === 'Missing') statusColor = 'text-red-700 bg-red-50 border-red-300';
            else if (item.status === 'Damaged') statusColor = 'text-amber-700 bg-amber-50 border-amber-300';

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 border-b">
                    <td class="px-4 py-3 font-semibold font-mono text-[11px]">${item.tag}</td>
                    <td class="px-4 py-3 font-bold">${item.assetName}</td>
                    <td class="px-4 py-3 text-slate-500">${item.location}</td>
                    <td class="px-4 py-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor}">${item.status}</span>
                    </td>
                    <td class="px-4 py-3 text-slate-500 max-w-xs truncate">${item.notes || 'None'}</td>
                    <td class="px-4 py-3 text-center">
                        <select onchange="auditItemMark(${item.id}, this.value)" class="px-2 py-1 border text-xs rounded bg-white outline-none">
                            <option value="">Check...</option>
                            <option value="Verified">Verified</option>
                            <option value="Missing">Missing</option>
                            <option value="Damaged">Damaged</option>
                        </select>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    } finally {
        showLoading(false);
    }
}

window.auditItemMark = async function(itemId, status) {
    if (!status) return;
    const notes = prompt(`Verify Asset notes for marking [${status}]:`);
    
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/audits/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status,
                notes: notes || '',
                auditedBy: state.currentUser.id
            })
        });
        if (!res.ok) throw new Error('Mark audit item failed.');
        await loadAuditChecklist(activeAuditCycleId);
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
};

// Lock & Close audit cycle
document.getElementById('btn-close-audit-cycle').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to lock and close this audit cycle? This action updates all missing items state to LOST and locks cycle records.')) return;
    
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/audits/${activeAuditCycleId}/close`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actionedBy: state.currentUser.id })
        });
        if (!res.ok) throw new Error('Failed to close audit cycle.');
        document.getElementById('audit-execution-modal').classList.add('hide');
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
});

// ==========================================
// 9. REPORTS & ANALYTICS
// ==========================================
async function renderReports() {
    try {
        const res = await fetch(`${API_BASE}/reports/analytics`);
        const data = await res.json();
        const { utilization, maintenanceFreq, deptSummary, retirementDue } = data;

        // Populate dynamic cards
        const visibleAssets = state.assets.filter(asset => canViewAssetDetails(asset));
        const totalValue = visibleAssets.reduce((sum, asset) => sum + (Number(asset.cost) || 0), 0);
        const maintCount = state.maintenanceRequests.length;
        const totalSpend = visibleAssets.reduce((sum, asset) => {
            // Repair Spend sum
            return sum; // Handled below from categories or queries
        }, 0);

        const repairTotal = maintenanceFreq.reduce((sum, item) => sum + Number(item.totalSpend), 0);

        document.getElementById('reports-grid').innerHTML = `
            <div class="bg-slate-50 rounded-xl border p-4"><div class="text-xs text-slate-500 font-semibold uppercase">Total Asset Value</div><div class="text-2xl font-bold text-slate-900">$${totalValue.toLocaleString()}</div></div>
            <div class="bg-slate-50 rounded-xl border p-4"><div class="text-xs text-slate-500 font-semibold uppercase">Repair Tickets</div><div class="text-2xl font-bold text-slate-900">${maintCount}</div></div>
            <div class="bg-slate-50 rounded-xl border p-4"><div class="text-xs text-slate-500 font-semibold uppercase">Total Repair Spend</div><div class="text-2xl font-bold text-slate-900">$${repairTotal.toLocaleString()}</div></div>
            <div class="bg-slate-50 rounded-xl border p-4"><div class="text-xs text-slate-500 font-semibold uppercase">Alert Logs</div><div class="text-2xl font-bold text-slate-900">${state.notifications.length}</div></div>
        `;

        // Render Department asset summary table
        const tbody = document.getElementById('rep-dept-summary');
        tbody.innerHTML = deptSummary.map(row => `
            <tr>
                <td class="py-2.5 font-bold text-slate-900">${row.departmentName || 'General'}</td>
                <td class="py-2.5 text-right font-semibold">${row.assetCount}</td>
                <td class="py-2.5 text-right font-mono font-bold text-slate-800">$${(Number(row.totalValue) || 0).toLocaleString()}</td>
            </tr>
        `).join('');

        // Render Shared Resource Utilization (Heatmap / list)
        const utilContainer = document.getElementById('rep-utilization');
        utilContainer.innerHTML = '';
        utilization.forEach(row => {
            const pct = Math.min((row.bookingsCount / 10) * 100, 100);
            utilContainer.innerHTML += `
                <div>
                    <div class="flex justify-between text-xs mb-1 font-semibold">
                        <span class="text-slate-800">${row.name} (${row.tag})</span>
                        <span class="text-blue-600">${row.bookingsCount} bookings</span>
                    </div>
                    <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div class="bg-blue-600 h-full rounded-full" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        });

        // Render Maintenance Spend
        const maintContainer = document.getElementById('rep-maint-freq');
        maintContainer.innerHTML = '';
        maintenanceFreq.forEach(row => {
            maintContainer.innerHTML += `
                <div class="flex items-center justify-between text-xs py-1 border-b">
                    <span class="font-bold text-slate-700">${row.categoryName}</span>
                    <span class="text-slate-600">${row.requestCount} requests • <strong class="text-amber-700">$${(Number(row.totalSpend) || 0).toLocaleString()} spent</strong></span>
                </div>
            `;
        });

        // Render Retirement check
        const retirementContainer = document.getElementById('rep-retirement');
        retirementContainer.innerHTML = '';
        if (retirementDue.length === 0) {
            retirementContainer.innerHTML = '<p class="text-slate-400 text-xs py-4 text-center">No assets nearing retirement or requiring immediate repairs.</p>';
        } else {
            retirementDue.forEach(item => {
                retirementContainer.innerHTML += `
                    <div class="flex items-center justify-between border-b py-2 text-xs">
                        <div>
                            <div class="font-bold text-slate-800">${item.tag} — ${item.name}</div>
                            <div class="text-[10px] text-slate-500">Purchased: ${formatDateLabel(item.purchase_date)} • Condition: ${item.condition}</div>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">Alert</span>
                    </div>
                `;
            });
        }

    } catch (e) {
        console.error(e);
    }
}

// Dynamic CSV Export
document.getElementById('btn-export-csv').addEventListener('click', () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Asset Tag,Asset Name,Serial Number,Category,Condition,Status,Location,Cost,Purchase Date\n';

    state.assets.forEach(a => {
        const row = [
            a.tag,
            `"${a.name.replace(/"/g, '""')}"`,
            a.serial,
            a.categoryName || 'General',
            a.condition,
            a.status,
            a.location,
            a.cost,
            a.purchase_date || 'N/A'
        ].join(',');
        csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AssetFlow_Inventory_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// ==========================================
// 10. NOTIFICATIONS
// ==========================================
function renderNotifications() {
    const list = document.getElementById('notification-list');
    list.innerHTML = '';

    if (state.notifications.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-sm font-semibold text-center py-8">No notifications or alerts found.</p>';
        return;
    }

    state.notifications.forEach(item => {
        const date = new Date(item.created_at).toLocaleTimeString();
        list.innerHTML += `
            <div class="rounded-xl border border-slate-200 p-4 bg-slate-50 flex items-center justify-between shadow-xs ${item.is_read ? 'opacity-70' : 'border-l-4 border-l-blue-600'}">
                <div>
                    <div class="text-sm font-bold text-slate-900">${item.type}</div>
                    <div class="text-xs text-slate-500 mt-0.5">${item.message}</div>
                </div>
                <span class="text-[10px] text-slate-400 font-mono">${date}</span>
            </div>
        `;
    });
}

document.getElementById('btn-clear-notifications').addEventListener('click', async () => {
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/notifications/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: state.currentUser.id })
        });
        if (!res.ok) throw new Error('Clear notifications failed');
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
});

// ==========================================
// FORM ACTION HANDLERS
// ==========================================

// 1. LOGIN SUBMIT
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const rememberMe = document.getElementById('remember-me').checked;

    if (rememberMe) {
        localStorage.setItem('assetflow-remembered-login', JSON.stringify({ email, password }));
    } else {
        localStorage.removeItem('assetflow-remembered-login');
    }

    await loginUser(email, password);
});

// 2. SIGNUP SUBMIT
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();

    showLoading(true);
    document.getElementById('signup-error-container').classList.add('hide');
    try {
        const res = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Signup failed');

        setAuthMode('login');
        document.getElementById('login-email').value = email;
        document.getElementById('login-password').value = password;
        alert('Your signup request has been submitted. An Admin must approve it before you can log in.');
    } catch (err) {
        const errBox = document.getElementById('signup-error-container');
        const errText = document.getElementById('signup-error-text');
        errText.innerText = err.message;
        errBox.classList.remove('hide');
    } finally {
        showLoading(false);
    }
});

// 3. ROLE SWITCHER SIMULATION
document.getElementById('role-switcher').addEventListener('change', async (e) => {
    const val = e.target.value;
    if (val === 'sim-manager') {
        state.currentUser.role = 'Asset Manager';
    } else if (val === 'sim-head') {
        state.currentUser.role = 'Department Head';
    } else if (val === 'sim-employee') {
        state.currentUser.role = 'Employee';
    } else {
        // Restore actual admin user info
        await fetch(`${API_BASE}/admin/employees`)
            .then(res => res.json())
            .then(users => {
                const actualAdmin = users.find(u => u.id == val);
                if (actualAdmin) state.currentUser = actualAdmin;
            });
    }

    // Redirect to dashboard or relevant view
    const currentTabRoles = navItems.find(item => item.id === state.currentView)?.roles || [];
    if (!currentTabRoles.includes(state.currentUser.role)) {
        navigateTo('dashboard');
    } else {
        renderSidebar();
        renderHeader();
        renderCurrentView();
    }
});

// 4. REGISTER ASSET SUBMIT
document.getElementById('add-asset-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const newAsset = {
        name: document.getElementById('form-asset-name').value.trim(),
        serial: document.getElementById('form-asset-serial').value.trim(),
        category: document.getElementById('form-asset-category').value,
        condition: document.getElementById('form-asset-condition').value,
        location: document.getElementById('form-asset-location').value.trim(),
        shared: document.getElementById('form-asset-shared').checked,
        purchaseDate: document.getElementById('form-asset-purchase-date').value,
        warrantyExpiryDate: document.getElementById('form-asset-warranty').value,
        cost: parseFloat(document.getElementById('form-asset-cost').value) || 0.00,
        status: document.getElementById('form-asset-status').value,
        allocatedTo: document.getElementById('form-asset-owner').value || null
    };

    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/assets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newAsset)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Asset registration failed');

        document.getElementById('add-asset-modal').classList.add('hide');
        document.getElementById('add-asset-form').reset();
        await loadData();
    } catch (err) {
        alert(err.message);
    } finally {
        showLoading(false);
    }
});

// 5. SEARCH ASSETS EVENT
document.getElementById('asset-search').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderAssetsTable();
});
document.getElementById('filter-category').addEventListener('change', () => renderAssetsTable());
document.getElementById('filter-status').addEventListener('change', () => renderAssetsTable());

// 6. SUBMIT ALLOCATION
document.getElementById('allocation-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const assetId = document.getElementById('allocation-asset').value;
    const assigneeId = document.getElementById('allocation-assignee').value;
    const departmentName = document.getElementById('allocation-department').value;
    const expectedReturnDate = document.getElementById('allocation-return-date').value;

    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/allocations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetId, assigneeId, departmentName, expectedReturnDate })
        });
        const data = await res.json();

        if (res.status === 409) {
            // CONFLICT DETECTED - Trigger transfer workflow offer
            document.getElementById('conflict-asset-id').value = assetId;
            document.getElementById('conflict-assignee-id').value = assigneeId;
            document.getElementById('conflict-holder-id').value = data.holderId;
            document.getElementById('conflict-department').value = departmentName;
            document.getElementById('conflict-message').innerText = `${document.getElementById('allocation-asset').options[document.getElementById('allocation-asset').selectedIndex].text} is currently held by ${data.currentlyHeldBy}.`;
            
            document.getElementById('transfer-conflict-modal').classList.remove('hide');
        } else if (!res.ok) {
            throw new Error(data.error || 'Allocation creation failed.');
        } else {
            alert('Asset allocated successfully.');
            await loadData();
        }
    } catch (err) {
        alert(err.message);
    } finally {
        showLoading(false);
    }
});

// 7. SUBMIT BOOKING
document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resourceId = document.getElementById('booking-resource').value;
    const bookingDate = document.getElementById('booking-date').value;
    const start = document.getElementById('booking-start').value;
    const end = document.getElementById('booking-end').value;

    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resourceId,
                bookingDate,
                start,
                end,
                bookedBy: state.currentUser.id
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Booking slots allocation failed.');

        document.getElementById('booking-form').reset();
        await loadData();
    } catch (err) {
        alert(err.message);
    } finally {
        showLoading(false);
    }
});

// 8. SUBMIT MAINTENANCE
document.getElementById('maintenance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const assetId = document.getElementById('maintenance-asset').value;
    const issue = document.getElementById('maintenance-issue').value.trim();
    const priority = document.getElementById('maintenance-priority').value;

    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/maintenance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                assetId,
                issue,
                priority,
                requesterId: state.currentUser.id
            })
        });
        if (!res.ok) throw new Error('Could not submit maintenance request.');
        
        document.getElementById('maintenance-form').reset();
        await loadData();
    } catch (err) {
        alert(err.message);
    } finally {
        showLoading(false);
    }
});

// 9. SUBMIT AUDIT CYCLE
document.getElementById('audit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const scopeType = document.getElementById('audit-scope-type').value;
    const scopeValue = document.getElementById('audit-scope-value').value.trim();
    const startDate = document.getElementById('audit-start-date').value;
    const endDate = document.getElementById('audit-end-date').value;
    const auditors = Array.from(document.getElementById('audit-auditors').selectedOptions).map(opt => opt.value);

    showLoading(true);
    try {
        const res = await fetch(`${API_BASE}/audits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scopeType, scopeValue, startDate, endDate, auditors })
        });
        if (!res.ok) throw new Error('Create audit cycle failed');

        document.getElementById('audit-form').reset();
        await loadData();
    } catch (err) {
        alert(err.message);
    } finally {
        showLoading(false);
    }
});

// 10. SUBMIT DEPARTMENTS (Create / Edit)
document.getElementById('department-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('dep-edit-id').value;
    const name = document.getElementById('dep-name').value.trim();
    const headUserId = document.getElementById('dep-head').value;
    const parentId = document.getElementById('dep-parent').value;
    const status = document.getElementById('dep-status').value;

    showLoading(true);
    try {
        let res;
        if (editId) {
            res = await fetch(`${API_BASE}/admin/departments/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, headUserId, parentId, status })
            });
        } else {
            res = await fetch(`${API_BASE}/admin/departments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, headUserId, parentId, status })
            });
        }
        if (!res.ok) throw new Error('Save department failed.');

        document.getElementById('department-form').reset();
        document.getElementById('dep-edit-id').value = '';
        document.getElementById('dep-form-title').innerText = 'Create Department';
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
});
document.getElementById('btn-dep-reset').addEventListener('click', () => {
    document.getElementById('department-form').reset();
    document.getElementById('dep-edit-id').value = '';
    document.getElementById('dep-form-title').innerText = 'Create Department';
});

// 11. SUBMIT CATEGORIES (Create / Edit)
document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('cat-edit-id').value;
    const name = document.getElementById('cat-name').value.trim();
    const fields = document.getElementById('cat-fields').value.trim();

    showLoading(true);
    try {
        let res;
        if (editId) {
            res = await fetch(`${API_BASE}/admin/categories/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, fields })
            });
        } else {
            res = await fetch(`${API_BASE}/admin/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, fields })
            });
        }
        if (!res.ok) throw new Error('Save category failed.');

        document.getElementById('category-form').reset();
        document.getElementById('cat-edit-id').value = '';
        document.getElementById('cat-form-title').innerText = 'Create Category';
        await loadData();
    } catch (e) {
        alert(e.message);
    } finally {
        showLoading(false);
    }
});
document.getElementById('btn-cat-reset').addEventListener('click', () => {
    document.getElementById('category-form').reset();
    document.getElementById('cat-edit-id').value = '';
    document.getElementById('cat-form-title').innerText = 'Create Category';
});

// Tabs Switching inside Admin view
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        state.activeAdminTab = tab.dataset.adminTab;
        renderAdminContent();
    });
});

// Global Event Listeners
document.getElementById('btn-show-login').addEventListener('click', () => setAuthMode('login'));
document.getElementById('btn-show-signup').addEventListener('click', () => setAuthMode('signup'));
document.getElementById('btn-toggle-password').addEventListener('click', togglePasswordVisibility);
document.getElementById('btn-signout').addEventListener('click', signOut);
document.getElementById('btn-forgot-password').addEventListener('click', () => {
    setAuthMode('forgot');
    document.getElementById('forgot-email').value = document.getElementById('login-email').value;
});

document.getElementById('btn-back-to-login').addEventListener('click', () => setAuthMode('login'));
document.getElementById('btn-back-to-forgot').addEventListener('click', () => setAuthMode('forgot'));

// FORGOT PASSWORD SUBMIT
document.getElementById('forgot-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();

    showLoading(true);
    document.getElementById('forgot-error-container').classList.add('hide');
    try {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request code generation failed.');

        alert(`Reset code generated successfully!\nFor testing convenience, use code: ${data.code}`);
        setAuthMode('reset');
        document.getElementById('reset-email').value = email;
        document.getElementById('reset-code').value = data.code; // Pre-fill code for validation ease
        document.getElementById('reset-new-password').value = '';
    } catch (err) {
        const errBox = document.getElementById('forgot-error-container');
        const errText = document.getElementById('forgot-error-text');
        errText.innerText = err.message;
        errBox.classList.remove('hide');
    } finally {
        showLoading(false);
    }
});

// RESET PASSWORD SUBMIT
document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim();
    const code = document.getElementById('reset-code').value.trim();
    const newPassword = document.getElementById('reset-new-password').value.trim();

    showLoading(true);
    document.getElementById('reset-error-container').classList.add('hide');
    try {
        const res = await fetch(`${API_BASE}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Password reset failed.');

        alert('Your password has been reset successfully! You can now log in.');
        setAuthMode('login');
        document.getElementById('login-email').value = email;
        document.getElementById('login-password').value = newPassword;
    } catch (err) {
        const errBox = document.getElementById('reset-error-container');
        const errText = document.getElementById('reset-error-text');
        errText.innerText = err.message;
        errBox.classList.remove('hide');
    } finally {
        showLoading(false);
    }
});

// Page Initiation
window.addEventListener('DOMContentLoaded', async () => {
    setAuthMode('login');
    loadRememberedLogin();
    showAuthScreen();
    await attemptAutoLogin();
});
