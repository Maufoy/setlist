module.exports = {
  apps: [{
    name: 'set-list',
    script: 'server.js',
    cwd: '/root/set-list',
    env: {
      PORT: 3001
    },
    restart_delay: 3000,
    max_restarts: 10
  }]
};
