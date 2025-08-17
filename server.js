const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Actions');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const userSocketMap = {};
const roomCodeMap = {};

function getAllConnectedClients(roomId) {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(socketId => ({
    socketId,
    username: userSocketMap[socketId],
  }));
}

io.on('connection', socket => {
  console.log('Socket connected', socket.id);

  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    userSocketMap[socket.id] = username;
    socket.join(roomId);

    const clients = getAllConnectedClients(roomId);

    // Use JOINED to notify clients about the new user joining
    io.to(roomId).emit(ACTIONS.JOINED, {
      username,
      socketId: socket.id,
    });
    
    // Send the updated client list to everyone using SYNC_CLIENTS
    io.to(roomId).emit(ACTIONS.SYNC_CLIENTS, { clients });

    if (roomCodeMap[roomId]) {
      socket.emit(ACTIONS.CODE_CHANGE, { code: roomCodeMap[roomId] });
    }
  });

  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    console.log('receiving', code);
    roomCodeMap[roomId] = code;
    socket.to(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on('disconnecting', () => {
    const username = userSocketMap[socket.id];
    const rooms = [...socket.rooms];

    rooms.forEach(roomId => {
      socket.to(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username,
      });

      // Update the client list for the remaining users
      const clients = getAllConnectedClients(roomId);
      io.to(roomId).emit(ACTIONS.SYNC_CLIENTS, { clients });
    });

    delete userSocketMap[socket.id];
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});