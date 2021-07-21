import express from 'express';
import { authenticateToken } from '../auth/index.js';

import { Profile, Comment, getModelByString } from '../db/models/index.js';

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
    let profile = await Profile.
      findOne({username: req.params.id}).
      populate({
        path: 'comments',
        populate: {
          path: 'user',
          select: 'username displayName' // do not leak password 🙈 
        }
      }).
      exec();
    let created = profile._id.getTimestamp().toISOString();
    profile = {...profile._doc, created};
    return res.json(profile);
  } catch (err) {
    console.error(err);
    return res.sendStatus(404);
  }
});

router.post('/comment', authenticateToken, async (req, res) => {
  // Create new comment
  const comment = new Comment({
    user: req.user._id,
    parentId: req.body.parentId,
    parentType: req.body.parentType,
    content: req.body.content,
  });
  // Push new comment (reference) to parent's comment array
  const parent = await getModelByString(comment.parentType).findById(comment.parentId);
  await parent.comments.push(comment._id);
  try {
    await comment.save();
    await parent.save();
  } catch (err) {
    console.error(err);
    return res.sendStatus(500);
  }
  return res.status(201).json('ok');
});

export default router;