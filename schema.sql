CREATE DATABASE IF NOT EXISTS assetflow_db;
USE assetflow_db;

-- 1. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    head_user_id INT DEFAULT NULL,
    parent_id INT DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Active', -- Active, Inactive
    FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(64) NOT NULL, -- SHA-256 hash
    role VARCHAR(50) NOT NULL DEFAULT 'Employee', -- Admin, Asset Manager, Department Head, Employee
    department_id INT DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending Approval', -- Active, Inactive, Pending Approval
    reset_code VARCHAR(10) DEFAULT NULL,
    reset_expires_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- Add circular foreign key for department head linking back to users
ALTER TABLE departments ADD CONSTRAINT fk_department_head FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 3. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    fields TEXT -- Category-specific custom fields, comma-separated text
);

-- 4. Assets Table
CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tag VARCHAR(50) NOT NULL UNIQUE, -- Auto-generated AF-0001, etc.
    name VARCHAR(255) NOT NULL,
    serial VARCHAR(255) NOT NULL UNIQUE,
    category_id INT DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Available', -- Available, Allocated, Reserved, Under Maintenance, Lost, Retired, Disposed
    allocated_to INT DEFAULT NULL,
    location VARCHAR(255) NOT NULL,
    department_id INT DEFAULT NULL,
    shared BOOLEAN NOT NULL DEFAULT FALSE,
    `condition` VARCHAR(100) NOT NULL DEFAULT 'Excellent', -- Excellent, Good, Average, Needs Repair, Damaged, Lost
    purchase_date DATE DEFAULT NULL,
    warranty_expiry_date DATE DEFAULT NULL,
    cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    photo_path VARCHAR(255) DEFAULT NULL,
    document_path VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (allocated_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- 5. Allocations Table
CREATE TABLE IF NOT EXISTS allocations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    assignee_id INT NOT NULL,
    department_id INT DEFAULT NULL,
    allocated_by INT DEFAULT NULL,
    allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expected_return_date DATE DEFAULT NULL,
    returned_at TIMESTAMP NULL DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Active', -- Active, Returned, Overdue
    condition_out VARCHAR(100) DEFAULT 'Excellent',
    condition_in VARCHAR(100) DEFAULT NULL,
    return_notes TEXT DEFAULT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (allocated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 6. Transfer Requests Table
CREATE TABLE IF NOT EXISTS transfer_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    requested_by INT NOT NULL,
    current_holder_id INT NOT NULL,
    target_assignee_id INT NOT NULL,
    target_department_id INT DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending', -- Pending, Approved, Rejected
    approved_by INT DEFAULT NULL,
    actioned_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (current_holder_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_assignee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    booked_by INT NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Upcoming', -- Upcoming, Ongoing, Completed, Cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE
);

-- 8. Maintenance Requests Table
CREATE TABLE IF NOT EXISTS maintenance_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    requester_id INT NOT NULL,
    issue TEXT NOT NULL,
    priority VARCHAR(50) NOT NULL DEFAULT 'Medium', -- Low, Medium, High
    status VARCHAR(50) NOT NULL DEFAULT 'Pending', -- Pending, Approved, Rejected, In Progress, Resolved
    technician VARCHAR(255) DEFAULT 'Unassigned',
    photo_path VARCHAR(255) DEFAULT NULL,
    cost DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    actioned_by INT DEFAULT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actioned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 9. Maintenance History Table
CREATE TABLE IF NOT EXISTS maintenance_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    request_id INT DEFAULT NULL,
    date DATE NOT NULL,
    issue TEXT NOT NULL,
    cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    resolved_by_tech VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES maintenance_requests(id) ON DELETE SET NULL
);

-- 10. Audit Cycles Table
CREATE TABLE IF NOT EXISTS audit_cycles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scope_type VARCHAR(50) NOT NULL, -- Department, Location
    scope_value VARCHAR(255) NOT NULL, -- Name of department or location
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Open', -- Open, Closed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Audit Auditors Junction Table
CREATE TABLE IF NOT EXISTS audit_auditors (
    cycle_id INT NOT NULL,
    auditor_id INT NOT NULL,
    PRIMARY KEY (cycle_id, auditor_id),
    FOREIGN KEY (cycle_id) REFERENCES audit_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (auditor_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 12. Audit Items Table
CREATE TABLE IF NOT EXISTS audit_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cycle_id INT NOT NULL,
    asset_id INT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Verified, Missing, Damaged
    notes TEXT,
    audited_by INT DEFAULT NULL,
    audited_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (cycle_id) REFERENCES audit_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (audited_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 13. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL, -- NULL means global, or specific user_id
    type VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 14. Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    action VARCHAR(255) NOT NULL,
    target VARCHAR(255) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
