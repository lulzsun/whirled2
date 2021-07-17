import express from 'express';
import { authenticateToken } from '../auth/index.js';
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: '🌈'
  });
});

// test code, remove later
router.get('/posts', authenticateToken, (req, res) => {
	return res.json(req.user);
});

export default router;