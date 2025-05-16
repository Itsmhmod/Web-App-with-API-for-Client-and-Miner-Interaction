const Block = require("./Block");
const Transaction = require("./Transaction");

class Blockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
    this.difficulty = 4;
    this.pendingTransactions = [];
    this.miningReward = 100;
  }

  createGenesisBlock() {
    return new Block(Date.now(), [], "0");
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  minePendingTransactions(miningRewardAddress) {
    console.log("Starting to mine pending transactions...");
    console.log(
      "Number of pending transactions:",
      this.pendingTransactions.length
    );

    // Validate all pending transactions before mining
    const validTransactions = this.pendingTransactions.filter((tx) => {
      if (!tx.isValid()) {
        console.log("Invalid transaction found, removing from pending");
        return false;
      }
      return true;
    });

    // Create a copy of valid transactions
    const transactionsToProcess = [...validTransactions];

    // Add mining reward transaction
    const rewardTx = new Transaction(
      null,
      miningRewardAddress,
      this.miningReward
    );
    transactionsToProcess.push(rewardTx);

    console.log(
      "Creating new block with transactions:",
      transactionsToProcess.length
    );

    const block = new Block(
      Date.now(),
      transactionsToProcess,
      this.getLatestBlock().hash
    );

    console.log("Mining block...");
    block.mineBlock(this.difficulty);
    console.log("Block successfully mined!");

    // Add the block to the chain
    this.chain.push(block);

    // Clear pending transactions
    this.pendingTransactions = [];

    // Log the new block
    console.log("New block added to chain:", {
      index: block.index,
      transactions: block.transactions.length,
      hash: block.hash
    });

    return block;
  }

  addTransaction(transaction) {
    if (!transaction.fromAddress || !transaction.toAddress) {
      throw new Error("Transaction must include from and to address");
    }

    if (!transaction.isValid()) {
      throw new Error("Cannot add invalid transaction to chain");
    }

    // Check if sender has enough balance
    if (transaction.fromAddress !== null) {
      // Skip balance check for mining rewards
      const balance = this.getBalanceOfAddress(transaction.fromAddress);
      if (balance < transaction.amount) {
        throw new Error("Insufficient balance");
      }
    }

    console.log("Adding new transaction:", {
      from: transaction.fromAddress
        ? transaction.fromAddress.substring(0, 10) + "..."
        : "MINING_REWARD",
      to: transaction.toAddress.substring(0, 10) + "...",
      amount: transaction.amount
    });

    this.pendingTransactions.push(transaction);
  }

  getBalanceOfAddress(address) {
    let balance = 0;

    console.log(
      "Calculating balance for address:",
      address.substring(0, 10) + "..."
    );

    // Calculate balance from confirmed transactions
    for (const block of this.chain) {
      for (const trans of block.transactions) {
        if (trans.fromAddress === address) {
          balance -= trans.amount;
          console.log("Subtracting", trans.amount, "from balance (from)");
        }

        if (trans.toAddress === address) {
          balance += trans.amount;
          console.log("Adding", trans.amount, "to balance (to)");
        }
      }
    }

    // Add pending transactions to the balance
    for (const trans of this.pendingTransactions) {
      if (trans.fromAddress === address) {
        balance -= trans.amount;
        console.log("Subtracting", trans.amount, "from balance (pending from)");
      }

      if (trans.toAddress === address) {
        balance += trans.amount;
        console.log("Adding", trans.amount, "to balance (pending to)");
      }
    }

    console.log("Final balance:", balance);
    return balance;
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (!currentBlock.hasValidTransactions()) {
        return false;
      }

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }
    return true;
  }

  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      console.log("Received chain is not longer than the current chain");
      return false;
    }

    if (!this.isChainValid()) {
      console.log("The received chain is not valid");
      return false;
    }

    console.log("Replacing blockchain with the new chain");
    this.chain = newChain;
    return true;
  }
}

module.exports = Blockchain;
