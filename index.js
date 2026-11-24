const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// email => { socketId, type }
let users = new Map();

// The WebRTC demo has its own directory; existing Hawees message events stay available.
const demoUsers = new Map();
const DEMO_ROOM = "webrtc-demo";
const validId = value => typeof value === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(value);
const reply = (ack, result) => { if (typeof ack === "function") ack(result); };
const broadcastUsers = () => io.to(DEMO_ROOM).emit("webrtc:users", Array.from(demoUsers.values(), ({ id, name }) => ({ id, name })));

function validSignal(message) {
  if (!message || typeof message !== "object" || !validId(message.fromId) || !validId(message.toId) || !validId(message.sessionId) || message.fromId === message.toId) return false;
  const data = message.data;
  if (["accept", "decline", "end"].includes(message.type)) return true;
  if (message.type === "invite") return data && ["chat", "video"].includes(data.mode);
  if (["offer", "answer"].includes(message.type)) return data && data.type === message.type && typeof data.sdp === "string" && data.sdp.length <= 64000;
  if (message.type === "ice-candidate") return data && typeof data.candidate === "string" && data.candidate.length <= 2000;
  return false; // Text messages are sent through the WebRTC data channel.
}

function removeDemoUser(socket) {
  const id = socket.data.demoUserId;
  if (id && demoUsers.get(id)?.socketId === socket.id) {
    demoUsers.delete(id);
    broadcastUsers();
  }
  delete socket.data.demoUserId;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("webrtc:join", (user, ack) => {
    if (!user || !validId(user.id) || typeof user.name !== "string" || !user.name.trim() || user.name.trim().length > 40) {
      reply(ack, { ok: false, error: "Enter a name of 1–40 characters." });
      return;
    }
    if (socket.data.demoUserId !== user.id) removeDemoUser(socket);
    socket.data.demoUserId = user.id;
    demoUsers.set(user.id, { id: user.id, name: user.name.trim(), socketId: socket.id });
    socket.join(DEMO_ROOM);
    broadcastUsers();
    reply(ack, { ok: true });
  });

  socket.on("webrtc:signal", (message, ack) => {
    if (!validSignal(message) || socket.data.demoUserId !== message.fromId || demoUsers.get(message.fromId)?.socketId !== socket.id) {
      reply(ack, { ok: false, error: "Invalid connection signal." });
      return;
    }
    const recipient = demoUsers.get(message.toId);
    if (!recipient) {
      reply(ack, { ok: false, error: "This user is offline." });
      return;
    }
    if (message.type === "invite") message.data.name = demoUsers.get(message.fromId).name;
    io.to(recipient.socketId).emit("webrtc:signal", message);
    reply(ack, { ok: true });
  });

  // REGISTER USER
  socket.on("register", ({ email, type }) => {
    if (!email) return;

    users.set(email, {
      socketId: socket.id,
      type: type || "student"
    });

    console.log(`REGISTERED: ${email} -> ${socket.id}`);
  });

  // RECEIVE FULL MESSAGE OBJECT
  socket.on("sendMessage", (msgObj) => {
    if (!msgObj || !msgObj.to || !msgObj.to.email) {
      console.log("Invalid message object");
      return;
    }

    const receiverEmail = msgObj.to.email;
    const receiver = users.get(receiverEmail);

    if (!receiver) {
      console.log("User offline:", receiverEmail);
      return;
    }

    // Deliver full object exactly as received
    io.to(receiver.socketId).emit("receiveMessage", msgObj);

    console.log(`Delivered message from ${msgObj.from.email} to ${receiverEmail}`);
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    removeDemoUser(socket);
    for (let [email, user] of users.entries()) {
      if (user.socketId === socket.id) {
        users.delete(email);
        break;
      }
    }
  });
});

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, "0.0.0.0", () => console.log(`Socket server running on port ${PORT}`));
}

module.exports = { server, io };
