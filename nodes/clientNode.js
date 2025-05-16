const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const net = require("net");
const fs = require("fs");
const path = require("path");
const Blockchain = require("../core/Blockchain");
const Transaction = require("../core/Transaction");
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../client")));

// Initialize blockchain
const blockchain = new Blockchain();
let peers = [];
let userConfig = null;

// TCP Server for P2P communication
const tcpServer = net.createServer((socket) => {
  const peerAddress = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`New peer connected from ${peerAddress}`);

  // Send initial handshake
  socket.write(
    JSON.stringify({
      type: "HANDSHAKE",
      data: {
        publicKey: userConfig?.publicKey,
        port: port
      }
    })
  );

  socket.on("data", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`Received message from ${peerAddress}:`, message.type);
      handlePeerMessage(message, socket);
    } catch (error) {
      console.error(
        `Error processing message from ${peerAddress}:`,
        error.message
      );
    }
  });

  socket.on("error", (error) => {
    console.error(`Socket error from ${peerAddress}:`, error.message);
    removePeer(socket);
  });

  socket.on("end", () => {
    console.log(`Peer disconnected: ${peerAddress}`);
    removePeer(socket);
  });
});

tcpServer.on("error", (error) => {
  console.error("TCP Server error:", error.message);
});

tcpServer.listen(port + 1, () => {
  console.log(`TCP Server listening on port ${port + 1}`);
});

// API Endpoints
app.post("/config", (req, res) => {
  try {
    const config = req.body;

    // Validate config structure
    if (!config.publicKey || !config.privateKey || !config.port) {
      throw new Error("Invalid config format");
    }

    // Validate public key
    try {
      ec.keyFromPublic(config.publicKey, "hex");
    } catch (error) {
      throw new Error("Invalid public key format");
    }

    userConfig = config;
    res.json({ message: "Config loaded successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/balances", (req, res) => {
  if (!userConfig) {
    return res.status(400).json({ error: "No user config loaded" });
  }
  try {
    const balance = blockchain.getBalanceOfAddress(userConfig.publicKey);
    res.json({ balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/transaction", (req, res) => {
  if (!userConfig) {
    return res.status(400).json({ error: "No user config loaded" });
  }

  try {
    const { toAddress, amount } = req.body;

    // Validate input
    if (!toAddress || !amount) {
      throw new Error("Missing required fields");
    }

    if (typeof amount !== "number" || amount <= 0) {
      throw new Error("Invalid amount");
    }

    // Validate recipient's public key
    try {
      ec.keyFromPublic(toAddress, "hex");
    } catch (error) {
      throw new Error("Invalid recipient public key");
    }

    // Check if sender has enough balance
    const balance = blockchain.getBalanceOfAddress(userConfig.publicKey);
    if (balance < amount) {
      throw new Error("Insufficient balance");
    }

    const transaction = new Transaction(
      userConfig.publicKey,
      toAddress,
      amount
    );

    const key = ec.keyFromPrivate(userConfig.privateKey);
    transaction.signTransaction(key);

    blockchain.addTransaction(transaction);

    // Broadcast transaction to peers
    broadcastToPeers({
      type: "TRANSACTION",
      data: transaction
    });

    res.json({ message: "Transaction added to pending transactions" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/mine", (req, res) => {
  if (!userConfig) {
    return res.status(400).json({ error: "No user config loaded" });
  }

  try {
    blockchain.minePendingTransactions(userConfig.publicKey);

    // Broadcast new block to peers
    broadcastToPeers({
      type: "BLOCK",
      data: blockchain.getLatestBlock()
    });

    res.json({ message: "New block mined successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/connect", (req, res) => {
  try {
    const { host, port } = req.body;

    // Validate input
    if (!host || !port) {
      throw new Error("Missing host or port");
    }

    if (typeof port !== "number" || port < 1 || port > 65535) {
      throw new Error("Invalid port number");
    }

    connectToPeer(host, port);
    res.json({ message: "Connection request sent" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Add new sync endpoint
app.get("/sync", (req, res) => {
  if (!userConfig) {
    return res.status(400).json({ error: "No user config loaded" });
  }

  try {
    // Request blockchain from all peers
    peers.forEach((peer) => {
      peer.write(
        JSON.stringify({
          type: "REQUEST_BLOCKCHAIN"
        })
      );
    });

    res.json({ message: "Blockchain sync requested" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new status endpoint
app.get("/status", (req, res) => {
  if (!userConfig) {
    return res.status(400).json({ error: "No user config loaded" });
  }

  try {
    res.json({
      peerCount: peers.length,
      blockchainHeight: blockchain.chain.length,
      pendingTransactions: blockchain.pendingTransactions.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function connectToPeer(host, port) {
  const socket = new net.Socket();
  const peerAddress = `${host}:${port}`;

  console.log(`Attempting to connect to peer at ${peerAddress}`);

  socket.connect(port, host, () => {
    console.log(`Connected to peer at ${peerAddress}`);
    peers.push(socket);

    // Send handshake
    socket.write(
      JSON.stringify({
        type: "HANDSHAKE",
        data: {
          publicKey: userConfig?.publicKey,
          port: port
        }
      })
    );

    // Request blockchain
    socket.write(
      JSON.stringify({
        type: "REQUEST_BLOCKCHAIN"
      })
    );
  });

  socket.on("data", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`Received message from ${peerAddress}:`, message.type);
      handlePeerMessage(message, socket);
    } catch (error) {
      console.error(
        `Error processing message from ${peerAddress}:`,
        error.message
      );
    }
  });

  socket.on("error", (error) => {
    console.error(`Error connecting to peer ${peerAddress}:`, error.message);
    removePeer(socket);
  });

  socket.on("end", () => {
    console.log(`Connection to peer ended: ${peerAddress}`);
    removePeer(socket);
  });
}

function broadcastToPeers(message) {
  console.log(`Broadcasting ${message.type} to ${peers.length} peers`);
  peers.forEach((peer) => {
    try {
      peer.write(JSON.stringify(message));
    } catch (error) {
      console.error("Error broadcasting to peer:", error.message);
      removePeer(peer);
    }
  });
}

function handlePeerMessage(message, socket) {
  try {
    switch (message.type) {
      case "HANDSHAKE":
        console.log("Received handshake from peer");
        // Send our blockchain if we have more blocks
        if (blockchain.chain.length > 0) {
          socket.write(
            JSON.stringify({
              type: "BLOCKCHAIN",
              data: blockchain.chain
            })
          );
        }
        break;

      case "REQUEST_BLOCKCHAIN":
        console.log("Sending blockchain to peer");
        socket.write(
          JSON.stringify({
            type: "BLOCKCHAIN",
            data: blockchain.chain
          })
        );
        break;

      case "BLOCKCHAIN":
        console.log("Received blockchain from peer");
        if (message.data && Array.isArray(message.data)) {
          const receivedChain = message.data;
          if (receivedChain.length > blockchain.chain.length) {
            console.log("Replacing chain with longer chain");
            blockchain.replaceChain(receivedChain);
            broadcastToPeers({
              type: "BLOCKCHAIN_UPDATED",
              data: blockchain.chain
            });
          }
        }
        break;

      case "TRANSACTION":
        console.log("Received transaction from peer");
        if (message.data && message.data.isValid()) {
          const tx = Transaction.fromJSON(message.data);
          if (!blockchain.pendingTransactions.some((t) => t.id === tx.id)) {
            blockchain.addTransaction(tx);
            broadcastToPeers({
              type: "TRANSACTION",
              data: tx
            });
          }
        }
        break;

      case "BLOCK":
        console.log("Received block from peer");
        const newBlock = message.data;
        if (newBlock && blockchain.isValidBlock(newBlock)) {
          if (blockchain.getLatestBlock().hash === newBlock.previousHash) {
            console.log("Adding new block to chain");
            blockchain.chain.push(newBlock);
            broadcastToPeers({
              type: "BLOCK",
              data: newBlock
            });
          } else if (newBlock.index > blockchain.chain.length) {
            console.log("Requesting full blockchain due to block gap");
            socket.write(
              JSON.stringify({
                type: "REQUEST_BLOCKCHAIN"
              })
            );
          }
        }
        break;

      case "PEER_COUNT":
        console.log(`Updated peer count: ${message.count}`);
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  } catch (error) {
    console.error("Error handling peer message:", error.message);
  }
}

// Helper function to remove peer
function removePeer(socket) {
  const index = peers.indexOf(socket);
  if (index > -1) {
    peers.splice(index, 1);
    broadcastToPeers({
      type: "PEER_COUNT",
      count: peers.length
    });
  }
}

// Start the server
app.listen(port, () => {
  console.log(`Client node running on port ${port}`);
});
