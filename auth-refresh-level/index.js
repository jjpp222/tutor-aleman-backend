const { DatabaseService } = require('../shared/database');
const { TokenService } = require('../shared/auth');

module.exports = async (context, req) => {
  try {
    context.log('🔄 === REFRESH-LEVEL ENDPOINT CALLED ===');
    context.log('🌐 Method:', req.method);
    context.log('🔗 URL:', req.url);
    // Reducir verbosidad - solo headers relevantes
    context.log('📋 Content-Type:', req.headers['content-type']);
    context.log('📋 Authorization:', req.headers.authorization ? 'Present' : 'Missing');
    context.log('📤 Body:', JSON.stringify(req.body));
    
    // Validar token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      context.log('❌ No authorization header found');
      return context.res = { status: 401, body: { error: 'Token requerido' } };
    }
    
    const token = authHeader.substring(7);
    context.log('🔐 Token extracted:', token ? 'Token presente (' + token.substring(0, 10) + '...)' : 'No token');
    
    let decoded;
    try {
      decoded = TokenService.verify(token);
      context.log('✅ Token decoded successfully:', { 
        userId: decoded.userId, 
        role: decoded.role, 
        email: decoded.email 
      });
    } catch (tokenError) {
      context.log('❌ Token verification failed:', tokenError.message);
      return context.res = { status: 401, body: { error: 'Token inválido o expirado' } };
    }

    const { level, email } = req.body || {};
    context.log('📝 Request params - level:', level, 'email:', email);
    context.log('👤 Decoded user role:', decoded.role);
    
    if (!level) {
      context.log.error('❌ Level parameter missing');
      return context.res = { status: 400, body: { error: 'Parámetro level requerido' } };
    }
    
    if (!['A1','A2','B1','B2','C1','C2'].includes(level)) {
      context.log.error('❌ Invalid level:', level);
      return context.res = { status: 400, body: { error: 'Nivel inválido. Debe ser A1, A2, B1, B2, C1 o C2' } };
    }
    
    // Validar email para admin requests
    if (decoded.role === 'admin') {
      if (!email || typeof email !== 'string' || email.trim() === '') {
        context.log.error('❌ Email missing or invalid for admin request');
        return context.res = { status: 400, body: { error: 'Parámetro email requerido para actualización de admin' } };
      }
    }

    // Si es admin y se proporciona email, actualizar el nivel de otro usuario
    if (decoded.role === 'admin' && email) {
      context.log('🔧 Admin updating user level:', email, 'to', level);
      
      try {
        // Buscar usuario por email y actualizar
        const user = await DatabaseService.getUserByEmail(email.trim());
        if (!user) {
          context.log.error('❌ User not found in database:', email);
          return context.res = { status: 404, body: { error: 'Usuario no encontrado' } };
        }
        
        context.log('👤 User found:', {
          id: user.id, 
          email: user.email,
          currentLevel: user.germanLevel || user.cefrLevel,
          newLevel: level
        });
        
        // Actualizar nivel directamente
        await DatabaseService.updateUser(user.id, { 
          cefrLevel: level, 
          germanLevel: level 
        });
        
        context.log('✅ User level updated successfully for user:', user.id);
        return context.res = { 
          status: 200, 
          body: { 
            success: true,
            message: 'Nivel actualizado exitosamente',
            user: {
              email: user.email,
              newLevel: level
            }
          } 
        };
        
      } catch (dbError) {
        context.log.error('💥 Database error during admin update:', dbError.message);
        context.log.error('💥 DB Error stack:', dbError.stack);
        return context.res = { status: 500, body: { error: 'Error en base de datos: ' + dbError.message } };
      }
    }

    // Si es usuario normal, actualizar su propio nivel
    if (!decoded.role || decoded.role !== 'admin') {
      context.log('👤 Regular user updating own level');
      
      if (email && email !== decoded.email) {
        context.log.error('❌ Regular user trying to update another user level');
        return context.res = { status: 403, body: { error: 'No tienes permisos para actualizar el nivel de otro usuario' } };
      }
      
      try {
        await DatabaseService.updateUserCEFRLevel(decoded.userId, level, 'manual');
        const newToken = TokenService.generate({ ...decoded, cefr: level });
        
        context.log('✅ Own level updated successfully');
        return context.res = { status: 200, body: { token: newToken } };
        
      } catch (dbError) {
        context.log.error('💥 Database error during own update:', dbError.message);
        context.log.error('💥 DB Error stack:', dbError.stack);
        return context.res = { status: 500, body: { error: 'Error en base de datos: ' + dbError.message } };
      }
    }

    // Si llegamos aquí, algo no está bien configurado
    context.log.error('❌ Unexpected flow - admin without email or missing role');
    return context.res = { status: 400, body: { error: 'Parámetros inválidos para la operación' } };
    
  } catch (error) {
    context.log.error('💥 Unexpected error in refresh-level:', error);
    context.log.error('💥 Error stack:', error.stack);
    return context.res = { status: 500, body: { error: error.message } };
  }
};