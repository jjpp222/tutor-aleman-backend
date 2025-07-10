const { DatabaseService } = require('../shared/database');
const { TokenService } = require('../shared/auth');

module.exports = async (context, req) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = TokenService.verify(token);
  if (!decoded) return context.res = { status:401 };

  const { level, email } = req.body || {};
  if (!['A1','A2','B1','B2','C1','C2'].includes(level)) return context.res = { status:400 };

  // Si es admin y se proporciona email, actualizar el nivel de otro usuario
  if (decoded.role === 'admin' && email) {
    await DatabaseService.updateUserCEFRLevelByEmail(email, level, 'admin_update');
    context.res = { status:200, body:{ message: 'Nivel actualizado exitosamente' } };
    return;
  }

  // Si es usuario normal, actualizar su propio nivel
  await DatabaseService.updateUserCEFRLevel(decoded.userId, level, 'manual');
  const newToken = TokenService.generate({ ...decoded, cefr: level });

  context.res = { status:200, body:{ token:newToken } };
};