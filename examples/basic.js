import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Client } from '../src/index.js';
import pino from 'pino';

const logger = pino({ level: 'info' });

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const wa = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: true,
  });

  const meow = new Client(wa, { logger });
  meow.Connect();

  // Register incoming call handler
  meow.OnIncomingCall((call) => {
    logger.info({ callID: call.ID(), peer: call.Peer() }, 'Incoming call');

    call.Answer();
    call.OnEnd((reason) => logger.info({ callID: call.ID(), reason }, 'Call ended'));
  });

  wa.ev.on('creds.update', saveCreds);
  wa.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        logger.info('reconnecting...');
        main();
      }
    }
  });

  // Example: place an outbound call
  // const call = await meow.Call({}, '+15551234567');
  // call.OnReady(() => logger.info('call connected!'));
  // call.OnEnd((reason) => logger.info('call ended:', reason));
}

main().catch(console.error);
