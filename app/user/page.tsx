'use client';

<<<<<<< HEAD
import React, { useState, useEffect, useMemo } from 'react';
import { FaUsers, FaPlus, FaEdit, FaTrash, FaSpinner, FaEye, FaEyeSlash, FaChevronLeft, FaChevronRight, FaSearch, FaFilter } from 'react-icons/fa';
=======
import React, { useState, useEffect } from 'react';
import { FaUsers, FaPlus, FaEdit, FaTrash, FaSpinner, FaEye, FaEyeSlash } from 'react-icons/fa';
>>>>>>> test-plagiarism-correction-feature
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Sidebar from '../_components/sidebar';
import { useRouter } from 'next/navigation';
import Topbar from '../_components/topbar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface User {
  id: number;
  nama_lengkap: string;
  email: string;
  user_name: string;
  is_active: boolean;
  roles: string[];
  created_date: string;
  class_info?: {
    class_id: number;
    class_name: string;
    grade_level: string;
  } | null;
  nis?: string;
  nisn?: string;
  parent_contact?: string;
  kode_guru?: string;
  niy?: string;
  kode_admin?: string;
  nip?: string;
  tanggal_lahir?: string;
}

interface Role {
  id: number;
  name: string;
  category: string;
}

const AddUserModal = ({ isOpen, onClose, onSave, initialData = null, isEditMode = false, classCourses = [] }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userData: any) => void;
  initialData?: any;
  isEditMode?: boolean;
  classCourses?: any[];
}) => {
  const [formData, setFormData] = useState({
    nama_lengkap: '',
    email: '',
    user_name: '',
    password: '',
    confirmPassword: '',
    role: '',
    tanggal_lahir: '',
    nis: '',
    nisn: '',
    parent_contact: '',
    kode_guru: '',
    niy: '',
    kode_admin: '',
    nip: '',
    class_id: '',
    id: undefined,
  });

  const [roles] = useState<Role[]>([
    { id: 1, name: 'STUDENT', category: 'ROLE' },
    { id: 2, name: 'TEACHER', category: 'ROLE' },
    { id: 3, name: 'ADMIN', category: 'ROLE' },
  ]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEditMode && initialData) {
      let tanggalLahir = '';
      if (initialData.tanggal_lahir) {
        const tgl = new Date(initialData.tanggal_lahir);
        tanggalLahir = tgl.toISOString().slice(0, 10);
      }
      let classId = '';
      if (initialData.class_id) {
        classId = initialData.class_id.toString();
      } else if (initialData.class_info && initialData.class_info.class_id) {
        classId = initialData.class_info.class_id.toString();
      }
<<<<<<< HEAD

      // Generate password dari tanggal lahir untuk ditampilkan
      let generatedPassword = '';
      if (tanggalLahir) {
        const birthDate = new Date(tanggalLahir);
        const day = birthDate.getDate().toString().padStart(2, '0');
        const month = (birthDate.getMonth() + 1).toString().padStart(2, '0');
        const year = birthDate.getFullYear();
        generatedPassword = `s!nLui2+${day}${month}${year}`;
      }

=======
      // Don't set default class if no class found - let user select
      
>>>>>>> test-plagiarism-correction-feature
      setFormData({
        nama_lengkap: initialData.nama_lengkap || '',
        email: initialData.email || '',
        user_name: initialData.user_name || '',
<<<<<<< HEAD
        password: generatedPassword, // ✅ TAMPILKAN password yang di-generate
        confirmPassword: generatedPassword,
=======
        password: '',
        confirmPassword: '',
>>>>>>> test-plagiarism-correction-feature
        role: initialData.roles ? (initialData.roles[0] === 'ADMIN' ? '3' : initialData.roles[0] === 'TEACHER' ? '2' : '1') : '',
        tanggal_lahir: tanggalLahir,
        nis: initialData.nis || '',
        nisn: initialData.nisn || '',
        parent_contact: initialData.parent_contact || '',
        kode_guru: initialData.kode_guru || '',
        niy: initialData.niy || '',
        kode_admin: initialData.kode_admin || '',
        nip: initialData.nip || '',
        class_id: classId,
        id: initialData.id,
      });
    } else if (!isEditMode) {
      setFormData({
        nama_lengkap: '',
        email: '',
        user_name: '',
        password: '',
        confirmPassword: '',
        role: '',
        tanggal_lahir: '',
        nis: '',
        nisn: '',
        parent_contact: '',
        kode_guru: '',
        niy: '',
        kode_admin: '',
        nip: '',
        class_id: '',
        id: undefined,
      });
    }
    // eslint-disable-next-line
  }, [isEditMode, initialData, isOpen, classCourses]);

  useEffect(() => {
    if (isOpen) {
      fetchClassCourses();
    }
  }, [isOpen]);

  const fetchClassCourses = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/classes');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const classOptions = data.data.classes.map((classData: any) => ({
            id: classData.id,
            name: `${classData.name} - ${classData.grade_level} (${classData.year_name})`,
            class_id: classData.id,
            class_name: classData.name,
            grade_level: classData.grade_level,
            year_name: classData.year_name,
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (roleId: string) => {
    setFormData(prev => ({
      ...prev,
      role: roleId
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

<<<<<<< HEAD
    if (!formData.nama_lengkap || !formData.email || !formData.user_name ||
      !formData.role || !formData.tanggal_lahir) {
=======
    if (!formData.nama_lengkap || !formData.email || !formData.user_name || 
        !formData.role || !formData.tanggal_lahir) {
>>>>>>> test-plagiarism-correction-feature
      alert('Mohon lengkapi semua field yang diperlukan');
      return;
    }

    // SELALU generate password dari tanggal_lahir (baik tambah maupun edit)
    const tanggalLahir = new Date(formData.tanggal_lahir);
    const day = tanggalLahir.getDate().toString().padStart(2, '0');
    const month = (tanggalLahir.getMonth() + 1).toString().padStart(2, '0');
    const year = tanggalLahir.getFullYear();
    const autoPassword = `s!nLui2+${day}${month}${year}`;

    // Payload DASAR
    let payload: any = {
      ...formData,
      password: autoPassword, // SELALU kirim password baru ini
    };

    // Tambahkan field khusus sesuai role
    if (formData.role === '1') { // STUDENT
      payload = {
        ...payload,
        nis: formData.nis || null,
        nisn: formData.nisn || null,
        parent_contact: formData.parent_contact || null,
        class_id: formData.class_id ? parseInt(formData.class_id) : null,
      };
    } else if (formData.role === '2') { // TEACHER
      payload = {
        ...payload,
        kode_guru: formData.kode_guru || null,
        niy: formData.niy || null,
      };
    } else if (formData.role === '3') { // ADMIN
      payload = {
        ...payload,
        kode_admin: formData.kode_admin || null,
        nip: formData.nip || null,
      };
    }

    // Hapus field yang tidak dibutuhkan backend
    delete payload.confirmPassword;

    // Jika edit mode, pastikan ID ikut
    if (isEditMode && formData.id) {
      payload.id = formData.id;
    }

    console.log('Payload yang dikirim:', payload); // buat debugging

    onSave(payload);
    onClose();

    // Reset form
    setFormData({
      nama_lengkap: '',
      email: '',
      user_name: '',
      password: '',
      confirmPassword: '',
      role: '',
      tanggal_lahir: '',
      nis: '',
      nisn: '',
      parent_contact: '',
      kode_guru: '',
      niy: '',
      kode_admin: '',
      nip: '',
      class_id: '',
      id: undefined,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit User' : 'Tambah User Baru'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nama_lengkap">Nama Lengkap *</Label>
              <Input
                id="nama_lengkap"
                value={formData.nama_lengkap}
                onChange={(e) => setFormData({ ...formData, nama_lengkap: e.target.value })}
                placeholder="Masukkan nama lengkap"
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@example.com"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="user_name">Username *</Label>
              <Input
                id="user_name"
                value={formData.user_name}
                onChange={(e) => setFormData({ ...formData, user_name: e.target.value })}
                placeholder="username"
                required
              />
            </div>
            <div>
              <Label htmlFor="tanggal_lahir">Tanggal Lahir *</Label>
              <Input
                id="tanggal_lahir"
                type="date"
                value={formData.tanggal_lahir}
<<<<<<< HEAD
                onChange={(e) => {
                  const newDate = e.target.value;
                  // Auto-generate password dari tanggal lahir baru
                  let newPassword = '';
                  if (newDate) {
                    const birthDate = new Date(newDate);
                    const day = birthDate.getDate().toString().padStart(2, '0');
                    const month = (birthDate.getMonth() + 1).toString().padStart(2, '0');
                    const year = birthDate.getFullYear();
                    newPassword = `s!nLui2+${day}${month}${year}`;
                  }
                  setFormData({
                    ...formData,
                    tanggal_lahir: newDate,
                    password: newPassword,
                    confirmPassword: newPassword
                  });
                }}
=======
                onChange={(e) => setFormData({ ...formData, tanggal_lahir: e.target.value })}
>>>>>>> test-plagiarism-correction-feature
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="role">Role *</Label>
            <Select
              value={formData.role}
              onValueChange={handleRoleChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id.toString()}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

<<<<<<< HEAD
          {/* Password Fields - Auto-generated from birth date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="password">Password (Auto-generated)</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Auto-generated dari tanggal lahir"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Format: s!nLui2+DDMMYYYY
              </p>
            </div>
            <div>
              <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Konfirmasi password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>
          </div>

=======
>>>>>>> test-plagiarism-correction-feature
          {/* Student Details */}
          {formData.role === '1' && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Detail Siswa</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nis">NIS</Label>
                  <Input
                    id="nis"
                    value={formData.nis}
                    onChange={(e) => setFormData({ ...formData, nis: e.target.value })}
                    placeholder="Nomor Induk Siswa"
                  />
                </div>
                <div>
                  <Label htmlFor="nisn">NISN</Label>
                  <Input
                    id="nisn"
                    value={formData.nisn}
                    onChange={(e) => setFormData({ ...formData, nisn: e.target.value })}
                    placeholder="Nomor Induk Siswa Nasional"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="parent_contact">Kontak Orang Tua</Label>
                  <Input
                    id="parent_contact"
                    value={formData.parent_contact}
                    onChange={(e) => setFormData({ ...formData, parent_contact: e.target.value })}
                    placeholder="Nomor telepon orang tua"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="class_id">Pembagian Kelas</Label>
                  <Select
                    value={
                      classCourses.length === 0 || !formData.class_id
                        ? ""
                        : formData.class_id
                    }
                    onValueChange={(value) => setFormData({ ...formData, class_id: value })}
                    disabled={classCourses.length === 0 || loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={classCourses.length === 0 || loading ? "Tidak ada kelas tersedia" : "Pilih kelas"} />
                    </SelectTrigger>
                    <SelectContent>
                      {loading ? (
                        <div className="px-4 py-2 text-gray-500">Loading kelas...</div>
                      ) : classCourses.length === 0 ? (
                        <div className="px-4 py-2 text-gray-500">Tidak ada kelas tersedia</div>
                      ) : (
                        classCourses.map((classCourse) => (
                          <SelectItem key={classCourse.id} value={classCourse.id.toString()}>
                            {classCourse.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Teacher Details */}
          {formData.role === '2' && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Detail Guru</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="kode_guru">Kode Guru</Label>
                  <Input
                    id="kode_guru"
                    value={formData.kode_guru}
                    onChange={(e) => setFormData({ ...formData, kode_guru: e.target.value })}
                    placeholder="Kode guru"
                  />
                </div>
                <div>
                  <Label htmlFor="niy">NIY</Label>
                  <Input
                    id="niy"
                    value={formData.niy}
                    onChange={(e) => setFormData({ ...formData, niy: e.target.value })}
                    placeholder="Nomor Induk Yayasan"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Admin Details */}
          {formData.role === '3' && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Detail Admin</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="kode_admin">Kode Admin</Label>
                  <Input
                    id="kode_admin"
                    value={formData.kode_admin}
                    onChange={(e) => setFormData({ ...formData, kode_admin: e.target.value })}
                    placeholder="Kode admin"
                  />
                </div>
                <div>
                  <Label htmlFor="nip">NIP</Label>
                  <Input
                    id="nip"
                    value={formData.nip}
                    onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                    placeholder="Nomor Induk Pegawai"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              {isEditMode ? 'Update User' : 'Simpan User'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Batal
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const UserManagement = () => {
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editUserData, setEditUserData] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [classCourses, setClassCourses] = useState<any[]>([]);

<<<<<<< HEAD
  // Search and Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter users based on search and filters
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = searchQuery === '' ||
        user.nama_lengkap.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower) ||
        user.user_name.toLowerCase().includes(searchLower);

      // Role filter
      const matchesRole = roleFilter === 'all' ||
        user.roles.includes(roleFilter);

      // Status filter
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && user.is_active) ||
        (statusFilter === 'inactive' && !user.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Calculate paginated users from filtered results
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, statusFilter]);

=======
>>>>>>> test-plagiarism-correction-feature
  const fetchData = async () => {
    setLoading(true);
    try {
      const userResponse = await fetch('/api/admin/users');
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUsers(userData.data.users);
      }

      const classResponse = await fetch('/api/admin/classes');
      if (classResponse.ok) {
        const classData = await classResponse.json();
        if (classData.success) {
          const classOptions = classData.data.classes.map((classData: any) => ({
            id: classData.id,
            name: `${classData.name} - ${classData.grade_level} (${classData.year_name})`,
            class_id: classData.id,
            class_name: classData.name,
            grade_level: classData.grade_level,
            year_name: classData.year_name,
          }));
          setClassCourses(classOptions);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEditClick = (user: any) => {
    // Prepare user data with all fields for editing
    const updatedUserData = {
      ...user,
      class_id: user.class_info?.class_id?.toString() || '',
    };

    setEditUserData(updatedUserData);
    setIsEditModalOpen(true);
  };

  const handleEditUser = async (userData: any) => {
    try {
      const response = await fetch(`/api/admin/users/${userData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      if (response.ok) {
        alert('User berhasil diupdate!');
        await fetchData();
        setIsEditModalOpen(false);
        setEditUserData(null);
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.message || errorData.error || 'Failed to update user'}`);
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error updating user');
    }
  };

  const handleAddUser = async (userData: any) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (response.ok) {
        alert('User berhasil ditambahkan!');
        await fetchData();
        setIsAddModalOpen(false);
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.message || errorData.error || 'Failed to create user'}`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Error creating user');
    }
  };

<<<<<<< HEAD
  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus user ini?')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        alert('User berhasil dihapus!');
        await fetchData();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.message || errorData.error || 'Failed to delete user'}`);
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error deleting user');
    }
  };

=======
>>>>>>> test-plagiarism-correction-feature
  const handleMenuClick = () => {
    setIsMobileOpen(true);
  };

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />

      <div className="p-3 sm:p-4 md:p-6 bg-gray-100 flex-1 min-w-0 overflow-y-auto">
        <Topbar onMenuClick={handleMenuClick} />

        <div className="grid grid-cols-1 gap-6 pt-8">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-gray-900 flex items-center gap-2">
                  <FaUsers className="text-blue-600" />
                  User Management
                </CardTitle>
<<<<<<< HEAD
                <Button
=======
                <Button 
>>>>>>> test-plagiarism-correction-feature
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-2"
                >
                  <FaPlus className="text-sm" />
                  Tambah User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
<<<<<<< HEAD
              {/* Search and Filter Controls */}
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                {/* Search Input */}
                <div className="relative flex-1">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cari nama, email, atau username..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Role Filter */}
                <div className="flex items-center gap-2">
                  <FaFilter className="text-gray-400" />
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">Semua Role</option>
                    <option value="STUDENT">Student</option>
                    <option value="TEACHER">Teacher</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="all">Semua Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Results count */}
              <div className="text-sm text-gray-600 mb-4">
                {filteredUsers.length} user ditemukan
                {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setRoleFilter('all');
                      setStatusFilter('all');
                    }}
                    className="ml-2 text-blue-600 hover:text-blue-800 underline"
                  >
                    Reset filter
                  </button>
                )}
              </div>

=======
>>>>>>> test-plagiarism-correction-feature
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <FaSpinner className="animate-spin text-blue-500 mr-2" />
                  <span className="text-gray-600">Loading users...</span>
                </div>
<<<<<<< HEAD
              ) : filteredUsers.length > 0 ? (
=======
              ) : users.length > 0 ? (
>>>>>>> test-plagiarism-correction-feature
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-3 border-b">Nama</th>
                        <th className="text-left p-3 border-b">Email</th>
                        <th className="text-left p-3 border-b">Username</th>
                        <th className="text-left p-3 border-b">Role</th>
                        <th className="text-left p-3 border-b">Kelas</th>
                        <th className="text-left p-3 border-b">Status</th>
                        <th className="text-left p-3 border-b">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
<<<<<<< HEAD
                      {paginatedUsers.map((user) => (
=======
                      {users.map((user) => (
>>>>>>> test-plagiarism-correction-feature
                        <tr key={user.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">{user.nama_lengkap}</td>
                          <td className="p-3">{user.email}</td>
                          <td className="p-3">{user.user_name}</td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              {user.roles.map((role, index) => (
                                <span
                                  key={index}
                                  className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full"
                                >
                                  {role}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3">
                            {user.roles.includes('STUDENT') && user.class_info ? (
                              <span className="text-sm text-gray-700">
                                {user.class_info.class_name} ({user.class_info.grade_level})
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span
<<<<<<< HEAD
                              className={`text-xs px-2 py-1 rounded-full ${user.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                                }`}
=======
                              className={`text-xs px-2 py-1 rounded-full ${
                                user.is_active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
>>>>>>> test-plagiarism-correction-feature
                            >
                              {user.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2">
<<<<<<< HEAD
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex items-center gap-1"
=======
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="flex items-center gap-1" 
>>>>>>> test-plagiarism-correction-feature
                                onClick={() => handleEditClick(user)}
                              >
                                <FaEdit className="text-xs" />
                                Edit
                              </Button>
<<<<<<< HEAD
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex items-center gap-1 text-red-600 hover:text-red-700"
                                onClick={() => handleDeleteUser(user.id)}
=======
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="flex items-center gap-1 text-red-600 hover:text-red-700"
>>>>>>> test-plagiarism-correction-feature
                              >
                                <FaTrash className="text-xs" />
                                Hapus
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
<<<<<<< HEAD

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-gray-600">
                        Menampilkan {startIndex + 1} - {Math.min(endIndex, filteredUsers.length)} dari {filteredUsers.length} user
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="flex items-center gap-1"
                        >
                          <FaChevronLeft className="text-xs" />
                          Prev
                        </Button>

                        <div className="flex items-center gap-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(page => {
                              // Show first, last, current, and adjacent pages
                              return page === 1 ||
                                page === totalPages ||
                                Math.abs(page - currentPage) <= 1;
                            })
                            .map((page, index, array) => (
                              <React.Fragment key={page}>
                                {index > 0 && array[index - 1] !== page - 1 && (
                                  <span className="px-2 text-gray-400">...</span>
                                )}
                                <Button
                                  size="sm"
                                  variant={currentPage === page ? "default" : "outline"}
                                  onClick={() => setCurrentPage(page)}
                                  className="min-w-[36px]"
                                >
                                  {page}
                                </Button>
                              </React.Fragment>
                            ))
                          }
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="flex items-center gap-1"
                        >
                          Next
                          <FaChevronRight className="text-xs" />
                        </Button>
                      </div>
                    </div>
                  )}
=======
>>>>>>> test-plagiarism-correction-feature
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-gray-600 mb-4">Belum ada user</div>
                  <Button onClick={() => setIsAddModalOpen(true)}>
                    Tambah User Pertama
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddUser}
        classCourses={classCourses}
      />
      {isEditModalOpen && editUserData && (
        <AddUserModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditUserData(null);
          }}
          onSave={handleEditUser}
          initialData={editUserData}
          isEditMode={true}
          classCourses={classCourses}
        />
      )}
    </div>
  );
};

export default UserManagement;
