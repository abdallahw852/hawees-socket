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

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

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
    for (let [email, user] of users.entries()) {
      if (user.socketId === socket.id) {
        users.delete(email);
        break;
      }
    }
  });
});

const PORT = 5000;
server.listen(PORT, () => console.log(`Socket server running on port ${PORT}`));
