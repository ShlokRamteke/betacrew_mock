const net = require("net");
const fs = require("fs").promises;
const winston = require("winston");

// Setup logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "betacrew-client.log" }),
  ],
});

const createSocket = (host, port) =>
  new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.connect(port, host, () => {
      logger.info(`Connected to BetaCrew server at ${host}:${port}`);
      resolve(socket);
    });
    socket.on("error", (error) => {
      logger.error(`Socket error: ${error.message}`);
      reject(error);
    });
  });

const validatePacket = (packet) => {
  if (packet.length !== 17) {
    throw new Error(`Invalid packet length: ${packet.length}`);
  }
  const symbol = packet.slice(0, 4).toString("ascii");
  const buysellindicator = packet.slice(4, 5).toString("ascii");
  const quantity = packet.readInt32BE(5);
  const price = packet.readInt32BE(9);
  const sequence = packet.readInt32BE(13);

  if (!/^[A-Z]{1,4}$/.test(symbol)) {
    throw new Error(`Invalid symbol: ${symbol}`);
  }
  if (buysellindicator !== "B" && buysellindicator !== "S") {
    throw new Error(`Invalid buy/sell indicator: ${buysellindicator}`);
  }
  if (quantity <= 0) {
    throw new Error(`Invalid quantity: ${quantity}`);
  }
  if (price <= 0) {
    throw new Error(`Invalid price: ${price}`);
  }
  if (sequence <= 0) {
    throw new Error(`Invalid sequence: ${sequence}`);
  }

  return { symbol, buysellindicator, quantity, price, sequence };
};

const streamAllPackets = (socket) =>
  new Promise((resolve, reject) => {
    const packets = [];
    let buffer = Buffer.alloc(0);
    const packetSize = 17; // 4 + 1 + 4 + 4 + 4 bytes

    const payload = Buffer.alloc(1);
    payload.writeUInt8(1, 0); // Call Type 1: Stream All Packets
    socket.write(payload);
    socket.write(payload);
    //console.log("payload", socket.write(payload));

    const processPacket = (packet) => {
      try {
        const validatedPacket = validatePacket(packet);
        packets.push(validatedPacket);
        logger.info(`Received packet: ${JSON.stringify(validatedPacket)}`);
      } catch (error) {
        logger.error(`Error processing packet: ${error.message}`);
      }
    };

    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= packetSize) {
        const packet = buffer.slice(0, packetSize);
        buffer = buffer.slice(packetSize);
        processPacket(packet);
      }
    });

    socket.on("end", () => {
      logger.info("Server closed the connection");
      resolve(packets);
    });

    socket.on("error", (error) => {
      logger.error(`Socket error during streaming: ${error.message}`);
      reject(error);
    });
  });

const findMissingSequences = (packets) => {
  const sequences = new Set(packets.map((p) => p.sequence));
  const maxSequence = Math.max(...sequences);
  const missing = [];
  for (let i = 1; i <= maxSequence; i++) {
    if (!sequences.has(i)) {
      missing.push(i);
    }
  }
  return missing;
};

const resendPacket = async (host, port, sequence) => {
  let socket;
  try {
    socket = await createSocket(host, port);

    const payload = Buffer.alloc(2);
    payload.writeUInt8(2, 0); // Call Type 2: Resend Packet
    payload.writeUInt8(sequence, 1);

    socket.write(payload);

    return new Promise((resolve, reject) => {
      socket.once("data", (data) => {
        try {
          const validatedPacket = validatePacket(data);
          logger.info(
            `Received resent packet: ${JSON.stringify(validatedPacket)}`
          );
          resolve(validatedPacket);
        } catch (error) {
          logger.error(`Error processing resent packet: ${error.message}`);
          reject(error);
        } finally {
          socket.end();
        }
      });

      socket.once("error", (error) => {
        logger.error(`Socket error during resend: ${error.message}`);
        reject(error);
      });
    });
  } catch (error) {
    logger.error(
      `Failed to establish connection for resending packet: ${error.message}`
    );
    throw error;
  }
};

const requestMissingPackets = async (host, port, packets) => {
  const missingSequences = findMissingSequences(packets);
  logger.info(`Requesting ${missingSequences.length} missing packets`);
  for (const seq of missingSequences) {
    try {
      const packet = await resendPacket(host, port, seq);
      packets.push(packet);
    } catch (error) {
      logger.error(`Failed to resend packet ${seq}: ${error.message}`);
    }
  }
  return packets;
};

const disconnect = (socket) =>
  new Promise((resolve) => {
    socket.end(() => {
      logger.info("Disconnected from BetaCrew server");
      resolve();
    });
  });

const sortPackets = (packets) => {
  return packets.sort((a, b) => a.sequence - b.sequence);
};

const writeJsonOutput = async (packets, filename) => {
  const sortedPackets = sortPackets(packets);
  const jsonContent = JSON.stringify(sortedPackets, null, 2);
  await fs.writeFile(filename, jsonContent);
  logger.info(`Output written to ${filename}`);
};

const main = async () => {
  const host = "localhost";
  const port = 3000;
  const outputFilename = "betacrew_output.json";
  let socket;

  try {
    socket = await createSocket(host, port);

    //console.log(socket);

    let packets = await streamAllPackets(socket);
    packets = await requestMissingPackets(host, port, packets);
    await writeJsonOutput(packets, outputFilename);
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
  }
};

main();
