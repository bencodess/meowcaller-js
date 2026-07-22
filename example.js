import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Client, WithLogger, SinkFunc, SourceFunc } from './src/index.js';

const logger = pino({ level: 'info', name: 'meowcaller' });

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const wa = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: true,
    syncFullHistory: false,
  });

  const client = new Client(wa, WithLogger(logger));

  client.onIncomingCall((call) => {
    logger.info({ id: call.id(), peer: call.peer(), video: call.isVideo() }, 'incoming call');

    call.onStateChange((phase) => logger.info({ phase: phase.description }, 'call state'));
    call.onReady(() => logger.info('call active — media flowing'));
    call.onEnd((reason) => logger.info({ reason }, 'call ended'));
    call.onVideoState((vs) => logger.info({ active: vs.Active, upgrade: vs.Upgrade }, 'video state'));

    // receive audio frames (Float32Array — 960 samples at 16 kHz)
    call.receive(SinkFunc((frame) => {
      // process incoming audio
    }));

    // play silence (replace with a real audio source)
    call.play(SourceFunc(async () => null));

    call.answer();
  });

  // place an outbound call
  // const call = await client.call({}, '+15551234567');
  //
  // call.onReady(() => {
  //   logger.info('outbound call connected');
  //   call.play(SourceFunc(async () => new Float32Array(960)));
  // });
  //
  // call.receive(SinkFunc((frame) => {
  //   // process incoming audio from the remote peer
  // }));
  //
  // call.onEnd((reason) => logger.info({ reason }, 'call ended'));

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
