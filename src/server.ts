import { logger } from '@/lib/logger';
import { createServer } from 'http';
import io from '@/lib/io';
import app from '@/app';

export const PORT = Number(process.env.PORT) || 3001;

const httpServer = createServer(app);

io.attach(httpServer);

httpServer.on('error', (error) => logger.error(error));

httpServer.listen(PORT, () => logger.info(`The server is running on prot ${PORT}...`));

export default httpServer;
