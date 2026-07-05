module.exports = {
  apps: [
    {
      name: 'aero-planer-api',
      script: 'src/index.js',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
