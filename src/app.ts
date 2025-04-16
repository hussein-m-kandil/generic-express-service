import requestLogger from './middlewares/request-logger';
import errorHandler from './middlewares/error-handler';
import AppError from './lib/app-error';
import express from 'express';
import helmet from 'helmet';

const app = express();

app.disable('x-powered-by');

app.use(helmet());
app.use(express.json());
app.use(requestLogger);

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

app.use((req) => {
  const message = `cannot ${req.method} ${req.originalUrl}`;
  throw new AppError(message, 404, 'UnknownRouteError');
});

app.use(errorHandler);

export default app;
