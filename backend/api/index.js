import express from 'express';
import { authenticateToken } from '../auth/index.js';

import { Profile } from '../db/models/index.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: '🌈'
  });
});

router.get('/stuff', authenticateToken, (req, res) => {
	return res.json('hey this is your nonexistent stuff!');
});

router.get('/profile/:id', async (req, res) => {
  try {
    const profileData = await Profile.findOne({username: req.params.id});
    return res.json(profileData);
  } catch (err) {
    console.error(err);
    return res.sendStatus(404);
  }
});

export default router;