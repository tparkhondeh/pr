module.exports = {
  apps: [
    {
      name: 'wealthos-pr',
      script: '/home/wealthos/apps/pr/runtime/main.mjs',
      cwd: '/home/wealthos/apps/pr',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '256M',
      time: true,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PORT: 31056,
      },
    },
  ],
};
