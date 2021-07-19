import express from 'express';
import { authenticateToken } from '../auth/index.js';
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: '🌈'
  });
});

router.get('/stuff', authenticateToken, (req, res) => {
	return res.json('hey this is your nonexistent stuff!');
});

export default router;