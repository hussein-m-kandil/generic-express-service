import logger from './lib/logger';
import app from './app';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => logger.info(`The server is running on prot ${PORT}...`));
