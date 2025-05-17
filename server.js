const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const net = require("net");
const EC = require("elliptic").ec;
const Blockchain = require("./Blockchain");
const Transaction = require("./Transaction");
const Block = require("./Block");

const app = express();
const port = process.env.PORT || 3000;
const tcpPort = Number(port) + 1;

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
  peers.push(socket);
  console.log("Peer added. Current peers count:", peers.length);

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
    console.log("Peer removed. Current peers count:", peers.length);
  });

  socket.on("end", () => {
    console.log("Peer disconnected");
    removePeer(socket);
    console.log("Peer removed. Current peers count:", peers.length);
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
    const { to, amount } = req.body;
    if (!to || !amount) {
      throw new Error("Missing required fields");
    }
    // Validate recipient address
    if (typeof to !== "string" || to.length !== 130 || !to.startsWith("04")) {
      return res.status(400).json({ error: "Invalid recipient address" });
    }

    // Check if sender has enough balance
    const balance = blockchain.getBalanceOfAddress(userConfig.publicKey);
    if (balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const transaction = new Transaction(userConfig.publicKey, to, amount);
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

    const socket = new net.Socket();
    let responded = false;
    socket.connect(port, host, () => {
      peers.push(socket);
      if (!responded) {
        responded = true;
        res.json({ message: "Connection successful" });
      }
      // لا تغلق الاتصال هنا، بل أضفه لمصفوفة peers
    });

    socket.on("error", (error) => {
      if (!responded) {
        responded = true;
        res
          .status(400)
          .json({ error: "Failed to connect to peer: " + error.message });
      }
      socket.destroy();
    });

    // في حال لم يتم الاتصال خلال 3 ثواني
    setTimeout(() => {
      if (!responded) {
        responded = true;
        res.status(400).json({ error: "Connection timeout" });
        socket.destroy();
      }
    }, 3000);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/peers", (req, res) => {
  res.json({ count: peers.length });
});

app.get("/sync", (req, res) => {
  try {
    if (peers.length === 0) {
      return res.status(400).json({ error: "No peers connected" });
    }

    // Request blockchain from all peers
    peers.forEach((peer) => {
      peer.write(
        JSON.stringify({
          type: "REQUEST_BLOCKCHAIN"
        }) + "\n"
      );
    });

    // Also request pending transactions
    peers.forEach((peer) => {
      peer.write(
        JSON.stringify({
          type: "REQUEST_PENDING_TRANSACTIONS"
        }) + "\n"
      );
    });

    res.json({ message: "Sync request sent" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function connectToPeer(host, port) {
  console.log(`Attempting to connect to peer at ${host}:${port}`);
  const socket = new net.Socket();

  socket.connect(port, host, () => {
    console.log(`Successfully connected to peer at ${host}:${port}`);
    peers.push(socket);
    console.log("Peer added. Current peers count:", peers.length);

    // Request blockchain immediately after connection
    console.log("Requesting blockchain from peer...");
    socket.write(
      JSON.stringify({
        type: "REQUEST_BLOCKCHAIN"
      }) + "\n"
    );
  });

  let buffer = "";
  socket.on("data", (data) => {
    try {
      buffer += data.toString();
      let boundary = buffer.indexOf("\n");
      while (boundary !== -1) {
        const message = buffer.substring(0, boundary);
        buffer = buffer.substring(boundary + 1);

        const parsedMessage = JSON.parse(message);
        console.log("Received message from peer:", parsedMessage.type);
        handlePeerMessage(parsedMessage, socket);

        boundary = buffer.indexOf("\n");
      }
    } catch (error) {
      console.error("Error processing peer message:", error.message);
    }
  });

  socket.on("error", (error) => {
    console.error(`Error connecting to peer: ${error.message}`);
    removePeer(socket);
  });

  socket.on("end", () => {
    console.log("Peer connection ended");
    removePeer(socket);
  });
}

function removePeer(socket) {
  const index = peers.indexOf(socket);
  if (index > -1) {
    console.log("Removing peer from list");
    peers.splice(index, 1);
    socket.destroy();
    console.log("Current peers count:", peers.length);
  }
}

function broadcastToPeers(message) {
  console.log("Broadcasting message to peers:", message.type);
  if (peers.length === 0) {
    console.log("No peers to broadcast to");
    return;
  }

  const messageStr = JSON.stringify(message) + "\n";
  peers.forEach((peer) => {
    try {
      peer.write(messageStr);
      console.log("Message broadcasted successfully to peer");
    } catch (error) {
      console.error("Error broadcasting to peer:", error.message);
      removePeer(peer);
    }
  });
}

function handlePeerMessage(message, socket) {
  try {
    console.log("Processing message type:", message.type);

    switch (message.type) {
      case "REQUEST_BLOCKCHAIN":
        console.log("Received blockchain request from peer");
        const blockchainData = {
          type: "BLOCKCHAIN",
          data: blockchain.chain
        };
        socket.write(JSON.stringify(blockchainData) + "\n");
        break;

      case "BLOCKCHAIN":
        console.log("Received blockchain from peer");
        if (message.data && message.data.length > 0) {
          let isValidChain = true;
          for (let i = 1; i < message.data.length; i++) {
            const currentBlock = message.data[i];
            const previousBlock = message.data[i - 1];
            if (currentBlock.previousHash !== previousBlock.hash) {
              isValidChain = false;
              break;
            }
          }
          if (isValidChain && message.data.length > blockchain.chain.length) {
            console.log("Updating blockchain with peer's chain");
            // تحويل كل بلوك إلى كائن Block حقيقي
            blockchain.chain = message.data.map((blockObj) => {
              const block = new Block(
                blockObj.timestamp,
                [],
                blockObj.previousHash
              );
              block.hash = blockObj.hash;
              block.nonce = blockObj.nonce;
              block.transactions = blockObj.transactions.map((txObj) => {
                const tx = new Transaction(
                  txObj.fromAddress,
                  txObj.toAddress,
                  txObj.amount
                );
                tx.timestamp = txObj.timestamp;
                tx.signature = txObj.signature;
                return tx;
              });
              return block;
            });
            blockchain.pendingTransactions =
              blockchain.pendingTransactions.filter((tx) => {
                return !blockchain.chain.some((block) =>
                  block.transactions.some(
                    (blockTx) => blockTx.signature === tx.signature
                  )
                );
              });
            console.log("Blockchain updated successfully");
          } else {
            console.log("Chain validation failed or no update needed");
          }
        }
        break;

      case "REQUEST_PENDING_TRANSACTIONS":
        console.log("Received pending transactions request from peer");
        const pendingData = {
          type: "PENDING_TRANSACTIONS",
          data: blockchain.pendingTransactions
        };
        socket.write(JSON.stringify(pendingData) + "\n");
        break;

      case "PENDING_TRANSACTIONS":
        console.log("Received pending transactions from peer");
        if (message.data && Array.isArray(message.data)) {
          // تحويل كل معاملة إلى كائن Transaction حقيقي
          const newPending = message.data.map((txObj) => {
            const tx = new Transaction(
              txObj.fromAddress,
              txObj.toAddress,
              txObj.amount
            );
            tx.timestamp = txObj.timestamp;
            tx.signature = txObj.signature;
            return tx;
          });
          newPending.forEach((transaction) => {
            const existsInChain = blockchain.chain.some((block) =>
              block.transactions.some(
                (tx) => tx.signature === transaction.signature
              )
            );
            const existsInPending = blockchain.pendingTransactions.some(
              (tx) => tx.signature === transaction.signature
            );
            if (!existsInChain && !existsInPending && transaction.isValid()) {
              blockchain.pendingTransactions.push(transaction);
            }
          });
        }
        break;

      case "TRANSACTION":
        console.log("Received transaction from peer");
        try {
          // تحويل المعاملة إلى كائن Transaction
          const transactionData = message.data;
          const transaction = new Transaction(
            transactionData.fromAddress,
            transactionData.toAddress,
            transactionData.amount
          );
          transaction.timestamp = transactionData.timestamp;
          transaction.signature = transactionData.signature;

          if (transaction.isValid()) {
            // تحقق من أن المعاملة غير موجودة في السلسلة أو المعاملات المعلقة
            const existsInChain = blockchain.chain.some((block) =>
              block.transactions.some(
                (tx) => tx.signature === transaction.signature
              )
            );
            const existsInPending = blockchain.pendingTransactions.some(
              (tx) => tx.signature === transaction.signature
            );

            if (!existsInChain && !existsInPending) {
              console.log("Adding transaction to pending transactions");
              blockchain.addTransaction(transaction);
            }
          }
        } catch (error) {
          console.error("Error processing transaction:", error.message);
        }
        break;

      case "BLOCK":
        console.log("Received block from peer");
        try {
          const newBlock = message.data;
          if (
            newBlock &&
            blockchain.getLatestBlock().hash === newBlock.previousHash
          ) {
            console.log("Adding new block from peer");
            blockchain.chain.push(newBlock);
            console.log(
              "Block added. New chain length:",
              blockchain.chain.length
            );

            // إزالة المعاملات التي تم تضمينها في الكتلة الجديدة
            blockchain.pendingTransactions =
              blockchain.pendingTransactions.filter((tx) => {
                return !newBlock.transactions.some(
                  (blockTx) => blockTx.signature === tx.signature
                );
              });
          }
        } catch (error) {
          console.error("Error processing block:", error.message);
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
