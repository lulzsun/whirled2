import jwt from 'jsonwebtoken';
import { Server } from "socket.io";
import { createServer } from "http";
import { createClient } from 'redis';
import redisAdapter from '@socket.io/redis-adapter';

const PORT = process.env.SOCKET_PORT || 69;
const httpServer = createServer(function (req, res) {
  if (req.url == '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<html><body><p>Hey! Get outta here!</p></body></html>');
    res.end();
  }
});

const io = new Server(httpServer, {
  cors: {
    origin: [process.env.FRONTEND_URL, "https://whirled.lulzlabz.xyz"],
    methods: ["GET", "POST"]
  }
});
const pubClient = createClient({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(redisAdapter(pubClient, subClient));
httpServer.listen(PORT, () => console.log(`Socket server listening on port ${PORT}`));

io.on('connection', (client) => {
  client.on('auth', handleAuth);

  function handleAuth(token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
      if(err) user = {_id: client.id, username: 'guest'};
      client.id = user._id;
      client.emit('auth', user);
      console.log(`${client.id} >>> Connected as ${user.username}`);
    });
  }
});

export default io;