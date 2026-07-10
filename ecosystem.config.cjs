module.exports = {
  apps: [
    {
      name: 'dashboard-infra',
      script: 'npm',
      args: 'run start -- --hostname 127.0.0.1 --port 3000',
      cwd: '/var/www/dashboard-infra',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'dashboard-history-collector',
      script: 'node',
      args: 'scripts/history-collector.mjs',
      cwd: '/var/www/dashboard-infra',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      restart_delay: 5000,
    },
  ],
};
