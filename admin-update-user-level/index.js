const { CosmosClient } = require('@azure/cosmos');
const jwt = require('jsonwebtoken');

const cosmosClient = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY,
});

const database = cosmosClient.database(process.env.COSMOS_DATABASE);
const container = database.container('users');

module.exports = async function (context, req) {
    try {
        // Verificar que el usuario es administrador
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            context.res = {
                status: 401,
                body: { message: 'Token requerido' }
            };
            return;
        }

        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        if (decodedToken.role !== 'admin') {
            context.res = {
                status: 403,
                body: { message: 'Acceso denegado: se requiere rol de administrador' }
            };
            return;
        }

        // Validar parámetros
        const { email, germanLevel } = req.body;
        if (!email || !germanLevel) {
            context.res = {
                status: 400,
                body: { message: 'Email y germanLevel son requeridos' }
            };
            return;
        }

        // Validar nivel CEFR
        const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        if (!validLevels.includes(germanLevel)) {
            context.res = {
                status: 400,
                body: { message: 'Nivel inválido. Use: A1, A2, B1, B2, C1, C2' }
            };
            return;
        }

        // Buscar el usuario en la base de datos
        const querySpec = {
            query: "SELECT * FROM c WHERE c.email = @email",
            parameters: [{ name: "@email", value: email }]
        };

        const { resources: users } = await container.items.query(querySpec).fetchAll();
        
        if (users.length === 0) {
            context.res = {
                status: 404,
                body: { message: 'Usuario no encontrado' }
            };
            return;
        }

        const user = users[0];
        
        // Actualizar el nivel del usuario
        user.germanLevel = germanLevel;
        user.updatedAt = new Date().toISOString();
        user.updatedBy = decodedToken.email;

        await container.item(user.id, user.id).replace(user);

        context.res = {
            status: 200,
            body: { 
                message: 'Nivel actualizado exitosamente',
                user: {
                    email: user.email,
                    germanLevel: user.germanLevel,
                    updatedAt: user.updatedAt,
                    updatedBy: user.updatedBy
                }
            }
        };

    } catch (error) {
        context.log.error('Error updating user level:', error);
        context.res = {
            status: 500,
            body: { message: 'Error interno del servidor' }
        };
    }
};