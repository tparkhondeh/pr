module.exports = {
  apps: [
    {
      name: 'wealthos-pr',
      script: '/home/wealthos/apps/pr/runtime/main.cjs',
      cwd: '/home/wealthos/apps/pr',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '256M',
      time: true,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PR_BIND_HOST: '127.0.0.1',
        PORT: 31056,
        PR_STATIC_ROOT: '/home/wealthos/apps/pr/apps/web/dist',
        // Private owner preview only. Remove this override when PostgreSQL is provisioned.
        PR_ALLOW_EPHEMERAL_PRODUCTION: 'true',
      },
    },
  ],
};
