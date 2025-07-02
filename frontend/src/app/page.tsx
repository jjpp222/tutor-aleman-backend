'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { BookOpen, MessageCircle, Mic } from 'lucide-react';

export default function Home() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        // Si está autenticado, ir al chat
        router.push('/chat');
      } else {
        // Si no está autenticado, ir al login
        router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  // Página de bienvenida mientras se redirige
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              🇩🇪 Tutor Virtual de Alemán
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Aprende alemán con inteligencia artificial - Niveles B1-B2
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-blue-50 rounded-lg p-6">
              <MessageCircle className="h-8 w-8 text-blue-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Chat Inteligente</h3>
              <p className="text-gray-600 text-sm">
                Conversa con tu tutor de IA en alemán
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-6">
              <Mic className="h-8 w-8 text-green-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Práctica de Voz</h3>
              <p className="text-gray-600 text-sm">
                Mejora tu pronunciación alemana
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6">
              <BookOpen className="h-8 w-8 text-purple-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Análisis Pedagógico</h3>
              <p className="text-gray-600 text-sm">
                Recibe feedback personalizado
              </p>
            </div>
          </div>

          <div className="animate-pulse text-blue-600">
            Redirigiendo...
          </div>
        </div>
      </div>
    </div>
  );
}