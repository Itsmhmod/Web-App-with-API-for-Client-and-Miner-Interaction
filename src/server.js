const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const net = require("net");
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");

const Blockchain = require("./Blockchain");
const Transaction = require("./Transaction");

const app = express();
const blockchain = new Blockchain();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// Global variables
let userConfig = null;
const peers = new Set();
const tcpServer = net.createServer();

// TCP Server setup
tcpServer.on("connection", (socket) => {
  console.log("New peer connected:", socket.remoteAddress);

  socket.on("data", (data) => {
    try {
      const message = JSON.parse(data.toString());
      handlePeerMessage(message, socket);
    } catch (error) {
      console.error("Error processing peer message:", error);
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
    peers.delete(socket);
  });

  socket.on("close", () => {
    console.log("Peer disconnected:", socket.remoteAddress);
    peers.delete(socket);
  });

  peers.add(socket);
});

// REST API endpoints
app.post("/uploadConfig", (req, res) => {
  try {
    const { publicKey, privateKey, port } = req.body;

    if (!publicKey || !privateKey || !port) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid configuration" });
    }

    // Validate public key format
    try {
      ec.keyFromPublic(publicKey, "hex");
    } catch (error) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid public key format" });
    }

    userConfig = { publicKey, privateKey, port };
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/transaction", (req, res) => {
  try {
    if (!userConfig) {
      return res
        .status(400)
        .json({ success: false, message: "Configuration not loaded" });
    }

    const { to, amount } = req.body;

    if (!to || !amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid transaction parameters" });
    }

    const transaction = new Transaction(userConfig.publicKey, to, amount);
    const signingKey = ec.keyFromPrivate(userConfig.privateKey);
    transaction.signTransaction(signingKey);

    blockchain.addTransaction(transaction);
    broadcastToPeers({ type: "NEW_TRANSACTION", data: transaction });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/mine", (req, res) => {
  try {
    if (!userConfig) {
      return res
        .status(400)
        .json({ success: false, message: "Configuration not loaded" });
    }

    blockchain.minePendingTransactions(userConfig.publicKey);
    const latestBlock = blockchain.getLatestBlock();
    broadcastToPeers({ type: "NEW_BLOCK", data: latestBlock });

    res.json({ success: true, block: latestBlock });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/balance", (req, res) => {
  try {
    if (!userConfig) {
      return res
        .status(400)
        .json({ success: false, message: "Configuration not loaded" });
    }

    const balance = blockchain.getBalanceOfAddress(userConfig.publicKey);
    res.json({ success: true, balance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/pending", (req, res) => {
  res.json(blockchain.pendingTransactions);
});

app.get("/status", (req, res) => {
  res.json({
    peers: peers.size,
    height: blockchain.chain.length,
    pendingTransactions: blockchain.pendingTransactions.length
  });
});

app.post("/connect", (req, res) => {
  try {
    const { host, port } = req.body;

    if (!host || !port) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid host or port" });
    }

    const socket = new net.Socket();

    socket.connect(port, host, () => {
      console.log("Connected to peer:", host, port);
      peers.add(socket);
      res.json({ success: true });
    });

    socket.on("error", (error) => {
      console.error("Connection error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to connect to peer" });
    });

    socket.on("data", (data) => {
      try {
        const message = JSON.parse(data.toString());
        handlePeerMessage(message, socket);
      } catch (error) {
        console.error("Error processing peer message:", error);
      }
    });

    socket.on("close", () => {
      console.log("Peer disconnected:", host, port);
      peers.delete(socket);
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add new endpoint for blockchain synchronization
app.get("/sync", (req, res) => {
  try {
    if (!userConfig) {
      return res
        .status(400)
        .json({ success: false, message: "Configuration not loaded" });
    }

    console.log("Starting blockchain synchronization...");
    console.log("Current chain length:", blockchain.chain.length);

    // Request blockchain from all peers
    peers.forEach((peer) => {
      console.log("Requesting chain from peer:", peer.remoteAddress);
      peer.write(
        JSON.stringify({
          type: "REQUEST_CHAIN"
        })
      );
    });

    // Also request pending transactions
    peers.forEach((peer) => {
      console.log(
        "Requesting pending transactions from peer:",
        peer.remoteAddress
      );
      peer.write(
        JSON.stringify({
          type: "REQUEST_PENDING"
        })
      );
    });

    // Broadcast current chain to all peers
    peers.forEach((peer) => {
      console.log("Broadcasting current chain to peer:", peer.remoteAddress);
      peer.write(
        JSON.stringify({
          type: "CHAIN_RESPONSE",
          data: blockchain.chain
        })
      );
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error during sync:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper functions
function handlePeerMessage(message, socket) {
  console.log("Received message from peer:", message.type);

  switch (message.type) {
    case "NEW_TRANSACTION":
      console.log("Processing new transaction from peer");
      try {
        blockchain.addTransaction(message.data);
        console.log("Transaction added successfully");
        // Broadcast to other peers
        broadcastToPeers(message, socket);
      } catch (error) {
        console.error("Error adding transaction:", error.message);
      }
      break;

    case "NEW_BLOCK":
      console.log("Processing new block from peer");
      try {
        if (blockchain.replaceChain([...blockchain.chain, message.data])) {
          console.log("Chain replaced with new block");
          // Broadcast to other peers
          broadcastToPeers(message, socket);
        } else {
          console.log("Chain not replaced - not longer than current chain");
        }
      } catch (error) {
        console.error("Error processing new block:", error.message);
      }
      break;

    case "REQUEST_CHAIN":
      console.log("Sending chain to peer");
      try {
        socket.write(
          JSON.stringify({
            type: "CHAIN_RESPONSE",
            data: blockchain.chain
          })
        );
      } catch (error) {
        console.error("Error sending chain:", error.message);
      }
      break;

    case "CHAIN_RESPONSE":
      console.log("Received chain from peer, length:", message.data.length);
      try {
        if (blockchain.replaceChain(message.data)) {
          console.log("Chain replaced with peer's chain");
          // Broadcast to other peers
          broadcastToPeers(message, socket);
        } else {
          console.log("Chain not replaced - not longer than current chain");
        }
      } catch (error) {
        console.error("Error processing chain response:", error.message);
      }
      break;

    case "REQUEST_PENDING":
      console.log("Sending pending transactions to peer");
      try {
        socket.write(
          JSON.stringify({
            type: "PENDING_RESPONSE",
            data: blockchain.pendingTransactions
          })
        );
      } catch (error) {
        console.error("Error sending pending transactions:", error.message);
      }
      break;

    case "PENDING_RESPONSE":
      console.log(
        "Received pending transactions from peer:",
        message.data.length
      );
      try {
        message.data.forEach((tx) => {
          console.log("Adding pending transaction from peer");
          blockchain.addTransaction(tx);
        });
      } catch (error) {
        console.error("Error processing pending transactions:", error.message);
      }
      break;
  }
}

function broadcastToPeers(message, excludeSocket = null) {
  peers.forEach((peer) => {
    if (peer !== excludeSocket) {
      try {
        peer.write(JSON.stringify(message));
      } catch (error) {
        console.error("Error broadcasting to peer:", error);
        peers.delete(peer);
      }
    }
  });
}

// Start servers
const PORT = process.env.PORT || 3000;
const TCP_PORT = process.env.TCP_PORT || parseInt(PORT) + 1;

function startServer(port, isTcp = false) {
  const server = isTcp ? net.createServer() : app;

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" || error.code === "EACCES") {
      console.log(`Port ${port} is in use, trying ${port + 1}`);
      startServer(port + 1, isTcp);
    } else {
      console.error("Server error:", error);
    }
  });

  if (isTcp) {
    server.listen(TCP_PORT, () => {
      console.log(`TCP server running on port ${TCP_PORT}`);
    });
  } else {
    server.listen(PORT, () => {
      console.log(`HTTP server running on port ${PORT}`);
    });
  }
}

startServer(PORT);
startServer(TCP_PORT, true);
