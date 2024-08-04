# Betacrew Exchange Project

This project is composed of two main parts: the server and the client. Follow the steps below to set up and run both components.

## Prerequisites

Ensure you have the following installed on your system:

- Node.js (v14.x or later)
- npm (v6.x or later)

## Installation

1. **Clone the repository:**

```bash
   git clone https://github.com/yourusername/betacrew_exchange.git
   cd betacrew_exchange
```

2. **Install dependencies:**
   Run the following command in the root directory to install all dependencies, including Winston for logging:

```bash
   npm install
```

3. **Running the server and client**
   Navigate to the server and client directories
   Running the server and client

```bash
   # Run the server
    cd betacrew_exchange_server
    node main.js

    # Run the client
    cd betacrew_exchange_client
    node main.js
```

## Logs and Output

- Logs:

  - The logs for the client are located in the betacrew_exchange_client folder.
  - Log file: betacrew-client.log

- Output:
  - The output is generated in the betacrew_exchange_client folder.
  - Output file: betacrew_output.json
