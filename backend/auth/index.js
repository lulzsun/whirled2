import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import redis from 'redis';

import { LoginSchema, RegisterSchema, validateSchema } from '../../src/schemas/index.js';
import { User } from '../db/models/index.js';

const redisClient = redis.createClient();
const router = express.Router();

router.get('/', (req, res) => {
    res.json({
      message: '🔒'
    });
});

router.post('/refreshtoken', (req, res) => {
	const refreshToken = req.body.refreshToken;
	if(refreshToken == null) return res.sendStatus(401);
	// verify that this is indeed a valid refresh token
	jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, 
		function (err, user) {
			if(err) return res.sendStatus(403);
			// verify that this refresh token exists in the redis cache
			redisClient.get(user._id+'_'+refreshToken, 
				function(err, _res) {
					if(err) return res.sendStatus(401);
					if(_res === 'true') { // if reply === 'true', that means this refresh token is still valid
						const accessToken = generateAccessToken({ _id: user._id, username: user.username })
						return res.status(201).json({ accessToken });
					}
					return res.status(403).json({ error: 'Please relog into the account' });
				}
			);
		}
	);
});

router.delete('/logout', (req, res) => {
	const refreshToken = req.body.refreshToken;
	if(refreshToken == null) return res.sendStatus(401);
	// verify that this is indeed a valid refresh token
	jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, 
		function(err, user) {
			if(err) return res.sendStatus(403);
			// query all refreshTokens of the user, and delete them
			redisClient.get(user._id+'_'+refreshToken, 
				function(err, _res) {
					if(err) return res.sendStatus(401);
					console.log(user._id+'_'+refreshToken);
					if(_res) { // if these refreshTokens of the user exist, delete them
						if(redisClient.del(user._id+'_'+refreshToken)) return res.sendStatus(204);
					}
					return res.sendStatus(401);
				}
			);
		}
	);
});

router.delete('/logoutall', (req, res) => {
	const refreshToken = req.body.refreshToken;
	if(refreshToken == null) return res.sendStatus(401);
	// verify that this is indeed a valid refresh token
	jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, 
		function(err, user) {
			if(err) return res.sendStatus(403);
			// query all refreshTokens of the user, and delete them
			redisClient.keys(user._id+'_*', 
				function(err, _res) {
					if(err) return res.sendStatus(401);
					if(_res) { // if these refreshTokens of the user exist, delete them
						_res.forEach((key) => {
							if(!redisClient.del(key)) {
								console.error('Issue logging user out of all devices');
								return res.sendStatus(204);
							}
						}); 
						return res.sendStatus(204);
					}
					return res.sendStatus(401);
				}
			);
		}
	);
});

router.post('/login', async (req, res) => {
	const result = validateSchema(LoginSchema, req.body);
	if(result.error)
		res.status(401).json({error: 'Failed to login'});
	else {
		const user = await User.findOne({username: req.body.username});
		if(user) {
			const payload = { _id: user._id, username: user.username };
			const accessToken = generateAccessToken(payload);
			const refreshToken = generateRefreshToken(payload);
			const decoded = jwt.decode(refreshToken);
			redisClient.setex(user._id+'_'+refreshToken, Math.floor(decoded.exp - Date.now() / 1000), 'true', 
				function(err, reply) {
					if(err) {
						console.error(err);
						return res.status(401).json({error: 'Unknown error occured'});  
					}
					console.log(reply);
					return res.status(201).json({accessToken, refreshToken});
				}
			);
		} else {
			return res.status(401).json({error: 'Failed to login'});  
		} 
	}
});

router.post('/signup', async (req, res) => {
	const result = validateSchema(RegisterSchema, req.body);
	if(result.error)
		res.json({error: result.error});
	else {
		const passwordHash = await bcrypt.hash(req.body.password, 12);
		const user = new User({
			username: req.body.username,
			email: req.body.email,
			emailVerified: false,
			password: passwordHash
		})

		const usernameCheck = await User.countDocuments({username: req.body.username});
		if(usernameCheck > 0) {
			return res.json({error: 'This username already exists!'});
		}
		const emailCheck = await User.countDocuments({email: req.body.email});
		if(emailCheck > 0) {
			res.json({error: 'This email already exists!'});
			return;
		}

		try {
			const newUser = await user.save();
			console.log(newUser);
			return res.status(201).json({message: '👍'});
		} catch (err) {
			return res.status(400).json({message: err.message});
		}
	}
})

function generateRefreshToken(payload) {
	//return jwt.sign({ ...payload, jti: uuidv4() }, process.env.REFRESH_TOKEN_SECRET, {expiresIn: '6m'});
	return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {expiresIn: '1y'});
}

function generateAccessToken(payload) {
	return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1m'});
}

export function authenticateToken(req, res, next) {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1];

	if(token == null) return res.sendStatus(403);

	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
		if(err) return res.sendStatus(401);
		req.user = user;
		console.log(req);
		next();
	});
}

export default router;