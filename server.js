const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const net = require("net");
const EC = require("elliptic").ec;
const Blockchain = require("./Blockchain");
const Transaction = require("./Transaction");

const app = express();
const port = process.env.PORT || 3000;
const tcpPort = port + 1;

// Initialize blockchain and EC
const blockchain = new Blockchain();
const ec = new EC("secp256k1");

// Store connected peers and user config
let peers = [];
let userConfig = null;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// TCP Server for P2P communication
const tcpServer = net.createServer((socket) => {
  console.log("New peer connected");

  socket.on("data", (data) => {
    try {
      const message = JSON.parse(data.toString());
      handlePeerMessage(message, socket);
    } catch (error) {
      console.error("Error processing peer message:", error.message);
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error.message);
    removePeer(socket);
  });

  socket.on("end", () => {
    console.log("Peer disconnected");
    removePeer(socket);
  });
});

tcpServer.listen(tcpPort, () => {
  console.log(`TCP Server listening on port ${tcpPort}`);
});

// REST API Endpoints
app.post("/uploadConfig", (req, res) => {
  try {
    const config = req.body;
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

app.post("/transaction", (req, res) => {
  if (!userConfig) {
    return res.status(400).json({ error: "No user config loaded" });
  }

  try {
    const { toAddress, amount } = req.body;
    if (!toAddress || !amount) {
      throw new Error("Missing required fields");
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

app.get("/balance", (req, res) => {
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

app.get("/pending", (req, res) => {
  res.json({ transactions: blockchain.pendingTransactions });
});

app.post("/connect", (req, res) => {
  try {
    const { host, port } = req.body;
    if (!host || !port) {
      throw new Error("Missing host or port");
    }

    connectToPeer(host, port);
    res.json({ message: "Connection request sent" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/peers", (req, res) => {
  res.json({ count: peers.length });
});

// Helper functions
function connectToPeer(host, port) {
  const socket = new net.Socket();

  socket.connect(port, host, () => {
    console.log(`Connected to peer at ${host}:${port}`);
    peers.push(socket);

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
      handlePeerMessage(message, socket);
    } catch (error) {
      console.error("Error processing peer message:", error.message);
    }
  });

  socket.on("error", (error) => {
    console.error(`Error connecting to peer: ${error.message}`);
    removePeer(socket);
  });
}

function removePeer(socket) {
  const index = peers.indexOf(socket);
  if (index > -1) {
    peers.splice(index, 1);
  }
}

function broadcastToPeers(message) {
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
      case "REQUEST_BLOCKCHAIN":
        socket.write(
          JSON.stringify({
            type: "BLOCKCHAIN",
            data: blockchain.chain
          })
        );
        break;

      case "BLOCKCHAIN":
        if (message.data.length > blockchain.chain.length) {
          blockchain.chain = message.data;
        }
        break;

      case "TRANSACTION":
        if (message.data && message.data.isValid()) {
          blockchain.addTransaction(message.data);
        }
        break;

      case "BLOCK":
        const newBlock = message.data;
        if (
          newBlock &&
          blockchain.getLatestBlock().hash === newBlock.previousHash
        ) {
          blockchain.chain.push(newBlock);
        }
        break;
    }
  } catch (error) {
    console.error("Error handling peer message:", error.message);
  }
}

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
