import express from 'express';
import { authenticateToken } from '../auth/index.js';

import { Profile, Comment, getModelByString } from '../db/models/index.js';
import { uploadFile } from '../s3/connection.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: '🌈'
  });
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    let profile = await Profile.findOne({username: req.user.username});
    console.log(req.user.username);
    profile.lastOnline = Date.now();
    await profile.save();
    const me = {
      username: profile.username,
      displayName: profile.displayName,
      profilePicture: profile.profilePicture,
      status: profile.status,
      level: profile.level,
      coins: profile.coins,
      bars: profile.bars,
      bling: profile.bling
    }
    return res.json(me);
  } catch (err) {
    console.error(err);
    return res.sendStatus(500);
  }
});

router.get('/stuff', authenticateToken, (req, res) => {
	return res.json('hey this is your nonexistent stuff!');
});

router.get('/profile/:id', async (req, res) => {
  try {
    let profile = await Profile.
      findOne({username: req.params.id.toLowerCase()}).
      populate({
        path: 'comments',
        populate: {
          path: 'user',
          select: 'username displayName profilePicture'
        }
      }).
      exec();

    // we don't want/need to show this to a public get request
    profile = profile.toObject();
    delete profile.coins;
    delete profile.bars;
    delete profile.bling;
    return res.json(profile);
  } catch (err) {
    console.error(err);
    return res.sendStatus(404);
  }
});

router.post('/edit/profile', [authenticateToken, uploadFile('profile/picture', 'profilePicture')], async (req, res) => {
  try {
    const profilePicture = req.file;
    let profile = await Profile.findOne({username: req.user.username});
    if(req.body.information) profile.information = req.body.information;
    if(req.body.displayName) profile.displayName = req.body.displayName;
    if(req.body.status) profile.status = req.body.status;
    if(req.body.banner) profile.banner = req.body.banner;
    if(profilePicture) profile.profilePicture = profilePicture.location;

    await profile.save();
    return res.json({
      status: profile.status,
      displayName: profile.displayName, 
      profilePicture: profile.profilePicture
    });
  } catch (err) {
    console.error(err);
    return res.sendStatus(500);
  }
});

router.post('/comment', authenticateToken, async (req, res) => {
  try {
    let profile = await Profile.findOne({username: req.user.username});
    // Create new comment
    const comment = new Comment({
      user: profile._id,
      parentId: req.body.parentId,
      parentType: req.body.parentType,
      content: req.body.content,
    });
    // Push new comment (reference) to parent's comment array
    const parent = await getModelByString(comment.parentType).findById(comment.parentId);
    await parent.comments.push(comment._id);

    await comment.save();
    await parent.save();
    return res.status(201).json(
      {
        comment, 
        user: { // why? only for local user reference
          username: profile.username, 
          displayName: profile.displayName,
          profilePicture: profile.profilePicture
        }
      }
    );
  } catch (err) {
    console.error(err);
    return res.sendStatus(500);
  }
});

export default router;