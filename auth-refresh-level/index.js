const { DatabaseService } = require('../shared/database');
const { TokenService } = require('../shared/auth');

module.exports = async (context, req) => {
  try {
    context.log('Refresh-level called with:', JSON.stringify(req.body));
    
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = TokenService.verify(token);
    if (!decoded) {
      context.log('Token verification failed');
      return context.res = { status:401 };
    }

    const { level, email } = req.body || {};
    if (!['A1','A2','B1','B2','C1','C2'].includes(level)) {
      context.log('Invalid level:', level);
      return context.res = { status:400 };
    }

    // Si es admin y se proporciona email, actualizar el nivel de otro usuario
    if (decoded.role === 'admin' && email) {
      context.log('Admin updating user level:', email, 'to', level);
      
      // Buscar usuario por email y actualizar
      const user = await DatabaseService.getUserByEmail(email);
      if (!user) {
        context.log('User not found:', email);
        return context.res = { status:404, body:{ error: 'Usuario no encontrado' } };
      }
      
      // Actualizar nivel directamente
      await DatabaseService.updateUser(user.id, { 
        cefrLevel: level, 
        germanLevel: level 
      });
      
      context.res = { status:200, body:{ message: 'Nivel actualizado exitosamente' } };
      return;
    }

    // Si es usuario normal, actualizar su propio nivel
    await DatabaseService.updateUserCEFRLevel(decoded.userId, level, 'manual');
    const newToken = TokenService.generate({ ...decoded, cefr: level });

    context.res = { status:200, body:{ token:newToken } };
  } catch (error) {
    context.log.error('Error in refresh-level:', error);
    context.res = { status:500, body:{ error: error.message } };
  }
};