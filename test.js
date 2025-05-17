const axios = require("axios");

// Node configurations
const NODE1_CONFIG = {
  publicKey:
    "048eea142258fdafd549fdfd4ea942ba356ad9bf8312455e5e359b6c6f637246154a455d0baf19461185652e7c305b9ee65a5b0ee80e72b44d27f3e299f5a49098",
  privateKey:
    "d2d30356e55330f95471b7b700c034a1c5c71ddfbf317529928cd4d1e6575ce0",
  port: 3000
};

const NODE2_CONFIG = {
  publicKey:
    "048eea142258fdafd549fdfd4ea942ba356ad9bf8312455e5e359b6c6f637246154a455d0baf19461185652e7c305b9ee65a5b0ee80e72b44d27f3e299f5a49098",
  privateKey:
    "d2d30356e55330f95471b7b700c034a1c5c71ddfbf317529928cd4d1e6575ce0",
  port: 5000
};

// Test functions
async function testNode1() {
  console.log("\n=== Testing Node 1 ===");

  try {
    // 1. Upload configuration
    console.log("\n1. Uploading configuration for Node 1...");
    const configResponse = await axios.post(
      "http://localhost:3000/uploadConfig",
      NODE1_CONFIG
    );
    console.log("✅ Configuration uploaded successfully:", configResponse.data);

    // 2. Mine first block
    console.log("\n2. Mining first block...");
    const mineResponse = await axios.post("http://localhost:3000/mine");
    console.log("✅ Block mined successfully:", mineResponse.data);

    // 3. Check balance
    console.log("\n3. Checking balance...");
    const balanceResponse = await axios.get("http://localhost:3000/balance");
    console.log("✅ Current balance:", balanceResponse.data);

    // 4. Check pending transactions
    console.log("\n4. Checking pending transactions...");
    const pendingResponse = await axios.get("http://localhost:3000/pending");
    console.log("✅ Pending transactions:", pendingResponse.data);

    // 5. Test invalid transaction
    console.log("\n5. Testing invalid transaction...");
    try {
      await axios.post("http://localhost:3000/transaction", {
        to: "invalid_address",
        amount: 50
      });
      console.log("❌ Should have failed with invalid address");
      return false;
    } catch (error) {
      console.log("✅ Invalid transaction rejected as expected");
    }

    return true;
  } catch (error) {
    console.error("❌ Error in Node 1 test:", error.message);
    return false;
  }
}

async function testNode2() {
  console.log("\n=== Testing Node 2 ===");

  // 1. Test mining without config
  console.log("\n1. Testing mining without config...");
  try {
    await axios.post("http://localhost:5000/mine");
    console.log("❌ Should have failed without config");
    return false;
  } catch (error) {
    console.log("✅ Mining rejected as expected without config");
  }

  try {
    // 2. Upload configuration
    console.log("\n2. Uploading configuration for Node 2...");
    const configResponse = await axios.post(
      "http://localhost:5000/uploadConfig",
      NODE2_CONFIG
    );
    console.log("✅ Configuration uploaded successfully:", configResponse.data);

    // 3. Check initial balance
    console.log("\n3. Checking initial balance...");
    const balanceResponse = await axios.get("http://localhost:5000/balance");
    console.log("✅ Initial balance:", balanceResponse.data);

    // 4. Check pending transactions
    console.log("\n4. Checking pending transactions...");
    const pendingResponse = await axios.get("http://localhost:5000/pending");
    console.log("✅ Pending transactions:", pendingResponse.data);

    return true;
  } catch (error) {
    console.error("❌ Error in Node 2 test:", error.message);
    return false;
  }
}

async function testConnection() {
  console.log("\n=== Testing Node Connection ===");

  try {
    // 1. Connect nodes
    console.log("\n1. Connecting nodes...");
    const connectResponse = await axios.post("http://localhost:3000/connect", {
      host: "localhost",
      port: 5001
    });
    console.log("✅ Connection successful:", connectResponse.data);

    // 2. Check peer count
    console.log("\n2. Checking peer count...");
    const peersResponse = await axios.get("http://localhost:3000/peers");
    console.log("✅ Peer count:", peersResponse.data);

    // 3. Test invalid connection
    console.log("\n3. Testing invalid connection...");
    try {
      await axios.post("http://localhost:3000/connect", {
        host: "invalid_host",
        port: 1234
      });
      console.log("❌ Should have failed with invalid host");
      return false;
    } catch (error) {
      console.log("✅ Invalid connection rejected as expected");
    }

    return true;
  } catch (error) {
    console.error("❌ Error in connection test:", error.message);
    return false;
  }
}

async function testTransactions() {
  console.log("\n=== Testing Transactions ===");

  try {
    // 1. Send transaction
    console.log("\n1. Sending transaction...");
    const transactionResponse = await axios.post(
      "http://localhost:3000/transaction",
      {
        to: NODE2_CONFIG.publicKey,
        amount: 50
      }
    );
    console.log("✅ Transaction sent successfully:", transactionResponse.data);

    // 2. Check pending transactions after sending
    console.log("\n2. Checking pending transactions after sending...");
    const pendingResponse = await axios.get("http://localhost:3000/pending");
    console.log("✅ Pending transactions:", pendingResponse.data);

    // 3. Mine new block
    console.log("\n3. Mining new block...");
    const mineResponse = await axios.post("http://localhost:3000/mine");
    console.log("✅ Block mined successfully:", mineResponse.data);

    // 4. Check balance after mining
    console.log("\n4. Checking balance after mining...");
    const balanceResponse = await axios.get("http://localhost:3000/balance");
    console.log("✅ Balance after mining:", balanceResponse.data);

    // 5. Sync Node 2
    console.log("\n5. Syncing Node 2...");
    const syncResponse = await axios.get("http://localhost:5000/sync");
    console.log("✅ Sync successful:", syncResponse.data);

    // 6. Check balance in Node 2
    console.log("\n6. Checking balance in Node 2...");
    const node2BalanceResponse = await axios.get(
      "http://localhost:5000/balance"
    );
    console.log("✅ Balance in Node 2:", node2BalanceResponse.data);

    // 7. Test transaction with insufficient balance
    console.log("\n7. Testing transaction with insufficient balance...");
    try {
      await axios.post("http://localhost:3000/transaction", {
        to: NODE2_CONFIG.publicKey,
        amount: 1000
      });
      console.log("❌ Should have failed with insufficient balance");
      return false;
    } catch (error) {
      console.log(
        "✅ Transaction rejected as expected with insufficient balance"
      );
    }

    return true;
  } catch (error) {
    console.error("❌ Error in transaction test:", error.message);
    return false;
  }
}

async function testBlockchain() {
  console.log("\n=== Testing Blockchain ===");

  try {
    // 1. Check blockchain length
    console.log("\n1. Checking blockchain length...");
    const pendingResponse = await axios.get("http://localhost:3000/pending");
    console.log("✅ Blockchain state:", pendingResponse.data);

    // 2. Test multiple transactions
    console.log("\n2. Testing multiple transactions...");
    for (let i = 0; i < 3; i++) {
      await axios.post("http://localhost:3000/transaction", {
        to: NODE2_CONFIG.publicKey,
        amount: 10
      });
    }
    console.log("✅ Multiple transactions sent successfully");

    // 3. Mine block with multiple transactions
    console.log("\n3. Mining block with multiple transactions...");
    const mineResponse = await axios.post("http://localhost:3000/mine");
    console.log("✅ Block mined successfully:", mineResponse.data);

    // 4. Check final balances
    console.log("\n4. Checking final balances...");
    const node1Balance = await axios.get("http://localhost:3000/balance");
    const node2Balance = await axios.get("http://localhost:5000/balance");
    console.log("✅ Node 1 final balance:", node1Balance.data);
    console.log("✅ Node 2 final balance:", node2Balance.data);

    return true;
  } catch (error) {
    console.error("❌ Error in blockchain test:", error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log("=== Starting Tests ===");

  // 1. Test Node 1
  const node1Result = await testNode1();
  if (!node1Result) {
    console.error("❌ Node 1 test failed");
    return;
  }

  // 2. Test Node 2
  const node2Result = await testNode2();
  if (!node2Result) {
    console.error("❌ Node 2 test failed");
    return;
  }

  // 3. Test Connection
  const connectionResult = await testConnection();
  if (!connectionResult) {
    console.error("❌ Connection test failed");
    return;
  }

  // 4. Test Transactions
  const transactionResult = await testTransactions();
  if (!transactionResult) {
    console.error("❌ Transaction test failed");
    return;
  }

  // 5. Test Blockchain
  const blockchainResult = await testBlockchain();
  if (!blockchainResult) {
    console.error("❌ Blockchain test failed");
    return;
  }

  console.log("\n=== All tests completed successfully! ===");
}

// Run the tests
runTests().catch(console.error);
