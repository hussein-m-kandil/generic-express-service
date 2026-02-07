import { app, corsOptions } from '@/app';
import { logger } from '@/lib/logger';
import { createServer } from 'http';
import { Server } from 'socket.io';

export const PORT = Number(process.env.PORT) || 3001;

export const httpServer = createServer(app);

export const io = new Server(httpServer, { cors: corsOptions });

io.on('connection', (socket) => {
  const { clientsCount } = io.engine;
  logger.info('A socket client is connected', { clientsCount });
  socket.on('disconnect', () => logger.info('A socket client is disconnected.', { clientsCount }));
});

httpServer.on('error', (error) => logger.error(error));

httpServer.listen(PORT, () => logger.info(`The server is running on prot ${PORT}...`));

export default httpServer;
