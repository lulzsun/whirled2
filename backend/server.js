import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import auth from './auth/index.js';
import api from './api/index.js';

const app = express();

app.use(express.json());
app.use(morgan('dev', {
  	skip: function (req, res) { 
			// why? because my pfsense firewall keeps flooding with option request
			// and i dont know how to stop it, so this will filter it out
			if(req._remoteAddress === '::ffff:192.168.1.1' && req.url === '/') 
			return true; 
		}
	}
));
app.use(cors( {
		origin: [process.env.FRONTEND_URL, "https://whirled.lulzlabz.xyz"]
	}
));

app.get('/', (req, res) => {
	res.json({
		message: '🦄🌈✨Hello World! 🌈✨🦄'
	});
});

app.use('/auth', auth);
app.use('/api', api);

function notFound(req, res, next) {
	res.status(404);
	const error = 'Not Found - ' + req.originalUrl;
	next(error);
}

function errorHandler(err, req, res, next) {
	res.status(res.statusCode || 500);
	res.json({
		message: err.message,
		stack: err.stack
	});
}

app.use(notFound);
app.use(errorHandler);

const port = process.env.API_PORT;
app.listen(port, () => {
	console.log('Listening on port', port);
});