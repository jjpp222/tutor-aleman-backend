import axios, { AxiosResponse } from 'axios';
import { 
  API_CONFIG, 
  LoginRequest, 
  LoginResponse, 
  RegisterRequest, 
  RegisterResponse,
  ChatRequest,
  ChatResponse,
  TTSRequest,
  TTSResponse,
  AdminUsersResponse,
  AdminActionRequest,
  AdminActionResponse,
  ApiError
} from '@/types/api';

// Configurar axios
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: 30000, // 30 segundos
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tutor_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido
      localStorage.removeItem('tutor_token');
      localStorage.removeItem('tutor_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Funciones de autenticación
export const authApi = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response: AxiosResponse<LoginResponse> = await api.post(
      API_CONFIG.ENDPOINTS.LOGIN,
      credentials
    );
    return response.data;
  },

  register: async (userData: RegisterRequest): Promise<RegisterResponse> => {
    const response: AxiosResponse<RegisterResponse> = await api.post(
      API_CONFIG.ENDPOINTS.REGISTER,
      userData
    );
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('tutor_token');
    localStorage.removeItem('tutor_user');
  },

  getCurrentUser: () => {
    const userStr = localStorage.getItem('tutor_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('tutor_token');
  },
};

// Funciones de chat
export const chatApi = {
  sendMessage: async (message: ChatRequest): Promise<ChatResponse> => {
    const response: AxiosResponse<ChatResponse> = await api.post(
      API_CONFIG.ENDPOINTS.CHAT,
      message
    );
    return response.data;
  },

  testChat: async (message: ChatRequest): Promise<ChatResponse> => {
    const response: AxiosResponse<ChatResponse> = await api.post(
      API_CONFIG.ENDPOINTS.TEST_CHAT,
      message
    );
    return response.data;
  },
};

// Funciones de voz
export const speechApi = {
  textToSpeech: async (request: TTSRequest): Promise<TTSResponse> => {
    const response: AxiosResponse<TTSResponse> = await api.post(
      API_CONFIG.ENDPOINTS.TTS,
      request
    );
    return response.data;
  },

  // Función para convertir base64 a audio blob y reproducir
  playAudio: (base64Audio: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        // Convertir base64 a blob
        const binaryString = window.atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        
        // Crear audio element y reproducir
        const audio = new Audio();
        audio.src = URL.createObjectURL(blob);
        
        audio.onended = () => {
          URL.revokeObjectURL(audio.src);
          resolve();
        };
        
        audio.onerror = () => {
          URL.revokeObjectURL(audio.src);
          reject(new Error('Error playing audio'));
        };
        
        audio.play();
      } catch (error) {
        reject(error);
      }
    });
  },
};

// Funciones de administración
export const adminApi = {
  getPendingUsers: async (): Promise<AdminUsersResponse> => {
    const response: AxiosResponse<AdminUsersResponse> = await api.get(
      API_CONFIG.ENDPOINTS.ADMIN_USERS
    );
    return response.data;
  },

  approveUser: async (userId: string): Promise<AdminActionResponse> => {
    const request: AdminActionRequest = {
      userIdToApprove: userId,
      action: 'approve',
    };
    const response: AxiosResponse<AdminActionResponse> = await api.post(
      API_CONFIG.ENDPOINTS.ADMIN_USERS,
      request
    );
    return response.data;
  },

  rejectUser: async (userId: string): Promise<AdminActionResponse> => {
    const request: AdminActionRequest = {
      userIdToApprove: userId,
      action: 'reject',
    };
    const response: AxiosResponse<AdminActionResponse> = await api.post(
      API_CONFIG.ENDPOINTS.ADMIN_USERS,
      request
    );
    return response.data;
  },

  deleteUser: async (userId: string): Promise<AdminActionResponse> => {
    const request: AdminActionRequest = {
      userIdToApprove: userId,
      action: 'delete',
    };
    const response: AxiosResponse<AdminActionResponse> = await api.post(
      API_CONFIG.ENDPOINTS.ADMIN_USERS,
      request
    );
    return response.data;
  },
};

// Función de health check
export const healthCheck = async (): Promise<{ status: string; timestamp: string }> => {
  const response = await api.get(API_CONFIG.ENDPOINTS.HEALTH);
  return response.data;
};

export default api;