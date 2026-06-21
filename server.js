import express from 'express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '10mb' })); 
app.use(cors()); 

// Connect to Upstash Redis
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const jeeQueue = new Queue('jee-processing', { connection });

app.post('/api/solve', async (req, res) => {
  const { imageBase64, subject } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'No image data received' });

  try {
    const job = await jeeQueue.add('solve-problem', { imageBase64, subject });
    return res.status(202).json({ jobId: job.id, status: 'queued' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/status/:id', async (req, res) => {
  const job = await jeeQueue.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Task ticket not found' });
  
  const state = await job.getState(); 
  return res.json({ id: job.id, status: state, result: job.returnvalue || null });
});

app.listen(process.env.PORT || 3000, () => console.log('Gateway online!'));
