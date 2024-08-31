const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {}; // Store room information

const createWorker = async () => {
    const worker = await mediasoup.createWorker();
    console.log(`Worker PID: ${worker.pid}`);

    worker.on('died', error => {
        console.error('mediasoup worker has died');
        process.exit(1);
    });

    return worker;
};

io.on('connection', socket => {
    console.log(`User connected: ${socket.id}`);

    socket.on('createRoom', async (roomId, callback) => {
        if (rooms[roomId]) {
            callback('Room already exists');
        } else {
            const worker = await createWorker();
            const router = await worker.createRouter({
                mediaCodecs: [
                    { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
                    { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 }
                ]
            });
            rooms[roomId] = { router, peers: {} };
            callback(null, roomId);
        }
    });

    socket.on('joinRoom', async (roomId, callback) => {
        const room = rooms[roomId];
        if (room) {
            const transport = await createWebRtcTransport(room.router);
            room.peers[socket.id] = { transport };

            callback(null, {
                rtpCapabilities: room.router.rtpCapabilities,
                transportParams: {
                    id: transport.id,
                    iceParameters: transport.iceParameters,
                    iceCandidates: transport.iceCandidates,
                    dtlsParameters: transport.dtlsParameters
                }
            });
        } else {
            callback('Room not found');
        }
    });

    socket.on('produce', async ({ roomId, kind, rtpParameters }, callback) => {
        const room = rooms[roomId];
        const { transport } = room.peers[socket.id];
        const producer = await transport.produce({ kind, rtpParameters });
        room.peers[socket.id].producer = producer;
        callback({ id: producer.id });
    });

    socket.on('consume', async ({ roomId, rtpCapabilities }, callback) => {
        const room = rooms[roomId];
        const producer = Object.values(room.peers).find(p => p.producer).producer;
        if (room.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
            const transport = await createWebRtcTransport(room.router);
            const consumer = await transport.consume({ producerId: producer.id, rtpCapabilities });
            callback(null, {
                id: consumer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters
            });
        } else {
            callback('Cannot consume');
        }
    });

    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            if (rooms[roomId].peers[socket.id]) {
                delete rooms[roomId].peers[socket.id];
                if (Object.keys(rooms[roomId].peers).length === 0) {
                    rooms[roomId].router.close();
                    delete rooms[roomId];
                }
                break;
            }
        }
        console.log(`User disconnected: ${socket.id}`);
    });
});

const createWebRtcTransport = async (router) => {
    const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
    });

    transport.on('dtlsstatechange', dtlsState => {
        if (dtlsState === 'closed') {
            transport.close();
        }
    });

    return transport;
};

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
