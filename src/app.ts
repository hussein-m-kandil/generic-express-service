import express from 'express';
import helmet from 'helmet';

const PORT = Number(process.env.PORT) || 3001;

const app = express();

app.disable('x-powered-by');

app.use(helmet());
app.use(express.json());

app.use((req, res, next) => {
  console.log('---');
  console.log(`${req.method}: ${req.originalUrl}`);
  if (req.body) console.log(req.body);
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'hello' });
});

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
