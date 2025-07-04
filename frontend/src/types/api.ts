// Tipos para la API del Tutor Alemán

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin';
  status: 'pending' | 'active' | 'rejected';
  dateOfBirth?: string;
  nationality?: string;
  currentLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  studyGoals?: string;
  lastLogin?: string;
  createdAt?: string;
  approvedAt?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  dateOfBirth: string;
  nationality: string;
  currentLevel: string;
  studyGoals: string;
  consentAudio: boolean;
  consentPrivacy: boolean;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  userId: string;
  status: string;
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  conversationId: string;
  timestamp: string;
}

export interface TTSRequest {
  text: string;
  voice?: 'male' | 'female' | 'friendly' | 'professional';
  speed?: 'slow' | 'medium' | 'fast';
  language?: 'de-DE' | 'de-AT' | 'de-CH';
}

export interface TTSResponse {
  success: boolean;
  audioData: string; // base64
  mimeType: string;
  voiceUsed: string;
  textLength: number;
  timestamp: string;
}

export interface ApiError {
  success: false;
  error: string;
}

export interface AccessRequest {
  id: string;
  userId: string;
  email: string;
  name: string;
  surname: string;
  germanLevel: string;
  motivation: string;
  institution: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  adminNotes: string | null;
}

export interface AdminUsersResponse {
  success: boolean;
  requests: AccessRequest[];
  totalRequests: number;
  filters: {
    status: string;
  };
}

export interface AdminActionRequest {
  requestId: string;
  action: 'approve' | 'reject';
  adminNotes?: string;
}

export interface AdminActionResponse {
  success: boolean;
  message: string;
  request?: AccessRequest;
  action: string;
  reviewedBy?: {
    id: string;
    email: string;
    name: string;
  };
}

// Configuración de la API
export const API_CONFIG = {
  BASE_URL: 'https://tutor-aleman-backend-v4.azurewebsites.net/api',
  ENDPOINTS: {
    HEALTH: '/hello',
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    CHAT: '/voice-conversation',
    TEST_CHAT: '/test-chat',
    TTS: '/speech-synthesize-url',
    STT: '/speech/transcribe',
    ADMIN_USERS: '/admin/requests',
  },
} as const;

// Estados de la aplicación
export interface AppState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'tutor';
  content: string;
  timestamp: Date;
  audioUrl?: string;
}

export interface ConversationState {
  messages: ChatMessage[];
  isTyping: boolean;
  currentConversationId?: string;
}