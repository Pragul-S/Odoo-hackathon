const mysql = require('mysql2/promise');
const crypto = require('crypto');

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

const config = {
    host: 'localhost',
    user: 'root',
    password: 'Project@1234',
    database: 'assetflow_db'
};

async function seed() {
    console.log('Connecting to MySQL for seeding...');
    const connection = await mysql.createConnection(config);

    try {
        console.log('Clearing existing data...');
        // Disable foreign keys temporarily to clear tables easily
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.query('TRUNCATE TABLE activity_logs');
        await connection.query('TRUNCATE TABLE notifications');
        await connection.query('TRUNCATE TABLE audit_items');
        await connection.query('TRUNCATE TABLE audit_auditors');
        await connection.query('TRUNCATE TABLE audit_cycles');
        await connection.query('TRUNCATE TABLE maintenance_history');
        await connection.query('TRUNCATE TABLE maintenance_requests');
        await connection.query('TRUNCATE TABLE bookings');
        await connection.query('TRUNCATE TABLE transfer_requests');
        await connection.query('TRUNCATE TABLE allocations');
        await connection.query('TRUNCATE TABLE assets');
        await connection.query('TRUNCATE TABLE categories');
        await connection.query('TRUNCATE TABLE users');
        await connection.query('TRUNCATE TABLE departments');
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Seeding departments...');
        // Insert departments (we'll update head_user_id later once users are inserted)
        const [deptIT] = await connection.query('INSERT INTO departments (name, status) VALUES (?, ?)', ['IT', 'Active']);
        const [deptOps] = await connection.query('INSERT INTO departments (name, status) VALUES (?, ?)', ['Operations', 'Active']);
        const [deptFinance] = await connection.query('INSERT INTO departments (name, status) VALUES (?, ?)', ['Finance', 'Active']);
        const [deptMarketing] = await connection.query('INSERT INTO departments (name, status) VALUES (?, ?)', ['Marketing', 'Active']);
        const [deptAdmin] = await connection.query('INSERT INTO departments (name, status) VALUES (?, ?)', ['Admin', 'Active']);

        const itDeptId = deptIT.insertId;
        const opsDeptId = deptOps.insertId;
        const finDeptId = deptFinance.insertId;
        const mktDeptId = deptMarketing.insertId;
        const admDeptId = deptAdmin.insertId;

        console.log('Seeding users...');
        const userPassword = hashPassword('demo123');

        // Admin (Sarah)
        const [user1] = await connection.query(
            'INSERT INTO users (name, email, password, role, department_id, status) VALUES (?, ?, ?, ?, ?, ?)',
            ['Sarah Jenkins', 'sarah@assetflow.com', userPassword, 'Admin', itDeptId, 'Active']
        );
        // Asset Manager (David)
        const [user2] = await connection.query(
            'INSERT INTO users (name, email, password, role, department_id, status) VALUES (?, ?, ?, ?, ?, ?)',
            ['David Chen', 'david@assetflow.com', userPassword, 'Asset Manager', opsDeptId, 'Active']
        );
        // Department Head (Maya)
        const [user3] = await connection.query(
            'INSERT INTO users (name, email, password, role, department_id, status) VALUES (?, ?, ?, ?, ?, ?)',
            ['Maya Patel', 'maya@assetflow.com', userPassword, 'Department Head', finDeptId, 'Active']
        );
        // Employee (Priya)
        const [user4] = await connection.query(
            'INSERT INTO users (name, email, password, role, department_id, status) VALUES (?, ?, ?, ?, ?, ?)',
            ['Priya Sharma', 'priya@assetflow.com', userPassword, 'Employee', mktDeptId, 'Active']
        );

        const u1 = user1.insertId;
        const u2 = user2.insertId;
        const u3 = user3.insertId;
        const u4 = user4.insertId;

        // Update departments with their respective heads
        await connection.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [u1, itDeptId]);
        await connection.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [u2, opsDeptId]);
        await connection.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [u3, finDeptId]);
        await connection.query('UPDATE departments SET head_user_id = ? WHERE id = ?', [u4, mktDeptId]);

        console.log('Seeding categories...');
        const [cat1] = await connection.query('INSERT INTO categories (name, fields) VALUES (?, ?)', ['Electronics', 'Warranty period']);
        const [cat2] = await connection.query('INSERT INTO categories (name, fields) VALUES (?, ?)', ['Furniture', 'Assigned room']);
        const [cat3] = await connection.query('INSERT INTO categories (name, fields) VALUES (?, ?)', ['Vehicles', 'Fuel policy']);
        const [cat4] = await connection.query('INSERT INTO categories (name, fields) VALUES (?, ?)', ['Shared Resource', 'Booking window']);

        const c1 = cat1.insertId;
        const c2 = cat2.insertId;
        const c3 = cat3.insertId;
        const c4 = cat4.insertId;

        console.log('Seeding assets...');
        const [ast1] = await connection.query(
            'INSERT INTO assets (tag, name, serial, category_id, status, allocated_to, location, department_id, shared, `condition`, purchase_date, warranty_expiry_date, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['AF-0001', 'MacBook Pro M2', 'SN-1001', c1, 'Allocated', u4, 'HQ-Floor 3', itDeptId, false, 'Excellent', '2024-02-15', '2027-02-15', 2399.00]
        );
        const [ast2] = await connection.query(
            'INSERT INTO assets (tag, name, serial, category_id, status, allocated_to, location, department_id, shared, `condition`, purchase_date, warranty_expiry_date, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['AF-0002', 'Dell UltraSharp 27"', 'SN-1002', c1, 'Available', null, 'IT Storage', itDeptId, false, 'Good', '2023-11-09', '2026-11-09', 899.00]
        );
        const [ast3] = await connection.query(
            'INSERT INTO assets (tag, name, serial, category_id, status, allocated_to, location, department_id, shared, `condition`, purchase_date, warranty_expiry_date, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['AF-0003', 'Ford Transit Van', 'SN-2001', c3, 'Under Maintenance', null, 'Garage', opsDeptId, true, 'Needs Repair', '2021-07-01', '2026-07-01', 38400.00]
        );
        const [ast4] = await connection.query(
            'INSERT INTO assets (tag, name, serial, category_id, status, allocated_to, location, department_id, shared, `condition`, purchase_date, warranty_expiry_date, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['AF-0004', 'Conference Room B2', 'RS-9001', c4, 'Reserved', null, 'HQ-Block B', admDeptId, true, 'Ready', '2022-03-23', '2028-03-23', 3200.00]
        );
        const [ast5] = await connection.query(
            'INSERT INTO assets (tag, name, serial, category_id, status, allocated_to, location, department_id, shared, `condition`, purchase_date, warranty_expiry_date, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['AF-0005', 'Ergonomic Chair', 'SN-3030', c2, 'Allocated', u3, 'Finance Office', finDeptId, false, 'Average', '2020-09-12', '2025-09-12', 360.00]
        );

        const a1 = ast1.insertId;
        const a2 = ast2.insertId;
        const a3 = ast3.insertId;
        const a4 = ast4.insertId;
        const a5 = ast5.insertId;

        // Seed repair history for assets
        await connection.query(
            'INSERT INTO maintenance_history (asset_id, date, issue, cost) VALUES (?, ?, ?, ?)',
            [a1, '2025-05-12', 'Keyboard backlight issue', 120.00]
        );
        await connection.query(
            'INSERT INTO maintenance_history (asset_id, date, issue, cost) VALUES (?, ?, ?, ?)',
            [a1, '2025-08-20', 'Battery health diagnostic', 0.00]
        );
        await connection.query(
            'INSERT INTO maintenance_history (asset_id, date, issue, cost) VALUES (?, ?, ?, ?)',
            [a3, '2026-06-18', 'Cabin AC compressor failure', 860.00]
        );
        await connection.query(
            'INSERT INTO maintenance_history (asset_id, date, issue, cost) VALUES (?, ?, ?, ?)',
            [a5, '2024-02-14', 'Seat adjustment arm replaced', 45.00]
        );

        console.log('Seeding allocations...');
        await connection.query(
            'INSERT INTO allocations (asset_id, assignee_id, department_id, allocated_by, expected_return_date, status, condition_out) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [a1, u4, mktDeptId, u2, '2026-07-20', 'Active', 'Excellent']
        );
        // Also seed an overdue allocation for Chair AF-0005 (expected return yesterday relative to current 2026-07-12)
        await connection.query(
            'INSERT INTO allocations (asset_id, assignee_id, department_id, allocated_by, expected_return_date, status, condition_out) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [a5, u3, finDeptId, u2, '2026-07-11', 'Active', 'Average']
        );

        console.log('Seeding bookings...');
        await connection.query(
            'INSERT INTO bookings (resource_id, booked_by, booking_date, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?)',
            [a4, u1, '2026-07-12', '09:00:00', '10:00:00', 'Upcoming']
        );
        await connection.query(
            'INSERT INTO bookings (resource_id, booked_by, booking_date, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?)',
            [a4, u3, '2026-07-12', '11:00:00', '12:00:00', 'Upcoming']
        );

        console.log('Seeding maintenance requests...');
        await connection.query(
            'INSERT INTO maintenance_requests (asset_id, requester_id, issue, priority, status, technician) VALUES (?, ?, ?, ?, ?, ?)',
            [a3, u4, 'Vehicle cabin AC not cooling', 'High', 'Pending', 'Unassigned']
        );

        console.log('Seeding audit cycles...');
        const [audit1] = await connection.query(
            'INSERT INTO audit_cycles (scope_type, scope_value, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)',
            ['Department', 'Finance', '2026-07-12', '2026-07-18', 'Open']
        );
        const auditCycleId = audit1.insertId;

        // Assign auditors
        await connection.query('INSERT INTO audit_auditors (cycle_id, auditor_id) VALUES (?, ?)', [auditCycleId, u2]);
        await connection.query('INSERT INTO audit_auditors (cycle_id, auditor_id) VALUES (?, ?)', [auditCycleId, u3]);

        // Seed audit items for assets in Finance department (AF-0005 is Finance)
        await connection.query(
            'INSERT INTO audit_items (cycle_id, asset_id, status) VALUES (?, ?, ?)',
            [auditCycleId, a5, 'Pending']
        );

        console.log('Seeding notifications...');
        await connection.query(
            'INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, ?, ?, ?)',
            [u3, 'Overdue Return', 'AF-0005 (Ergonomic Chair) is overdue by 1 day.', false]
        );
        await connection.query(
            'INSERT INTO notifications (user_id, type, message, is_read) VALUES (?, ?, ?, ?)',
            [u2, 'Maintenance Approved', 'Maintenance request for AF-0003 has been approved.', false]
        );

        console.log('Seeding activity logs...');
        await connection.query(
            'INSERT INTO activity_logs (user_id, action, target, details) VALUES (?, ?, ?, ?)',
            [u2, 'Asset Allocated', 'Asset AF-0001', 'Allocated MacBook Pro to Priya Sharma in Marketing. Expected return: 2026-07-20']
        );
        await connection.query(
            'INSERT INTO activity_logs (user_id, action, target, details) VALUES (?, ?, ?, ?)',
            [u4, 'Maintenance Requested', 'Asset AF-0003', 'Priya Sharma raised a high priority maintenance request for Ford Transit Van. Details: Vehicle cabin AC not cooling']
        );

        console.log('Database seeded successfully!');
    } catch (err) {
        console.error('Error seeding database:', err);
    } finally {
        await connection.end();
    }
}

seed();
