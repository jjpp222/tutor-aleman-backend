import { useState, useEffect, useCallback } from 'react';
import { authApi } from '@/lib/api';
import { User, LoginRequest, RegisterRequest } from '@/types/api';

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginRequest) => Promise<boolean>;
  register: (userData: RegisterRequest) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Verificar si hay un usuario logueado al cargar
  useEffect(() => {
    const token = localStorage.getItem('tutor_token');
    const savedUser = localStorage.getItem('tutor_user');
    
    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
      } catch (err) {
        // Si hay error parseando, limpiar storage
        localStorage.removeItem('tutor_token');
        localStorage.removeItem('tutor_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (credentials: LoginRequest): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authApi.login(credentials);
      
      if (response.success) {
        // Guardar token y usuario
        localStorage.setItem('tutor_token', response.token);
        localStorage.setItem('tutor_user', JSON.stringify(response.user));
        setUser(response.user);
        return true;
      } else {
        setError(response.message || 'Error en el login');
        return false;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Error de conexión';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (userData: RegisterRequest): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authApi.register(userData);
      
      if (response.success) {
        return true;
      } else {
        setError(response.message || 'Error en el registro');
        return false;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Error de conexión';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
  };
}