import jwt from 'jsonwebtoken';
import { Server } from "socket.io";
import { createServer } from "http";
import redisAdapter from '@socket.io/redis-adapter';
import redisClient, { getRedisKey } from '../utils/redis/connection.js';

const PORT = process.env.SOCKET_PORT || 69;
const httpServer = createServer(function (req, res) {
  if (req.url === '/') {
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
const pubClient = redisClient;
const subClient = pubClient.duplicate();

io.adapter(redisAdapter(pubClient, subClient));
httpServer.listen(PORT, () => console.log(`Socket server listening on port ${PORT}`));

io.on('connection', (client) => {
  client.on('AUTH', handleAuth);
  client.on('disconnect', handleDisconnect);

  function handleDisconnect() {
    console.log(`${client.id} >>> ${client.username} disconnected`);
  }

  function handleAuth(token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, user) => {
      let authUser = {
        _id: client.id,
        username: 'guest',
        displayName: 'guest',
      }

      if(user) {
        const userStore = await getRedisKey(`${user._id}_player`);
        if(userStore !== null) {
          authUser = userStore;
          authUser._id = user._id;
        }
      }

      client.id = authUser._id;
      client.username = authUser.username;
      console.log(`${client.id} >>> Connected as ${client.username}`);
      client.emit('JOIN_GAME', authUser);
    });
  }
});

export default io;