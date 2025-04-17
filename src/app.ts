import requestLogger from './middlewares/request-logger';
import errorHandler from './middlewares/error-handler';
import AppError from './lib/app-error';
import apiV1Router from './api/v1';
import express from 'express';
import helmet from 'helmet';

const app = express();

app.disable('x-powered-by');

app.use(helmet());
app.use(express.json());
app.use(requestLogger);

app.use('/api/v1', apiV1Router);

app.use((req) => {
  const message = `Cannot ${req.method} ${req.originalUrl}`;
  throw new AppError(message, 404, 'UnknownRouteError');
});

app.use(errorHandler);

export default app;
