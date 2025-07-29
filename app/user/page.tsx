'use client';

import React, { useState, useEffect } from 'react';
import { FaUsers, FaPlus, FaEdit, FaTrash, FaSpinner, FaEye, FaEyeSlash, FaSearch } from 'react-icons/fa';
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
    year_name: string;
  };
  kode_guru?: string;
}

interface Role {
  id: number;
  name: string;
  category: string;
}

// Toggle Switch Component
const ToggleSwitch = ({ isActive, onToggle }: { isActive: boolean; onToggle: () => void }) => {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        isActive ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isActive ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
      <span className={`absolute left-1 text-xs font-medium ${
        isActive ? 'text-white' : 'text-gray-500'
      }`}>
        {isActive ? 'ON' : 'OFF'}
      </span>
    </button>
  );
};

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
      if (!classId && classCourses.length > 0) {
        classId = classCourses[0].id.toString();
      }
      setFormData({
        nama_lengkap: initialData.nama_lengkap || '',
        email: initialData.email || '',
        user_name: initialData.user_name || '',
        password: '',
        confirmPassword: '',
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
    if (!formData.nama_lengkap || !formData.email || !formData.user_name || 
        !formData.role || !formData.tanggal_lahir) {
      alert('Mohon lengkapi semua field yang diperlukan');
      return;
    }

    let autoPassword = formData.password;
    if (!isEditMode) {
      const tanggalLahir = new Date(formData.tanggal_lahir);
      const day = tanggalLahir.getDate().toString().padStart(2, '0');
      const month = (tanggalLahir.getMonth() + 1).toString().padStart(2, '0');
      const year = tanggalLahir.getFullYear();
      autoPassword = `s!nLui2+${day}${month}${year}`;
    }

    const payload = {
      ...formData,
      password: autoPassword,
      ...(formData.role === '1' && {
        nis: formData.nis,
        nisn: formData.nisn,
        parent_contact: formData.parent_contact,
        class_id: formData.class_id,
      }),
      ...(formData.role === '2' && {
        kode_guru: formData.kode_guru,
        niy: formData.niy,
      }),
      ...(formData.role === '3' && {
        kode_admin: formData.kode_admin,
        nip: formData.nip,
      }),
    };

    onSave(payload);
    onClose();
    
    if (!isEditMode) {
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
                onChange={(e) => setFormData({ ...formData, tanggal_lahir: e.target.value })}
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
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [classCourses, setClassCourses] = useState<any[]>([]);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const userResponse = await fetch('/api/admin/users');
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUsers(userData.data.users);
        setFilteredUsers(userData.data.users);
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

  // Filter users based on search term and role
  useEffect(() => {
    let filtered = users;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.nama_lengkap.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by role
    if (selectedRole !== 'all') {
      filtered = filtered.filter(user =>
        user.roles.includes(selectedRole)
      );
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, selectedRole]);

  const handleEditClick = (user: any) => {
    console.log('handleEditClick called with user:', user);
    console.log('classCourses:', classCourses);

    let classId = '';
    if (user.class_info && user.class_info.class_id) {
      classId = user.class_info.class_id.toString();
    } else if (classCourses.length > 0) {
      classId = classCourses[0].id.toString();
    }

    const updatedUserData = {
      ...user,
      class_id: classId,
    };

    console.log('Setting editUserData:', updatedUserData);
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

  const handleMenuClick = () => {
    setIsMobileOpen(true);
  };

  const handleToggleStatus = async (userId: number, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_active: !currentStatus
        }),
      });

      if (response.ok) {
        // Update local state
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === userId 
              ? { ...user, is_active: !currentStatus }
              : user
          )
        );
        alert(`User berhasil ${!currentStatus ? 'diaktifkan' : 'dinonaktifkan'}!`);
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.message || errorData.error || 'Failed to update status'}`);
      }
    } catch (error) {
      console.error('Error updating user status:', error);
      alert('Error updating user status');
    }
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
                <Button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-2"
                >
                  <FaPlus className="text-sm" />
                  Tambah User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search and Filter Section */}
              <div className="mb-6 flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Cari berdasarkan nama..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="w-full sm:w-48">
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter berdasarkan role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Role</SelectItem>
                      <SelectItem value="STUDENT">Student</SelectItem>
                      <SelectItem value="TEACHER">Teacher</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <FaSpinner className="animate-spin text-blue-500 mr-2" />
                  <span className="text-gray-600">Loading users...</span>
                </div>
              ) : filteredUsers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-3 border-b">Nama</th>
                        <th className="text-left p-3 border-b">Email</th>
                        <th className="text-left p-3 border-b">Username</th>
                        <th className="text-left p-3 border-b">Role</th>
                        <th className="text-left p-3 border-b">Kelas/Kode</th>
                        <th className="text-left p-3 border-b">Status</th>
                        <th className="text-left p-3 border-b">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
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
                                {user.class_info.class_name} - {user.class_info.grade_level} ({user.class_info.year_name})
                              </span>
                            ) : user.roles.includes('TEACHER') && user.kode_guru ? (
                              <span className="text-sm text-gray-700">
                                {user.kode_guru}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            <ToggleSwitch
                              isActive={user.is_active}
                              onToggle={() => handleToggleStatus(user.id, user.is_active)}
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="flex items-center gap-1" 
                                onClick={() => handleEditClick(user)}
                              >
                                <FaEdit className="text-xs" />
                                Edit
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="flex items-center gap-1 text-red-600 hover:text-red-700"
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
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-gray-600 mb-4">
                    {searchTerm || selectedRole !== 'all' 
                      ? 'Tidak ada user yang sesuai dengan filter' 
                      : 'Belum ada user'
                    }
                  </div>
                  {!searchTerm && selectedRole === 'all' && (
                    <Button onClick={() => setIsAddModalOpen(true)}>
                      Tambah User Pertama
                    </Button>
                  )}
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
