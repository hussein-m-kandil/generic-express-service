import requestLogger from './middlewares/request-logger';
import errorHandler from './middlewares/error-handler';
import { ALLOWED_ORIGINS } from './lib/config';
import AppError from './lib/app-error';
import apiV1Router from './api/v1';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import logger from './lib/logger';

const app = express();

app.disable('x-powered-by');

app.use(helmet());
app.use(express.json());
app.use(requestLogger);

logger.info('ALLOWED_ORIGINS: ', ALLOWED_ORIGINS);
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  })
);

app.use('/api/v1', apiV1Router);

app.use((req) => {
  const message = `Cannot ${req.method} ${req.originalUrl}`;
  throw new AppError(message, 404, 'UnknownRouteError');
});

app.use(errorHandler);

export default app;
