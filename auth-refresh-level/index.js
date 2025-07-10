const { DatabaseService } = require('../shared/database');
const { TokenService } = require('../shared/auth');

module.exports = async (context, req) => {
  try {
    context.log('Refresh-level called');
    context.log('Headers:', JSON.stringify(req.headers));
    context.log('Body:', JSON.stringify(req.body));
    
    // Validar token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      context.log('No authorization header');
      return context.res = { status: 401, body: { error: 'Token requerido' } };
    }
    
    const token = authHeader.substring(7);
    context.log('Token extracted:', token ? 'Token present' : 'No token');
    
    let decoded;
    try {
      decoded = TokenService.verify(token);
      context.log('Token decoded successfully:', { userId: decoded.userId, role: decoded.role });
    } catch (tokenError) {
      context.log('Token verification failed:', tokenError.message);
      return context.res = { status: 401, body: { error: 'Token inválido o expirado' } };
    }

    const { level, email } = req.body || {};
    context.log('Request params - level:', level, 'email:', email);
    
    if (!['A1','A2','B1','B2','C1','C2'].includes(level)) {
      context.log('Invalid level:', level);
      return context.res = { status: 400, body: { error: 'Nivel inválido' } };
    }

    // Si es admin y se proporciona email, actualizar el nivel de otro usuario
    if (decoded.role === 'admin' && email) {
      context.log('Admin updating user level:', email, 'to', level);
      
      // Buscar usuario por email y actualizar
      const user = await DatabaseService.getUserByEmail(email);
      if (!user) {
        context.log('User not found:', email);
        return context.res = { status: 404, body: { error: 'Usuario no encontrado' } };
      }
      
      context.log('User found:', user.id, 'current level:', user.germanLevel);
      
      // Actualizar nivel directamente
      await DatabaseService.updateUser(user.id, { 
        cefrLevel: level, 
        germanLevel: level 
      });
      
      context.log('User level updated successfully');
      return context.res = { status: 200, body: { message: 'Nivel actualizado exitosamente' } };
    }

    // Si es usuario normal, actualizar su propio nivel
    context.log('User updating own level');
    await DatabaseService.updateUserCEFRLevel(decoded.userId, level, 'manual');
    const newToken = TokenService.generate({ ...decoded, cefr: level });

    return context.res = { status: 200, body: { token: newToken } };
    
  } catch (error) {
    context.log.error('Error in refresh-level:', error);
    return context.res = { status: 500, body: { error: error.message } };
  }
};