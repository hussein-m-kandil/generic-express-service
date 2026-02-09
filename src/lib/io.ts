import { corsOptions } from '@/lib/config';
import { AuthResponse } from '@/types';
import { Server } from 'socket.io';
import logger from '@/lib/logger';
import db from '@/lib/db';

const io = new Server({ cors: corsOptions, serveClient: false });

io.on('connection', (socket) => {
  const { user } = socket.handshake.auth as Partial<AuthResponse>;

  if (user) {
    void socket.join(user.id)?.catch();
    if (user.profile) {
      socket
        .join(user.profile.id)
        ?.catch((error: unknown) => logger.error('Failed to join a socket room', error));
    }
    db.profile
      .update({ where: { userId: user.id }, data: { lastSeen: new Date() } })
      .then(() => logger.info(`Marked ${user.username} as seen`))
      .catch((error: unknown) => logger.error(`Failed to mark ${user.username} as seen`, error));
  }

  const username = user?.username;
  const { clientsCount } = io.engine;

  logger.info('A socket client is connected', { username, clientsCount });

  socket.on('disconnect', () =>
    logger.info('A socket client is disconnected.', { username, clientsCount }),
  );
});

export { io };

export default io;
