import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Client } from './src/index.js';

const logger = pino({ level: 'info', name: 'meowcaller' });

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const wa = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: true,
    syncFullHistory: false,
  });

  const client = new Client(wa, { logger });

  client.onIncomingCall((call) => {
    logger.info({ id: call.id(), peer: call.peer(), video: call.isVideo() }, 'incoming call');

    call.onStateChange((phase) => logger.info({ phase: phase.description }, 'call state'));
    call.onReady(() => logger.info('call active — media flowing'));
    call.onEnd((reason) => logger.info({ reason }, 'call ended'));
    call.onVideoState((vs) => logger.info({ active: vs.Active, upgrade: vs.Upgrade }, 'video state'));

    call.answer();
  });

  wa.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    logger.info({ connection }, 'wa connection');

    if (connection === 'open') {
      client.connect();
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        logger.info('reconnecting...');
        main();
      } else {
        logger.info('logged out — QR scan needed');
      }
    }
  });

  wa.ev.on('creds.update', saveCreds);

  logger.info('waiting for QR scan...');
}

main().catch((err) => {
  logger.error(err, 'fatal');
  process.exit(1);
});
