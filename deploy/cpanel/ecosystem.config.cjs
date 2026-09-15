const { existsSync, readFileSync } = require('node:fs');
const runtimePath = '/home/wealthos/apps/pr/.private/runtime.json';
let persistent = {};
if (existsSync(runtimePath)) {
  const values = JSON.parse(readFileSync(runtimePath, 'utf8'));
  for (const key of ['DATABASE_URL', 'PR_TENANT_ID', 'PR_OWNER_USER_ID']) {
    if (typeof values[key] !== 'string' || !values[key]) throw new Error('Incomplete private runtime configuration.');
  }
  persistent = {
    DATABASE_URL: values.DATABASE_URL,
    PR_TENANT_ID: values.PR_TENANT_ID,
    PR_OWNER_USER_ID: values.PR_OWNER_USER_ID,
    PR_ALLOW_EPHEMERAL_PRODUCTION: 'false',
  };
}

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
        // Fail-closed application validation checks the private runtime role and schema.
        PR_ALLOW_EPHEMERAL_PRODUCTION: 'true',
        ...persistent,
      },
    },
  ],
};
