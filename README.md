# Cryptocurrency Simulator

A minimal, functional peer-to-peer cryptocurrency simulator built with Node.js, Express, and TCP sockets. This project demonstrates the core concepts of blockchain technology, including transaction processing, mining, and peer-to-peer networking.

## Features

- **Blockchain Implementation**: Secure block creation and validation with proof-of-work mining
- **Transaction System**: Create and sign transactions using elliptic curve cryptography
- **Peer-to-Peer Network**: TCP-based communication between nodes
- **Web Interface**: Modern UI built with Tailwind CSS for easy interaction
- **Configuration Management**: JSON-based configuration for node identity

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd cryptocurrency-simulator
```

2. Install dependencies:

```bash
npm install
```

## Usage

1. Start the server:

```bash
npm start
```

2. Open your browser and navigate to:

```
http://localhost:3000
```

3. Generate a configuration file:

   - Click "Generate Sample Config" to create a new configuration file
   - The file will contain your public/private key pair and port number

4. Upload your configuration:

   - Click "Choose Config File" and select your configuration file
   - Click "Upload Config" to load your identity

5. Start using the application:
   - Send transactions to other nodes
   - Mine blocks to confirm transactions
   - View your balance and network status
   - Connect to other nodes in the network

## API Endpoints

### REST API

- `POST /uploadConfig`: Upload node configuration
- `POST /transaction`: Create and broadcast a new transaction
- `POST /mine`: Mine a new block
- `GET /balance`: Get current balance
- `GET /pending`: Get pending transactions
- `GET /status`: Get network status
- `POST /connect`: Connect to a peer node

### TCP Protocol

The application uses TCP sockets for peer-to-peer communication. Messages are JSON-encoded with the following format:

```json
{
  "type": "message_type",
  "data": {
    // Message-specific data
  }
}
```

Message types:

- `NEW_TRANSACTION`: Broadcast new transaction
- `NEW_BLOCK`: Broadcast newly mined block
- `REQUEST_CHAIN`: Request full blockchain
- `CHAIN_RESPONSE`: Send full blockchain
- `REQUEST_PENDING`: Request pending transactions
- `PENDING_RESPONSE`: Send pending transactions

## Project Structure

```
├── public/              # Frontend files
│   ├── index.html      # Main HTML file
│   └── app.js          # Frontend JavaScript
├── src/                # Backend source code
│   ├── Block.js        # Block class implementation
│   ├── Transaction.js  # Transaction class implementation
│   ├── Blockchain.js   # Blockchain class implementation
│   └── server.js       # Main server file
├── package.json        # Project dependencies
└── README.md          # Project documentation
```

## Security Considerations

- Private keys are stored locally in the configuration file
- All transactions are signed using elliptic curve cryptography
- Proof-of-work mining prevents spam and ensures network security
- TCP connections are established only with trusted peers

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Elliptic curve cryptography implementation using the `elliptic` library
- Frontend styling with Tailwind CSS
- Node.js and Express for the backend infrastructure
