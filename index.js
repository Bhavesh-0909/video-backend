const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mediasoup = require('mediasoup'); // or pion/webrtc

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Mediasoup worker and router
let worker;
let router;

// Initialize Mediasoup
async function initMediasoup() {
  worker = await mediasoup.Worker.create();
  router = await worker.createRouter({
      rtpCapabilities: { supportedCodecs: [{ mimeType: 'audio/opus' }, { mimeType: 'video/VP8' }] },
  });
}

// Socket.IO events
io.on('connection', (socket) => {
    console.log('User connected');
    console.log("socket id :", socket.id)


    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
  // Handle user connection, room creation, joining, leaving
  // Manage offer/answer negotiation and ICE candidate exchange
  // Forward media streams using router
});

// Server listening
server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
