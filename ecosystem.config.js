module.exports = {
  apps: [{
    name: 'ccnotify-server',
    script: './dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      SLACK_PORT: 3001
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000,
      SLACK_PORT: 3001
    }
  }]
};