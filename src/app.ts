import * as API from '@/api';
import * as Middlewares from '@/middlewares';
import { default as cors, CorsOptions } from 'cors';
import { ALLOWED_ORIGINS } from '@/lib/config';
import { AppBaseError } from '@/lib/app-error';
import cookieParser from 'cookie-parser';
import logger from '@/lib/logger';
import express from 'express';
import helmet from 'helmet';

export const corsOptions: CorsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true, // Enable cookies and credentials
  optionsSuccessStatus: 200, // Align more than 204 with legacy browsers
};

export const app = express();

app.disable('x-powered-by');

app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(Middlewares.requestLogger);
app.use(Middlewares.visitorsRegistrar);
app.use(Middlewares.creationRegistrar);
app.use(Middlewares.createNonAdminDataPurger());

logger.info('ALLOWED_ORIGINS: ', ALLOWED_ORIGINS);
app.use(cors(corsOptions));

app.use('/api/v1', API.V1.apiRouter);

app.use((req) => {
  const message = `Cannot ${req.method} ${req.originalUrl}`;
  throw new AppBaseError(message, 404, 'UnknownRouteError');
});

app.use(Middlewares.errorHandler);

export default app;
