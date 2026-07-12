const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files from this directory
app.use(express.static(__dirname));

// MySQL connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Project@1234',
    database: 'assetflow_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Helper: Hashing password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper: Logging activities
async function logActivity(userId, action, target, details) {
    try {
        await pool.query(
            'INSERT INTO activity_logs (user_id, action, target, details) VALUES (?, ?, ?, ?)',
            [userId, action, target, details]
        );
    } catch (err) {
        console.error('Activity log error:', err);
    }
}

// Helper: Creating notifications
async function addNotification(userId, type, message) {
    try {
        await pool.query(
            'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
            [userId, type, message]
        );
    } catch (err) {
        console.error('Notification error:', err);
    }
}

// ==========================================
// 1. AUTHENTICATION & SESSION ENDPOINTS
// ==========================================

// Login Route
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Please provide email and password.' });
    }

    try {
        const hashedPassword = hashPassword(password);
        const [users] = await pool.query(
            `SELECT u.*, d.name AS departmentName 
             FROM users u 
             LEFT JOIN departments d ON u.department_id = d.id 
             WHERE u.email = ? AND u.password = ?`,
            [email, hashedPassword]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = users[0];
        if (user.status !== 'Active') {
            return res.status(403).json({ error: 'Your account is pending admin approval or has been deactivated.' });
        }

        // Return user data (omit password)
        const { password: _, ...userData } = user;
        await logActivity(user.id, 'User Login', `User ${user.name}`, `Logged in successfully via email.`);
        res.json(userData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error occurred during login.' });
    }
});

// Signup Route (Creates a pending Employee account)
app.post('/api/auth/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    try {
        // Check if email already registered
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email address is already in use.' });
        }

        const hashedPassword = hashPassword(password);
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
            [name, email, hashedPassword, 'Employee', 'Pending Approval']
        );

        // Notify admins about new signup
        const [admins] = await pool.query("SELECT id FROM users WHERE role = 'Admin'");
        for (const admin of admins) {
            await addNotification(admin.id, 'New Signup Request', `${name} registered and is pending approval.`);
        }

        await logActivity(null, 'User Signup Request', `User ${name}`, `Created signup request for email: ${email}`);
        res.json({ success: true, message: 'Signup request submitted.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error occurred during registration.' });
    }
});

// Forgot Password Route (Generates and stores a reset code)
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Please provide email.' });
    }

    try {
        const [users] = await pool.query('SELECT id, name FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'No account found with this email address.' });
        }

        // Generate a 6-digit reset code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry

        await pool.query(
            'UPDATE users SET reset_code = ?, reset_expires_at = ? WHERE email = ?',
            [code, expiresAt, email]
        );

        await logActivity(users[0].id, 'Reset Code Generated', `User ${users[0].name}`, `Temporary reset code requested.`);

        // For this demo app, we return the reset code in the response so the frontend can mock/display it to the user.
        res.json({ success: true, message: 'Reset code generated.', code });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error during forgot password.' });
    }
});

// Reset Password Route (Validates reset code and sets new password)
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Email, code, and new password are required.' });
    }

    try {
        const [users] = await pool.query(
            'SELECT id, name, reset_code, reset_expires_at FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'No account found with this email address.' });
        }

        const user = users[0];
        if (!user.reset_code || user.reset_code !== code) {
            return res.status(400).json({ error: 'Invalid reset code.' });
        }

        if (new Date(user.reset_expires_at) < new Date()) {
            return res.status(400).json({ error: 'Reset code has expired.' });
        }

        const hashedPassword = hashPassword(newPassword);
        await pool.query(
            'UPDATE users SET password = ?, reset_code = NULL, reset_expires_at = NULL WHERE id = ?',
            [hashedPassword, user.id]
        );

        await logActivity(user.id, 'Password Reset', `User ${user.name}`, `Password reset successfully using code.`);
        res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error during password reset.' });
    }
});

// ==========================================
// 2. DASHBOARD snapshot
// ==========================================
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Assets Available
        const [[{ available }]] = await pool.query("SELECT COUNT(*) AS available FROM assets WHERE status = 'Available'");
        // 2. Assets Allocated
        const [[{ allocated }]] = await pool.query("SELECT COUNT(*) AS allocated FROM assets WHERE status = 'Allocated'");
        // 3. Maintenance Today (Under maintenance)
        const [[{ underMaint }]] = await pool.query("SELECT COUNT(*) AS underMaint FROM assets WHERE status = 'Under Maintenance'");
        // 4. Active Bookings (Upcoming/Ongoing status)
        const [[{ activeBookings }]] = await pool.query("SELECT COUNT(*) AS activeBookings FROM bookings WHERE status IN ('Upcoming', 'Ongoing')");
        // 5. Pending Transfers (Pending transfer requests)
        const [[{ pendingTransfers }]] = await pool.query("SELECT COUNT(*) AS pendingTransfers FROM transfer_requests WHERE status = 'Pending'");
        // 6. Upcoming Returns (Active allocations that are NOT overdue)
        const [[{ upcomingReturns }]] = await pool.query(
            "SELECT COUNT(*) AS upcomingReturns FROM allocations WHERE status = 'Active' AND expected_return_date >= ?",
            [today]
        );
        // 7. Overdue returns
        const [[{ overdueReturns }]] = await pool.query(
            "SELECT COUNT(*) AS overdueReturns FROM allocations WHERE status = 'Active' AND expected_return_date < ?",
            [today]
        );
        // 8. Total Assets cost sum
        const [[{ totalCost }]] = await pool.query("SELECT SUM(cost) AS totalCost FROM assets");

        // Overdue list
        const [overdueList] = await pool.query(
            `SELECT al.*, a.tag, a.name AS assetName, u.name AS assigneeName
             FROM allocations al
             JOIN assets a ON al.asset_id = a.id
             JOIN users u ON al.assignee_id = u.id
             WHERE al.status = 'Active' AND al.expected_return_date < ?`,
            [today]
        );

        res.json({
            stats: {
                available,
                allocated,
                underMaint,
                activeBookings,
                pendingTransfers,
                upcomingReturns,
                overdueReturns,
                totalCost: Number(totalCost) || 0
            },
            overdueList
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error reading dashboard stats.' });
    }
});

// ==========================================
// 3. ORGANIZATION SETUP (Admin)
// ==========================================

// Tab A - Department Management
app.get('/api/admin/departments', async (req, res) => {
    try {
        const [depts] = await pool.query(
            `SELECT d.*, u.name AS headName, p.name AS parentName
             FROM departments d
             LEFT JOIN users u ON d.head_user_id = u.id
             LEFT JOIN departments p ON d.parent_id = p.id`
        );
        res.json(depts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error reading departments.' });
    }
});

app.post('/api/admin/departments', async (req, res) => {
    const { name, headUserId, parentId, status } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Department name is required.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO departments (name, head_user_id, parent_id, status) VALUES (?, ?, ?, ?)',
            [name, headUserId || null, parentId || null, status || 'Active']
        );
        await logActivity(null, 'Create Department', `Dept ${name}`, `Created department with head ID: ${headUserId}`);
        res.json({ success: true, insertId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error creating department.' });
    }
});

app.put('/api/admin/departments/:id', async (req, res) => {
    const { id } = req.params;
    const { name, headUserId, parentId, status } = req.body;

    try {
        await pool.query(
            'UPDATE departments SET name = ?, head_user_id = ?, parent_id = ?, status = ? WHERE id = ?',
            [name, headUserId || null, parentId || null, status, id]
        );
        await logActivity(null, 'Update Department', `Dept ${name}`, `Updated department parameters for ID: ${id}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error updating department.' });
    }
});

// Tab B - Asset Category Management
app.get('/api/admin/categories', async (req, res) => {
    try {
        const [cats] = await pool.query('SELECT * FROM categories');
        res.json(cats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error reading categories.' });
    }
});

app.post('/api/admin/categories', async (req, res) => {
    const { name, fields } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Category name is required.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO categories (name, fields) VALUES (?, ?)',
            [name, fields || 'None']
        );
        await logActivity(null, 'Create Category', `Category ${name}`, `Created asset category: ${name}`);
        res.json({ success: true, insertId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error creating category.' });
    }
});

app.put('/api/admin/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, fields } = req.body;

    try {
        await pool.query(
            'UPDATE categories SET name = ?, fields = ? WHERE id = ?',
            [name, fields || 'None', id]
        );
        await logActivity(null, 'Update Category', `Category ${name}`, `Updated asset category: ${name}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error updating category.' });
    }
});

// Tab C - Employee Directory
app.get('/api/admin/employees', async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT u.*, d.name AS departmentName
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             ORDER BY u.id DESC`
        );
        // Omit passwords
        const sanitized = users.map(u => {
            const { password, ...rest } = u;
            return rest;
        });
        res.json(sanitized);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching employees.' });
    }
});

// Promoting role/Approve signup
app.put('/api/admin/employees/:id/role', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    try {
        await pool.query('UPDATE users SET role = ?, status = ? WHERE id = ?', [role, 'Active', id]);
        const [[user]] = await pool.query('SELECT name, email FROM users WHERE id = ?', [id]);
        await addNotification(id, 'Role Promoted', `You have been promoted to ${role}.`);
        await logActivity(null, 'Promote Employee', `Employee ${user.name}`, `Promoted role to: ${role}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error updating user role.' });
    }
});

// Approve signup request
app.put('/api/admin/employees/:id/approve', async (req, res) => {
    const { id } = req.params;
    const { departmentId } = req.body; // optional department assign

    try {
        await pool.query(
            'UPDATE users SET status = ?, role = ?, department_id = ? WHERE id = ?',
            ['Active', 'Employee', departmentId || null, id]
        );
        const [[user]] = await pool.query('SELECT name FROM users WHERE id = ?', [id]);
        await addNotification(id, 'Signup Approved', `Your signup request has been approved. Welcome to AssetFlow!`);
        await logActivity(null, 'Approve User', `Employee ${user.name}`, `Approved signup request and set status to Active.`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error approving user.' });
    }
});

// Toggle Status (Active / Inactive)
app.put('/api/admin/employees/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        const [[user]] = await pool.query('SELECT name FROM users WHERE id = ?', [id]);
        await logActivity(null, 'Toggle User Status', `Employee ${user.name}`, `Updated status to: ${status}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error updating employee status.' });
    }
});

// ==========================================
// 4. ASSET REGISTRATION & DIRECTORY
// ==========================================
app.get('/api/assets', async (req, res) => {
    try {
        const [assets] = await pool.query(
            `SELECT a.*, c.name AS categoryName, u.name AS allocatedToName, d.name AS departmentName
             FROM assets a
             LEFT JOIN categories c ON a.category_id = c.id
             LEFT JOIN users u ON a.allocated_to = u.id
             LEFT JOIN departments d ON a.department_id = d.id
             ORDER BY a.tag DESC`
        );
        res.json(assets);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching assets.' });
    }
});

app.post('/api/assets', async (req, res) => {
    const { name, serial, category, status, location, department, purchaseDate, warrantyExpiryDate, cost, allocatedTo, shared, condition } = req.body;
    if (!name || !serial) {
        return res.status(400).json({ error: 'Name and Serial Number are required.' });
    }

    try {
        // Check if serial already exists
        const [existing] = await pool.query('SELECT id FROM assets WHERE serial = ?', [serial]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Asset with this Serial Number already exists.' });
        }

        // Generate auto tag
        const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM assets');
        const tag = `AF-${String(count + 1).padStart(4, '0')}`;

        // Get category ID
        let categoryId = null;
        if (category) {
            const [cats] = await pool.query('SELECT id FROM categories WHERE name = ?', [category]);
            if (cats.length > 0) categoryId = cats[0].id;
        }

        // Get Department ID
        let departmentId = null;
        if (department) {
            const [depts] = await pool.query('SELECT id FROM departments WHERE name = ?', [department]);
            if (depts.length > 0) departmentId = depts[0].id;
        }

        const [result] = await pool.query(
            `INSERT INTO assets (tag, name, serial, category_id, status, location, department_id, purchase_date, warranty_expiry_date, cost, allocated_to, shared, \`condition\`) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tag, name, serial, categoryId, status || 'Available', location, departmentId,
                purchaseDate || null, warrantyExpiryDate || null, cost || 0.00, allocatedTo || null,
                shared || false, condition || 'Excellent'
            ]
        );

        // If allocated initially, create allocation entry
        if (allocatedTo && status === 'Allocated') {
            await pool.query(
                `INSERT INTO allocations (asset_id, assignee_id, department_id, status, condition_out) 
                 VALUES (?, ?, ?, ?, ?)`,
                [result.insertId, allocatedTo, departmentId, 'Active', condition || 'Excellent']
            );
        }

        await logActivity(null, 'Register Asset', `Asset ${tag}`, `Registered new asset ${name} (${serial})`);
        res.json({ success: true, insertId: result.insertId, tag });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error registering asset.' });
    }
});

// Detailed history per-asset
app.get('/api/assets/:id/history', async (req, res) => {
    const { id } = req.params;

    try {
        const [allocationHistory] = await pool.query(
            `SELECT al.*, u.name AS assigneeName, d.name AS departmentName, creator.name AS allocatedByName
             FROM allocations al
             JOIN users u ON al.assignee_id = u.id
             LEFT JOIN departments d ON al.department_id = d.id
             LEFT JOIN users creator ON al.allocated_by = creator.id
             WHERE al.asset_id = ?
             ORDER BY al.allocated_at DESC`,
            [id]
        );

        const [maintenanceHistory] = await pool.query(
            `SELECT mh.*, mr.technician
             FROM maintenance_history mh
             LEFT JOIN maintenance_requests mr ON mh.request_id = mr.id
             WHERE mh.asset_id = ?
             ORDER BY mh.date DESC`,
            [id]
        );

        res.json({
            allocations: allocationHistory,
            maintenance: maintenanceHistory
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error reading asset history.' });
    }
});

// ==========================================
// 5. ASSET ALLOCATION & TRANSFER WORKFLOW
// ==========================================

// Create new allocation with conflict detection and automated transfer offer
app.post('/api/allocations', async (req, res) => {
    const { assetId, assigneeId, departmentName, expectedReturnDate } = req.body;
    if (!assetId || !assigneeId) {
        return res.status(400).json({ error: 'Asset and Assignee are required.' });
    }

    try {
        const [[asset]] = await pool.query('SELECT * FROM assets WHERE id = ?', [assetId]);
        if (!asset) {
            return res.status(404).json({ error: 'Asset not found.' });
        }

        // Conflict check: if allocated, block and show holder name
        if (asset.status === 'Allocated' && asset.allocated_to) {
            const [[holder]] = await pool.query('SELECT name FROM users WHERE id = ?', [asset.allocated_to]);
            return res.status(409).json({
                error: `Conflict: ${asset.name} is currently taken.`,
                currentlyHeldBy: holder ? holder.name : 'Unknown Employee',
                holderId: asset.allocated_to
            });
        }

        if (asset.status === 'Reserved' || asset.status === 'Under Maintenance') {
            return res.status(400).json({ error: `Cannot allocate asset because it is currently ${asset.status.toLowerCase()}.` });
        }

        // Get Department ID
        let departmentId = null;
        if (departmentName) {
            const [depts] = await pool.query('SELECT id FROM departments WHERE name = ?', [departmentName]);
            if (depts.length > 0) departmentId = depts[0].id;
        }

        // Update asset status
        await pool.query(
            'UPDATE assets SET status = ?, allocated_to = ?, department_id = ? WHERE id = ?',
            ['Allocated', assigneeId, departmentId, assetId]
        );

        // Record allocation log
        await pool.query(
            `INSERT INTO allocations (asset_id, assignee_id, department_id, expected_return_date, status, condition_out) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [assetId, assigneeId, departmentId, expectedReturnDate || null, 'Active', asset.condition]
        );

        const [[assignee]] = await pool.query('SELECT name FROM users WHERE id = ?', [assigneeId]);
        await addNotification(assigneeId, 'Asset Assigned', `You have been allocated asset ${asset.name} (${asset.tag}).`);
        await logActivity(null, 'Allocate Asset', `Asset ${asset.tag}`, `Allocated to ${assignee.name}. Return due: ${expectedReturnDate || 'N/A'}`);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error during allocation.' });
    }
});

// Transfer Request Creation
app.post('/api/transfers', async (req, res) => {
    const { assetId, requestedBy, currentHolderId, targetAssigneeId, targetDepartmentName } = req.body;

    try {
        let departmentId = null;
        if (targetDepartmentName) {
            const [depts] = await pool.query('SELECT id FROM departments WHERE name = ?', [targetDepartmentName]);
            if (depts.length > 0) departmentId = depts[0].id;
        }

        const [result] = await pool.query(
            `INSERT INTO transfer_requests (asset_id, requested_by, current_holder_id, target_assignee_id, target_department_id, status) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [assetId, requestedBy, currentHolderId, targetAssigneeId, departmentId, 'Pending']
        );

        const [[asset]] = await pool.query('SELECT tag, name FROM assets WHERE id = ?', [assetId]);
        const [[requester]] = await pool.query('SELECT name FROM users WHERE id = ?', [requestedBy]);

        // Send notifications to current holder, Asset Managers, and Department Heads
        await addNotification(currentHolderId, 'Transfer Requested', `${requester.name} requested transfer of your asset ${asset.name}.`);
        const [managers] = await pool.query("SELECT id FROM users WHERE role IN ('Asset Manager', 'Admin')");
        for (const manager of managers) {
            await addNotification(manager.id, 'Asset Transfer Request', `Transfer requested for asset ${asset.tag} by ${requester.name}.`);
        }

        await logActivity(requestedBy, 'Request Transfer', `Asset ${asset.tag}`, `Requested asset transfer from holder ID: ${currentHolderId}`);
        res.json({ success: true, insertId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error creating transfer request.' });
    }
});

// List Transfer Requests
app.get('/api/transfers', async (req, res) => {
    try {
        const [requests] = await pool.query(
            `SELECT tr.*, a.tag, a.name AS assetName, 
                    req.name AS requesterName, 
                    holder.name AS holderName, 
                    target.name AS targetName,
                    d.name AS targetDepartmentName
             FROM transfer_requests tr
             JOIN assets a ON tr.asset_id = a.id
             JOIN users req ON tr.requested_by = req.id
             JOIN users holder ON tr.current_holder_id = holder.id
             JOIN users target ON tr.target_assignee_id = target.id
             LEFT JOIN departments d ON tr.target_department_id = d.id
             ORDER BY tr.id DESC`
        );
        res.json(requests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error reading transfers.' });
    }
});

// Action (Approve/Reject) Transfer Request
app.put('/api/transfers/:id', async (req, res) => {
    const { id } = req.params;
    const { status, actionedBy } = req.body; // status: 'Approved' or 'Rejected'

    try {
        const [[request]] = await pool.query('SELECT * FROM transfer_requests WHERE id = ?', [id]);
        if (!request) {
            return res.status(404).json({ error: 'Transfer request not found.' });
        }

        const today = new Date().toISOString().split('T')[0];

        if (status === 'Approved') {
            // Transaction safe: Update old allocation, insert new allocation, update asset
            await pool.query(
                `UPDATE allocations 
                 SET status = 'Returned', returned_at = CURRENT_TIMESTAMP, return_notes = 'Transferred to another employee'
                 WHERE asset_id = ? AND assignee_id = ? AND status = 'Active'`,
                [request.asset_id, request.current_holder_id]
            );

            await pool.query(
                `INSERT INTO allocations (asset_id, assignee_id, department_id, status, condition_out) 
                 VALUES (?, ?, ?, ?, ?)`,
                [request.asset_id, request.target_assignee_id, request.target_department_id, 'Active', 'Excellent']
            );

            await pool.query(
                `UPDATE assets 
                 SET allocated_to = ?, department_id = ? 
                 WHERE id = ?`,
                [request.target_assignee_id, request.target_department_id, request.asset_id]
            );

            await addNotification(request.target_assignee_id, 'Transfer Approved', `Your transfer request for asset ID ${request.asset_id} has been approved.`);
            await addNotification(request.current_holder_id, 'Asset Transferred', `Your asset has been transferred to another employee.`);
        } else {
            await addNotification(request.requested_by, 'Transfer Rejected', `Your transfer request has been rejected.`);
        }

        await pool.query(
            `UPDATE transfer_requests 
             SET status = ?, approved_by = ?, actioned_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [status, actionedBy, id]
        );

        const [[asset]] = await pool.query('SELECT tag FROM assets WHERE id = ?', [request.asset_id]);
        await logActivity(actionedBy, `${status} Transfer`, `Asset ${asset.tag}`, `Actioned transfer request ID: ${id} with status: ${status}`);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error processing transfer request.' });
    }
});

// Return Asset Flow
app.post('/api/allocations/return', async (req, res) => {
    const { assetId, checkInNotes, returnCondition, actionedBy } = req.body;
    if (!assetId) {
        return res.status(400).json({ error: 'Asset ID is required.' });
    }

    try {
        const [[asset]] = await pool.query('SELECT * FROM assets WHERE id = ?', [assetId]);
        if (!asset) {
            return res.status(404).json({ error: 'Asset not found.' });
        }

        // 1. Close active allocation
        await pool.query(
            `UPDATE allocations 
             SET status = 'Returned', returned_at = CURRENT_TIMESTAMP, condition_in = ?, return_notes = ? 
             WHERE asset_id = ? AND status = 'Active'`,
            [returnCondition, checkInNotes, assetId]
        );

        // 2. Set asset as Available and update its condition
        await pool.query(
            'UPDATE assets SET status = ?, allocated_to = ?, department_id = ?, `condition` = ? WHERE id = ?',
            ['Available', null, null, returnCondition, assetId]
        );

        // If returned as damaged, record or notify
        if (returnCondition === 'Needs Repair' || returnCondition === 'Damaged') {
            await addNotification(null, 'Asset Damaged', `${asset.name} (${asset.tag}) was returned in ${returnCondition} condition.`);
        }

        await logActivity(actionedBy, 'Return Asset', `Asset ${asset.tag}`, `Marked returned in ${returnCondition} condition. Notes: ${checkInNotes}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error returning asset.' });
    }
});

// List Allocations
app.get('/api/allocations', async (req, res) => {
    try {
        const [allocations] = await pool.query(
            `SELECT al.*, a.tag, a.name AS assetName, u.name AS assigneeName, d.name AS departmentName
             FROM allocations al
             JOIN assets a ON al.asset_id = a.id
             JOIN users u ON al.assignee_id = u.id
             LEFT JOIN departments d ON al.department_id = d.id
             ORDER BY al.id DESC`
        );
        res.json(allocations);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching allocations.' });
    }
});

// ==========================================
// 6. RESOURCE BOOKING SCREEN
// ==========================================

// Get resource bookings
app.get('/api/bookings', async (req, res) => {
    try {
        const [bookings] = await pool.query(
            `SELECT bk.*, a.name AS resourceName, u.name AS bookedByName
             FROM bookings bk
             JOIN assets a ON bk.resource_id = a.id
             JOIN users u ON bk.booked_by = u.id
             ORDER BY bk.booking_date DESC, bk.start_time ASC`
        );
        res.json(bookings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching bookings.' });
    }
});

// Book slot with overlap checking
app.post('/api/bookings', async (req, res) => {
    const { resourceId, bookingDate, start, end, bookedBy } = req.body;
    if (!resourceId || !bookingDate || !start || !end) {
        return res.status(400).json({ error: 'Resource, Date, Start time, and End time are required.' });
    }

    try {
        const [[resource]] = await pool.query('SELECT * FROM assets WHERE id = ?', [resourceId]);
        if (!resource || !resource.shared) {
            return res.status(400).json({ error: 'The selected asset is not registered as a shared bookable resource.' });
        }

        // Overlap query: Check if there's any active booking for this resource on the same date where time ranges intersect
        // startA < endB AND endA > startB
        const [overlaps] = await pool.query(
            `SELECT * FROM bookings 
             WHERE resource_id = ? AND booking_date = ? AND status != 'Cancelled'
             AND start_time < ? AND end_time > ?`,
            [resourceId, bookingDate, end, start]
        );

        if (overlaps.length > 0) {
            return res.status(409).json({ error: 'Booking overlap detected. Please choose a non-conflicting time slot.' });
        }

        const [result] = await pool.query(
            `INSERT INTO bookings (resource_id, booked_by, booking_date, start_time, end_time, status) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [resourceId, bookedBy, bookingDate, start, end, 'Upcoming']
        );

        await addNotification(bookedBy, 'Booking Confirmed', `Booking confirmed for ${resource.name} on ${bookingDate} at ${start}-${end}`);
        await logActivity(bookedBy, 'Book Resource', `Resource ${resource.name}`, `Booked for ${bookingDate} at ${start}-${end}`);

        res.json({ success: true, insertId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error creating booking.' });
    }
});

// Update Booking Status (e.g. check in for Ongoing, complete, cancel)
app.put('/api/bookings/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, actionedBy } = req.body; // 'Ongoing', 'Completed', 'Cancelled'

    try {
        await pool.query('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
        const [[booking]] = await pool.query(
            `SELECT bk.*, a.name AS resourceName 
             FROM bookings bk 
             JOIN assets a ON bk.resource_id = a.id 
             WHERE bk.id = ?`,
            [id]
        );

        await addNotification(booking.booked_by, `Booking ${status}`, `Booking for ${booking.resourceName} is now ${status}.`);
        await logActivity(actionedBy, `Update Booking Status`, `Booking ID ${id}`, `Set status to ${status}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error updating booking status.' });
    }
});

// ==========================================
// 7. MAINTENANCE MANAGEMENT SCREEN
// ==========================================

// Get Maintenance Requests
app.get('/api/maintenance', async (req, res) => {
    try {
        const [requests] = await pool.query(
            `SELECT mr.*, a.tag, a.name AS assetName, u.name AS requesterName
             FROM maintenance_requests mr
             JOIN assets a ON mr.asset_id = a.id
             JOIN users u ON mr.requester_id = u.id
             ORDER BY mr.id DESC`
        );
        res.json(requests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching maintenance requests.' });
    }
});

// Raise Request
app.post('/api/maintenance', async (req, res) => {
    const { assetId, issue, priority, requesterId } = req.body;
    if (!assetId || !issue) {
        return res.status(400).json({ error: 'Asset and issue description are required.' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO maintenance_requests (asset_id, requester_id, issue, priority, status) 
             VALUES (?, ?, ?, ?, ?)`,
            [assetId, requesterId, issue, priority || 'Medium', 'Pending']
        );

        const [[asset]] = await pool.query('SELECT tag FROM assets WHERE id = ?', [assetId]);
        const [managers] = await pool.query("SELECT id FROM users WHERE role IN ('Asset Manager', 'Admin')");
        for (const manager of managers) {
            await addNotification(manager.id, 'New Repair Request', `Maintenance request raised for asset ${asset.tag}.`);
        }

        await logActivity(requesterId, 'Request Maintenance', `Asset ${asset.tag}`, `Raised request: ${issue}`);
        res.json({ success: true, insertId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error raising maintenance request.' });
    }
});

// Update Maintenance request status (Approve, Assign Tech, Resolve)
app.put('/api/maintenance/:id/workflow', async (req, res) => {
    const { id } = req.params;
    const { status, technician, cost, actionedBy } = req.body;
    // status transitions: 'Approved', 'Rejected', 'Technician Assigned', 'In Progress', 'Resolved'

    try {
        const [[request]] = await pool.query('SELECT * FROM maintenance_requests WHERE id = ?', [id]);
        if (!request) {
            return res.status(404).json({ error: 'Maintenance request not found.' });
        }

        const [[asset]] = await pool.query('SELECT tag, name FROM assets WHERE id = ?', [request.asset_id]);

        if (status === 'Approved') {
            // Auto update asset status to Under Maintenance
            await pool.query('UPDATE assets SET status = ? WHERE id = ?', ['Under Maintenance', request.asset_id]);
            await addNotification(request.requester_id, 'Maintenance Approved', `Your repair request for ${asset.name} was approved.`);
        } else if (status === 'Rejected') {
            await addNotification(request.requester_id, 'Maintenance Rejected', `Your repair request for ${asset.name} was rejected.`);
        } else if (status === 'Resolved') {
            // Set asset status back to Available
            await pool.query('UPDATE assets SET status = ?, `condition` = ? WHERE id = ?', ['Available', 'Excellent', request.asset_id]);

            // Add entry to maintenance history
            await pool.query(
                `INSERT INTO maintenance_history (asset_id, request_id, date, issue, cost, resolved_by_tech) 
                 VALUES (?, ?, CURRENT_DATE, ?, ?, ?)`,
                [request.asset_id, id, request.issue, cost || 0.00, technician || request.technician]
            );

            await addNotification(request.requester_id, 'Maintenance Resolved', `Repair resolved for ${asset.name}. Status reverted to Available.`);
        }

        await pool.query(
            `UPDATE maintenance_requests 
             SET status = ?, technician = ?, cost = ?, actioned_by = ?, resolved_at = ? 
             WHERE id = ?`,
            [
                status,
                technician || request.technician,
                cost || request.cost,
                actionedBy,
                status === 'Resolved' ? new Date() : null,
                id
            ]
        );

        await logActivity(actionedBy, `Maintenance ${status}`, `Asset ${asset.tag}`, `Request ID: ${id} updated to status: ${status}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error processing maintenance workflow.' });
    }
});

// ==========================================
// 8. ASSET AUDIT SCREEN
// ==========================================

// Get Audit Cycles
app.get('/api/audits', async (req, res) => {
    try {
        const [cycles] = await pool.query('SELECT * FROM audit_cycles ORDER BY id DESC');

        // Append auditors to each cycle
        for (const cycle of cycles) {
            const [auditors] = await pool.query(
                `SELECT u.id, u.name 
                 FROM audit_auditors aa
                 JOIN users u ON aa.auditor_id = u.id
                 WHERE aa.cycle_id = ?`,
                [cycle.id]
            );
            cycle.auditors = auditors;
        }

        res.json(cycles);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error loading audit cycles.' });
    }
});

// Create Cycle
app.post('/api/audits', async (req, res) => {
    const { scopeType, scopeValue, startDate, endDate, auditors } = req.body;
    if (!scopeType || !scopeValue || !startDate || !endDate || !auditors || auditors.length === 0) {
        return res.status(400).json({ error: 'Scope, dates, and at least one auditor are required.' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO audit_cycles (scope_type, scope_value, start_date, end_date, status) 
             VALUES (?, ?, ?, ?, ?)`,
            [scopeType, scopeValue, startDate, endDate, 'Open']
        );

        const cycleId = result.insertId;

        // Insert junction rows
        for (const auditorId of auditors) {
            await pool.query(
                'INSERT INTO audit_auditors (cycle_id, auditor_id) VALUES (?, ?)',
                [cycleId, auditorId]
            );
            await addNotification(auditorId, 'Audit Cycle Assigned', `You are assigned to the audit cycle scope: ${scopeValue}`);
        }

        // Insert audit item checks for all assets matching scope (department name or location name)
        let query = '';
        let params = [];

        if (scopeType === 'Department') {
            query = `SELECT a.id FROM assets a JOIN departments d ON a.department_id = d.id WHERE d.name = ?`;
            params = [scopeValue];
        } else {
            query = `SELECT id FROM assets WHERE location = ?`;
            params = [scopeValue];
        }

        const [matchingAssets] = await pool.query(query, params);
        for (const asset of matchingAssets) {
            await pool.query(
                'INSERT INTO audit_items (cycle_id, asset_id, status) VALUES (?, ?, ?)',
                [cycleId, asset.id, 'Pending']
            );
        }

        await logActivity(null, 'Create Audit Cycle', `Scope: ${scopeValue}`, `Created cycle ID ${cycleId} with ${matchingAssets.length} assets.`);
        res.json({ success: true, cycleId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error creating audit cycle.' });
    }
});

// Fetch checklist items for an audit cycle
app.get('/api/audits/:id/items', async (req, res) => {
    const { id } = req.params;

    try {
        const [items] = await pool.query(
            `SELECT ai.*, a.tag, a.name AS assetName, a.serial, a.location, a.condition, d.name AS departmentName
             FROM audit_items ai
             JOIN assets a ON ai.asset_id = a.id
             LEFT JOIN departments d ON a.department_id = d.id
             WHERE ai.cycle_id = ?`,
            [id]
        );
        res.json(items);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching checklist items.' });
    }
});

// Mark audit item (Verified / Missing / Damaged)
app.put('/api/audits/items/:itemId', async (req, res) => {
    const { itemId } = req.params;
    const { status, notes, auditedBy } = req.body;

    try {
        await pool.query(
            `UPDATE audit_items 
             SET status = ?, notes = ?, audited_by = ?, audited_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [status, notes, auditedBy, itemId]
        );

        // Fetch asset info for logging
        const [[item]] = await pool.query(
            `SELECT ai.*, a.tag, a.name FROM audit_items ai JOIN assets a ON ai.asset_id = a.id WHERE ai.id = ?`,
            [itemId]
        );

        // Notify if missing or damaged (discrepancy)
        if (status === 'Missing' || status === 'Damaged') {
            await addNotification(null, 'Audit Discrepancy', `Asset ${item.name} (${item.tag}) marked as ${status} in audit.`);
        }

        await logActivity(auditedBy, 'Audit Asset', `Asset ${item.tag}`, `Marked as ${status}. Notes: ${notes}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error auditing item.' });
    }
});

// Close Audit Cycle: locks cycle and updates assets (e.g. Lost for missing items)
app.put('/api/audits/:id/close', async (req, res) => {
    const { id } = req.params;
    const { actionedBy } = req.body;

    try {
        // Lock cycle
        await pool.query("UPDATE audit_cycles SET status = 'Closed' WHERE id = ?", [id]);

        // Find missing assets in this cycle and update database status to 'Lost'
        const [missingItems] = await pool.query(
            "SELECT asset_id FROM audit_items WHERE cycle_id = ? AND status = 'Missing'",
            [id]
        );

        for (const item of missingItems) {
            await pool.query("UPDATE assets SET status = 'Lost', `condition` = 'Lost' WHERE id = ?", [item.asset_id]);
            const [[asset]] = await pool.query('SELECT tag FROM assets WHERE id = ?', [item.asset_id]);
            await logActivity(actionedBy, 'Asset Flagged Lost', `Asset ${asset.tag}`, `Auto-flagged Lost due to missing audit cycle ID: ${id}`);
        }

        await logActivity(actionedBy, 'Close Audit Cycle', `Cycle ID ${id}`, `Audit cycle locked and discrepancies resolved.`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error closing audit cycle.' });
    }
});

// ==========================================
// 9. REPORTS & ANALYTICS
// ==========================================
app.get('/api/reports/analytics', async (req, res) => {
    try {
        // Most-used resources vs Idle
        // Calculated by booking count
        const [utilization] = await pool.query(
            `SELECT a.tag, a.name, COUNT(b.id) AS bookingsCount
             FROM assets a
             LEFT JOIN bookings b ON a.id = b.resource_id AND b.status != 'Cancelled'
             WHERE a.shared = TRUE
             GROUP BY a.id
             ORDER BY bookingsCount DESC`
        );

        // Maintenance frequency by category
        const [maintenanceFreq] = await pool.query(
            `SELECT c.name AS categoryName, COUNT(mr.id) AS requestCount, SUM(mr.cost) AS totalSpend
             FROM categories c
             LEFT JOIN assets a ON a.category_id = c.id
             LEFT JOIN maintenance_requests mr ON a.id = mr.asset_id
             GROUP BY c.id`
        );

        // Department allocations summary
        const [deptSummary] = await pool.query(
            `SELECT d.name AS departmentName, COUNT(a.id) AS assetCount, SUM(a.cost) AS totalValue
             FROM departments d
             LEFT JOIN assets a ON a.department_id = d.id AND a.status = 'Allocated'
             GROUP BY d.id`
        );

        // Assets due for maintenance or nearing retirement (older than 4 years from purchase date)
        const [retirementDue] = await pool.query(
            `SELECT tag, name, purchase_date, cost, ` + "`condition`" + `
             FROM assets 
             WHERE status != 'Disposed' AND (
                purchase_date < DATE_SUB(CURRENT_DATE, INTERVAL 4 YEAR)
                OR ` + "`condition`" + ` IN ('Needs Repair', 'Damaged')
             )`
        );

        res.json({
            utilization,
            maintenanceFreq,
            deptSummary,
            retirementDue
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error generating reports.' });
    }
});

// ==========================================
// 10. NOTIFICATIONS & ACTIVITY LOGS
// ==========================================

// Get Notifications for User
app.get('/api/notifications', async (req, res) => {
    const { userId } = req.query;

    try {
        let query = 'SELECT * FROM notifications WHERE user_id IS NULL OR user_id = ? ORDER BY id DESC LIMIT 50';
        let params = [userId];

        const [notifications] = await pool.query(query, params);
        res.json(notifications);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error fetching notifications.' });
    }
});

// Mark all as read
app.post('/api/notifications/read', async (req, res) => {
    const { userId } = req.body;

    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id IS NULL OR user_id = ?', [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error updating notifications.' });
    }
});

// Get Audit Activity Logs
app.get('/api/logs', async (req, res) => {
    try {
        const [logs] = await pool.query(
            `SELECT al.*, u.name AS userName, u.role AS userRole
             FROM activity_logs al
             LEFT JOIN users u ON al.user_id = u.id
             ORDER BY al.id DESC LIMIT 100`
        );
        res.json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error reading activity logs.' });
    }
});

// Catch-all route to serve the SPA frontend html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'assetflow_frontend_app.html'));
});

// Start Express server
app.listen(port, () => {
    console.log(`AssetFlow Express server listening at http://localhost:${port}`);
});
