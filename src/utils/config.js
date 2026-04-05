const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT || '8081'),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://sulla:sulla@localhost:5432/sulla_video',
  jwtSecret: process.env.JWT_SECRET || 'sulla-local-dev-secret',
  apiKey: process.env.SULLA_API_KEY || null,
  jwtExpirySeconds: 60 * 60 * 24 * 30, // 30 days (local app, not SaaS)
  storageRoot: path.join(__dirname, '..', '..', 'storage', 'projects'),
  whisperCli: process.env.WHISPER_CLI || 'whisper-cli',
  whisperModel: process.env.WHISPER_MODEL_PATH || '/opt/whisper-models/ggml-base.en.bin',
  sullaChatUrl: process.env.SULLA_CHAT_URL || 'http://localhost:3000/v1/chat/completions',
  sullaBearerToken: process.env.SULLA_BEARER_TOKEN || null,
  fillerWords: new Set([
    'um', 'uh', 'like', 'basically', 'actually', 'literally',
    'right', 'okay', 'so', 'well', 'you know', 'i mean',
  ]),
  silenceThresholdMs: 1500,
};
