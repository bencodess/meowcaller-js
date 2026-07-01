import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Client, CallPhase } from './src/index.js';

const logger = pino({ level: 'info', name: 'voiced' });

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const wa = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: true,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  const client = new Client(wa, { logger });

  client.OnIncomingCall((call) => {
    logger.info({ id: call.ID(), peer: call.Peer(), video: call.IsVideo() }, 'incoming call');

    call.OnStateChange((phase) => logger.info({ phase: phase.description }, 'call state'));
    call.OnReady(() => logger.info('call active — media flowing'));
    call.OnEnd((reason) => logger.info({ reason }, 'call ended'));
    call.OnVideoState((vs) => logger.info({ active: vs.Active, upgrade: vs.Upgrade }, 'video state'));

    call.Answer();
  });

  wa.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    logger.info({ connection }, 'wa connection');

    if (connection === 'open') {
      client.Connect();
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
