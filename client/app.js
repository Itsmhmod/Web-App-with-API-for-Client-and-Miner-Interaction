// Initialize EC for key generation and signing
const ec = new elliptic.ec("secp256k1");

// Global variables
let userConfig = null;
const API_URL = "http://localhost:3000"; // Default client node URL
let pendingTransactions = [];
let transactionHistory = [];
let peerCount = 0;
let blockchainHeight = 0;

// Validate public key format
function isValidPublicKey(publicKey) {
  try {
    if (!publicKey || typeof publicKey !== "string") {
      return false;
    }
    // Check if it's a valid secp256k1 public key
    return ec.keyFromPublic(publicKey, "hex").getPublic().isValid();
  } catch (error) {
    return false;
  }
}

// Show toast notification
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  toastMessage.textContent = message;
  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transform translate-y-0 opacity-100 transition-all duration-300 ${
    type === "error"
      ? "bg-red-600"
      : type === "success"
      ? "bg-green-600"
      : "bg-gray-800"
  } text-white`;
  setTimeout(() => {
    toast.className =
      "fixed bottom-4 right-4 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg transform translate-y-full opacity-0 transition-all duration-300";
  }, 3000);
}

// Update UI elements
function updateUI() {
  // Update balance
  getBalance();

  // Update network status
  document.getElementById("peerCount").textContent = peerCount;
  document.getElementById("blockchainHeight").textContent = blockchainHeight;
  document.getElementById("pendingTxCount").textContent =
    pendingTransactions.length;

  // Update pending transactions
  const pendingContainer = document.getElementById("pendingTransactions");
  pendingContainer.innerHTML = pendingTransactions.length
    ? pendingTransactions
        .map(
          (tx) =>
            `<div class="bg-gray-50 p-4 rounded-lg">
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-600">From: ${
          tx.fromAddress ? tx.fromAddress.slice(0, 10) + "..." : "Mining Reward"
        }</span>
        <span class="text-sm text-gray-600">To: ${tx.toAddress.slice(
          0,
          10
        )}...</span>
      </div>
      <div class="mt-2">
        <span class="text-lg font-semibold text-gray-800">${tx.amount}</span>
      </div>
    </div>`
        )
        .join("")
    : '<p class="text-gray-500 text-center">No pending transactions</p>';

  // Update transaction history
  const historyContainer = document.getElementById("transactionHistory");
  historyContainer.innerHTML = transactionHistory.length
    ? transactionHistory
        .map(
          (tx) =>
            `<div class="bg-gray-50 p-4 rounded-lg">
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-600">From: ${
          tx.fromAddress ? tx.fromAddress.slice(0, 10) + "..." : "Mining Reward"
        }</span>
        <span class="text-sm text-gray-600">To: ${tx.toAddress.slice(
          0,
          10
        )}...</span>
      </div>
      <div class="mt-2">
        <span class="text-lg font-semibold text-gray-800">${tx.amount}</span>
        <span class="text-xs text-gray-500 ml-2">${new Date(
          tx.timestamp
        ).toLocaleString()}</span>
      </div>
    </div>`
        )
        .join("")
    : '<p class="text-gray-500 text-center">No transaction history</p>';
}

// File upload handler
async function uploadConfig() {
  const fileInput = document.getElementById("configFile");
  const file = fileInput.files[0];

  if (!file) {
    showToast("Please select a config file", "error");
    return;
  }

  try {
    const config = JSON.parse(await file.text());

    // Validate config structure
    if (!config.publicKey || !config.privateKey || !config.port) {
      throw new Error("Invalid config file format");
    }

    // Validate public key
    if (!isValidPublicKey(config.publicKey)) {
      throw new Error("Invalid public key format");
    }

    userConfig = config;

    const response = await fetch(`${API_URL}/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    showToast(data.message, "success");
    document.getElementById("configStatus").textContent =
      "Config loaded successfully";
    updateUI();
  } catch (error) {
    showToast("Error uploading config: " + error.message, "error");
    document.getElementById("configStatus").textContent =
      "Error: " + error.message;
  }
}

// Transaction handler
async function sendTransaction() {
  if (!userConfig) {
    showToast("Please upload your config file first", "error");
    return;
  }

  const toAddress = document.getElementById("toAddress").value;
  const amount = document.getElementById("amount").value;

  if (!toAddress || !amount) {
    showToast("Please fill in all fields", "error");
    return;
  }

  // Validate recipient's public key
  if (!isValidPublicKey(toAddress)) {
    showToast("Invalid recipient public key format", "error");
    return;
  }

  // Validate amount
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    showToast("Please enter a valid amount", "error");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/transaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        toAddress,
        amount: amountNum
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    showToast(data.message, "success");
    updateUI();
  } catch (error) {
    showToast("Error sending transaction: " + error.message, "error");
  }
}

// Mining handler
async function mineBlock() {
  if (!userConfig) {
    showToast("Please upload your config file first", "error");
    return;
  }

  try {
    document.getElementById("miningStatus").textContent =
      "Mining in progress...";
    const response = await fetch(`${API_URL}/mine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    showToast(data.message, "success");
    document.getElementById("miningStatus").textContent = "Mining complete";
    updateUI();
  } catch (error) {
    showToast("Error mining block: " + error.message, "error");
    document.getElementById("miningStatus").textContent = "Mining failed";
  }
}

// Balance handler
async function getBalance() {
  if (!userConfig) {
    document.getElementById("balance").textContent = "0";
    return;
  }

  try {
    const response = await fetch(`${API_URL}/balances`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    document.getElementById("balance").textContent = data.balance;
  } catch (error) {
    showToast("Error getting balance: " + error.message, "error");
  }
}

// Blockchain sync handler
async function syncBlockchain() {
  if (!userConfig) {
    showToast("Please upload your config file first", "error");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/sync`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    showToast(data.message, "success");
    updateUI();
  } catch (error) {
    showToast("Error syncing blockchain: " + error.message, "error");
  }
}

// Generate new key pair
function generateKeyPair() {
  const keyPair = ec.genKeyPair();
  return {
    privateKey: keyPair.getPrivate("hex"),
    publicKey: keyPair.getPublic("hex")
  };
}

// Create a sample config file
function createSampleConfig() {
  const keyPair = generateKeyPair();
  const config = {
    name: "Sample User",
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    port: 3000
  };

  const blob = new Blob([JSON.stringify(config, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "config.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Sample config file generated", "success");
}

// Initialize WebSocket connection for real-time updates
function initWebSocket() {
  if (!userConfig) return;

  const ws = new WebSocket(`ws://localhost:${userConfig.port + 1}`);
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000; // 1 second

  ws.onopen = () => {
    console.log("WebSocket connected");
    reconnectAttempts = 0;
    showToast("Connected to node", "success");
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "TRANSACTION":
          pendingTransactions.push(data.data);
          updateUI();
          break;
        case "BLOCK":
          blockchainHeight++;
          updateUI();
          break;
        case "PEER_COUNT":
          peerCount = data.count;
          updateUI();
          break;
        case "SYNC_START":
          showToast("Syncing blockchain...", "info");
          break;
        case "SYNC_COMPLETE":
          showToast("Blockchain sync complete", "success");
          updateUI();
          break;
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected");
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      setTimeout(initWebSocket, reconnectDelay * reconnectAttempts);
    } else {
      showToast("Lost connection to node. Please refresh the page.", "error");
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    showToast("Connection error. Retrying...", "error");
  };
}

// Add periodic status check
function startStatusCheck() {
  setInterval(async () => {
    if (!userConfig) return;

    try {
      const response = await fetch(`${API_URL}/status`);
      if (response.ok) {
        const data = await response.json();
        peerCount = data.peerCount;
        blockchainHeight = data.blockchainHeight;
        pendingTransactions = data.pendingTransactions;
        updateUI();
      }
    } catch (error) {
      console.error("Error checking status:", error);
    }
  }, 5000); // Check every 5 seconds
}

// Add event listeners when the page loads
document.addEventListener("DOMContentLoaded", () => {
  // Add a button to generate sample config
  const configSection = document.querySelector(
    ".bg-white.rounded-lg.shadow-md.p-6.mb-8"
  );
  const generateButton = document.createElement("button");
  generateButton.textContent = "Generate Sample Config";
  generateButton.className =
    "ml-4 bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600";
  generateButton.onclick = createSampleConfig;
  configSection.appendChild(generateButton);

  // Initialize UI
  updateUI();

  // Start status check
  startStatusCheck();
});
