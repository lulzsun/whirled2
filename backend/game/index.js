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
  client.on('JOIN_ROOM', handleJoinRoom);
  client.on('PLAYER_MOVE', handlePlayerMove);
  client.on('disconnect', handleDisconnect);

  function handleDisconnect() {
    try {
      client.to('homeroom').emit('PLAYER_LEAVE', client.user);
      console.log(`${client.id} >>> ${client.user.username} disconnected`);
    } catch (error) {
      console.log(`${client.id} >>> client disconnected`);
    }
  }

  function handleAuth(token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, user) => {
      let createUser = {
        username: `guest_${client.id}`,
        displayName: 'guest',
      }
      let createAvatar = {
        id: 0,
        position: [0, 0, 0]
      }

      if(user) {
        const userStore = await getRedisKey(`${user._id}_player`);
        if(userStore !== null) {
          createUser = userStore;
        }
      }

      client.user = createUser;
      client.avatar = createAvatar;

      // let this client know they successfully connected/authorized
      client.emit('CONNECTED', client.user);
      console.log(`${client.id} >>> Connected as ${client.user.username}`);
    });
  }

  function handleJoinRoom(roomId) {
    if(roomId === undefined) roomId = 'homeroom';
    client.join(roomId);
    client.roomId = roomId;

    const users = Array.from(io.sockets.adapter.rooms.get(roomId)).map(userId => {
      if(io.of("/").sockets.get(userId).user) {
        return {
          username: io.of("/").sockets.get(userId).user.username,
          displayName: io.of("/").sockets.get(userId).user.displayName,
          avatar: io.of("/").sockets.get(userId).avatar,
        };
      }
    });

    // let the newly join player get all of the room information
    client.emit('INIT_ROOM', { users });
    // let other players know this user just joined
    client.to('homeroom').emit('PLAYER_JOIN', {...client.user, avatar: client.avatar});
    console.log(`${client.id} >>> Joined room ${roomId}`);
  }

  function handlePlayerMove(position, direction) {
    // let other players know this user just updated position
    client.avatar.position = position;
    client.to(client.roomId).emit('PLAYER_MOVE', client.user, position, direction);
  }
});

export default io;