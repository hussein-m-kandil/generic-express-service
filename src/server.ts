import logger from '@/lib/logger';
import app from '@/app';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, (error) => {
  if (error) logger.error(error);
  logger.info(`The server is running on prot ${PORT}...`);
});
