const crypto = require("crypto");
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");

class Transaction {
  constructor(fromAddress, toAddress, amount) {
    // Validate inputs
    if (amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    if (fromAddress && !this.isValidAddress(fromAddress)) {
      throw new Error("Invalid sender address");
    }

    if (toAddress && !this.isValidAddress(toAddress)) {
      throw new Error("Invalid recipient address");
    }

    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.timestamp = Date.now();
    this.signature = null;
    this.id = this.generateId();
  }

  generateId() {
    return crypto
      .createHash("sha256")
      .update(this.fromAddress + this.toAddress + this.amount + this.timestamp)
      .digest("hex");
  }

  calculateHash() {
    return crypto
      .createHash("sha256")
      .update(
        this.fromAddress +
          this.toAddress +
          this.amount +
          this.timestamp +
          (this.signature || "")
      )
      .digest("hex");
  }

  signTransaction(signingKey) {
    if (!signingKey) {
      throw new Error("Signing key is required");
    }

    if (this.fromAddress === null) {
      throw new Error("Cannot sign mining reward transaction");
    }

    if (signingKey.getPublic("hex") !== this.fromAddress) {
      throw new Error("You cannot sign transactions for other wallets!");
    }

    const hashTx = this.calculateHash();
    const sig = signingKey.sign(hashTx, "base64");
    this.signature = sig.toDER("hex");
  }

  isValid() {
    // Mining reward transaction
    if (this.fromAddress === null) {
      return true;
    }

    // Regular transaction validation
    if (!this.signature || this.signature.length === 0) {
      throw new Error("No signature in this transaction");
    }

    if (
      !this.isValidAddress(this.fromAddress) ||
      !this.isValidAddress(this.toAddress)
    ) {
      throw new Error("Invalid address format");
    }

    try {
      const publicKey = ec.keyFromPublic(this.fromAddress, "hex");
      return publicKey.verify(this.calculateHash(), this.signature);
    } catch (error) {
      throw new Error("Invalid transaction signature");
    }
  }

  isValidAddress(address) {
    try {
      if (!address || typeof address !== "string") {
        return false;
      }
      // Check if it's a valid secp256k1 public key
      return ec.keyFromPublic(address, "hex").getPublic().isValid();
    } catch (error) {
      return false;
    }
  }

  toJSON() {
    return {
      id: this.id,
      fromAddress: this.fromAddress,
      toAddress: this.toAddress,
      amount: this.amount,
      timestamp: this.timestamp,
      signature: this.signature
    };
  }

  static fromJSON(json) {
    const tx = new Transaction(json.fromAddress, json.toAddress, json.amount);
    tx.timestamp = json.timestamp;
    tx.signature = json.signature;
    tx.id = json.id;
    return tx;
  }
}

module.exports = Transaction;
