const { DatabaseService } = require('../shared/database');
const { TokenService } = require('../shared/auth');

module.exports = async (context, req) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = TokenService.verify(token);
  if (!decoded) return context.res = { status:401 };

  const { level } = req.body || {};
  if (!['A1','A2','B1','B2','C1','C2'].includes(level)) return context.res = { status:400 };

  await DatabaseService.updateUserCEFRLevel(decoded.userId, level, 'manual');
  const newToken = TokenService.generate({ ...decoded, cefr: level });

  context.res = { status:200, body:{ token:newToken } };
};