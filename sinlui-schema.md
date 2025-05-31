-- 1. Main User Table
CREATE TABLE app_user (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_name VARCHAR(50) UNIQUE NOT NULL,
    nama_lengkap VARCHAR(255) NOT NULL,
    last_login TIMESTAMP,
    profile_picture_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by INTEGER,
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_date TIMESTAMP,
    updated_by INTEGER
);

CREATE INDEX idx_app_user_email ON app_user(email);
CREATE INDEX idx_app_user_username ON app_user(user_name);
CREATE INDEX idx_app_user_active_deleted ON app_user(is_active, is_deleted);
CREATE INDEX idx_app_user_nama_lengkap ON app_user(nama_lengkap);

-- 2. Centralized User Profile
CREATE TABLE user_profile (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    tmp_lahir VARCHAR(100),
    tgl_lahir DATE,
    gender VARCHAR(10) CHECK (gender IN ('L', 'P')),
    telepon VARCHAR(20),
    alamat TEXT,
    agama VARCHAR(30),
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_date TIMESTAMP,
    updated_by INTEGER
);

CREATE INDEX idx_user_profile_user ON user_profile(user_id);
CREATE INDEX idx_user_profile_gender ON user_profile(gender);
CREATE INDEX idx_user_profile_tgl_lahir ON user_profile(tgl_lahir);

-- 3. Enumeration Table
CREATE TABLE enumeration (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    alt_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    category VARCHAR(50) NOT NULL,
    created_by INTEGER,
    UNIQUE(name, category)
);

CREATE INDEX idx_enumeration_category ON enumeration(category);
CREATE INDEX idx_enumeration_category_name ON enumeration(category, name);
CREATE INDEX idx_enumeration_active_default ON enumeration(category, is_active, is_default);

-- 4. User Role Assignment
CREATE TABLE app_user_role (
    id SERIAL PRIMARY KEY,
    role_id INTEGER REFERENCES enumeration(id),
    user_id INTEGER REFERENCES app_user(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_date TIMESTAMP,
    updated_by INTEGER
);

CREATE INDEX idx_app_user_role_user ON app_user_role(user_id);
CREATE INDEX idx_app_user_role_role ON app_user_role(role_id);
CREATE INDEX idx_app_user_role_user_role ON app_user_role(user_id, role_id);
CREATE INDEX idx_app_user_role_active ON app_user_role(is_active) WHERE is_active = TRUE;

-- 5. Student Specific Details
CREATE TABLE student_details (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    nis VARCHAR(50) UNIQUE NOT NULL,
    nisn VARCHAR(50),
    parent_contact VARCHAR(50),
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_date TIMESTAMP,
    updated_by INTEGER
);

CREATE INDEX idx_student_details_user ON student_details(user_id);
CREATE INDEX idx_student_nis ON student_details(nis);
CREATE INDEX idx_student_nisn ON student_details(nisn);

-- 6. Teacher Specific Details
CREATE TABLE teacher_details (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    kode_guru VARCHAR(50) UNIQUE NOT NULL,
    niy VARCHAR(50),
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_date TIMESTAMP,
    updated_by INTEGER
);

CREATE INDEX idx_teacher_details_user ON teacher_details(user_id);
CREATE INDEX idx_teacher_kode ON teacher_details(kode_guru);
CREATE INDEX idx_teacher_niy ON teacher_details(niy);

-- 7. Admin Specific Details
CREATE TABLE admin_details (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    kode_admin VARCHAR(50) UNIQUE NOT NULL,
    nip VARCHAR(50),
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_date TIMESTAMP,
    updated_by INTEGER
);

CREATE INDEX idx_admin_details_user ON admin_details(user_id);
CREATE INDEX idx_admin_kode ON admin_details(kode_admin);
CREATE INDEX idx_admin_nip ON admin_details(nip);