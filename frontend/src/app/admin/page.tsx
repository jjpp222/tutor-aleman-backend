'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, authApi } from '@/lib/api';
import { AccessRequest, AdminUsersResponse } from '@/types/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export default function AdminPanel() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Verificar autenticación y rol de admin
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    
    if (currentUser.role !== 'admin') {
      router.push('/');
      return;
    }

    setUser(currentUser);
    loadRequests();
  }, [router, selectedStatus]);

  const loadRequests = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response: AdminUsersResponse = await adminApi.getPendingRequests(selectedStatus);
      setRequests(response.requests || []);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error loading requests');
      console.error('Error loading requests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (processingIds.has(requestId)) return;
    
    setProcessingIds(prev => new Set([...prev, requestId]));
    try {
      await adminApi.approveRequest(requestId, 'Approved by admin');
      await loadRequests(); // Refresh list
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error approving request');
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const handleReject = async (requestId: string) => {
    if (processingIds.has(requestId)) return;
    
    const reason = prompt('Motivo del rechazo (opcional):');
    
    setProcessingIds(prev => new Set([...prev, requestId]));
    try {
      await adminApi.rejectRequest(requestId, reason || 'Rejected by admin');
      await loadRequests(); // Refresh list
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error rejecting request');
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const handleLogout = () => {
    authApi.logout();
    router.push('/login');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    const classes = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    
    return classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading && requests.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando solicitudes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
              <p className="text-sm text-gray-600">Tutor Virtual de Alemán</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                Bienvenido, {user?.name}
              </span>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Filtros</h2>
            <div className="flex space-x-4">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="">Todas las solicitudes</option>
                <option value="pending">Pendientes</option>
                <option value="approved">Aprobadas</option>
                <option value="rejected">Rechazadas</option>
              </select>
              <button
                onClick={loadRequests}
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                {isLoading ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Requests Table */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Solicitudes de Acceso ({requests.length})
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Gestiona las solicitudes de estudiantes para acceder al tutor.
            </p>
          </div>
          
          {requests.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="text-gray-500">
                {selectedStatus ? 
                  `No hay solicitudes ${selectedStatus === 'pending' ? 'pendientes' : selectedStatus === 'approved' ? 'aprobadas' : 'rechazadas'}.` :
                  'No hay solicitudes disponibles.'
                }
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {requests.map((request) => (
                <li key={request.id} className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-indigo-600 truncate">
                            {request.name} {request.surname}
                          </p>
                          <p className="text-sm text-gray-500">{request.email}</p>
                        </div>
                        <div className="ml-2 flex-shrink-0">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(request.status)}`}>
                            {request.status === 'pending' ? 'Pendiente' : 
                             request.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-2 sm:flex sm:justify-between">
                        <div className="sm:flex">
                          <div className="flex items-center text-sm text-gray-500">
                            <span className="font-medium">Nivel:</span>
                            <span className="ml-1">{request.germanLevel}</span>
                          </div>
                          {request.institution && (
                            <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                              <span className="font-medium">Institución:</span>
                              <span className="ml-1">{request.institution}</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                          <span>Creada: {formatDate(request.createdAt)}</span>
                        </div>
                      </div>
                      
                      {request.motivation && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Motivación:</span> {request.motivation}
                          </p>
                        </div>
                      )}

                      {request.adminNotes && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Notas del admin:</span> {request.adminNotes}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {request.status === 'pending' && (
                      <div className="ml-4 flex space-x-2">
                        <button
                          onClick={() => handleApprove(request.id)}
                          disabled={processingIds.has(request.id)}
                          className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                        >
                          {processingIds.has(request.id) ? 'Procesando...' : 'Aprobar'}
                        </button>
                        <button
                          onClick={() => handleReject(request.id)}
                          disabled={processingIds.has(request.id)}
                          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                        >
                          {processingIds.has(request.id) ? 'Procesando...' : 'Rechazar'}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}