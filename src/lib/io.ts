import { corsOptions } from '@/lib/config';
import { AuthResponse } from '@/types';
import { Server } from 'socket.io';
import logger from '@/lib/logger';
import db from '@/lib/db';

const io = new Server({ cors: corsOptions, serveClient: false });

io.on('connection', (socket) => {
  const { user } = socket.handshake.auth as Partial<AuthResponse>;
  const { username, profile } = user ?? { username: 'Anonymous', profile: null };

  if (profile) {
    const { id } = profile;

    socket.broadcast.emit(`online:${id}`);
    socket.on('disconnecting', () => socket.broadcast.emit(`offline:${id}`));

    socket
      .join(id)
      ?.catch((error: unknown) => logger.error(`Failed to join ${username} in ${id} room`, error));

    db.profile
      .update({ where: { id }, data: { lastSeen: new Date() } })
      .then(() => logger.info(`Marked ${username} as seen`))
      .catch((error: unknown) => logger.error(`Failed to mark ${username} as seen`, error));
  }

  const { clientsCount } = io.engine;

  logger.info('A socket client is connected', { username, clientsCount });

  socket.on('disconnect', () => {
    logger.info('A socket client is disconnected.', { username, clientsCount });
  });
});

export { io };

export default io;
