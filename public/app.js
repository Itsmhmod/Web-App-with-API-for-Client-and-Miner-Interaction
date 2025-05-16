// Initialize elliptic curve
const ec = new elliptic.ec("secp256k1");

// Global variables
let config = null;
let pendingTransactions = [];

// Utility functions
function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  toastMessage.textContent = message;
  toast.classList.remove("translate-y-full", "opacity-0");
  setTimeout(() => {
    toast.classList.add("translate-y-full", "opacity-0");
  }, duration);
}

function updateUI() {
  // Update balance
  getBalance();

  // Update network status
  fetch("/status")
    .then((response) => response.json())
    .then((data) => {
      document.getElementById("peerCount").textContent = data.peers;
      document.getElementById("blockchainHeight").textContent = data.height;
      document.getElementById("pendingTxCount").textContent =
        data.pendingTransactions;
    })
    .catch((error) => console.error("Error fetching status:", error));

  // Update pending transactions
  fetch("/pending")
    .then((response) => response.json())
    .then((transactions) => {
      const container = document.getElementById("pendingTransactions");
      container.innerHTML = "";

      transactions.forEach((tx) => {
        const txElement = document.createElement("div");
        txElement.className = "bg-gray-50 p-4 rounded-lg";
        txElement.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="text-sm text-gray-600">From: ${tx.from.substring(
                              0,
                              10
                            )}...</p>
                            <p class="text-sm text-gray-600">To: ${tx.to.substring(
                              0,
                              10
                            )}...</p>
                        </div>
                        <p class="font-semibold text-green-600">${tx.amount}</p>
                    </div>
                `;
        container.appendChild(txElement);
      });
    })
    .catch((error) =>
      console.error("Error fetching pending transactions:", error)
    );
}

// Configuration functions
function createSampleConfig() {
  const keyPair = ec.genKeyPair();
  const config = {
    publicKey: keyPair.getPublic("hex"),
    privateKey: keyPair.getPrivate("hex"),
    port: 3000
  };

  const blob = new Blob([JSON.stringify(config, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "config.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("Sample configuration file generated!");
}

function uploadConfig() {
  const fileInput = document.getElementById("configFile");
  const file = fileInput.files[0];

  if (!file) {
    showToast("Please select a configuration file first!");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const config = JSON.parse(e.target.result);

      // Validate config
      if (!config.publicKey || !config.privateKey || !config.port) {
        throw new Error("Invalid configuration format");
      }

      // Upload to server
      fetch("/uploadConfig", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(config)
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showToast("Configuration uploaded successfully!");
            document.getElementById("configStatus").textContent =
              "Configuration loaded";
            updateUI();
          } else {
            throw new Error(data.message || "Failed to upload configuration");
          }
        })
        .catch((error) => {
          showToast(error.message);
          console.error("Error uploading config:", error);
        });
    } catch (error) {
      showToast("Invalid configuration file format");
      console.error("Error parsing config:", error);
    }
  };
  reader.readAsText(file);
}

// Transaction functions
function sendTransaction() {
  const toAddress = document.getElementById("toAddress").value;
  const amount = parseFloat(document.getElementById("amount").value);

  if (!toAddress || !amount || amount <= 0) {
    showToast("Please enter a valid recipient address and amount");
    return;
  }

  fetch("/transaction", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: toAddress,
      amount: amount
    })
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        showToast("Transaction sent successfully!");
        document.getElementById("toAddress").value = "";
        document.getElementById("amount").value = "";
        updateUI();
      } else {
        throw new Error(data.message || "Failed to send transaction");
      }
    })
    .catch((error) => {
      showToast(error.message);
      console.error("Error sending transaction:", error);
    });
}

// Mining functions
function mineBlock() {
  const miningStatus = document.getElementById("miningStatus");
  miningStatus.textContent = "Mining in progress...";

  fetch("/mine", {
    method: "POST"
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        showToast("Block mined successfully!");
        miningStatus.textContent = `Block ${data.block.index} mined`;
        updateUI();
      } else {
        throw new Error(data.message || "Failed to mine block");
      }
    })
    .catch((error) => {
      showToast(error.message);
      miningStatus.textContent = "Mining failed";
      console.error("Error mining block:", error);
    });
}

// Balance functions
function getBalance() {
  fetch("/balance")
    .then((response) => response.json())
    .then((data) => {
      document.getElementById("balance").textContent = data.balance;
    })
    .catch((error) => {
      console.error("Error fetching balance:", error);
      showToast("Failed to fetch balance");
    });
}

async function connectToPeer() {
  const host = document.getElementById("peerHost").value;
  const port = document.getElementById("peerPort").value;

  if (!host || !port) {
    showToast("Please enter both host and port");
    return;
  }

  try {
    const response = await fetch("/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ host, port })
    });

    const data = await response.json();
    if (data.success) {
      showToast("Successfully connected to peer");
      updateStatus();
    } else {
      showToast("Failed to connect to peer: " + data.message);
    }
  } catch (error) {
    showToast("Error connecting to peer: " + error.message);
  }
}

async function updateStatus() {
  try {
    const response = await fetch("/status");
    const data = await response.json();

    document.getElementById("peerCount").textContent = data.peers;
    document.getElementById("blockchainHeight").textContent = data.height;
    document.getElementById("pendingTxCount").textContent =
      data.pendingTransactions;
  } catch (error) {
    console.error("Error updating status:", error);
  }
}

// Update status every 5 seconds
setInterval(updateStatus, 5000);

// Initialize UI
document.addEventListener("DOMContentLoaded", () => {
  // Set up periodic UI updates
  setInterval(updateUI, 5000);

  // Initial UI update
  updateUI();
});

async function syncBlockchain() {
  try {
    const response = await fetch("/sync");
    const data = await response.json();

    if (data.success) {
      showToast("Blockchain synchronized successfully");
      updateUI();
    } else {
      showToast("Failed to sync blockchain: " + data.message);
    }
  } catch (error) {
    showToast("Error syncing blockchain: " + error.message);
  }
}
